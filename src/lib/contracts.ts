import { contractIndexToIdentity } from "@qubic.org/crypto";
import {
  Q_UTIL_CONTRACT_INDEX,
  Q_UTIL_SEND_TO_MANY_V1_INPUT_TYPE,
  buildQUtilBurnQubicInput,
  qUtilGetSendToManyV1Fee,
  QEARN_CONTRACT_INDEX,
  QEARN_LOCK_INPUT_TYPE,
  buildQearnUnlockInput,
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
};

// Pre-computed contract destination identities.
export const QUTIL_ADDRESS = contractIndexToIdentity(Q_UTIL_CONTRACT_INDEX);
export const QEARN_ADDRESS = contractIndexToIdentity(QEARN_CONTRACT_INDEX);
