# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coolify — a German HVAC/climate technology business website with a Telegram-connected live chat and bilingual (DE/EN) support.

## Running the Project

```powershell
# Install dependencies (first time)
npm install

# Start the server (serves website + Telegram bridge on http://localhost:3000)
npm start
```

Opening `index.html` directly in a browser works for the static UI only. The Telegram chat bridge and `/api/contact` endpoint require `npm start`.

## Architecture

This is a **two-layer project**:

### 1. Static Frontend — `index.html`

Single self-contained HTML file (~62KB). No build step, no framework, no bundler.

- All CSS is inline in `<style>` at the top of the file
- All JavaScript is inline in `<script>` at the bottom of the file
- **Internationalization**: A plain JS object `T` holds all DE/EN strings keyed by `data-i18n` attributes. Call `setLang('de'|'en')` to switch.
- **Chatbot**: Keyword-matching engine in `getReply()` uses the `BOT` object. Falls back to predefined answers when the Socket.io server is not running.
- **Socket.io client**: Loaded from `/socket.io/socket.io.js` (served by the Express server). If the server is not running, the `<script>` tag silently 404s and the chatbot operates in standalone mode.

### 2. Express + Socket.io Backend — `server.js`

Serves the static file and bridges two real-time channels:

| Route / Event | Direction | Purpose |
|---|---|---|
| `POST /api/contact` | Website → Telegram | Contact form submissions forwarded to owner |
| Socket event `visitor_msg` | Website → Telegram | Live chat message from visitor |
| Socket event `owner_reply` | Telegram → Website | Reply routed back to visitor's browser tab |
| Telegram `/start` command | Telegram → console | Prints owner's chat ID for `.env` setup |

**Session tracking**: Two in-memory Maps connect Telegram message IDs to Socket.io session IDs. Sessions are lost on server restart — active chats are terminated.

### Environment — `.env`

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API token (bot username: `@Coolifiybot`) |
| `TELEGRAM_OWNER_CHAT_ID` | Telegram chat ID of the business owner (send `/start` to the bot to retrieve it) |
| `PORT` | HTTP port (default `3000`) |

## Brand Colors (from `Coolify_Brandguide.pdf`)

| Role | Hex |
|---|---|
| Primary blue | `#0252A1` |
| Light blue | `#45A9F2` |
| Indigo | `#2D3A9A` |
| Orange accent / CTA | `#F37D4B` |

CSS custom properties are defined at the top of the `<style>` block in `index.html` under `:root`.

## Key Customization Points

- **Contact email / phone**: Search `darvish.amir@gmx.de` and `017612345678` in `index.html` to update.
- **Telegram bot link**: The `openTelegram()` function hardcodes `https://t.me/Coolifiybot`.
- **Chatbot responses**: Edit the `BOT` object (near the bottom `<script>`), one entry per service topic in both `de` and `en`.
- **Translations**: Edit the `T` object in the same script block.
- **Gallery images**: Replace the `.showcase-img-placeholder` divs with real `<img>` tags.
