/**
 * Intent, when Lyzr does not supply one.
 *
 * The contract needs an `intent` on every turn, but Vision is the wrong place
 * to be clever about it: EDITH owns the conversation state and reads
 * `user_said` for itself. So this is a crude keyword fallback, not an
 * understanding layer.
 *
 * Order of preference, by design:
 *   1. whatever the Lyzr voice agent passed (it is already an LLM — let it)
 *   2. this classifier
 *   3. `book`, the overwhelmingly common case
 *
 * Deliberately not an LLM call: a second model hop inside the endpoint would
 * cost over a second against a three-second budget.
 */
import { isIntent, type Intent } from '../../shared/contract.ts';

const RULES: ReadonlyArray<[RegExp, Intent]> = [
  [/\b(talk|speak) to (a |an )?(person|human|someone|agent|receptionist)\b/i, 'escalate'],
  [/\b(real|actual) (person|human)\b/i, 'escalate'],
  [/\bcancel\b/i, 'cancel'],
  [/\b(reschedul|postpon|move it|change .*(appointment|booking)|shift .*(appointment|booking))/i, 'reschedule'],
  [/\b(when|what time) is my\b/i, 'lookup'],
  [/\b(check|find|look ?up|show) my (appointment|booking)\b/i, 'lookup'],
  [/\bmy (appointment|booking)\b/i, 'lookup'],
];

/** `supplied` is whatever the caller sent; it wins whenever it is a real intent. */
export function classifyIntent(text: string, supplied?: unknown): Intent {
  if (isIntent(supplied)) return supplied;
  for (const [pattern, intent] of RULES) {
    if (pattern.test(text)) return intent;
  }
  return 'book';
}
