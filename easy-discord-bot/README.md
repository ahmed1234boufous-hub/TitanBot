Easy Discord Bot (original)

This is a small, original Discord bot designed for simple hosting (Railway, Heroku, etc.). It is NOT copied from any other project — features are implemented in a compact way so you can run it quickly.

Quick start

1. Copy the files to your project or clone this repo.
2. Create an environment variable DISCORD_TOKEN with your bot token.
3. (Optional) Set PREFIX (default is `!`) and OWNER_ID.
4. Run:
   - npm install
   - npm start

Railway

- Add the project, set the DISCORD_TOKEN env var in Railway dashboard, and the default start command (npm start) will run the bot.

Files
- index.js — entrypoint and handlers
- modules.js — command definitions
- package.json — start script and deps

Notes
- This bot uses discord.js v14; ensure your Node version is compatible (>=16).
- Extend commands in modules.js. Keep secrets out of source by using environment variables.
