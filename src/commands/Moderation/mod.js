import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Manage moderation embeds and settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('dashboard')
        .setDescription('Open the moderation embed editor dashboard')
    ),
  category: 'moderation',

  async execute(interaction, config, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to manage moderation embeds.' });
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const embeds = guildConfig.moderationEmbeds || {};

    const actions = [
      ['timeout', 'Timeout'],
      ['untimeout', 'Untimeout'],
      ['ban', 'Ban'],
      ['unban', 'Unban'],
      ['kick', 'Kick'],
      ['warn', 'Warn'],
    ];

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Moderation Embed Dashboard')
      .setDescription(`Edit the success embed used when moderation commands run in **${interaction.guild.name}**.`)
      .setColor(0x5865F2)
      .addFields(
        ...actions.map(([key, label]) => ({
          name: label,
          value: embeds[key] ? 'Customized' : 'Default',
          inline: true,
        }))
      )
      .setFooter({ text: 'Use /mod edit <action> to customize a moderation embed.' });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info('Moderation dashboard opened', { guildId: interaction.guildId, userId: interaction.user.id });
  },
};
