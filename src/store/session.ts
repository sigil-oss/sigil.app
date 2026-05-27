import { create } from "zustand";
import { clearSecureSession } from "@/lib/secure-session";
import type { SessionWallet } from "@/lib/session-wallet";

export interface TxAlert {
  id: string;
  label: string;
  reason: "expired" | "failed";
}

interface SessionState {
  unlockedVaultId: string | null;
  wallets: SessionWallet[];
  /** Last set of vault identities from the most recent unlock — used for balance polling while locked. */
  cachedIdentities: string[];
  pendingRequests: string[];
  isLocked: boolean;
  txAlerts: TxAlert[];

  unlock: (
    vaultId: string,
    wallets: SessionWallet[],
    options?: { identities?: string[]; watchOnly?: boolean },
  ) => void;
  lock: () => void;
  enqueuePendingRequest: (raw: string) => void;
  shiftPendingRequest: () => void;
  addTxAlert: (alert: TxAlert) => void;
  dismissTxAlert: (id: string) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  unlockedVaultId: null,
  wallets: [],
  cachedIdentities: [],
  pendingRequests: [],
  isLocked: true,
  txAlerts: [],

  unlock: (vaultId, wallets, options) => {
    if (options?.watchOnly) clearSecureSession();
    set({
      unlockedVaultId: vaultId,
      wallets,
      isLocked: false,
      cachedIdentities: options?.identities ?? wallets.map((w) => w.identity),
    });
  },

  lock: () => {
    clearSecureSession();
    set({ unlockedVaultId: null, wallets: [], isLocked: true });
  },

  enqueuePendingRequest: (raw) =>
    set((s) => ({ pendingRequests: [...s.pendingRequests, raw] })),

  shiftPendingRequest: () =>
    set((s) => ({ pendingRequests: s.pendingRequests.slice(1) })),

  addTxAlert: (alert) =>
    set((s) => ({ txAlerts: s.txAlerts.some((a) => a.id === alert.id) ? s.txAlerts : [...s.txAlerts, alert] })),

  dismissTxAlert: (id) =>
    set((s) => ({ txAlerts: s.txAlerts.filter((a) => a.id !== id) })),
}));
