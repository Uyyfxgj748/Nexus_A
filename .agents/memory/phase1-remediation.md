---
name: Phase 1 remediation decisions
description: Durable architectural decisions made during Phase 1 security/stability fixes for Nexus Bot.
---

## DB flush pattern (database.js)
`guardarUsuario()` and `guardarGrupo()` no longer call `flushToDisk()` directly.
All disk writes go through `setInterval(flushToDisk, 2000)` + process signal handlers.
`guardarUsuarios()` and `guardarGrupos()` also only mark dirty; no inline writeJsonSync.

**Why:** The direct `flushToDisk()` call blocked the Node.js event loop on every user save (316KB JSON). With FLUSH_INTERVAL=2000ms and SIGTERM/SIGINT handlers, the 2s data-loss window is acceptable.

**How to apply:** If adding new bulk save functions, always mark dirty + rely on the interval. Never call `flushToDisk()` directly from command handlers.

## SUPER_OWNER env var (owners.js)
`SUPER_OWNER` is now read from `process.env.SUPER_OWNER_JID` (set to `573237069673` in shared env).
All guards in owners.js use `if (SUPER_OWNER && ...)` to handle the unconfigured case gracefully.

**Why:** Hardcoded phone number in source code is a privacy risk.

## JACKPOT_POOL persistence (casino.js)
JACKPOT_POOL loads from `data/casino.json` at startup via `_cargarJackpot()`.
`persistirJackpot()` is called after every JACKPOT_POOL.monto modification (accumulation and reset).

**Why:** The in-memory JACKPOT_POOL was lost on every bot restart.

## Dead dependencies removed
`ytdl-core` and `yt-search` were removed via npm. Both had 0 imports in the entire codebase.
`ytdl-core` had unpatched CVEs.

## Blackjack shuffle (casino.js)
Replaced `b.sort(() => Math.random() - 0.5)` with Fisher-Yates shuffle.
Fisher-Yates is at the top of `crearBaraja()` with a comment.

## AI key (ai.js:165)
Hardcoded Kaiz API key `cf2ca612-296f-40d4-8af0-9b00131c1bb7` replaced with `process.env.KAIZ_API_KEY || ''`.
If KAIZ_API_KEY is not set, the Kaiz provider fails gracefully to the next one in the chain.
