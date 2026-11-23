/**
 * EdithLink — the bridge between two incompatible shapes.
 *
 * Lyzr calls Vision **synchronously**: one HTTP request, blocking, one answer.
 * EDITH answers **asynchronously**: a BAND message that arrives later, in a
 * different callback, with nothing tying it back to the request that caused it.
 *
 * Everything hard about Vision is that mismatch, and all of it is hidden here.
 * A caller writes `await link.send(message)` and gets EDITH's reply.
 *
 * What the interface promises, beyond the type signature:
 *
 *  - Replies are matched to sends by `session_id`. Sends with different
 *    session ids are safely concurrent.
 *  - `send` resolves within `timeoutMs` and, on timeout, resolves a *holding*
 *    result rather than rejecting. Callers never handle transport failure,
 *    because Lyzr always needs something sayable.
 *  - A reply arriving after its timeout is dropped silently, not an error.
 *  - `start()` must be awaited before `send()`.
 */
import { Agent, GenericAdapter, type AgentCredentials } from '@band-ai/sdk';
import {
  extractMessagePayload,
  isResultMessage,
  redactForLog,
  type ResultMessage,
  type VisionMessage,
} from '../../shared/contract.ts';

export interface EdithLink {
  /** Post a message to EDITH and resolve with EDITH's matching result. */
  send(message: VisionMessage): Promise<ResultMessage>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** One line in the page's BAND log (R4). Already redacted — safe to serve. */
export interface TrafficEntry {
  at: string;
  direction: 'out' | 'in';
  /** `redactForLog` has been applied: the phone is masked, the name removed. */
  payload: Record<string, unknown>;
  /** Set when something went wrong, so the log shows failures too. */
  note?: string;
}

export type OnTraffic = (entry: TrafficEntry) => void;

export interface EdithLinkOptions {
  config: AgentCredentials;
  /** The BAND agent to @mention. An unmentioned post is rejected with 422. */
  edithAgentId: string;
  /** Must stay below Lyzr's own tool-call timeout. */
  timeoutMs: number;
  onTraffic?: OnTraffic;
  /** Seam for tests; defaults to `console`. */
  log?: Pick<Console, 'log' | 'error'>;
}

/** What `send` resolves when EDITH does not answer in time. Always sayable. */
function holdingResult(sessionId: string, say: string): ResultMessage {
  return {
    from: 'edith',
    to: 'vision',
    type: 'result',
    session_id: sessionId,
    status: 'needs_info',
    missing: [],
    say,
  };
}

const TIMEOUT_SAY = 'One moment — I am still checking that.';

interface Pending {
  resolve: (r: ResultMessage) => void;
  timer: NodeJS.Timeout;
}

class BandEdithLink implements EdithLink {
  readonly #options: EdithLinkOptions;
  readonly #log: Pick<Console, 'log' | 'error'>;
  readonly #agent: Agent;
  readonly #pending = new Map<string, Pending>();

  /** Resolves with the first room the agent joins; that is where EDITH lives. */
  #roomId: string | null = null;
  #settleRoom!: (roomId: string) => void;
  readonly #roomReady: Promise<string>;

  #started = false;

  constructor(options: EdithLinkOptions) {
    this.#options = options;
    this.#log = options.log ?? console;

    this.#roomReady = new Promise<string>((resolve) => {
      this.#settleRoom = resolve;
    });

    this.#agent = Agent.create({
      config: options.config,
      adapter: new GenericAdapter(async ({ message, tools }) => {
        // Vision answers into an HTTP response, never into the room. Without
        // this, BAND reports every single turn as "ended without replying".
        tools.turn.settle();
        this.#onBandMessage(message.content, message.senderId);
      }),
    });

    this.#agent.observe((event) => {
      switch (event.type) {
        case 'link.connected':
          this.#log.log('[band] connected');
          break;
        case 'link.disconnected':
          this.#log.error('[band] disconnected');
          break;
        case 'room.joined':
          // Rooms are assigned in the BAND dashboard, so we learn ours here
          // rather than from configuration.
          if (!this.#roomId) {
            this.#roomId = event.roomId;
            this.#settleRoom(event.roomId);
            this.#log.log(`[band] room ${event.roomId}`);
          }
          break;
        case 'turn.failed':
          this.#log.error(`[band] turn failed: ${event.error}`);
          break;
        default:
          break;
      }
    });
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#agent.start();
    // Posting needs a room id, and the room arrives as an event after connect.
    await this.#roomReady;
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    this.#started = false;
    for (const [sessionId, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.resolve(holdingResult(sessionId, TIMEOUT_SAY));
    }
    this.#pending.clear();
    await this.#agent.stop();
  }

  async send(message: VisionMessage): Promise<ResultMessage> {
    if (!this.#started) throw new Error('EdithLink.send called before start()');

    const sessionId = message.session_id;
    const roomId = this.#roomId ?? (await this.#roomReady);

    // One in-flight send per session. A second one means the caller re-asked
    // before we answered; let the older one go rather than lose its resolve.
    const existing = this.#pending.get(sessionId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.resolve(holdingResult(sessionId, TIMEOUT_SAY));
      this.#pending.delete(sessionId);
    }

    const reply = new Promise<ResultMessage>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(sessionId);
        this.#options.onTraffic?.({
          at: new Date().toISOString(),
          direction: 'in',
          payload: { session_id: sessionId },
          note: `no reply within ${this.#options.timeoutMs}ms`,
        });
        resolve(holdingResult(sessionId, TIMEOUT_SAY));
      }, this.#options.timeoutMs);

      // `unref` so a pending timer never keeps the process alive on shutdown.
      timer.unref?.();
      this.#pending.set(sessionId, { resolve, timer });
    });

    this.#options.onTraffic?.({
      at: new Date().toISOString(),
      direction: 'out',
      payload: redactForLog(message),
    });

    try {
      // The key move: posting from OUTSIDE a turn. `tools.sendMessage` exists
      // only inside the adapter handler, which is no use to an HTTP route.
      await this.#agent.runtime.link.rest.createChatMessage(roomId, {
        content: JSON.stringify(message),
        mentions: [{ id: this.#options.edithAgentId }],
      });
    } catch (err) {
      // A failed post means no reply is ever coming; settle now rather than
      // make the caller wait out the full timeout.
      const pending = this.#pending.get(sessionId);
      if (pending) {
        clearTimeout(pending.timer);
        this.#pending.delete(sessionId);
        pending.resolve(
          holdingResult(sessionId, 'Sorry, I could not reach the booking system just then.'),
        );
      }
      const note = err instanceof Error ? err.message : String(err);
      this.#log.error(`[band] post failed: ${note}`);
      this.#options.onTraffic?.({
        at: new Date().toISOString(),
        direction: 'out',
        payload: { session_id: sessionId },
        note: `post failed: ${note}`,
      });
    }

    return reply;
  }

  /** Nothing off the wire is trusted: parse, guard, match, or drop. */
  #onBandMessage(content: string, senderId: string): void {
    if (senderId === this.#options.config.agentId) return; // our own post, echoed back

    const payload = extractMessagePayload(content);
    if (!isResultMessage(payload)) return; // a human talking in the room, usually

    this.#options.onTraffic?.({
      at: new Date().toISOString(),
      direction: 'in',
      payload: redactForLog(payload),
    });

    const pending = this.#pending.get(payload.session_id);
    if (!pending) return; // late, or not ours — drop it quietly, never throw

    clearTimeout(pending.timer);
    this.#pending.delete(payload.session_id);
    pending.resolve(payload);
  }
}

export function createBandEdithLink(options: EdithLinkOptions): EdithLink {
  return new BandEdithLink(options);
}
