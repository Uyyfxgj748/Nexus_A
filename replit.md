# Nexus-Bot

A comprehensive, multi-functional WhatsApp bot built with Node.js and the Baileys library.

## Features
- Economy system (NexCoins, banking, marketplace, clans)
- Gacha/waifu character collection
- Multimedia downloads (YouTube, TikTok, Instagram, Facebook, Pinterest)
- Mini-games and casino
- AI chatbot integration
- Group management (welcome/goodbye messages, anti-ban, moderation)
- Web dashboard at `/dashboard`

## How to run
The bot starts with `node index.js`. On first run (or after deleting `auth_info/`), it will prompt for a phone number to generate a pairing code for WhatsApp Web.

## Environment Variables
- `PHONE_NUMBER` — WhatsApp number (with country code, no `+` or spaces, e.g. `521234567890`). Set this to skip the terminal prompt.
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
