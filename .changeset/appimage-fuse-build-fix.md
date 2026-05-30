---
"sigil": patch
---

Fix AppImage failing to launch on systems without FUSE.

- **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.
