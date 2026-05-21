import { isValidIdentity } from "@/lib/crypto";

export interface Sponsor {
  name: string;
  amount: number; // QU contributed
}

/** Qubic identity that receives donation QU for Sigil development. */
export const DONATION_IDENTITY =
  "UVYAOYTNYCRBVFBHNFIJUEOUEPEDIDUWWEAXKFSJEBJVASCQEROJOVOEEATL";

if (!isValidIdentity(DONATION_IDENTITY)) {
  throw new Error(`[sigil] DONATION_IDENTITY is not a valid Qubic address: ${DONATION_IDENTITY}`);
}

/** JSON map of identity → display name for known donors. Fetched at runtime so merged PRs reflect without a rebuild. */
export const SPONSOR_NAMES_URL =
  "https://raw.githubusercontent.com/sigil-oss/sigil.app/main/sponsor-names.json";
