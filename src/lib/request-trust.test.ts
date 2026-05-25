import { describe, expect, test } from "bun:test";
import { evaluateRequestTrust, hashSignedRequestPayload, serializeSignedRequestPayload } from "@/lib/request-trust";
import type { SigilEnvelope } from "@/lib/request-schema";

async function signEnvelope(envelope: SigilEnvelope) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const payload = serializeSignedRequestPayload(envelope);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payload),
  );
  const signatureB64 = Buffer.from(signature).toString("base64url");
  const payloadHash = await hashSignedRequestPayload(envelope);
  return { publicJwk, signatureB64, payloadHash };
}

describe("evaluateRequestTrust", () => {
  test("verifies a registry-backed signed request", async () => {
    const base: SigilEnvelope = {
      request: {
        type: "connect",
        dapp: { name: "Demo", origin: "https://demo.app" },
        nonce: "nonce-1234567890abcd",
      },
      callback: null,
      proof: undefined,
    };
    const signed = await signEnvelope(base);
    const envelope: SigilEnvelope = {
      ...base,
      proof: {
        version: 1,
        algorithm: "ES256",
        issuer: "did:web:demo.app",
        key_id: "main",
        payload_hash: signed.payloadHash,
        signature: signed.signatureB64,
        public_jwk: signed.publicJwk,
      },
    };

    const trust = await evaluateRequestTrust(envelope, [{
      id: "issuer-1",
      issuer: "did:web:demo.app",
      name: "Demo",
      origins: ["https://demo.app"],
      publicJwk: signed.publicJwk,
      keyId: "main",
      status: "active",
      addedAt: Date.now(),
    }]);

    expect(trust.level).toBe("verified_registry");
    expect(trust.blocking).toBe(false);
  });
});
