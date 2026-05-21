import { createBobRpcClient, createBobRestClient } from "@qubic.org/bob";
import type { BobRpcClient, BobRestClient } from "@qubic.org/bob";

let _rpcClient: BobRpcClient | null = null;
let _restClient: BobRestClient | null = null;
let _endpoint: string | null = null;

function maybeRecreate(endpoint: string) {
  if (_endpoint !== endpoint) {
    _rpcClient = createBobRpcClient({ endpoint });
    _restClient = createBobRestClient({ baseUrl: endpoint });
    _endpoint = endpoint;
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
