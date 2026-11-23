# Postman

Import all three files (**Import → Files**):

| File | What it is |
| --- | --- |
| `VI-VA.postman_collection.json` | the requests |
| `fake.postman_environment.json` | points at `:3001` — deterministic fake EDITH |
| `band.postman_environment.json` | points at `:3000` — real BAND + EDITH stub |

Pick the environment from the dropdown, top right. Everything else follows.

## Start the servers

```powershell
npm run dev:vision                      # :3000, real BAND  (needs: npm run edith:stub in another terminal)

$env:VISION_FAKE_EDITH=1
$env:PORT=3001
npx tsx vision/src/server.ts            # :3001, fake EDITH, no BAND needed
```

Both can run at once. They are separate processes with separate ports, and the
fake one holds no BAND connection, so there is no "same agent twice" problem.

## Which environment for which question

| You want to know | Use |
| --- | --- |
| Does the conversation iterate correctly — asks branch, asks time, holds state? | **fake (:3001)** |
| Do R8 and R9 hold — spoken yes, phone read back, nothing written on a refusal? | **fake (:3001)** |
| Does agent-to-agent actually work over BAND? | **band (:3000)** |
| What is the real per-turn latency? | **band (:3000)** |

> The EDITH stub on `:3000` is **stateless** — it sends Groq only the current
> sentence and remembers nothing between turns.
>
> Measured 23 Nov: the whole collection passes against the fake
> (**68/68 assertions**), while folder 1 against the stub gives **22 pass, 8
> fail**. Every one of those eight traces to the same root cause — turn 3 comes
> back `needs_info` instead of `needs_confirm` because the stub forgot the
> branch, so Vision's confirm flow never opens and the rest of the folder
> cascades. That is the stub being a stub, not a bug in Vision. Those folders
> are written for Member B's real EDITH.

## Running it

Folders **1**, **2** and **3** are conversations — run each with the
**Collection Runner**, in order. The first request of each mints its own
session id (`book-<timestamp>`), so every run is a clean slate and two runs can
be compared side by side under the Runs tab.

Folders **4** and **5** are self-contained. Click them individually whenever.

## Session ids

There is no chat and no login. Continuity is the `session_id` string and
nothing else:

- send the **same** string on every call and the conversation continues
- send a **different** one, or none, and each call is a brand new conversation
- you can invent it — `venkat-1` is as valid as anything Vision mints
- the collection generates one per run so you never have to think about it

Folder 4 has a request that deliberately omits it, so you can watch Vision mint
one and hand it back.
