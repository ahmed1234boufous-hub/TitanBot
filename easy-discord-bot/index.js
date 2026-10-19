require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const commands = require('./modules');

const PREFIX = process.env.PREFIX || '!';
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.name, command);
}

const guildConfigs = new Map();
const warns = new Map();

function getGuildConfig(guildId) {
  if (!guildConfigs.has(guildId)) guildConfigs.set(guildId, { welcomeChannelId: null });
  return guildConfigs.get(guildId);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: `${PREFIX}help | easy bot`, type: 0 }], status: 'online' });
});

client.on('guildMemberAdd', async (member) => {
  const config = getGuildConfig(member.guild.id);
  if (!config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel || !channel.isTextBased()) return;
  const msg = `Welcome ${member.user} to **${member.guild.name}**!\nYou are member #${member.guild.memberCount}.`;
  channel.send({ content: msg }).catch(() => {});
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute({ client, message, args, guildConfigs, warns, prefix: PREFIX });
  } catch (error) {
    console.error('Command error:', error);
    message.reply({ content: 'There was an error while running that command.' }).catch(() => {});
  }
});

client.login(TOKEN);
