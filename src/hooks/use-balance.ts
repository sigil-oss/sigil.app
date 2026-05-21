import { useVaultBalances } from "@/hooks/use-vault-balances";

/** Returns the balance for a single identity, drawn from the shared vault-wide getBalances16 poll. */
export function useBalance(identity: string | null | undefined) {
  const { data: balances, isLoading, isError, error } = useVaultBalances();
  const balance = identity ? (balances?.[identity] ?? null) : null;

  return {
    data: balance !== null ? { balance } : undefined,
    isLoading: !!identity && isLoading,
    isError,
    error,
  };
}
