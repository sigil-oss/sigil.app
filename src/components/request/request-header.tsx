import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import { Tag } from "@/components/tag";
import type { RequestTrustInfo } from "@/lib/request-trust";

export interface DappInfo {
  name: string;
  origin: string;
  icon?: string;
}

interface RequestHeaderProps {
  dapp: DappInfo;
  trust: RequestTrustInfo;
}

function trustVisual(trust: RequestTrustInfo) {
  switch (trust.level) {
    case "verified_registry":
      return { icon: ShieldCheck, color: "var(--color-status-success)", tag: "verified", variant: "success" as const };
    case "signed_untrusted":
      return { icon: ShieldQuestion, color: "var(--color-text-secondary)", tag: "signed", variant: "neutral" as const };
    case "legacy_unverified":
      return { icon: ShieldAlert, color: "var(--color-status-warning)", tag: "unverified", variant: "warning" as const };
    default:
      return { icon: ShieldX, color: "var(--color-status-error)", tag: "blocked", variant: "error" as const };
  }
}

export function RequestHeader({ dapp, trust }: RequestHeaderProps) {
  const visual = trustVisual(trust);
  const Icon = visual.icon;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          <Icon size={11} color={visual.color} strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            DEEP LINK SENDER
          </span>
        </div>
        <Tag variant={visual.variant}>{visual.tag}</Tag>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
          {trust.title}
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          {trust.detail}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
          declared origin: {dapp.origin || "—"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
          declared name: {dapp.name || "—"}
        </div>
        {trust.issuer && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
            issuer: {trust.issuer}
          </div>
        )}
        {trust.verifiedOrigin && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-status-success)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
            verified origin: {trust.verifiedOrigin}
          </div>
        )}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: trust.blocking ? "var(--color-status-error)" : visual.color, letterSpacing: "0.05em" }}>
        [{trust.blocking ? "REQUEST IS BLOCKED UNTIL TRUST CHECKS PASS." : trust.level === "verified_registry" ? "REGISTRY VERIFICATION PASSED." : trust.level === "signed_untrusted" ? "SIGNATURE VERIFIED, BUT ISSUER IS NOT TRUSTED LOCALLY." : "SELF-REPORTED METADATA IS NOT AN AUTHENTICATED DAPP IDENTITY."}]
      </div>
    </div>
  );
}
