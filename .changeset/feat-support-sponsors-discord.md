---
"sigil": minor
---

Live sponsors list and Discord prompt on donation.

- Sponsors are now computed live from the Qubic archive API (paginated, all-time) instead of a static JSON file
- Multiple donations from the same identity are accumulated correctly
- Sponsor data is cached for 10 minutes and invalidated immediately when a donation is broadcast
- After sending a donation, a sheet prompts the user to message `@alez.t04` on Discord to show a custom name instead of their truncated identity
