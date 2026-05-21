import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { qk } from "@/lib/query-keys";

/** Polls the archive for the last processed tick every 3 s. Used to detect when pending txs should be confirmed. */
export function useLastProcessedTick() {
  return useQuery({
    queryKey: qk.lastProcessedTick(),
    queryFn: async () => {
      const result = await getRpcClient().archive.getLastProcessedTick();
      if (!result.ok) throw result.error;
      return result.value;
    },
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
}
