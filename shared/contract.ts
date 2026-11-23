/**
 * VI-VA message contract — Vision <-> EDITH, over BAND.
 *
 * This file is the agreement between Member A (Vision) and Member B (EDITH).
 * Change it only by agreement; both agents import it.
 *
 * Rules baked in here:
 *  - Every message carries a session_id, so the hand-offs show in one log.
 *  - EDITH owns booking state. Vision never holds `collected` / `missing`.
 *  - Personal data (name, phone) appears ONLY in the `confirm` message.
 */

export const INTENTS = ['book', 'lookup', 'reschedule', 'cancel', 'escalate'] as const;
export type Intent = (typeof INTENTS)[number];

export const STATUSES = [
  'needs_info',    // EDITH is missing fields -> `missing` lists them
  'needs_choice',  // more than one option -> `options`
  'needs_confirm', // a concrete slot is held out for a spoken yes -> `slot`
  'booked',        // written to the database -> `booking_id`
  'unavailable',   // slot gone -> up to 3 `alternatives`
  'escalated',     // handed to a human / emergency -> nothing booked
] as const;
export type Status = (typeof STATUSES)[number];

/** A concrete, bookable slot. Only EDITH ever creates one of these. */
export interface Slot {
  slot_id: string;
  branch: string;
  doctor: string;
  /** Local ISO, no timezone suffix: "2026-11-25T18:00" */
  time: string;
}

/** Loose bag of booking details Vision overheard. EDITH decides what matters. */
export interface TurnDetails {
  chain?: string;
  area?: string;
  branch?: string;
  doctor?: string;
  specialty?: string;
  problem?: string;
  day?: string;
  time?: string;
  booking_id?: string;
  /** For lookup by phone when the user has no booking ID. */
  phone?: string;
  [key: string]: string | undefined;
}

/** Vision -> EDITH: one user turn. Carries no personal data. */
export interface TurnMessage {
  from: 'vision';
  to: 'edith';
  type: 'turn';
  session_id: string;
  intent: Intent;
  user_said: string;
  details: TurnDetails;
}

/** Vision -> EDITH: the ONLY message carrying personal data. Sent after a spoken yes. */
export interface ConfirmMessage {
  from: 'vision';
  to: 'edith';
  type: 'confirm';
  session_id: string;
  /**
   * OPTIONAL, and only ever a cross-check.
   *
   * EDITH is authoritative: it offered the slot with `needs_confirm`, so it
   * already knows which slot this session is holding. If Vision had to supply
   * it, Vision would have to remember a booking detail between turns — and the
   * one rule this architecture rests on is that EDITH owns booking state.
   *
   * Send it when it is to hand. When both are present and they disagree,
   * EDITH's own held slot wins and Vision's value is ignored.
   *
   * Changed 23 Nov (was required). EDITH imports this file — Member B must know.
   */
  slot_id?: string;
  name: string;
  /** Exactly 10 digits. Vision reads it back digit by digit before sending. */
  phone: string;
}

/** EDITH -> Vision: the answer. `say` is what Vision speaks. */
export interface ResultMessage {
  from: 'edith';
  to: 'vision';
  type: 'result';
  session_id: string;
  status: Status;
  /** Field names still needed, e.g. ["branch", "day"]. Empty when nothing is missing. */
  missing: string[];
  /** What Vision should say out loud. EDITH always fills this. */
  say: string;
  /** status = needs_choice: the branches / doctors / times to offer. */
  options?: string[];
  /** status = needs_confirm: the exact slot awaiting a spoken yes. */
  slot?: Slot;
  /** status = unavailable: up to three — later today, next day, nearest branch. */
  alternatives?: Slot[];
  /** status = booked: the ID Vision reads back. */
  booking_id?: string;
  /** status = escalated: why. Emergency words point the user to 112. */
  reason?: string;
}

export type VisionMessage = TurnMessage | ConfirmMessage;
export type EdithMessage = ResultMessage;
export type BandMessage = VisionMessage | EdithMessage;

/* ------------------------------------------------------------------ */
/* Guards — messages cross a network, so nothing is trusted on arrival. */
/* ------------------------------------------------------------------ */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isIntent = (v: unknown): v is Intent =>
  typeof v === 'string' && (INTENTS as readonly string[]).includes(v);

export const isStatus = (v: unknown): v is Status =>
  typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

/** Validates a result coming back from EDITH before Vision speaks it. */
export function isResultMessage(v: unknown): v is ResultMessage {
  if (!isRecord(v)) return false;
  return (
    v.from === 'edith' &&
    v.to === 'vision' &&
    v.type === 'result' &&
    typeof v.session_id === 'string' &&
    isStatus(v.status) &&
    Array.isArray(v.missing) &&
    v.missing.every((m) => typeof m === 'string') &&
    typeof v.say === 'string'
  );
}

/* ------------------------------------------------------------------ */
/* Shared helpers — both agents apply the same rules.                   */
/* ------------------------------------------------------------------ */

/** R9: a phone is valid only as exactly 10 digits. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^\d{10}$/.test(local) ? local : null;
}

/** R4: the page log never shows a full phone number. "9876543210" -> "98xxxxxx10" */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return 'x'.repeat(digits.length);
  return `${digits.slice(0, 2)}${'x'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

/** Strips personal data out of any message before it reaches the page log. */
export function redactForLog<T extends BandMessage>(msg: T): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...msg };
  if (typeof copy.phone === 'string') copy.phone = maskPhone(copy.phone);
  if (typeof copy.name === 'string') copy.name = '<name>';
  if (isRecord(copy.details) && typeof copy.details.phone === 'string') {
    copy.details = { ...copy.details, phone: maskPhone(copy.details.phone) };
  }
  return copy;
}

/**
 * Pulls our JSON out of a BAND message's `content`.
 *
 * BAND delivers the @mention as part of the text, so `content` arrives looking
 * like `"@vcc.20071/vision {\"from\":\"edith\"...}"` and a plain JSON.parse
 * throws. We take the first `{` through the last `}` instead.
 *
 * Returns null when there is no JSON in the message at all — which is the normal
 * case for a human typing in the room, not an error.
 */
export function extractMessagePayload(content: string): unknown | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Session IDs look like "s-7f3a" in the PRD examples. */
export function newSessionId(): string {
  return `s-${Math.random().toString(16).slice(2, 6)}`;
}
