import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { invoke } from "@tauri-apps/api/core";
import { Fingerprint } from "lucide-react";
import { motion } from "motion/react";
import { usePersistedStore } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import { unlockSecureSession } from "@/lib/secure-session";
import { unlockVault, toSeed } from "@/lib/vault";
import { extractMessage } from "@/lib/format";
import { FullPage } from "@/layouts/full-page";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import type { Seed } from "@/lib/crypto";
import { isWatchOnlyVault } from "@/lib/accounts";
import { recordAuditEvent } from "@/lib/audit-log";

interface FormValues {
  password: string;
}

const PASSWORD_MAX_ATTEMPTS = 5;
const PASSWORD_LOCKOUT_SECS = 30;

const VAULT_COLOR: Record<string, string> = {
  slate: "var(--color-vault-slate)",
  red: "var(--color-vault-red)",
  amber: "var(--color-vault-amber)",
  emerald: "var(--color-vault-emerald)",
  sky: "var(--color-vault-sky)",
  violet: "var(--color-vault-violet)",
};

// Both counters are module-level so they survive remounts and cannot be reset
// by navigating away from the lock screen and back.
let _bioFailures = 0;
let _passwordAttempts = 0;

export default function LockScreen() {
  const navigate = useNavigate();
  const isLinux = navigator.userAgent.toLowerCase().includes("linux");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioFailures, setBioFailures] = useState(_bioFailures);
  const [, setPasswordAttempts] = useState(_passwordAttempts);
  const [lockoutSecsLeft, setLockoutSecsLeft] = useState(0);
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const passwordLockoutUntil = usePersistedStore((s) => s.passwordLockoutUntil);
  const setPasswordLockoutUntil = usePersistedStore((s) => s.setPasswordLockoutUntil);

  const vaults = usePersistedStore((s) => s.vaults);
  const settings = usePersistedStore((s) => s.settings);
  const touchVaultUnlocked = usePersistedStore((s) => s.touchVaultUnlocked);
  const unlock = useSessionStore((s) => s.unlock);
  const hasPendingRequest = useSessionStore((s) => s.pendingRequests.length > 0);

  const vault = vaults.find((v) => v.id === settings.activeVaultId) ?? vaults[0];
  const watchOnly = isWatchOnlyVault(vault);
  const bioEnabled = vault ? (settings.biometricVaultIds ?? []).includes(vault.id) : false;

  const { register, handleSubmit } = useForm<FormValues>();

  useEffect(() => () => { if (lockoutRef.current) clearInterval(lockoutRef.current); }, []);

  // Resume any lockout that was active before app restart
  useEffect(() => {
    const remaining = Math.ceil((passwordLockoutUntil - Date.now()) / 1000);
    if (remaining > 0) startCountdown(remaining);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCountdown(secs: number) {
    setLockoutSecsLeft(secs);
    lockoutRef.current = setInterval(() => {
      setLockoutSecsLeft((s) => {
        if (s <= 1) {
          clearInterval(lockoutRef.current!);
          lockoutRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function startLockout() {
    setPasswordLockoutUntil(Date.now() + PASSWORD_LOCKOUT_SECS * 1000);
    startCountdown(PASSWORD_LOCKOUT_SECS);
  }

  async function finishUnlock(seeds: Seed[]) {
    if (!vault) return;
    const wallets = unlockSecureSession(seeds);
    unlock(vault.id, wallets);
    touchVaultUnlocked(vault.id);
    recordAuditEvent({
      kind: "unlock_succeeded",
      status: "success",
      title: "Vault unlocked",
      detail: vault.name,
      vaultId: vault.id,
    });
    _bioFailures = 0;
    _passwordAttempts = 0;
    navigate(hasPendingRequest ? "/request" : "/dashboard", { replace: true });
  }

  async function doUnlock(password: string) {
    if (!vault) return;
    if (!vault.encryptedData) { setError("VAULT DATA MISSING"); return; }
    const seeds = await unlockVault(vault.encryptedData, password);
    await finishUnlock(seeds);
  }

  async function openWatchOnlyVault() {
    if (!vault) return;
    unlock(vault.id, [], {
      watchOnly: true,
      identities: vault.accounts.map((account) => account.identity).filter((identity): identity is string => !!identity),
    });
    touchVaultUnlocked(vault.id);
    recordAuditEvent({
      kind: "unlock_succeeded",
      status: "success",
      title: "Watch-only vault opened",
      detail: vault.name,
      vaultId: vault.id,
    });
    navigate(hasPendingRequest ? "/request" : "/dashboard", { replace: true });
  }

  async function onSubmit({ password }: FormValues) {
    if (!vault || lockoutSecsLeft > 0) return;
    setLoading(true);
    setError("");
    try {
      await doUnlock(password);
    } catch {
      recordAuditEvent({
        kind: "unlock_failed",
        status: "failure",
        title: "Unlock failed",
        detail: vault.name,
        vaultId: vault.id,
      });
      const next = _passwordAttempts + 1;
      _passwordAttempts = next;
      setPasswordAttempts(next);
      if (next >= PASSWORD_MAX_ATTEMPTS) {
        setError(`TOO MANY ATTEMPTS — WAIT ${PASSWORD_LOCKOUT_SECS} SECONDS`);
        startLockout();
        _passwordAttempts = 0;
        setPasswordAttempts(0);
      } else {
        setError(`WRONG PASSWORD — ${PASSWORD_MAX_ATTEMPTS - next} ${PASSWORD_MAX_ATTEMPTS - next === 1 ? "ATTEMPT" : "ATTEMPTS"} REMAINING`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onBiometric() {
    if (!vault || bioFailures >= 3) return;
    setLoading(true);
    setError("");
    if (!vault.encryptedData) { setError("VAULT DATA MISSING"); setLoading(false); return; }
    try {
      const seeds = await invoke<string[]>("biometric_unlock", {
        vaultId: vault.id,
        vaultData: vault.encryptedData,
      });
      await finishUnlock(seeds.map(toSeed));
    } catch (e) {
      recordAuditEvent({
        kind: "unlock_failed",
        status: "failure",
        title: "Biometric unlock failed",
        detail: vault.name,
        vaultId: vault.id,
      });
      const next = bioFailures + 1;
      _bioFailures = next;
      setBioFailures(next);
      if (next >= 3) {
        setError("TOO MANY FAILURES — USE PASSWORD");
      } else {
        setError(`${isLinux ? "QUICK UNLOCK" : "BIOMETRIC"} FAILED: ${extractMessage(e)}`);
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

        {watchOnly ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
              WATCH-ONLY VAULT
            </div>
            <Button onClick={openWatchOnlyVault}>
              Open vault
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <Input
              {...register("password")}
              type="password"
              label="Password"
              placeholder="••••••••••"
              autoComplete="current-password"
              error={lockoutSecsLeft > 0 ? `LOCKED — TRY AGAIN IN ${lockoutSecsLeft} ${lockoutSecsLeft === 1 ? "SECOND" : "SECONDS"}` : error}
              disabled={lockoutSecsLeft > 0}
              autoFocus
              containerStyle={{ marginBottom: "var(--space-6)" }}
            />
            <Button type="submit" loading={loading} disabled={lockoutSecsLeft > 0}>
              {lockoutSecsLeft > 0 ? `Wait ${lockoutSecsLeft}s` : "Unlock"}
            </Button>
          </form>
        )}

        {!watchOnly && bioEnabled && bioFailures >= 3 && (
          <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", marginTop: "var(--space-6)" }}>
            {isLinux ? "QUICK UNLOCK" : "BIOMETRIC"} UNAVAILABLE — USE PASSWORD
          </div>
        )}
        {!watchOnly && bioEnabled && bioFailures < 3 && (
          <button
            onClick={onBiometric}
            disabled={loading}
            aria-label={isLinux ? "Unlock with secure storage" : "Unlock with biometrics"}
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
                {isLinux ? "USE QUICK UNLOCK" : "USE BIOMETRIC"}
              </span>
            </button>
        )}
      </motion.div>
    </FullPage>
  );
}
