/**
 * The Vision server.
 *
 * Serves the page, and exposes the one endpoint the Lyzr voice agent calls.
 * It is deliberately thin: a route handler should read as "build a message,
 * await link.send(it), return say". Anything more than that belongs behind
 * `EdithLink`.
 *
 *   npm run dev:vision                      # against BAND + EDITH
 *   VISION_FAKE_EDITH=1 npm run dev:vision  # no BAND needed
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';

import { newSessionId, type TurnMessage } from '../../shared/contract.ts';
import { createBandEdithLink, type EdithLink } from './edith-link.ts';
import { createFakeEdithLink } from './fake-edith-link.ts';
import { detectEmergency, EMERGENCY_SAY } from './emergency.ts';
import { classifyIntent } from './intent.ts';
import { loadEnvOrExit } from './env.ts';

const env = loadEnvOrExit();
const PAGE = fileURLToPath(new URL('../public/index.html', import.meta.url));

const link: EdithLink = env.useFakeEdith
  ? createFakeEdithLink({})
  : createBandEdithLink({
      config: env.band,
      edithAgentId: env.edithAgentId,
      timeoutMs: env.edithTimeoutMs,
    });

const app = Fastify({ logger: false });

/** What the Lyzr custom tool posts. Everything but `user_said` is optional. */
const askEdithSchema = {
  body: {
    type: 'object',
    required: ['user_said'],
    additionalProperties: false,
    properties: {
      user_said: { type: 'string', minLength: 1, maxLength: 2000 },
      /** Absent on the first turn; Vision mints one and the caller echoes it back. */
      session_id: { type: 'string', maxLength: 64 },
      intent: { type: 'string' },
      details: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
} as const;

interface AskEdithBody {
  user_said: string;
  session_id?: string;
  intent?: string;
  details?: Record<string, string>;
}

app.get('/', async (_request, reply) => {
  const html = await readFile(PAGE, 'utf8');
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/healthz', async () => ({
  ok: true,
  edith: env.useFakeEdith ? 'fake' : 'band',
}));

app.post<{ Body: AskEdithBody }>(
  '/tools/ask_edith',
  { schema: askEdithSchema },
  async (request) => {
    const { user_said } = request.body;
    const session_id = request.body.session_id?.trim() || newSessionId();

    // R13: an emergency never reaches EDITH and never becomes a booking.
    if (detectEmergency(user_said)) {
      request.log.warn({ session_id }, 'emergency wording — short-circuited');
      return { session_id, status: 'escalated', say: EMERGENCY_SAY };
    }

    const turn: TurnMessage = {
      from: 'vision',
      to: 'edith',
      type: 'turn',
      session_id,
      intent: classifyIntent(user_said, request.body.intent),
      user_said,
      details: request.body.details ?? {},
    };

    const result = await link.send(turn);

    // `say` is the whole point: it is what gets spoken. The rest is for the page.
    return {
      session_id,
      status: result.status,
      say: result.say,
      options: result.options,
    };
  },
);

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[vision] ${signal} — shutting down`);
  await app.close();
  await link.stop();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown(signal));
}

// EDITH first: a page that loads before the link is up would be a lie.
await link.start();

try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
} catch (err) {
  // The link is already connected by this point. Leaving it that way would
  // hold the BAND agent open on a process that is about to die — and the same
  // agent connected twice is a failure mode the PRD calls out by name.
  await link.stop();
  console.error(`\n[vision] could not listen on port ${env.port}: ${(err as Error).message}\n`);
  process.exit(1);
}

console.log(`\n[vision] listening on http://localhost:${env.port}`);
console.log(`[vision] edith     ${env.useFakeEdith ? 'FAKE (in-process)' : env.edithAgentId}`);
console.log(`[vision] public    ${env.publicUrl}\n`);
