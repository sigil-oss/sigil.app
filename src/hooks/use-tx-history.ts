import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { qk } from "@/lib/query-keys";

/** Fetches the last 50 transactions for `identity`, polling every 10 s. Disabled when `identity` is nullish. */
export function useTxHistory(identity: string | null | undefined) {
  return useQuery({
    queryKey: qk.txHistory(identity ?? null),
    queryFn: async () => {
      const result = await getRpcClient().archive.getTransactionsForIdentity({
        identity: identity!,
        pagination: { size: 50, offset: 0 },
      });
      if (!result.ok) throw result.error;
      return result.value.transactions;
    },
    enabled: !!identity,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
