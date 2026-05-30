---
"sigil": patch
---

Improve Linux packaging and notification reliability.

- **Linux:** AppImage now runs on systems without FUSE installed — uses a fallback runtime that extracts to a temp directory when FUSE is unavailable.
- **Linux:** Desktop notifications on AppImage now show an accurate hint explaining that the app icon won't appear in toasts until the AppImage is integrated with the desktop, instead of a misleading warning shown to all Linux users including those on deb/rpm.
- **Linux:** Deep-link handling (`sigil://` scheme) now registers correctly on deb and rpm installs.
- **UX:** App icon launches now show a loading cursor on Linux desktops that support startup notification.
