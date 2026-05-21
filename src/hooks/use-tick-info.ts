import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { getBobRestClient } from "@/lib/bob-client";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { qk } from "@/lib/query-keys";

/** Polls current tick and epoch info every 5 s. Used as the network heartbeat. */
export function useTickInfo() {
  const useBobNode = usePersistedStore((s) => s.settings.network.useBobNode);
  const bobRestUrl = usePersistedStore((s) => s.settings.network.bobRestUrl);
  const tickOffset = usePersistedStore((s) => s.settings.tickOffset);
  const bobSyncLag = useSessionStore((s) => s.bobSyncLag);
  const bobIsHealthy = bobSyncLag === null || bobSyncLag <= tickOffset;
  const useBob = useBobNode && !!bobRestUrl && bobIsHealthy;

  return useQuery({
    queryKey: [...qk.tickInfo(), useBob ? "bob" : "rpc"],
    queryFn: async () => {
      if (useBob) {
        const result = await getBobRestClient(bobRestUrl!).getStatus();
        if (!result.ok) throw result.error;
        const s = result.value as Record<string, unknown>;
        return {
          tick: ((s.currentFetchingTick ?? s.currentTick ?? s.tick) as number | undefined) ?? 0,
          epoch: ((s.currentProcessingEpoch ?? s.currentEpoch ?? s.epoch) as number | undefined) ?? 0,
          duration: 0,
          initialTick: 0,
        };
      }
      const result = await getRpcClient().live.getTickInfo();
      if (!result.ok) throw result.error;
      return result.value;
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
