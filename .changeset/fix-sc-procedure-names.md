---
"sigil": patch
---

Fix SC call procedure names in transaction history incorrectly showing read-only query function names (e.g. "Asset Ask Orders", "Quote Exact Asset Input") for QX and Qswap contracts. Procedure lookup now uses `build*Input` method presence to distinguish callable write procedures from query functions, which share the same numeric `inputType` values but in separate call paths. Qearn lock is covered by a manual override since the package exports no `buildLockInput` helper.
