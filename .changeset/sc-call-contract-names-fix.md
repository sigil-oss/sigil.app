---
"sigil": patch
---

Fix contract name lookup for all 27 Qubic contracts.

- `CONTRACT_NAMES` now resolves correctly for every contract (Qswap, Nostromo, QX, etc.); the previous approach read `_CONTRACT_INDEX` exports which Vite's esbuild pre-bundler tree-shook for any symbol not explicitly imported, leaving only Qearn and QUtil with names
- Switched to the camelCase namespace objects (`qswap`, `qearn`, …) which are always present in the pre-bundle regardless of tree-shaking
- Fixed inverted guard in `CONTRACT_PROCEDURE_NAMES` loop (`!slot || GET_` → `slot || GET_`) that prevented procedure labels from ever being written
- TESTING.md: corrected Qswap `input_type` to 3 (Create Pool), corrected unknown contract index to 63 (valid Rust range, no known mapping)
