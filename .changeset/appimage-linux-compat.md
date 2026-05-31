---
"sigil": patch
---

Fix AppImage failing to launch on Linux.

- **Linux:** The AppImage now runs without FUSE by using the go-appimage toolchain, which embeds a FUSE-free runtime.
- **Linux:** Fixed a startup crash caused by bundled `libmount` being too old for the system's `libgio`.
- **Linux:** Fixed a startup abort (`EGL_BAD_PARAMETER`) on systems where the EGL platform is incompatible with the bundled WebKitGTK.
