import { useQuery } from "@tanstack/react-query";
import { qUtilGetBalances16 } from "@qubic.org/contracts";
import { getRpcClient } from "@/lib/rpc";
import { identityToPublicKey } from "@/lib/crypto";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";
import { qk } from "@/lib/query-keys";
import { usePollingIntervalMs } from "@/hooks/use-polling-profile";
import type { Identity } from "@qubic.org/types";

const idToPk = (id: string) => identityToPublicKey(id as Identity);

export const MAX_VAULT_ACCOUNTS = 16;

/** Polls balances for all unlocked wallet accounts in one getBalances16 SC query.
 *  When locked and notifyWhenLocked is enabled, falls back to identities cached at last unlock. */
export function useVaultBalances() {
  const wallets = useSessionStore((s) => s.wallets);
  const cachedIdentities = useSessionStore((s) => s.cachedIdentities);
  const notifyWhenLocked = usePersistedStore((s) => s.settings.notifyWhenLocked);
  const pollingIntervalMs = usePollingIntervalMs();

  const liveIdentities = wallets.slice(0, MAX_VAULT_ACCOUNTS).map((w) => w.identity);
  const identities = liveIdentities.length > 0
    ? liveIdentities
    : (notifyWhenLocked ? cachedIdentities : []);

  return useQuery({
    queryKey: qk.vaultBalances(identities),
    queryFn: async () => {
      const result = await qUtilGetBalances16(
        getRpcClient().live,
        { publicKeys: identities },
        { identityToPublicKey: idToPk },
      );
      if (!result.ok) throw result.error;
      const balances = result.value.balances;
      if (balances.length < identities.length) {
        throw new Error(`balance response length mismatch: expected at least ${identities.length}, got ${balances.length}`);
      }
      const map: Record<string, bigint> = {};
      for (let i = 0; i < identities.length; i++) {
        map[identities[i]] = balances[i];
      }
      return map;
    },
    enabled: identities.length > 0,
    refetchInterval: pollingIntervalMs,
    refetchIntervalInBackground: true,
  });
}
