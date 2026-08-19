---
name: Nexus-Bot text-sticker rendering (#brat/#brat2/#brat3/#ttp/#attp/#qc/#wm)
description: How text-to-sticker and quote-card stickers are rendered with @napi-rs/canvas, how emoji are drawn, and how animated variants are encoded.
---

- `@napi-rs/canvas` is the canvas lib (no `canvas`/`jimp` was present before). Only system font available is `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`; register once via `GlobalFonts.registerFromPath(path, alias)` — repeated calls are harmless but guard with a module-level flag anyway.
- Animated webp frames are built by writing PNG frames to a tmp dir and piping them through the *same* `fluent-ffmpeg` module instance already configured (ffmpeg path set) by `sticker.js`. Requiring `./sticker` before touching ffmpeg avoids re-setting `ffmpeg.setFfmpegPath`.
- Animated webp frames use `-pix_fmt yuv420p` (no alpha) with a solid opaque background — animated libwebp with alpha (`yuva420p`) isn't reliably supported by the ffmpeg build here.
  **How to apply:** any future animated-sticker-from-canvas-frames feature should default to an opaque frame background unless alpha support is explicitly re-verified.
- `getUsuario(jid).pushName` (falls back to `.nombre`) is the established way to get a display name for a JID that isn't the current sender.
- **Color emoji in canvas**: `@napi-rs/canvas` renders Noto Color Emoji bitmaps fine once the font is registered under its own alias, drawn with mixed-font segments (split text into emoji vs. non-emoji runs via an Extended_Pictographic/ZWJ/regional-indicator regex, switch `ctx.font` per segment). `fillStyle` is ignored for color glyphs but must still be set for the non-emoji segments.
- The `noto-fonts-color-emoji` nix package doesn't land in `/usr/share/fonts` or any fontconfig-scanned dir — its real path lives at an unpredictable `/nix/store/<hash>-noto-fonts-color-emoji-<version>/share/fonts/noto/NotoColorEmoji.ttf`. Finding it via `find`/`ls /nix/store` times out (huge tree); instead query the store's own index: `sqlite3`-style read of `/nix/var/nix/db/db.sqlite`'s `ValidPaths` table (`select path from ValidPaths where path like '%emoji%'`) resolves it instantly.
  **Why:** avoids multi-minute blind filesystem walks; the nix store is indexed in that sqlite db.
  **How to apply:** once located, copy the font into the repo (e.g. `fonts/NotoColorEmoji.ttf`) rather than hardcoding the volatile store-hash path — the hash changes on rebuilds/version bumps but the repo copy is stable.
- Tight line-height (e.g. `fontSize * 1.05`, used for the plain-text `#brat`) works for a bold sans font alone, but breaks down once a line can contain emoji or any glyph whose real ascent+descent approaches a full em — lines visually overlap. Any new mixed text+emoji layout should use `lineHeight ≈ fontSize * 1.3` (or measure real font/emoji ascent+descent and size the line box to fit) instead of copying the tighter multiplier.
