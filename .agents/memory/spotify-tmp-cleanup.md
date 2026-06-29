---
name: Spotify download tmp cleanup pattern
description: How to properly clean up yt-dlp temp files in cmdSpotify (downloads.js)
---

## Rule
When yt-dlp writes `-o "${tmpBase}.%(ext)s"`, the final extension is unknown at call time. Use `limpiarTmpBase(tmpBase)` (defined inside `cmdSpotify`) which reads `os.tmpdir()` and deletes all files whose basename starts with the tmpBase suffix. Call it in **both** success and error paths.

**Why:** yt-dlp picks the extension based on what the container format ends up being. A hardcoded `.mp3` check misses cases where yt-dlp writes `.webm`, `.m4a`, `.opus`, etc., leaking temp files in `/tmp` across bot restarts.

**How to apply:** Any new yt-dlp download step in cmdSpotify (or similar multi-step download functions) must use limpiarTmpBase rather than a fixed-extension `fs.remove`.
