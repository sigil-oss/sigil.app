import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/layouts/app-shell";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Modal } from "@/components/modal";
import { Divider } from "@/components/divider";
import { usePersistedStore, type Contact } from "@/store/persisted";
import { isValidIdentity } from "@/lib/crypto";
import { truncateId } from "@/lib/format";

export default function ContactsScreen() {
  const navigate = useNavigate();

  const contacts = usePersistedStore((s) => s.contacts);
  const addContact = usePersistedStore((s) => s.addContact);
  const updateContact = usePersistedStore((s) => s.updateContact);
  const removeContact = usePersistedStore((s) => s.removeContact);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");

  const [formName, setFormName] = useState("");
  const [formIdentity, setFormIdentity] = useState("");
  const [formNote, setFormNote] = useState("");
  const [identityError, setIdentityError] = useState("");

  function openAdd() {
    setFormName(""); setFormIdentity(""); setFormNote(""); setIdentityError("");
    setAdding(true);
  }

  function openEdit(contact: Contact) {
    setFormName(contact.name); setFormIdentity(contact.identity); setFormNote(contact.note); setIdentityError("");
    setEditing(contact);
  }

  function validateIdentity(id: string): boolean {
    if (!isValidIdentity(id)) { setIdentityError("INVALID IDENTITY — 60 UPPERCASE LETTERS"); return false; }
    setIdentityError("");
    return true;
  }

  function doAdd() {
    if (!formName.trim() || !validateIdentity(formIdentity.trim())) return;
    addContact({
      id: globalThis.crypto.randomUUID(),
      name: formName.trim(),
      identity: formIdentity.trim(),
      note: formNote.trim(),
      addedAt: Date.now(),
      lastUsedAt: 0,
    });
    setAdding(false);
  }

  function doEdit() {
    if (!editing || !formName.trim() || !validateIdentity(formIdentity.trim())) return;
    updateContact(editing.id, { name: formName.trim(), identity: formIdentity.trim(), note: formNote.trim() });
    setEditing(null);
  }

  const filtered = contacts
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.identity.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const statusBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        ← BACK
      </button>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-label)", fontWeight: 500, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Contacts
      </span>
      <button onClick={openAdd} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em", padding: 0 }}>
        + ADD
      </button>
    </div>
  );

  return (
    <AppShell statusBar={statusBar} contentStyle={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or identity"
        style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)" }}
      />

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "var(--space-12) 0", fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-disabled)", letterSpacing: "0.05em" }}>
          {contacts.length === 0 ? "[NO CONTACTS YET]" : "[NO RESULTS]"}
        </div>
      )}

      {filtered.map((contact, i) => (
        <div key={contact.id}>
          {i > 0 && <Divider style={{ marginBottom: "var(--space-4)" }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
            <button
              onClick={() => navigate(`/send?to=${contact.identity}`)}
              style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
            >
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)", marginBottom: 2 }}>
                {contact.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono-sm)", color: "var(--color-text-secondary)", letterSpacing: "0.05em" }}>
                {truncateId(contact.identity)}
              </div>
              {contact.note && (
                <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--color-text-disabled)", marginTop: 2 }}>
                  {contact.note}
                </div>
              )}
            </button>
            <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
              <Button variant="ghost" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => openEdit(contact)}>Edit</Button>
              <Button variant="danger" shape="sharp" size="sm" style={{ width: "auto" }} onClick={() => setDeleting(contact)}>Remove</Button>
            </div>
          </div>
        </div>
      ))}

      {/* Add modal */}
      <Modal open={adding} onClose={() => setAdding(false)}>
        <ContactForm
          title="Add contact"
          name={formName} onName={setFormName}
          identity={formIdentity} onIdentity={(v) => { setFormIdentity(v); setIdentityError(""); }}
          note={formNote} onNote={setFormNote}
          identityError={identityError}
          onSubmit={doAdd}
          onCancel={() => setAdding(false)}
          submitLabel="Add contact"
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)}>
        <ContactForm
          title="Edit contact"
          name={formName} onName={setFormName}
          identity={formIdentity} onIdentity={(v) => { setFormIdentity(v); setIdentityError(""); }}
          note={formNote} onNote={setFormNote}
          identityError={identityError}
          onSubmit={doEdit}
          onCancel={() => setEditing(null)}
          submitLabel="Save"
        />
      </Modal>

      {/* Delete modal */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>
            Remove {deleting?.name}?
          </div>
          <Button variant="danger" shape="sharp" onClick={() => { if (deleting) { removeContact(deleting.id); setDeleting(null); } }}>Remove</Button>
          <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={() => setDeleting(null)}>Cancel</Button>
        </div>
      </Modal>
    </AppShell>
  );
}

interface ContactFormProps {
  title: string;
  name: string; onName: (v: string) => void;
  identity: string; onIdentity: (v: string) => void;
  note: string; onNote: (v: string) => void;
  identityError: string;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}

function ContactForm({ title, name, onName, identity, onIdentity, note, onNote, identityError, onSubmit, onCancel, submitLabel }: ContactFormProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-body)", fontWeight: 500, color: "var(--color-text-display)" }}>{title}</div>
      <Input label="Name" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Alice" autoFocus style={{ fontFamily: "var(--font-sans)" }} />
      <Input label="Identity" value={identity} onChange={(e) => onIdentity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSubmit()} error={identityError} placeholder="60 uppercase letters" />
      <Input label="Note (optional)" value={note} onChange={(e) => onNote(e.target.value)} placeholder="e.g. Friend, exchange" style={{ fontFamily: "var(--font-sans)" }} />
      <Button onClick={onSubmit} disabled={!name.trim() || !identity.trim()}>{submitLabel}</Button>
      <Button variant="ghost" shape="sharp" size="md" style={{ width: "auto", margin: "0 auto" }} onClick={onCancel}>Cancel</Button>
    </div>
  );
}
