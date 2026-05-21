import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/button";
import type { Contact } from "@/store/persisted";

export interface ContactPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (identity: string) => void;
  contacts: Contact[];
}

export function ContactPicker({ open, onClose, onSelect, contacts }: ContactPickerProps) {
  const [search, setSearch] = useState("");

  function handleClose() {
    setSearch("");
    onClose();
  }

  function handleSelect(identity: string) {
    setSearch("");
    onSelect(identity);
  }

  const filtered = contacts.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.identity.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={handleClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <input
          autoFocus
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="sigil-input"
          style={{ background: "var(--color-bg-subtle)", borderRadius: "var(--radius-sharp)", padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-display)", width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", maxHeight: 280, overflowY: "auto" }}>
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelect(c.identity)}
              style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "var(--space-2) var(--space-1)", borderRadius: "var(--radius-sharp)" }}
            >
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>{c.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {c.identity.slice(0, 8)}...{c.identity.slice(-8)}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", padding: "var(--space-4)", textAlign: "center" }}>
              [NO RESULTS]
            </div>
          )}
        </div>
        <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={handleClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
