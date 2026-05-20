import { contractIndexToIdentity } from "@qubic.org/crypto";
import * as contractPkg from "@qubic.org/contracts";
import {
  Q_UTIL_CONTRACT_INDEX,
  Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE,
  buildQUtilBurnQubicInput,
  qUtilGetSendToManyV1Fee,
  QEARN_CONTRACT_INDEX,
  QEARN_LOCK_INPUT_TYPE,
  buildQearnUnlockInput,
  qearnGetUserLockStatus,
  qearnGetUserLockedInfo,
  qearnGetLockInfoPerEpoch,
} from "@qubic.org/contracts";

export type { ContractCall } from "@qubic.org/contracts";

export {
  Q_UTIL_CONTRACT_INDEX,
  Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE,
  buildQUtilBurnQubicInput,
  qUtilGetSendToManyV1Fee,
  QEARN_CONTRACT_INDEX,
  QEARN_LOCK_INPUT_TYPE,
  buildQearnUnlockInput,
  qearnGetUserLockStatus,
  qearnGetUserLockedInfo,
  qearnGetLockInfoPerEpoch,
};

// Human-readable names keyed by the camelCase namespace export (tree-shake safe).
const NAMESPACE_TO_NAME: Record<string, string> = {
  computorControlledFund: "Computor Controlled Fund",
  escrow: "Escrow",
  generalQuorumProposal: "General Quorum Proposal",
  msVault: "MS Vault",
  myLastMatch: "My Last Match",
  nostromo: "Nostromo",
  pulse: "Pulse",
  qBond: "Q-Bond",
  qDuel: "Q-Duel",
  qIP: "QIP",
  qRWA: "Q-RWA",
  qRaffle: "Q-Raffle",
  qReservePool: "Q Reserve Pool",
  qThirtyFour: "Q34",
  qUtil: "QUtil",
  qVAULT: "QVault",
  qbay: "Qbay",
  qdraw: "Qdraw",
  qearn: "Qearn",
  qswap: "Qswap",
  quottery: "Quottery",
  qusino: "Qusino",
  qx: "QX",
  random: "Random",
  randomLottery: "Random Lottery",
  supplyWatcher: "Supply Watcher",
  vottunBridge: "Vottun Bridge",
};

function toTitleCase(s: string): string {
  return s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

// Build lookup maps from all @qubic.org/contracts exports at module init time.
export const CONTRACT_NAMES: Record<number, string> = {};
export const CONTRACT_PROCEDURE_NAMES: Record<string, string> = {};

const prefixToIndex: Record<string, number> = {};

// CONTRACT_NAMES: use namespace objects (always exported regardless of tree-shaking).
for (const [key, value] of Object.entries(contractPkg)) {
  if (typeof value !== "object" || value === null || typeof (value as Record<string, unknown>).contractIndex !== "number") continue;
  const contractIndex = (value as Record<string, unknown>).contractIndex as number;
  CONTRACT_NAMES[contractIndex] = NAMESPACE_TO_NAME[key] ?? key;
}

// prefixToIndex: built from _CONTRACT_INDEX exports available in the pre-bundle.
for (const [key, value] of Object.entries(contractPkg)) {
  if (typeof value !== "number" || !key.endsWith("_CONTRACT_INDEX")) continue;
  prefixToIndex[key.slice(0, -"_CONTRACT_INDEX".length)] = value;
}

// CONTRACT_PROCEDURE_NAMES: from _INPUT_TYPE exports; prefer write ops over GET reads.
for (const [key, value] of Object.entries(contractPkg)) {
  if (typeof value !== "number" || !key.endsWith("_INPUT_TYPE")) continue;
  let bestPrefix = "";
  for (const prefix of Object.keys(prefixToIndex)) {
    if (key.startsWith(prefix + "_") && prefix.length > bestPrefix.length) bestPrefix = prefix;
  }
  if (!bestPrefix) continue;
  const compositeKey = `${prefixToIndex[bestPrefix]}:${value}`;
  const proc = key.slice(bestPrefix.length + 1, -"_INPUT_TYPE".length);
  if (CONTRACT_PROCEDURE_NAMES[compositeKey] || proc.startsWith("GET_")) continue;
  CONTRACT_PROCEDURE_NAMES[compositeKey] = toTitleCase(proc);
}

// Pre-computed contract destination identities.
export const QUTIL_ADDRESS = contractIndexToIdentity(Q_UTIL_CONTRACT_INDEX);
export const QEARN_ADDRESS = contractIndexToIdentity(QEARN_CONTRACT_INDEX);

// Build full known-addresses map from all contract indices.
export const KNOWN_CONTRACT_ADDRESSES: Record<string, string> = {};
for (const [idx, name] of Object.entries(CONTRACT_NAMES)) {
  KNOWN_CONTRACT_ADDRESSES[contractIndexToIdentity(Number(idx)) as string] = name;
}
