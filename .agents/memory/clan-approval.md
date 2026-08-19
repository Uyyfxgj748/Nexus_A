---
name: Clan approval system
description: Clan joins require leader approval by default; clan.abierto===true enables instant join.
---

## Rule
By default, `#joinguild` adds the requesting JID to `clan.solicitudes[]` and notifies the leader. Direct join only when `clan.abierto === true`.

**Why:** The original system had instant join with no consent from the clan leader, allowing anyone to join any clan with space available.

## How to apply
- New functions exported from `src/clanes.js`: `cmdVerSolicitudes`, `cmdGestionarSolicitud(sock, jid, senderJid, mencionados, aceptar: bool)`.
- New routing in `src/handler.js`: `guildaccept`, `guilddeny`, `guildpending`.
- To make a clan open (instant join): add `clan.abierto = true` via editclan or direct data edit.
- `clan.solicitudes` field is lazily initialized (undefined = no pending requests = closed clan).
