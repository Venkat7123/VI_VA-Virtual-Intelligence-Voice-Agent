/**
 * FakeEdithLink — the other adapter at the EdithLink seam.
 *
 * Same interface as the BAND one, no network at all. It exists so the Vision
 * server, the web page and the Lyzr prompt can be built and demoed while BAND
 * is down, the stub is not running, or Member B's EDITH has not landed.
 *
 *   VISION_FAKE_EDITH=1 npm run dev:vision
 *
 * It is a **test double, not a simulator**: a handful of deterministic rules,
 * so the same words always produce the same reply and the page is predictable
 * to work against. It invents availability, which the real EDITH must never
 * do — never put this in front of a judge.
 */
import {
  redactForLog,
  type ResultMessage,
  type Slot,
  type VisionMessage,
} from '../../shared/contract.ts';
import type { EdithLink, OnTraffic } from './edith-link.ts';

/** Chains with more than one branch, so "which branch?" (R5) can be exercised. */
const BRANCHES: Record<string, string[]> = {
  apollo: ['Apollo Greams Road', 'Apollo OMR', 'Apollo Vanagaram'],
  fortis: ['Fortis Adyar', 'Fortis Vadapalani'],
};

const SAMPLE_SLOT: Slot = {
  slot_id: 'slot_101',
  branch: 'Apollo OMR',
  doctor: 'Dr. Anand',
  time: '2026-11-25T18:00',
};

/** What the fake remembers per session — because EDITH owns state, and this stands in for EDITH. */
interface FakeSession {
  chain?: string;
  branch?: string;
  day?: string;
  time?: string;
}

function detectChain(text: string): string | undefined {
  const lower = text.toLowerCase();
  return Object.keys(BRANCHES).find((chain) => lower.includes(chain));
}

function detectBranch(text: string, chain: string | undefined): string | undefined {
  if (!chain) return undefined;
  const lower = text.toLowerCase();
  return BRANCHES[chain]?.find((branch) => {
    const area = branch.split(' ').slice(1).join(' ').toLowerCase();
    return lower.includes(area);
  });
}

/** Crude on purpose — a double only has to be consistent, not clever. */
function mentionsWhen(text: string): boolean {
  return /\b(today|tomorrow|morning|evening|afternoon|night|mon|tue|wed|thu|fri|sat|sun|\d{1,2}\s*(am|pm)|\d{1,2}:\d{2})/i.test(
    text,
  );
}

class FakeEdithLink implements EdithLink {
  readonly #sessions = new Map<string, FakeSession>();
  readonly #onTraffic?: OnTraffic;
  readonly #delayMs: number;

  constructor(options: { onTraffic?: OnTraffic; delayMs?: number } = {}) {
    this.#onTraffic = options.onTraffic;
    // A little latency, so timeout handling and the page's log are exercised
    // the way they will be against the real thing.
    this.#delayMs = options.delayMs ?? 150;
  }

  async start(): Promise<void> {
    /* nothing to connect */
  }

  async stop(): Promise<void> {
    this.#sessions.clear();
  }

  async send(message: VisionMessage): Promise<ResultMessage> {
    this.#onTraffic?.({
      at: new Date().toISOString(),
      direction: 'out',
      payload: redactForLog(message),
      note: 'fake EDITH',
    });

    await new Promise((resolve) => setTimeout(resolve, this.#delayMs));

    const result = this.#answer(message);

    this.#onTraffic?.({
      at: new Date().toISOString(),
      direction: 'in',
      payload: redactForLog(result),
      note: 'fake EDITH',
    });

    return result;
  }

  #answer(message: VisionMessage): ResultMessage {
    const session_id = message.session_id;
    const base = { from: 'edith', to: 'vision', type: 'result', session_id } as const;

    if (message.type === 'confirm') {
      this.#sessions.delete(session_id);
      return {
        ...base,
        status: 'booked',
        missing: [],
        booking_id: 'VV-4821',
        say: 'Booked. Your booking reference is V V 4 8 2 1.',
      };
    }

    const state = this.#sessions.get(session_id) ?? {};
    const said = message.user_said ?? '';
    const details = message.details ?? {};

    // A later turn overrides an earlier one, so "actually make it Fortis Adyar"
    // changes the booking instead of being ignored. Naming a different chain
    // drops the branch with it.
    const heardChain = details.chain?.toLowerCase() ?? detectChain(said);
    if (heardChain && heardChain !== state.chain) {
      state.chain = heardChain;
      state.branch = undefined;
    }
    const heardBranch = details.branch ?? detectBranch(`${said} ${details.area ?? ''}`, state.chain);
    if (heardBranch) state.branch = heardBranch;
    if (mentionsWhen(said) || details.day || details.time) {
      state.day = details.day ?? said;
    }
    this.#sessions.set(session_id, state);

    if (message.intent === 'escalate') {
      this.#sessions.delete(session_id);
      return {
        ...base,
        status: 'escalated',
        missing: [],
        reason: 'user asked for a person',
        say: 'I have passed this to the hospital — someone will call you back.',
      };
    }

    if (!state.chain) {
      return {
        ...base,
        status: 'needs_info',
        missing: ['chain'],
        say: 'Which hospital would you like?',
      };
    }

    if (!state.branch) {
      return {
        ...base,
        status: 'needs_choice',
        missing: ['branch'],
        options: BRANCHES[state.chain] ?? [],
        say: `Which one — ${(BRANCHES[state.chain] ?? []).join(', ')}?`,
      };
    }

    if (!state.day) {
      return {
        ...base,
        status: 'needs_info',
        missing: ['day', 'time'],
        say: 'What day and time suit you?',
      };
    }

    const slot: Slot = { ...SAMPLE_SLOT, branch: state.branch };
    return {
      ...base,
      status: 'needs_confirm',
      missing: [],
      slot,
      say: `${slot.doctor} is free at 6 PM on 25 November at ${slot.branch}. Shall I confirm?`,
    };
  }
}

export function createFakeEdithLink(options: {
  onTraffic?: OnTraffic;
  delayMs?: number;
} = {}): EdithLink {
  return new FakeEdithLink(options);
}
