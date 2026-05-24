---
"sigil": patch
---

Fixed the highest-priority audit issues around network configuration, local metadata protection, and deep-link request handling.

- Fixed custom RPC handling so the app consistently supports custom HTTPS endpoints, validates them before saving, and uses the selected network for latest-stats fetches.
- Restored OS-protected storage as the primary home for the persisted-store encryption key, with file-based storage kept only as a migration/fallback path when secure storage is unavailable.
- Replaced the native single-slot deep-link pending state with a FIFO queue and updated cold-start request draining so bursts of incoming requests are no longer overwritten.
