import { createBobRpcClient, createBobRestClient } from "@qubic.org/bob";
import type { BobRpcClient, BobRestClient } from "@qubic.org/bob";

let _rpcClient: BobRpcClient | null = null;
let _restClient: BobRestClient | null = null;
let _endpoint: string | null = null;

export function validateBobUrl(endpoint: string): string {
  const parsed = new URL(endpoint);
  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol === "https:") return parsed.toString().replace(/\/$/, "");
  if (parsed.protocol === "http:" && isLocalhost) return parsed.toString().replace(/\/$/, "");

  throw new Error("Bob endpoint must use HTTPS or local HTTP");
}

export function validateBobWsUrl(endpoint: string): string {
  const parsed = new URL(endpoint);
  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol === "wss:") return parsed.toString();
  if (parsed.protocol === "ws:" && isLocalhost) return parsed.toString();

  throw new Error("Bob WebSocket endpoint must use WSS or local WS");
}

function maybeRecreate(endpoint: string) {
  const validated = validateBobUrl(endpoint);
  if (_endpoint !== validated) {
    _rpcClient = createBobRpcClient({ endpoint: validated });
    _restClient = createBobRestClient({ baseUrl: validated });
    _endpoint = validated;
  }
}

export function getBobRpcClient(endpoint: string): BobRpcClient {
  maybeRecreate(endpoint);
  return _rpcClient!;
}

export function getBobRestClient(baseUrl: string): BobRestClient {
  maybeRecreate(baseUrl);
  return _restClient!;
}
