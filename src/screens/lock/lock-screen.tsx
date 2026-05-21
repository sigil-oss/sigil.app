import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { invoke } from "@tauri-apps/api/core";
import { Fingerprint } from "lucide-react";
import { motion } from "motion/react";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { unlockVault, createWallet } from "@/lib/vault";
import { extractMessage } from "@/lib/format";
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

// Persists across remounts so 3-failure lockout cannot be bypassed by navigation
let _bioFailures = 0;

export default function LockScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioFailures, setBioFailures] = useState(_bioFailures);

  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const touchVaultUnlocked = usePersistedStore((s) => s.touchVaultUnlocked);
  const unlock = useSessionStore((s) => s.unlock);
  const pendingRequest = useSessionStore((s) => s.pendingRequest);

  const vault = vaults.find((v) => v.id === settings.activeVaultId) ?? vaults[0];
  const bioEnabled = vault ? (settings.biometricVaultIds ?? []).includes(vault.id) : false;

  const { register, handleSubmit } = useForm<FormValues>();

  async function doUnlock(password: string) {
    if (!vault) return;
    const seeds = await unlockVault(vault.encryptedData, password);
    const wallets = seeds.map(createWallet);
    unlock(vault.id, seeds, wallets);
    touchVaultUnlocked(vault.id);
    _bioFailures = 0;
    navigate(pendingRequest ? "/request" : "/dashboard", { replace: true });
  }

  async function onSubmit({ password }: FormValues) {
    if (!vault) return;
    setLoading(true);
    setError("");
    try {
      await doUnlock(password);
    } catch {
      setError("WRONG PASSWORD");
    } finally {
      setLoading(false);
    }
  }

  async function onBiometric() {
    if (!vault || bioFailures >= 3) return;
    setLoading(true);
    setError("");
    try {
      const password = await invoke<string>("biometric_unlock", { vaultId: vault.id });
      await doUnlock(password);
    } catch (e) {
      const next = bioFailures + 1;
      _bioFailures = next;
      setBioFailures(next);
      if (next >= 3) {
        setError("TOO MANY FAILURES — USE PASSWORD");
      } else {
        setError(`BIOMETRIC FAILED: ${extractMessage(e)}`);
      }
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

  if (!vault) return null;

  return (
    <FullPage>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{ width: "100%", maxWidth: 320 }}
      >
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
            autoComplete="current-password"
            error={error}
            autoFocus
            containerStyle={{ marginBottom: "var(--space-6)" }}
          />
          <Button type="submit" loading={loading}>
            Unlock
          </Button>
        </form>

        {bioEnabled && bioFailures < 3 && (
          <button
            onClick={onBiometric}
            disabled={loading}
            aria-label="Unlock with biometrics"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              marginTop: "var(--space-6)",
              width: "100%",
              background: "none",
              border: "none",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.4 : 1,
              padding: "var(--space-2)",
            }}
          >
            <Fingerprint size={18} color="var(--color-text-secondary)" strokeWidth={1.5} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono-sm)",
                color: "var(--color-text-secondary)",
                letterSpacing: "0.05em",
              }}
            >
              USE BIOMETRIC
            </span>
          </button>
        )}
      </motion.div>
    </FullPage>
  );
}
