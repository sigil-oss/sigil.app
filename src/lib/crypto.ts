export type { Identity, Seed } from "@qubic.org/types";
export {
  toSeed,
  isIdentity,
  isSeed,
  InvalidSeedError,
  InvalidIdentityError,
} from "@qubic.org/types";
export {
  generateRandomSeed,
  deriveIdentityFromSeed,
  publicKeyFromSeed,
  identityToPublicKey,
  publicKeyToIdentity,
  sign,
  verify,
  k12,
} from "@qubic.org/crypto";

import { identityToPublicKey as _identityToPublicKey } from "@qubic.org/crypto";
import { truncateId } from "@/lib/format";

/** Full identity validation: checks format AND the 4-char checksum embedded in positions 56–59. */
export function isValidIdentity(s: string): boolean {
  try {
    _identityToPublicKey(s as import("@qubic.org/types").Identity);
    return true;
  } catch {
    return false;
  }
}

/** Shorthand for `truncateId(identity, 10, 10)` — shows first 10 and last 10 characters. */
export function truncateIdentity(identity: string): string {
  return truncateId(identity, 10, 10);
}
