# VI-VA — Tasks

**Deadline: Tue 24 Nov 2026, 10:00 PM IST** (aim to submit by 6 PM).
Scope and priorities come from `VI-VA — Hackathon PRD.md`. R-numbers map to its
requirements table.

Legend: `[ ]` todo · `[x]` done & verified · `[~]` in progress · `[!]` blocked · `[-]` cut

---

## Right now — next 3 actions

1. `[x]` Rename `BAND_ID` → `BAND_AGENT_ID` in `.env`
2. `[x]` Room created, Vision agent in it (`9876ba1d-…`)
3. `[x]` Echo script connects — **`link.connected` + `room.joined` confirmed 23 Nov**
4. `[x]` Round trip proven — `<- Valorman: @vcc.20071/vision hello!` → `-> Echo: ...`
5. `[x]` 2nd agent registered + EDITH-stub replying in valid contract JSON
6. `[x]` Both agents at once → **agent-to-agent hop proven 23 Nov** (`scripts/band-a2a.ts`)
7. `[ ]` First git commit + public GitHub repo *(submission requirement, still open)*
8. `[ ]` Start the Vision server + bridge (Phase 2)

**BAND is proven end to end, agent to agent.** Phase 1 is closed. Nothing in the
architecture is unknown any more — the rest is building.

---

## Phase 0 — Base setup

- [x] Repo skeleton: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- [x] `shared/contract.ts` — message types, guards, phone masking (typecheck + helpers tested)
- [x] `@band-ai/sdk` 2.2.0 installed, Node 23.1.0 confirmed (needs ≥22.12)
- [x] Platform research written to `context/`
- [x] `vision/src`, `vision/public` folders (recreated 23 Nov after accidental delete)
- [ ] `git` first commit + public GitHub repo *(required for submission)*
- [x] Rename `BAND_ID` → `BAND_AGENT_ID` in `.env`
- [ ] Get **EDITH's agent UUID** from Member B → `EDITH_AGENT_ID`

## Phase 1 — BAND proven  ← **the gate for everything else**

- [x] Vision agent registered at app.band.ai (type: External) — creds are in `.env`
- [x] Second agent registered (`EDITH-stub`, `01b4437d-…`)
- [x] Room `9876ba1d-…` has both Vision and EDITH-stub
- [x] Echo agent script runs and connects — `scripts/band-echo.ts`, verified 23 Nov
- [x] **Human → agent**: posted from dashboard, agent echoed back (23 Nov)
- [x] **Agent → agent**: Vision posts, EDITH-stub's handler fires, valid
      `ResultMessage` returns with `session_id` intact — `scripts/band-a2a.ts`,
      verified 23 Nov (`npm run band:a2a`)
- [x] Confirm the 422 behaviour on a message with no mention — verified via
      `npm run band:a2a -- --no-mention`
- [x] **Learned:** the @mention arrives *inside* `content` — strip it before `JSON.parse`
- [x] **Groq-backed EDITH stub works** (`scripts/edith-stub.ts`) — human → stub →
      Groq → valid `ResultMessage` posted back. Verified 23 Nov.
- [x] **Learned:** account has no `llama-3.3-*`; using `openai/gpt-oss-120b` (~1.4s)
- [x] **Learned — unblocks the bridge:** an agent can post *outside a turn* with
      `agent.runtime.link.rest.createChatMessage(roomId, {content, mentions})`.
      `tools.sendMessage` only exists inside the adapter handler, which is no use
      to an HTTP route. [verified in `dist/rest.d.ts` and at runtime]
- [x] **Learned:** the room ID comes from the `room.joined` event at startup —
      no `BAND_ROOM_ID` needed, as decided.
- [x] **Learned — Vision must call this:** a handler that deliberately does not
      answer into the room must call **`tools.turn.settle()`**, or every turn is
      reported "ended its turn without replying". Vision's handler resolves an
      HTTP promise instead of replying, so it has exactly this shape.
- [x] **Learned:** the 422 is schema validation —
      `/message/mentions: Array length 0 is smaller than minItems: 1`.

> Agent-to-agent is the one that actually proves VI-VA's architecture.
> Doesn't need Member B — use two agents of your own.

## Phase 2 — Vision server

- [ ] Fastify server boots, serves `GET /`
- [ ] BAND agent embedded in the same process
- [ ] **The sync/async bridge** — `pendingBySession` map, timeout, cleanup
      *(design in `context/architecture.md` — the top risk in the PRD)*
      *(both halves now proven by `scripts/band-a2a.ts`: post outside a turn via
      `link.rest.createChatMessage`, match the reply by `session_id`)*
- [ ] `POST /tools/ask_edith` — takes `{session_id, user_said}`, returns `{say}`
- [ ] `GET /openapi.json` — the spec Lyzr reads
- [ ] `GET /log` — live BAND message log, phone masked (R4)
- [ ] Emergency-word check → "call 112", nothing booked (R13)
- [ ] Spoken-yes gate before book/reschedule/cancel (R8)
- [ ] Phone read-back digit by digit + 10-digit check (R9)
- [ ] Graceful answer when EDITH times out ("one moment")

## Phase 3 — Web page

- [ ] **Text box fallback first** (R2) — this is the insurance; voice can fail, demo can't
- [ ] Transcript view
- [ ] Live BAND log beside it (R4) — *this is what judges look at*
- [ ] Lyzr voice widget embedded (R1)
- [ ] Passcode or rate limit (R14, P1)

## Phase 4 — Lyzr voice

- [ ] Voice agent created in Agent Studio, **Realtime** engine, English
- [ ] Role / goal / instructions written (keep it dumb: speak `say`, invent nothing)
- [ ] Agent greets first
- [ ] Custom tool added from our `openapi.json`
- [ ] Tunnel up (`ngrok http 3000`) so Lyzr can reach the local server
- [ ] Tool call lands — confirmed in Vision's logs
- [ ] **Full chain**: voice → ask_edith → BAND → EDITH → back → spoken
- [ ] Note Lyzr's tool timeout, set ours below it

## Phase 5 — Deploy

- [ ] Dockerfile on `node:22`
- [ ] Vision server on Agent37, public HTTPS URL (R11)
- [ ] `Vision-demo` creds used there, never `Vision-local` (never both at once)
- [ ] Lyzr tool re-pointed at the Agent37 URL
- [ ] EDITH on Agent37 *(Member B)*
- [ ] End-to-end run on the public URL

## Phase 6 — Submission

- [ ] Public GitHub repo + README with architecture diagram
- [ ] Sponsor section: how BAND, Lyzr, Agent37, AdaL were each used
- [ ] "Problems faced" section *(both members)*
- [ ] 2-minute demo video, recorded with AdaL
- [ ] Rehearse 3× on the Agent37 URL
- [ ] Submit on HiDevs
- [ ] Fix PRD: SDK is **2.2.0**, not 2.0.1
- [ ] Say clearly in the demo that slot data is sample data

---

## Blocked / waiting

- `[!]` **EDITH agent UUID** — from Member B. No longer blocking: `EDITH_AGENT_ID`
  falls back to `B_AGENT_ID` (the stub), so Vision can be built against it today.
- `[!]` **EDITH itself** — Venkat chose to wait rather than mock it, so the full chain
  stays unproven until it lands. A throwaway mock is ~30 lines if that gets tight.
- `[ ]` Lyzr web-embed method — unconfirmed, see `context/open-questions.md`

## Deferred / cut

- `[-]` **Finch** (R15, P2) — needs a crypto wallet, no P0 depends on it
- `[-]` Movie booking, browser automation — cut 23 Nov
- `[-]` npm package / `npx` install — cut 23 Nov

## If we fall behind

Cut in this order (from the PRD): **Finch → rate limit → cancel → reschedule.**
Book and look up are never cut.

---

## Requirement coverage

| | Requirement | Phase | Status |
| --- | --- | --- | --- |
| R1 | Voice in/out via Lyzr | 4 | [ ] |
| R2 | Text box fallback | 3 | [ ] |
| R3 | Every turn to EDITH with session ID | 2 | [ ] |
| R4 | All messages via BAND, logged, phone masked | 2,3 | [ ] |
| R5 | Ask which branch | — | EDITH |
| R6 | Timing verified in code | — | EDITH |
| R7 | Up to 3 alternatives | — | EDITH |
| R8 | Spoken yes before any write | 2 | [ ] |
| R9 | Name/phone only in confirm, read back | 2 | [x] helpers, [ ] wired |
| R10 | One-transaction booking | — | EDITH |
| R11 | Both on Agent37, Node 22.12+ | 5 | [ ] |
| R12 | Lookup / reschedule / cancel (P1) | — | EDITH |
| R13 | Escalation (P1) | 2 | [ ] |
| R14 | Passcode / rate limit (P1) | 3 | [ ] |
| R15 | Finch (P2) | — | [-] cut |
