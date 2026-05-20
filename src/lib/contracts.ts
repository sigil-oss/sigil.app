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

// Human-readable overrides for contract names (auto-generated fallback used otherwise).
const CONTRACT_NAME_OVERRIDES: Record<string, string> = {
  COMPUTOR_CONTROLLED_FUND: "Computor Controlled Fund",
  ESCROW: "Escrow",
  GENERAL_QUORUM_PROPOSAL: "General Quorum Proposal",
  MS_VAULT: "MS Vault",
  MY_LAST_MATCH: "My Last Match",
  NOSTROMO: "Nostromo",
  PULSE: "Pulse",
  QBAY: "Qbay",
  QDRAW: "Qdraw",
  QEARN: "Qearn",
  QIP: "QIP",
  QSWAP: "Qswap",
  QUOTTERY: "Quottery",
  QUSINO: "Qusino",
  QVAULT: "QVault",
  QX: "QX",
  Q_BOND: "Q-Bond",
  Q_DUEL: "Q-Duel",
  Q_RAFFLE: "Q-Raffle",
  Q_RESERVE_POOL: "Q Reserve Pool",
  Q_RWA: "Q-RWA",
  Q_THIRTY_FOUR: "Q34",
  Q_UTIL: "QUtil",
  RANDOM: "Random",
  RANDOM_LOTTERY: "Random Lottery",
  SUPPLY_WATCHER: "Supply Watcher",
  VOTTUN_BRIDGE: "Vottun Bridge",
};

function toTitleCase(s: string): string {
  return s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

// Build lookup maps from all @qubic.org/contracts exports at module init time.
export const CONTRACT_NAMES: Record<number, string> = {};
export const CONTRACT_PROCEDURE_NAMES: Record<string, string> = {};

const prefixToIndex: Record<string, number> = {};

for (const [key, value] of Object.entries(contractPkg)) {
  if (typeof value !== "number" || !key.endsWith("_CONTRACT_INDEX")) continue;
  const prefix = key.slice(0, -"_CONTRACT_INDEX".length);
  prefixToIndex[prefix] = value;
  CONTRACT_NAMES[value] = CONTRACT_NAME_OVERRIDES[prefix] ?? toTitleCase(prefix);
}

for (const [key, value] of Object.entries(contractPkg)) {
  if (typeof value !== "number" || !key.endsWith("_INPUT_TYPE")) continue;
  let bestPrefix = "";
  for (const prefix of Object.keys(prefixToIndex)) {
    if (key.startsWith(prefix + "_") && prefix.length > bestPrefix.length) bestPrefix = prefix;
  }
  if (!bestPrefix) continue;
  const compositeKey = `${prefixToIndex[bestPrefix]}:${value}`;
  const proc = key.slice(bestPrefix.length + 1, -"_INPUT_TYPE".length);
  // Prefer write operations (non-GET) over read operations when types collide.
  if (!CONTRACT_PROCEDURE_NAMES[compositeKey] || proc.startsWith("GET_")) continue;
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
