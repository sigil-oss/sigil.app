# sigil

## 0.11.23

### Patch Changes

- 87a4c77: Fix USD price display, price snapshots, and silent update errors

  - Fix balance showing `≈ $0.00 USD` for all accounts: `formatUsdFromQu` was using BigInt integer-cent math (`Math.round(price * 100)`) which rounds the QU price (~$4×10⁻⁷) to zero; replaced with float multiplication which handles sub-cent prices correctly
  - Fix price snapshots never updating after the first one: the deduplication threshold was an absolute `0.000001` which is larger than the entire QU price, so every subsequent snapshot was rejected as "essentially the same"; now uses a relative 0.1% threshold that works at any price magnitude
  - Fix update install errors failing silently in settings: install errors set `lastError` but the display condition only checked `checkError || !updaterSupported`, so install failures were invisible; added `installError` state and show the error in red when install fails

## 0.11.22

### Patch Changes

- ece6591: Fix balance not showing and Linux AppImage deep link registration

  - Fix balance always displaying as `—` on any vault with fewer than 16 accounts: `GetBalances16` always returns 16 slots regardless of how many public keys were sent, so the response length check was comparing 16 against the account count and throwing on every poll
  - Fix `sigil://` deep links not working after installing the AppImage: rewrite `Exec=` in the registered `.desktop` file to point to the AppImage file itself (not the extracted binary inside the AppDir which only exists while mounted), and call `xdg-mime default` to set Sigil as the default handler in `mimeapps.list` (which is what GNOME and KDE actually consult — `update-desktop-database` alone was not enough)
  - Re-register automatically if the AppImage has been moved since the last launch so deep links stay functional

## 0.11.21

### Patch Changes

- 0baccd9: Fix two lint errors surfaced after the second audit

  - Remove stale `exportSigningPublicJwk` reference in `diagnostics-screen.tsx` (field was deleted in the first audit pass)
  - Drop unused `passwordAttempts` binding in `lock-screen.tsx`; re-render is triggered through the setter, the value itself is never read

## 0.11.20

### Patch Changes

- 7bd05b8: Security and code quality fixes (37 issues)

  **Security (H1–H5)**

  - Transfer seed bytes to signing worker as a transferable `Uint8Array` instead of a plain string, so the seed never exists untracked in the structured-clone buffer
  - Throw on tampered export file signatures rather than silently returning `verified: false`
  - Guard against `null` `encryptedData` in both unlock paths on the lock screen
  - Bind a SHA-256 hash of `vault_data` to the biometric credential at enroll time; reject mismatched blobs at unlock time so a compromised renderer cannot substitute an arbitrary ciphertext
  - Persist the password lockout deadline to disk so it survives app restarts

  **Medium (M1–M8)**

  - Serialize `addToVault` through a module-level promise chain to prevent concurrent decrypt/re-encrypt races
  - Expand PBKDF2 salt from 16 to 32 bytes; reject stored iteration counts below 100,000
  - Log keyring read errors in `store_crypto` instead of silently falling through to key rotation
  - Move `clear_pending_request` out of `applyPayload` and clear before processing to prevent infinite retry loop on IPC failure
  - Remove `.passthrough()` from all dApp request schemas so unknown fields are stripped
  - Read `pendingTxs` via a ref in the balance notification effect to prevent duplicate notifications on state updates
  - Replace string-level `is_private_host` check in `post_callback` with DNS resolution validation
  - Cap analytics pagination at 20 pages (2,000 transactions) and thread the query abort signal

  **Low (L1–L12)**

  - Replace `String.fromCharCode(...array)` spread with `Array.from` to avoid stack overflow on large byte arrays
  - Remove `exportSigningPublicJwk` — HMAC is symmetric and has no public half
  - Guard `effectiveIndex` against `-1` when wallet list is empty; sync `selectedIndex` with active account on external changes
  - Use refs for `isLocked` and `allowBlurLockBypass` in blur lock handler to avoid stale closure
  - Log store-key file permission failure instead of silently ignoring it
  - Replace `starts_with("sigil://")` guard in deep link handler with a proper URL scheme parse
  - Reuse the encrypted value on disk write retry instead of re-encrypting with a new nonce
  - Set startup notification lookback to 24 hours so missed transactions are surfaced on fresh install
  - Use `Math.floor` for request expiry comparison to avoid float/int mismatch
  - Throw on balance response length mismatch instead of silently mapping missing entries to `0n`
  - Guard `BigInt()` conversion in `BalanceBar` against non-integer amount strings

  **High (H6–H7) — second audit**

  - Always write store key to file on Linux/macOS regardless of keyring outcome, and enable the real D-Bus secret-service backend via `sync-secret-service` feature; fixes persistent data loss on every app restart
  - Cache store encryption key in a `OnceLock` after first load to avoid repeated keyring/file round-trips
  - Fix updater error branch: previously hardcoded `platform: "windows"` / `supportsAutoUpdate: true`, breaking Linux AppImage update checks

  **Medium (M9–M14) — second audit**

  - Fix account name lookup to use `.find()` by `.index` field instead of array subscript, which diverges after hiding/removing accounts
  - Add `removeFromVault` routed through the vault mutex; use it in the remove-account flow instead of an unguarded re-encrypt
  - Restructure large-incoming and generic-received balance notification to `else if` so a large transfer doesn't fire both notifications
  - Fix password attempt counter surviving component remount by lifting it to module scope alongside the biometric failure counter
  - Include `passwordLockoutUntil` in the Zustand persist merge function so lockout state is not silently reset to 0 on rehydration

  **Low (L13–L16) — second audit**

  - Apply the same password strength requirement (`strength.level >= 1`, not `length >= 10`) to the vault import flow
  - Zero the seed `Uint8Array` in the crypto worker's `finally` block so it is wiped from worker memory after every signing operation
  - Clamp `contract_index` to `[0, 1023]` and `input_type` to `[0, 65535]` in `scCallRequestSchema` to reject out-of-protocol values
  - Document why string-level private-IP check is correct for `redirect_uri` (browser-opened, not wallet-fetched; DNS resolution is the `post_callback` gate)

## 0.11.19

### Patch Changes

- 8f50b5f: Fix Linux AppImage: EGL crash, missing taskbar icon, and broken notifications.

  - **Linux:** Fixed hard abort on startup (`Could not create default EGL display: EGL_BAD_PARAMETER`) — WebKitGTK 2.40+ introduced a DMA-BUF renderer that attempts to create an EGL display before the apprun-hooks can set `GDK_BACKEND=x11`. `WEBKIT_DISABLE_DMABUF_RENDERER=1` is now set in AppRun to disable that path.
  - **Linux:** Fixed missing taskbar and window icon — the AppRun now installs icons at both 256×256 and 128×128 into the hicolor theme and calls `gtk-update-icon-cache` after registration. Without the cache update the icon index is stale and the WM cannot find the icon.
  - **Linux:** Fixed desktop notifications not appearing — `notify-rust` looks up the app icon by name from the hicolor cache; the missing cache update was causing notification daemons (GNOME, KDE) to silently drop or misidentify toasts. Added a fallback D-Bus socket path for non-systemd systems.
  - **Linux:** Fixed missing AppImage file icon in file managers — `.DirIcon` is now embedded at the squashfs root during the patch pipeline. Nautilus, Dolphin, and AppImageLauncher read this file to display the icon on the AppImage itself.

## 0.11.18

### Patch Changes

- d6b927b: Fix bugs and improve error messages across the wallet.

  - **Send / Send Many:** Fixed a crash when entering a decimal amount (e.g. `1.5`) — `BigInt` cannot parse decimals and would throw before the review screen. Amount fields now reject non-integer values at validation time.
  - **Notifications:** Fixed stale closures in notification triggers — toggling large-incoming, sent, confirmed, or missed-confirmation settings now takes effect immediately without waiting for an unrelated data refresh.
  - **Lock screen:** Improved attempt-count error message from `WRONG PASSWORD (2/5)` to `WRONG PASSWORD — 3 ATTEMPTS REMAINING`, and expanded `WAIT 30s` to `WAIT 30 SECONDS` with correct pluralization.
  - **Security:** Clarified the Linux biometric note to explain that the system secret service stores the password securely rather than using a biometric prompt.

## 0.11.17

### Patch Changes

- 44b2dcf: Fix AppImage launching on Linux.

  - **Linux:** Fixed `SIGABRT` on startup — the custom AppRun was replacing linuxdeploy's wrapper and skipping the `apprun-hooks` that set `GDK_BACKEND`, GTK paths, pixbuf loaders, and GIO modules. AppRun now sources those hooks and delegates to the original launcher binary.
  - **Linux:** `WEBKIT_EXEC_PATH` is now set correctly so WebKitGTK can find its subprocess helpers (`WebKitNetworkProcess`, `WebKitWebProcess`).

## 0.11.16

### Patch Changes

- 44f6ffd: Fix AppImage crashing on startup with WebKit subprocess error.

  - **Linux:** Fixed `SIGABRT` caused by `WebKitNetworkProcess` not being found. Tauri's bundler only copies shared libraries, not WebKit's executable helpers — they are now explicitly included in the AppImage.

## 0.11.15

### Patch Changes

- 41d2f4f: Fix AppImage failing to launch on Linux.

  - **Linux:** Fixed `SIGABRT` on startup caused by WebKitGTK being unable to find its subprocess helpers (`WebKitNetworkProcess`, `WebKitWebProcess`). `WEBKIT_EXEC_PATH` and `LD_LIBRARY_PATH` are now set in AppRun so the bundled helpers are found and can load their shared libraries.
  - **Linux:** Vault data now persists correctly — bundled WebKitGTK is kept so Tauri's IPC channel matches the compiled version.
  - **Linux:** Desktop notifications now work when launched from a file manager — `DBUS_SESSION_BUS_ADDRESS` is set in AppRun before startup.

## 0.11.14

### Patch Changes

- e0c597b: Fix AppImage stability and notifications on Linux.

  - **Linux:** Vault data now persists correctly — bundled WebKitGTK is kept so Tauri's IPC custom scheme handler matches the compiled version; using the system WebKit caused silent `invoke()` failures that discarded all store writes.
  - **Linux:** Desktop notifications now work when the AppImage is launched from a file manager or launcher. The session D-Bus address is set in AppRun before startup — without it, `zbus` can't reach `org.freedesktop.Notifications` and notifications fail silently.

## 0.11.13

### Patch Changes

- 2ad5a50: Fix AppImage launch and notifications on Linux.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage FUSE-free runtime via AppImageKit's toolchain.
  - **Linux:** Fixed a startup abort (`EGL_BAD_PARAMETER`) by stripping the bundled Ubuntu 22.04 WebKitGTK and WPE libs so the system-provided versions are used.
  - **Linux:** Desktop notifications now work from AppImage — a local desktop entry and icon are registered automatically on first launch so GNOME's notification daemon accepts toasts.

## 0.11.12

### Patch Changes

- 1c9e06d: Fix AppImage failing to launch on Linux.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.
  - **Linux:** Fixed a startup crash caused by bundled `libmount` being too old for the system's `libgio`.
  - **Linux:** Fixed a startup abort (`EGL_BAD_PARAMETER`) on systems where the EGL platform is incompatible with the bundled WebKitGTK.

## 0.11.11

### Patch Changes

- acbecca: Fix AppImage failing to launch on Linux.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.
  - **Linux:** Fixed a startup crash caused by bundled `libmount` being too old for the system's `libgio`.
  - **Linux:** Fixed a startup abort (`EGL_BAD_PARAMETER`) caused by bundled Mesa/EGL libs conflicting with the system GPU driver stack.

## 0.11.10

### Patch Changes

- ba125f0: Fix AppImage failing to launch on Linux.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.
  - **Linux:** Fixed a startup crash on newer distros caused by a bundled `libmount` version mismatch with the system's `libgio`.

## 0.11.9

### Patch Changes

- 45a0776: Fix AppImage failing to launch on systems without FUSE.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.

## 0.11.8

### Patch Changes

- 3f5126f: Fix AppImage failing to launch on systems without FUSE.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.

## 0.11.7

### Patch Changes

- 8fce4ca: Fix AppImage failing to launch on systems without FUSE.

  - **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime. The go-appimage binary is extracted directly before use since its AppImage runtime drops command-line arguments when run in FUSE-less CI environments.

## 0.11.6

### Patch Changes

- 64c6d74: Fix AppImage failing to launch on systems without FUSE.

  - **Linux:** The AppImage now correctly runs without FUSE by switching to the go-appimage build toolchain, which embeds a FUSE-free runtime. The previous build used a wrong download URL that caused a silent CI failure.

## 0.11.5

### Patch Changes

- 295a9fb: Fix AppImage failing to launch on systems without FUSE.

  - **Linux:** The AppImage now correctly runs without FUSE by switching to the go-appimage build toolchain, which embeds a FUSE-free runtime. The previous build used an incompatible runtime that caused a silent exit with no visual feedback.

## 0.11.4

### Patch Changes

- 25bd198: Improve Linux packaging and notification reliability.

  - **Linux:** AppImage now runs on systems without FUSE installed — uses a fallback runtime that extracts to a temp directory when FUSE is unavailable.
  - **Linux:** Desktop notifications on AppImage now show an accurate hint explaining that the app icon won't appear in toasts until the AppImage is integrated with the desktop, instead of a misleading warning shown to all Linux users including those on deb/rpm.
  - **Linux:** Deep-link handling (`sigil://` scheme) now registers correctly on deb and rpm installs.
  - **UX:** App icon launches now show a loading cursor on Linux desktops that support startup notification.

## 0.11.3

### Patch Changes

- 88ea1e9: Add a MAX button to the send screen balance bar that fills the amount field with the full available balance.
- 88ea1e9: Add an actionable hint ("SEND OR RECEIVE QU TO GET STARTED") below the empty transactions state on the dashboard.
- 096a68a: Preserve transaction history filters when switching accounts instead of resetting to defaults.
- 88ea1e9: Rate-limit password unlock attempts (5 attempts then 30s cooldown) and show a clear message when biometric is locked out instead of silently hiding the button.
- 257dd7d: Add a tooltip title to the network health dot, and add a color legend to the network overlay modal so the green/yellow/red states are explained without guessing.
- 257dd7d: QR code card now uses a white background so the QR blends seamlessly in all themes instead of showing a mismatch between the card and QR margins.
- 88ea1e9: Change QR reveal hint from "HOVER TO REVEAL" to "TAP OR HOVER TO REVEAL" for touch users. Add a live expiry countdown to the request approval screen that turns red in the final 10 seconds.
- 88ea1e9: Show a live countdown timer during seed reveal instead of the static "60 SECONDS" label.
- 257dd7d: Show a validation error when entering an invalid or zero price override in send-many instead of silently ignoring it. Reduce infinite scroll trigger margin in history from 200px to 100px to avoid over-eager page fetching.
- 096a68a: Settings rows now show current values at a glance (auto-lock duration, theme, contact count, notification state, approved dApp count) instead of static descriptions.
- 096a68a: Show an error modal when importing a malformed vault file instead of silently ignoring it. When the active vault is deleted, automatically activate the next vault and navigate to the lock screen. Show last-used time on contact cards and sort contacts by recent use.

## 0.11.2

### Patch Changes

- 00a4a5b: Strip Pango, Cairo, ATK, GDK Pixbuf, and HarfBuzz from AppImage so rolling-release distros (Arch, Manjaro) use system libraries instead of the Ubuntu 22.04 bundled versions.

## 0.11.1

### Patch Changes

- ec00aa0: Remove unused `jsonWebKeySchema` variable left over from proof removal.

## 0.11.0

### Minor Changes

- 8ead492: Remove proof/trust system, add redirect_uri delivery mode for deep-link requests.

## 0.10.4

### Patch Changes

- ef138a4: Linux releases now include an RPM package for Fedora, RHEL, and openSUSE.
- c9ee737: The AppImage no longer bundles GTK3/GLib2, fixing crashes on Arch Linux, Manjaro, and other rolling-release distros.

## 0.10.3

### Patch Changes

- e86c0ab: Linux releases now include an RPM package for Fedora, RHEL, and openSUSE.
- 54333e0: The AppImage no longer bundles GTK3/GLib2, fixing crashes on Arch Linux, Manjaro, and other rolling-release distros.

## 0.10.2

### Patch Changes

- cfaf430: Fix overflow in diagnostics and support screens

  - Diagnostics: InfoRow value spans now have `flex: 1; min-width: 0; overflow-wrap: break-word` so long RPC URLs and error messages wrap correctly inside their cards
  - Diagnostics: Section cards use `overflow: hidden` as a containment guard
  - Support: Attribution note text (long uppercase monospace) gets `overflow-wrap: break-word`
  - Support: SponsorSheet and DiscordSheet bottom sheets now have `max-height: 85dvh; overflow-y: auto` so they cannot exceed the viewport on short windows

- 84783c5: Fix wallet freezing during Sign & Send by moving signing to a Web Worker

  The FourQ SchnorrQ signing implementation in `@qubic.org/crypto` uses synchronous pure-JS BigInt scalar multiplication (`scalarBaseMult`) which was called three times per signing operation on the main thread. This blocked the Tauri WebView renderer, making the wallet appear unresponsive or crashed.

  Signing is now dispatched to a dedicated Web Worker (`crypto.worker.ts`), keeping the main thread free during the elliptic curve computation. This covers transfer, smart contract call, and sign-message flows.

## 0.10.1

### Patch Changes

- df5f23f: Add typed callback response interfaces and export verifyEnvelopeSignature

  - Added `SigilCallbackResponse` union type and its five constituent interfaces (`SigilSignedTransferCallback`, `SigilSignedMessageCallback`, `SigilConnectedCallback`, `SigilVerifiedCallback`, `SigilRejectedCallback`) to `request-schema.ts`
  - Exported `verifyEnvelopeSignature` from `request-trust.ts` as a standalone helper for verifying ES256 signed envelopes without the full registry trust evaluation
  - Updated `request-screen.tsx` to construct typed callback response objects instead of plain `JSON.stringify` calls, providing compile-time shape guarantees

- 8788706: Fix deep-link requests never reaching the request screen

  - `proof: null` from unsigned requests failed zod's `.optional()` check,
    causing `parseSigilEnvelope` to reject every envelope silently — changed
    to `.nullish()` so absent proof is accepted as `null` or `undefined`
  - `lock()` was clearing `pendingRequests`, destroying any queued deep-link
    request if auto-lock fired before the user could review it — pending
    requests now survive lock/unlock so the lock screen routes correctly to
    `/request` after unlock

- e9bb1d2: Fix updater context fields being undefined in TypeScript

  The Rust `UpdaterContext` struct used `#[serde(rename_all = "snake_case")]`, which serialized `packageKind` as `package_kind` and `supportsAutoUpdate` as `supports_auto_update`. The TypeScript interface expected camelCase, so both fields read as `undefined`. This caused the updater to exit early without checking for updates, and diagnostics to show `—` for package kind and auto-update support. Changed to `#[serde(rename_all = "camelCase")]`.

## 0.10.0

### Minor Changes

- 17a4bc8: Add dedicated analytics screen accessible from transaction history

  - New `/analytics` route with hero net flow, proportional IN/OUT flow bar,
    monthly breakdown bars, top counterparties, and contract usage sections
  - Compact QU number formatting via `Intl.NumberFormat` compact notation
  - History screen gains a chart icon button navigating to analytics

- 17a4bc8: Apply Nothing design system to core UI components

  - Button: Space Mono font, uppercase + letter-spacing, consistent 13px/11px sizing
  - Input: label font → Space Mono with 0.08em tracking
  - Dashboard balance: hero number uses Doto display font
  - Remove toast and skeleton components (anti-patterns per Nothing design)

### Patch Changes

- 17a4bc8: Replace vaults header text buttons with icon buttons

  Import, watch-only, and new vault actions now use `FolderOpen`, `Eye`,
  and `Plus` icons instead of text labels for a cleaner header.

## 0.9.2

### Patch Changes

- c7aba19: Tighten setup and session consistency by aligning vault password guards, resolving splash hydration immediately when available, and making watch-only unlock handling explicit.

## 0.9.1

### Patch Changes

- 56f59cf: Improve updater reliability by centralizing update state, surfacing unsupported Linux package installs, switching Windows installs to quiet mode, and generating complete updater metadata in tag-based releases.

## 0.9.0

### Minor Changes

- dfff29d: Add a built-in diagnostics page and exportable debug bundle, while separating diagnostic controls from the lock-on-blur security bypass.
- 5d3d8bb: Add fiat-at-time transaction history, vault analytics summaries, and richer sponsor transparency details with donation history and attribution preferences.
- e877995: Add granular notification polling profiles, richer notification center filters, and configurable price and transfer alert rules.
- 0b08285: Improve deep-link request handling with persistent request history, callback recovery actions, richer contract decoding, and preflight request simulation details.
- 483a21d: Added signed export format v2 for vault and contact backups, local audit logging for sensitive wallet activity, configurable approval policies for burns, seed reveals, and high-value sends, plus new Trust and Audit Log settings screens.
- 93db83a: Add shared request schemas and a central transaction domain module.

  This unifies deep-link/request validation, shared request typing, and transaction normalization across history, analytics, search, and background flows. It also includes a polling selector stability fix to prevent a startup render loop.

- 9aa95a7: Complete the trust roadmap with signed deep-link request verification and a local verified dApp issuer registry.

  Signed request envelopes can now be verified against pinned ES256 issuer keys, revoked or mismatched issuers are blocked, and the Trust settings screen manages local issuer entries for request verification.

- c3e7bd1: Added watch-only vaults with per-account notes and tags, plus batch recipient import, inline destination suggestions, and a new global search across accounts, contacts, memos, transactions, and known contracts.

### Patch Changes

- cdc6e05: Aligned request callback parsing with native localhost rules, removed dead boot code, added package check/test entry points, and split vendor bundles to reduce the initial frontend payload.
- 1a819b3: Tighten notification text sanitization and rewrite random crypto buffer generation to avoid false-positive hard-coded secret alerts in native storage and vault encryption paths.
- 23edb04: Fixed the highest-priority audit issues around network configuration, local metadata protection, and deep-link request handling.

  - Fixed custom RPC handling so the app consistently supports custom HTTPS endpoints, validates them before saving, and uses the selected network for latest-stats fetches.
  - Restored OS-protected storage as the primary home for the persisted-store encryption key, with file-based storage kept only as a migration/fallback path when secure storage is unavailable.
  - Replaced the native single-slot deep-link pending state with a FIFO queue and updated cold-start request draining so bursts of incoming requests are no longer overwritten.

- 6b9e660: Addressed the medium-priority audit findings around dApp approval management, clipboard fallback security, bigint-safe amount display paths, deep-link request validation, pending transaction lifecycle ownership, and splash-screen update blocking.
- 2a89699: Tighten desktop notification behavior by preventing locked-state OS delivery unless explicitly enabled, removing automatic startup permission prompts, and surfacing actionable Linux/macOS delivery failures in settings and diagnostics.

## 0.8.5

### Patch Changes

- f8768e0: Improved wallet navigation and account management.

  - Simplified the vault account manager so each account now opens a focused management sheet instead of showing a dense row of action buttons.
  - Added current-vault accounts to the destination picker used by `Send` and `Send to Many`, making transfers between your own accounts much faster.

## 0.8.4

### Patch Changes

- cc81846: Improve [area] across [themes].

  - **Security:** [user-facing security improvement]
  - **Wallet:** [user-facing wallet or signing improvement]
  - **Reliability:** [stability or correctness improvement]
  - **UX:** [visible interface or workflow improvement]

- a03621c: Improve wallet security, reliability, and day-to-day usability.

  - **Deep-link security:** Hardened request validation, nonce handling, callback posting, and sender presentation to reduce spoofing, replay, unsafe callback targets, and misleading dApp identity cues. Commits: `3460214`, `81ac5f8`, `110573d`, `bc0234e`, `0df208b`.
  - **Vault and session safety:** Reduced secret exposure in normal app state, tightened unlock and auto-lock behavior, improved Linux quick unlock, and added per-account seed reveal with safer clipboard handling. Commits: `81ac5f8`, `6b6a3f6`, `fc7d6d6`, `65f04f7`, `068e882`.
  - **Local data protection:** Strengthened persisted metadata handling, made dev persistence more stable, capped stored transaction metadata, and reduced unnecessary store and clipboard capabilities. Commits: `baffcd7`, `98a87c4`, `00e4d6b`, `ecd05a8`, `5545200`, `543aac0`, `6d21c4a`.
  - **Network and transport hardening:** Tightened endpoint validation, sanitized callback failure reporting, removed broad raw GitHub CSP access, bundled sponsor-name metadata locally, and reduced bursty Qearn position queries. Commits: `fb3210b`, `49103eb`, `a847397`, `8027bce`, `0df208b`.
  - **Export and recovery UX:** Switched exports to native save dialogs, improved failure handling around file saves and clipboard fallbacks, and made recovery and export flows more predictable. Commits: `6036560`, `f66241c`, `5531e0b`, `fc7d6d6`.
  - **Interface polish:** Improved QR scan contrast, made identity truncation Unicode-safe, validated theme color inputs, clarified debug-mode blur-lock warnings, and aligned vault account management with the rest of the app’s card-based UI. Commits: `0751f55`, `f1bb42d`, `3e9ac86`, `5c12b17`, `c2ee4e1`.

## 0.8.3

### Patch Changes

- c50ac40: Harden wallet security and move vault cryptography into the Rust backend.

  - move vault encryption and decryption into Rust and have biometric unlock return decrypted seeds instead of a plaintext vault password
  - harden callback and deep-link validation against replay, IP literal, and non-HTTPS origin edge cases
  - restrict localhost CSP access and scope export filesystem permissions
  - validate RPC and Bob endpoints more strictly and sanitize export filenames, surfaced errors, and desktop notifications
  - cap persisted pending transactions and hide unrevealed seed text from the DOM

## 0.8.2

### Patch Changes

- 28741e9: Improve desktop wallet safety and export UX.

  - harden deep-link callback handling against redirects, private-network resolution, and UTF-8 panic cases
  - remove persisted trust for self-reported deep-link origins and queue incoming requests instead of replacing the active review
  - encrypt persisted local metadata and fail closed on store read errors
  - stabilize modal focus handling during request and settings flows
  - use native save dialogs for contact and vault exports

## 0.8.1

### Patch Changes

- da7a487: Show identity-based identicons next to each contact in the contacts list and contact picker.

## 0.8.0

### Minor Changes

- e01dba8: Add FNV-1a identicons for vault cards and account addresses. Redesign vault list with colored left border rail, per-card ⋮ action panel, and sorted by last unlock. Show app version in title bar. Switch to eager route imports to fix animation stutter on first navigation.
- e01dba8: Balance-increase notifications now fire for all vault accounts (not just the active one). New "Notify when locked" setting keeps polling and notifying after the vault is locked.
- e01dba8: Add account by imported seed in vault detail; show account picker when importing a vault file with more than 16 accounts (pre-selects first 16, enforces the cap).

### Patch Changes

- e01dba8: Fix identicons rendering on transaction hashes in history detail. Remove duplicate identicon in vault account rows. Replace hand-drawn rhombus with actual app icon in title bar; show vault identicon instead of color dot in dashboard header.

## 0.7.0

### Minor Changes

- a00b796: Replace per-account balance polling with a single `QUtil.getBalances16` SC query that fetches all vault account balances in one call every 5 s. Vault accounts are now capped at 16 — the "+ Add" button in vault detail is replaced with a "16 MAX" label once the limit is reached.

### Patch Changes

- a00b796: Fix SC call procedure names in transaction history incorrectly showing read-only query function names (e.g. "Asset Ask Orders", "Quote Exact Asset Input") for QX and Qswap contracts. Procedure lookup now uses `build*Input` method presence to distinguish callable write procedures from query functions, which share the same numeric `inputType` values but in separate call paths. Qearn lock is covered by a manual override since the package exports no `buildLockInput` helper.

## 0.6.0

### Minor Changes

- 14f5762: Add hide-to-tray on close: system tray icon with Show/Quit menu, left-click to restore, configurable in Notifications settings. Fix notification permission not persisting across restarts. Disable context menu globally.
- 8dcaf04: Transaction history now supports infinite scroll (50 tx/page) and a filter sheet: direction (all/in/out) and status (all/confirmed/failed/sc call). Active filters shown as dismissable chips. New Sheet component for bottom-sheet UIs.
- 14f5762: Editable price override ($/bQU) in Send and Send Many screens: pencil icon opens a sheet to enter a custom rate, USD totals update live, reset-to-market button when overridden
- 14f5762: Add splash screen that enforces app updates on startup: checks for updates immediately, shows cycling Qubic facts, blocks navigation during download/install with a progress bar, then relaunches. Add internal transaction memos: attach a private note to any confirmed tx, stored locally in the vault, exportable as JSON.

### Patch Changes

- 14f5762: History filter sheet improvements: replace status/period/epoch filters with a date range picker, cap sheet at 80vh with scrollable content, sticky Reset/Apply footer, compact QU amounts (1K/1M/1B), transaction dates from timestamp, icon buttons in header with absolute-centered title
- 14f5762: Bundle all font pairs (Space Grotesk, Space Mono, Geist, Inter, JetBrains Mono, IBM Plex, Roboto, Fira Sans, Doto) locally via @fontsource packages; remove Google Fonts network dependency so fonts render correctly on all platforms including Windows
- 95a6167: Harden CSP: restrict connect-src to rpc.qubic.org and raw.githubusercontent.com, remove Google Fonts from font-src, remove https: wildcard from img-src. Add cargo-audit and npm audit to CI. Add SECURITY.md with vulnerability reporting instructions and architecture notes for researchers.
- 95a6167: Show a memo note field on the Send and Send Many done screens so users can annotate a transaction immediately after broadcast, before navigating away
- 95a6167: Fix sheet scroll area clipping (padding between content and edges), absolutely center screen header titles so action buttons no longer shift the title, replace FILTER text and refresh character with consistent icon buttons in transaction history

## 0.5.0

### Minor Changes

- f067a43: Add experimental Bob node support (real-time WebSocket tick subscription, REST client) configurable in Network settings; rename debug mode to developer mode with blur-lock bypass when enabled
- 5fd7bd1: Add Bob WebSocket transfer subscriptions for push-based cache invalidation: balance and tx history now update immediately on incoming/outgoing transfers when Bob is enabled and synced, replacing 5s polling latency. Health-gate all Bob WebSocket activity behind sync lag threshold so a lagging node never shows as live or triggers stale reads.

### Patch Changes

- 3df618f: Fix macOS LAContext UAF (release after auth completes), tighten sleep-detection to 15s, 2px focus ring for WCAG 2.4.11, safe-center FullPage overflow, /request in ROUTE_DEPTH, skip blur-lock in dev, hide-account confirmation modal
- 37dc794: Restore AppShell scroll position on back navigation via sessionStorage, render modals via React portal to fix clipping during page transitions
- a2cc09e: Add lastUsedAt to ApprovedDapp, cross-check verify-message signer, validate DONATION_IDENTITY at init, lock_clipboard only clears when sensitive content pending, warn on multi-account vault deletion, identity copy-on-tap in vault detail, SendToMany scroll hint
- b079583: Surface failed/expired tx alerts in dashboard instead of silently discarding, fix notification permission re-check on app restart, add USD price display from latest-stats API with USD-to-QU input in send screen, show parse error in request screen instead of silent navigation, fix Space font pair (Space Mono for mono, correct Google URL), add Geist font pair

## 0.4.5

### Patch Changes

- a5c025d: Require biometric challenge before enrollment, fix Windows CredFree leak on utf8 failure, guard send button when wallet or tick info absent, clamp dApp name overflow in request header
- d26805a: Extract ContactPicker component eliminating duplicate contact modal JSX in send and send-many screens, extract BottomNav component from dashboard, add newId() helper replacing inline globalThis.crypto.randomUUID() calls
- 67885a5: Extract TxSending and TxError components eliminating repeated broadcast state JSX across send, burn, send-many, and stake screens
- da5107a: Block IPv6 loopback in deep link callback validation, update Cargo metadata, reuse reqwest client via OnceLock, sanitize backup filename, hide TitleBar in fullscreen, guard lock-screen on missing vault, replace setTimeout focus with requestAnimationFrame, validate unlock seeds/wallets length
- 2bc533b: Extract ScreenHeader component eliminating repeated status bar JSX across 18 screens, show derived address on import vault step 2 for seed verification, guard send review button when wallet or tick info absent
- f9d7286: Extract Skeleton design system component, add extractMessage helper to standardize error extraction across tx and biometric screens
- 67bb005: Add TSDoc to all hooks, crypto, rpc, persisted store, appearance, and sponsors; extract seed auto-hide and clipboard-clear durations into named constants
- 46e6e9c: Add interface-level TSDoc to complex persisted types, fix auto-lock two-mutex write race by deriving enabled state from timeout_minutes, consolidate null-rendering App side-effect components into AppHooks

## 0.4.4

### Patch Changes

- 06564e0: Allow selective permission grant on dApp connect, fix contact ID collisions on import, make contact replace atomic, sort contacts alphabetically in settings, fix partial identity search in settings contacts filter
- 7120e1a: Persist biometric failure count across lock-screen remounts, show pending transaction ETA in history, merge store subscriptions in App.tsx, cap sign-message display length, connect send confirmation watcher to notification preference, enforce password complexity on vault creation, zero password before biometric enrollment
- ae7afff: Guard burn and stake sends against pending transactions and missing wallet/tick state, fix strict SendToMany payload size validation, deduplicate contacts by identity on file import, clamp custom accent color lightness for legibility

## 0.4.3

### Patch Changes

- a03daa2: Fix request BACK button sending spurious rejection, active-vault session leak on delete, send-many fee null guard, BalanceBar BigInt precision, seed phrase auto-hide after 30s, seed clipboard auto-clear after 60s
- 0980540: Fix async unlisten race in useAutoLock and TitleBar where a fast unmount before the listen() promise resolved would leave a dangling event listener; expand shorthand 3-char hex (#abc) correctly in custom color scheme math
- d4a1c4d: Validate dApp origin and callback URL as https://, sanitize backup account data, block send-many while tx pending, reset history filter on account switch, sort contacts alphabetically, fix partial identity search across all pickers
- 490b25d: Fix Rust mutex poison killing auto-lock and clipboard watcher threads permanently; replace seen_nonces HashSet clear with timestamp-based eviction to prevent nonce replay; cap deep-link payload at 8 KB; enforce exp field present and ≤1 hour in the future
- 0980540: Remove unused store:allow-clear capability to prevent full store wipe via XSS; force_lock now resets Rust activity timer so countdown starts fresh after manual lock; revokeDappPermission automatically removes the ApprovedDapp entry when all permissions are revoked; vault file import now rejects blank names
- a6bd984: Fix persisted store merge crash on corrupted data; mount useAutoLock once at layout level instead of per-screen; remove duplicate pending-tx cleanup from history screen; fix account removal keeping stale activeAccountIndex; guard concurrent add account on Enter; fix Button missing type="button" default; fix Input autoComplete order blocking callers; remove Tag role="status" misuse; fix IdentityDisplay interval leak on unmount; fix request-screen permission re-check on every approvedDapps change
- 0980540: Add autocomplete=current-password/new-password to all vault password inputs so password managers work correctly; add wheel and touchmove to auto-lock activity reset events; guard vaults-screen Enter key from concurrent vault unlock/import/delete
- 0980540: Enforce exp field in deep-link parseEnvelope to reject stale requests on the frontend; decouple addVault from activeVaultId so setup screens explicitly control which vault becomes active

## 0.4.2

### Patch Changes

- c1083be: Security hardening, code quality, and resilience improvements.

  - `post_callback` now blocks IPv6 private ranges (fc00::/7, fe80::/10), enforces a 4 KB body limit, and propagates HTTP error status codes
  - `is_private_host` IPv6 bracket stripping and 172.x second-octet parse fixed
  - `truncateId` and `formatQu` centralised in `src/lib/format.ts`; all screens and components now share a single implementation
  - Global and per-screen error boundaries added so a render crash shows a recoverable error state instead of a blank window

## 0.4.1

### Patch Changes

- 39ed559: Correctness, accessibility, and performance improvements.

  - Stake lock amount now uses BigInt directly — no more precision loss for large QU values
  - Request previews accept amount as a string, preventing silent truncation of amounts above 2^53 QU
  - Modal now traps focus and sets role="dialog" for keyboard and screen reader accessibility
  - Toast messages now use aria-live so screen readers announce inline feedback
  - All screen components are now lazy-loaded, reducing initial parse time on startup

- b0cc1b0: Reliability, security, and correctness fixes.

  - TitleBar window handle is now created inside the component, preventing stale handles on hot reload
  - Notification history state resets on account switch, preventing false "Confirmed" alerts
  - Notification amounts use BigInt formatting, eliminating precision loss for large QU values
  - Seed phrase input is masked during vault import
  - Custom RPC URLs are validated before connecting; switching networks flushes the query cache

- 8cfa031: Security hardening and stability fixes.

  - Disabled `withGlobalTauri`, `devtools`, and set a Content Security Policy in production builds
  - Pending requests are now cleared on the Rust side after every approve, reject, or auto-reject — prevents stale requests from replaying after a crash
  - Auto-lock now clears any pending deep-link request, preventing stale requests from re-appearing after unlock
  - Disk write failures in the persisted store are now logged and retried instead of being silently swallowed
  - Burn screen now checks balance before allowing the confirmation step

## 0.4.0

### Minor Changes

- 26c6998: Live sponsors list and Discord prompt on donation.

  - Sponsors are now computed live from the Qubic archive API (paginated, all-time) instead of a static JSON file
  - Multiple donations from the same identity are accumulated correctly
  - Sponsor data is cached for 10 minutes and invalidated immediately when a donation is broadcast
  - After sending a donation, a sheet prompts the user to message `@alez.t04` on Discord to show a custom name instead of their truncated identity

### Patch Changes

- 26c6998: Fix pending transactions not expiring in notification triggers.

  - Expired tx detection now uses the live tick (`useTickInfo`) with a +30 tick grace period, matching the history screen
  - Previously used the archive tick (`useLastProcessedTick`) which can lag significantly behind or return 0 on API failure, causing expired txs to stay pending indefinitely

## 0.3.7

### Patch Changes

- 0999efc: Fix pending transactions never being removed from history.

  - Confirmed and expired pending txs now call `removePendingTx`; previously only notifications were fired and entries stayed in the store indefinitely
  - History fetch is no longer gated on notification settings — cleanup runs regardless of whether notifications are enabled
  - On first load, pending txs already present in history are silently removed without firing a notification

## 0.3.6

### Patch Changes

- aaf02f9: Fix cold-start deep link and add dApp request notifications.

  - Cold-start deep link now correctly shows the request screen after unlock; the previous hook fired `get_pending_request` before the persisted store had rehydrated, saw `vaults.length = 0`, navigated to `/setup`, and cleared the Rust-side payload — leaving `pendingRequest` null by the time the user unlocked
  - `useDeepLink` now waits for `persist.hasHydrated()` before reading the stored request, and uses a ref pattern so the single registered listener always sees current lock state without re-subscribing
  - Removed the deep link handler's `/setup` navigation — root screen owns that routing
  - Desktop notification fires on every incoming dApp request (transfer, SC call, sign message, verify message, connect) when notifications are enabled; includes contract name + amount for SC calls

## 0.3.5

### Patch Changes

- 0d3410d: Fix contract name lookup for all 27 Qubic contracts.

  - `CONTRACT_NAMES` now resolves correctly for every contract (Qswap, Nostromo, QX, etc.); the previous approach read `_CONTRACT_INDEX` exports which Vite's esbuild pre-bundler tree-shook for any symbol not explicitly imported, leaving only Qearn and QUtil with names
  - Switched to the camelCase namespace objects (`qswap`, `qearn`, …) which are always present in the pre-bundle regardless of tree-shaking
  - Fixed inverted guard in `CONTRACT_PROCEDURE_NAMES` loop (`!slot || GET_` → `slot || GET_`) that prevented procedure labels from ever being written
  - TESTING.md: corrected Qswap `input_type` to 3 (Create Pool), corrected unknown contract index to 63 (valid Rust range, no known mapping)

## 0.3.4

### Patch Changes

- d921a72: SC call info, instant navigation, transfer validation, and updater feedback.

  - SC call preview now shows the name and procedure of all 27 Qubic contracts (Qearn, QUtil, QX, Qswap, Quottery, QVault, Escrow, Nostromo, Pulse, etc.) sourced directly from `@qubic.org/contracts` at build time; unknown contracts fall back to `Contract #N / Procedure N`
  - History screen now labels SC calls by destination address for all known contracts (was only QUtil and Qearn)
  - Router switched from lazy-loaded chunks to eager imports — eliminates the `[LOADING...]` flash on first visit to each screen after cold start
  - Transfer preview validates the destination identity (checksum) before showing the Sign button; invalid destinations show `[INVALID DESTINATION IDENTITY]` immediately instead of failing after clicking sign
  - Updater check now shows `[UP TO DATE]` when no update is available and `[UPDATE CHECK FAILED]` in red on network errors; errors were previously swallowed silently

## 0.3.3

### Patch Changes

- 04d0b54: Fix test dApp identity and verify_message instructions in TESTING.md.

  - Replace `AAAA...AAAA` dummy identity with the Sigil donation address which has a valid Qubic checksum — the all-A identity passed Rust format validation but failed the frontend checksum check, causing `[Invalid identity]` on every transfer test
  - Clarify verify_message setup steps: sign a message first, copy `signature` and `public_key` from the result, paste into the HTML — the placeholder literal strings were being sent as-is

## 0.3.2

### Patch Changes

- 8f5514f: Fix deep link warm-start, updater feedback, and enable DevTools.

  - Deep link warm-start: when Sigil is already running and a `sigil://` link is clicked, the single-instance callback now processes the URL and brings the window to focus; previously the URL was silently dropped
  - Updater: check result now shows `[UP TO DATE]` when no update is available, and `[UPDATE CHECK FAILED]` in red when the check throws (network error, etc.); errors were previously swallowed silently
  - DevTools enabled in production builds (`devtools: true`) so right-click → Inspect works in the installed app

## 0.3.1

### Patch Changes

- 0f947a6: Fix auto-updater signing and CI pipeline.

  - Enable `createUpdaterArtifacts` in Tauri config so `.sig` files are generated during builds
  - Rotate updater signing keypair
  - Fix CI manifest script crashing under `pipefail` when `.sig` files are missing
  - Fix Windows builds: NSIS-only, no version stripping, so the updater correctly detects new versions
  - Fix repeated platform rebuilds triggered on every push to main
  - Sync `Cargo.toml` version to 0.3.0

## 0.3.0

### Minor Changes

- 0d7ab29: Add custom title bar replacing the OS native one. Includes drag region, minimize/maximize/close controls with hover states, and fullscreen prevention on Windows.
- 423ac7d: Deep link verify message, sign message improvements, and cold-start fix.

  **Features**

  - New `verify_message` deep link type: dApps can ask Sigil to verify a SchnorrQ signature against a message and public key; the sheet shows the message, claimed signer identity, and truncated signature; result (`valid: true/false`) is posted back via callback
  - `sign_message` now accepts a `from` field so dApps can request signing from a specific identity; when omitted and the vault has multiple accounts, an account picker appears (matching the behaviour of `transfer` and `sc_call`)
  - Success screen no longer shows `[CALLBACK DELIVERED]` when no callback URL was provided; instead a **Copy result** button lets the user copy the JSON response manually

  **Fixes**

  - Cold-start deep link: when Sigil is launched by clicking a `sigil://` link while the app is closed, the request now correctly appears after unlocking; previously the `sigil:request` event fired before the frontend listener was registered and was silently lost

- e68f33b: Polish and request-screen improvements.

  **Features**

  - Directional page transitions (slide left/right based on route depth), balance counter animation, lock/unlock fade+scale animation
  - Request screen: account picker lets user choose signing account when dApp omits `from`; `from`-identity resolution validates the requested identity is in the active vault and shows an error if not
  - Deep-link with no vault → redirects to setup screen instead of crashing

  **Fixes**

  - Pending transactions now resolve against `getLastProcessedTick` (archive) instead of network tick, giving sub-second confirmation vs. up to 30s
  - 4-position seed-phrase spot-check replaces the previous 55-tap grid backup flow
  - Deep-link callback validator now accepts `http://localhost` and `http://127.0.0.1` for local development
  - Store IPC timeout raised to 1500 ms (safety net 3 s) to prevent hydration failures in debug builds
  - Settings screen gains a back button in the header
  - `window.__TAURI__` exposed globally for DevTools console testing (`withGlobalTauri: true`)
  - Updated app icons across all platforms and sizes

- be98b88: Auto-updater, biometric fix, accessibility, and request UX improvements.

  **Features**

  - Auto-updater: Settings footer shows available update with version; user-triggered download and install with live progress (`[DOWNLOADING... 42%]`); CI pipeline signs all platform artifacts and publishes `latest.json` updater manifest to GitHub Releases
  - Installer branding: window title set to "Sigil", publisher and copyright metadata, per-user NSIS install mode, fullscreen and maximize disabled on Windows
  - Accessibility: `aria-label` on all icon-only buttons, `aria-live="polite"` on status/error regions, `aria-hidden` on decorative icons, keyboard-triggered QR code reveal
  - Animated seed display: characters appear one by one with a 30 ms stagger on seed generation
  - Request popup now slides up as a bottom sheet with a drag handle and backdrop spacer

  **Fixes**

  - Biometric unlock: changed keyring key format from `"bio:{uuid}"` (colon breaks Windows Credential Manager) to a separate service `"sigil-bio"` with vault ID as username; added verify-after-store step so enable fails loudly instead of silently; split error handling so wrong-password and keyring-failure show distinct messages
  - SC call preview: amount row is now shown only when the contract call transfers QU; removed the misleading "Fee: None" row (contract fees are the dApp's responsibility to communicate)
  - Transfer and SC call approvals now block when the signer's balance is insufficient (`[INSUFFICIENT BALANCE]`) or a transfer is already pending confirmation (`[TRANSFER PENDING — WAIT FOR CONFIRMATION]`)
  - Connect screen copy clarifies that permissions are per-action approvals, not silent background grants
  - Appearance settings: increased spacing between sections for visual clarity
  - Clipboard watcher: removed dead code path, `should_clear` now called directly in the watcher loop
  - CI: release notes sourced from `CHANGELOG.md`; Rust toolchain bumped to 1.88.0 to satisfy updated dependency requirements (`darling`, `icu_*`, `image`, `plist`, `serde_with`, `time`, `zbus`)

### Patch Changes

- 811876b: Biometric persistence fix, focus ring audit, autocomplete off, CI stability.

  **Fixes**

  - Biometric unlock (Windows): bypassed `keyring` crate entirely on Windows; now uses `CredWriteW`/`CredReadW` directly with `CRED_PERSIST_LOCAL_MACHINE` so credentials survive app restarts. Users who previously enabled biometric must disable and re-enable it once after updating (credential target name changed from `sigil-bio/{uuid}` to `sigil-vault/{uuid}`)
  - Focus rings: removed `outline: none` inline suppressors from color swatch buttons, ThemeCard, FontCard, and accent color picker; bare `<input>` elements in send, send-many, and security screens now use `sigil-input` class for consistent border-based focus treatment; `:focus-visible` ring (1px white, 2px offset) now applies globally without suppression
  - Autocomplete: `autoComplete="off"` on all text inputs, `"new-password"` on password fields, preventing browser autofill popups from overlapping the UI
  - CI (macOS): added explicit `rustup target add aarch64-apple-darwin x86_64-apple-darwin` step; `rust-toolchain.toml` causes `dtolnay/rust-toolchain` to ignore its `targets:` input so the separate step is required for universal builds
  - CI (Linux): added `bunfig.toml` with `ignoredDependencies` for `lightningcss-linux-x64-musl` and `lightningcss-linux-arm64-musl` which fail to extract on glibc runners

  **Docs**

  - Added `TESTING.md` — complete end-to-end manual test guide covering all 18 user-facing flows, regression checklist, platform-specific notes, and test dApp HTML snippet
  - Updated `README.md` with auto-updater and biometric unlock sections

- 0b40430: CI caching improvements and platform build fixes.

  **Fixes**

  - Windows build: `CRED_FLAGS` is a newtype wrapper in the `windows` crate — changed `Flags: 0` to `Flags: CRED_FLAGS(0)` in `biometric.rs` to satisfy the type checker
  - macOS build: removed `toolchain: stable` input from `dtolnay/rust-toolchain` action — when both the action input and `rust-toolchain.toml` are present they conflict, causing `rustup target add` to install targets into the wrong toolchain version so `x86_64-apple-darwin` was missing at build time; the action now reads exclusively from `rust-toolchain.toml`
  - Pinned Rust toolchain to `1.88.0` via `rust-toolchain.toml` so sccache artifacts are not invalidated on every Rust stable release (~6 weeks)
  - Stabilized sccache GHA cache keys per platform (`sccache-linux-*`, `sccache-macos-*`, `sccache-windows-*`) with fallback to `main` branch cache so release builds reliably restore prior compilation artifacts
  - Added `save-always: true` to `swatinem/rust-cache` so the cargo registry cache is preserved even when a build fails partway through
  - Added `updater:allow-check` and `updater:allow-download-and-install` permissions to Tauri ACL capabilities — the updater plugin was wired up but blocked by missing ACL grants, causing `[Command plugin:updater|check not allowed by ACL]` in settings

- 2afdab3: Fix app stuck on loading screen in production builds caused by Tauri IPC not being ready when the store hydrates. Notifications now work correctly after store hydration is fixed. Replace the loading screen with a skeleton UI.
- c10387e: Fix app stuck at [LOADING...] on production builds by making store hydration reactive. Rename installed binary to `sigil-wallet` to avoid conflict with the Sigil ebook editor on Debian/Kali systems.

## 0.3.0-beta.7

### Minor Changes

- 423ac7d: Deep link verify message, sign message improvements, and cold-start fix.

  **Features**

  - New `verify_message` deep link type: dApps can ask Sigil to verify a SchnorrQ signature against a message and public key; the sheet shows the message, claimed signer identity, and truncated signature; result (`valid: true/false`) is posted back via callback
  - `sign_message` now accepts a `from` field so dApps can request signing from a specific identity; when omitted and the vault has multiple accounts, an account picker appears (matching the behaviour of `transfer` and `sc_call`)
  - Success screen no longer shows `[CALLBACK DELIVERED]` when no callback URL was provided; instead a **Copy result** button lets the user copy the JSON response manually

  **Fixes**

  - Cold-start deep link: when Sigil is launched by clicking a `sigil://` link while the app is closed, the request now correctly appears after unlocking; previously the `sigil:request` event fired before the frontend listener was registered and was silently lost

## 0.3.0-beta.6

### Patch Changes

- 0b40430: CI caching improvements and platform build fixes.

  **Fixes**

  - Windows build: `CRED_FLAGS` is a newtype wrapper in the `windows` crate — changed `Flags: 0` to `Flags: CRED_FLAGS(0)` in `biometric.rs` to satisfy the type checker
  - macOS build: removed `toolchain: stable` input from `dtolnay/rust-toolchain` action — when both the action input and `rust-toolchain.toml` are present they conflict, causing `rustup target add` to install targets into the wrong toolchain version so `x86_64-apple-darwin` was missing at build time; the action now reads exclusively from `rust-toolchain.toml`
  - Pinned Rust toolchain to `1.88.0` via `rust-toolchain.toml` so sccache artifacts are not invalidated on every Rust stable release (~6 weeks)
  - Stabilized sccache GHA cache keys per platform (`sccache-linux-*`, `sccache-macos-*`, `sccache-windows-*`) with fallback to `main` branch cache so release builds reliably restore prior compilation artifacts
  - Added `save-always: true` to `swatinem/rust-cache` so the cargo registry cache is preserved even when a build fails partway through
  - Added `updater:allow-check` and `updater:allow-download-and-install` permissions to Tauri ACL capabilities — the updater plugin was wired up but blocked by missing ACL grants, causing `[Command plugin:updater|check not allowed by ACL]` in settings

## 0.3.0-beta.5

### Patch Changes

- 811876b: Biometric persistence fix, focus ring audit, autocomplete off, CI stability.

  **Fixes**

  - Biometric unlock (Windows): bypassed `keyring` crate entirely on Windows; now uses `CredWriteW`/`CredReadW` directly with `CRED_PERSIST_LOCAL_MACHINE` so credentials survive app restarts. Users who previously enabled biometric must disable and re-enable it once after updating (credential target name changed from `sigil-bio/{uuid}` to `sigil-vault/{uuid}`)
  - Focus rings: removed `outline: none` inline suppressors from color swatch buttons, ThemeCard, FontCard, and accent color picker; bare `<input>` elements in send, send-many, and security screens now use `sigil-input` class for consistent border-based focus treatment; `:focus-visible` ring (1px white, 2px offset) now applies globally without suppression
  - Autocomplete: `autoComplete="off"` on all text inputs, `"new-password"` on password fields, preventing browser autofill popups from overlapping the UI
  - CI (macOS): added explicit `rustup target add aarch64-apple-darwin x86_64-apple-darwin` step; `rust-toolchain.toml` causes `dtolnay/rust-toolchain` to ignore its `targets:` input so the separate step is required for universal builds
  - CI (Linux): added `bunfig.toml` with `ignoredDependencies` for `lightningcss-linux-x64-musl` and `lightningcss-linux-arm64-musl` which fail to extract on glibc runners

  **Docs**

  - Added `TESTING.md` — complete end-to-end manual test guide covering all 18 user-facing flows, regression checklist, platform-specific notes, and test dApp HTML snippet
  - Updated `README.md` with auto-updater and biometric unlock sections

## 0.3.0-beta.4

### Minor Changes

- be98b88: Auto-updater, biometric fix, accessibility, and request UX improvements.

  **Features**

  - Auto-updater: Settings footer shows available update with version; user-triggered download and install with live progress (`[DOWNLOADING... 42%]`); CI pipeline signs all platform artifacts and publishes `latest.json` updater manifest to GitHub Releases
  - Installer branding: window title set to "Sigil", publisher and copyright metadata, per-user NSIS install mode, fullscreen and maximize disabled on Windows
  - Accessibility: `aria-label` on all icon-only buttons, `aria-live="polite"` on status/error regions, `aria-hidden` on decorative icons, keyboard-triggered QR code reveal
  - Animated seed display: characters appear one by one with a 30 ms stagger on seed generation
  - Request popup now slides up as a bottom sheet with a drag handle and backdrop spacer

  **Fixes**

  - Biometric unlock: changed keyring key format from `"bio:{uuid}"` (colon breaks Windows Credential Manager) to a separate service `"sigil-bio"` with vault ID as username; added verify-after-store step so enable fails loudly instead of silently; split error handling so wrong-password and keyring-failure show distinct messages
  - SC call preview: amount row is now shown only when the contract call transfers QU; removed the misleading "Fee: None" row (contract fees are the dApp's responsibility to communicate)
  - Transfer and SC call approvals now block when the signer's balance is insufficient (`[INSUFFICIENT BALANCE]`) or a transfer is already pending confirmation (`[TRANSFER PENDING — WAIT FOR CONFIRMATION]`)
  - Connect screen copy clarifies that permissions are per-action approvals, not silent background grants
  - Appearance settings: increased spacing between sections for visual clarity
  - Clipboard watcher: removed dead code path, `should_clear` now called directly in the watcher loop
  - CI: release notes sourced from `CHANGELOG.md`; Rust toolchain bumped to 1.88.0 to satisfy updated dependency requirements (`darling`, `icu_*`, `image`, `plist`, `serde_with`, `time`, `zbus`)

## 0.3.0-beta.3

### Minor Changes

- e68f33b: Polish and request-screen improvements.

  **Features**

  - Directional page transitions (slide left/right based on route depth), balance counter animation, lock/unlock fade+scale animation
  - Request screen: account picker lets user choose signing account when dApp omits `from`; `from`-identity resolution validates the requested identity is in the active vault and shows an error if not
  - Deep-link with no vault → redirects to setup screen instead of crashing

  **Fixes**

  - Pending transactions now resolve against `getLastProcessedTick` (archive) instead of network tick, giving sub-second confirmation vs. up to 30s
  - 4-position seed-phrase spot-check replaces the previous 55-tap grid backup flow
  - Deep-link callback validator now accepts `http://localhost` and `http://127.0.0.1` for local development
  - Store IPC timeout raised to 1500 ms (safety net 3 s) to prevent hydration failures in debug builds
  - Settings screen gains a back button in the header
  - `window.__TAURI__` exposed globally for DevTools console testing (`withGlobalTauri: true`)
  - Updated app icons across all platforms and sizes

## 0.3.0-beta.2

### Minor Changes

- 0d7ab29: Add custom title bar replacing the OS native one. Includes drag region, minimize/maximize/close controls with hover states, and fullscreen prevention on Windows.

## 0.1.1-beta.1

### Patch Changes

- 2afdab3: Fix app stuck on loading screen in production builds caused by Tauri IPC not being ready when the store hydrates. Notifications now work correctly after store hydration is fixed. Replace the loading screen with a skeleton UI.

## 0.1.1-beta.0

### Patch Changes

- c10387e: Fix app stuck at [LOADING...] on production builds by making store hydration reactive. Rename installed binary to `sigil-wallet` to avoid conflict with the Sigil ebook editor on Debian/Kali systems.
