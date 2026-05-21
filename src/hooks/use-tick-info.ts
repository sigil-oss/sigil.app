import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { qk } from "@/lib/query-keys";

/** Polls current tick and epoch info every 5 s. Used as the network heartbeat. */
export function useTickInfo() {
  return useQuery({
    queryKey: qk.tickInfo(),
    queryFn: async () => {
      const result = await getRpcClient().live.getTickInfo();
      if (!result.ok) throw result.error;
      return result.value;
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
