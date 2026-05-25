# 🚨 Discord Moderation & Network Bot

A full-featured Discord moderation system built with **Discord.js v14**, supporting advanced moderation tools, ad detection, strikes, jail system, network-wide bans, and a request/approval workflow between servers.

---

## ✨ Features

### 🛡️ Moderation System
- `/warn` – Issue user warnings
- `/ad-warn` – Advertise detection + optional message deletion
- `/strike` – Issue strikes with auto fire system (3 strikes = removal)
- `/mute` / `/unmute` – Temporary mutes with duration system
- `/ban` – Standard server bans
- `/fire` – Remove staff roles + ban user
- `/jail` / `/unjail` – Role isolation system

---

### 🌐 Network System (Multi-Server)
- `/network-ban` – Ban user across all connected servers
- `/network-unban` – Remove bans across network
- Cross-server request system:
  - Ban Requests
  - Blacklist Requests
  - Network Ban Requests
  - Partnership Requests

---

### 📊 Logging System
All moderation actions are automatically logged:
- Warn logs
- Strike logs
- Ad-warn logs
- General moderation logs
- Request approval logs

Logs are routed using configurable channel IDs in your database.

---

### 📩 Request Approval System
Staff can submit requests that require admin approval:
- Accept / Deny buttons
- Logs forwarded to hub server (if configured)
- Action automatically executed on approval:
  - Ban users
  - Blacklist users
  - Network-wide bans

---

### 🧠 Utility Features
- Message counting + leaderboard
- Case tracking system
- Snipe system (deleted messages)
- Balance system (coins)
- Staff break system
- Jail role restoration system
- Warning & strike leaderboards

---

## ⚙️ Setup

### 1. Install Dependencies
```bash
npm install discord.js