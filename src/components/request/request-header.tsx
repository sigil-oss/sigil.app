import { Lock, ShieldAlert } from "lucide-react";
import { Tag } from "@/components/tag";

export interface DappInfo {
  name: string;
  origin: string;
  icon?: string;
}

interface RequestHeaderProps {
  dapp: DappInfo;
}

export function RequestHeader({ dapp }: RequestHeaderProps) {
  const isHttps = dapp.origin.startsWith("https://");
  const isLocalhost =
    dapp.origin.startsWith("http://localhost") ||
    dapp.origin.startsWith("http://127.0.0.1");
  const isSecure = isHttps || isLocalhost;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          {isSecure ? (
            <Lock size={11} color="var(--color-status-success)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          ) : (
            <ShieldAlert size={11} color="var(--color-status-error)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {dapp.origin}
          </span>
        </div>
        <Tag variant="warning">UNVERIFIED</Tag>
      </div>

      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {dapp.name}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: isSecure ? "var(--color-text-secondary)" : "var(--color-status-error)", letterSpacing: "0.05em" }}>
        {isSecure
          ? "[ORIGIN IS SELF-REPORTED. VERIFY THE DAPP BEFORE APPROVING.]"
          : "[WARNING: INSECURE ORIGIN. DEEP-LINK ORIGIN IS SELF-REPORTED.]"}
      </div>
    </div>
  );
}
