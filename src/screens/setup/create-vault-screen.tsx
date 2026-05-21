import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { FullPage } from "@/layouts/full-page";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { generateRandomSeed } from "@/lib/crypto";
import { SEED_AUTO_HIDE_MS, SEED_CLIPBOARD_CLEAR_SECS } from "@/lib/constants";
import { createVault, createWallet } from "@/lib/vault";
import { usePersistedStore, type VaultColor } from "@/store/persisted";
import { useSessionStore } from "@/store/session";
import type { Seed } from "@/lib/crypto";

type Step = 1 | 2 | 3 | 4;

function pickCheckPositions(seed: string, count = 4): number[] {
  const positions = new Set<number>();
  while (positions.size < count) {
    positions.add(Math.floor(Math.random() * seed.length));
  }
  return Array.from(positions).sort((a, b) => a - b);
}

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

export default function CreateVaultScreen() {
  const navigate = useNavigate();
  const addVault = usePersistedStore((s) => s.addVault);
  const setActiveVault = usePersistedStore((s) => s.setActiveVault);
  const unlock = useSessionStore((s) => s.unlock);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [color, setColor] = useState<VaultColor>("slate");
  const [seed] = useState<Seed>(() => generateRandomSeed());
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 3: spot-check state (4 random positions)
  const [checkPositions] = useState<number[]>(() => pickCheckPositions(seed));
  const [checkInputs, setCheckInputs] = useState(["", "", "", ""]);
  const checkRefs = useRef<(HTMLInputElement | null)[]>([]);

  const checkComplete = checkPositions.every((pos, i) => checkInputs[i] === seed[pos]);

  const [seedRevealed, setSeedRevealed] = useState(true);
  useEffect(() => {
    if (step !== 2) return;
    setSeedRevealed(true);
    const t = setTimeout(() => setSeedRevealed(false), SEED_AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [step]);

  const strength = strengthOf(password);

  function goStep2() {
    if (!name.trim()) { setNameError("NAME REQUIRED"); return; }
    setNameError("");
    setStep(2);
  }

  async function copySeed() {
    try {
      await invoke("copy_to_clipboard", { text: seed, clearAfterSecs: SEED_CLIPBOARD_CLEAR_SECS });
    } catch {
      await navigator.clipboard.writeText(seed).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCheckInput(idx: number, raw: string) {
    const val = raw.slice(-1).toLowerCase();
    setCheckInputs((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    if (val) checkRefs.current[idx + 1]?.focus();
  }

  function handleCheckKey(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !checkInputs[idx]) {
      checkRefs.current[idx - 1]?.focus();
    }
  }

  async function finish() {
    if (strength.level < 1) return;
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
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 2,
                background: step >= s ? "var(--color-text-display)" : "var(--color-border-strong)",
                transition: `background var(--duration-base) var(--ease-out)`,
              }}
            />
          ))}
        </div>

        {/* Step 1 — Name + color */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-2)" }}>
                Create your vault.
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
                Name it something you'll recognise.
              </div>
            </div>

            <Input
              label="Vault name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goStep2()}
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
                    aria-label={`Vault color: ${c}`}
                    aria-pressed={color === c}
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

            <Button onClick={goStep2}>Continue</Button>
            <Button variant="ghost" size="md" shape="sharp" style={{ width: "auto", margin: "0 auto" }} onClick={() => navigate("/setup")}>
              Back
            </Button>
          </div>
        )}

        {/* Step 2 — Seed display */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-2)" }}>
                Your seed phrase.
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-status-warning)" }}>
                Write this down. It cannot be recovered.
              </div>
            </div>

            <div
              role="region"
              aria-label="Your seed phrase"
              style={{ position: "relative" }}
            >
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
                  filter: seedRevealed ? "none" : "blur(6px)",
                  userSelect: seedRevealed ? "text" : "none",
                  transition: "filter 0.2s ease-out",
                }}
                aria-hidden={!seedRevealed}
              >
                {seed.split("").map((char, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03, duration: 0.06, ease: "easeOut" }}
                  >
                    {char}{(i + 1) % 5 === 0 && i < seed.length - 1 ? " " : ""}
                  </motion.span>
                ))}
              </div>
              {!seedRevealed && (
                <button
                  onClick={() => setSeedRevealed(true)}
                  style={{
                    position: "absolute", inset: 0, width: "100%", background: "none",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", borderRadius: "var(--radius-sharp)",
                  }}
                  aria-label="Reveal seed phrase"
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                    [TAP TO REVEAL]
                  </span>
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button variant="secondary" shape="sharp" size="md" style={{ flex: 1 }} onClick={copySeed}>
                {copied ? "[COPIED]" : "Copy"}
              </Button>
              <Button variant="secondary" shape="sharp" size="md" style={{ flex: 1 }} onClick={() => setSeedRevealed((v) => !v)}>
                {seedRevealed ? "Hide" : "Reveal"}
              </Button>
            </div>
            <Button onClick={() => setStep(3)}>I've written it down</Button>
          </div>
        )}

        {/* Step 3 — Spot-check backup */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-headline)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: "var(--space-2)" }}>
                Confirm your backup.
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
                Fill in the highlighted characters.
              </div>
            </div>

            {/* Seed with blanked positions */}
            <div
              aria-label="Seed phrase with blanked positions"
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: "var(--radius-sharp)",
                padding: "var(--space-4)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-mono-lg)",
                letterSpacing: "0.08em",
                lineHeight: 1.8,
                wordBreak: "break-all",
              }}
            >
              {seed.split("").map((char, i) => {
                const blankIdx = checkPositions.indexOf(i);
                if (blankIdx !== -1) {
                  const filled = checkInputs[blankIdx];
                  const correct = filled === char;
                  return (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        minWidth: "0.75em",
                        textAlign: "center",
                        background: filled ? (correct ? "var(--color-status-success)" : "var(--color-status-error)") : "var(--color-bg-elevated)",
                        color: filled ? "var(--color-bg-base)" : "var(--color-text-disabled)",
                        borderRadius: 2,
                        transition: "background 0.1s ease-out",
                      }}
                    >
                      {filled || "_"}
                    </span>
                  );
                }
                return <span key={i} style={{ color: "var(--color-text-display)" }}>{char}</span>;
              })}
            </div>

            {/* 4 labeled inputs */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
              {checkPositions.map((pos, i) => (
                <div key={pos} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)", flex: 1 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
                    #{pos + 1}
                  </span>
                  <input
                    ref={(el) => { checkRefs.current[i] = el; }}
                    autoComplete="off"
                    value={checkInputs[i]}
                    onChange={(e) => handleCheckInput(i, e.target.value)}
                    onKeyDown={(e) => handleCheckKey(i, e)}
                    maxLength={1}
                    autoFocus={i === 0}
                    aria-label={`Character at position ${pos + 1}`}
                    className="sigil-input"
                    style={{
                      width: "100%",
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-mono-lg)",
                      background: "var(--color-bg-subtle)",
                      borderRadius: "var(--radius-sharp)",
                      padding: "var(--space-3) 0",
                      borderColor: checkInputs[i]
                        ? (checkInputs[i] === seed[pos] ? "var(--color-status-success)" : "var(--color-status-error)")
                        : undefined,
                      transition: "border-color 0.1s ease-out",
                    }}
                  />
                </div>
              ))}
            </div>

            <Button onClick={() => setStep(4)} disabled={!checkComplete}>Confirm</Button>
          </div>
        )}

        {/* Step 4 — Password */}
        {step === 4 && (
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
                onKeyDown={(e) => e.key === "Enter" && !loading && strength.level >= 1 && finish()}
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

            <Button onClick={finish} loading={loading} disabled={strength.level < 1}>
              Create vault
            </Button>
          </div>
        )}
      </div>
    </FullPage>
  );
}
