import { usePersistedStore } from "@/store/persisted";

export interface SignedExportMeta {
  schema: "sigil_export";
  version: 2;
  exportType: "vault" | "contacts";
  createdAt: number;
  signatureAlgorithm: "HMAC-SHA256";
  payloadHash: string;
  signature: string;
}

export interface SignedExportEnvelope<T> {
  meta: SignedExportMeta;
  payload: T;
}

async function ensureExportSigningSecret(): Promise<string> {
  const settings = usePersistedStore.getState().settings;
  if (settings.exportSigningPrivateJwk?.k && typeof settings.exportSigningPrivateJwk.k === "string") {
    return settings.exportSigningPrivateJwk.k;
  }
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = btoa(String.fromCharCode(...secretBytes));
  usePersistedStore.getState().updateSettings({
    exportSigningPrivateJwk: { kty: "oct", k: secret, alg: "HS256", key_ops: ["sign", "verify"], ext: true },
    exportSigningPublicJwk: { kty: "oct", k: secret, alg: "HS256", key_ops: ["verify"], ext: true },
  });
  return secret;
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secret), (ch) => ch.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySignature(secret: string, payload: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(secret), (ch) => ch.charCodeAt(0)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(atob(signature), (ch) => ch.charCodeAt(0)),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

export async function createSignedExportEnvelope<T>(exportType: SignedExportMeta["exportType"], payload: T): Promise<SignedExportEnvelope<T>> {
  const createdAt = Date.now();
  const payloadText = JSON.stringify(payload);
  const payloadHash = await sha256(payloadText);
  const secret = await ensureExportSigningSecret();
  const signature = await signPayload(secret, `${exportType}:${createdAt}:${payloadHash}`);
  return {
    meta: {
      schema: "sigil_export",
      version: 2,
      exportType,
      createdAt,
      signatureAlgorithm: "HMAC-SHA256",
      payloadHash,
      signature,
    },
    payload,
  };
}

export interface ParsedExport<T> {
  payload: T;
  version: number;
  exportType: SignedExportMeta["exportType"] | "legacy";
  verified: boolean;
  legacy: boolean;
}

export async function parseSignedExportEnvelope<T>(raw: string, expectedType: SignedExportMeta["exportType"]): Promise<ParsedExport<T>> {
  const parsed = JSON.parse(raw) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    "meta" in parsed &&
    "payload" in parsed
  ) {
    const envelope = parsed as SignedExportEnvelope<T>;
    const payloadText = JSON.stringify(envelope.payload);
    const payloadHash = await sha256(payloadText);
    const settings = usePersistedStore.getState().settings;
    const secret = settings.exportSigningPrivateJwk?.k && typeof settings.exportSigningPrivateJwk.k === "string"
      ? settings.exportSigningPrivateJwk.k
      : "";
    const schemaOk =
      envelope.meta?.schema === "sigil_export" &&
      envelope.meta?.version === 2 &&
      envelope.meta?.exportType === expectedType &&
      envelope.meta?.payloadHash === payloadHash;
    let verified = false;
    if (schemaOk && secret) {
      const sigOk = await verifySignature(secret, `${expectedType}:${envelope.meta.createdAt}:${payloadHash}`, envelope.meta.signature);
      if (!sigOk) throw new Error("Export file failed integrity check — file may be corrupted or tampered");
      verified = true;
    }
    return {
      payload: envelope.payload,
      version: envelope.meta?.version ?? 2,
      exportType: envelope.meta?.exportType ?? expectedType,
      verified,
      legacy: false,
    };
  }

  return {
    payload: parsed as T,
    version: 1,
    exportType: "legacy",
    verified: false,
    legacy: true,
  };
}
