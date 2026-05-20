import type { CSSProperties } from "react";

export type TagVariant = "success" | "warning" | "error" | "neutral";

export interface TagProps {
  children: string;
  variant?: TagVariant;
  style?: CSSProperties;
}

const VARIANT_COLOR: Record<TagVariant, string> = {
  success: "var(--color-status-success)",
  warning: "var(--color-status-warning)",
  error: "var(--color-status-error)",
  neutral: "var(--color-text-secondary)",
};

export function Tag({ children, variant = "neutral", style }: TagProps) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-mono-sm)",
        color: VARIANT_COLOR[variant],
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        ...style,
      }}
    >
      [{children}]
    </span>
  );
}
