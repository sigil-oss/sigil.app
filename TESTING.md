# Sigil — End-to-End Testing Guide

Manual test guide for every user-facing flow. Run through all sections on each platform (Windows, macOS, Linux) before publishing a release.

---

## Setup

**Test wallet seed** (safe to use — small amounts only):
```
Use any valid 55-char Qubic seed. Generate one with: bun run dev → "Create wallet"
```

**Test dApp page** — create `test.html` locally:
```html
<!DOCTYPE html>
<html>
<body>
<script>
function request(type, params) {
  const payload = btoa(JSON.stringify({
    type,
    nonce: Math.random().toString(36).slice(2, 12),
    dapp: { name: "Test dApp", origin: "http://localhost" },
    exp: Math.floor(Date.now() / 1000) + 300,
    ...params
  }));
  window.location.href = `sigil://v1/request?d=${payload}&cb=http://localhost:9999/cb`;
}
</script>
<button onclick="request('transfer', { to: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', amount: 1 })">Transfer</button>
<button onclick="request('connect', {})">Connect</button>
</body>
</html>
```

Open `test.html` via `file://` in a browser. For callback testing, run `nc -l 9999` (or similar) to receive the POST.

---

## 1. First Launch & Onboarding

### 1a. Create wallet
1. Launch Sigil with no existing vaults → Welcome screen appears
2. Click **Create wallet**
3. Enter a vault name (e.g., "Main") and select a color → **Next**
4. Seed screen: verify characters appear one by one with stagger animation
5. Note the 55-character seed somewhere safe
6. Click **I've written it down** → Spot-check screen
7. Four positions are highlighted. Fill each input with the correct character
   - Entering wrong character should show inline error
   - Entering all four correctly → **Next** unlocks
8. Set password (≥ 10 chars). Strength meter should progress: TOO SHORT → FAIR → GOOD → STRONG
9. Click **Create vault** → Dashboard appears
10. Verify vault name + color dot in status bar

**Expected**: Dashboard shows `[LOADING...]` briefly then balance (likely 0 QU for a fresh identity).

### 1b. Import seed
1. From Welcome screen, click **Import seed**
2. Paste the 55-char seed from step 1a (or a known seed)
3. Enter vault name + color → **Next**
4. Set password → **Import**
5. Verify the identity on dashboard matches the known seed's identity

### 1c. Import vault file
1. From Welcome screen, click the file import option
2. Select a previously exported `.json` vault file
3. Enter the correct password → vault added
4. Wrong password → `[WRONG PASSWORD]` inline error (no crash)

### 1d. Skip onboarding
1. With a vault already created, relaunch Sigil
2. Should go directly to lock screen, not welcome screen

---

## 2. Lock & Unlock

### 2a. Password unlock
1. Lock the app: Settings → Security → **Lock now**, or wait for idle timeout
2. Lock screen shows vault name, color dot, last-unlocked timestamp
3. Enter wrong password → `[WRONG PASSWORD]` in red, no navigation
4. Enter correct password → Dashboard

### 2b. Auto-lock (idle)
1. Settings → Security → set timeout to **1 minute**
2. Leave app idle for 60 seconds
3. App should lock automatically
4. Unlock with password → auto-lock still active

### 2c. Lock on sleep
1. Settings → Security → enable **Lock on sleep**
2. Put machine to sleep (close lid or system sleep)
3. Wake machine → Sigil should be on lock screen

### 2d. Lock on window blur
1. Settings → Security → enable **Lock on window blur**
2. Click outside the Sigil window
3. Sigil should lock immediately

### 2e. Biometric unlock (Windows Hello / Touch ID)
1. Settings → Security → **Enable biometric**
2. Enter vault password when prompted → success message
3. Lock the app
4. Click **USE BIOMETRIC** on lock screen
5. Complete biometric prompt (face/fingerprint/PIN)
6. Should unlock without typing password
7. Test 3 failures: deny biometric 3 times → button should disable with `[TOO MANY FAILURES — USE PASSWORD]`
8. Settings → Security → **Disable biometric** → biometric button disappears from lock screen

---

## 3. Dashboard

### 3a. Balance & identity
1. Unlock to dashboard
2. Balance displays as large number (QU) with animated counter on load
3. Click the identity string → copies to clipboard (verify with paste)
4. Network health dot in status bar: green = connected, amber = slow, red = unreachable
5. Click health dot → modal shows RPC URL, current tick, last update time

### 3b. Account switcher
1. Open vault management (tap vault dot in status bar → `/vaults/:id`)
2. Add a second account (name it "Account 2")
3. Return to dashboard → pill switcher shows both accounts
4. Click Account 2 pill → balance and identity update

### 3c. Privacy mode
1. Click the eye icon on dashboard
2. Balance shows as `••••••`, all amounts hidden
3. Navigate to receive screen → QR code is blurred
4. Hover over QR → blurred version revealed (or shows "HOVER TO REVEAL")
5. Toggle privacy off → all values visible again

### 3d. Transaction list
1. Send a small amount to yourself (own identity)
2. Transaction appears as `[PENDING]` in dashboard list immediately
3. After confirmation (next tick epoch): status changes to `[CONFIRMED]`
4. Navigate to full history (`/history`) → see complete paginated list

---

## 4. Send QU

### 4a. Basic send
1. Dashboard → **Send**
2. Enter a valid 60-character Qubic identity
3. Enter amount (e.g., 1 QU)
4. Review step shows: From, To, Target tick, Fee (None)
5. Click **Sign and send**
6. Done screen: tx hash shown, `[PENDING]` status
7. Optional: enable watch confirmation → status updates to `[CONFIRMED]` or `[FAILED]`

### 4b. Contact save prompt
1. Send to an unknown identity (not in contacts)
2. On done screen, a "Save contact" input + button appears
3. Enter a name and save → identity now appears in contacts

### 4c. Identity validation
1. Enter fewer than 60 characters → `[INVALID IDENTITY]` error, Next blocked
2. Enter a non-alphabetic character → same error

### 4d. Balance guard
1. Attempt to send more QU than the current balance
2. Amount field shows red `AVAILABLE: X QU` bar
3. Review button disabled / `[INSUFFICIENT BALANCE]` error shown

### 4e. Pending tx guard
1. Send a transaction (it enters pending state)
2. Go back to send and try to send again from the same account
3. Sign button disabled with `[TRANSFER PENDING — WAIT FOR CONFIRMATION]`

### 4f. Contact picker
1. Add a contact first (Contacts → add)
2. In send screen, click **FROM CONTACTS ↓**
3. Search by name → contact appears
4. Select → identity auto-fills the destination field

---

## 5. Send to Many

1. Dashboard → **SEND MANY →**
2. Add 3 recipients using **+ Add recipient**:
   - Row 1: paste identity A, enter 1 QU
   - Row 2: pick from contacts, enter 2 QU
   - Row 3: paste identity C, enter 3 QU
3. Running total shows "6 QU + QUtil fee"
4. Review step: table of 3 recipients + QUtil fee line + grand total
5. Sign and send → done screen shows hash, recipient count (3), total sent
6. Verify on chain: all 3 identities received correct amounts

**Edge cases:**
- Add 25 recipients → "25/25" badge, **+ Add recipient** button disappears
- Try to send more than balance → button disabled

---

## 6. Burn QU

1. Dashboard → Send → **Burn QU**
2. Warning banner shown in red
3. Enter amount (e.g., 1 QU)
4. Confirm step: large red amount, "THIS QU WILL BE PERMANENTLY DESTROYED"
5. Click **BURN X QU** (danger button)
6. Done: tx hash shown
7. Verify balance decreased; no recipient received the QU (it's destroyed)

---

## 7. Receive

1. Dashboard → **Receive**
2. QR code displayed (correct identity encoded)
3. Identity text below QR is the same as dashboard identity
4. Click identity → copied to clipboard
5. Switch account via account switcher → QR updates to new identity
6. Enable privacy mode → QR blurred; hover to reveal

---

## 8. Qearn Staking

### 8a. Lock QU
1. Dashboard → **QEARN →**
2. Lock tab: current epoch shown
3. Enter amount below 10,000,000 → `[MINIMUM 10,000,000 QU]` error
4. Enter valid amount (≥ 10M QU) → review shows lock epoch, maturity epoch (lock + 52)
5. Sign and lock → done screen; tx hash shown
6. Switch to Unlock tab → position appears with epoch and amount

### 8b. Unlock QU (matured)
1. Wait until maturity epoch (or test with a known matured position)
2. Unlock tab → position shows **UNLOCK** button (standard variant, no warning)
3. Click Unlock → review: epoch, amount
4. Sign → done; position removed from list

### 8c. Early unlock
1. On a non-matured position, **UNLOCK (EARLY)** button shown (danger variant)
2. `[WARNING] EARLY UNLOCK — REWARDS MAY BE REDUCED OR FORFEITED.` visible
3. Proceed → funds returned (minus potential reward penalty)

---

## 9. Contacts

1. Navigate to `/contacts`
2. Click **+** → add contact: name "Alice", valid identity, optional note → save
3. Contact appears in list with truncated identity
4. Click Alice → navigates to send screen with Alice's identity pre-filled
5. Click edit (pencil) → change name to "Alice W" → save → updated in list
6. Send QU to Alice → `lastUsedAt` timestamp updates in her contact row
7. Delete contact → confirmation modal → confirmed → Alice removed
8. Search: type "al" → only matching contacts shown; clear → all shown

### 9a. File export/import
1. Settings → Contacts → **Export** → downloads `contacts.json`
2. Delete all contacts
3. Settings → Contacts → **Import** → select the file → contacts restored

---

## 10. Notifications

1. Settings → Notifications
2. Master toggle off → all event toggles greyed out
3. Enable master toggle → OS permission prompt (macOS/Windows)
4. Grant permission → event toggles become active
5. Enable "QU received"
6. Have another wallet send QU to this identity
7. Within ~5 seconds: desktop notification appears ("QU Received: +X QU")
8. Enable "Transaction sent" → send a tx → notification fires at broadcast
9. Enable "Transaction resolved" → wait for pending tx to confirm → notification fires
10. Click **Send test notification** → notification appears immediately

---

## 11. Settings

### 11a. Network
1. Settings → Network
2. Change RPC endpoint to an invalid URL → error shown
3. Change to a valid alternate endpoint → tick updates in status bar
4. Switch to testnet (if applicable) → network label updates

### 11b. Appearance
1. Settings → Appearance
2. Switch theme (dark/light) → UI updates immediately
3. Change font → typography updates across app
4. Custom color pickers → accent colors update

### 11c. Security
1. Settings → Security
2. Change auto-lock timeout → verify it fires at the new time
3. Toggle lock-on-blur → test that blur locks/doesn't lock
4. Change clipboard clear timeout: copy identity, wait N seconds → clipboard cleared

### 11d. Approved dApps
1. Complete a connect request from a dApp (see section 12d)
2. Settings → Approved dApps → dApp appears with origin + permissions
3. Click Revoke → dApp removed; next request from that origin is treated as first-time

### 11e. Auto-updater
1. Settings footer shows current version (`vX.Y.Z`)
2. `[CHECKING...]` appears briefly after launch (8s delay)
3. If update available: green `[UPDATE AVAILABLE vX.Y.Z]` button appears
4. Click → `[DOWNLOADING... X%]` progress shown
5. App relaunches into new version after install

---

## 12. Deep Link / dApp Requests

Open `test.html` in a browser. Sigil must be running (or installed).

### 12a. Transfer request
1. Click **Transfer** button in test page
2. Sigil focuses and bottom sheet slides up
3. Sheet shows: amount (1 QU), destination identity, target tick, fee (None)
4. Destination not in contacts → raw identity shown
5. Click **Sign and send** → sheet closes, success screen
6. Callback URL receives POST with `{status: "ok", tx_hash, target_tick, identity}`
7. Click **Reject** instead → callback receives `{status: "rejected"}`

### 12b. Transfer — balance guard
1. Modify test page `amount` to exceed current balance
2. Sheet shows `[INSUFFICIENT BALANCE]`, approve button disabled

### 12c. Transfer — account picker
1. Remove `from` field from test payload
2. Sheet shows "Sign as" pill buttons for each account
3. Select different account → identity in detail row updates

### 12d. Connect request
1. Click **Connect** in test page
2. Sheet shows: dApp name, origin, permission checkboxes
3. Select permissions → **Approve**
4. Callback receives `{status: "ok", identity, permissions: [...]}`
5. Approved dApp appears in Settings → Approved dApps

### 12e. SC call request (Qearn lock example)
```js
request('sc_call', {
  contract_index: 6,  // Qearn
  input_type: 1,      // LockInQearn
  amount: 10000000
})
```
1. Sheet shows "Qearn · Lock in Qearn", amount "10,000,000 QU"
2. Detail row: "LOCK 10,000,000 QU FOR STAKING"
3. Approve → tx broadcast, callback receives result

### 12f. SC call — unknown contract
```js
request('sc_call', { contract_index: 99, input_type: 5, payload: btoa('hello') })
```
1. Sheet shows "CONTRACT #99 · Input 5"
2. `[SHOW PAYLOAD · 5B]` toggle → raw hex visible

### 12g. Sign message request
```js
request('sign_message', { message: 'Hello Sigil' })
```
1. Sheet shows message text + "off-chain — no transaction will be broadcast"
2. Approve → callback receives `{status: "ok", signature, public_key}`

### 12h. Expired request
1. Set `exp` to a past timestamp (e.g., `Math.floor(Date.now()/1000) - 1`)
2. Sigil should silently ignore the request (no sheet appears)

### 12i. Malformed request
1. Use `sigil://v1/request?d=notbase64&cb=https://example.com`
2. Sigil should ignore it silently (no crash, no sheet)

### 12j. No-vault state
1. Delete all vaults (or fresh install before onboarding)
2. Trigger a deep link request
3. Welcome screen should show a message that a dApp request is waiting
4. After creating a vault, the request should be processed

---

## 13. Multi-Vault

1. Create a second vault ("Work") with a different password
2. Status bar → tap vault dot → vault picker
3. Switch to "Work" vault → requires "Work" password
4. Dashboard shows Work vault identity + color
5. Switch back to "Main" → requires "Main" password
6. Biometric enabled for "Main": enabling for "Work" stores a separate credential

---

## 14. Clipboard Security

1. Copy identity from dashboard
2. Settings → Security → clipboard clear set to **15s**
3. Wait 15 seconds → paste in a text editor → clipboard empty (or shows old content replaced)
4. Lock the app → clipboard cleared immediately regardless of timer

---

## 15. Animations & Transitions

These are visual checks — no pass/fail criteria, just ensure nothing looks broken.

| Transition | Expected |
|---|---|
| Dashboard → Send | Slide in from right, 150ms |
| Send → Dashboard (back) | Slide in from left, 150ms |
| Lock → Dashboard | Lock screen fades + scales out; dashboard slides in |
| Deep link sheet arrival | Sheet rises from below (+64px → 0), 220ms |
| Balance on load | Number counts up from 0, 500ms |
| Seed character display | Characters appear left-to-right, 30ms stagger |
| Lock screen entry | Scale 0.97→1 + fade, 180ms |

All transitions should use easeOut only — no bouncing, no spring.

---

## 16. Regression Checklist

Run after any significant code change:

- [ ] Create vault → backup → password → dashboard
- [ ] Lock → unlock with password
- [ ] Send 1 QU to own second account → confirmed
- [ ] Receive screen QR matches sending identity
- [ ] Deep link transfer → approve → callback received
- [ ] Deep link transfer → reject → callback received
- [ ] Contacts: add, send to, verify last-used updates
- [ ] Privacy mode: toggle on, verify all amounts hidden; toggle off
- [ ] Settings: change auto-lock to 1m, wait, verify locks
- [ ] Biometric: enable → lock → biometric unlock → success
- [ ] Updater: version shown in settings footer

---

## Platform-Specific Notes

### Windows
- Deep link registration: `sigil://` scheme must appear in `HKCU\Software\Classes\sigil`
- Windows Hello: requires PIN or biometric set up in Windows Settings → Accounts → Sign-in options
- NSIS installer: installs per-user (no UAC prompt required)
- Credential storage: `Control Panel → Credential Manager → Windows Credentials` → look for `sigil-vault/{uuid}` entries

### macOS
- Deep link: `sigil://` handled via Info.plist `CFBundleURLTypes`; test with `open sigil://v1/request?...` in Terminal
- Touch ID: must be enrolled in System Settings → Touch ID & Password
- Keychain: entries visible in Keychain Access under "sigil-bio"
- Universal build: same binary runs on Intel and Apple Silicon

### Linux
- Deep link: requires `xdg-open` and `.desktop` file registered; test with `xdg-open "sigil://v1/request?..."`
- Biometric: not supported (button hidden)
- Notifications: requires `libnotify` and a running notification daemon
- AppImage: mark executable (`chmod +x`) before running
