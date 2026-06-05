import { deriveIdentityFromSeed, publicKeyFromSeed } from "@/lib/crypto";
import type { Seed } from "@/lib/crypto";
import type { SessionWallet } from "@/lib/session-wallet";

const encoder = new TextEncoder();

type SecretSeed = Uint8Array;

export interface BuildTxParams {
  accountIndex: number;
  destination: string;
  amount: bigint;
  targetTick: number;
  currentTick?: number;
  inputType: number;
  payload: Uint8Array;
}

export interface SignedTxResult {
  encoded: string;
  hash: string;
}

let activeSeeds: SecretSeed[] = [];

// ── Worker management ──────────────────────────────────────────────────────────

let _worker: Worker | null = null;
let _nextId = 0;
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getSigningWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("../workers/crypto.worker.ts", import.meta.url),
      { type: "module" },
    );
    _worker.onmessage = ({ data }: MessageEvent) => {
      const cb = _pending.get(data.id as number);
      if (!cb) return;
      _pending.delete(data.id as number);
      if (data.ok) cb.resolve(data);
      else cb.reject(new Error((data.error as string | undefined) ?? "Worker signing failed"));
    };
    _worker.onerror = (e) => {
      for (const [, cb] of _pending) cb.reject(new Error(e.message ?? "Worker error"));
      _pending.clear();
      _worker = null;
    };
  }
  return _worker;
}

function workerRequest<T>(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const id = _nextId++;
  return new Promise<T>((resolve, reject) => {
    _pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getSigningWorker().postMessage({ id, ...message }, transfer);
  });
}

// ── Seed management ────────────────────────────────────────────────────────────

function seedToBytes(seed: Seed): SecretSeed {
  return encoder.encode(seed);
}

function zeroBytes(bytes: Uint8Array) {
  bytes.fill(0);
}

function requireSeed(index: number): SecretSeed {
  const seed = activeSeeds[index];
  if (!seed) throw new Error("Unlocked account not available");
  return seed;
}

export function clearSecureSession() {
  for (const seed of activeSeeds) zeroBytes(seed);
  activeSeeds = [];
}

export function unlockSecureSession(seeds: Seed[]): SessionWallet[] {
  clearSecureSession();
  return seeds.map((seed) => {
    const publicKey = publicKeyFromSeed(seed);
    const identity = deriveIdentityFromSeed(seed);
    activeSeeds.push(seedToBytes(seed));
    return { identity, publicKey };
  });
}

// ── Signing — dispatched to the worker thread ──────────────────────────────────

async function buildSignedTransaction({
  accountIndex,
  destination,
  amount,
  targetTick,
  currentTick,
  inputType,
  payload,
}: BuildTxParams): Promise<SignedTxResult> {
  const seedCopy = requireSeed(accountIndex).slice(); // clone — don't detach activeSeeds entry
  return workerRequest<SignedTxResult>({
    type: "sign_tx",
    seed: seedCopy,
    destination,
    amount: amount.toString(),
    targetTick,
    currentTick,
    inputType,
    payload,
  }, [seedCopy.buffer]);
}

export function buildTransferFromSession(params: Omit<BuildTxParams, "inputType" | "payload">) {
  return buildSignedTransaction({ ...params, inputType: 0, payload: new Uint8Array(0) });
}

export function buildScTransactionFromSession(params: BuildTxParams) {
  return buildSignedTransaction(params);
}

export async function signMessageFromSession(accountIndex: number, messageBytes: Uint8Array) {
  const seedCopy = requireSeed(accountIndex).slice(); // clone — don't detach activeSeeds entry
  const result = await workerRequest<{ signature: Uint8Array; publicKey: Uint8Array; identity: string }>({
    type: "sign_message",
    seed: seedCopy,
    messageBytes,
  }, [seedCopy.buffer]);
  return {
    signature: new Uint8Array(result.signature),
    publicKey: new Uint8Array(result.publicKey),
    identity: result.identity,
  };
}
