# VI-VA — Hackathon PRD

## Overview

VI-VA is a voice assistant that books hospital appointments: you speak, and two agents work together to find a slot and book it. **Vision** handles speech and the conversation, and serves the web page. **EDITH** owns the booking: it checks hospitals, doctors and slots in code, tracks what is still missing, and books only after you confirm. The two agents talk through BAND. The same Node server runs on a laptop for the demo video and on Agent37 for the public demo URL.

**Hackathon:** Diwali Festiverse Agent-to-Agent Hackathon, India Edition (HiDevs), Voice track — "Listen & Act". Submission closes 24 Nov 2026, 10:00 PM IST; top 10 demo live at OJone, Bengaluru on 28 Nov.

**Name.** VA = Voice Agent. Options for VI:

- **Virtual Intelligence** (chosen) — "VI-VA: Virtual Intelligence Voice Agent". Reads cleanly and says what it is.
- **Vision Interface** — ties the name to the Vision agent the user talks to.
- **Voice Intelligence** — simple, but repeats "voice".

VI-VA also reads as *viva* ("long live"), which suits a festival launch.

## What changed on 23 Nov

The scope is narrower and the design firmer, so VI-VA ships by the 24 Nov deadline. Every section below reflects these changes.

| Area | Before (20 Nov) | Now (23 Nov) | Why |
| --- | --- | --- | --- |
| Scope | Hospital booking + District movie booking | Hospital only: book, look up, reschedule or cancel, escalate | Browser automation was the riskiest part; the four actions match the Voice track |
| Install | `npx vi-va` npm package opening a local panel | No npm package. One Node server serves the web page and talks to BAND | Less to build; npm was never required |
| Where it runs | Vision on the laptop, EDITH in the cloud | Same code locally (for the video) and on Agent37 (for the demo URL) | One codebase, a public demo URL |
| Voice | Sarvam AI or browser speech | Lyzr voice agent, English | Already set up; extra Lyzr use |
| Booking state | Vision collected details, EDITH checked them | EDITH owns the state (collected, missing); Vision handles speech and conversation | One source of truth |
| Personal data | Asked during the flow | Name and phone sent only in the final confirm message | Less personal data in messages |
| EDITH | Lyzr agent with tools | Code-driven for slots and bookings | The demo can't invent availability |
| Runtime | Node 20+ | Node 22.12+ (BAND SDK), locally and on Agent37 | BAND needs it |

## Problem, goals and non-goals

Booking a doctor or a movie still means opening an app, searching, comparing slots and filling forms. When the slot you want is gone, you start over. Phone receptionists are busy, and few booking apps understand Hindi or Hinglish speech.

**Goals for the hackathon**

1. One voice conversation books a hospital appointment end to end: pick the branch, check timing, offer alternatives, confirm.
2. The same conversation can look up, reschedule or cancel a booking, and escalate when needed — the four actions the Voice track names.
3. Vision and EDITH visibly talk through BAND at every step.
4. EDITH never invents availability: slots and bookings come from code and the database.
5. Real use of BAND, Lyzr, Agent37 and AdaL (Finch if time allows).
6. A public demo URL on Agent37 that judges can try.

**Non-goals**

- Movie booking and any browser automation (dropped 23 Nov).
- An npm package or `npx` install (dropped 23 Nov).
- Real hospital integrations. Slot data is sample data shaped like real branches.
- Taking payment, mobile apps, user accounts.

## The two agents

Vision talks; EDITH decides. Vision never holds booking state, and EDITH never talks to the user.

|  | Vision | EDITH |
| --- | --- | --- |
| Runs as | One Node server: serves the web page and is a BAND agent. Local for the video, Agent37 for the demo URL | A BAND agent in code, with the booking database, on Agent37 |
| Built with | TypeScript, BAND SDK, Lyzr voice agent (English) | TypeScript, BAND SDK, SQLite |
| Talks to user | Yes: listens, speaks, asks EDITH's questions, gets a spoken yes | Never directly |
| Main jobs | Speech and conversation; passes every user turn to EDITH with a session ID; reads numbers back | Owns booking state per session (collected, missing); search, timing checks, alternatives, book, look up, reschedule, cancel, escalate |
| Decides availability | Never | Always, from the database (code, not an LLM) |
| Sponsors | BAND, Lyzr, AdaL, Agent37 (hosting) | BAND, Agent37, Finch (optional) |

## User flows

**Flow A — hospital appointment (core)**

1. User: "Book an appointment at Apollo Hospital."
2. Vision passes the turn to EDITH with a session ID. EDITH records the chain, sees several branches, and returns them with what is still missing.
3. Vision: "Which Apollo — Greams Road, OMR or Vanagaram?" User: "OMR."
4. EDITH keeps asking for missing details (problem or doctor, day, time) through Vision, one at a time.
5. EDITH verifies timing in code: branch open, doctor on shift, time not in the past, not a holiday.
6. Slot free → EDITH returns the exact slot ID. Vision: "Dr. X at 5 PM tomorrow at Apollo OMR. Shall I confirm?"
7. User says yes and gives name and phone. Vision reads the phone back digit by digit, then sends the confirm message with slot ID, name and phone.
8. EDITH re-checks the slot and books it in one database transaction, then returns a booking ID. Vision reads it back.
9. Slot taken at any point → EDITH returns up to three alternatives: later the same day, the next day, the nearest branch.
10. Emergency words → Vision tells the user to call 112; EDITH logs an escalation; nothing is booked.

**Flow B — look up, reschedule, cancel, escalate**

1. "When is my appointment?" → Vision asks for the booking ID or phone; EDITH returns the booking; Vision reads it.
2. "Move it to Friday evening" → EDITH finds free slots, Vision offers them, the user confirms, EDITH moves the booking in one transaction.
3. "Cancel it" → Vision confirms once; EDITH frees the slot.
4. "I want to talk to a person" → EDITH records an escalation with the session details; Vision says the hospital will call back.

## Architecture

&#91;embedded content: VI-VA architecture · one Vision server, EDITH, BAND\]

Vision talks, EDITH decides. Every message between them goes through BAND with a session ID, so the hand-offs show in one log during the demo.

**Message contract (Vision ↔ EDITH)**

Vision sends a task:

```json
{"from": "vision", "to": "edith", "type": "turn", "session_id": "s-7f3a",
 "intent": "book",
 "user_said": "Book an appointment at Apollo, OMR side",
 "details": {"chain": "Apollo", "area": "OMR"}}
```

EDITH updates its state for that session and answers with what is still missing, options, or a slot to confirm:

```json
{"from": "edith", "to": "vision", "type": "result", "session_id": "s-7f3a",
 "status": "needs_confirm",
 "missing": [],
 "slot": {"slot_id": "slot_123", "branch": "Apollo OMR", "doctor": "Dr. A", "time": "2026-11-25T18:00"},
 "say": "Dr. A is free at 6 PM on 25 Nov at Apollo OMR. Shall I confirm?"}
```

The final confirm is the only message that carries personal data:

```json
{"from": "vision", "to": "edith", "type": "confirm", "session_id": "s-7f3a",
 "slot_id": "slot_123", "name": "<name>", "phone": "<10-digit number>"}
```

Status values: `needs_info` (with the `missing` fields), `needs_choice`, `needs_confirm`, `booked`, `unavailable` (with alternatives), `escalated`. Intents: `book`, `lookup`, `reschedule`, `cancel`, `escalate`. Every message @mentions the other agent, because BAND delivers a message to an agent only when it is mentioned.

**Data model (booking API)**

| Table | Columns |
| --- | --- |
| hospitals | id, chain, branch, city, area, lat, lng, opens, closes |
| doctors | id, hospital\_id, name, specialty, languages |
| shifts | doctor\_id, weekday, start, end |
| slots | id, doctor\_id, start\_time, status |
| bookings | id, slot\_id, patient\_name, phone, reason, status, created\_at |
| holidays | hospital\_id, date |
| sessions | session\_id, intent, collected (JSON), missing (JSON), updated\_at |
| escalations | id, session\_id, reason, created\_at |

**Vision server endpoints:** `GET /` (web page), `POST /tools/ask_edith` (called by the Lyzr voice agent; needs a public HTTPS URL), `GET /log` (live BAND message log for the page, phone masked).

## Tech stack and sponsor use

Prizes go to the best use of each sponsor, so every sponsor below has a real job, not a logo.

| Sponsor | What VI-VA uses it for | Prize |
| --- | --- | --- |
| BAND | Vision and EDITH as two BAND agents in one room; every turn and the confirm go through it | $250 cash pool |
| Lyzr | Vision's voice: a Lyzr voice agent (English, realtime) that calls Vision's `ask_edith` tool | $250 credit + $250 cash |
| Agent37 | Hosts the Vision server and EDITH; gives the public demo URL | $1,500 credits + $200 cash |
| AdaL | Coding agent used to build VI-VA; records the demo video (required by the rules) | AdaL Pro plans |
| Finch | Optional: one ready-made skill for EDITH, only if time allows; needs a crypto wallet | Best use of stack |

**Full stack by layer**

Everything is TypeScript on Node 22.12+ (the BAND SDK needs it), both locally and on Agent37. Both agents share one set of message types in a `shared/` folder.

| Layer | Choice | Owner |
| --- | --- | --- |
| Language and repo | TypeScript, Node 22.12+, folders `vision/`, `edith/`, `shared/` | Both |
| Agent-to-agent | BAND SDK `@band-ai/sdk` 2.0.1 | Both |
| Voice | Lyzr voice agent, English, realtime engine, embedded in the page | A |
| Vision server | Node + Fastify: serves the page, `ask_edith` endpoint, BAND agent | A |
| Web page | Plain HTML + a little JavaScript: Lyzr widget, transcript, BAND log, text box fallback | A |
| Local video | Run the server locally; Lyzr reaches the tool through a tunnel (ngrok or cloudflared), or record against Agent37 | A |
| EDITH | Plain TypeScript state machine per session; no LLM for slots or bookings | B |
| Database | SQLite (`better-sqlite3`); every booking in one transaction | B |
| Hosting | Agent37, Docker image on `node:22`; its URL is the demo URL | Both |
| Distances | Haversine on stored coordinates | B |
| Dev tools | GitHub (public repo), AdaL CLI, `.env` for keys | Both |
| Demo video | AdaL | A |

**Keys:** BAND (one ID and key per agent; register `Vision-local` and `Vision-demo` so the laptop and Agent37 never run the same agent at once), Lyzr, Agent37. Keep them in `.env` and `agent_config.yaml`, never in git.

## Requirements

P0 must work in the demo; P1 is the wow factor; P2 only if time is left.

| ID | Requirement | Owner | Priority |
| --- | --- | --- | --- |
| R1 | Voice in and out in English through the Lyzr voice agent, in the web page | Vision | P0 |
| R2 | Text box fallback on the same page | Vision | P0 |
| R3 | Every user turn goes to EDITH with a session ID; EDITH owns what is collected and what is missing | Both | P0 |
| R4 | Every message goes through BAND and shows in the page's log, phone masked | Both | P0 |
| R5 | Ask "which branch?" when a chain has more than one | EDITH | P0 |
| R6 | Verify timing in code: branch hours, doctor shift, past time, holidays | EDITH | P0 |
| R7 | Offer up to three alternatives: later time, next day, nearest branch | EDITH | P0 |
| R8 | Spoken yes before any booking, reschedule or cancel | Vision | P0 |
| R9 | Name and phone only in the final confirm; phone read back digit by digit and checked as 10 digits | Both | P0 |
| R10 | Book in one database transaction; no double booking | EDITH | P0 |
| R11 | Vision server and EDITH on Agent37 (demo URL), Node 22.12+ | Both | P0 |
| R12 | Look up, reschedule and cancel a booking | EDITH | P1 |
| R13 | Escalate: emergency words and "talk to a person" | Both | P1 |
| R14 | Passcode or rate limit on the public demo URL | Vision | P1 |
| R15 | Finch skill in EDITH | EDITH | P2 |

**Safety rules (always on)**

- Never book, reschedule or cancel without a spoken yes.
- Availability comes only from EDITH's database, never from an LLM.
- Emergency words skip booking and point to 112.
- Name and phone appear only in the confirm message; the page log masks the phone.
- No payment of any kind.

**Quality targets:** reply within about 3 seconds per turn; full hospital booking in under 60 seconds of talking.

## Team split

Member A owns Vision: the server, the web page, the Lyzr voice agent and the video. Member B owns EDITH: the booking state, database and rules. They meet at BAND and the message contract.

| Area | Member A — Vision | Member B — EDITH |
| --- | --- | --- |
| Agent | Vision: conversation, reads EDITH's questions and results, gets a spoken yes | EDITH: booking state per session, search, timing checks, alternatives, book, look up, reschedule, cancel, escalate |
| Code | `vision/`: Fastify server, `ask_edith` endpoint, BAND agent, web page | `edith/`: state machine, rules, SQLite, seed data |
| Voice | Lyzr voice agent: prompt, voice and the `ask_edith` tool | — |
| Screens | Web page: voice widget, transcript, BAND log, text fallback | Bookings view for the demo |
| Hosting | Vision server on Agent37; tunnel for local recording | EDITH on Agent37 |
| Sponsors owned | BAND (Vision side), Lyzr, AdaL | BAND (EDITH side), Agent37, Finch (if time) |
| Safety rules | Spoken yes; phone read-back | Code-only availability; one-transaction booking; escalation |
| Submission | Records the video | README, sponsor section, submission form |

**Done together**

- Day 0: the BAND hello test and the message contract (fields, intents, status values).
- Day 0: the endpoint list, so Member A can test against a fake EDITH while Member B builds the real one.
- A 15-minute sync each morning and night: what works, what is blocked, what to cut.
- The "Problems faced" section of the submission, from both sides.
- Each person tests the other's part once a day.

**If one member falls behind:** cut P1 items in this order: Finch, rate limit, cancel, reschedule. Book and look up are never cut.

## Timeline

&#91;embedded content: VI-VA timeline · 20–28 Nov 2026\]

Dropping the movie flow and npm on 23 Nov frees Monday for look up, reschedule, cancel and deployment. Member A owns Vision, Member B owns EDITH.

**Fri 20 Nov — setup**

- [ ] Both: sign up for BAND, Lyzr, Agent37, AdaL; join the WhatsApp group; ask the open questions
- [ ] Both: two "hello" agents talk through BAND (the riskiest unknown, done first)
- [ ] A: pick the speech API and test Hindi and English
- [ ] B: seed data: 3 hospital chains, 6 branches, 15 doctors, 2 weeks of slots

**Sat 21 Nov — build both agents**

- [ ] A: `npx vi-va` opens a local page with mic, transcript and replies
- [ ] A: intent and detail extraction, follow-up questions
- [ ] B: booking API (5 endpoints) on SQLite
- [ ] B: EDITH in Lyzr with tools: search, availability, timing check, alternatives, book

**Sun 22 Nov — hospital flow end to end**

- [ ] Both: Vision and EDITH talk through BAND using the message contract
- [ ] B: EDITH, API and the live bookings page deployed on Agent37 (demo URL)
- [ ] A: on-screen BAND message log beside the voice page
- [ ] Both: full run: Apollo → which branch → slot taken → alternatives → confirm → booked
- [ ] Submit the repo to Dr. Agent for feedback

**Mon 23 Nov — movie flow and polish**

- [ ] Both: full round trip first: Lyzr voice → `ask_edith` → Vision server → BAND → EDITH → back
- [ ] Both: Node 22.12+ installed locally
- [ ] A: web page with Lyzr widget, transcript, BAND log, text fallback
- [ ] B: look up, reschedule, cancel, escalation; one-transaction booking
- [ ] Both: deploy Vision server and EDITH on Agent37 (`node:22` image)
- [ ] A: tunnel for local recording, or plan to record against Agent37

**Tue 24 Nov — submit (aim for 6 PM, hard stop 10 PM)**

- [ ] Both: rehearse three times on the Agent37 URL
- [ ] A: record the 2-minute video with AdaL
- [ ] B: README: architecture, sponsor use, problems faced, setup steps
- [ ] Submit on HiDevs by 6 PM (hard stop 10 PM)

**25–28 Nov:** top 10 announced on 25 Nov at 10 PM. If selected, fix what judges may poke at, test on the venue Wi-Fi with a phone hotspot as backup, and bring the backup video.

## Demo script and submission

**2-minute demo video (recorded with AdaL)**

1. 0:00–0:15 — The problem in one line; open the VI-VA page.
2. 0:15–1:05 — Book: "Apollo" → "which branch?" → slot taken → alternatives → pick → name and phone read back → booked with an ID. BAND log visible beside the voice widget.
3. 1:05–1:35 — Look up and reschedule: "When is my appointment? Move it to Friday evening."
4. 1:35–1:50 — Escalate: "I want to talk to a person."
5. 1:50–2:00 — Architecture picture and the sponsor list.

**Submission checklist (from the Evaluation tab)**

- [ ] Project description
- [ ] Public GitHub repo with a README and architecture diagram
- [ ] Demo URL on Agent37 (voice, with a text fallback)
- [ ] 2-minute video (fits both the Rules and the Evaluation tab)
- [ ] How each sponsor was used (BAND, AdaL, Finch, Lyzr, Agent37)
- [ ] Problems faced while building
- [ ] Repo submitted to Dr. Agent for early feedback

## Risks and open questions

| Risk | Fallback |
| --- | --- |
| Lyzr's tool call times out on the full chain | Test the round trip first; Vision says "one moment"; EDITH answers fast from code |
| Lyzr can't reach a local server | Record against Agent37, or use a tunnel |
| Laptop and Agent37 run the same BAND agent | Register `Vision-local` and `Vision-demo` |
| Agent37 runs an older Node | `node:22` base image; check `node -v` in the sandbox |
| Phone number misheard | Read back digit by digit; 10-digit check |
| Double booking | Check and book in one transaction |
| Public demo URL burns Lyzr credits | Passcode or rate limit |
| Using real hospital names | Say clearly in the demo that slot data is sample data |

**Open questions**

- Video length: Rules say 2 minutes, Evaluation tab says 7. Going with 2 minutes, which fits both; asked the organizers.
- Credits for all participants or only winners: unclear; planning on free tiers.
- Judging weights: not published. Criteria are multi-agent collaboration, use of sponsor platforms, technical execution and real-world impact.
- Sample data: not stated; the demo says clearly that slot data is sample data.
- Decided: VI = Virtual Intelligence.
