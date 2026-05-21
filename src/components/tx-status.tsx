import { Button } from "@/components/button";
import { Tag } from "@/components/tag";

export function TxSending() {
  return (
    <div style={{ textAlign: "center", padding: "var(--space-12) 0" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
        [BROADCASTING...]
      </span>
    </div>
  );
}

export interface TxErrorProps {
  message?: string;
  onRetry: () => void;
  onCancel: () => void;
}

export function TxError({ message, onRetry, onCancel }: TxErrorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div style={{ textAlign: "center" }}>
        <Tag variant="error">BROADCAST FAILED</Tag>
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-secondary)" }}>
        {message || "The transaction could not be broadcast. Check your connection and try again."}
      </div>
      <Button onClick={onRetry}>Try again</Button>
      <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
