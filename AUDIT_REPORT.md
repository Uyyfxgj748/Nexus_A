# Nexus-Bot Full Codebase Audit Report
**Date:** 2026-06-05  
**Scope:** Complete autonomous review of all source modules

---

## Executive Summary

Six bugs were identified and fixed during this audit. One was **critical** (crashing several of the most-used download commands with a `ReferenceError` at runtime). The rest were medium-severity issues affecting temp-file cleanup, data persistence efficiency, and security.

---

## Module-by-Module Findings

### `src/downloads.js` (1 614 lines)

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **CRITICAL** | `ytYoutubeArgsAudio()` and `ytYoutubeArgsAudioVr()` were called from `#play`, `#mp3`, `#ytaudio`, `#tiktokmp3`, `#ttaudio`, and the Spotify YouTube-fallback path, but never defined. Three duplicate `ytYoutubeArgs()` declarations existed (last one wins in JS). Both call sites threw `ReferenceError` at runtime, silently killing those commands. | **FIXED** — renamed each function with correct `--extractor-args`: `ytYoutubeArgs()` → `android,web_safari` (video/search); `ytYoutubeArgsAudio()` → `mweb,android` (primary audio); `ytYoutubeArgsAudioVr()` → `android_vr,android` (audio fallback). |
| 2 | Medium | Spotify step 2: `ytdlpEjecutar()` returns `{ stdout, stderr }`. The returned value was passed directly to `JSON.parse()` as an object instead of the `stdout` string. `JSON.parse({})` gives `null`, causing silent metadata loss for every Spotify download that lacked cookies. | **FIXED** — destructured `{ stdout: infoStdout }` before parsing. |
| 3 | Medium | Spotify steps 1 & 4: yt-dlp writes to `%(ext)s` (unknown extension at call time). The cleanup code only deleted the hardcoded `.mp3` path. Files with `.m4a`, `.webm`, `.opus`, or `.ogg` extensions were leaked to `/tmp` permanently. | **FIXED** — added `limpiarTmpBase(tmpBase)` helper that reads `os.tmpdir()` and deletes all files whose basename starts with the tmpBase prefix; called on both success and error paths. |
| 4 | Medium | SoundCloud (`cmdSoundcloud`): `tmpBase` / `tmpMp3` were declared inside `try`, making them out of scope in `catch`. The error path would throw a second `ReferenceError` masking the original error and preventing the user-facing error message. | **FIXED** — hoisted declarations before `try`; moved cleanup to `finally` block so it runs on both success and failure. |

### `src/owners.js`

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 5 | Medium | `cargarOwners()` performed a synchronous disk read on every single incoming message/command (called from `isOwner()` and `isSuperOwner()`). On bots with high message volume this caused unnecessary I/O on every event loop tick. | **FIXED** — added `_ownersCache` in-memory cache; `guardarOwners()` updates the cache on write so it stays consistent. |

### `src/dashboard.js`

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 6 | Medium | The `/dashboard` HTTP endpoint had no authentication. Anyone who discovered the URL could view bot stats, active economy events, error logs (which may contain partial user JIDs), and backup filenames. | **FIXED** — added optional HTTP Basic Auth gated on `DASHBOARD_PASSWORD` environment variable. If the variable is not set the dashboard remains open (opt-in, backward compatible). |

---

## Modules Audited — No Critical Issues Found

| Module | Lines | Notes |
|--------|-------|-------|
| `src/handler.js` | 1 959 | Global cooldown + antispam Maps have proper TTL-based expiry in both handler and botState cleanup intervals. Owner bypass logic uses `resolverJid()` correctly. |
| `src/database.js` | — | In-memory cache with 5 s flush interval; immediate flush on `guardarUsuario/guardarGrupo`. `flushToDisk` hooked to `SIGINT`/`SIGTERM`/`exit`. |
| `src/botState.js` | — | `antispam` Map cleared via 15-min `setInterval`; `cmdStats` cleared hourly. No unbounded growth. |
| `src/economy.js` | 1 141 | `parseInt` calls all validated with `isNaN`/`<= 0` guards. Steal two-user state is safe (Node single-threaded async). |
| `src/casino.js` | — | Bet bounds validated before any coin mutation. |
| `src/banco.js` | — | Deposit/withdraw bounded by user balance. |
| `src/minijuegos.js` | 2 259 | All 6 game types guard against double-start via `partidas.has(jid)`. All timeouts store reference and call `clearTimeout` + `partidas.delete` on win/lose/expire. No Map leak. |
| `src/ai.js` | — | `historial` Map capped at 14 entries (7 exchanges) per user via `splice(0,2)`. |
| `src/interactions.js` | 4 426 | `convertirParaGifPlayback` uses `finally` for tmp cleanup. `SFW_URL_HISTORY` bounded at 30 per endpoint via `shift()`. `NSFW_LRU` bounded at `NSFW_LRU_MAX = 80` per tag. |
| `src/sticker.js` | — | Both success and error paths clean up tmp files via `.catch(()=>{})` guards. |
| `src/utils.js` | — | GIF/video conversion uses `finally { fs.remove }` pattern. |
| `src/nsfwdownloads.js` | 365 | `ytdlpDescargarVideo` callers (`cmdXnxx`, `cmdPornhub`) wrap in try/catch. Minor: no `finally` cleanup in `ytdlpDescargarVideo` itself if ytdlp throws before writing — low impact since ytdlp cleans partial downloads internally. |
| `src/cooldowns.js` | — | Central cooldown table. Note: `steal` value here (15 min) differs from hardcoded value in `economy.js` (20 min); see residual risks. |
| `src/admin.js` | 1 412 | No critical issues. Temp-ban/modlog mutations all properly persisted. |
| `src/personajes.js` | — | Gacha rolls and harem operations are owner-aware via `isSuperOwner()`. |
| `src/extras.js` | — | Event scheduler uses `clearTimeout`/`clearInterval` guards before re-registering. |
| `src/mercado.js` | 303 | Offers expire by timestamp check at query time; no active cleanup interval needed. |
| `src/misiones.js` | 226 | Mission progress mutations guarded by user-object checks. |
| `src/logros.js` | 354 | Achievement unlock logic idempotent (checks before adding). |
| `src/items.js` | 483 | Item activation/expiry uses `Date.now()` comparisons correctly. |
| `src/clanes.js` | — | Clan operations all persist via `guardarClanes`. |
| `src/backup.js` | 70 | Hourly backup via `setInterval`; keeps last N files by mtime sort. |
| `src/logger.js` | 85 | Append-only file log; `getRecentLogs` returns last N lines. |
| `src/lidResolver.js` | — | @lid → @s.whatsapp.net resolution via `contacts.upsert` event map. |
| `src/ytdlpUpdater.js` | 79 | Auto-update on startup; version check before download. |

---

## Residual Risks (Not Fixed — Lower Priority)

| Risk | Impact | Recommendation |
|------|--------|----------------|
| `steal` cooldown mismatch: `cooldowns.js` = 15 min; `economy.js` hardcodes 20 min | Display inconsistency if a `#cooldowns` command reads from `cooldowns.js` | Unify: have `economy.js` read from `COOLDOWNS.steal` |
| `ytdlpDescargarVideo` in `nsfwdownloads.js` has no `finally` cleanup | Rare orphaned tmp file if ytdlp throws before writing | Wrap in try/finally using `limpiarTmpBase` pattern |
| Dashboard auth is opt-in (requires setting `DASHBOARD_PASSWORD`) | Open to anyone who finds the URL if env var not set | Set `DASHBOARD_PASSWORD` in Replit Secrets |
| `SFW_URL_HISTORY` Map has no per-endpoint key count limit | If thousands of unique endpoints were added (unrealistic), Map grows unboundedly | Acceptable in practice; ~20 known endpoints |

---

## Verification

- All edited files pass `node --check` (zero syntax errors).
- Bot restarted and ran continuously for 80+ minutes with zero crashes in logs.
- Backup scheduler, keep-alive ping, and reconnect logic all confirmed healthy in workflow logs.

---

## Files Modified

| File | Change |
|------|--------|
| `src/downloads.js` | Fixed ytYoutubeArgsAudio/Vr, Spotify JSON parse, Spotify tmp cleanup, SoundCloud scope+finally |
| `src/owners.js` | Added _ownersCache in-memory cache |
| `src/dashboard.js` | Added optional HTTP Basic Auth |
| `.gitignore` | Added all runtime data files (users.json, grupos.json, etc.) to prevent accidental commits |
