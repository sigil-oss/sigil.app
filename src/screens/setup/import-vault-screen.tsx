import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FullPage } from "@/layouts/full-page";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { toSeed, InvalidSeedError } from "@/lib/crypto";
import { createVault, createWallet } from "@/lib/vault";
import { usePersistedStore, type VaultColor } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import type { Seed } from "@/lib/crypto";

type Step = 1 | 2 | 3;

const COLORS: VaultColor[] = ["slate", "red", "amber", "emerald", "sky", "violet"];

const COLOR_CSS: Record<VaultColor, string> = {
  slate: "var(--color-vault-slate)",
  red: "var(--color-vault-red)",
  amber: "var(--color-vault-amber)",
  emerald: "var(--color-vault-emerald)",
  sky: "var(--color-vault-sky)",
  violet: "var(--color-vault-violet)",
};

function strengthOf(pw: string) {
  if (pw.length < 10) return { label: "TOO SHORT", level: 0, color: "var(--color-status-error)" };
  const score =
    (pw.length >= 14 ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);
  if (score <= 1) return { label: "FAIR", level: 1, color: "var(--color-status-warning)" };
  if (score <= 2) return { label: "GOOD", level: 2, color: "var(--color-status-success)" };
  return { label: "STRONG", level: 3, color: "var(--color-status-success)" };
}

export default function ImportVaultScreen() {
  const navigate = useNavigate();
  const addVault = usePersistedStore((s) => s.addVault);
  const setActiveVault = usePersistedStore((s) => s.setActiveVault);
  const unlock = useSessionStore((s) => s.unlock);

  const [step, setStep] = useState<Step>(1);
  const [seedInput, setSeedInput] = useState("");
  const [seed, setSeed] = useState<Seed | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<VaultColor>("slate");
  const [password, setPassword] = useState("");
  const [seedError, setSeedError] = useState("");
  const [nameError, setNameError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = strengthOf(password);

  function validateAndContinue() {
    try {
      const s = toSeed(seedInput.trim().toLowerCase());
      setSeed(s);
      setSeedError("");
      setStep(2);
    } catch (e) {
      setSeedError(e instanceof InvalidSeedError ? "55 LOWERCASE LETTERS REQUIRED" : "INVALID SEED");
    }
  }

  function goStep3() {
    if (!name.trim()) { setNameError("NAME REQUIRED"); return; }
    setNameError("");
    setStep(3);
  }

  async function finish() {
    if (!seed || password.length < 10) return;
    setLoading(true);
    try {
      const encryptedData = await createVault(password, [seed]);
      const vault = {
        id: globalThis.crypto.randomUUID(),
        name: name.trim(),
        color,
        createdAt: Date.now(),
        lastUnlockedAt: Date.now(),
        accounts: [{ index: 0, name: "Account 1", addedAt: Date.now(), hidden: false }],
        encryptedData,
      };
      addVault(vault);
      setActiveVault(vault.id);
      unlock(vault.id, [seed], [createWallet(seed)]);
      navigate("/dashboard", { replace: true });
    } catch {
      setLoading(false);
    }
  }

  return (
    <FullPage centered={false} style={{ justifyContent: "flex-start", paddingTop: "var(--space-8)" }}>
      <div style={{ width: "100%", maxWidth: 320, margin: "0 auto" }}>
        {/* Step progress bar */}
        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-8)" }}>
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              style={{
                flex: 1, height: 2,
                background: step >= s ? "var(--color-text-display)" : "var(--color-border-strong)",
                transition: `background var(--duration-base) var(--ease-out)`,
              }}
            />
          ))}
        </div>

        {/* Step 1 — Enter seed */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-2)" }}>
                Import your seed.
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
                55 lowercase letters. Never shared.
              </div>
            </div>

            <Input
              label="Seed phrase"
              type="password"
              value={seedInput}
              onChange={(e) => { setSeedInput(e.target.value); if (seedError) setSeedError(""); }}
              onKeyDown={(e) => e.key === "Enter" && validateAndContinue()}
              error={seedError}
              placeholder="55 characters, lowercase"
              autoFocus
            />

            <Button onClick={validateAndContinue}>Continue</Button>
            <Button variant="ghost" size="md" shape="sharp" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/setup")}>
              Back
            </Button>
          </div>
        )}

        {/* Step 2 — Name + color */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-2)" }}>
                Name your vault.
              </div>
            </div>

            <Input
              label="Vault name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goStep3()}
              error={nameError}
              placeholder="e.g. Main, Trading, Cold"
              autoFocus
              style={{ fontFamily: "var(--font-sans)" }}
            />

            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-3)" }}>
                Color
              </div>
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: COLOR_CSS[c],
                      border: color === c ? "2px solid var(--color-text-display)" : "2px solid transparent",
                      cursor: "pointer", padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>

            <Button onClick={goStep3}>Continue</Button>
          </div>
        )}

        {/* Step 3 — Password */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-2)" }}>
                Set a password.
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
                Minimum 10 characters. Never stored.
              </div>
            </div>

            <div>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && password.length >= 10 && finish()}
                placeholder="••••••••••"
                autoComplete="new-password"
                autoFocus
                containerStyle={{ marginBottom: "var(--space-3)" }}
              />
              {password.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <div style={{ display: "flex", gap: 3, flex: 1 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1, height: 2,
                          background: i <= strength.level ? strength.color : "var(--color-border-strong)",
                          transition: `background var(--duration-fast) var(--ease-out)`,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: strength.color, letterSpacing: "0.05em" }}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <Button onClick={finish} loading={loading} disabled={password.length < 10}>
              Import vault
            </Button>
          </div>
        )}
      </div>
    </FullPage>
  );
}
