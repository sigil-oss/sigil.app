export interface DappInfo {
	name: string;
	origin: string;
	icon?: string;
}

export function RequestHeader({ dapp }: { dapp: DappInfo }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
			<div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
				DEEP LINK REQUEST
			</div>
			<div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
				{dapp.name || "Unknown app"}
			</div>
			<div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", wordBreak: "break-all" }}>
				{dapp.origin}
			</div>
		</div>
	);
}
