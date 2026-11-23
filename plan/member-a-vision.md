# Member A — Vision (Venkat)

Your checklist. The shared spine, checkpoints and cut order are in `../PLAN.md`.
Design you are building to: `../context/vision-design.md` and
`../context/architecture.md`.

---

## What you own

**Vision is a bridge between two incompatible shapes.** Lyzr calls you
synchronously — one HTTP request, one blocking response. EDITH answers
asynchronously — a BAND message that arrives later, in a different callback,
with nothing linking it to the request that caused it.

Everything hard about your job is that mismatch. Everything else is plumbing.

| You own | You never do |
| --- | --- |
| `vision/` — the Fastify server, the web page | Hold booking state |
| The BAND agent on the Vision side | Decide whether a slot is free |
| The Lyzr voice agent — prompt, voice, custom tool | Cache a detail "just for this turn" |
| The 2-minute demo video | Touch `edith/` |
| Deploying the Vision server to Agent37 | Change `shared/contract.ts` silently |

**The rule that keeps the demo coherent:** when you are tempted to remember
something the user said, don't. EDITH owns it. One source of truth.

---

## Tonight — 23 Nov, 19:00 to 23:00

### 1. Prove the agent-to-agent hop *(this is the gate)*

- [ ] Run `band-echo` and `edith-stub` **at the same time**, two terminals
- [ ] One agent @mentions the other; confirm the other's handler fires
- [ ] Confirm the 422 behaviour on a message with **no** mention — know the
      failure mode before it bites you at 03:00
- [ ] Note it in `TASKS.md`

This is the last unproven thing in the architecture. Everything else is work you
already know how to do.

### 2. Vision server skeleton

- [ ] Fastify boots, `GET /` serves something
- [ ] BAND agent running inside the same process
- [ ] **The bridge** — `pendingBySession` map, resolve on reply, timeout at ~8s,
      cleanup on *both* paths, late replies dropped silently
- [ ] `POST /tools/ask_edith` — takes `{session_id, user_said}`, returns `{say}`
- [ ] `GET /log` — the BAND traffic, phone masked via `redactForLog`

Build it behind the `EdithLink` interface with two adapters — `BandEdithLink`
and `FakeEdithLink`. The fake one is what lets you work on the page when BAND or
Member B is down, which tomorrow morning you will be grateful for.

### 3. Housekeeping that is a submission requirement

- [ ] **First git commit. Public GitHub repo.** Still not done. Do it tonight.

### 4. Two decisions you still owe yourself

- **Who extracts `intent` and `details`?** Recommendation: let Lyzr fill them as
  optional tool parameters and let EDITH read `user_said` as the real source. A
  second LLM hop inside the endpoint costs ~1.4s against a 3s budget.
- **What is a session?** Recommendation: one conversation = one session, and
  EDITH resets its state when a booking completes. Simpler to explain on video.

---

## Tomorrow morning — 06:00 to 09:00 (CP2)

- [ ] **Text box page first.** This is the insurance. Voice can fail; the demo
      cannot.
- [ ] Transcript view
- [ ] **The BAND log, rendered large and beside the transcript** — this is what
      judges actually look at, and it is the visible proof of the highest-weight
      criterion. Treat it as the hero of the page, not a sidebar.
- [ ] Emergency words → "call 112", nothing sent to EDITH (R13)
- [ ] Spoken-yes gate before book / reschedule / cancel (R8)
- [ ] Phone read-back digit by digit, 10-digit check (R9) — helpers already exist
      in `shared/contract.ts`
- [ ] Timeout answer that is sayable: "One moment, still checking."

**CP2 test: type "book at Apollo" and complete a booking with no microphone.**

---

## Tomorrow midday — 09:00 to 12:00 (CP3)

- [ ] `GET /openapi.json` — the spec Lyzr reads
- [ ] Lyzr voice agent in Agent Studio: **Realtime** engine, English
- [ ] Prompt: keep it dumb. Speak the `say` field. Invent nothing. Never state a
      time or a doctor that did not come from the tool.
- [ ] Agent greets first
- [ ] Custom tool added from our `openapi.json`
- [ ] `ngrok http 3000` so Lyzr can reach the local server
- [ ] Confirm the tool call lands in Vision's logs
- [ ] **Find Lyzr's tool-call timeout and set ours below it** — still an open
      question, and it decides whether the chain works or errors out
- [ ] Full chain: voice → `ask_edith` → BAND → EDITH → back → spoken

**Unknown to resolve early:** how a Lyzr voice agent embeds in a web page. The
docs cover phone deployment; there is a Voice WebSocket path (24kHz mono PCM16)
that looks like the route. If it is not working by 12:00, the text page is the
demo — take that call on time.

---

## Tomorrow afternoon — 12:00 to 16:30 (CP4, CP5)

- [ ] Dockerfile on `node:22`
- [ ] Vision server on Agent37, public HTTPS URL
- [ ] **`Vision-demo` creds there — never the same BAND agent running in two
      places at once**
- [ ] Re-point the Lyzr tool at the Agent37 URL
- [ ] Passcode or rate limit if time allows (R14, P1 — first thing to cut)
- [ ] Rehearse three times on the public URL
- [ ] **Record the 2-minute video with AdaL**

### Video running order

| Time | What |
| --- | --- |
| 0:00–0:15 | The problem in one line. Open the page. |
| 0:15–1:05 | Book: "Apollo" → which branch → slot taken → **three alternatives** → pick → name and phone read back → booked with an ID. **BAND log visible throughout.** |
| 1:05–1:35 | "When is my appointment? Move it to Friday evening." |
| 1:35–1:50 | "I want to talk to a person." |
| 1:50–2:00 | Architecture picture, sponsor list. |

Say these three lines somewhere in it:

1. "EDITH never invents a slot — availability is SQL, not the model."
2. "Lyzr is synchronous, BAND is asynchronous. Vision joins them."
3. "Slot data is sample data."

---

## Your failure modes, named in advance

| If this happens | Do this |
| --- | --- |
| Lyzr can't reach the local server | Record against Agent37 instead of the tunnel |
| Lyzr's tool call times out | Your timeout must fire first with something sayable |
| Voice never stabilises | The text page is the demo. Call it by 12:00. |
| Member B doesn't land | Keep running against the mock. Nothing in Vision changes. |
| Both BAND agents run at once | Stop the local one. `Vision-local` and `Vision-demo` are never both live. |
| You start holding booking state | Stop. That is EDITH's. |
