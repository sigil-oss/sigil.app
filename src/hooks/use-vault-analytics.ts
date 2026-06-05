import { useQuery } from "@tanstack/react-query";
import { getRpcClient } from "@/lib/rpc";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { buildVaultAnalytics, type AnalyticsTxLike } from "@/lib/history-analytics";
import { getVaultAccountIdentity } from "@/lib/accounts";
import { dedupeTxRecords, normalizeArchiveTransaction } from "@/lib/tx-domain";

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // cap at 2 000 transactions per identity

async function fetchAllTransactionsForIdentity(identity: string, signal?: AbortSignal): Promise<AnalyticsTxLike[]> {
  const client = getRpcClient();
  const transactions: AnalyticsTxLike[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) break;
    const result = await client.archive.getTransactionsForIdentity({
      identity,
      pagination: { size: PAGE_SIZE, offset },
    });
    if (!result.ok) break;
    const records = result.value.transactions ?? [];
    const normalized = records
      .map(normalizeArchiveTransaction)
      .filter((tx): tx is NonNullable<typeof tx> => !!tx)
      .map((tx) => ({
        hash: tx.hash,
        source: tx.source,
        destination: tx.destination,
        amount: tx.amount,
        timestamp: tx.timestamp,
        moneyFlew: tx.moneyFlew,
      }));
    transactions.push(...normalized);
    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return transactions;
}

export function useVaultAnalytics() {
  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) => s.vaults.find((item) => item.id === s.settings.activeVaultId) ?? null);
  const wallets = useSessionStore((s) => s.wallets);

  const identities = (vault?.accounts ?? [])
    .filter((account) => !account.hidden)
    .map((account) => getVaultAccountIdentity(vault, account.index, wallets))
    .filter((identity): identity is string => !!identity);

  return useQuery({
    queryKey: ["vault-analytics", settings.activeVaultId, identities],
    queryFn: async ({ signal }) => {
      const all = await Promise.all(identities.map((identity) => fetchAllTransactionsForIdentity(identity, signal)));
      return buildVaultAnalytics(new Set(identities), dedupeTxRecords(all.flat()));
    },
    enabled: identities.length > 0,
    staleTime: 60_000,
  });
}
