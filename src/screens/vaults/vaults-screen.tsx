import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/tag";
import { Divider } from "@/components/divider";
import { usePersistedStore, type VaultMeta, type VaultColor, type AccountMeta } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { unlockVault, createWallet, type VaultData } from "@/lib/vault";

const VAULT_COLOR_CSS: Record<string, string> = {
  slate: "var(--color-vault-slate)",
  red: "var(--color-vault-red)",
  amber: "var(--color-vault-amber)",
  emerald: "var(--color-vault-emerald)",
  sky: "var(--color-vault-sky)",
  violet: "var(--color-vault-violet)",
};

function timeAgo(ms: number): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function VaultsScreen() {
  const navigate = useNavigate();

  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const setActiveVault = usePersistedStore((s) => s.setActiveVault);
  const addVault = usePersistedStore((s) => s.addVault);
  const updateVault = usePersistedStore((s) => s.updateVault);
  const removeVault = usePersistedStore((s) => s.removeVault);
  const touchVaultUnlocked = usePersistedStore((s) => s.touchVaultUnlocked);
  const unlock = useSessionStore((s) => s.unlock);
  const sessionLock = useSessionStore((s) => s.lock);

  // Import state
  interface ImportData { name: string; color: VaultColor; accounts: AccountMeta[]; vault: VaultData; }
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  const [switchingVault, setSwitchingVault] = useState<VaultMeta | null>(null);
  const [renamingVault, setRenamingVault] = useState<VaultMeta | null>(null);
  const [deletingVault, setDeletingVault] = useState<VaultMeta | null>(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [switchLoading, setSwitchLoading] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  function openSwitch(vault: VaultMeta) {
    setSwitchingVault(vault);
    setSwitchPassword("");
    setSwitchError("");
  }

  function openRename(vault: VaultMeta) {
    setRenamingVault(vault);
    setRenameValue(vault.name);
  }

  function openDelete(vault: VaultMeta) {
    setDeletingVault(vault);
    setDeletePassword("");
    setDeleteError("");
  }

  async function doSwitch() {
    if (!switchingVault) return;
    setSwitchLoading(true);
    setSwitchError("");
    try {
      const seeds = await unlockVault(switchingVault.encryptedData, switchPassword);
      const wallets = seeds.map(createWallet);
      unlock(switchingVault.id, seeds, wallets);
      setActiveVault(switchingVault.id);
      touchVaultUnlocked(switchingVault.id);
      setSwitchingVault(null);
      navigate("/dashboard", { replace: true });
    } catch {
      setSwitchError("WRONG PASSWORD");
    } finally {
      setSwitchLoading(false);
    }
  }

  function doRename() {
    if (!renamingVault || !renameValue.trim()) return;
    updateVault(renamingVault.id, { name: renameValue.trim() });
    setRenamingVault(null);
  }

  async function doDelete() {
    if (!deletingVault) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await unlockVault(deletingVault.encryptedData, deletePassword);
      const wasActive = deletingVault.id === settings.activeVaultId;
      removeVault(deletingVault.id);
      if (wasActive) sessionLock();
      const remaining = usePersistedStore.getState().vaults;
      if (remaining.length === 0) {
        navigate("/setup", { replace: true });
        return;
      }
      setDeletingVault(null);
    } catch {
      setDeleteError("WRONG PASSWORD");
    } finally {
      setDeleteLoading(false);
    }
  }

  function openImportPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.sigil !== 1 || !parsed.vault || !parsed.name?.trim()) throw new Error();
        setImportData({ name: parsed.name, color: parsed.color ?? "slate", accounts: parsed.accounts ?? [], vault: parsed.vault as VaultData });
        setImportPassword("");
        setImportError("");
      } catch {
        // silently ignore malformed files — user can try again
      }
    };
    input.click();
  }

  async function doImport() {
    if (!importData) return;
    setImportLoading(true);
    setImportError("");
    try {
      await unlockVault(importData.vault, importPassword);
      const newVault: VaultMeta = {
        id: globalThis.crypto.randomUUID(),
        name: importData.name,
        color: importData.color,
        createdAt: Date.now(),
        lastUnlockedAt: 0,
        accounts: importData.accounts,
        encryptedData: importData.vault,
      };
      addVault(newVault);
      setImportData(null);
    } catch {
      setImportError("WRONG PASSWORD");
    } finally {
      setImportLoading(false);
    }
  }

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Vaults
      </span>
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button onClick={openImportPicker} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
          IMPORT
        </button>
        <button onClick={() => navigate("/setup/create")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
          + NEW
        </button>
      </div>
    </div>
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {vaults.map((vault, i) => {
        const isActive = vault.id === settings.activeVaultId;
        const visibleAccounts = vault.accounts.filter((a) => !a.hidden).length;
        return (
          <div key={vault.id}>
            {i > 0 && <Divider style={{ marginBottom: "var(--space-3)" }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {/* Vault header */}
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: VAULT_COLOR_CSS[vault.color] ?? "var(--color-text-secondary)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
                      {vault.name}
                    </span>
                    {isActive && <Tag variant="neutral">ACTIVE</Tag>}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", marginTop: 2 }}>
                    {visibleAccounts} {visibleAccounts === 1 ? "ACCOUNT" : "ACCOUNTS"} · UNLOCKED {timeAgo(vault.lastUnlockedAt).toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "var(--space-2)", paddingLeft: 22 }}>
                {isActive ? (
                  <Button variant="secondary" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => navigate(`/vaults/${vault.id}`)}>
                    Manage accounts
                  </Button>
                ) : (
                  <Button variant="secondary" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => openSwitch(vault)}>
                    Unlock
                  </Button>
                )}
                <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => openRename(vault)}>
                  Rename
                </Button>
                <Button variant="danger" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => openDelete(vault)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Switch vault modal */}
      <Modal open={!!switchingVault} onClose={() => setSwitchingVault(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Unlock {switchingVault?.name}
          </div>
          <Input
            type="password"
            label="Password"
            value={switchPassword}
            onChange={(e) => { setSwitchPassword(e.target.value); setSwitchError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !switchLoading && doSwitch()}
            error={switchError}
            placeholder="••••••••••"
            autoComplete="current-password"
            autoFocus
          />
          <Button onClick={doSwitch} loading={switchLoading}>Unlock</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setSwitchingVault(null)}>Cancel</Button>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal open={!!renamingVault} onClose={() => setRenamingVault(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Rename vault
          </div>
          <Input
            label="Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRename()}
            placeholder="Vault name"
            autoFocus
            style={{ fontFamily: "var(--font-sans)" }}
          />
          <Button onClick={doRename} disabled={!renameValue.trim()}>Save</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setRenamingVault(null)}>Cancel</Button>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal open={!!importData} onClose={() => setImportData(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-1)" }}>
              Import {importData?.name}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              {importData?.accounts.length ?? 0} {(importData?.accounts.length ?? 0) === 1 ? "ACCOUNT" : "ACCOUNTS"}
            </div>
          </div>
          <Input
            type="password"
            label="Vault password"
            value={importPassword}
            onChange={(e) => { setImportPassword(e.target.value); setImportError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !importLoading && doImport()}
            error={importError}
            placeholder="••••••••••"
            autoComplete="current-password"
            autoFocus
          />
          <Button onClick={doImport} loading={importLoading} disabled={!importPassword}>Import vault</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setImportData(null)}>Cancel</Button>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal open={!!deletingVault} onClose={() => setDeletingVault(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-1)" }}>
              Delete {deletingVault?.name}?
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-status-error)" }}>
              This cannot be undone.
            </div>
          </div>
          <Input
            type="password"
            label="Enter password to confirm"
            value={deletePassword}
            onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !deleteLoading && doDelete()}
            error={deleteError}
            placeholder="••••••••••"
            autoComplete="current-password"
            autoFocus
          />
          <Button variant="danger" shape="sharp" onClick={doDelete} loading={deleteLoading} disabled={!deletePassword}>
            Delete this vault
          </Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setDeletingVault(null)}>Cancel</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
