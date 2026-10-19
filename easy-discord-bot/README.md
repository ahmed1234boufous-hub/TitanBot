# Easy Discord Bot

A small, original Discord bot designed for easy hosting on Railway.

Features included
- Moderation: warn, kick, ban, unban, mute, unmute, purge, slowmode, lock, unlock
- Utility: help, ping, info, user, avatar, server icon, welcome channel, uptime
- Fun: coinflip, roll, 8ball, choose, rock-paper-scissors, poll
- Misc: say, embed, role assignment, ticket creation

Quick start
1. Open the `easy-discord-bot` folder.
2. Copy `.env.example` to `.env` and fill in your values.
3. Run:
   npm install
   npm start

Environment variables
- DISCORD_TOKEN
- PREFIX (optional, default: !)
- OWNER_ID (optional)
- WELCOME_CHANNEL_ID (optional)

Railway
- Set `DISCORD_TOKEN` in Railway environment variables.
- Keep `npm start` as the start command.

Notes
- This project is original and compact.
- It is built for easy deployment and quick editing.
