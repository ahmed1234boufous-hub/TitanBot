require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PREFIX = process.env.PREFIX || '!';
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Load commands from modules.js
const modules = require('./modules');
for (const cmd of modules.commands) {
  client.commands.set(cmd.name, cmd);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignore DMs

  const prefix = PREFIX;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute({ client, message, args });
  } catch (err) {
    console.error('Command error', err);
    message.reply('There was an error while executing that command.');
  }
});

// Simple welcome
client.on('guildMemberAdd', async (member) => {
  try {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    if (channelId) {
      const ch = member.guild.channels.cache.get(channelId);
      if (ch && ch.isTextBased()) ch.send({ content: `Welcome <@${member.id}> to **${member.guild.name}**!` });
    }
  } catch (e) {
    console.warn('Welcome handler error', e);
  }
});

client.login(TOKEN);
