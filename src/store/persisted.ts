import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { VaultData } from "@qubic.org/wallet";

export type VaultColor = "slate" | "red" | "amber" | "emerald" | "sky" | "violet";
export type FontPairId = "default" | "inter" | "ibm" | "roboto" | "fira";
export type AccentColorId = "green" | "amber" | "sky" | "violet" | "rose" | "mono";

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
  theme: "dark" | "graphite" | "midnight" | "light" | "system";
  network: NetworkConfig;
  activeVaultId: string | null;
  activeAccountIndex: number;
  hideBalances: boolean;
  approvedDapps: ApprovedDapp[];
  currency: "USD" | "EUR" | "BTC";
  tickOffset: number;
  debugMode: boolean;
  biometricVaultIds: string[];
  fontPair: FontPairId;
  accentColor: AccentColorId;
  customScheme: { bg: string; text: string } | null;
  notificationsEnabled: boolean;
  notifyOnReceived: boolean;
  notifyOnSent: boolean;
  notifyOnConfirmed: boolean;
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
  contractName?: string; // present for SC calls, e.g. "QUtil · Send to Many"
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
  tickOffset: 10,
  debugMode: false,
  biometricVaultIds: [],
  fontPair: "default",
  accentColor: "green",
  customScheme: null,
  notificationsEnabled: false,
  notifyOnReceived: true,
  notifyOnSent: true,
  notifyOnConfirmed: true,
};

const _disk = new LazyStore("sigil.json");

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

const tauriStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await withTimeout(_disk.get<string>(name), 1500)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await _disk.set(name, value);
      await _disk.save();
    } catch (err) {
      console.error("[sigil] disk write failed, retrying once:", err);
      try {
        await _disk.set(name, value);
        await _disk.save();
      } catch (err2) {
        console.error("[sigil] disk write failed permanently — data may be lost on restart:", err2);
        window.dispatchEvent(new CustomEvent("sigil:disk-write-error"));
      }
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
  /** Removes the vault; if it was active, falls back to the first remaining vault (or null). */
  removeVault: (id: string) => void;
  /** Sets the active vault and resets `activeAccountIndex` to 0. */
  setActiveVault: (id: string | null) => void;
  setActiveAccountIndex: (index: number) => void;
  /** Stamps `lastUnlockedAt` with the current time — used to sort vaults by recency. */
  touchVaultUnlocked: (id: string) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  addContact: (contact: Contact) => void;
  updateContact: (id: string, updates: Partial<Omit<Contact, "id">>) => void;
  removeContact: (id: string) => void;
  addPendingTx: (tx: PendingTx) => void;
  removePendingTx: (hash: string) => void;
  /** Upserts a dApp approval — merges permissions into an existing entry rather than replacing it. */
  approveDapp: (dapp: ApprovedDapp) => void;
  revokeDapp: (origin: string) => void;
  /** Removes a single permission; prunes the dApp entry entirely when no permissions remain. */
  revokeDappPermission: (origin: string, permission: ApprovedDapp["permissions"][number]) => void;
}

/** Zustand store backed by Tauri LazyStore (`sigil.json` on disk). Survives app restarts. */
export const usePersistedStore = create<PersistedState>()(
  persist(
    (set) => ({
      vaults: [],
      settings: DEFAULT_SETTINGS,
      contacts: [],
      pendingTxs: [],

      addVault: (vault) =>
        set((s) => ({ vaults: [...s.vaults, vault] })),

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

      approveDapp: (dapp) =>
        set((s) => {
          const existing = s.settings.approvedDapps.find((d) => d.origin === dapp.origin);
          const approvedDapps = existing
            ? s.settings.approvedDapps.map((d) =>
                d.origin === dapp.origin
                  ? { ...d, name: dapp.name, approvedAt: dapp.approvedAt, permissions: [...new Set([...d.permissions, ...dapp.permissions])] }
                  : d
              )
            : [...s.settings.approvedDapps, dapp];
          return { settings: { ...s.settings, approvedDapps } };
        }),

      revokeDapp: (origin) =>
        set((s) => ({
          settings: {
            ...s.settings,
            approvedDapps: s.settings.approvedDapps.filter((d) => d.origin !== origin),
          },
        })),

      revokeDappPermission: (origin, permission) =>
        set((s) => {
          const approvedDapps = s.settings.approvedDapps
            .map((d) =>
              d.origin === origin
                ? { ...d, permissions: d.permissions.filter((p) => p !== permission) }
                : d
            )
            .filter((d) => d.permissions.length > 0);
          return { settings: { ...s.settings, approvedDapps } };
        }),
    }),
    {
      name: "sigil-persisted",
      storage: createJSONStorage(() => tauriStorage),
      // Deep-merge settings so new fields added to DEFAULT_SETTINGS survive rehydration.
      // Validate array fields so corrupted JSON cannot replace typed arrays with scalars.
      merge: (persistedState: unknown, currentState: PersistedState): PersistedState => {
        const ps = persistedState as Partial<PersistedState>;
        const vaults = Array.isArray(ps.vaults) ? ps.vaults : currentState.vaults;
        const contacts = Array.isArray(ps.contacts) ? ps.contacts : currentState.contacts;
        const pendingTxs = Array.isArray(ps.pendingTxs) ? ps.pendingTxs : currentState.pendingTxs;
        const settings =
          ps.settings && typeof ps.settings === "object" && !Array.isArray(ps.settings)
            ? { ...currentState.settings, ...ps.settings }
            : currentState.settings;
        return { ...currentState, vaults, contacts, pendingTxs, settings };
      },
    },
  ),
);
