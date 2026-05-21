import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { qk } from "@/lib/query-keys";

/** Polls the active account balance every 5 s. Disabled when `identity` is nullish. */
export function useBalance(identity: string | null | undefined) {
  return useQuery({
    queryKey: qk.balance(identity ?? null),
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
