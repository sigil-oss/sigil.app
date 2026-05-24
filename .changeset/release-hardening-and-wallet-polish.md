---
"sigil": patch
---

Improve wallet security, reliability, and day-to-day usability.

- **Deep-link security:** Hardened request validation, nonce handling, callback posting, and sender presentation to reduce spoofing, replay, unsafe callback targets, and misleading dApp identity cues. Commits: `3460214`, `81ac5f8`, `110573d`, `bc0234e`, `0df208b`.
- **Vault and session safety:** Reduced secret exposure in normal app state, tightened unlock and auto-lock behavior, improved Linux quick unlock, and added per-account seed reveal with safer clipboard handling. Commits: `81ac5f8`, `6b6a3f6`, `fc7d6d6`, `65f04f7`, `068e882`.
- **Local data protection:** Strengthened persisted metadata handling, made dev persistence more stable, capped stored transaction metadata, and reduced unnecessary store and clipboard capabilities. Commits: `baffcd7`, `98a87c4`, `00e4d6b`, `ecd05a8`, `5545200`, `543aac0`, `6d21c4a`.
- **Network and transport hardening:** Tightened endpoint validation, sanitized callback failure reporting, removed broad raw GitHub CSP access, bundled sponsor-name metadata locally, and reduced bursty Qearn position queries. Commits: `fb3210b`, `49103eb`, `a847397`, `8027bce`, `0df208b`.
- **Export and recovery UX:** Switched exports to native save dialogs, improved failure handling around file saves and clipboard fallbacks, and made recovery and export flows more predictable. Commits: `6036560`, `f66241c`, `5531e0b`, `fc7d6d6`.
- **Interface polish:** Improved QR scan contrast, made identity truncation Unicode-safe, validated theme color inputs, clarified debug-mode blur-lock warnings, and aligned vault account management with the rest of the app’s card-based UI. Commits: `0751f55`, `f1bb42d`, `3e9ac86`, `5c12b17`, `c2ee4e1`.
