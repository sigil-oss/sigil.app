---
"sigil": patch
---

SC call info, instant navigation, transfer validation, and updater feedback.

- SC call preview now shows the name and procedure of all 27 Qubic contracts (Qearn, QUtil, QX, Qswap, Quottery, QVault, Escrow, Nostromo, Pulse, etc.) sourced directly from `@qubic.org/contracts` at build time; unknown contracts fall back to `Contract #N / Procedure N`
- History screen now labels SC calls by destination address for all known contracts (was only QUtil and Qearn)
- Router switched from lazy-loaded chunks to eager imports — eliminates the `[LOADING...]` flash on first visit to each screen after cold start
- Transfer preview validates the destination identity (checksum) before showing the Sign button; invalid destinations show `[INVALID DESTINATION IDENTITY]` immediately instead of failing after clicking sign
- Updater check now shows `[UP TO DATE]` when no update is available and `[UPDATE CHECK FAILED]` in red on network errors; errors were previously swallowed silently
