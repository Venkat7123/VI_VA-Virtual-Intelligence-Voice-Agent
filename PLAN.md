# VI-VA — The Plan

**Hard stop: Tue 24 Nov 2026, 22:00 IST. Target submit: 18:00.**
Written 23 Nov ~19:30. Two people, ~23 hours to target.

This file is the spine. Each member also has their own checklist:

- Member A (Venkat) → `plan/member-a-vision.md`
- Member B → `plan/member-b-edith.md`

Scope and priorities come from `VI-VA — Hackathon PRD.md`.
Positioning and the "why this and not that" reasoning is in
`context/path-decision.md`.

---

## 0. Three decisions to make before work starts tonight

Nothing below is blocked on these, but two tasks change shape depending on the
answers. **Decide by 20:00 and write the answer here.**

| # | Decision | Recommendation | Answer |
| --- | --- | --- | --- |
| D1 | Build a mock EDITH tonight, or wait for Member B? | **Build it.** It unblocks everything and is thrown away for free if B lands. | _____ |
| D2 | Phone-as-identity opening (returning caller recognised by number)? | **In.** ~45 min, mostly EDITH, and it is the demo's differentiator. | _____ |
| D3 | Promote lookup / reschedule / cancel / escalate from P1 to P0? | **Yes.** The problem statement names all four verbs. | _____ |

---

## 1. The split

Vision talks. EDITH decides. They meet at `shared/contract.ts` and nowhere else.

| | **Member A — Vision** | **Member B — EDITH** |
| --- | --- | --- |
| Owns | `vision/`, the web page, Lyzr, the video | `edith/`, SQLite, the booking rules |
| Core job | Carry speech in and out, and bridge sync↔async | Own booking state and decide availability |
| Never does | Hold booking state. Decide a slot. Invent availability. | Talk to the user. Touch `vision/`. |
| Deploys | Vision server on Agent37 | EDITH on Agent37 |
| Sponsors | BAND (Vision side), Lyzr, AdaL | BAND (EDITH side), Agent37 |
| Submission | Records the 2-minute video | Writes the README + sponsor section |

**The contract is frozen.** `shared/contract.ts` already defines the message
types, intents, statuses and phone helpers. Neither member changes it without
telling the other in the same minute. A contract change at 03:00 is how teams
lose hackathons.

---

## 2. What must be covered

Mapped to the PRD's requirement IDs. **P0 = the demo is broken without it.**

### Vision (Member A)

| | Item | Priority |
| --- | --- | --- |
| R1 | Voice in and out, English, via Lyzr | P0 |
| R2 | Text box fallback on the same page | **P0 — this is the insurance** |
| R3 | Every turn sent to EDITH with a session ID | P0 |
| R4 | Live BAND message log on the page, phone masked | P0 |
| R8 | Spoken yes before any book / reschedule / cancel | P0 |
| R9 | Name and phone only in the confirm; phone read back digit by digit | P0 |
| R13 | Emergency words → "call 112", nothing booked | P0 *(was P1)* |
| — | Graceful timeout answer ("one moment, still checking") | P0 |
| R14 | Passcode or rate limit on the public URL | P1 |

### EDITH (Member B)

| | Item | Priority |
| --- | --- | --- |
| R3 | Owns `collected` / `missing` per session | P0 |
| R5 | Ask "which branch?" when a chain has more than one | P0 |
| R6 | Verify timing in code: hours, shift, past time, holiday | P0 |
| R7 | Up to three alternatives when a slot is gone | P0 |
| R10 | Book in one transaction, no double booking | P0 |
| R12 | Look up, reschedule, cancel | **P0 if D3 = yes** |
| R13 | Escalation recorded | P0 *(was P1)* |
| D2 | Returning caller recognised by phone number | P1 *(if D2 = yes)* |
| R15 | Finch skill | **cut** |

### Both

| | Item | Priority |
| --- | --- | --- |
| R11 | Both agents on Agent37, Node 22.12+, public HTTPS URL | P0 |
| — | Public GitHub repo, first commit *(still not done)* | P0 |
| — | 2-minute demo video | P0 |
| — | README with architecture diagram + sponsor section | P0 |
| — | "Problems faced" section, both members | P0 |

---

## 3. Checkpoints

Six gates. Each has a time, a single yes/no test, and what to do if it is missed.
**A missed gate is not a reason to keep pushing — it is the signal to take the
fallback and move on.**

### CP1 — The spine is alive · **23 Nov, 23:00**

| Must be true | Who | Test |
| --- | --- | --- |
| Agent-to-agent BAND hop proven | A | Two agents running at once; one mentions the other, the other's handler fires |
| Vision server boots, serves `GET /` | A | Browser shows a page |
| `POST /tools/ask_edith` returns a `say` | A | `curl` it, get JSON back |
| EDITH (mock or real) answers one turn over BAND | A or B | A full round trip appears in the terminal |
| First git commit pushed, repo public | A | The GitHub URL opens |

**If missed:** drop the BAND hop as a *live* requirement and keep going with the
mock in-process. Losing CP1 entirely means the architecture is unproven — this
is the one gate worth staying up for.

### CP2 — Text chain end to end · **24 Nov, 09:00**

| Must be true | Who | Test |
| --- | --- | --- |
| Type "book at Apollo" in the text box → EDITH asks which branch | Both | One browser, no voice |
| Full booking completes and returns a booking ID | Both | Booking appears in the DB |
| Slot taken → three alternatives offered | B | Force a taken slot and watch |
| BAND log renders on the page, phone masked | A | The log shows both directions |
| Emergency words → 112, nothing booked | A | Say "chest pain" |

**If missed:** this is the real demo. Everything after CP2 is upgrade. Cut voice
before cutting this.

### CP3 — Voice works · **24 Nov, 12:00**

| Must be true | Who | Test |
| --- | --- | --- |
| Lyzr voice agent created, Realtime, English | A | It greets you |
| Custom tool wired from our `openapi.json` | A | Tool call lands in Vision's logs |
| Tunnel up so Lyzr can reach the local server | A | ngrok URL responds |
| Spoken booking completes end to end | A | You talk, it books |

**If missed:** record the video against the **text** page and say plainly that
voice is wired but unstable. A working text demo beats a broken voice demo.

### CP4 — Deployed · **24 Nov, 14:30**

| Must be true | Who | Test |
| --- | --- | --- |
| Vision server on Agent37, public HTTPS | A | Open the URL from a phone |
| EDITH on Agent37 | B | It answers from the deployed Vision |
| `Vision-demo` creds in use, never `Vision-local` at the same time | A | Local instance stopped |
| Lyzr tool re-pointed at the Agent37 URL | A | A spoken booking works on the public URL |

**If missed:** record against localhost + tunnel and submit the GitHub repo with
run instructions. Note it honestly in "Problems faced".

### CP5 — Rehearsed and recorded · **24 Nov, 16:30**

| Must be true | Who | Test |
| --- | --- | --- |
| Three clean run-throughs on the demo URL | Both | No surprises on the third |
| 2-minute video recorded with AdaL | A | The file exists |
| README, architecture diagram, sponsor section, problems faced | B | Someone else can read it and understand |

**If missed:** record one take and ship it. An unpolished video submitted beats a
perfect video at 22:05.

### CP6 — Submitted · **24 Nov, 18:00** (hard stop 22:00)

Submission checklist in section 5. **Submit at 18:00 even if P1 items are
unfinished.** The four hours after are for fixing what you notice, then
re-submitting if the form allows.

---

## 4. Timeline

| When | Member A — Vision | Member B — EDITH |
| --- | --- | --- |
| **23 Nov 19:00–21:00** | Agent-to-agent hop; Fastify boots; the bridge | SQLite schema + seed data (3 chains, 6 branches, 15 doctors, 2 weeks of slots) |
| **21:00–23:00** | `ask_edith`, `/log`, text box page | Session state, search, timing rules |
| **23:00** | **CP1** | **CP1** |
| **23:00–00:00** | First commit, repo public | Alternatives logic |
| *00:00–06:00* | *sleep — both* | *sleep — both* |
| **24 Nov 06:00–09:00** | Wire the page properly, emergency + confirm gates | Book in one transaction; lookup / reschedule / cancel |
| **09:00** | **CP2 — text chain works** | **CP2** |
| **09:00–12:00** | Lyzr agent, openapi, tunnel, voice | Escalation; returning-caller lookup (D2); bookings view |
| **12:00** | **CP3 — voice works** | **CP3** |
| **12:00–14:30** | Dockerfile, Agent37 deploy, re-point Lyzr | Deploy EDITH on Agent37 |
| **14:30** | **CP4 — deployed** | **CP4** |
| **14:30–16:30** | Rehearse ×3, record the video | README, architecture diagram, sponsor section |
| **16:30** | **CP5** | **CP5** |
| **16:30–18:00** | Final pass | Submission form |
| **18:00** | **CP6 — SUBMIT** | **CP6 — SUBMIT** |
| **18:00–22:00** | Buffer. Fix, re-record, re-submit only if clearly better. | Buffer. |

**Syncs:** 23:00 tonight (CP1), 09:00, 12:00, 14:30 tomorrow. Fifteen minutes
each, standing: what works, what is blocked, what we cut.

---

## 5. What must exist at the end

The definition of done. Nothing here is optional.

- [ ] **Public GitHub repo** with all code and a README
- [ ] **README** containing: what VI-VA is, the architecture diagram, how to run
      it, how each sponsor was used, problems faced
- [ ] **Public demo URL on Agent37** — voice, with the text fallback working
- [ ] **2-minute demo video** showing: book → which branch → slot taken →
      alternatives → confirm → booking ID, with the BAND log visible; then
      lookup + reschedule; then escalate
- [ ] **Sponsor section**: BAND, Lyzr, Agent37, AdaL — what each actually did
- [ ] **"Problems faced"** — written by both members
- [ ] **Submitted on the HiDevs form**
- [ ] Said out loud in the video: **slot data is sample data**
- [ ] PRD corrected: BAND SDK is **2.2.0**, not 2.0.1

**Three things to say in the video, because they are what score:**

1. "EDITH never invents a slot — availability is SQL, not the model."
2. "Lyzr is synchronous, BAND is asynchronous. Here is how Vision joins them."
3. "The slot you wanted is gone? That is not an error, it is three alternatives."

---

## 6. If things go wrong

**Cut in this order. Do not improvise a new order at 02:00.**

1. Finch *(already cut)*
2. Passcode / rate limit (R14)
3. Returning-caller opening (D2)
4. Cancel
5. Reschedule
6. Voice — fall back to the text page

**Never cut:** book, look up, the BAND log, the spoken-yes gate, emergency → 112.

**If Member B does not land in time:** Member A continues against the mock EDITH
for the whole demo. The mock speaks the same contract, so nothing in Vision
changes. Say so honestly in "Problems faced" — judges respect a team that shipped
around a gap more than one that shipped nothing.

**If Member A's voice chain never works:** the text page *is* the demo. The
problem statement asks for two agents collaborating, and the BAND log proves that
with or without a microphone.

---

## 7. Rules for the next 24 hours

1. **The answer to "should we also…" is no.** No second domain, no real
   telephony, no Hindi, no extra sponsor.
2. **Stay out of each other's folders.** A touches `vision/`, B touches `edith/`,
   `shared/` changes get announced out loud.
3. **Commit often.** The repo being public is a submission requirement and it is
   still not done.
4. **Verify before moving on.** `npm run typecheck` must pass at every checkpoint.
5. **Test the other person's part once per sync.** You find their bugs; they find
   yours.
6. **18:00 is the submit time, not 22:00.** The last four hours are insurance, not
   working time.
