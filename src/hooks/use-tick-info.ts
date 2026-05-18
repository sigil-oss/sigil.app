import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";

export function useTickInfo() {
  return useQuery({
    queryKey: ["tick-info"],
    queryFn: async () => {
      const result = await getRpcClient().live.getTickInfo();
      if (!result.ok) throw result.error;
      return result.value;
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
