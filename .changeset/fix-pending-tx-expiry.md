---
"sigil": patch
---

Fix pending transactions not expiring in notification triggers.

- Expired tx detection now uses the live tick (`useTickInfo`) with a +30 tick grace period, matching the history screen
- Previously used the archive tick (`useLastProcessedTick`) which can lag significantly behind or return 0 on API failure, causing expired txs to stay pending indefinitely
