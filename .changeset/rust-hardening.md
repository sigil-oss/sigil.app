---
"sigil": patch
---

Fix Rust mutex poison killing auto-lock and clipboard watcher threads permanently; replace seen_nonces HashSet clear with timestamp-based eviction to prevent nonce replay; cap deep-link payload at 8 KB; enforce exp field present and ≤1 hour in the future
