# Sigil Testing Guide

Manual release checklist for the current desktop app.

This guide is designed for practical release validation:

1. run local automated checks
2. do a short smoke pass on every platform
3. run the deeper suites that match the changes in the release
4. verify installed-build behavior for deep links, notifications, and updater

---

## Required Coverage

Every release should get:

- one smoke pass
- one seeded vault lifecycle pass
- one watch-only vault pass
- one deep-link request pass
- one export / import pass
- one security / lock pass
- one installed-build packaging pass

Run on:

- Linux
- macOS
- Windows

Use disposable seeds and small test funds only.

---

## Local Checks

Run before manual testing:

```bash
bun run lint
bun run test
bun run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Use both environments when possible:

- `bun run tauri dev` for rapid iteration
- installed release bundle for protocol handler, notification, updater, and packaging checks

Important:

- deep links must be validated on an installed build because OS registration is installer-driven
- Linux notification and updater behavior depends on how the app was installed
- Linux auto-update is currently AppImage-oriented; `deb` / `rpm` installs should be treated as non-updater installs

---

## Smoke Pass

Run this first on every platform.

- Launch the app with existing state and verify it opens to lock, not onboarding.
- Unlock the active vault.
- Confirm dashboard loads balances, activity, and account state without visible errors.
- Open `History`, `Send`, `Receive`, `Settings`, `Notifications`, `Trust`, and `Diagnostics`.
- Copy the active identity and verify clipboard copy works.
- Lock the app manually, then unlock again.
- Export a vault or contacts file and verify the native save dialog opens.
- Quit and relaunch. Verify the same vault and settings are still present.

Do not continue if any of these fail.

---

## Test Data

Prepare:

- one seeded vault with small test funds
- one second identity for receive / send tests
- one exported vault file
- one exported contacts file
- one watch-only vault or a list of valid identities for creating one
- one installed build per platform when testing protocol handler, notifications, and updater

---

## Vaults And Accounts

### Seeded vault creation

- Start from clean state.
- Create a new vault.
- Verify seed reveal and spot-check flow.
- Set a password with at least 10 characters.
- Confirm dashboard opens immediately after creation.

Expected:

- vault persists across restart
- relaunch goes to lock, not onboarding

### Seed import

- Import a valid seed.
- Verify invalid seed input fails cleanly.
- Confirm the derived identity matches the expected account.
- Unlock and confirm dashboard state is correct.

### Vault file import

- Import a previously exported vault.
- Verify wrong password fails cleanly.
- Verify correct password restores accounts and metadata.

### Watch-only vaults

- Create or import a watch-only vault with at least two identities.
- Confirm the vault opens without requesting a password.
- Confirm balances, history, search, tags, and notes still work.
- Verify send and seed-only actions are blocked or hidden as expected.
- Restart the app and confirm the watch-only vault still opens correctly.

### Multi-account behavior

- Add at least one extra account to a seeded vault.
- Hide and unhide a non-primary account if applicable.
- Rename or retag an account.
- Switch accounts and confirm dashboard, send, and history update correctly.

---

## Locking And Session Safety

### Password unlock

- Lock the app.
- Enter a wrong password and verify unlock fails without navigation.
- Enter the correct password and verify dashboard opens.

### Auto-lock timeout

- Set auto-lock to `1 minute`.
- Leave the app idle until it locks.
- Unlock and confirm normal navigation resumes.

### Lock on sleep

- Enable `Lock on sleep`.
- Put the machine to sleep or lock the screen.
- Resume and verify Sigil is on the lock screen.

### Lock on window blur

- Enable `Lock on window blur`.
- Switch away from the app.
- Verify Sigil locks immediately unless the explicit blur-lock bypass setting is enabled.

### Quick unlock / biometric unlock

Run the platform-appropriate path:

- macOS / Windows: biometric unlock
- Linux: quick unlock via secure storage

Verify:

- enable flow requires the current password
- lock screen exposes the correct shortcut
- success returns to dashboard
- failure paths are clear
- disabling the feature removes the shortcut

---

## Clipboard Safety

- Copy a wallet identity and confirm it pastes correctly.
- Wait for the configured timeout and confirm clipboard clears.
- Lock the app and confirm pending sensitive clipboard content clears immediately.
- Repeat once with a longer timeout to confirm lock still clears content.

---

## Send, Receive, And History

### Receive

- Open `Receive`.
- Verify the active identity is shown and copyable.
- Verify the QR renders clearly.

### Send QU

- Send a small amount to a valid recipient.
- Verify review details show sender, recipient, amount, and expected account.
- Approve and confirm a pending transaction appears.
- Confirm the transaction later resolves or fails cleanly.

### Guardrails

Verify:

- invalid identity is rejected
- non-positive amount is rejected
- insufficient balance is blocked
- watch-only vaults cannot sign
- pending transaction cleanup works after confirmation / failure / expiry

### Send to many

- Add multiple recipients manually.
- Import recipients from CSV or JSON.
- Verify totals stay exact and overdrafts are blocked.
- Approve and confirm the summary reflects recipient count and totals.

### Burn

- Open the burn flow.
- Verify irreversible-action messaging is prominent.
- If security policy is enabled, confirm password re-check is enforced.
- Confirm a small burn can be reviewed and signed.

### History and analytics

- Open transaction history.
- Verify recent transfers, burns, and contract activity appear.
- Add or edit a memo.
- Verify fiat-at-time values appear when price snapshots exist.
- Verify analytics render net flow, biggest counterparties, contract usage, and monthly summaries.
- Confirm monthly summaries are ordered chronologically, newest first.

---

## Qearn And Contract Flows

- Open the Qearn flow.
- Verify positions load without query or layout errors.
- Lock a small amount if test funds allow.
- If possible, test unlock as well.
- Confirm resulting transactions appear in history and analytics.

If the release touched contract previews or request simulation:

- verify known contract calls show human-readable labels
- verify preflight warnings appear for likely failure conditions

---

## Contacts, Search, And Exports

### Contacts

- Add a contact manually.
- Use it from the send flow.
- Verify address suggestions show contacts and recent recipients.
- Export contacts and re-import them.

### Search

- Search for:
  - a contact name
  - an account identity
  - a tx hash fragment
  - a memo
  - a known contract name
- Confirm results are relevant and navigable.

### Vault export

- Export the active vault.
- Verify the save dialog opens and the file is written.
- Re-import the export in a clean state or test profile.
- Verify version / verification messaging is correct.

### Error handling

- Cancel the save dialog and confirm the app stays stable.
- If possible, simulate a write failure and verify the error surfaces cleanly.

---

## Notifications

Test on an installed build when possible.

### Basic delivery

- Enable desktop notifications.
- Send a test notification.
- Verify the notification is attributed to Sigil and the text is readable.

### Inbox and filters

- Trigger several event types: received, sent, confirmed, failed/expired, request, price alert if possible.
- Verify inbox history records them.
- Verify filtering by type, account, unread state, and tx hash works.
- Verify mark-all, mark-visible, and mark-type actions work.

### Locked-state behavior

- Disable `Notify when locked`.
- Lock the app and trigger a deep-link request or other notification-producing event.
- Confirm the event is recorded in Sigil but does not reach the OS notification surface.
- Re-enable `Notify when locked` and confirm OS delivery is allowed while locked.

### Linux notes

- On installed Linux builds, confirm desktop metadata is correct.
- On unpackaged dev builds, confirm you understand notification delivery may be suppressed by the shell.

---

## Deep-Link Testing

Run on an installed build.

### Local launcher

Serve a local test page:

```bash
npx serve . -p 8080
```

Use this HTML:

```html
<!DOCTYPE html>
<html>
<body>
<script>
function toBase64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function envelope(request, callback = "http://localhost:9999/cb") {
  return {
    request: {
      nonce: crypto.randomUUID().replace(/-/g, "") + "ABCD",
      exp: Math.floor(Date.now() / 1000) + 300,
      dapp: {
        name: "Sigil Test Page",
        origin: "https://example.test"
      },
      ...request
    },
    callback
  };
}

function launch(request, callback) {
  const payload = toBase64Url(JSON.stringify(envelope(request, callback)));
  const a = document.createElement("a");
  a.href = `sigil://v1/request?d=${payload}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const RECIPIENT = "UVYAOYTNYCRBVFBHNFIJUEOUEPEDIDUWWEAXKFSJEBJVASCQEROJOVOEEATL";
</script>

<button onclick="launch({ type: 'transfer', to: RECIPIENT, amount: '1' })">Transfer</button>
<button onclick="launch({ type: 'connect', permissions: ['transfer', 'sign_message'] })">Connect</button>
<button onclick="launch({ type: 'sign_message', message: 'Hello Sigil' })">Sign message</button>
<button onclick="launch({ type: 'verify_message', message: 'Hello Sigil', signature: 'AAAA', public_key: 'BBBB' })">Verify invalid</button>
<button onclick="launch({ type: 'sc_call', contract_index: 9, input_type: 1, amount: '10000000' })">Qearn lock</button>
<button onclick="launch({ type: 'transfer', to: RECIPIENT, amount: '1' }, null)">No callback</button>
</body>
</html>
```

For callback inspection:

```bash
nc -l 9999
```

### Protocol registration

Verify OS handling:

- macOS: `open "sigil://v1/request?..."`
- Linux: `xdg-open "sigil://v1/request?..."`
- Windows: open a `sigil://` URL from the browser or Run dialog

### Request queueing

- Trigger multiple deep links back-to-back.
- Verify requests queue instead of replacing one another.
- Approve or reject one and confirm the next appears.

### Core request types

For each type, verify review UI, approval, rejection, and callback behavior:

- `transfer`
- `connect`
- `sign_message`
- `verify_message`
- `sc_call`

### Trust states

Verify:

- unsigned request shows unverified/self-reported trust state
- signed request with unknown issuer shows signed-but-untrusted state
- registry-backed signed request shows verified state
- revoked issuer, origin mismatch, or invalid signature blocks approval

### Callback recovery

- Trigger a request with a callback that fails.
- Confirm request history records callback failure.
- Verify retry, save-as-file, and copy-JSON recovery actions work.

### Negative cases

Verify each fails safely:

- malformed base64 payload
- invalid JSON payload
- invalid envelope shape
- expired request
- non-HTTPS `dapp.origin`
- invalid callback URL
- duplicate nonce replay

### Locked and cold-start behavior

- Close the app fully and trigger a deep link.
- Verify the app opens, requests unlock if needed, and then shows the pending request.
- Trigger a deep link while the app is open but locked.
- Verify the request remains available after unlock.

---

## Updater And Packaging

Run on installed builds only.

### Windows

- Confirm updater check runs without ACL or manifest errors.
- If an update is available, start install and confirm progress updates.
- Verify the installer does not surface an interactive setup window during quiet mode.

### macOS

- Confirm updater check runs.
- If an update is available, verify download/install/relaunch flow.

### Linux

- AppImage install:
  - confirm updater check runs
  - if an update is available, verify download/install flow
- `deb` / `rpm` install:
  - confirm the UI and diagnostics report auto-update as unsupported for this install
  - confirm the app does not pretend update installation is available

### Release artifact sanity

For release candidates, verify:

- protocol handler works from installed build
- notifications are attributed correctly
- diagnostics show correct updater platform / package context

---

## Diagnostics, Audit, And Trust Surfaces

- Open `Diagnostics` and verify runtime state renders without errors.
- Export a debug bundle and confirm the file writes successfully.
- Confirm updater context, pending request count, and recent runtime issues are present.
- Open `Trust` and verify trusted issuer registry management works.
- Open request history and audit log, and verify recent actions are recorded.

---

## Release Exit Criteria

Do not ship if any of these fail:

- existing users are sent to onboarding unexpectedly
- unlock fails with the correct password
- watch-only vaults open in a broken or partially locked state
- vault export or import is broken
- clipboard is not cleared on lock
- deep-link approval screen is skipped, corrupted, or bypassed
- trust-blocked requests can still be approved
- callback policy accepts an invalid target
- transaction cleanup leaves stale pending entries
- updater UI misrepresents platform support
- app crashes on launch, lock, unlock, export, or deep-link handling

---

## Minimal Release Checklist

- [ ] App launches with existing state intact
- [ ] Lock and unlock work
- [ ] Auto-lock, sleep-lock, and blur-lock work
- [ ] Clipboard clears on timer and on lock
- [ ] Seeded vault create / import works
- [ ] Watch-only vault create / open works
- [ ] Receive QR and identity copy work
- [ ] Basic send works
- [ ] Send-many import and guardrails work
- [ ] History, memos, fiat values, and analytics render correctly
- [ ] Contacts and search work
- [ ] Vault export / import works
- [ ] Notifications work, including locked-state gating
- [ ] Deep-link approve path works
- [ ] Deep-link reject path works
- [ ] Deep-link no-callback path works
- [ ] Deep-link queueing works
- [ ] Trust validation and blocked-request states work
- [ ] Request history and callback recovery work
- [ ] Diagnostics bundle export works
- [ ] Installed-build updater behavior matches platform/package expectations
- [ ] Restart persistence works in both `tauri dev` and installed build
