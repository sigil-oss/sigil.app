import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { qk } from "@/lib/query-keys";

export type TxHistoryItem = {
  hash: string;
  source: string | null;
  destination: string | null;
  amount: string;
  tickNumber: number;
  moneyFlew: boolean;
};

/** Fetches tx history for `identity`, polling every 10 s.
 *  Primary: getTransactionsForIdentity (full history).
 *  Supplement: getEventLogs QuTransfer events (last ~2 weeks) for SC-initiated payouts
 *  (e.g. QUTIL distributions) that don't appear in the transaction index.
 */
export function useTxHistory(identity: string | null | undefined) {
  return useQuery({
    queryKey: qk.txHistory(identity ?? null),
    queryFn: async () => {
      const [txResult, evtResult] = await Promise.allSettled([
        getRpcClient().archive.getTransactionsForIdentity({
          identity: identity!,
          pagination: { size: 50, offset: 0 },
        }),
        getRpcClient().archive.getEventLogs({
          should: [{ terms: { source: identity!, destination: identity! } }],
          pagination: { size: 50, offset: 0 },
        }),
      ]);

      if (txResult.status === "rejected") throw txResult.reason;
      if (!txResult.value.ok) throw txResult.value.error;

      const items = new Map<string, TxHistoryItem>();

      for (const tx of txResult.value.value.transactions ?? []) {
        if (!tx.hash) continue;
        items.set(tx.hash, {
          hash: tx.hash,
          source: tx.source ?? null,
          destination: tx.destination ?? null,
          amount: tx.amount ?? "0",
          tickNumber: tx.tickNumber ?? 0,
          moneyFlew: tx.moneyFlew ?? true,
        });
      }

      // Add event-log entries not already covered by transactions (SC payouts)
      if (evtResult.status === "fulfilled" && evtResult.value.ok) {
        for (const evt of evtResult.value.value.eventLogs ?? []) {
          if (!evt.transactionHash || !evt.quTransfer) continue;
          if (items.has(evt.transactionHash)) continue;
          items.set(evt.transactionHash, {
            hash: evt.transactionHash,
            source: evt.quTransfer.source ?? null,
            destination: evt.quTransfer.destination ?? null,
            amount: evt.quTransfer.amount ?? "0",
            tickNumber: evt.tickNumber ?? 0,
            moneyFlew: true,
          });
        }
      }

      return Array.from(items.values())
        .sort((a, b) => b.tickNumber - a.tickNumber)
        .slice(0, 50);
    },
    enabled: !!identity,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
