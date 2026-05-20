import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { Divider } from "@/components/divider";
import { usePersistedStore, type AccountMeta } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { generateRandomSeed, truncateIdentity } from "@/lib/crypto";
import { unlockVault, createVault, createWallet, exportVault } from "@/lib/vault";

export default function VaultDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const updateVault = usePersistedStore((s) => s.updateVault);
  const setActiveAccountIndex = usePersistedStore((s) => s.setActiveAccountIndex);
  const sessionUnlock = useSessionStore((s) => s.unlock);
  const sessionWallets = useSessionStore((s) => s.wallets);

  const vault = vaults.find((v) => v.id === id);
  const isActive = vault?.id === settings.activeVaultId;

  const [addingAccount, setAddingAccount] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [renamingAccount, setRenamingAccount] = useState<AccountMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [removingAccount, setRemovingAccount] = useState<AccountMeta | null>(null);
  const [removePassword, setRemovePassword] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [removeLoading, setRemoveLoading] = useState(false);

  const [showHidden, setShowHidden] = useState(false);
  const [showExport, setShowExport] = useState(false);

  if (!vault) return null;

  function doExport() {
    const data = JSON.stringify({
      sigil: 1,
      name: vault!.name,
      color: vault!.color,
      accounts: vault!.accounts,
      exported_at: Date.now(),
      vault: JSON.parse(exportVault(vault!.encryptedData)),
    }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sigil-${vault!.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  const visible = vault.accounts.filter((a) => !a.hidden).sort((a, b) => a.index - b.index);
  const hidden = vault.accounts.filter((a) => a.hidden).sort((a, b) => a.index - b.index);

  function openAdd() {
    setAddName("");
    setAddPassword("");
    setAddError("");
    setAddingAccount(true);
  }

  async function doAdd() {
    if (!addName.trim()) return;
    setAddLoading(true);
    setAddError("");
    try {
      const existingSeeds = await unlockVault(vault!.encryptedData, addPassword);
      const newSeed = generateRandomSeed();
      const newEncrypted = await createVault(addPassword, [...existingSeeds, newSeed]);
      const newIndex = existingSeeds.length;
      const newAccount: AccountMeta = { index: newIndex, name: addName.trim(), addedAt: Date.now(), hidden: false };
      updateVault(vault!.id, {
        encryptedData: newEncrypted,
        accounts: [...vault!.accounts, newAccount],
      });
      if (isActive) {
        sessionUnlock(vault!.id, [...existingSeeds, newSeed], [...existingSeeds, newSeed].map(createWallet));
      }
      setAddingAccount(false);
    } catch {
      setAddError("WRONG PASSWORD");
    } finally {
      setAddLoading(false);
    }
  }

  function doRename() {
    if (!renamingAccount || !renameValue.trim()) return;
    updateVault(vault!.id, {
      accounts: vault!.accounts.map((a) =>
        a.index === renamingAccount.index ? { ...a, name: renameValue.trim() } : a,
      ),
    });
    setRenamingAccount(null);
  }

  function toggleHide(account: AccountMeta) {
    updateVault(vault!.id, {
      accounts: vault!.accounts.map((a) =>
        a.index === account.index ? { ...a, hidden: !a.hidden } : a,
      ),
    });
  }

  async function doRemove() {
    if (!removingAccount) return;
    setRemoveLoading(true);
    setRemoveError("");
    try {
      const allSeeds = await unlockVault(vault!.encryptedData, removePassword);
      const remaining = allSeeds.filter((_, i) => i !== removingAccount.index);
      const newEncrypted = await createVault(removePassword, remaining);
      const updatedAccounts = vault!.accounts
        .filter((a) => a.index !== removingAccount.index)
        .map((a) => ({ ...a, index: a.index > removingAccount.index ? a.index - 1 : a.index }));
      updateVault(vault!.id, { encryptedData: newEncrypted, accounts: updatedAccounts });
      if (isActive) {
        sessionUnlock(vault!.id, remaining, remaining.map(createWallet));
        const activeIdx = settings.activeAccountIndex;
        if (removingAccount.index === activeIdx) {
          setActiveAccountIndex(0);
        } else if (removingAccount.index < activeIdx) {
          setActiveAccountIndex(activeIdx - 1);
        }
      }
      setRemovingAccount(null);
    } catch {
      setRemoveError("WRONG PASSWORD");
    } finally {
      setRemoveLoading(false);
    }
  }

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button onClick={() => navigate("/vaults")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {vault.name}
      </span>
      <button onClick={openAdd} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        + ADD
      </button>
    </div>
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {visible.map((account, i) => (
        <div key={account.index}>
          {i > 0 && <Divider style={{ marginBottom: "var(--space-3)" }} />}
          <AccountRow
            account={account}
            identity={isActive ? (sessionWallets[account.index]?.identity ?? null) : null}
            onRename={() => { setRenamingAccount(account); setRenameValue(account.name); }}
            onHide={() => toggleHide(account)}
            onRemove={() => { setRemovingAccount(account); setRemovePassword(""); setRemoveError(""); }}
          />
        </div>
      ))}

      {hidden.length > 0 && (
        <button
          onClick={() => setShowHidden((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: "var(--space-3) 0", textAlign: "left" }}
        >
          {showHidden ? "▾" : "▸"} {hidden.length} HIDDEN {hidden.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </button>
      )}

      {showHidden && hidden.map((account) => (
        <AccountRow
          key={account.index}
          account={account}
          identity={null}
          dimmed
          onRename={() => { setRenamingAccount(account); setRenameValue(account.name); }}
          onHide={() => toggleHide(account)}
          onRemove={() => { setRemovingAccount(account); setRemovePassword(""); setRemoveError(""); }}
        />
      ))}

      {/* Export vault */}
      <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border-subtle)" }}>
        <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => setShowExport(true)}>
          Export vault
        </Button>
      </div>

      {/* Export modal */}
      <Modal open={showExport} onClose={() => setShowExport(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Export {vault.name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
            [WARNING] This file contains your encrypted seed. Keep it safe. Anyone with this file and your password can access your funds.
          </div>
          <Button onClick={doExport}>Download backup file</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setShowExport(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* Add account modal */}
      <Modal open={addingAccount} onClose={() => setAddingAccount(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Add account
          </div>
          <Input label="Account name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. DeFi, Staking" autoFocus style={{ fontFamily: "var(--font-sans)" }} />
          <Input type="password" label="Vault password" value={addPassword} onChange={(e) => { setAddPassword(e.target.value); setAddError(""); }} onKeyDown={(e) => e.key === "Enter" && !addLoading && doAdd()} error={addError} placeholder="••••••••••" autoComplete="current-password" />
          <Button onClick={doAdd} loading={addLoading} disabled={!addName.trim() || !addPassword}>Add account</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setAddingAccount(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal open={!!renamingAccount} onClose={() => setRenamingAccount(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>Rename account</div>
          <Input label="Name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRename()} autoFocus style={{ fontFamily: "var(--font-sans)" }} />
          <Button onClick={doRename} disabled={!renameValue.trim()}>Save</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setRenamingAccount(null)}>Cancel</Button>
        </div>
      </Modal>

      {/* Remove modal */}
      <Modal open={!!removingAccount} onClose={() => setRemovingAccount(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-1)" }}>Remove {removingAccount?.name}?</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-status-error)" }}>This cannot be undone.</div>
          </div>
          <Input type="password" label="Vault password" value={removePassword} onChange={(e) => { setRemovePassword(e.target.value); setRemoveError(""); }} onKeyDown={(e) => e.key === "Enter" && doRemove()} error={removeError} placeholder="••••••••••" autoComplete="current-password" autoFocus />
          <Button variant="danger" shape="sharp" onClick={doRemove} loading={removeLoading} disabled={!removePassword}>Remove account</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setRemovingAccount(null)}>Cancel</Button>
        </div>
      </Modal>
    </AppShell>
  );
}

interface AccountRowProps {
  account: AccountMeta;
  identity: string | null;
  dimmed?: boolean;
  onRename: () => void;
  onHide: () => void;
  onRemove: () => void;
}

function AccountRow({ account, identity, dimmed, onRename, onHide, onRemove }: AccountRowProps) {
  return (
    <div style={{ opacity: dimmed ? 0.5 : 1 }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: 2 }}>
        {account.name}
      </div>
      {identity && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", marginBottom: "var(--space-3)" }}>
          {truncateIdentity(identity)}
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: identity ? 0 : "var(--space-3)" }}>
        <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={onRename}>Rename</Button>
        <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={onHide}>{account.hidden ? "Unhide" : "Hide"}</Button>
        <Button variant="danger" shape="sharp" size="sm" style={{ width: "auto" }} onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}
