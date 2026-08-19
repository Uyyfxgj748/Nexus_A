---
name: yt-dlp audio function naming
description: Covers the 3 distinct ytYoutubeArgs* functions in src/downloads.js and why they exist
---

## Rule
`src/downloads.js` defines **three** separate ytdlp extractor-args helpers — keep them distinct:
- `ytYoutubeArgs()` — `android,web_safari` — for video downloads and search
- `ytYoutubeArgsAudio()` — `mweb,android` — primary audio client (more compatible with audio-only)
- `ytYoutubeArgsAudioVr()` — `android_vr,android` — fallback for audio when mweb fails

**Why:** All three functions existed as identical copies with the same name (`ytYoutubeArgs`) when the audit started. Only `ytYoutubeArgs()` was valid JS (last declaration wins). `ytYoutubeArgsAudio()` and `ytYoutubeArgsAudioVr()` were called from `#play`, `#mp3`, `#ytaudio`, `#tiktokmp3`, `#ttaudio`, and Spotify fallback but crashed with ReferenceError at runtime.

**How to apply:** Any time you touch downloads.js — never collapse these three into one function or rename them without updating all call sites.
