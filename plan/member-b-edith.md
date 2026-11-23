# Member B — EDITH

Your checklist. The shared spine, checkpoints and cut order are in `../PLAN.md`.
The message contract you must speak is `../shared/contract.ts` — read it first,
it is already written and frozen.

---

## What you own

**EDITH is the only thing in VI-VA that knows the truth.** Vision carries speech;
you decide what is actually possible. The single rule the whole demo rests on:

> **Availability comes from the database, in code. Never from a language model.**

Every competing team will have an LLM that cheerfully invents a 5 PM slot. You
are the reason ours doesn't.

| You own | You never do |
| --- | --- |
| `edith/` — state machine, rules, SQLite, seed data | Talk to the user directly |
| Booking state per session: `collected` and `missing` | Ask an LLM whether a slot is free |
| Search, timing checks, alternatives, book, lookup, reschedule, cancel, escalate | Touch `vision/` |
| Deploying EDITH to Agent37 | Return a `say` that invents a time or a doctor |
| The README, sponsor section and submission form | Change `shared/contract.ts` silently |

**What you send back, every time:** a `ResultMessage` with a `status`, the
`missing` fields if any, and a `say` sentence Vision can speak verbatim.

Statuses: `needs_info` · `needs_choice` · `needs_confirm` · `booked` ·
`unavailable` · `escalated`
Intents: `book` · `lookup` · `reschedule` · `cancel` · `escalate`

**Two things that will bite you on BAND:**
- Message `content` is a **string** — stringify your JSON.
- BAND rejects an un-mentioned message with **422** — always @mention Vision.
- The @mention arrives *inside* `content` — strip it before `JSON.parse`.

---

## First thing: send Venkat your BAND agent UUID

This blocks the agent-to-agent hop on his side. **Send it before you write any
code.** One line in chat: `EDITH_AGENT_ID=...`

---

## Tonight — 23 Nov, 19:00 to 23:00

### 1. Database and seed data

- [ ] SQLite via `better-sqlite3`
- [ ] Tables: `hospitals`, `doctors`, `shifts`, `slots`, `bookings`, `holidays`,
      `sessions`, `escalations`
- [ ] Seed: **3 chains, 6 branches, 15 doctors, 2 weeks of slots**
- [ ] Seed at least one chain with **multiple branches in the same city** — the
      "which Apollo?" moment needs it (R5)
- [ ] Seed at least one **deliberately taken slot** at an obvious time, so the
      alternatives path can be demoed on command (R7)
- [ ] Seed one holiday and one doctor who is off on a given weekday

The demo depends on the seed data as much as the code. Make it demo-shaped.

### 2. Session state

- [ ] A session row per `session_id`: `intent`, `collected` (JSON),
      `missing` (JSON), `updated_at`
- [ ] On every turn: merge what you learned, recompute `missing`, return the
      **one** next question — not all of them at once
- [ ] Decide what resets state when a booking completes

### 3. Search and timing rules (R5, R6)

- [ ] Chain has more than one branch → `needs_choice` with the branch list
- [ ] Verify in code: branch open at that time, doctor on shift, time not in the
      past, not a holiday
- [ ] Each failure produces a *useful* `say`, not an error

---

## Tomorrow morning — 06:00 to 09:00 (CP2 is the big one)

- [ ] **Alternatives (R7)** — when the slot is gone, return up to three: later
      the same day, the next day, the nearest branch (Haversine on stored
      coordinates). Status `unavailable`.
- [ ] **Book in one transaction (R10)** — re-check the slot and insert the
      booking atomically. No double booking, even if two sessions race.
- [ ] Return a short, speakable booking ID — Vision has to read it aloud
- [ ] Lookup by booking ID **or phone number** (R12)
- [ ] Reschedule — find free slots, move the booking in one transaction
- [ ] Cancel — free the slot

**CP2 at 09:00: Venkat types "book at Apollo" in a browser and completes a real
booking against your database.** That is the moment the project exists.

---

## Tomorrow midday — 09:00 to 14:30 (CP3, CP4)

- [ ] **Escalation (R13)** — record session details, return `escalated`.
      Triggered by "talk to a person" and by emergency words.
- [ ] **Returning-caller lookup** *(only if decision D2 in `../PLAN.md` = yes)* —
      given a phone number, return the patient's last visit so Vision can open
      with "you saw Dr. Rao on 2 Nov — book a follow-up?". Seed 2–3 fake
      returning patients. ~45 minutes, and it is the demo's differentiator.
- [ ] A simple **bookings view** for the demo — a page or endpoint showing rows
      appearing live. Cheap, and very convincing on video.
- [ ] **Deploy EDITH on Agent37**, `node:22` image
- [ ] Confirm it answers the *deployed* Vision server, not just the local one

---

## Tomorrow afternoon — 14:30 to 18:00 (CP5, CP6)

You own the written submission while Venkat records.

- [ ] **README**: what VI-VA is, architecture diagram, how to run it locally,
      environment variables
- [ ] **Sponsor section** — what each one actually did, not a logo list:
      - BAND — two agents, one room, every turn and the confirm go through it
      - Lyzr — the voice agent that calls Vision's `ask_edith` tool
      - Agent37 — hosts both agents, gives the public demo URL
      - AdaL — the coding agent used to build it, and recorded the video
      - Finch — **cut**, say so honestly if asked
- [ ] **"Problems faced"** — your half. Real ones: BAND's 422 on un-mentioned
      messages, the string `content`, the sync/async mismatch, the model
      availability issue. Judges like this section more than teams expect.
- [ ] Fix in the PRD/README: BAND SDK is **2.2.0**, not 2.0.1
- [ ] **Submit on the HiDevs form by 18:00**

---

## Your failure modes, named in advance

| If this happens | Do this |
| --- | --- |
| You are behind at CP2 | Cut reschedule, then cancel. Book and lookup are never cut. |
| Timing rules are getting complicated | Simplify the seed data, not the rules. Fewer edge cases in the data beats clever code. |
| You are tempted to let an LLM pick a slot | Don't. It is the one thing that makes this demo different. |
| A slot could be double-booked | Re-check inside the same transaction as the insert. |
| You finish early | Bookings view, then returning-caller lookup, then better seed data. Not new features. |
