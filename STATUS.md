# VI-VA — status & how to test

Written 23 Nov. Deadline **24 Nov, 10 PM IST** (aim 6 PM).
Companion to `TASKS.md` (the full tracker) — this is the short version plus the
test recipes.

---

## 1. What is done

| Phase | Thing | State |
| --- | --- | --- |
| 0 | Repo base, `tsconfig`, `.env.example`, typecheck clean | done |
| 0 | `shared/contract.ts` — the Vision↔EDITH message agreement, phone masking, redaction | done |
| 1 | **BAND proven agent-to-agent** — Vision posts, EDITH-stub answers, `session_id` survives | done |
| 1 | Learned & handled: posting *outside* a turn, `tools.turn.settle()`, 422 on no-mention, mention text arriving inside `content` | done |
| 2 | **The sync/async bridge** (`edith-link.ts`) — Lyzr's one blocking HTTP call parked and matched to BAND's later reply by `session_id` | done |
| 2 | Timeout → a *sayable* holding reply, never an error. Late replies dropped silently | done |
| 2 | `FakeEdithLink` — same seam, no network. `VISION_FAKE_EDITH=1` runs everything with BAND switched off | done |
| 2 | `POST /tools/ask_edith`, `GET /healthz`, `GET /log`, `GET /openapi.json`, `GET /` | done |
| 2 | Emergency short-circuit — "chest pain" never reaches EDITH (R13) | done |
| 2 | Intent fallback when Lyzr sends none | done |
| 2 | **Spoken-yes gate (R8)** and **phone read-back digit by digit (R9)** — verified on the wire | done |
| 3 | **Web page** — transcript + live BAND log side by side, phone masked, sample buttons | done |

Five commits on `main`. `npm run typecheck` passes.

**The hard part is behind us.** The bridge works over real BAND, end to end,
including a complete booking.

## 2. What is left

| Priority | Thing | Whose |
| --- | --- | --- |
| **P0** | Public GitHub repo + push (submission requirement) | **Venkat** |
| **P0** | Lyzr voice: Studio agent, prompt, custom tool from `openapi.json`, tunnel, full voice chain (R1) | mine + your Lyzr account |
| **P0** | Deploy: Dockerfile on `node:22`, Agent37, re-point Lyzr, `Vision-demo` creds (R11) | mine |
| **P0** | README with architecture diagram + sponsor section + "problems faced" | mine |
| **P0** | 2-minute demo video, recorded with AdaL | both |
| **P0** | EDITH itself — SQLite, slots, timing rules, alternatives | **Member B** |
| P1 | Passcode / rate limit (R14) | mine |
| P1 | Fix the PRD: SDK is 2.2.0 not 2.0.1; the "~3s per turn" target | mine |
| — | Tell Member B that `ConfirmMessage.slot_id` is now **optional** | **Venkat** |

Three answers still needed from **Lyzr Studio**: its tool-call timeout, how the
web embed works, and what shape its custom-tool importer wants.

---

## 3. Testing in Postman

Postman tests **Vision's HTTP skin** — the exact endpoint Lyzr will call. Fast
loop, good for conversation logic and for timing.

> **A ready-made collection is in `postman/`** — 23 requests, 68 assertions,
> plus two environment files for the fake and for BAND. See `postman/README.md`.
> Everything below is the manual version of what that collection does.

### Setup

Start the server:

```powershell
$env:VISION_FAKE_EDITH=1; npm run dev:vision   # no BAND, 150ms replies
npm run dev:vision                             # real BAND (stub must be running)
```

In Postman: **Import → Link →** `http://localhost:3000/openapi.json`. It builds
the request for you, already shaped correctly. Then make an environment with
`base = http://localhost:3000` and an empty `session_id`.

### The one request that matters

```
POST {{base}}/tools/ask_edith
Content-Type: application/json

{
  "user_said": "Book an appointment at Apollo",
  "session_id": "{{session_id}}"
}
```

Put this in **Scripts → Post-response** so the session carries across calls —
without it every turn starts a fresh conversation and nothing ever progresses:

```js
const r = pm.response.json();
pm.environment.set("session_id", r.session_id);
pm.test("has a sayable reply", () => pm.expect(r.say).to.be.a("string"));
pm.test("under budget", () => pm.expect(pm.response.responseTime).to.be.below(12000));
```

On the **first** call remove the `session_id` line (or clear the variable) —
Vision mints one and hands it back.

### Where the session id comes from when there is no chat

You do not need one to start. Either:

1. **Omit the field.** Send just `{"user_said": "..."}`. Vision mints one
   (`s-4f2a`) and returns it. Copy it into the calls that follow.
2. **Make one up.** Vision never validates it — the schema only caps it at 64
   characters — so `"session_id": "venkat-1"` works from the very first
   request. No script, no copying. Easiest way to test by hand.

State is keyed by that id, so reusing `venkat-1` mid-conversation *resumes*
where you left off. Bump it to `venkat-2` to start clean. After a completed
booking the session is deleted, so reuse is safe there.

### Replaying a conversation, keeping every response

- **`GET {{base}}/log?since=0`** returns the whole buffer, oldest first — both
  directions, redacted, up to 200 entries. Nothing is lost between calls.
  `?since=N` gives only what is newer than seq `N`; that is what the page polls.
- **Postman Collection Runner** is the iteration loop: one request per turn, in
  order, run with one click. Every response of the run is kept side by side and
  past runs stay under the Runs tab, so two runs can be compared.
- Put this **pre-request** script on the *first* request only, so each run gets
  a fresh session instead of resuming the last one:

  ```js
  pm.collectionVariables.set("session_id", "run-" + Date.now());
  ```

  Every request body then uses `"session_id": "{{session_id}}"` and you never
  touch it again. This also gives each run its own clean slot in `/log`.

### Verifying that the questions actually iterate

Vision holds **no booking state** by design — EDITH owns the session and
decides what is still missing. So "does it ask which hospital, then which
branch, then what time, until it has everything" is a test of **EDITH**, not of
Vision. Split it:

| What you are verifying | Test against |
| --- | --- |
| Vision carries `session_id` faithfully, gates on a spoken yes, reads the phone back, redacts the log | the fake |
| The question-by-question flow — asks branch, asks time, iterates to complete | the fake today, **Member B's EDITH** when it lands |
| Agent-to-agent transport and real latency | BAND + the stub |

Run both servers at once and point Postman at whichever you are testing:

```powershell
npm run dev:vision                                              # :3000, real BAND
$env:VISION_FAKE_EDITH=1; $env:PORT=3001; npx tsx vision/src/server.ts   # :3001, fake
```

A correct seven-turn run against the fake, verified 23 Nov with
`session_id: "venkat-9"` on every call and no chat UI involved:

```
Apollo            -> needs_choice  Which one - Greams Road, OMR, Vanagaram?
the OMR one       -> needs_info    What day and time suit you?
tomorrow evening  -> needs_confirm Dr. Anand is free at 6 PM ... Shall I confirm?
yes               -> needs_info    What name should I book it under?
my name is Venkat -> needs_info    Thank you, Venkat. Ten digit mobile number?
+91 9876543210    -> needs_confirm Let me read that back: 9 8 7 6 5 4 3 2 1 0.
yes               -> booked        Booking reference V V 4 8 2 1.
```

Omit `session_id` and the same three turns return three *different* ids and
restart from the beginning each time. That is the mechanism working, not a bug.

### The script to walk, in order

| Say | Expect `status` |
| --- | --- |
| `Book an appointment at Apollo` | `needs_choice` + three branches |
| `the OMR one` | `needs_info` — day/time |
| `tomorrow evening` | `needs_confirm` + a slot |
| `yes` | `needs_info` — "what name?" |
| `my name is Venkat` | `needs_info` — "ten digit mobile?" |
| `+91 9876543210` | `needs_confirm` — digits read back |
| `yes` | `booked` + reference |

Worth doing deliberately:

- **`My father has chest pain`** → `escalated` in about a millisecond, and
  **nothing** appears in `/log`. It never reached EDITH. That is R13.
- **`no`** at the confirm step → nothing is written.
- **`actually make it Fortis Adyar`** mid-confirm → forwarded to EDITH, not
  trapped in the handshake.
- **`{"user_said": ""}`** → 400 from Fastify's schema.
- `GET {{base}}/log?since=0` → the confirm line must show `"name":"<name>"` and
  `"phone":"98xxxxxx10"`. The real number must never be in the log.

### Measuring with Postman

The response pane's **Time** is the full `ask_edith` round trip. For a real
number use the **Collection Runner**: 10 iterations in fake mode, 10 against
BAND, compare the averages. That gap *is* the BAND cost.

### What Postman cannot tell you

In fake mode **nothing crosses BAND**. A green Postman run proves the
conversation logic and says nothing at all about the multi-agent architecture.

---

## 4. Testing on BAND

This is the one that proves the thing the hackathon is judging.

### Two terminals

```powershell
npm run edith:stub     # terminal 1 — stands in for Member B's EDITH
npm run dev:vision     # terminal 2 — Vision, real BAND
```

Then drive it from Postman or from `http://localhost:3000`. Every turn now does
a real two-agent hop.

### The quick proof, no server needed

```powershell
npm run band:a2a                  # Vision posts -> EDITH-stub answers -> valid ResultMessage
npm run band:a2a -- --no-mention  # 422: BAND requires a mention
```

### Three places to watch

1. **The page's right-hand column** (`http://localhost:3000`) — every BAND hop,
   colour-coded by direction, phone masked. Built for the camera.
2. **The BAND dashboard**, room `9876ba1d-…` — the messages as BAND itself sees
   them, both agents listed as members. This is the independent evidence.
3. **`GET /log?since=0`** — the same data as JSON, for scripting and assertions.

### Rules that bite

- Never run the same BAND agent twice at once. `Vision-local` on the laptop,
  `Vision-demo` on Agent37 — separate registrations.
- Closing a terminal can leave an orphaned `node` still holding the BAND
  connection, and you end up testing a stale server. This has already caught us
  once. Clean up with:

  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*VI-VA*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

### The stub has no memory — do not test the flow against it

`scripts/edith-stub.ts` sends Groq **only the current sentence**. There is no
per-session history. It echoes `session_id` back correctly, so message matching
works and the BAND hop is proven — but it forgets everything between turns.
Verified 23 Nov: turn 1 asked which Apollo branch, turn 2 accepted "the OMR
one", turn 3 asked for the branch *again*.

It is a **transport** double, not a **memory** double. Use it to prove
agent-to-agent and to measure latency. Use the fake, or Member B's real EDITH,
to verify that the questions iterate correctly. Never put the stub in front of
a judge for the conversational part.

### Which is effective for multi-agent?

**BAND, and only BAND.** Use the three for different jobs:

| | Postman + fake | Postman + BAND | BAND dashboard / `/log` |
| --- | --- | --- | --- |
| Conversation logic, R8/R9, 400s | **best** — 150ms loop | works, slow | no |
| Real latency numbers | no | **best** | no |
| Proves agent-to-agent | **no** | yes, indirectly | **best — this is the evidence** |

So: build against the fake, verify against BAND, **demo from the dashboard and
the log panel**.

---

## 5. Latency — measured, and what can actually be improved

Measured 23 Nov on the real chain. Full detail in `context/latency.md`.

| Leg | Time |
| --- | --- |
| `POST /tools/ask_edith` end to end | **5.3s** typical |
| Worst seen in 4 calls | **12.3s** |
| Groq call inside the stub | 1.6–1.9s |
| **BAND round trip, inferred** | **≈3.5s** |
| Fake EDITH, no network | 150ms |

### Where the time actually goes

About **3.5s is BAND** — two agents, two network hops. That is architectural.
Member B's EDITH answers from SQLite in milliseconds, so swapping the stub for
the real thing removes the ~1.7s Groq leg and leaves **~3.5s as the floor**. No
amount of EDITH tuning touches it.

### What is worth trying, best value first

1. **Hide it rather than fix it.** Have the Lyzr agent say a filler line —
   "Let me check that for you…" — the instant it calls the tool. 3.5s of silence
   feels broken; 3.5s of "checking" feels normal. Biggest perceived win, and it
   costs one line of prompt.
2. **Answer more turns without BAND at all.** Already true of the emergency path
   (~1ms) and of name / phone / read-back inside the confirm flow — those are
   Vision's business, not EDITH's. Roughly a third of a booking conversation
   never touches the wire. Worth saying out loud in the demo.
3. **Co-locate after deploy.** Both agents on Agent37 instead of a home
   connection may cut the hop. **Unmeasured** — re-measure at CP4 and only then
   claim anything.
4. **Instrument the hop.** Add an elapsed-ms field to each `/log` entry (post →
   reply delta) so we show the split instead of inferring it. About 15 lines.
   Say the word and I will do it.
5. **Keep the timeout honest.** `EDITH_TIMEOUT_MS=12000`, chosen to clear the
   12.3s outlier. It must stay **below Lyzr's own tool-call timeout** — which we
   still do not know, and which is the most important open question on the board.

### Two things to correct before submission

- The PRD claims "reply within about 3 seconds per turn". Not achievable over
  BAND. Change it to ~4s, or drop the number.
- The PRD says `@band-ai/sdk` 2.0.1. It is **2.2.0**.
