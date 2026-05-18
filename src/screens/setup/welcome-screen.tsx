import { useNavigate } from "react-router-dom";
import { FullPage } from "@/layouts/full-page";
import { Button } from "@/components/button";

export default function WelcomeScreen() {
  const navigate = useNavigate();
  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-mono-sm)",
              color: "var(--color-text-secondary)",
              letterSpacing: "0.15em",
              marginBottom: "var(--space-4)",
            }}
          >
            SIGIL
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-headline)",
              fontWeight: 500,
              color: "var(--color-text-display)",
            }}
          >
            Your keys.<br />Your Qubic.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Button variant="primary" shape="pill" onClick={() => navigate("/setup/create")}>
            Create wallet
          </Button>
          <Button variant="secondary" shape="sharp" onClick={() => navigate("/setup/import")}>
            Import seed
          </Button>
        </div>
      </div>
    </FullPage>
  );
}
