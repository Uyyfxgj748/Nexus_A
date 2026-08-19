---
name: Nexus-Bot WhatsApp pairing code expiry
description: Why the workflow shows "Sesión cerrada definitivamente" after import/setup, and how to get a fresh pairing code.
---

Baileys pairing codes printed on startup expire after a few minutes. If nobody
enters the code in WhatsApp > Linked devices in time, the next reconnect
attempt logs `Sesión cerrada definitivamente. Borra auth_info y reinicia.` and
the workflow exits — this is expected pairing-code expiry, not a code bug.

**How to apply:** delete the `auth_info/` folder (not `auth_info_subs/`,
which is for sub-bots) and restart the "Start application" workflow to get a
fresh pairing code. Don't chase this as an error in the app code.
