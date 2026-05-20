---
"sigil": patch
---

Security hardening, code quality, and resilience improvements.

- `post_callback` now blocks IPv6 private ranges (fc00::/7, fe80::/10), enforces a 4 KB body limit, and propagates HTTP error status codes
- `is_private_host` IPv6 bracket stripping and 172.x second-octet parse fixed
- `truncateId` and `formatQu` centralised in `src/lib/format.ts`; all screens and components now share a single implementation
- Global and per-screen error boundaries added so a render crash shows a recoverable error state instead of a blank window
