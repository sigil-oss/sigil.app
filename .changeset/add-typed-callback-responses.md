---
"sigil": patch
---

Add typed callback response interfaces and export verifyEnvelopeSignature

- Added `SigilCallbackResponse` union type and its five constituent interfaces (`SigilSignedTransferCallback`, `SigilSignedMessageCallback`, `SigilConnectedCallback`, `SigilVerifiedCallback`, `SigilRejectedCallback`) to `request-schema.ts`
- Exported `verifyEnvelopeSignature` from `request-trust.ts` as a standalone helper for verifying ES256 signed envelopes without the full registry trust evaluation
- Updated `request-screen.tsx` to construct typed callback response objects instead of plain `JSON.stringify` calls, providing compile-time shape guarantees
