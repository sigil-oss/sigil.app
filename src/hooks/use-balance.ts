import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { getBobRestClient } from "@/lib/bob-client";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { qk } from "@/lib/query-keys";

/** Polls the active account balance every 5 s. Disabled when `identity` is nullish. */
export function useBalance(identity: string | null | undefined) {
  const useBobNode = usePersistedStore((s) => s.settings.network.useBobNode);
  const bobRestUrl = usePersistedStore((s) => s.settings.network.bobRestUrl);
  const tickOffset = usePersistedStore((s) => s.settings.tickOffset);
  const bobSyncLag = useSessionStore((s) => s.bobSyncLag);
  const bobIsHealthy = bobSyncLag === null || bobSyncLag <= tickOffset;
  const useBob = useBobNode && !!bobRestUrl && bobIsHealthy;

  return useQuery({
    queryKey: [...qk.balance(identity ?? null), useBob ? "bob" : "rpc"],
    queryFn: async () => {
      if (useBob) {
        const result = await getBobRestClient(bobRestUrl!).getBalance(identity!);
        if (!result.ok) throw result.error;
        const b = result.value as Record<string, unknown>;
        return {
          id: identity!,
          balance: BigInt(String(b.balance ?? 0)),
          validForTick: (b.currentTick as number | undefined) ?? 0,
          latestIncomingTransferTick: 0,
          latestOutgoingTransferTick: 0,
          incomingAmount: 0n,
          outgoingAmount: 0n,
          numberOfIncomingTransfers: 0,
          numberOfOutgoingTransfers: 0,
        };
      }
      const result = await getRpcClient().live.getBalance(identity!);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: !!identity,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
