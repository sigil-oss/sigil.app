# Sigil

Self-custodial Qubic wallet with native dApp deep linking. Desktop-first — Windows, macOS, Linux.

---

## Features

**Wallet**
- Multiple encrypted vaults, each with a password and multiple accounts
- Send, receive, and full transaction history with filters
- Send to up to 25 recipients in one transaction (QUtil)
- Burn QU permanently (QUtil)
- Qearn staking — lock and unlock positions directly from the wallet
- Address book with one-click send
- Transaction memos — attach private notes to any transaction, exportable as JSON
- Privacy mode — hides all balances across every screen
- USD value estimates using live market price, with an optional per-session price override

**Security**
- Seeds and keys never leave your device — no telemetry, no server, no cloud
- AES-256-GCM encryption with PBKDF2 (600,000 iterations)
- Biometric unlock — Windows Hello / Touch ID / macOS Secure Enclave via OS credential store
- Auto-lock on idle, OS sleep, or window blur (Rust-side timer, not renderer)
- Auto-updates enforced on launch — signed packages only, unsigned or tampered releases are rejected

**dApp integration**
- Native deep link protocol (`sigil://`) for web apps and CLI tools to request signatures
- Supports `transfer`, `sc_call`, `sign_message`, and `connect` request types
- Per-dApp permission management with revocation

**Desktop**
- System tray — hide to tray on close, restore with a click, Quit from the tray menu
- Desktop notifications for incoming, outgoing, and confirmed transactions
- Single-instance — opening a second instance focuses the existing window

---

## Security model

Seeds and derived wallets live only in JS memory (Zustand session store). On lock, the session store is cleared. The disk store holds only the AES-256-GCM encrypted blob — the password never persists anywhere. Auto-lock fires from a Rust timer so a frozen renderer cannot bypass it.

Updates are signed with a Tauri signing key. The public key is embedded in the bundle — Sigil verifies the signature before installing anything.

---

## dApp deep linking

Any web app or CLI tool can request a signature from Sigil by opening a `sigil://` URI. Sigil validates the request in Rust, focuses its window, shows a review screen, and POSTs the result back to the caller.

### URI format

```
sigil://v1/request?d=<base64url-payload>&cb=<callback-url>
```

- `d` — required. Base64url-encoded (no padding) UTF-8 JSON, max 8 192 bytes.
- `cb` — optional. HTTPS URL that receives the result. `http://localhost` and `http://127.0.0.1` are allowed for local dev. Private/loopback addresses other than localhost are rejected.

### Request payload

Every request shares these top-level fields:

```jsonc
{
  "type": "transfer" | "sc_call" | "sign_message" | "verify_message" | "connect",
  "nonce": "<8–128 char unique string>",   // replay protection
  "exp": 1234567890,                        // unix timestamp, max 1 hour from now; defaults to +5 min
  "dapp": {
    "name": "My App",
    "origin": "https://myapp.example.com"  // must be HTTPS
  },
  // ...type-specific fields
}
```

**Nonces** are tracked for one hour. Reusing a nonce within that window silently drops the request.

**Expiry** auto-dismisses the review screen when the timestamp passes — approval buttons become inactive so a stale request cannot be signed after the fact.

#### `transfer` — send QU

```jsonc
{
  "type": "transfer",
  "to": "ABCDEF...60CHARS",  // 60 uppercase A-Z
  "amount": 1000000          // positive integer, QU
}
```

#### `sc_call` — smart contract call

```jsonc
{
  "type": "sc_call",
  "contract_index": 1,   // 0–63
  "input_type": 2,       // non-negative integer
  "amount": 0,           // QU attached to the call
  "payload": "..."       // optional base64url-encoded extra bytes
}
```

#### `sign_message` — off-chain signature

```jsonc
{
  "type": "sign_message",
  "message": "Hello from my dApp"  // non-empty string
}
```

#### `verify_message` — verify an existing signature

```jsonc
{
  "type": "verify_message",
  "message": "Hello from my dApp",
  "signature": "<base64-encoded signature>",
  "public_key": "<hex or base64 public key>"
}
```

#### `connect` — request permissions

```jsonc
{
  "type": "connect"
  // No extra fields required. User selects which permissions to grant.
}
```

### Callback responses

Sigil POSTs JSON to the `cb` URL from native Rust (not the webview). All responses include `nonce` and `type` echoed from the request.

**Approved transfer or SC call:**
```jsonc
{ "status": "signed", "nonce": "...", "type": "transfer", "identity": "...", "tx_hash": "...", "target_tick": 12345678 }
```

**Approved sign_message:**
```jsonc
{ "status": "signed", "nonce": "...", "type": "sign_message", "identity": "...", "signature": "...", "public_key": "..." }
```

**Approved verify_message:**
```jsonc
{ "status": "verified", "nonce": "...", "type": "verify_message", "valid": true, "identity": "..." }
```

**Approved connect:**
```jsonc
{ "status": "connected", "nonce": "...", "type": "connect", "identity": "...", "permissions": ["transfer", "sc_call"] }
```

**Rejected by user:**
```jsonc
{ "status": "rejected", "nonce": "...", "type": "...", "reason": "user_rejected" }
```

**Permission denied** (origin approved but lacks the required permission):
```jsonc
{ "status": "rejected", "nonce": "...", "type": "...", "reason": "permission_denied" }
```

If no callback URL is provided, the result JSON is shown in the UI with a Copy button.

### Permission system

`connect` grants named permissions (`transfer`, `sc_call`, `sign_message`) to an origin. Subsequent requests from the same origin that require a permission not in the approved set are auto-rejected without showing the review screen. The user can revoke individual permissions or the entire dApp approval from Settings → dApps.

---

## Build locally

**Requirements**

- [Rust](https://rustup.rs/) stable toolchain
- [Bun](https://bun.sh/) or Node.js ≥ 20
- Platform prerequisites from [Tauri's guide](https://v2.tauri.app/start/prerequisites/) — WebView2 on Windows, webkit2gtk on Linux

```sh
git clone https://github.com/sigil-oss/sigil.app
cd sigil.app
bun install
bun tauri dev       # hot-reload dev build
bun tauri build     # production installer → src-tauri/target/release/bundle/
```

---

## Tech stack

| Layer | Choice |
|---|---|
| App framework | Tauri v2 (Rust + WebView) |
| Frontend | React 19 + TypeScript (strict) |
| Routing | React Router v7 |
| State | Zustand — persisted to disk via `tauri-plugin-store`, session in-memory |
| Server state | TanStack Query v5 |
| Qubic SDK | `@qubic.org/{types,crypto,tx,wallet,rpc,contracts}` |
| Design | Nothing Design aesthetic — OLED black, Space Grotesk + Space Mono |

---

## Implementation notes

**Biometric unlock** — Settings → Security → enable biometric. Sigil verifies your vault password once, then stores it in the OS credential store (Windows Credential Manager / macOS Keychain / libsecret). Subsequent unlocks retrieve it via the OS biometric prompt. The password is never stored on disk by Sigil itself.

**Auto-updates** — On every launch a splash screen checks for a new release. If one is found, it downloads and installs silently in the foreground (progress bar shown) then relaunches. There is no way to skip an update. Packages are verified against an embedded public key before install.

**QUtil fee** — SendToManyV1 charges a per-invocation fee queried from the contract before signing. The UI blocks the Sign button until the fee resolves and adds it to the transaction amount automatically.

**Transaction history** — SC calls are identified by destination address and shown as `SC CALL` with the contract name (QUtil / Qearn). Pending SC calls carry a `contractName` set at broadcast time. History supports infinite scroll, direction/type/date range/amount/tick filters, and compact amount formatting (1K / 1M / 1B).

**Qearn positions** — The unlock tab scans the last 52 epochs using `getUserLockStatus` (bitmask) followed by parallel `getUserLockedInfo` calls. Positions not yet matured show an `[EARLY]` badge with a warning that rewards may be forfeited.

**SC call destinations** — Contract addresses are derived via `contractIndexToIdentity(index)`. All SC calls pass an explicit destination — the default `SC_DESTINATION` (`'A'.repeat(60)`) from the wallet SDK has an invalid checksum and is never used.

**Bob node (experimental)** — An optional Bob indexer can be configured in Network settings for real-time tick/balance/transfer data via WebSocket. Due to the production CSP, the Bob node must run on `localhost`.
