/**
 * Agent-to-agent proof — CP1's gate.
 *
 * `band-echo.ts` proved a human can reach one agent. This proves the thing
 * VI-VA's architecture actually rests on: **one agent starting a conversation
 * with another agent, with no human in the room.**
 *
 * It runs as Vision, posts a real contract `TurnMessage` @mentioning EDITH,
 * and waits for a valid `ResultMessage` to come back.
 *
 * It also proves the second thing Phase 2 needs, which is easy to miss:
 * **posting from OUTSIDE a turn.** `tools.sendMessage` only exists inside the
 * adapter handler, but Vision's bridge has to post when an HTTP request
 * arrives, which is not a turn at all. The route is
 * `agent.runtime.link.rest.createChatMessage(roomId, {content, mentions})`
 * [verified in node_modules/@band-ai/sdk/dist/rest.d.ts].
 *
 *   # terminal 1
 *   npm run edith:stub
 *   # terminal 2
 *   npm run band:a2a
 *   npm run band:a2a -- --no-mention    # confirm the 422 failure mode
 *
 * Exits 0 on a valid round trip, 1 on anything else.
 */
import 'dotenv/config';
import { Agent, GenericAdapter, loadAgentConfigFromEnv } from '@band-ai/sdk';
import {
  extractMessagePayload,
  isResultMessage,
  newSessionId,
  type ResultMessage,
  type TurnMessage,
} from '../shared/contract.ts';

/** Posting with no mention should be rejected — we want to see the failure mode, not avoid it. */
const noMention = process.argv.includes('--no-mention');
const WAIT_MS = Number(process.env.A2A_WAIT_MS ?? 20_000);
const ROOM_WAIT_MS = 15_000;

const config = loadAgentConfigFromEnv();

/** EDITH's UUID. Member B owes us EDITH_AGENT_ID; until then the stub's own agent stands in. */
const target = process.env.EDITH_AGENT_ID?.trim() || process.env.B_AGENT_ID?.trim();

function die(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!config.agentId || !config.apiKey) die('Missing BAND_AGENT_ID / BAND_API_KEY in .env');
if (!target) die('Missing EDITH_AGENT_ID (or B_AGENT_ID) in .env — nobody to talk to');
if (target === config.agentId) {
  die('EDITH_AGENT_ID is the same agent as BAND_AGENT_ID. Talking to yourself proves nothing.');
}

const sessionId = newSessionId();

/** The turn Vision would send on "Book an appointment at Apollo, OMR side". */
const turn: TurnMessage = {
  from: 'vision',
  to: 'edith',
  type: 'turn',
  session_id: sessionId,
  intent: 'book',
  user_said: 'Book an appointment at Apollo, OMR side',
  details: { chain: 'Apollo', area: 'OMR' },
};

let settleReply: (r: ResultMessage) => void;
const replyArrived = new Promise<ResultMessage>((resolve) => {
  settleReply = resolve;
});

let settleRoom: (id: string) => void;
const roomFound = new Promise<string>((resolve) => {
  settleRoom = resolve;
});

console.log('\n  BAND agent-to-agent proof');
console.log(`  vision  ${config.agentId}`);
console.log(`  edith   ${target}`);
console.log(`  session ${sessionId}`);
if (noMention) console.log('  mode    --no-mention (expecting a rejection)');
console.log('  connecting...\n');

const agent = Agent.create({
  adapter: new GenericAdapter(async ({ message, tools }) => {
    // This agent never answers into the room — it resolves a promise instead.
    // Without settle() BAND reports every turn as a missing reply. The real
    // Vision server has exactly this shape, so it needs exactly this call.
    tools.turn.settle();

    // Our own post coming back round would be a false positive.
    if (message.senderId === config.agentId) return;

    const who = message.senderName ?? message.senderId;
    console.log(`  <- ${who}: ${message.content.slice(0, 200)}`);

    const payload = extractMessagePayload(message.content);

    if (!isResultMessage(payload)) {
      console.log('     (not a ResultMessage — ignoring)\n');
      return;
    }
    if (payload.session_id !== sessionId) {
      console.log(`     (session ${payload.session_id} is not ours — ignoring)\n`);
      return;
    }

    settleReply(payload);
  }),
  config,
});

agent.observe((event) => {
  switch (event.type) {
    case 'link.connected':
      console.log('  [ok] connected to BAND');
      break;
    case 'link.disconnected':
      console.log(`  [!!] disconnected: ${JSON.stringify(event)}`);
      break;
    case 'room.joined':
      console.log(`  [ok] joined room ${event.roomId}`);
      settleRoom(event.roomId);
      break;
    case 'turn.failed':
      console.log(`  [!!] turn failed: ${event.error}`);
      break;
    default:
      break;
  }
});

function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms).unref());
}

let exitCode = 1;

await agent.start();

try {
  const roomId = await Promise.race([roomFound, after(ROOM_WAIT_MS, null)]);
  if (!roomId) {
    console.error(
      '\n  [FAIL] No room joined. Is this agent a member of a room in the BAND dashboard?\n',
    );
  } else {
    // The whole point: posting without being inside a turn, the way the Vision
    // server's bridge will have to when an HTTP request arrives.
    const content = JSON.stringify(turn);
    console.log(`\n  -> posting a turn to room ${roomId.slice(0, 8)}`);
    console.log(`     ${content}\n`);

    try {
      await agent.runtime.link.rest.createChatMessage(roomId, {
        content,
        mentions: noMention ? [] : [{ id: target }],
      });
      console.log('  [ok] posted\n');

      if (noMention) {
        console.log('  [??] An unmentioned post was ACCEPTED — the 422 rule does not');
        console.log('       apply to REST posts. Worth knowing; note it in TASKS.md.\n');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (noMention) {
        console.log(`  [ok] rejected, as expected: ${msg}\n`);
        console.log('  That is the 422 failure mode. Vision must always mention EDITH.\n');
        exitCode = 0;
      } else {
        console.error(`  [FAIL] post rejected: ${msg}\n`);
      }
      throw new Error('post-settled');
    }

    if (!noMention) {
      console.log(`  waiting up to ${WAIT_MS / 1000}s for EDITH to answer...\n`);
      const result = await Promise.race([replyArrived, after(WAIT_MS, null)]);

      if (!result) {
        console.error('  [FAIL] No valid ResultMessage came back.');
        console.error('         Is `npm run edith:stub` running in another terminal?');
        console.error('         Is that agent in the same room?\n');
      } else {
        console.log('  ──────────────────────────────────────────────');
        console.log('  [PASS] agent-to-agent round trip');
        console.log(`         status      ${result.status}`);
        console.log(`         say         ${result.say}`);
        if (result.options?.length) {
          console.log(`         options     ${result.options.join(', ')}`);
        }
        if (result.missing.length) {
          console.log(`         missing     ${result.missing.join(', ')}`);
        }
        console.log(`         session_id  ${result.session_id} (echoed intact)`);
        console.log('  ──────────────────────────────────────────────');
        console.log('\n  Proven: one agent started it, the other answered, and the');
        console.log('  post came from outside a turn — which is what the bridge needs.\n');
        exitCode = 0;
      }
    }
  }
} catch (err) {
  if ((err as Error).message !== 'post-settled') {
    console.error(`\n  [FAIL] ${(err as Error).message}\n`);
  }
} finally {
  await agent.stop();
}

process.exit(exitCode);
