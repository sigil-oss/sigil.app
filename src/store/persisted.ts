import { LazyStore } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import type { VaultData } from "@qubic.org/wallet";

export type VaultColor = "slate" | "red" | "amber" | "emerald" | "sky" | "violet";
export type FontPairId = "default" | "geist" | "inter" | "ibm" | "roboto" | "fira";
export type AccentColorId = "green" | "amber" | "sky" | "violet" | "rose" | "mono";

/** Persisted display metadata for a single account within a vault. Index mirrors position in the seed array. */
export interface AccountMeta {
  index: number;
  name: string;
  addedAt: number;
  /** When true the account is hidden from the account switcher but remains in the seed array. */
  hidden: boolean;
  /** Persisted identity for watch-only accounts and seeded-account metadata hydration. */
  identity?: string;
  note?: string;
  tags?: string[];
}

/** Persisted metadata for a vault — does not contain seeds; those live in `encryptedData`. */
export interface VaultMeta {
  id: string;
  name: string;
  color: VaultColor;
  kind?: "seeded" | "watch_only";
  createdAt: number;
  lastUnlockedAt: number;
  accounts: AccountMeta[];
  encryptedData: VaultData | null;
}

export interface NetworkConfig {
  liveApiUrl: string;
  queryApiUrl: string;
  name: "mainnet" | "testnet" | "custom";
}

/** A dApp origin that the user has explicitly approved, along with its granted permission set. */
export interface ApprovedDapp {
  origin: string;
  name: string;
  approvedAt: number;
  /** Stamped each time a permission is exercised — used to sort/prune stale dApp entries. */
  lastUsedAt?: number;
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
  /** Ticks added to the current tick when estimating targetTick for new transactions. Default 10. */
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
  notifyOnMissedConfirmations: boolean;
  notifyOnLargeIncoming: boolean;
  notifyOnPriceAlerts: boolean;
  notifyWhenLocked: boolean;
  largeIncomingThreshold: string;
  priceAlertAbove: string;
  priceAlertBelow: string;
  pollingIntervalActiveMs: number;
  pollingIntervalBackgroundMs: number;
  pollingIntervalTrayMs: number;
  pollingIntervalLockedMs: number;
  hideToTray: boolean;
  sponsorAttribution: "anonymous" | "identity" | "custom";
  allowBlurLockBypass: boolean;
  requirePasswordForBurn: boolean;
  requireBiometricForSeedReveal: boolean;
  highValueSendThreshold: string;
  exportSigningPrivateJwk: JsonWebKey | null;
}

export interface Contact {
  id: string;
  name: string;
  identity: string;
  note: string;
  addedAt: number;
  lastUsedAt: number;
}

/** A broadcast transaction awaiting confirmation or expiry tracking. */
export interface PendingTx {
  hash: string;
  source: string;
  destination: string;
  amount: string;
  targetTick: number;
  broadcastAt: number;
  /** Present for SC calls — used as the notification label instead of the raw amount. */
  contractName?: string;
}

const MAX_PENDING_TXS = 50;
const MAX_TX_MEMOS = 500;
const MAX_NOTIFICATION_EVENTS = 200;
const MAX_AUDIT_EVENTS = 500;
const MAX_REQUEST_HISTORY = 200;
const MAX_PRICE_SNAPSHOTS = 2_000;
const MAX_RUNTIME_ISSUES = 100;

export type NotificationEventKind =
  | "received"
  | "sent"
  | "confirmed"
  | "failed"
  | "expired"
  | "deep_link"
  | "price_alert";

export interface NotificationEvent {
  id: string;
  kind: NotificationEventKind;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  identity?: string;
  txHash?: string;
  dedupeKey?: string;
}

export interface PriceSnapshot {
  timestamp: number;
  priceUsd: number;
}

export interface RuntimeIssue {
  id: string;
  source: "native" | "renderer" | "updater" | "storage";
  title: string;
  detail: string;
  createdAt: number;
}

export type AuditEventKind =
  | "unlock_succeeded"
  | "unlock_failed"
  | "seed_revealed"
  | "vault_exported"
  | "contacts_exported"
  | "request_received"
  | "request_approved"
  | "request_rejected"
  | "request_callback_failed";

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  createdAt: number;
  status: "success" | "failure" | "info";
  title: string;
  detail: string;
  vaultId?: string;
  accountIndex?: number;
}

export type RequestHistoryAction = "approved" | "rejected";
export type RequestHistoryCallbackStatus = "none" | "pending" | "ok" | "failed";

export interface RequestHistoryItem {
  id: string;
  createdAt: number;
  type: "transfer" | "sc_call" | "sign_message" | "verify_message" | "connect";
  dappName: string;
  dappOrigin: string;
  action: RequestHistoryAction;
  accountIdentity?: string;
  accountName?: string;
  resultKind?: "tx" | "message" | "verify" | "connect";
  resultDetail?: string;
  callbackStatus: RequestHistoryCallbackStatus;
  callbackUrl?: string | null;
  callbackBody?: string;
  callbackUpdatedAt?: number | null;
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
  notifyOnMissedConfirmations: true,
  notifyOnLargeIncoming: false,
  notifyOnPriceAlerts: false,
  notifyWhenLocked: false,
  largeIncomingThreshold: "",
  priceAlertAbove: "",
  priceAlertBelow: "",
  pollingIntervalActiveMs: 5_000,
  pollingIntervalBackgroundMs: 10_000,
  pollingIntervalTrayMs: 15_000,
  pollingIntervalLockedMs: 20_000,
  hideToTray: false,
  sponsorAttribution: "anonymous",
  allowBlurLockBypass: false,
  requirePasswordForBurn: false,
  requireBiometricForSeedReveal: false,
  highValueSendThreshold: "",
  exportSigningPrivateJwk: null,
};

const _disk = new LazyStore("sigil.json");

const tauriStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const raw = await _disk.get<string>(name);
      if (raw === null) return null;
      return await invoke<string>("decrypt_store_value", { value: raw });
    } catch (err) {
      console.error("[sigil] disk read failed:", err);
      window.dispatchEvent(new CustomEvent("sigil:disk-read-error"));
      throw err;
    }
  },
  setItem: async (name, value) => {
    try {
      const encrypted = await invoke<string>("encrypt_store_value", { value });
      await _disk.set(name, encrypted);
      await _disk.save();
    } catch (err) {
      console.error("[sigil] disk write failed, retrying once:", err);
      try {
        const encrypted = await invoke<string>("encrypt_store_value", { value });
        await _disk.set(name, encrypted);
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

function clampTxMemos(txMemos: Record<string, string>): Record<string, string> {
  const entries = Object.entries(txMemos);
  if (entries.length <= MAX_TX_MEMOS) return txMemos;
  return Object.fromEntries(entries.slice(entries.length - MAX_TX_MEMOS));
}

function clampNotificationEvents(events: NotificationEvent[]): NotificationEvent[] {
  if (events.length <= MAX_NOTIFICATION_EVENTS) return events;
  return events
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_NOTIFICATION_EVENTS);
}

function clampAuditEvents(events: AuditEvent[]): AuditEvent[] {
  if (events.length <= MAX_AUDIT_EVENTS) return events;
  return events
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_AUDIT_EVENTS);
}

function clampRequestHistory(events: RequestHistoryItem[]): RequestHistoryItem[] {
  if (events.length <= MAX_REQUEST_HISTORY) return events;
  return events
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_REQUEST_HISTORY);
}

function clampPriceSnapshots(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  if (snapshots.length <= MAX_PRICE_SNAPSHOTS) return snapshots;
  return snapshots
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_PRICE_SNAPSHOTS);
}

function clampRuntimeIssues(issues: RuntimeIssue[]): RuntimeIssue[] {
  if (issues.length <= MAX_RUNTIME_ISSUES) return issues;
  return issues
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RUNTIME_ISSUES);
}

function sanitizePollingInterval(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(60_000, Math.max(2_000, Math.round(value)))
    : fallback;
}

interface PersistedState {
  vaults: VaultMeta[];
  settings: AppSettings;
  contacts: Contact[];
  pendingTxs: PendingTx[];
  /** tx hash → user note, persisted locally */
  txMemos: Record<string, string>;
  notificationEvents: NotificationEvent[];
  priceSnapshots: PriceSnapshot[];
  runtimeIssues: RuntimeIssue[];
  auditEvents: AuditEvent[];
  requestHistory: RequestHistoryItem[];
  lastNotificationScanAt: number;
  /** Unix ms timestamp until which password attempts are locked out. 0 = no lockout. */
  passwordLockoutUntil: number;
  setPasswordLockoutUntil: (until: number) => void;
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
  setTxMemo: (hash: string, memo: string) => void;
  deleteTxMemo: (hash: string) => void;
  addNotificationEvent: (event: NotificationEvent) => void;
  markNotificationEventRead: (id: string) => void;
  markAllNotificationEventsRead: () => void;
  clearNotificationEvents: () => void;
  setLastNotificationScanAt: (timestamp: number) => void;
  addAuditEvent: (event: AuditEvent) => void;
  clearAuditEvents: () => void;
  addPriceSnapshot: (snapshot: PriceSnapshot) => void;
  addRuntimeIssue: (issue: RuntimeIssue) => void;
  clearRuntimeIssues: () => void;
  addRequestHistoryItem: (event: RequestHistoryItem) => void;
  updateRequestHistoryItem: (id: string, updates: Partial<Omit<RequestHistoryItem, "id" | "createdAt">>) => void;
  clearRequestHistory: () => void;
}

/** Zustand store backed by Tauri LazyStore (`sigil.json` on disk). Survives app restarts. */
export const usePersistedStore = create<PersistedState>()(
  persist(
    (set) => ({
      vaults: [],
      settings: DEFAULT_SETTINGS,
      contacts: [],
      pendingTxs: [],
      txMemos: {},
      notificationEvents: [],
      priceSnapshots: [],
      runtimeIssues: [],
      auditEvents: [],
      requestHistory: [],
      lastNotificationScanAt: 0,
      passwordLockoutUntil: 0,

      setPasswordLockoutUntil: (until) => set({ passwordLockoutUntil: until }),

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
        set((s) => ({ pendingTxs: [tx, ...s.pendingTxs].slice(0, MAX_PENDING_TXS) })),

      removePendingTx: (hash) =>
        set((s) => ({ pendingTxs: s.pendingTxs.filter((t) => t.hash !== hash) })),

      approveDapp: (dapp) =>
        set((s) => {
          const now = Date.now();
          const existing = s.settings.approvedDapps.find((d) => d.origin === dapp.origin);
          const approvedDapps = existing
            ? s.settings.approvedDapps.map((d) =>
                d.origin === dapp.origin
                  ? { ...d, name: dapp.name, approvedAt: dapp.approvedAt, lastUsedAt: now, permissions: [...new Set([...d.permissions, ...dapp.permissions])] }
                  : d
              )
            : [...s.settings.approvedDapps, { ...dapp, lastUsedAt: now }];
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

      setTxMemo: (hash, memo) =>
        set((s) => ({ txMemos: clampTxMemos({ ...s.txMemos, [hash]: memo }) })),

      deleteTxMemo: (hash) =>
        set((s) => {
          const next = { ...s.txMemos };
          delete next[hash];
          return { txMemos: next };
        }),

      addNotificationEvent: (event) =>
        set((s) => {
          if (event.dedupeKey && s.notificationEvents.some((existing) => existing.dedupeKey === event.dedupeKey)) {
            return s;
          }
          return {
            notificationEvents: clampNotificationEvents([event, ...s.notificationEvents]),
          };
        }),

      markNotificationEventRead: (id) =>
        set((s) => ({
          notificationEvents: s.notificationEvents.map((event) =>
            event.id === id && event.readAt === null
              ? { ...event, readAt: Date.now() }
              : event,
          ),
        })),

      markAllNotificationEventsRead: () =>
        set((s) => ({
          notificationEvents: s.notificationEvents.map((event) =>
            event.readAt === null ? { ...event, readAt: Date.now() } : event,
          ),
        })),

      clearNotificationEvents: () => set({ notificationEvents: [] }),

      setLastNotificationScanAt: (timestamp) => set({ lastNotificationScanAt: timestamp }),

      addAuditEvent: (event) =>
        set((s) => ({ auditEvents: clampAuditEvents([event, ...s.auditEvents]) })),

      clearAuditEvents: () => set({ auditEvents: [] }),

      addPriceSnapshot: (snapshot) =>
        set((s) => {
          const latest = s.priceSnapshots[0];
          if (
            latest &&
            Math.abs(latest.priceUsd - snapshot.priceUsd) < 0.000001 &&
            snapshot.timestamp - latest.timestamp < 15 * 60 * 1000
          ) {
            return s;
          }
          return { priceSnapshots: clampPriceSnapshots([snapshot, ...s.priceSnapshots]) };
        }),

      addRuntimeIssue: (issue) =>
        set((s) => ({ runtimeIssues: clampRuntimeIssues([issue, ...s.runtimeIssues]) })),

      clearRuntimeIssues: () => set({ runtimeIssues: [] }),

      addRequestHistoryItem: (event) =>
        set((s) => ({ requestHistory: clampRequestHistory([event, ...s.requestHistory]) })),

      updateRequestHistoryItem: (id, updates) =>
        set((s) => ({
          requestHistory: clampRequestHistory(
            s.requestHistory.map((event) => (event.id === id ? { ...event, ...updates } : event)),
          ),
        })),

      clearRequestHistory: () => set({ requestHistory: [] }),

    }),
    {
      name: "sigil-persisted",
      storage: createJSONStorage(() => tauriStorage),
      // Deep-merge settings so new fields added to DEFAULT_SETTINGS survive rehydration.
      // Validate array fields so corrupted JSON cannot replace typed arrays with scalars.
      merge: (persistedState: unknown, currentState: PersistedState): PersistedState => {
        const ps = persistedState as Partial<PersistedState>;
        const vaults = Array.isArray(ps.vaults)
          ? ps.vaults
            .filter((vault): vault is VaultMeta => !!vault && typeof vault === "object")
            .map((vault): VaultMeta => ({
              ...vault,
              kind: vault.kind === "watch_only" ? "watch_only" : "seeded",
              encryptedData: vault.kind === "watch_only" ? null : (vault.encryptedData ?? null),
              accounts: Array.isArray(vault.accounts)
                ? vault.accounts
                  .filter((account): account is AccountMeta => !!account && typeof account === "object")
                  .map((account) => ({
                    ...account,
                    note: typeof account.note === "string" ? account.note : "",
                    tags: Array.isArray(account.tags)
                      ? account.tags.filter((tag): tag is string => typeof tag === "string")
                      : [],
                    identity: typeof account.identity === "string" ? account.identity : undefined,
                  }))
                : [],
            }))
          : currentState.vaults;
        const contacts = Array.isArray(ps.contacts) ? ps.contacts : currentState.contacts;
        const pendingTxs = Array.isArray(ps.pendingTxs) ? ps.pendingTxs : currentState.pendingTxs;
        const txMemos =
          ps.txMemos && typeof ps.txMemos === "object" && !Array.isArray(ps.txMemos)
            ? clampTxMemos(ps.txMemos as Record<string, string>)
            : currentState.txMemos;
        const notificationEvents = Array.isArray(ps.notificationEvents)
          ? clampNotificationEvents(
              ps.notificationEvents.filter((event): event is NotificationEvent =>
                !!event &&
                typeof event === "object" &&
                typeof event.id === "string" &&
                typeof event.title === "string" &&
                typeof event.body === "string" &&
                typeof event.kind === "string" &&
                typeof event.createdAt === "number",
              ),
            )
          : currentState.notificationEvents;
        const priceSnapshots = Array.isArray(ps.priceSnapshots)
          ? clampPriceSnapshots(
              ps.priceSnapshots.filter((snapshot): snapshot is PriceSnapshot =>
                !!snapshot &&
                typeof snapshot === "object" &&
                typeof snapshot.timestamp === "number" &&
                typeof snapshot.priceUsd === "number" &&
                Number.isFinite(snapshot.priceUsd),
              ),
            )
          : currentState.priceSnapshots;
        const runtimeIssues = Array.isArray(ps.runtimeIssues)
          ? clampRuntimeIssues(
              ps.runtimeIssues.filter((issue): issue is RuntimeIssue =>
                !!issue &&
                typeof issue === "object" &&
                typeof issue.id === "string" &&
                typeof issue.source === "string" &&
                typeof issue.title === "string" &&
                typeof issue.detail === "string" &&
                typeof issue.createdAt === "number",
              ),
            )
          : currentState.runtimeIssues;
        const auditEvents = Array.isArray(ps.auditEvents)
          ? clampAuditEvents(
              ps.auditEvents.filter((event): event is AuditEvent =>
                !!event &&
                typeof event === "object" &&
                typeof event.id === "string" &&
                typeof event.kind === "string" &&
                typeof event.title === "string" &&
                typeof event.detail === "string" &&
                typeof event.createdAt === "number",
              ),
            )
          : currentState.auditEvents;
        const requestHistory = Array.isArray(ps.requestHistory)
          ? clampRequestHistory(
              ps.requestHistory.filter((event): event is RequestHistoryItem =>
                !!event &&
                typeof event === "object" &&
                typeof event.id === "string" &&
                typeof event.type === "string" &&
                typeof event.dappName === "string" &&
                typeof event.dappOrigin === "string" &&
                typeof event.action === "string" &&
                typeof event.callbackStatus === "string" &&
                typeof event.createdAt === "number",
              ),
            )
          : currentState.requestHistory;
        const lastNotificationScanAt =
          typeof ps.lastNotificationScanAt === "number"
            ? ps.lastNotificationScanAt
            : currentState.lastNotificationScanAt;
        const settingsBase =
          ps.settings && typeof ps.settings === "object" && !Array.isArray(ps.settings)
            ? { ...currentState.settings, ...ps.settings }
            : currentState.settings;
        const approvedDapps = Array.isArray(settingsBase.approvedDapps)
          ? settingsBase.approvedDapps.filter((dapp): dapp is ApprovedDapp =>
              !!dapp &&
              typeof dapp === "object" &&
              typeof dapp.origin === "string" &&
              typeof dapp.name === "string" &&
              typeof dapp.approvedAt === "number" &&
              Array.isArray(dapp.permissions),
            )
          : currentState.settings.approvedDapps;
        const settings = {
          ...settingsBase,
          approvedDapps,
          highValueSendThreshold: typeof settingsBase.highValueSendThreshold === "string"
            ? settingsBase.highValueSendThreshold.replace(/[^\d]/g, "")
            : currentState.settings.highValueSendThreshold,
          largeIncomingThreshold: typeof settingsBase.largeIncomingThreshold === "string"
            ? settingsBase.largeIncomingThreshold.replace(/[^\d]/g, "")
            : currentState.settings.largeIncomingThreshold,
          priceAlertAbove: typeof settingsBase.priceAlertAbove === "string"
            ? settingsBase.priceAlertAbove.replace(/[^\d.]/g, "")
            : currentState.settings.priceAlertAbove,
          priceAlertBelow: typeof settingsBase.priceAlertBelow === "string"
            ? settingsBase.priceAlertBelow.replace(/[^\d.]/g, "")
            : currentState.settings.priceAlertBelow,
          pollingIntervalActiveMs: sanitizePollingInterval(
            settingsBase.pollingIntervalActiveMs,
            currentState.settings.pollingIntervalActiveMs,
          ),
          pollingIntervalBackgroundMs: sanitizePollingInterval(
            settingsBase.pollingIntervalBackgroundMs,
            currentState.settings.pollingIntervalBackgroundMs,
          ),
          pollingIntervalTrayMs: sanitizePollingInterval(
            settingsBase.pollingIntervalTrayMs,
            currentState.settings.pollingIntervalTrayMs,
          ),
          pollingIntervalLockedMs: sanitizePollingInterval(
            settingsBase.pollingIntervalLockedMs,
            currentState.settings.pollingIntervalLockedMs,
          ),
          sponsorAttribution:
            settingsBase.sponsorAttribution === "identity" || settingsBase.sponsorAttribution === "custom"
              ? settingsBase.sponsorAttribution
              : currentState.settings.sponsorAttribution,
          allowBlurLockBypass: !!settingsBase.allowBlurLockBypass,
        };
        return {
          ...currentState,
          vaults,
          contacts,
          pendingTxs,
          txMemos,
          notificationEvents,
          priceSnapshots,
          runtimeIssues,
          auditEvents,
          requestHistory,
          lastNotificationScanAt,
          settings,
        };
      },
    },
  ),
);
