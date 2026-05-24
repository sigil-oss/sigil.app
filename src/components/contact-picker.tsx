import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/button";
import { Identicon } from "@/components/identicon";
import type { Contact } from "@/store/persisted";

export interface PickerAccount {
  name: string;
  identity: string;
}

export interface ContactPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (identity: string) => void;
  contacts: Contact[];
  accounts?: PickerAccount[];
}

export function ContactPicker({ open, onClose, onSelect, contacts, accounts = [] }: ContactPickerProps) {
  const [search, setSearch] = useState("");

  function handleClose() {
    setSearch("");
    onClose();
  }

  function handleSelect(identity: string) {
    setSearch("");
    onSelect(identity);
  }

  const query = search.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () => accounts.filter(
      (a) =>
        !query ||
        a.name.toLowerCase().includes(query) ||
        a.identity.toLowerCase().includes(query),
    ),
    [accounts, query],
  );
  const filteredContacts = useMemo(
    () => contacts.filter(
      (c) =>
        !query ||
        c.name.toLowerCase().includes(query) ||
        c.identity.toLowerCase().includes(query),
    ),
    [contacts, query],
  );
  const hasResults = filteredAccounts.length > 0 || filteredContacts.length > 0;

  return (
    <Modal open={open} onClose={handleClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <input
          autoFocus
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts or accounts..."
          className="sigil-input"
          style={{ background: "var(--color-bg-subtle)", borderRadius: "var(--radius-sharp)", padding: "var(--space-2) var(--space-3)", fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", color: "var(--color-text-display)", width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", maxHeight: 340, overflowY: "auto" }}>
          {filteredAccounts.length > 0 && (
            <PickerSection
              title="This vault"
              entries={filteredAccounts.map((account) => ({
                key: `account:${account.identity}`,
                name: account.name,
                identity: account.identity,
                badge: "ACCOUNT",
              }))}
              onSelect={handleSelect}
            />
          )}
          {filteredContacts.length > 0 && (
            <PickerSection
              title="Contacts"
              entries={filteredContacts.map((contact) => ({
                key: contact.id,
                name: contact.name,
                identity: contact.identity,
              }))}
              onSelect={handleSelect}
            />
          )}
          {!hasResults && (
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

interface PickerEntry {
  key: string;
  name: string;
  identity: string;
  badge?: string;
}

function PickerSection({
  title,
  entries,
  onSelect,
}: {
  title: string;
  entries: PickerEntry[];
  onSelect: (identity: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 var(--space-1)" }}>
        {title}
      </div>
      {entries.map((entry) => (
        <button
          key={entry.key}
          onClick={() => onSelect(entry.identity)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border-subtle)",
            cursor: "pointer",
            textAlign: "left",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sharp)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
            <Identicon seed={entry.identity} size={28} radius={4} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>{entry.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {entry.identity.slice(0, 8)}...{entry.identity.slice(-8)}
              </div>
            </div>
          </div>
          {entry.badge && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em", flexShrink: 0 }}>
              {entry.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
