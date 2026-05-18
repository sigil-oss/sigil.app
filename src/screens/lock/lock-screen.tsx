import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { unlockVault, createWallet } from "@/lib/vault";
import { FullPage } from "@/layouts/full-page";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

interface FormValues {
  password: string;
}

const VAULT_COLOR: Record<string, string> = {
  slate: "var(--color-vault-slate)",
  red: "var(--color-vault-red)",
  amber: "var(--color-vault-amber)",
  emerald: "var(--color-vault-emerald)",
  sky: "var(--color-vault-sky)",
  violet: "var(--color-vault-violet)",
};

export default function LockScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const touchVaultUnlocked = usePersistedStore((s) => s.touchVaultUnlocked);
  const unlock = useSessionStore((s) => s.unlock);

  const vault = vaults.find((v) => v.id === settings.activeVaultId) ?? vaults[0];

  const { register, handleSubmit } = useForm<FormValues>();

  async function onSubmit({ password }: FormValues) {
    if (!vault) return;
    setLoading(true);
    setError("");
    try {
      const seeds = await unlockVault(vault.encryptedData, password);
      const wallets = seeds.map(createWallet);
      unlock(vault.id, seeds, wallets);
      touchVaultUnlocked(vault.id);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("WRONG PASSWORD");
    } finally {
      setLoading(false);
    }
  }

  const lastUnlocked = vault?.lastUnlockedAt
    ? new Date(vault.lastUnlockedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 320 }}>
        {vault && (
          <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: VAULT_COLOR[vault.color] ?? "var(--color-text-secondary)",
                display: "inline-block",
                marginBottom: "var(--space-4)",
              }}
            />
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-headline)",
                color: "var(--color-text-display)",
                letterSpacing: "0.1em",
              }}
            >
              {vault.name.toUpperCase()}
            </div>
            {lastUnlocked && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-mono-sm)",
                  color: "var(--color-text-disabled)",
                  marginTop: "var(--space-2)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                LAST UNLOCKED {lastUnlocked.toUpperCase()}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Input
            {...register("password")}
            type="password"
            label="Password"
            placeholder="••••••••••"
            error={error}
            autoFocus
            containerStyle={{ marginBottom: "var(--space-6)" }}
          />
          <Button type="submit" loading={loading}>
            Unlock
          </Button>
        </form>
      </div>
    </FullPage>
  );
}
