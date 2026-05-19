import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";

export function useLastProcessedTick() {
  return useQuery({
    queryKey: ["last-processed-tick"],
    queryFn: async () => {
      const result = await getRpcClient().archive.getLastProcessedTick();
      if (!result.ok) throw result.error;
      return result.value;
    },
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
}
