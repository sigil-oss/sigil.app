import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { VaultData } from "@qubic.org/wallet";

export type VaultColor = "slate" | "red" | "amber" | "emerald" | "sky" | "violet";

export interface AccountMeta {
  index: number;
  name: string;
  addedAt: number;
  hidden: boolean;
}

export interface VaultMeta {
  id: string;
  name: string;
  color: VaultColor;
  createdAt: number;
  lastUnlockedAt: number;
  accounts: AccountMeta[];
  encryptedData: VaultData;
}

export interface NetworkConfig {
  liveApiUrl: string;
  queryApiUrl: string;
  name: "mainnet" | "testnet" | "custom";
}

export interface ApprovedDapp {
  origin: string;
  name: string;
  approvedAt: number;
  permissions: ("transfer" | "sc_call" | "sign_message")[];
}

export interface AppSettings {
  autoLockMinutes: number;
  lockOnSleep: boolean;
  lockOnWindowBlur: boolean;
  clipboardClearSeconds: number;
  theme: "dark" | "light" | "system";
  network: NetworkConfig;
  activeVaultId: string | null;
  activeAccountIndex: number;
  hideBalances: boolean;
  approvedDapps: ApprovedDapp[];
  currency: "USD" | "EUR" | "BTC";
}

export interface Contact {
  id: string;
  name: string;
  identity: string;
  note: string;
  addedAt: number;
  lastUsedAt: number;
}

export interface PendingTx {
  hash: string;
  source: string;
  destination: string;
  amount: string;
  targetTick: number;
  broadcastAt: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 15,
  lockOnSleep: true,
  lockOnWindowBlur: false,
  clipboardClearSeconds: 30,
  theme: "dark",
  network: {
    liveApiUrl: "https://rpc.qubic.org/live/v1",
    queryApiUrl: "https://rpc.qubic.org/query/v1",
    name: "mainnet",
  },
  activeVaultId: null,
  activeAccountIndex: 0,
  hideBalances: false,
  approvedDapps: [],
  currency: "USD",
};

const _disk = new LazyStore("sigil.json");

const tauriStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await _disk.get<string>(name)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await _disk.set(name, value);
      await _disk.save();
    } catch {
      // non-fatal — state lives in memory regardless
    }
  },
  removeItem: async (name) => {
    try {
      await _disk.delete(name);
      await _disk.save();
    } catch {}
  },
};

interface PersistedState {
  vaults: VaultMeta[];
  settings: AppSettings;
  contacts: Contact[];
  pendingTxs: PendingTx[];
  addVault: (vault: VaultMeta) => void;
  updateVault: (id: string, updates: Partial<Omit<VaultMeta, "id">>) => void;
  removeVault: (id: string) => void;
  setActiveVault: (id: string | null) => void;
  setActiveAccountIndex: (index: number) => void;
  touchVaultUnlocked: (id: string) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: string, updates: Partial<Omit<Contact, "id">>) => void;
  removeContact: (id: string) => void;
  addPendingTx: (tx: PendingTx) => void;
  removePendingTx: (hash: string) => void;
}

export const usePersistedStore = create<PersistedState>()(
  persist(
    (set) => ({
      vaults: [],
      settings: DEFAULT_SETTINGS,
      contacts: [],
      pendingTxs: [],

      addVault: (vault) =>
        set((s) => ({
          vaults: [...s.vaults, vault],
          settings: { ...s.settings, activeVaultId: vault.id },
        })),

      updateVault: (id, updates) =>
        set((s) => ({
          vaults: s.vaults.map((v) => (v.id === id ? { ...v, ...updates } : v)),
        })),

      removeVault: (id) =>
        set((s) => {
          const vaults = s.vaults.filter((v) => v.id !== id);
          const activeVaultId =
            s.settings.activeVaultId === id
              ? (vaults[0]?.id ?? null)
              : s.settings.activeVaultId;
          return { vaults, settings: { ...s.settings, activeVaultId } };
        }),

      setActiveVault: (id) =>
        set((s) => ({
          settings: { ...s.settings, activeVaultId: id, activeAccountIndex: 0 },
        })),

      setActiveAccountIndex: (index) =>
        set((s) => ({ settings: { ...s.settings, activeAccountIndex: index } })),

      touchVaultUnlocked: (id) =>
        set((s) => ({
          vaults: s.vaults.map((v) =>
            v.id === id ? { ...v, lastUnlockedAt: Date.now() } : v,
          ),
        })),

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      addContact: (contact) => set((s) => ({ contacts: [...s.contacts, contact] })),

      updateContact: (id, updates) =>
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      removeContact: (id) =>
        set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

      addPendingTx: (tx) =>
        set((s) => ({ pendingTxs: [tx, ...s.pendingTxs] })),

      removePendingTx: (hash) =>
        set((s) => ({ pendingTxs: s.pendingTxs.filter((t) => t.hash !== hash) })),
    }),
    {
      name: "sigil-persisted",
      storage: createJSONStorage(() => tauriStorage),
    },
  ),
);
