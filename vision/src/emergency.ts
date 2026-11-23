/**
 * R13 — emergency wording short-circuits the whole booking flow.
 *
 * A pure function on purpose: no state, no network, trivially testable, and it
 * runs *before* anything is sent to EDITH, so an emergency can never turn into
 * an appointment.
 *
 * Deliberately over-eager. "My chest pain started last week" will trip it, and
 * that is the right way to be wrong: the cost of an unnecessary "please call
 * 112" is a mildly odd demo moment, and the cost of missing a real one is not
 * something to trade against that.
 */

const EMERGENCY_PATTERNS: RegExp[] = [
  /\bchest pain\b/i,
  /\bheart attack\b/i,
  /\bcardiac\b/i,
  /\bstroke\b/i,
  /\bunconscious\b/i,
  /\bnot breathing\b/i,
  /\bcan('?t| ?not) breathe\b/i,
  /\bbleeding\b/i,
  /\bseizure\b/i,
  /\bfits?\b/i,
  /\boverdose\b/i,
  /\bsuicid(e|al)\b/i,
  /\bpoison(ed|ing)?\b/i,
  /\bemergency\b/i,
  /\bambulance\b/i,
  /\bdying\b/i,
  /\bcollapsed\b/i,
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(text));
}

/** What Vision says instead of booking. Short, because it is spoken aloud. */
export const EMERGENCY_SAY =
  'This sounds like an emergency. Please hang up and call one one two right now. ' +
  'I have not booked anything.';
