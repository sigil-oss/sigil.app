import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { getBobRestClient } from "@/lib/bob-client";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { qk } from "@/lib/query-keys";

/** Polls the archive for the last processed tick every 3 s. Used to detect when pending txs should be confirmed. */
export function useLastProcessedTick() {
  const useBobNode = usePersistedStore((s) => s.settings.network.useBobNode);
  const bobRestUrl = usePersistedStore((s) => s.settings.network.bobRestUrl);
  const tickOffset = usePersistedStore((s) => s.settings.tickOffset);
  const bobSyncLag = useSessionStore((s) => s.bobSyncLag);
  const bobIsHealthy = bobSyncLag === null || bobSyncLag <= tickOffset;
  const useBob = useBobNode && !!bobRestUrl && bobIsHealthy;

  return useQuery({
    queryKey: [...qk.lastProcessedTick(), useBob ? "bob" : "rpc"],
    queryFn: async () => {
      if (useBob) {
        const result = await getBobRestClient(bobRestUrl!).getStatus();
        if (!result.ok) throw result.error;
        const s = result.value as Record<string, unknown>;
        // currentIndexingTick = last fully indexed tick (most conservative for pending tx confirmation)
        const tick = ((s.currentIndexingTick ?? s.currentFetchingTick ?? s.tick) as number | undefined) ?? 0;
        return { tickNumber: tick };
      }
      const result = await getRpcClient().archive.getLastProcessedTick();
      if (!result.ok) throw result.error;
      return result.value;
    },
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
}
