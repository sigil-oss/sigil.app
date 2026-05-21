---
"sigil": minor
---

Replace per-account balance polling with a single `QUtil.getBalances16` SC query that fetches all vault account balances in one call every 5 s. Vault accounts are now capped at 16 — the "+ Add" button in vault detail is replaced with a "16 MAX" label once the limit is reached.
