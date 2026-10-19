const { Client, GatewayIntentBits, Partials, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, EmbedBuilder } = require('discord.js');
const commands = require('./modules');

const PREFIX = process.env.PREFIX || '!';
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

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
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {
      welcomeChannelId: null,
      welcomeEmbed: false,
      welcomeMessage: `Welcome to **{guildName}**!\nYou are member #{count}.`,
      welcomeImage: null,
      levelUpChannelId: null,
      levelUpEmbed: false,
      levelUpMessage: '{user} has leveled up to level {level}!',
      levelUpImage: null,
      moderationTemplates: {
        timeout: { useEmbed: false, content: 'Timed out {userTag} for {duration} minutes. Reason: {reason}' },
        warn: { useEmbed: false, content: 'Warned {userTag}. Reason: {reason}' },
        ban: { useEmbed: false, content: 'Banned {userTag}. Reason: {reason}' },
        kick: { useEmbed: false, content: 'Kicked {userTag}. Reason: {reason}' },
        unban: { useEmbed: false, content: 'Unbanned user ID {user}.' },
        unmute: { useEmbed: false, content: 'Unmuted {userTag}.' }
      }
    });
  }
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

  const msg = (config.welcomeMessage || `Welcome ${member.user} to **${member.guild.name}**!\nYou are member #${member.guild.memberCount}.`)
    .replace(/\{user\}/gi, member.user.tag)
    .replace(/\{userName\}/gi, member.user.username)
    .replace(/\{server\}/gi, member.guild.name)
    .replace(/\{guild\}/gi, member.guild.name)
    .replace(/\{count\}/gi, member.guild.memberCount)
    .replace(/\{guildName\}/gi, member.guild.name);

  if (config.welcomeEmbed) {
    const embed = new EmbedBuilder()
      .setColor('#00b894')
      .setTitle('🎉 Welcome!')
      .setDescription(msg)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 4096 }))
      .setTimestamp();

    if (config.welcomeImage) {
      embed.setImage(config.welcomeImage);
    }

    channel.send({ embeds: [embed] }).catch(() => {});
  } else {
    channel.send({ content: msg }).catch(() => {});
  }
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
    await command.execute({ client, message, args, guildConfigs, warns, prefix: PREFIX, getGuildConfig });
  } catch (error) {
    console.error(`Error running command ${commandName}:`, error);
    message.reply({ content: 'An error occurred while executing that command.' }).catch(() => {});
  }
});

client.login(TOKEN).catch((err) => {
  console.error('Failed to login to Discord:', err);
  process.exit(1);
});
