require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
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
      levelUpChannelId: null,
      levelUpEmbed: false,
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
  const msg = `Welcome ${member.user} to **${member.guild.name}**!\nYou are member #${member.guild.memberCount}.`;

  if (config.welcomeEmbed) {
    const embed = new EmbedBuilder().setColor('#00b894').setDescription(msg);
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
    console.error('Command error:', error);
    message.reply({ content: 'There was an error while running that command.' }).catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) return;

  try {
    if (interaction.isButton()) {
      const [type, guildId] = interaction.customId.split(':');

      if (type === 'toggle_welcome') {
        if (OWNER_ID !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
          return interaction.reply({ content: 'You do not have permission to toggle the welcome embed.', ephemeral: true });
        }

        const config = getGuildConfig(guildId || interaction.guild.id);
        config.welcomeEmbed = !config.welcomeEmbed;
        guildConfigs.set(interaction.guild.id, config);
        return interaction.reply({ content: `Welcome embed is now **${config.welcomeEmbed ? 'enabled' : 'disabled'}**.`, ephemeral: true });
      }

      if (type === 'toggle_levelup') {
        if (OWNER_ID !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
          return interaction.reply({ content: 'You do not have permission to toggle the level-up embed.', ephemeral: true });
        }

        const config = getGuildConfig(guildId || interaction.guild.id);
        config.levelUpEmbed = !config.levelUpEmbed;
        guildConfigs.set(interaction.guild.id, config);
        return interaction.reply({ content: `Level-up embed is now **${config.levelUpEmbed ? 'enabled' : 'disabled'}**.`, ephemeral: true });
      }

      if (type === 'mod_edit') {
        const action = interaction.customId.split(':')[1];
        const config = getGuildConfig(interaction.guild.id);
        const template = config.moderationTemplates[action] || { useEmbed: false, content: '' };

        const modal = new ModalBuilder()
          .setCustomId(`mod_modal:${action}`)
          .setTitle(`Edit ${action} message`);

        const contentInput = new TextInputBuilder()
          .setCustomId('messageText')
          .setLabel('Message template')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Use {user}, {userTag}, {moderator}, {reason}, {duration}')
          .setRequired(true)
          .setValue(template.content || '');

        const embedInput = new TextInputBuilder()
          .setCustomId('embedToggle')
          .setLabel('Use embed? (true/false)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('true or false')
          .setRequired(true)
          .setValue(String(Boolean(template.useEmbed)));

        modal.addComponents(
          new ActionRowBuilder().addComponents(contentInput),
          new ActionRowBuilder().addComponents(embedInput)
        );

        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      const [kind, action] = interaction.customId.split(':');
      if (kind === 'mod_modal') {
        const config = getGuildConfig(interaction.guild.id);
        if (!config.moderationTemplates) config.moderationTemplates = {};

        config.moderationTemplates[action] = {
          useEmbed: String(interaction.fields.getTextInputValue('embedToggle')).toLowerCase() === 'true',
          content: interaction.fields.getTextInputValue('messageText')
        };

        guildConfigs.set(interaction.guild.id, config);
        return interaction.reply({ content: `Saved the **${action}** moderation template.`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    if (interaction && !interaction.replied) {
      interaction.reply({ content: 'There was an error processing this interaction.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
