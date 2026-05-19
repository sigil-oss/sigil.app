import { contractIndexToIdentity } from "@qubic.org/crypto";

// Verify indices against the Qubic protocol source before shipping.
export const QUTIL = {
  index: 4,
  address: contractIndexToIdentity(4),
  SendToManyV1: 1,
  BurnQu: 2,
} as const;

export const QEARN = {
  index: 6,
  address: contractIndexToIdentity(6),
  LockInQearn: 1,
  UnlockInQearn: 2,
} as const;
