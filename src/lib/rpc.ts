import { createQubicClient } from "@qubic.org/rpc";
export { createQubicClient };
export { estimateTargetTick, pollUntilConfirmed, waitForTick } from "@qubic.org/rpc";
export type {
  QubicClient,
  LiveClient,
  QueryClient,
  Result,
} from "@qubic.org/rpc";

export const DEFAULT_LIVE_URL = "https://rpc.qubic.org/live/v1";
export const DEFAULT_ARCHIVE_URL = "https://rpc.qubic.org/query/v1";

function validateRpcUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("RPC URL must use HTTPS");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

let _client = createQubicClient({
  liveBaseUrl: DEFAULT_LIVE_URL,
  archiveBaseUrl: DEFAULT_ARCHIVE_URL,
});

/** Returns the singleton Qubic RPC client. Re-created by `configureRpc` when endpoints change. */
export function getRpcClient() {
  return _client;
}

/** Replaces the singleton RPC client with new endpoint URLs — call when the user changes the network in settings. */
export function configureRpc(liveBaseUrl: string, archiveBaseUrl: string) {
  _client = createQubicClient({
    liveBaseUrl: validateRpcUrl(liveBaseUrl, DEFAULT_LIVE_URL),
    archiveBaseUrl: validateRpcUrl(archiveBaseUrl, DEFAULT_ARCHIVE_URL),
  });
}
