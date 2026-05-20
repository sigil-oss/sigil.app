# sigil

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
