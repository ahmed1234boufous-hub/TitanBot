import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { getModerationEmbedConfig } from '../../utils/moderationEmbeds.js';

const MODERATION_ACTIONS = {
  timeout: 'Timeout',
  untimeout: 'Untimeout',
  warn: 'Warn',
  ban: 'Ban',
  unban: 'Unban',
  kick: 'Kick',
};

function buildActionChoices() {
  return Object.entries(MODERATION_ACTIONS).map(([value, label]) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setDescription(`Edit the ${label.toLowerCase()} success embed`)
      .setValue(value)
  );
}

function buildDashboardEmbed(guildConfig, guild) {
  const moderationEmbeds = guildConfig?.moderationEmbeds || {};
  const fields = Object.entries(MODERATION_ACTIONS).map(([key, label]) => ({
    name: label,
    value: moderationEmbeds[key] ? 'Customized' : 'Default',
    inline: true,
  }));

  return new EmbedBuilder()
    .setTitle('🛡️ Moderation Embed Dashboard')
    .setDescription(`Edit the embed templates used when moderation commands run in **${guild.name}**.`)
    .setColor(0x5865F2)
    .addFields(fields)
    .setFooter({ text: 'Use the menu below to edit a moderation embed.' });
}

export default {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Manage moderation command embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('dashboard')
        .setDescription('Open the moderation embed dashboard')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit one moderation embed template')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Which moderation action to edit')
            .setRequired(true)
            .addChoices(...Object.entries(MODERATION_ACTIONS).map(([value, label]) => ({ name: label, value })))
        )
    ),
  category: 'moderation',

  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to manage moderation embeds.' });
    }

    const guildConfig = await getGuildConfig(client, interaction.guildId);

    if (subcommand === 'edit') {
      const action = interaction.options.getString('action');
      return await openEmbedEditor(interaction, guildConfig, client, action);
    }

    if (subcommand === 'dashboard' || !subcommand) {
      return await openDashboard(interaction, guildConfig, client);
    }
  },
};

async function openDashboard(interaction, guildConfig, client) {
  await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`mod_embed_select_${interaction.guildId}`)
    .setPlaceholder('Select a moderation action to edit...')
    .addOptions(buildActionChoices());

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [buildDashboardEmbed(guildConfig, interaction.guild)],
    components: [new ActionRowBuilder().addComponents(selectMenu)],
  });

  const collector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 300000,
    filter: i => i.user.id === interaction.user.id && i.customId === `mod_embed_select_${interaction.guildId}`,
  });

  collector.on('collect', async selectInteraction => {
    try {
      await selectInteraction.deferUpdate();
      const selectedAction = selectInteraction.values[0];
      await openEmbedEditor(selectInteraction, guildConfig, client, selectedAction);
    } catch (error) {
      logger.error('Error opening moderation embed editor:', error);
    }
  });
}

async function openEmbedEditor(interaction, guildConfig, client, action) {
  const current = getModerationEmbedConfig(guildConfig, action);
  const modal = new ModalBuilder()
    .setCustomId(`mod_embed_modal_${interaction.guildId}_${action}`)
    .setTitle(`Edit ${MODERATION_ACTIONS[action]} Embed`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(current.title || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description (supports {target}, {moderator}, {reason}, {duration}, {caseId}, {totalWarns})')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue(current.description || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(current.footer || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Color (hex, e.g. #5865F2)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(typeof current.color === 'string' ? current.color : '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel('Image URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(typeof current.image === 'string' ? current.image : '')
      )
    );

  await interaction.showModal(modal);

  const submitted = await interaction.awaitModalSubmit({
    filter: i => i.customId === `mod_embed_modal_${interaction.guildId}_${action}` && i.user.id === interaction.user.id,
    time: 120000,
  }).catch(() => null);

  if (!submitted) return;

  const title = submitted.fields.getTextInputValue('title').trim();
  const description = submitted.fields.getTextInputValue('description').trim();
  const footer = submitted.fields.getTextInputValue('footer').trim();
  const color = submitted.fields.getTextInputValue('color').trim();
  const imageUrl = submitted.fields.getTextInputValue('image').trim();

  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('bad protocol');
      }
    } catch {
      await repliedWithError(submitted, 'Please provide a valid image URL starting with http:// or https://.');
      return;
    }
  }

  const guildConfigUpdated = { ...(guildConfig || {}) };
  guildConfigUpdated.moderationEmbeds = { ...(guildConfigUpdated.moderationEmbeds || {}) };
  guildConfigUpdated.moderationEmbeds[action] = {
    title: title || undefined,
    description: description || undefined,
    footer: footer || undefined,
    color: color || undefined,
    image: imageUrl || undefined,
  };

  await setGuildConfig(client, interaction.guildId, guildConfigUpdated);

  await submitted.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Moderation Embed Updated')
        .setDescription(`The **${MODERATION_ACTIONS[action]}** embed template has been saved.`)
        .setColor(0x57F287)
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function repliedWithError(interaction, message) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setTitle('Invalid Image URL').setDescription(message).setColor(0xED4245)],
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

