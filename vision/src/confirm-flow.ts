/**
 * The confirmation handshake — R8 and R9.
 *
 * R8: nothing is booked, moved or cancelled without a spoken yes.
 * R9: name and phone are collected only at the end, the phone is read back
 *     digit by digit, and it must be exactly 10 digits.
 *
 * **Does this break "Vision holds no booking state"? No.** What it holds is
 * *conversational* state — which question it last asked — plus the name and
 * phone for the few seconds between hearing them and sending them. It never
 * holds a branch, a doctor, a time or a slot: those stay EDITH's, and the
 * `slot_id` kept here is only the cross-check the contract calls optional.
 *
 * Two paths out of `needs_confirm`, deliberately different:
 *
 *  - **book** → yes → name → phone → read the digits back → `ConfirmMessage`.
 *    That is the only message in the system carrying personal data.
 *  - **reschedule / cancel** → yes is enough. Asking someone their name and
 *    number to cancel an appointment EDITH has already identified would be
 *    both rude and pointless, so the spoken yes goes back as a plain turn and
 *    EDITH does the write.
 *
 * The gate never traps the user: anything that is not a yes or a no abandons
 * the handshake and is passed through to EDITH as an ordinary turn, so
 * "actually, make it Friday" still works.
 */
import {
  normalisePhone,
  type Intent,
  type TurnMessage,
  type VisionMessage,
  type Status,
} from '../../shared/contract.ts';

type Stage = 'awaiting_yes' | 'awaiting_name' | 'awaiting_phone' | 'awaiting_readback';

interface FlowState {
  stage: Stage;
  intent: Intent;
  slotId?: string;
  name?: string;
  phone?: string;
  touchedAt: number;
}

/** What the route should do next. */
export type ConfirmStep =
  /** Answer the caller directly; EDITH is not involved in this turn. */
  | { kind: 'say'; say: string; status: Status }
  /** Send this to EDITH and return its reply. */
  | { kind: 'send'; message: VisionMessage }
  /** Not a confirmation answer. The handshake is off; treat it as a normal turn. */
  | { kind: 'forward' };

export interface ConfirmFlow {
  /** Begin after EDITH returns `needs_confirm`. */
  begin(sessionId: string, intent: Intent, slotId?: string): void;
  active(sessionId: string): boolean;
  advance(sessionId: string, userSaid: string): ConfirmStep;
  clear(sessionId: string): void;
}

const YES = /^\s*(y|ya|yes|yeah|yep|yup|sure|ok|okay|correct|right|confirm(ed)?|go ahead|please do|do it|that'?s right|haan?|sari|seri)\b/i;
const NO = /^\s*(n|no|nope|nah|not? really|don'?t|do not|cancel that|wrong|incorrect|stop|wait)\b/i;

/** Exported for testing — these two decide whether anything gets written. */
export const isAffirmative = (text: string): boolean => YES.test(text);
export const isNegative = (text: string): boolean => NO.test(text);

/** "my name is Venkat" -> "Venkat". People rarely answer with a bare name. */
function readName(text: string): string {
  return text
    .replace(/^\s*(my name is|name is|i am|i'?m|this is|it'?s|call me)\s+/i, '')
    .replace(/[.!]+\s*$/, '')
    .trim();
}

/** R9: spoken one digit at a time, because "nine eight seven six…" is how it is heard back. */
export function spellDigits(phone: string): string {
  return phone.split('').join(' ');
}

/** Sessions are abandoned far more often than they are finished. */
const STALE_MS = 30 * 60 * 1000;

export function createConfirmFlow(now: () => number = Date.now): ConfirmFlow {
  const flows = new Map<string, FlowState>();

  const sweep = (): void => {
    const cutoff = now() - STALE_MS;
    for (const [id, state] of flows) {
      if (state.touchedAt < cutoff) flows.delete(id);
    }
  };

  const confirmMessage = (sessionId: string, state: FlowState): VisionMessage => ({
    from: 'vision',
    to: 'edith',
    type: 'confirm',
    session_id: sessionId,
    ...(state.slotId ? { slot_id: state.slotId } : {}),
    name: state.name ?? '',
    phone: state.phone ?? '',
  });

  const spokenYesTurn = (sessionId: string, state: FlowState, userSaid: string): TurnMessage => ({
    from: 'vision',
    to: 'edith',
    type: 'turn',
    session_id: sessionId,
    intent: state.intent,
    user_said: userSaid,
    details: { confirmed: 'yes' },
  });

  return {
    begin(sessionId, intent, slotId) {
      sweep();
      flows.set(sessionId, { stage: 'awaiting_yes', intent, slotId, touchedAt: now() });
    },

    active(sessionId) {
      return flows.has(sessionId);
    },

    clear(sessionId) {
      flows.delete(sessionId);
    },

    advance(sessionId, userSaid) {
      const state = flows.get(sessionId);
      if (!state) return { kind: 'forward' };
      state.touchedAt = now();

      switch (state.stage) {
        case 'awaiting_yes': {
          if (isNegative(userSaid)) {
            flows.delete(sessionId);
            return {
              kind: 'say',
              status: 'needs_info',
              say: 'Alright, I have not booked anything. What would you like to do instead?',
            };
          }
          if (!isAffirmative(userSaid)) {
            // Not an answer to the question — let EDITH deal with it.
            flows.delete(sessionId);
            return { kind: 'forward' };
          }

          // R8 satisfied. Booking needs personal data; the others do not.
          if (state.intent !== 'book') {
            flows.delete(sessionId);
            return { kind: 'send', message: spokenYesTurn(sessionId, state, userSaid) };
          }

          state.stage = 'awaiting_name';
          return { kind: 'say', status: 'needs_info', say: 'What name should I book it under?' };
        }

        case 'awaiting_name': {
          const name = readName(userSaid);
          if (!name) {
            return { kind: 'say', status: 'needs_info', say: 'Sorry, what name should I use?' };
          }
          state.name = name;
          state.stage = 'awaiting_phone';
          return {
            kind: 'say',
            status: 'needs_info',
            say: `Thank you, ${name}. What is your ten digit mobile number?`,
          };
        }

        case 'awaiting_phone': {
          const phone = normalisePhone(userSaid);
          if (!phone) {
            return {
              kind: 'say',
              status: 'needs_info',
              say: 'I need a ten digit mobile number. Could you say it again?',
            };
          }
          state.phone = phone;
          state.stage = 'awaiting_readback';
          return {
            kind: 'say',
            status: 'needs_confirm',
            say: `Let me read that back: ${spellDigits(phone)}. Is that right?`,
          };
        }

        case 'awaiting_readback': {
          if (isAffirmative(userSaid)) {
            flows.delete(sessionId);
            return { kind: 'send', message: confirmMessage(sessionId, state) };
          }
          if (isNegative(userSaid)) {
            state.phone = undefined;
            state.stage = 'awaiting_phone';
            return {
              kind: 'say',
              status: 'needs_info',
              say: 'No problem. What is the correct ten digit number?',
            };
          }

          // They may have simply said the number again rather than "no".
          const retry = normalisePhone(userSaid);
          if (retry) {
            state.phone = retry;
            return {
              kind: 'say',
              status: 'needs_confirm',
              say: `Let me read that back: ${spellDigits(retry)}. Is that right?`,
            };
          }
          return {
            kind: 'say',
            status: 'needs_confirm',
            say: `Sorry — is ${spellDigits(state.phone ?? '')} correct? Please say yes or no.`,
          };
        }
      }
    },
  };
}
