---
name: Gacha gate architecture
description: Why gacha commands need their own gate in index.js and what it must include
---

## The rule
index.js routes gacha commands (roll, claim, harem, etc.) to `manejarMensajePersonajes` separately from the main handler. Any restriction applied in `manejarMensaje` (handler.js) must be **explicitly replicated** in the gacha routing block in index.js, or those checks are silently bypassed.

## Gate order (both paths must match)
1. `chatHabilitado` — master gate; silent return for non-super-owners in disabled chats
2. `getBotActivo()` — global on/off
3. `getModoMantenimiento()` — maintenance mode
4. Per-group `botActivo` (#on/#off)
5. `soloAdmin` — only admins/owners in restricted groups
6. `esMuteadoBot` — silenced users

## Why
Before this fix, `manejarMensajePersonajes` only checked botActivo, modoMantenimiento, and per-group botActivo, but NOT chatHabilitado, soloAdmin, or mutebot. Users could use gacha commands in chats where the bot was disabled.

## How to apply
When adding new global restrictions to `manejarMensaje`, add the same check to the gacha routing block in index.js (around the `if (comandosPersonajes.includes(comandoBase))` branch).

**Key imports needed in index.js:** `isSuperOwner`, `resolverJid`, `esAdmin`, `esMuteadoBot` (in addition to the already-present isOwner, getGrupo, getBotActivo, etc.)
