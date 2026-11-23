/**
 * ============================================================================
 *  THROWAWAY. NOT THE REAL EDITH. DELETE WHEN MEMBER B'S EDITH LANDS.
 * ============================================================================
 *
 * A stand-in EDITH so Vision's bridge is testable before the real one exists.
 * Runs as a SECOND BAND agent and answers with contract-shaped ResultMessages,
 * using Groq to do the reasoning.
 *
 * It INVENTS availability. The real EDITH must never do that - the PRD is
 * explicit that slots come from SQLite, in code, never from an LLM. This exists
 * only to give Vision something to talk to. Never demo it.
 *
 *   npm run edith:stub
 *
 * Needs in .env:
 *   B_AGENT_ID, B_API_KEY   - a second agent registered at app.band.ai
 *   GROQ_API_KEY            - from console.groq.com
 *   GROQ_MODEL              - optional, defaults below
 */
import 'dotenv/config';
import { Agent, GenericAdapter, loadAgentConfigFromEnv } from '@band-ai/sdk';
import {
  extractMessagePayload,
  isResultMessage,
  newSessionId,
  type ResultMessage,
} from '../shared/contract.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const GROQ_KEY = process.env.GROQ_API_KEY;

const config = loadAgentConfigFromEnv({ prefix: 'B' });

if (!config.agentId || !config.apiKey) {
  console.error('\n  Missing B_AGENT_ID / B_API_KEY in .env (register a 2nd BAND agent)\n');
  process.exit(1);
}
if (!GROQ_KEY) {
  console.error('\n  Missing GROQ_API_KEY in .env (get one at console.groq.com)\n');
  process.exit(1);
}

/** Fake hospital data, so the stub at least stays consistent with itself. */
const FAKE_DATA = [
  'Apollo: branches Greams Road, OMR, Vanagaram (all Chennai).',
  'Fortis: branches Adyar, Vadapalani.',
  'Doctors: Dr. Anand (cardiology, Apollo OMR), Dr. Beena (general, Apollo OMR),',
  'Dr. Chandra (ortho, Apollo Greams Road), Dr. Divya (general, Fortis Adyar).',
  'Free slots: Apollo OMR 2026-11-25 at 17:00 and 18:00; Apollo Greams Road',
  '2026-11-25 at 10:00; Fortis Adyar 2026-11-26 at 09:30.',
  'Slot IDs look like slot_101, slot_102, and so on.',
].join('\n');

const SYSTEM = [
  'You are EDITH, the booking agent in a hospital voice-assistant demo.',
  'You reply ONLY with a single JSON object. No prose, no markdown fences.',
  '',
  'Required JSON shape:',
  '{',
  '  "from": "edith",',
  '  "to": "vision",',
  '  "type": "result",',
  '  "session_id": "<echo the session_id you were given>",',
  '  "status": "needs_info" | "needs_choice" | "needs_confirm" | "booked" | "unavailable" | "escalated",',
  '  "missing": ["field names still needed"],',
  '  "say": "<one short sentence for Vision to speak aloud>",',
  '  "options": ["..."],',
  '  "slot": {"slot_id":"...","branch":"...","doctor":"...","time":"2026-11-25T18:00"},',
  '  "alternatives": [],',
  '  "booking_id": "bk_123",',
  '  "reason": "..."',
  '}',
  '',
  'Rules:',
  '- options only with needs_choice; slot only with needs_confirm;',
  '  alternatives only with unavailable (max 3); booking_id only with booked;',
  '  reason only with escalated.',
  '- Omit any field the status does not call for. Never send null or "".',
  '- If the user names a chain with several branches and has not picked one,',
  '  you MUST use status needs_choice and put the branch names in options.',
  '  Do not use needs_info for that case.',
  '- Details still missing (branch, problem or doctor, day, time) -> needs_info.',
  '- Everything known -> needs_confirm with one concrete slot.',
  '- An incoming message of type "confirm" -> status booked, invent a booking_id.',
  '- Emergency wording -> status escalated, tell them to call 112, book nothing.',
  '- "say" must be ONE short spoken sentence. Never read out a slot_id.',
  '',
  'Sample data you may use:',
  FAKE_DATA,
].join('\n');

/** Groq rotates model names; print what is actually available when one is rejected. */
async function listModels(): Promise<void> {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { authorization: `Bearer ${GROQ_KEY}` },
    });
    const j = (await r.json()) as { data?: { id: string }[] };
    const ids = (j.data ?? []).map((m) => m.id).sort();
    console.error('\n  Model "' + MODEL + '" was rejected. Available:');
    for (const id of ids) console.error('   ' + id);
    console.error('\n  Set GROQ_MODEL in .env to one of those.\n');
  } catch {
    /* best effort */
  }
}

function fallback(sessionId: string, say: string): ResultMessage {
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

async function askGroq(userTurn: string, sessionId: string): Promise<ResultMessage> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userTurn },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 || body.includes('model')) await listModels();
    throw new Error('Groq ' + res.status + ': ' + body.slice(0, 300));
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? '';
  const parsed = extractMessagePayload(raw);

  // The model usually gets the shape right; patch the envelope regardless.
  const candidate: Record<string, unknown> = {
    ...(typeof parsed === 'object' && parsed !== null ? (parsed as object) : {}),
  };
  candidate.from = 'edith';
  candidate.to = 'vision';
  candidate.type = 'result';
  candidate.session_id = sessionId;
  if (!Array.isArray(candidate.missing)) candidate.missing = [];

  // Models like to fill every optional field with null or "". The contract says
  // those fields are absent unless the status calls for them, so drop the empties
  // rather than put `"slot": null` on the wire.
  for (const k of ['options', 'slot', 'alternatives', 'booking_id', 'reason']) {
    const v = candidate[k];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
      delete candidate[k];
    }
  }

  if (isResultMessage(candidate)) return candidate;
  return fallback(sessionId, 'Sorry, could you say that again?');
}

console.log('\n  EDITH stub (THROWAWAY - invents availability)');
console.log('  agent ' + config.agentId);
console.log('  model ' + MODEL);
console.log('  connecting...\n');

const agent = Agent.create({
  adapter: new GenericAdapter(async ({ message, tools }) => {
    const payload = extractMessagePayload(message.content) as Record<string, unknown> | null;

    // A human typing in the room, not Vision. Answer anyway, so the room stays testable by hand.
    const sessionId =
      typeof payload?.session_id === 'string' ? payload.session_id : newSessionId();

    const turnText = payload
      ? JSON.stringify(payload)
      : 'A person typed this directly: ' + message.content;

    const who = message.senderName ?? message.senderId;
    console.log('  <- ' + who + ': ' + message.content.slice(0, 160));

    let result: ResultMessage;
    try {
      result = await askGroq(turnText, sessionId);
    } catch (err) {
      console.error('  [!!] ' + (err as Error).message);
      result = fallback(sessionId, 'Sorry, I had trouble just then. Could you repeat that?');
    }

    await tools.sendMessage(JSON.stringify(result), [{ id: message.senderId }]);
    console.log('  -> [' + result.status + '] ' + result.say + '\n');
  }),
  config,
});

agent.observe((event) => {
  if (event.type === 'link.connected') console.log('  [ok] connected to BAND');
  if (event.type === 'room.joined') console.log('  [ok] joined room ' + event.roomId + '\n');
  if (event.type === 'turn.failed') console.log('  [!!] turn failed: ' + event.error);
});

await agent.run();
