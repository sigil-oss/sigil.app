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

export function truncateIdentity(identity: string): string {
  if (identity.length <= 20) return identity;
  return `${identity.slice(0, 10)}...${identity.slice(-10)}`;
}
