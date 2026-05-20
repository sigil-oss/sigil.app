import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "lg" | "md" | "sm";
type Shape = "pill" | "sharp";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--color-text-display)",
    color: "var(--color-bg-base)",
    borderColor: "transparent",
  },
  secondary: {
    background: "transparent",
    color: "var(--color-text-primary)",
    borderColor: "var(--color-border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-secondary)",
    borderColor: "transparent",
  },
  danger: {
    background: "transparent",
    color: "var(--color-status-error)",
    borderColor: "var(--color-status-error)",
  },
};

const SIZE: Record<Size, CSSProperties> = {
  lg: { height: 48, padding: "0 24px", fontSize: "var(--text-body)", width: "100%" },
  md: { height: 40, padding: "0 16px", fontSize: "var(--text-label)" },
  sm: { height: 32, padding: "0 12px", fontSize: "var(--text-caption)" },
};

const SHAPE: Record<Shape, CSSProperties> = {
  pill: { borderRadius: "var(--radius-pill)" },
  sharp: { borderRadius: "var(--radius-sharp)" },
};

export function Button({
  variant = "primary",
  size = "lg",
  shape = "pill",
  loading = false,
  children,
  style,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={`sigil-btn ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        border: "1px solid",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        ...VARIANT[variant],
        ...SIZE[size],
        ...SHAPE[shape],
        ...style,
      }}
    >
      {loading ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)" }}>
          [PROCESSING...]
        </span>
      ) : (
        children
      )}
    </button>
  );
}
