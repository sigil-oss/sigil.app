---
"sigil": patch
---

Remove unused store:allow-clear capability to prevent full store wipe via XSS; force_lock now resets Rust activity timer so countdown starts fresh after manual lock; revokeDappPermission automatically removes the ApprovedDapp entry when all permissions are revoked; vault file import now rejects blank names
