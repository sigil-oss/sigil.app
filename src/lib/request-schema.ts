import { z } from "zod";
import { CONTRACT_NAMES, CONTRACT_PROCEDURE_NAMES } from "@/lib/contracts";
import { truncateIdentity } from "@/lib/crypto";
import { formatQu } from "@/lib/format";

const permissionSchema = z.enum(["transfer", "sc_call", "sign_message"]);
const jsonWebKeySchema = z.record(z.string(), z.unknown());

const dappMetaSchema = z.object({
  name: z.string().optional().default(""),
  origin: z.string(),
  icon: z.string().optional(),
});

const baseRequestSchema = z.object({
  dapp: dappMetaSchema,
  nonce: z.string(),
  exp: z.number().int().positive().optional(),
});

const amountSchema = z.union([z.number(), z.string()]);

export const transferRequestSchema = baseRequestSchema.extend({
  type: z.literal("transfer"),
  to: z.string(),
  amount: amountSchema,
  from: z.string().optional(),
  tick_offset: z.number().int().optional(),
}).passthrough();

export const scCallRequestSchema = baseRequestSchema.extend({
  type: z.literal("sc_call"),
  contract_index: z.number().int(),
  input_type: z.number().int(),
  from: z.string().optional(),
  amount: amountSchema.optional(),
  payload: z.string().optional(),
  tick_offset: z.number().int().optional(),
}).passthrough();

export const signMessageRequestSchema = baseRequestSchema.extend({
  type: z.literal("sign_message"),
  message: z.string(),
  from: z.string().optional(),
  data: z.string().optional(),
}).passthrough();

export const verifyMessageRequestSchema = baseRequestSchema.extend({
  type: z.literal("verify_message"),
  message: z.string(),
  data: z.string().optional(),
  signature: z.string(),
  public_key: z.string(),
}).passthrough();

export const connectRequestSchema = baseRequestSchema.extend({
  type: z.literal("connect"),
  permissions: z.array(permissionSchema).optional(),
}).passthrough();

export const sigilRequestSchema = z.discriminatedUnion("type", [
  transferRequestSchema,
  scCallRequestSchema,
  signMessageRequestSchema,
  verifyMessageRequestSchema,
  connectRequestSchema,
]);

export const sigilEnvelopeSchema = z.object({
  request: sigilRequestSchema,
  callback: z.union([z.string(), z.null()]).optional().transform((value) => value ?? null),
  proof: z.object({
    version: z.literal(1),
    algorithm: z.literal("ES256"),
    issuer: z.string().min(1),
    key_id: z.string().min(1).optional(),
    payload_hash: z.string().min(16),
    signature: z.string().min(16),
    public_jwk: jsonWebKeySchema.optional(),
  }).nullish(),
}).superRefine((envelope, ctx) => {
  if (!envelope.request.dapp.origin.startsWith("https://")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "dApp origin must be HTTPS",
      path: ["request", "dapp", "origin"],
    });
  }

  if (envelope.callback && !isAllowedCallbackUrl(envelope.callback)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Callback URL must use HTTPS or localhost HTTP",
      path: ["callback"],
    });
  }

  if (envelope.request.exp && Date.now() / 1000 > envelope.request.exp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Request expired",
      path: ["request", "exp"],
    });
  }
});

// ── Callback response types ────────────────────────────────────────────────────

export interface SigilSignedTransferCallback {
  status: "signed";
  type: "transfer" | "sc_call";
  nonce: string;
  identity: string;
  tx_hash: string;
  target_tick: number;
}

export interface SigilSignedMessageCallback {
  status: "signed";
  type: "sign_message";
  nonce: string;
  identity: string;
  signature: string;
  public_key: string;
}

export interface SigilConnectedCallback {
  status: "connected";
  type: "connect";
  nonce: string;
  identity: string;
  permissions: SigilPermission[];
}

export interface SigilVerifiedCallback {
  status: "verified";
  type: "verify_message";
  nonce: string;
  valid: boolean;
  identity: string;
}

export interface SigilRejectedCallback {
  status: "rejected";
  type: SigilRequest["type"];
  nonce: string;
  reason: "user_rejected";
}

export type SigilCallbackResponse =
  | SigilSignedTransferCallback
  | SigilSignedMessageCallback
  | SigilConnectedCallback
  | SigilVerifiedCallback
  | SigilRejectedCallback;

export type DappMeta = z.infer<typeof dappMetaSchema>;
export type TransferRequest = z.infer<typeof transferRequestSchema>;
export type ScCallRequest = z.infer<typeof scCallRequestSchema>;
export type SignMessageRequest = z.infer<typeof signMessageRequestSchema>;
export type VerifyMessageRequest = z.infer<typeof verifyMessageRequestSchema>;
export type ConnectRequest = z.infer<typeof connectRequestSchema>;
export type SigilRequest = z.infer<typeof sigilRequestSchema>;
export type SigilEnvelope = z.infer<typeof sigilEnvelopeSchema>;
export type SigilPermission = z.infer<typeof permissionSchema>;

export type ParsedEnvelopeResult =
  | { envelope: SigilEnvelope; error: null }
  | { envelope: null; error: string };

export const REQUEST_TYPE_LABEL: Record<SigilRequest["type"], string> = {
  transfer: "Send QU",
  sc_call: "Contract call",
  sign_message: "Sign message",
  verify_message: "Verify signature",
  connect: "Connect",
};

export function isAllowedCallbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && isLocal);
  } catch {
    return false;
  }
}

export function parseSigilEnvelope(raw: string | null): ParsedEnvelopeResult {
  if (!raw) return { envelope: null, error: "No pending request" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = sigilEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return { envelope: null, error: firstIssue?.message ?? "Invalid request format" };
    }
    return { envelope: result.data, error: null };
  } catch {
    return { envelope: null, error: "Invalid request format" };
  }
}

function parseQuAmount(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  } catch {
    return null;
  }
  return null;
}

export function buildRequestNotification(input: SigilRequest): { title: string; body: string } | null {
  switch (input.type) {
    case "transfer": {
      const amount = parseQuAmount(input.amount);
      const to = truncateIdentity(input.to);
      return {
        title: "Request Waiting For Review",
        body: amount !== null ? `Transfer ${formatQu(amount)} QU to ${to}.` : `Transfer QU to ${to}.`,
      };
    }
    case "sc_call": {
      const amount = parseQuAmount(input.amount);
      const contractName = CONTRACT_NAMES[input.contract_index] ?? `Contract #${input.contract_index}`;
      const procedureName = CONTRACT_PROCEDURE_NAMES[`${input.contract_index}:${input.input_type}`] ?? null;
      const label = procedureName ? `${contractName} · ${procedureName}` : contractName;
      return {
        title: "Request Waiting For Review",
        body: amount !== null && amount > 0n ? `Contract call: ${label} for ${formatQu(amount)} QU.` : `Contract call: ${label}.`,
      };
    }
    case "sign_message":
      return { title: "Request Waiting For Review", body: "Message signing request received." };
    case "verify_message":
      return { title: "Request Waiting For Review", body: "Signature verification request received." };
    case "connect":
      return { title: "Request Waiting For Review", body: "Connection request received." };
    default:
      return null;
  }
}
