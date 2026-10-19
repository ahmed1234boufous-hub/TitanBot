import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configure the welcome system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the welcome message')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send welcome messages to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Welcome message. Variables: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL of the image to include in the welcome message')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Whether to ping the user in the welcome message')
                        .setRequired(false))),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Welcome interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'welcome'
                });
                return;
            }
        } catch (deferError) {
            logger.error(`Welcome defer error`, { error: deferError.message });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to use `/welcome`.' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.channelId) {
                logger.info(`[Welcome] Setup blocked because config already exists in channel ${existingConfig.channelId} for guild ${guild.id}`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Welcome is already configured for <#${existingConfig.channelId}>. Use **/greet dashboard** to customize channel, message, ping, or image.` });
            }
            
            if (!message || message.trim().length === 0) {
                logger.warn(`[Welcome] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Welcome message cannot be empty' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Welcome] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid image URL (must start with http:// or https://' });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    enabled: true,
                    channelId: channel.id,
                    welcomeMessage: message,
                    welcomeImage: image || undefined,
                    welcomePing: ping
                });

                logger.info(`[Welcome] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

                // Build preview embed using the saved config
                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('Welcome System Configured')
                    .setDescription(`Welcome messages will now be sent to ${channel}`)
                    .addFields(
                        { name: 'Message Preview', value: truncateForEmbedField(previewMessage) },
                        { name: 'Ping User', value: ping ? 'Yes' : 'No' },
                        { name: 'Status', value: 'Enabled' }
                    )
                    .setFooter({ text: 'You can edit the embed below — click "Edit Embed"' });

                if (image) {
                    embed.setImage(image);
                }

                // Add an Edit Embed button so the user can adjust the embed immediately
                const editButton = new ButtonBuilder()
                    .setCustomId(`welcome_embed_edit_${guild.id}_${interaction.id}`)
                    .setLabel('Edit Embed')
                    .setStyle(ButtonStyle.Primary);

                const openDashboardButton = new ButtonBuilder()
                    .setCustomId(`open_greet_dashboard_${guild.id}_${interaction.id}`)
                    .setLabel('Open Dashboard')
                    .setStyle(ButtonStyle.Secondary);

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [new ActionRowBuilder().addComponents(editButton, openDashboardButton)] });

                // Create a collector for the button so the user can open a modal to edit embed fields
                const filter = i => i.user.id === interaction.user.id && (i.customId === `welcome_embed_edit_${guild.id}_${interaction.id}` || i.customId === `open_greet_dashboard_${guild.id}_${interaction.id}`);

                const collector = interaction.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000, filter });

                collector.on('collect', async btnInteraction => {
                    try {
                        await btnInteraction.deferUpdate();

                        if (btnInteraction.customId === `open_greet_dashboard_${guild.id}_${interaction.id}`) {
                            // Try to open the dashboard module by sending a follow-up instruction — the dashboard command is better opened via /greet
                            await btnInteraction.followUp({ content: 'Open the full greet dashboard with /greet dashboard to manage advanced settings.', flags: MessageFlags.Ephemeral });
                            return;
                        }

                        // Build modal prefilled with current embed values
                        const cfg = await getWelcomeConfig(client, guild.id);
                        const currentEmbed = cfg.welcomeEmbed || {};

                        const modal = new ModalBuilder()
                            .setCustomId(`welcome_embed_modal_${guild.id}_${interaction.id}`)
                            .setTitle('Edit Welcome Embed')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('embed_title')
                                        .setLabel('Embed Title')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(false)
                                        .setMaxLength(256)
                                        .setValue(currentEmbed.title || '🎉 Welcome!')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('embed_description')
                                        .setLabel('Embed Description (use {user}, {server})')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setRequired(false)
                                        .setMaxLength(2000)
                                        .setValue(currentEmbed.description || cfg.welcomeMessage || '')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('embed_footer')
                                        .setLabel('Embed Footer')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(false)
                                        .setMaxLength(128)
                                        .setValue(currentEmbed.footer ? (currentEmbed.footer.text || '') : `Welcome to ${guild.name}!`)
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('embed_color')
                                        .setLabel('Embed Color (hex, e.g. #00FF00)')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(false)
                                        .setMaxLength(7)
                                        .setValue(currentEmbed.color ? (typeof currentEmbed.color === 'number' ? `#${currentEmbed.color.toString(16).padStart(6, '0')}` : String(currentEmbed.color)) : '')
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('embed_image')
                                        .setLabel('Image URL (optional)')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(false)
                                        .setMaxLength(2000)
                                        .setValue(currentEmbed.image ? (typeof currentEmbed.image === 'string' ? currentEmbed.image : currentEmbed.image.url || '') : (cfg.welcomeImage || ''))
                                ),
                            );

                        await btnInteraction.showModal(modal);

                        const submitted = await btnInteraction.awaitModalSubmit({
                            filter: m => m.customId === `welcome_embed_modal_${guild.id}_${interaction.id}` && m.user.id === interaction.user.id,
                            time: 120_000,
                        }).catch(() => null);

                        if (!submitted) return;

                        const title = submitted.fields.getTextInputValue('embed_title').trim();
                        const description = submitted.fields.getTextInputValue('embed_description').trim();
                        const footerText = submitted.fields.getTextInputValue('embed_footer').trim();
                        const colorStr = submitted.fields.getTextInputValue('embed_color').trim();
                        const imageUrl = submitted.fields.getTextInputValue('embed_image').trim();

                        let colorValue = undefined;
                        if (colorStr) {
                            const hex = colorStr.replace('#', '');
                            if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                                colorValue = parseInt(hex, 16);
                            }
                        }

                        const nextEmbed = {
                            title: title || undefined,
                            description: description || undefined,
                            color: colorValue || getColor('success'),
                            footer: footerText ? { text: footerText } : undefined,
                            ...(imageUrl ? { image: { url: imageUrl } } : {})
                        };

                        await updateWelcomeConfig(client, guild.id, {
                            enabled: true,
                            channelId: cfg.channelId || channel.id,
                            welcomeMessage: cfg.welcomeMessage || message,
                            welcomeImage: imageUrl || undefined,
                            welcomePing: cfg.welcomePing ?? ping,
                            welcomeEmbed: nextEmbed
                        });

                        // Build updated preview
                        const previewDescription = formatWelcomeMessage(nextEmbed.description || cfg.welcomeMessage || message, { user: interaction.user, guild });
                        const previewEmbed = new EmbedBuilder()
                            .setTitle(nextEmbed.title || '🎉 Welcome!')
                            .setDescription(previewDescription)
                            .setColor(nextEmbed.color || getColor('success'))
                            .setFooter({ text: nextEmbed.footer?.text || `Welcome to ${guild.name}!` });

                        if (nextEmbed.image?.url) previewEmbed.setImage(nextEmbed.image.url);

                        await submitted.reply({ embeds: [
                            new EmbedBuilder()
                                .setTitle('✅ Welcome Embed Updated')
                                .setDescription('The welcome embed has been saved and will be used for future joins.')
                                .setColor(getColor('success'))
                        ], flags: MessageFlags.Ephemeral });

                        // Update the original reply to show the new preview and keep the Edit button
                        const editBtn = new ButtonBuilder()
                            .setCustomId(`welcome_embed_edit_${guild.id}_${interaction.id}`)
                            .setLabel('Edit Embed')
                            .setStyle(ButtonStyle.Primary);

                        const openDashBtn = new ButtonBuilder()
                            .setCustomId(`open_greet_dashboard_${guild.id}_${interaction.id}`)
                            .setLabel('Open Dashboard')
                            .setStyle(ButtonStyle.Secondary);

                        await InteractionHelper.safeEditReply(interaction, { embeds: [previewEmbed], components: [new ActionRowBuilder().addComponents(editBtn, openDashBtn)] });

                    } catch (error) {
                        logger.error('Error handling welcome embed edit flow:', error);
                        try { await btnInteraction.followUp({ content: 'An error occurred while editing the embed.', flags: MessageFlags.Ephemeral }); } catch {};
                    }
                });

                collector.on('end', () => {
                    // nothing special to do on end
                });

            } catch (error) {
                logger.error(`[Welcome] Failed to setup welcome system for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while configuring the welcome system. Please try again.' });
            }
        }
    },
};
