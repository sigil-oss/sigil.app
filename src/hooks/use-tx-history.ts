import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";

export function useTxHistory(identity: string | null | undefined) {
  return useQuery({
    queryKey: ["tx-history", identity],
    queryFn: async () => {
      const result = await getRpcClient().archive.getTransactionsForIdentity({
        identity: identity!,
        pagination: { size: 50, offset: 0 },
      });
      if (!result.ok) throw result.error;
      return result.value.transactions;
    },
    enabled: !!identity,
    refetchInterval: 10_000,
  });
}
