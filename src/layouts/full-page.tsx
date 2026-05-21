import type { CSSProperties, ReactNode } from "react";

export interface FullPageProps {
  children: ReactNode;
  centered?: boolean;
  style?: CSSProperties;
}

export function FullPage({ children, centered = true, style }: FullPageProps) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: centered ? "center" : "stretch",
        justifyContent: centered ? "safe center" : "flex-start",
        padding: "var(--space-8) var(--space-6)",
        background: "var(--color-bg-base)",
        overflowY: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
