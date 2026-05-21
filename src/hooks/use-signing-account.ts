import { useState } from "react";
import { useSessionStore } from "@/store/session";
import { usePersistedStore } from "@/store/persisted";

export interface SigningAccount {
  wallet: ReturnType<typeof useSessionStore.getState>["wallets"][number] | null;
  accountName: string;
  /** Set when `from` was specified but the identity isn't in the unlocked vault. */
  fromError: string | null;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  /** Show account picker — true when from is omitted and vault has >1 account. */
  showPicker: boolean;
}

/** Resolves the wallet and account name for signing, optionally pinned to a specific `from` identity. */
export function useSigningAccount(from?: string): SigningAccount {
  const wallets = useSessionStore((s) => s.wallets);
  const settings = usePersistedStore((s) => s.settings);
  const vault = usePersistedStore((s) =>
    s.vaults.find((v) => v.id === s.settings.activeVaultId),
  );

  const [selectedIndex, setSelectedIndex] = useState(settings.activeAccountIndex);

  const nameAt = (i: number) => vault?.accounts[i]?.name ?? `Account ${i + 1}`;

  if (from) {
    const idx = wallets.findIndex((w) => w.identity === from);
    if (idx === -1) {
      return {
        wallet: null,
        accountName: "",
        fromError: "IDENTITY NOT IN THIS VAULT",
        selectedIndex: -1,
        setSelectedIndex,
        showPicker: false,
      };
    }
    return {
      wallet: wallets[idx],
      accountName: nameAt(idx),
      fromError: null,
      selectedIndex: idx,
      setSelectedIndex,
      showPicker: false,
    };
  }

  const effectiveIndex = Math.min(selectedIndex, wallets.length - 1);
  return {
    wallet: wallets[effectiveIndex] ?? null,
    accountName: nameAt(effectiveIndex),
    fromError: null,
    selectedIndex: effectiveIndex,
    setSelectedIndex,
    showPicker: wallets.length > 1,
  };
}
