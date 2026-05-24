import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "@/layouts/app-shell";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { Sheet } from "@/components/sheet";
import { usePersistedStore, type AccountMeta } from "@/store/persisted";
import { MAX_VAULT_ACCOUNTS } from "@/hooks/use-vault-balances";
import { useSessionStore } from "@/store/session";
import { generateRandomSeed, toSeed, InvalidSeedError, type Seed } from "@/lib/crypto";
import { unlockSecureSession } from "@/lib/secure-session";
import { unlockVault, createVault, exportVault } from "@/lib/vault";
import { IdentityDisplay } from "@/components/identity-display";
import { Identicon } from "@/components/identicon";
import { saveFileDialog } from "@/lib/save-file";
import { SEED_CLIPBOARD_CLEAR_SECS } from "@/lib/constants";

const VAULT_COLOR_CSS: Record<string, string> = {
  slate: "var(--color-vault-slate)",
  red: "var(--color-vault-red)",
  amber: "var(--color-vault-amber)",
  emerald: "var(--color-vault-emerald)",
  sky: "var(--color-vault-sky)",
  violet: "var(--color-vault-violet)",
};

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
  const [addMode, setAddMode] = useState<"new" | "import">("new");
  const [addName, setAddName] = useState("");
  const [addSeed, setAddSeed] = useState("");
  const [addSeedError, setAddSeedError] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const [renamingAccount, setRenamingAccount] = useState<AccountMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountMeta | null>(null);

  const [removingAccount, setRemovingAccount] = useState<AccountMeta | null>(null);
  const [removePassword, setRemovePassword] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [removeLoading, setRemoveLoading] = useState(false);

  const [showHidden, setShowHidden] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [hidingAccount, setHidingAccount] = useState<AccountMeta | null>(null);
  const [revealingAccount, setRevealingAccount] = useState<AccountMeta | null>(null);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealError, setRevealError] = useState("");
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealedSeed, setRevealedSeed] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);

  if (!vault) return null;

  useEffect(() => {
    if (!revealedSeed) return;
    const timer = setTimeout(() => {
      setRevealedSeed("");
      setSeedCopied(false);
      setRevealingAccount(null);
      setRevealPassword("");
    }, SEED_CLIPBOARD_CLEAR_SECS * 1000);
    return () => clearTimeout(timer);
  }, [revealedSeed]);

  async function doExport() {
    const data = JSON.stringify({
      sigil: 1,
      name: vault!.name,
      color: vault!.color,
      accounts: vault!.accounts,
      exported_at: Date.now(),
      vault: JSON.parse(exportVault(vault!.encryptedData)),
    }, null, 2);
    const defaultName = `sigil-${vault!.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vault"}.json`;
    const saved = await saveFileDialog(defaultName, data);
    if (saved) setShowExport(false);
  }

  const visible = vault.accounts.filter((a) => !a.hidden).sort((a, b) => a.index - b.index);
  const hidden = vault.accounts.filter((a) => a.hidden).sort((a, b) => a.index - b.index);
  const accentColor = VAULT_COLOR_CSS[vault.color] ?? "var(--color-text-secondary)";

  function openAccountMenu(account: AccountMeta) {
    setSelectedAccount(account);
  }

  function closeAccountMenu() {
    setSelectedAccount(null);
  }

  function openAdd() {
    setAddMode("new");
    setAddName("");
    setAddSeed("");
    setAddSeedError("");
    setAddPassword("");
    setAddError("");
    setAddingAccount(true);
  }

  async function doAdd() {
    if (!addName.trim()) return;
    setAddSeedError("");
    setAddError("");

    let seedToAdd: Seed | null = null;
    if (addMode === "import") {
      try {
        seedToAdd = toSeed(addSeed.trim().toLowerCase());
      } catch (e) {
        setAddSeedError(e instanceof InvalidSeedError ? "55 LOWERCASE LETTERS REQUIRED" : "INVALID SEED");
        return;
      }
    }

    setAddLoading(true);
    try {
      const existingSeeds = await unlockVault(vault!.encryptedData, addPassword);
      const newSeed = seedToAdd ?? generateRandomSeed();
      const newEncrypted = await createVault(addPassword, [...existingSeeds, newSeed]);
      const newIndex = existingSeeds.length;
      const newAccount: AccountMeta = { index: newIndex, name: addName.trim(), addedAt: Date.now(), hidden: false };
      updateVault(vault!.id, {
        encryptedData: newEncrypted,
        accounts: [...vault!.accounts, newAccount],
      });
      if (isActive) {
        sessionUnlock(vault!.id, unlockSecureSession([...existingSeeds, newSeed]));
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
    if (!account.hidden) {
      setHidingAccount(account);
      return;
    }
    updateVault(vault!.id, {
      accounts: vault!.accounts.map((a) =>
        a.index === account.index ? { ...a, hidden: false } : a,
      ),
    });
  }

  function confirmHide() {
    if (!hidingAccount) return;
    updateVault(vault!.id, {
      accounts: vault!.accounts.map((a) =>
        a.index === hidingAccount.index ? { ...a, hidden: true } : a,
      ),
    });
    setHidingAccount(null);
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
        sessionUnlock(vault!.id, unlockSecureSession(remaining));
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

  function openReveal(account: AccountMeta) {
    setRevealingAccount(account);
    setRevealPassword("");
    setRevealError("");
    setRevealLoading(false);
    setRevealedSeed("");
    setSeedCopied(false);
  }

  async function doRevealSeed() {
    if (!revealingAccount) return;
    setRevealLoading(true);
    setRevealError("");
    try {
      const seeds = await unlockVault(vault!.encryptedData, revealPassword);
      const seed = seeds[revealingAccount.index];
      if (!seed) throw new Error("Missing seed");
      setRevealedSeed(seed);
      setRevealPassword("");
    } catch {
      setRevealError("WRONG PASSWORD");
    } finally {
      setRevealLoading(false);
    }
  }

  async function copyRevealedSeed() {
    if (!revealedSeed) return;
    try {
      await invoke("copy_to_clipboard", { text: revealedSeed, clearAfterSecs: SEED_CLIPBOARD_CLEAR_SECS });
      setSeedCopied(true);
    } catch {
      await navigator.clipboard.writeText(revealedSeed).catch(() => {});
      setSeedCopied(true);
    }
  }

  const statusBar = (
    <ScreenHeader
      title={vault.name}
      onBack={() => navigate("/vaults")}
      action={
        vault.accounts.length < MAX_VAULT_ACCOUNTS
          ? <button type="button" onClick={openAdd} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>+ ADD</button>
          : <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>16 MAX</span>
      }
    />
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {visible.map((account) => (
        <AccountRow
          key={account.index}
          account={account}
          accentColor={accentColor}
          identity={isActive ? (sessionWallets[account.index]?.identity ?? null) : null}
          isCurrent={isActive && settings.activeAccountIndex === account.index}
          onManage={() => openAccountMenu(account)}
        />
      ))}

      {hidden.length > 0 && (
        <button
          onClick={() => setShowHidden((v) => !v)}
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sharp)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-mono-sm)",
            color: "var(--color-text-disabled)",
            letterSpacing: "0.05em",
            padding: "var(--space-3) var(--space-4)",
            textAlign: "left",
          }}
        >
          {showHidden ? "▾" : "▸"} {hidden.length} HIDDEN {hidden.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </button>
      )}

      {showHidden && hidden.map((account) => (
        <AccountRow
          key={account.index}
          account={account}
          accentColor={accentColor}
          identity={null}
          dimmed
          isCurrent={false}
          onManage={() => openAccountMenu(account)}
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {(["new", "import"] as const).map((mode, i) => (
              <>
                {i > 0 && <span key="sep" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)" }}>/</span>}
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setAddMode(mode); setAddSeed(""); setAddSeedError(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em", padding: 0, color: addMode === mode ? "var(--color-text-display)" : "var(--color-text-disabled)" }}
                >
                  {mode === "new" ? "NEW SEED" : "IMPORT SEED"}
                </button>
              </>
            ))}
          </div>
          <Input label="Account name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. DeFi, Staking" autoFocus style={{ fontFamily: "var(--font-sans)" }} />
          {addMode === "import" && (
            <Input
              label="Seed (55 lowercase letters)"
              type="password"
              value={addSeed}
              onChange={(e) => { setAddSeed(e.target.value); if (addSeedError) setAddSeedError(""); }}
              error={addSeedError}
              placeholder="55 characters, lowercase"
              autoComplete="off"
            />
          )}
          <Input type="password" label="Vault password" value={addPassword} onChange={(e) => { setAddPassword(e.target.value); setAddError(""); }} onKeyDown={(e) => e.key === "Enter" && !addLoading && doAdd()} error={addError} placeholder="••••••••••" autoComplete="current-password" />
          <Button onClick={doAdd} loading={addLoading} disabled={!addName.trim() || !addPassword || (addMode === "import" && !addSeed.trim())}>Add account</Button>
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

      {/* Hide confirmation modal */}
      <Modal open={!!hidingAccount} onClose={() => setHidingAccount(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Hide {hidingAccount?.name}?
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
            The account will be removed from the switcher. It can be restored from this screen.
          </div>
          <Button onClick={confirmHide}>Hide account</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setHidingAccount(null)}>Cancel</Button>
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

      {/* Reveal seed modal */}
      <Modal open={!!revealingAccount} onClose={() => setRevealingAccount(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Reveal seed for {revealingAccount?.name}
          </div>
          {!revealedSeed ? (
            <>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
                Enter the vault password to decrypt this account seed.
              </div>
              <Input
                type="password"
                label="Vault password"
                value={revealPassword}
                onChange={(e) => { setRevealPassword(e.target.value); setRevealError(""); }}
                onKeyDown={(e) => e.key === "Enter" && !revealLoading && doRevealSeed()}
                error={revealError}
                placeholder="••••••••••"
                autoComplete="current-password"
                autoFocus
              />
              <Button onClick={doRevealSeed} loading={revealLoading} disabled={!revealPassword}>
                Reveal seed
              </Button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
                [SEED VISIBLE FOR 60 SECONDS]
              </div>
              <div
                style={{
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-sharp)",
                  padding: "var(--space-4)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-lg)",
                  color: "var(--color-text-display)",
                  letterSpacing: "0.08em",
                  lineHeight: 1.8,
                  wordBreak: "break-all",
                }}
              >
                {revealedSeed}
              </div>
              <Button variant="secondary" shape="sharp" onClick={copyRevealedSeed}>
                {seedCopied ? "[COPIED]" : "Copy"}
              </Button>
            </>
          )}
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setRevealingAccount(null)}>
            Close
          </Button>
        </div>
      </Modal>

      <Sheet
        open={!!selectedAccount}
        onClose={closeAccountMenu}
        title={selectedAccount ? `Manage ${selectedAccount.name}` : "Manage account"}
        footer={
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={closeAccountMenu}>
            Close
          </Button>
        }
      >
        {selectedAccount && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: "var(--radius-sharp)",
              }}
            >
              <Identicon seed={sessionWallets[selectedAccount.index]?.identity ?? selectedAccount.name} size={40} radius={6} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
                  {selectedAccount.name}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                  ACCOUNT {selectedAccount.index + 1}
                  {selectedAccount.hidden ? " · HIDDEN" : ""}
                  {isActive && settings.activeAccountIndex === selectedAccount.index ? " · ACTIVE" : ""}
                </div>
              </div>
            </div>

            <ActionCard
              title="Rename"
              description="Change the label shown in the vault and account switcher."
              onClick={() => {
                setRenamingAccount(selectedAccount);
                setRenameValue(selectedAccount.name);
                closeAccountMenu();
              }}
            />
            <ActionCard
              title="Reveal seed"
              description="Decrypt and display this account seed for a limited time."
              onClick={() => {
                openReveal(selectedAccount);
                closeAccountMenu();
              }}
            />
            <ActionCard
              title={selectedAccount.hidden ? "Unhide account" : "Hide account"}
              description={selectedAccount.hidden ? "Show this account in the switcher again." : "Remove this account from the switcher without deleting it."}
              onClick={() => {
                toggleHide(selectedAccount);
                closeAccountMenu();
              }}
            />
            <ActionCard
              title="Remove account"
              description="Delete this account from the vault. This cannot be undone."
              danger
              onClick={() => {
                setRemovingAccount(selectedAccount);
                setRemovePassword("");
                setRemoveError("");
                closeAccountMenu();
              }}
            />
          </div>
        )}
      </Sheet>
    </AppShell>
  );
}

interface AccountRowProps {
  account: AccountMeta;
  accentColor: string;
  identity: string | null;
  isCurrent: boolean;
  dimmed?: boolean;
  onManage: () => void;
}

function AccountRow({ account, accentColor, identity, isCurrent, dimmed, onManage }: AccountRowProps) {
  return (
    <div
      style={{
        opacity: dimmed ? 0.55 : 1,
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-strong)",
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: "var(--radius-sharp)",
        padding: "var(--space-3)",
        display: "flex",
        gap: "var(--space-3)",
        alignItems: "flex-start",
      }}
    >
      <Identicon seed={identity ?? account.name} size={40} radius={6} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-1)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: 2 }}>
              {account.name}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              ACCOUNT {account.index + 1}
            </div>
          </div>
          <button
            type="button"
            onClick={onManage}
            style={{
              background: "none",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-sharp)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-mono-sm)",
              color: "var(--color-text-secondary)",
              letterSpacing: "0.05em",
              padding: "var(--space-1) var(--space-2)",
              flexShrink: 0,
            }}
          >
            MANAGE
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {isCurrent && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: accentColor, letterSpacing: "0.05em" }}>
              [ACTIVE]
            </span>
          )}
          {account.hidden && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              [HIDDEN]
            </span>
          )}
        </div>
        {identity && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <IdentityDisplay identity={identity} showIdenticon={false} />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  danger,
  onClick,
}: {
  title: string;
  description: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        width: "100%",
        textAlign: "left",
        background: danger ? "color-mix(in srgb, var(--color-status-error) 8%, var(--color-bg-surface))" : "var(--color-bg-surface)",
        border: `1px solid ${danger ? "color-mix(in srgb, var(--color-status-error) 40%, var(--color-border-strong))" : "var(--color-border-strong)"}`,
        borderRadius: "var(--radius-sharp)",
        cursor: "pointer",
        padding: "var(--space-4)",
      }}
    >
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: danger ? "var(--color-status-error)" : "var(--color-text-display)", marginBottom: "var(--space-1)" }}>
          {title}
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: danger ? "var(--color-status-error)" : "var(--color-text-disabled)", letterSpacing: "0.05em", flexShrink: 0 }}>
        →
      </span>
    </button>
  );
}
