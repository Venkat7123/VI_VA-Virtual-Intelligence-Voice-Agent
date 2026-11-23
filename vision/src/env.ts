/**
 * Vision's configuration, read and checked once at boot.
 *
 * The point of doing this in one place is that a missing key fails loudly on
 * startup with a sentence you can act on, instead of as `undefined` somewhere
 * in the middle of a demo.
 */
import 'dotenv/config';
import { loadAgentConfigFromEnv, type AgentCredentials } from '@band-ai/sdk';

export interface VisionEnv {
  port: number;
  /** Where Lyzr should reach us. The tunnel URL locally, the Agent37 URL in the demo. */
  publicUrl: string;
  /** R14 (P1): blank disables the gate. */
  demoPasscode: string | null;
  /** BAND credentials for THIS Vision agent (`Vision-local` or `Vision-demo`). */
  band: AgentCredentials;
  /**
   * The agent Vision @mentions. BAND rejects a post with no mention (422), so
   * this is required whenever we are actually talking to BAND.
   * Falls back to the throwaway stub's agent until Member B sends EDITH's UUID.
   */
  edithAgentId: string;
  /**
   * How long `EdithLink.send` waits before giving up and saying something
   * holding. Must stay BELOW Lyzr's own tool-call timeout, so that we control
   * the failure message rather than Lyzr erroring out mid-sentence.
   *
   * Default 12s, from measurement rather than taste: a BAND round trip is
   * ~3.5s typical with a 12.3s outlier observed. See `context/latency.md`.
   * The first draft used 8s and the very first real round trip tripped it.
   */
  edithTimeoutMs: number;
  /**
   * Run against the in-process fake instead of BAND. Lets the web page and the
   * Lyzr prompt be worked on with no BAND connection and no stub running.
   */
  useFakeEdith: boolean;
}

class ConfigError extends Error {}

function readPort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ConfigError(`PORT must be a port number, got "${raw}"`);
  }
  return n;
}

/** `1`, `true` and `yes` all mean on; anything else, including absent, means off. */
function readFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): VisionEnv {
  const useFakeEdith = readFlag(env.VISION_FAKE_EDITH);
  const band = loadAgentConfigFromEnv({ env: env as Record<string, string | undefined> });
  const edithAgentId = env.EDITH_AGENT_ID?.trim() || env.B_AGENT_ID?.trim() || '';

  const missing: string[] = [];

  // With the fake link there is no BAND connection at all, so none of these matter.
  if (!useFakeEdith) {
    if (!band.agentId) missing.push('BAND_AGENT_ID');
    if (!band.apiKey) missing.push('BAND_API_KEY');
    if (!edithAgentId) missing.push('EDITH_AGENT_ID (or B_AGENT_ID while the stub stands in)');
  }

  if (missing.length) {
    throw new ConfigError(
      [
        'Missing configuration in .env:',
        ...missing.map((m) => `  - ${m}`),
        '',
        'Copy .env.example to .env and fill it in, or run against the fake EDITH:',
        '  VISION_FAKE_EDITH=1 npm run dev:vision',
      ].join('\n'),
    );
  }

  if (!useFakeEdith && edithAgentId === band.agentId) {
    throw new ConfigError(
      'EDITH_AGENT_ID is the same agent as BAND_AGENT_ID. Vision would be talking to itself.',
    );
  }

  const port = readPort(env.PORT, 3000);

  return {
    port,
    publicUrl: env.PUBLIC_URL?.trim() || `http://localhost:${port}`,
    demoPasscode: env.DEMO_PASSCODE?.trim() || null,
    band,
    edithAgentId,
    edithTimeoutMs: Number(env.EDITH_TIMEOUT_MS ?? 12_000),
    useFakeEdith,
  };
}

/** Prints a config problem as something readable, then exits. For `server.ts` only. */
export function loadEnvOrExit(): VisionEnv {
  try {
    return loadEnv();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
