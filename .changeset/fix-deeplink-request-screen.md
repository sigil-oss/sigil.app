---
"sigil": patch
---

Fix deep-link requests never reaching the request screen

- `proof: null` from unsigned requests failed zod's `.optional()` check,
  causing `parseSigilEnvelope` to reject every envelope silently — changed
  to `.nullish()` so absent proof is accepted as `null` or `undefined`
- `lock()` was clearing `pendingRequests`, destroying any queued deep-link
  request if auto-lock fired before the user could review it — pending
  requests now survive lock/unlock so the lock screen routes correctly to
  `/request` after unlock
