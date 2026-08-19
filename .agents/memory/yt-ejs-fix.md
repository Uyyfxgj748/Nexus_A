---
name: YouTube EJS solver & format fix
description: How to fix yt-dlp 2026+ "Requested format is not available" and bot-check errors on Replit IPs.
---

## Problem
yt-dlp 2026.06+ requires an External JavaScript (EJS) solver to generate YouTube PO tokens and resolve signatures. Without it, only storyboard images are available. When only storyboards exist, `--print` calls fail with "Requested format is not available" because yt-dlp still applies its default format selector before printing.

Additionally, Replit server IPs are flagged by YouTube ("Sign in to confirm you're not a bot"), requiring cookies for many videos.

## Fixes Applied

### 1. EJS solver: use `which node` path (not process.execPath)
`process.execPath` gives the raw Nix binary (`/nix/store/.../nodejs-20.20.0/bin/node`) which yt-dlp marks "unsupported". `which node` gives the **wrapped** Nix binary (`/nix/store/.../nodejs-20.20.0-wrapped/bin/node`) which yt-dlp recognizes and can use.

```js
const _nodePathForYtdlp = (() => {
    try { return require('child_process').execSync('which node', { encoding: 'utf8' }).trim(); }
    catch { return process.execPath; }
})();
const YT_EJS_FLAGS = [
    '--js-runtimes', `node:${_nodePathForYtdlp}`,
    '--remote-components', 'ejs:npm',
];
```

These flags are prepended to EVERY `ytdlpEjecutar` call in both `src/downloads.js` and `src/nsfwdownloads.js`.

**Note:** As of yt-dlp-ejs 0.8.0 on Replit, node 20.20.0 is still listed as "unsupported" in verbose. The EJS flags don't fully activate EJS on this environment. The workaround below is required.

### 2. Permissive format selector on --print calls
Add `-f "bestaudio/best/mhtml"` to ALL `--print`/metadata calls. This allows yt-dlp to select a storyboard if no video/audio is available, preventing the format-check crash while metadata (title, duration, etc.) is still printed correctly.

Applied in:
- `ytdlpBuscarUrl`: added to `baseArgs` alongside `ytsearch1:`
- `ytdlpInfo`: added to `printArgs` before `--print`

### 3. Cookies always passed on first attempt (not just as last resort)
When `tieneCookiesReales()` is true, cookies are now passed to the FIRST attempt in `ytdlpBuscarUrl` and `ytdlpInfo`. Previously they were only the last fallback. Passing cookies earlier bypasses bot-check on IPs that YouTube has flagged.

### 4. cookies.txt must have Netscape header
The file must start with `# Netscape HTTP Cookie File` — yt-dlp rejects it otherwise. If the header is missing, prepend it:
```bash
{ echo "# Netscape HTTP Cookie File"; cat cookies.txt; } > tmp && mv tmp cookies.txt
```

### 5. --concurrent-fragments ONLY in download functions
Never put `--concurrent-fragments` or `--buffer-size` in shared arg functions (ytYoutubeArgs etc.) — they are used for both info/search AND downloads. Put them only in `ytdlpDescargarBuffer` (via `YT_DOWNLOAD_SPEED_FLAGS`) and `cmdYoutubeAudio`.

**Why:** `--concurrent-fragments` with `--print` or `ytsearch:` causes "Requested format is not available" because yt-dlp tries to apply fragment settings to a metadata-only request.
