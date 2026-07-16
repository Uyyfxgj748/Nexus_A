---
name: Sub-bots architecture
description: How Nexus-Bot's sub-bot linking system shares state with the main bot, and the permission/lifecycle decisions built around that constraint.
---

Nexus-Bot's per-chat settings (`chatHabilitado`, `botActivo`, mutebot, onlyadmin, etc.) live in one shared JSON store (`data/grupos.json`, via `src/database.js` `getGrupo`/`guardarGrupo`). Every socket — the main bot and every sub-bot — reads/writes the same document per group JID. There is no per-socket override.

**Why this matters:** a sub-bot cannot have independent "is this chat on?" state from the main bot in the same group. Toggling it from any socket (main or sub-bot) affects every bot present in that chat.

**How the feature is built around it:**
- `src/messageRouter.js` centralizes the gate (chatHabilitado, mantenimiento, onlyadmin, mutebot) so main-bot and sub-bot sockets can never diverge — a fix/gate change made in one place always applies to both.
- Since only `SUPER_OWNER` can normally flip `chatHabilitado` (`#activatebot`/`#desactivatebot`), sub-bot owners were locked out of ever activating their own groups. Fix: `sock.__esSubbot && msg.key.fromMe` is treated as an alternate permission for those two commands — a sub-bot can only activate/deactivate the exact chat its own session is currently posting in, never an arbitrary chat. No participant/dueño cross-checking needed because the message's origin already proves scope.
- `src/subbots.js` persists a `registros[numero]` map (dueñoJid, nombre, vinculadoEn, comandosEjecutados, ultimoComando/Uso) in `data/subbots.json` — used for the owner-only detailed `#subbots` listing and to prevent one requester from linking more than one sub-bot at a time (`getSubbotDeDueño`).
- Pairing codes are sent by DM to the requester (`chatId: senderJid`), never to the group where `#serbot` was typed, to avoid exposing the code to bystanders. A 3-minute expiry timer releases the slot if unused; reconnect retries cap at 5 attempts before giving up and DMing the owner.
