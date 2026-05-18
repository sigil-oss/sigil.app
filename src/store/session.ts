import { create } from "zustand";
import type { Seed } from "@qubic.org/types";
import type { Wallet } from "@qubic.org/wallet";

interface SessionState {
  unlockedVaultId: string | null;
  seeds: Seed[];
  wallets: Wallet[];
  pendingRequest: string | null;
  isLocked: boolean;

  unlock: (vaultId: string, seeds: Seed[], wallets: Wallet[]) => void;
  lock: () => void;
  setPendingRequest: (raw: string | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  unlockedVaultId: null,
  seeds: [],
  wallets: [],
  pendingRequest: null,
  isLocked: true,

  unlock: (vaultId, seeds, wallets) =>
    set({ unlockedVaultId: vaultId, seeds, wallets, isLocked: false }),

  lock: () =>
    set({ unlockedVaultId: null, seeds: [], wallets: [], isLocked: true }),

  setPendingRequest: (raw) => set({ pendingRequest: raw }),
}));
