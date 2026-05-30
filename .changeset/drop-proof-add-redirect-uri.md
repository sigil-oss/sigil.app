---
---

Remove proof/trust system and add redirect_uri delivery mode

Drop the ES256 proof/signing system, trust registry, and all trust UI from the request review screen. The wallet now shows the dApp name and origin directly — security comes from the user verifying what they're signing, not from wallet-managed issuer registries.

Add `redirect_uri` as a second delivery mode alongside `callback`: after the user approves or rejects, Sigil opens `redirect_uri?result=<base64url JSON>` in the browser. Both modes work independently or together.
