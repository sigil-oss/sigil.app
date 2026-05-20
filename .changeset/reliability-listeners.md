---
"sigil": patch
---

Fix async unlisten race in useAutoLock and TitleBar where a fast unmount before the listen() promise resolved would leave a dangling event listener; expand shorthand 3-char hex (#abc) correctly in custom color scheme math
