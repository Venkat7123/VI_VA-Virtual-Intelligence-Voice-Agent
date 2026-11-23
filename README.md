# VI-VA — Virtual Intelligence Voice Agent

Book a hospital appointment by talking. Two agents do the work:

- **Vision** (`vision/`) — speech and conversation. Serves the web page, hosts the
  Lyzr voice agent's `ask_edith` tool, and is a BAND agent. Holds no booking state.
- **EDITH** (`edith/`) — owns the booking: slots, timing rules, alternatives and the
  database. Never talks to the user, never invents availability.

They talk through **BAND**. The contract between them is `shared/contract.ts`.

Built for the Diwali Festiverse Agent-to-Agent Hackathon (Voice track — "Listen & Act").

## Running

Requires Node 22.12+ (the BAND SDK needs it).

```bash
npm install
cp .env.example .env   # fill in BAND / Lyzr keys
npm run dev:vision
```

## Layout

| Path | What |
| --- | --- |
| `shared/contract.ts` | Message types, statuses, intents, phone masking. Both agents import it. |
| `vision/` | Member A: Fastify server, `ask_edith`, BAND agent, web page. |
| `edith/` | Member B: booking state machine, SQLite, seed data. |

Slot data is sample data shaped like real branches — not a real hospital integration.
