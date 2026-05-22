import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import logoSrc from "../../src-tauri/icons/32x32.png";

function WinBtn({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 46,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered
          ? danger
            ? "var(--color-status-error)"
            : "var(--color-bg-elevated)"
          : "transparent",
        border: "none",
        cursor: "pointer",
        color: hovered && danger ? "#fff" : "var(--color-text-disabled)",
        transition: "background 80ms, color 80ms",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const win = useMemo(() => getCurrentWindow(), []);
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  useEffect(() => {
    win.isMaximized().then(setMaximized);
    win.isFullscreen().then(setFullscreen);
    let unlisten: (() => void) | undefined;
    let active = true;
    win.listen("tauri://resize", async () => {
      setMaximized(await win.isMaximized());
      setFullscreen(await win.isFullscreen());
    }).then((u) => {
      if (!active) u();
      else unlisten = u;
    });
    return () => { active = false; unlisten?.(); };
  }, [win]);

  if (fullscreen) return null;

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--color-bg-base)",
        borderBottom: "1px solid var(--color-border-subtle)",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {/* Identity — drag region, not interactive */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          pointerEvents: "none",
        }}
      >
        <img src={logoSrc} width={14} height={14} alt="" style={{ imageRendering: "pixelated", flexShrink: 0 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.5625rem",
            letterSpacing: "0.2em",
            color: "var(--color-text-secondary)",
          }}
        >
          SIGIL
        </span>
        {version && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", letterSpacing: "0.1em", color: "var(--color-text-disabled)" }}>
            v{version}
          </span>
        )}
      </div>

      {/* Window controls */}
      <div style={{ display: "flex", height: "100%" }}>
        <WinBtn onClick={() => win.minimize()} label="Minimize">
          <svg width="10" height="2" viewBox="0 0 10 2">
            <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </WinBtn>

        <WinBtn onClick={() => win.toggleMaximize()} label={maximized ? "Restore" : "Maximize"}>
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2.5" y="0.6" width="6.9" height="6.9" stroke="currentColor" strokeWidth="1.2" />
              <polyline points="0.6,2.5 0.6,9.4 7.5,9.4" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.6" y="0.6" width="8.8" height="8.8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </WinBtn>

        <WinBtn onClick={() => win.close()} label="Close" danger>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </WinBtn>
      </div>
    </div>
  );
}
