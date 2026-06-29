---
name: Trade consent flow
description: #trade requires 2-step consent; new commands registered in index.js for gacha routing.
---

## Rule
`#trade` creates a pending proposal in `pendingTrades` Map (3-min expiry). The target must call `#accepttrade` to execute. Either party can call `#canceltrade`.

**Why:** Previously trade was instant and unilateral — attacker could force any swap without victim's consent.

## How to apply
- New gacha commands must be added to `comandosPersonajes` array in `index.js` to route to `manejarMensajePersonajes`.
- Pending state uses `Map<${groupId}:${targetJid}, { senderJid, miNombre, suNombre, timestamp }>`.
- Validations: character must not be in sale (ventasGrupo), both sides validated at proposal time AND again at acceptance.
