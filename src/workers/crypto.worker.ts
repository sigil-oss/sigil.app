/// <reference lib="webworker" />

import {
  buildTransaction,
  computeTransactionHash,
  encodeTransaction,
  signTransaction,
} from "@qubic.org/tx";
import {
  deriveIdentityFromSeed,
  identityToPublicKey,
  k12,
  publicKeyFromSeed,
  sign,
} from "@qubic.org/crypto";
import { toIdentity, toSeed } from "@qubic.org/types";

type WorkerRequest =
  | {
      id: number;
      type: "sign_tx";
      seed: Uint8Array;
      destination: string;
      amount: string;
      targetTick: number;
      currentTick?: number;
      inputType: number;
      payload: Uint8Array;
    }
  | {
      id: number;
      type: "sign_message";
      seed: Uint8Array;
      messageBytes: Uint8Array;
    };

const _workerDecoder = new TextDecoder();

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "sign_tx") {
      const { id, seed, destination, amount, targetTick, currentTick, inputType, payload } = req;
      const typedSeed = toSeed(_workerDecoder.decode(seed));
      const sourcePublicKey = publicKeyFromSeed(typedSeed);
      const txBytes = buildTransaction({
        sourcePublicKey,
        destinationPublicKey: identityToPublicKey(toIdentity(destination)),
        amount: BigInt(amount),
        targetTick,
        inputType,
        ...(payload.byteLength > 0 ? { payload } : {}),
        ...(currentTick !== undefined ? { currentTick } : {}),
      });
      const signed = await signTransaction(txBytes, typedSeed);
      self.postMessage({ id, ok: true, encoded: encodeTransaction(signed), hash: computeTransactionHash(signed) });
    } else if (req.type === "sign_message") {
      const { id, seed, messageBytes } = req;
      const typedSeed = toSeed(_workerDecoder.decode(seed));
      const digest = k12(messageBytes, 32);
      const signature = await sign(digest, typedSeed);
      const publicKey = publicKeyFromSeed(typedSeed);
      const identity = deriveIdentityFromSeed(typedSeed);
      self.postMessage({ id, ok: true, signature, publicKey, identity });
    }
  } catch (err) {
    self.postMessage({
      id: (req as { id: number }).id,
      ok: false,
      error: err instanceof Error ? err.message : "Worker signing failed",
    });
  }
};
