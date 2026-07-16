# Nexus-Bot

A comprehensive, multi-functional WhatsApp bot built with Node.js and the Baileys library.

## Features
- Economy system (NexCoins, banking, marketplace, clans)
- Gacha/waifu character collection
- Multimedia downloads (YouTube, TikTok, Instagram, Facebook, Pinterest)
- Mini-games and casino, including a 16×16 word-search game (`#sopa`)
- 25 FFmpeg audio effects applied to quoted audio/voice notes (`#deep`, `#echo`, `#chorus`, `#radio`, `#demon`, etc. — see `src/audioefectos.js`)
- Emoji Kitchen mixing (`#emojimix`), temporary disposable email (`#tempmail`), WhatsApp group link inspection without joining (`#inspect`), Shazam-style song identification (`#shazam`), manga lookup (`#manga`), npm package search (`#npmjs`)
- AI chatbot integration
- Group management (welcome/goodbye messages, anti-ban, moderation)
- Web dashboard at `/dashboard`

## How to run
The bot starts with `node index.js` (bound to the "Start application" workflow, `PORT=5000 node index.js`). Dependencies are installed via `npm install`. The web dashboard and keep-alive server come up immediately; the WhatsApp connection needs to be linked via a pairing code printed in the workflow console (WhatsApp > Linked devices > Link with phone number). `PHONE_NUMBER` is already set. If the printed code expires before you link it (codes are time-limited), delete the `auth_info/` folder and restart the workflow to get a fresh one.

## Environment Variables
- `PHONE_NUMBER` — WhatsApp number (with country code, no `+` or spaces) used to request the pairing code. Already set.
- `DASHBOARD_PASSWORD` — Optional password to protect the web dashboard (HTTP Basic Auth).
- `KAIZ_API_KEY` — API key for Kaiz GPT-4o fallback AI endpoint.
- `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET` — For Pinterest OAuth (optional).
- `PIXIV_REFRESH_TOKEN` — For Pixiv image search (optional).

## Data
All persistent data is stored as JSON files in `data/`. Backups are created hourly in `backups/`.

## Web Panel
The dashboard is available at `/dashboard` (or `/panel`). It shows bot status, uptime, economy stats, recent logs, and active marketplace listings.

## User preferences
- Spanish is the primary language used in bot messages and command responses.
