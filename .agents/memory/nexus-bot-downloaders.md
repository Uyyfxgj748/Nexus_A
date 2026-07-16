---
name: Nexus-Bot downloader command conventions
description: What a new #cmd download feature needs to be wired consistently in Nexus-Bot (menu, cooldown weight, cookies).
---

Adding a new download command (`#foo`) touches 4 places:
- `src/downloads.js` — implement `cmdFoo(sock, jid, args)`, send a "Procesando..." message, capture its key, `editar()` helper to update it, `logRequestError()` on failures, export the function.
- `src/handler.js` — destructure the new export from `require('./downloads')`, add a `case 'foo':` in the big switch.
- `src/antiban.js` — add the command name(s) to `HEAVY_CMDS` so it's rate-limited like other downloads.
- `src/menu.js` — document it under the Descargas/Multimedia section using the `> ` gray-description convention (never `│`, which doesn't render gray in WhatsApp).

**Why:** this is the pattern every existing downloader (mediafire, spotify, drive, etc.) already follows; skipping a step means the command works but isn't rate-limited or isn't discoverable.

Platform-specific notes learned while adding #mega/#terabox/#gitclone/#dl:
- **Mega.nz**: public file links are self-contained (decryption key in the URL fragment) — the `megajs` npm package's `File.fromURL(url).loadAttributes()` + `downloadBuffer()` works with no auth needed. Folder links (`/folder/`) aren't supported by this simple approach.
- **GitHub repo download**: no API/library needed — `https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}` is a direct authenticated-free zip endpoint. Fetch `default_branch` from `api.github.com/repos/{owner}/{repo}` first if the branch isn't specified.
- **Terabox**: unlike Mega, Terabox's `shorturlinfo`/`share/download` endpoints require an authenticated session cookie (`ndus`) even for "public" share links — there's no working anonymous scrape or free third-party API for it (tried siputzx/dorratz/agatz/vreden/nekorinn/ryzendesu — all dead or 404 for terabox/mega routes as of July 2026). Implemented with the same `cookies/*.txt` Netscape-format pattern as Spotify/MediaFire; degrades to a clear "ask the owner to configure cookies/terabox.txt" message when missing, rather than silently failing.
- Third-party "free downloader API" aggregators (siputzx.my.id, dorratz.com, agatz.xyz, vreden.my.id, nekorinn.my.id, ryzendesu.vip) are unreliable/short-lived — verify with a live curl before relying on one for a new command; don't assume they still work just because older code in this repo uses them.
