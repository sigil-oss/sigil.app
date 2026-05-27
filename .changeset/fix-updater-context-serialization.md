---
"sigil": patch
---

Fix updater context fields being undefined in TypeScript

The Rust `UpdaterContext` struct used `#[serde(rename_all = "snake_case")]`, which serialized `packageKind` as `package_kind` and `supportsAutoUpdate` as `supports_auto_update`. The TypeScript interface expected camelCase, so both fields read as `undefined`. This caused the updater to exit early without checking for updates, and diagnostics to show `—` for package kind and auto-update support. Changed to `#[serde(rename_all = "camelCase")]`.
