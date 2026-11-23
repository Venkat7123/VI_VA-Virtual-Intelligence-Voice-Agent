/**
 * BAND hello test — the PRD's Day 0 check, and VI-VA's riskiest unknown.
 *
 * Connects one agent to BAND and echoes back anything that mentions it.
 * Nothing to do with VI-VA's real logic: this only answers "does BAND work".
 *
 *   npm run band:echo              -> uses BAND_AGENT_ID / BAND_API_KEY
 *   npm run band:echo -- --as=B    -> uses B_AGENT_ID / B_API_KEY (second agent)
 *
 * It blocks once connected — that is correct, it is listening. Ctrl-C to stop.
 */
import 'dotenv/config';
import { Agent, GenericAdapter, loadAgentConfigFromEnv } from '@band-ai/sdk';

// --as=B lets you run a second agent in another terminal, for agent-to-agent.
const asArg = process.argv.find((a) => a.startsWith('--as='));
const prefix = asArg?.slice('--as='.length);

const config = loadAgentConfigFromEnv(prefix ? { prefix } : undefined);

if (!config.agentId || !config.apiKey) {
  const p = prefix ?? 'BAND';
  console.error(`\n  Missing credentials. Set ${p}_AGENT_ID and ${p}_API_KEY in .env\n`);
  process.exit(1);
}

console.log(`\n  BAND echo test`);
console.log(`  agent ${config.agentId}`);
console.log(`  connecting...\n`);

const agent = Agent.create({
  adapter: new GenericAdapter(async ({ message, tools, roomId }) => {
    const who = message.senderName ?? message.senderId;
    console.log(`  <- [${roomId.slice(0, 8)}] ${who}: ${message.content}`);

    // A message with no mention is rejected with 422, so always mention the sender.
    const reply = `Echo: ${message.content}`;
    await tools.sendMessage(reply, [{ id: message.senderId }]);

    console.log(`  -> ${reply}\n`);
  }),
  config,
});

// Without this you see nothing until a message arrives: `run()` blocks until
// shutdown, so anything logged after it never prints while the agent is alive.
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
      break;
    case 'room.ready':
      console.log(`  [ok] room ready ${event.roomId} — mention this agent there now\n`);
      break;
    case 'room.failed':
      console.log(`  [!!] room failed: ${JSON.stringify(event)}`);
      break;
    case 'turn.failed':
      console.log(`  [!!] turn failed: ${event.error}`);
      break;
    default:
      break;
  }
});

// Blocks until shutdown. Registers SIGINT/SIGTERM handlers itself.
await agent.run();
