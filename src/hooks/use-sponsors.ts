import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { DONATION_IDENTITY, SPONSOR_NAMES_URL, type Sponsor } from "@/data/sponsors";

export const SPONSORS_QUERY_KEY = ["sponsors"] as const;

const PAGE_SIZE = 100;

async function fetchNameOverrides(): Promise<Record<string, string>> {
  try {
    const res = await fetch(SPONSOR_NAMES_URL);
    return res.ok ? res.json() : {};
  } catch {
    return {};
  }
}

async function fetchAllTransactions() {
  const client = getRpcClient();
  const all: { source?: string; destination?: string; amount?: string; moneyFlew?: boolean }[] = [];
  let offset = 0;
  while (true) {
    const result = await client.archive.getTransactionsForIdentity({
      identity: DONATION_IDENTITY,
      pagination: { size: PAGE_SIZE, offset },
    });
    if (!result.ok) break;
    const page = result.value.transactions;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function fetchSponsors(): Promise<Sponsor[]> {
  const [txs, nameOverrides] = await Promise.all([
    fetchAllTransactions(),
    fetchNameOverrides(),
  ]);

  // Accumulate all confirmed incoming transfers per sender — multiple donations add up.
  const totals = new Map<string, number>();
  for (const tx of txs) {
    if (tx.destination !== DONATION_IDENTITY) continue;
    if (!tx.moneyFlew) continue;
    if (!tx.source || !tx.amount) continue;
    totals.set(tx.source, (totals.get(tx.source) ?? 0) + Number(tx.amount));
  }

  return [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([identity, amount]) => ({
      name: nameOverrides[identity] ?? truncate(identity),
      amount,
    }));
}

function truncate(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

export function useSponsors() {
  return useQuery({
    queryKey: SPONSORS_QUERY_KEY,
    queryFn: fetchSponsors,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}

export function useInvalidateSponsors() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SPONSORS_QUERY_KEY });
}
