# EDITH — owned by Member B

Not built here. Member B owns this folder: session state, SQLite, timing rules,
alternatives, and the one-transaction booking.

The only thing the two sides share is `../shared/contract.ts`. Import the types
from there rather than redeclaring them.

EDITH receives `TurnMessage` and `ConfirmMessage`, and always answers with a
`ResultMessage` carrying a `say` string for Vision to speak.
