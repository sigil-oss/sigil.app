import type { SigilEnvelope } from "@/lib/request-schema";
import type { TrustedDappIssuer } from "@/store/persisted";

export type RequestTrustLevel =
  | "verified_registry"
  | "signed_untrusted"
  | "legacy_unverified"
  | "signature_invalid"
  | "registry_revoked"
  | "registry_origin_mismatch"
  | "registry_key_mismatch";

export interface RequestTrustInfo {
  level: RequestTrustLevel;
  title: string;
  detail: string;
  issuer: string | null;
  keyId: string | null;
  verifiedOrigin: string | null;
  registryEntry: TrustedDappIssuer | null;
  blocking: boolean;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(digest));
}

async function verifyEs256Signature(publicJwk: JsonWebKey, payload: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

function findRegistryMatch(
  proofIssuer: string,
  keyId: string | undefined,
  registry: TrustedDappIssuer[],
): TrustedDappIssuer | null {
  const issuerMatches = registry.filter((entry) => entry.issuer === proofIssuer);
  if (issuerMatches.length === 0) return null;
  if (!keyId) return issuerMatches[0] ?? null;
  return issuerMatches.find((entry) => !entry.keyId || entry.keyId === keyId) ?? null;
}

export async function evaluateRequestTrust(
  envelope: SigilEnvelope,
  registry: TrustedDappIssuer[],
): Promise<RequestTrustInfo> {
  if (!envelope.proof) {
    return {
      level: "legacy_unverified",
      title: "Unverified sender",
      detail: "The request is unsigned. dApp name and origin are still self-reported metadata.",
      issuer: null,
      keyId: null,
      verifiedOrigin: null,
      registryEntry: null,
      blocking: false,
    };
  }

  const canonicalPayload = serializeSignedRequestPayload(envelope);
  const payloadHash = await sha256Base64Url(canonicalPayload);
  if (payloadHash !== envelope.proof.payload_hash) {
    return {
      level: "signature_invalid",
      title: "Invalid signed request",
      detail: "The signed payload hash does not match the request body.",
      issuer: envelope.proof.issuer,
      keyId: envelope.proof.key_id ?? null,
      verifiedOrigin: null,
      registryEntry: null,
      blocking: true,
    };
  }

  const registryEntry = findRegistryMatch(envelope.proof.issuer, envelope.proof.key_id, registry);
  if (registryEntry) {
    if (registryEntry.status === "revoked") {
      return {
        level: "registry_revoked",
        title: "Revoked issuer",
        detail: "This request was signed by a registry issuer that is marked revoked.",
        issuer: registryEntry.issuer,
        keyId: registryEntry.keyId ?? null,
        verifiedOrigin: null,
        registryEntry,
        blocking: true,
      };
    }

    const originMatch = registryEntry.origins.includes(envelope.request.dapp.origin);
    if (!originMatch) {
      return {
        level: "registry_origin_mismatch",
        title: "Registry origin mismatch",
        detail: "The signed issuer is known, but the declared dApp origin does not match its trusted origins.",
        issuer: registryEntry.issuer,
        keyId: registryEntry.keyId ?? null,
        verifiedOrigin: null,
        registryEntry,
        blocking: true,
      };
    }

    const verified = await verifyEs256Signature(registryEntry.publicJwk, canonicalPayload, envelope.proof.signature);
    if (!verified) {
      return {
        level: "signature_invalid",
        title: "Invalid signed request",
        detail: "The registry issuer key did not verify this request signature.",
        issuer: registryEntry.issuer,
        keyId: registryEntry.keyId ?? null,
        verifiedOrigin: null,
        registryEntry,
        blocking: true,
      };
    }

    return {
      level: "verified_registry",
      title: "Verified registry issuer",
      detail: `${registryEntry.name} signed this request, and the origin matches a trusted registry entry.`,
      issuer: registryEntry.issuer,
      keyId: registryEntry.keyId ?? null,
      verifiedOrigin: envelope.request.dapp.origin,
      registryEntry,
      blocking: false,
    };
  }

  if (envelope.proof.public_jwk) {
    const verified = await verifyEs256Signature(
      envelope.proof.public_jwk as JsonWebKey,
      canonicalPayload,
      envelope.proof.signature,
    );
    if (!verified) {
      return {
        level: "signature_invalid",
        title: "Invalid signed request",
        detail: "The inline signing key did not verify this request signature.",
        issuer: envelope.proof.issuer,
        keyId: envelope.proof.key_id ?? null,
        verifiedOrigin: null,
        registryEntry: null,
        blocking: true,
      };
    }

    return {
      level: "signed_untrusted",
      title: "Signed but not registered",
      detail: "The request signature is valid, but the issuer is not in your verified dApp registry.",
      issuer: envelope.proof.issuer,
      keyId: envelope.proof.key_id ?? null,
      verifiedOrigin: null,
      registryEntry: null,
      blocking: false,
    };
  }

  return {
    level: "registry_key_mismatch",
    title: "Unknown signing key",
    detail: "The request references an issuer that is not trusted locally and does not include a verifiable inline key.",
    issuer: envelope.proof.issuer,
    keyId: envelope.proof.key_id ?? null,
    verifiedOrigin: null,
    registryEntry: registryEntry ?? null,
    blocking: true,
  };
}

export async function verifyEnvelopeSignature(
  envelope: SigilEnvelope,
  options?: { publicJwk?: JsonWebKey },
): Promise<boolean> {
  const proof = envelope.proof;
  if (!proof) return false;
  const jwk = options?.publicJwk ?? (proof.public_jwk as JsonWebKey | undefined);
  if (!jwk) throw new Error("No public key available: provide publicJwk or include it in the proof");
  const payload = serializeSignedRequestPayload(envelope);
  return verifyEs256Signature(jwk, payload, proof.signature);
}

export function serializeSignedRequestPayload(envelope: Pick<SigilEnvelope, "request" | "callback">): string {
  return canonicalize({
    request: envelope.request,
    callback: envelope.callback,
  });
}

export async function hashSignedRequestPayload(envelope: Pick<SigilEnvelope, "request" | "callback">): Promise<string> {
  return sha256Base64Url(serializeSignedRequestPayload(envelope));
}
