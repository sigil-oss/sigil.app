import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";

export function useBalance(identity: string | null | undefined) {
  return useQuery({
    queryKey: ["balance", identity],
    queryFn: async () => {
      const result = await getRpcClient().live.getBalance(identity!);
      if (!result.ok) throw result.error;
      return result.value;
    },
    enabled: !!identity,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
