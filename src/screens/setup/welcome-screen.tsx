import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "@/layouts/full-page";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { usePersistedStore, type VaultColor, type AccountMeta } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { AlertTriangle } from "lucide-react";
import { unlockVault, createVault, createWallet, type VaultData } from "@/lib/vault";
import { newId } from "@/lib/crypto";
import { MAX_VAULT_ACCOUNTS } from "@/hooks/use-vault-balances";

interface ImportFileData {
  name: string;
  color: VaultColor;
  accounts: AccountMeta[];
  vault: VaultData;
}

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const addVault = usePersistedStore((s) => s.addVault);
  const setActiveVault = usePersistedStore((s) => s.setActiveVault);
  const unlock = useSessionStore((s) => s.unlock);
  const pendingRequest = useSessionStore((s) => s.pendingRequest);

  const [importData, setImportData] = useState<ImportFileData | null>(null);
  const [importPw, setImportPw] = useState("");
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  function openFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.sigil !== 1 || !parsed.vault || !parsed.name?.trim()) throw new Error("bad format");
        const accounts: AccountMeta[] = parsed.accounts ?? [];
        setImportData({
          name: parsed.name,
          color: parsed.color ?? "slate",
          accounts,
          vault: parsed.vault as VaultData,
        });
        if (accounts.length > MAX_VAULT_ACCOUNTS) {
          const sorted = [...accounts].sort((a, b) => a.index - b.index);
          setSelectedIndices(new Set(sorted.slice(0, MAX_VAULT_ACCOUNTS).map((a) => a.index)));
        } else {
          setSelectedIndices(new Set());
        }
        setImportPw("");
        setImportError("");
      } catch {
        // malformed or wrong file type — ignore
      }
    };
    input.click();
  }

  function toggleAccount(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < MAX_VAULT_ACCOUNTS) {
        next.add(index);
      }
      return next;
    });
  }

  async function doImport() {
    if (!importData) return;
    setImportLoading(true);
    setImportError("");
    try {
      const allSeeds = await unlockVault(importData.vault, importPw);

      let finalSeeds = allSeeds;
      let finalAccounts = importData.accounts;
      let finalEncryptedData: VaultData = importData.vault;

      if (importData.accounts.length > MAX_VAULT_ACCOUNTS) {
        const sortedSelected = [...selectedIndices].sort((a, b) => a - b);
        finalSeeds = sortedSelected.map((i) => allSeeds[i]);
        const byIndex = new Map(importData.accounts.map((a) => [a.index, a]));
        finalAccounts = sortedSelected.map((origIdx, newIdx) => ({ ...byIndex.get(origIdx)!, index: newIdx }));
        finalEncryptedData = await createVault(importPw, finalSeeds);
      }

      const newVaultId = newId();
      addVault({
        id: newVaultId,
        name: importData.name,
        color: importData.color,
        createdAt: Date.now(),
        lastUnlockedAt: Date.now(),
        accounts: finalAccounts,
        encryptedData: finalEncryptedData,
      });
      setActiveVault(newVaultId);
      unlock(newVaultId, finalSeeds, finalSeeds.map(createWallet));
      navigate("/dashboard", { replace: true });
    } catch {
      setImportError("WRONG PASSWORD");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {pendingRequest && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-3)",
              padding: "var(--space-3) var(--space-4)",
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-status-warning)",
              borderRadius: "var(--radius-sharp)",
            }}
          >
            <AlertTriangle size={14} color="var(--color-status-warning)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-warning)", letterSpacing: "0.05em", lineHeight: 1.5 }}>
              A DAPP REQUEST IS WAITING. CREATE OR IMPORT A WALLET TO PROCEED.
            </span>
          </div>
        )}
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-mono-sm)",
              color: "var(--color-text-secondary)",
              letterSpacing: "0.15em",
              marginBottom: "var(--space-4)",
            }}
          >
            SIGIL
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-headline)",
              fontWeight: 500,
              color: "var(--color-text-display)",
            }}
          >
            Your keys.<br />Your Qubic.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Button variant="primary" shape="pill" onClick={() => navigate("/setup/create")}>
            Create wallet
          </Button>
          <Button variant="secondary" shape="sharp" onClick={() => navigate("/setup/import")}>
            Import seed
          </Button>
          <Button variant="ghost" shape="sharp" onClick={openFilePicker}>
            Import vault file
          </Button>
        </div>
      </div>

      <Modal open={!!importData} onClose={() => setImportData(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-1)" }}>
              Import {importData?.name}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
              {importData && importData.accounts.length > MAX_VAULT_ACCOUNTS
                ? `${selectedIndices.size} / ${MAX_VAULT_ACCOUNTS} SELECTED`
                : `${importData?.accounts.length ?? 0} ${(importData?.accounts.length ?? 0) === 1 ? "ACCOUNT" : "ACCOUNTS"}`}
            </div>
          </div>

          {importData && importData.accounts.length > MAX_VAULT_ACCOUNTS && (
            <div style={{ maxHeight: 196, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {[...importData.accounts].sort((a, b) => a.index - b.index).map((account) => {
                const selected = selectedIndices.has(account.index);
                const atLimit = !selected && selectedIndices.size >= MAX_VAULT_ACCOUNTS;
                return (
                  <button
                    key={account.index}
                    type="button"
                    onClick={() => toggleAccount(account.index)}
                    disabled={atLimit}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--space-3)",
                      background: "none", border: "none", textAlign: "left",
                      padding: "var(--space-2) 0", cursor: atLimit ? "not-allowed" : "pointer",
                      opacity: atLimit ? 0.35 : 1,
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", letterSpacing: "0.05em", flexShrink: 0, width: 14, color: selected ? "var(--color-text-display)" : "var(--color-text-disabled)" }}>
                      {selected ? "✓" : "○"}
                    </span>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: selected ? "var(--color-text-display)" : "var(--color-text-secondary)" }}>
                      {account.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <Input
            type="password"
            label="Vault password"
            value={importPw}
            onChange={(e) => { setImportPw(e.target.value); setImportError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !importLoading && doImport()}
            error={importError}
            placeholder="••••••••••"
            autoComplete="current-password"
            autoFocus
          />
          <Button
            onClick={doImport}
            loading={importLoading}
            disabled={!importPw || (importData !== null && importData.accounts.length > MAX_VAULT_ACCOUNTS && selectedIndices.size === 0)}
          >
            Import vault
          </Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setImportData(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </FullPage>
  );
}
