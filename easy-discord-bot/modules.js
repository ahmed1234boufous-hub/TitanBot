const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const warnStore = new Map();

function safeReply(message, text) {
  return message.reply({ content: text }).catch(() => {});
}

function getModerationTemplate(config, key, fallbackText) {
  const base = config?.moderationTemplates?.[key] || { useEmbed: false, content: fallbackText };
  return {
    useEmbed: Boolean(base.useEmbed),
    content: base.content || fallbackText
  };
}

function fillTemplate(template, values) {
  return template.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_, key) => {
    const value = values[key];
    return typeof value === 'undefined' || value === null ? '' : String(value);
  });
}

function sendModerationMessage(message, config, key, fallbackText, values, title) {
  const template = getModerationTemplate(config, key, fallbackText);
  const output = fillTemplate(template.content, values);

  if (template.useEmbed) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(title)
      .setDescription(output)
      .setTimestamp();
    return message.reply({ embeds: [embed] }).catch(() => {});
  }

  return safeReply(message, output);
}

module.exports = [
  {
    name: 'help',
    description: 'Show all commands',
    async execute({ message, prefix }) {
      const list = module.exports.map((cmd) => `**${prefix}${cmd.name}** - ${cmd.description}`).join('\n');
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Bot Commands')
        .setDescription(list)
        .setFooter({ text: 'Easy Discord Bot' });
      message.reply({ embeds: [embed] }).catch(() => {});
    }
  },

  {
    name: 'ping',
    description: 'Check bot latency',
    async execute({ message }) {
      const sent = await message.reply({ content: 'Pinging...' }).catch(() => null);
      if (!sent) return;
      const latency = sent.createdTimestamp - message.createdTimestamp;
      await sent.edit(`Pong! Latency: **${latency}ms**`).catch(() => {});
    }
  },

  {
    name: 'info',
    description: 'Show guild info',
    async execute({ message }) {
      const guild = message.guild;
      const embed = new EmbedBuilder()
        .setColor('#00b894')
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: 'Members', value: String(guild.memberCount), inline: true },
          { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
          { name: 'Boosts', value: String(guild.premiumSubscriptionCount || 0), inline: true }
        );
      message.reply({ embeds: [embed] }).catch(() => {});
    }
  },

  {
    name: 'user',
    description: 'Show user details',
    async execute({ message, args }) {
      const user = message.mentions.users.first() || message.author;
      const member = message.guild.members.cache.get(user.id) || await message.guild.members.fetch(user.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setColor('#feca57')
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ format: 'png', size: 4096, dynamic: true }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
          { name: 'Joined', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown', inline: true }
        );
      message.reply({ embeds: [embed] }).catch(() => {});
    }
  },

  {
    name: 'avatar',
    description: 'Show a user avatar',
    async execute({ message, args }) {
      const user = message.mentions.users.first() || message.author;
      message.reply({ content: user.displayAvatarURL({ format: 'png', size: 4096, dynamic: true }) }).catch(() => {});
    }
  },

  {
    name: 'say',
    description: 'Make the bot say something',
    async execute({ message, args }) {
      const ownerId = process.env.OWNER_ID;
      if (ownerId && message.author.id !== ownerId) {
        return safeReply(message, 'Only the bot owner can use this command.');
      }
      const text = args.join(' ');
      if (!text) return safeReply(message, 'Usage: say <message>');
      await message.delete().catch(() => {});
      message.channel.send({ content: text }).catch(() => {});
    }
  },

  {
    name: 'embed',
    description: 'Send a custom embed',
    async execute({ message, args }) {
      const ownerId = process.env.OWNER_ID;
      if (ownerId && message.author.id !== ownerId) {
        return safeReply(message, 'Only the bot owner can use this command.');
      }
      const text = args.join(' ');
      if (!text) return safeReply(message, 'Usage: embed <message>');
      const embed = new EmbedBuilder().setColor('#5865F2').setDescription(text);
      message.channel.send({ embeds: [embed] }).catch(() => {});
    }
  },

  {
    name: 'purge',
    description: 'Delete multiple messages',
    async execute({ message, args }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return safeReply(message, 'You need the Manage Messages permission.');
      }
      const count = Number(args[0] || 0);
      if (!count || count < 1 || count > 100) {
        return safeReply(message, 'Usage: purge <1-100>');
      }
      const deleted = await message.channel.bulkDelete(count, true).catch(() => null);
      if (!deleted) return safeReply(message, 'I could not delete those messages.');
      const reply = await message.channel.send({ content: `Deleted ${deleted.size} messages.` }).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
  },

  {
    name: 'kick',
    description: 'Kick a member',
    async execute({ message, args, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return safeReply(message, 'You need the Kick Members permission.');
      }
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      if (!target) return safeReply(message, 'Mention a member or provide a user ID.');
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      if (!target.kickable) return safeReply(message, 'I cannot kick that member.');
      await target.kick(reason);
      sendModerationMessage(
        message,
        config,
        'kick',
        'Kicked {userTag}. Reason: {reason}',
        { userTag: target.user.tag, reason },
        'Member kicked'
      );
    }
  },

  {
    name: 'ban',
    description: 'Ban a member',
    async execute({ message, args, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return safeReply(message, 'You need the Ban Members permission.');
      }
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      if (target) {
        if (!target.bannable) return safeReply(message, 'I cannot ban that member.');
        await target.ban({ reason });
        return sendModerationMessage(
          message,
          config,
          'ban',
          'Banned {userTag}. Reason: {reason}',
          { userTag: target.user.tag, reason },
          'Member banned'
        );
      }
      if (!args[0]) return safeReply(message, 'Usage: ban <userId|@member> [reason]');
      await message.guild.bans.create(args[0], { reason }).catch(() => null);
      return sendModerationMessage(
        message,
        config,
        'ban',
        'Banned user ID {user}. Reason: {reason}',
        { user: args[0], reason },
        'Member banned'
      );
    }
  },

  {
    name: 'unban',
    description: 'Unban a user',
    async execute({ message, args, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return safeReply(message, 'You need the Ban Members permission.');
      }
      const userId = args[0];
      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      if (!userId) return safeReply(message, 'Usage: unban <userId>');
      await message.guild.bans.remove(userId).catch(() => null);
      return sendModerationMessage(
        message,
        config,
        'unban',
        'Unbanned user ID {user}.',
        { user: userId },
        'Member unbanned'
      );
    }
  },

  {
    name: 'mute',
    description: 'Timeout a member',
    async execute({ message, args, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return safeReply(message, 'You need the Moderate Members permission.');
      }
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      if (!target) return safeReply(message, 'Mention a member or provide a user ID.');
      const duration = Number(args[1] || 0);
      const ms = duration > 0 ? duration * 60000 : 0;
      const reason = args.slice(2).join(' ') || 'No reason provided';
      if (ms > 0) {
        await target.timeout(ms, 'Muted by command');
        return sendModerationMessage(
          message,
          config,
          'timeout',
          'Timed out {userTag} for {duration} minutes. Reason: {reason}',
          { userTag: target.user.tag, duration, reason },
          'Timeout applied'
        );
      }
      await target.timeout(null, 'Timeout removed by command');
      return sendModerationMessage(
        message,
        config,
        'unmute',
        'Unmuted {userTag}.',
        { userTag: target.user.tag },
        'Timeout removed'
      );
    }
  },

  {
    name: 'timeout',
    description: 'Timeout a member',
    async execute({ message, args, guildConfigs }) {
      return module.exports.find((cmd) => cmd.name === 'mute').execute({ message, args, guildConfigs });
    }
  },

  {
    name: 'unmute',
    description: 'Remove timeout from a member',
    async execute({ message, args, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return safeReply(message, 'You need the Moderate Members permission.');
      }
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      if (!target) return safeReply(message, 'Mention a member or provide a user ID.');
      await target.timeout(null, 'Timeout removed by command');
      return sendModerationMessage(
        message,
        config,
        'unmute',
        'Unmuted {userTag}.',
        { userTag: target.user.tag },
        'Timeout removed'
      );
    }
  },

  {
    name: 'slowmode',
    description: 'Set slowmode in seconds',
    async execute({ message, args }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return safeReply(message, 'You need the Manage Channels permission.');
      }
      const seconds = Number(args[0] || 0);
      if (!seconds || seconds < 0 || seconds > 21600) {
        return safeReply(message, 'Usage: slowmode <0-21600>');
      }
      await message.channel.setRateLimitPerUser(seconds);
      safeReply(message, `Set slowmode to **${seconds}** seconds.`);
    }
  },

  {
    name: 'lock',
    description: 'Lock a channel',
    async execute({ message }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return safeReply(message, 'You need the Manage Channels permission.');
      }
      await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
      safeReply(message, `Locked **${message.channel.name}**.`);
    }
  },

  {
    name: 'unlock',
    description: 'Unlock a channel',
    async execute({ message }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return safeReply(message, 'You need the Manage Channels permission.');
      }
      await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
      safeReply(message, `Unlocked **${message.channel.name}**.`);
    }
  },

  {
    name: 'warn',
    description: 'Warn a member',
    async execute({ message, args, warns, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return safeReply(message, 'You need the Moderate Members permission.');
      }
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      if (!target) return safeReply(message, 'Mention a member or provide a user ID.');
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const key = `${message.guild.id}:${target.id}`;
      const count = warns.get(key) || 0;
      warns.set(key, count + 1);
      return sendModerationMessage(
        message,
        config,
        'warn',
        'Warned {userTag}. Reason: {reason}',
        { userTag: target.user.tag, reason },
        'Warning issued'
      );
    }
  },

  {
    name: 'warnings',
    description: 'Check warnings for a user',
    async execute({ message, args, warns }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return safeReply(message, 'You need the Moderate Members permission.');
      }
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      if (!target) return safeReply(message, 'Mention a member or provide a user ID.');
      const key = `${message.guild.id}:${target.id}`;
      const count = warns.get(key) || 0;
      safeReply(message, `**${target.user.tag}** has **${count}** warning(s).`);
    }
  },

  {
    name: 'welcome',
    description: 'Set the welcome channel',
    async execute({ message, guildConfigs, args }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return safeReply(message, 'You need the Manage Server permission.');
      }
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
      if (!channel) return safeReply(message, 'Mention a channel or provide a channel ID.');

      const subArg = (args[1] || '').toLowerCase();
      const useEmbed = subArg === 'embed' || subArg === 'true';

      const config = guildConfigs.get(message.guild.id) || { welcomeChannelId: null, welcomeEmbed: false, levelUpChannelId: null, levelUpEmbed: false, moderationTemplates: {} };
      config.welcomeChannelId = channel.id;
      config.welcomeEmbed = useEmbed;
      guildConfigs.set(message.guild.id, config);

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`toggle_welcome:${message.guild.id}`)
          .setLabel(config.welcomeEmbed ? 'Disable embed' : 'Enable embed')
          .setStyle(config.welcomeEmbed ? ButtonStyle.Secondary : ButtonStyle.Success)
      );

      return message.reply({
        content: `Welcome channel set to **${channel.name}** (Embed mode: **${useEmbed ? 'Enabled' : 'Disabled'}**).`,
        components: [buttonRow]
      }).catch(() => {});
    }
  },

  {
    name: 'levelup',
    description: 'Set the level up message channel',
    async execute({ message, guildConfigs, args }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return safeReply(message, 'You need the Manage Server permission.');
      }
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
      if (!channel) return safeReply(message, 'Mention a channel or provide a channel ID.');

      const subArg = (args[1] || '').toLowerCase();
      const useEmbed = subArg === 'embed' || subArg === 'true';

      const config = guildConfigs.get(message.guild.id) || { welcomeChannelId: null, welcomeEmbed: false, levelUpChannelId: null, levelUpEmbed: false, moderationTemplates: {} };
      config.levelUpChannelId = channel.id;
      config.levelUpEmbed = useEmbed;
      guildConfigs.set(message.guild.id, config);

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`toggle_levelup:${message.guild.id}`)
          .setLabel(config.levelUpEmbed ? 'Disable embed' : 'Enable embed')
          .setStyle(config.levelUpEmbed ? ButtonStyle.Secondary : ButtonStyle.Success)
      );

      return message.reply({
        content: `Level up channel set to **${channel.name}** (Embed mode: **${useEmbed ? 'Enabled' : 'Disabled'}**).`,
        components: [buttonRow]
      }).catch(() => {});
    }
  },

  {
    name: 'leveling',
    description: 'Alias for the level up setup command',
    async execute({ message, guildConfigs, args }) {
      return module.exports.find((cmd) => cmd.name === 'levelup').execute({ message, guildConfigs, args });
    }
  },

  {
    name: 'moderation-dashboard',
    description: 'Open the moderation dashboard for editing templates',
    async execute({ message, guildConfigs }) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return safeReply(message, 'You need a moderation or server management permission.');
      }

      const config = guildConfigs.get(message.guild.id) || { moderationTemplates: {} };
      const actions = [
        ['warn', 'Warn'],
        ['timeout', 'Timeout'],
        ['unmute', 'Unmute'],
        ['kick', 'Kick'],
        ['ban', 'Ban'],
        ['unban', 'Unban']
      ];

      const rows = [];
      for (let i = 0; i < actions.length; i += 3) {
        rows.push(
          new ActionRowBuilder().addComponents(
            ...actions.slice(i, i + 3).map(([key, label]) =>
              new ButtonBuilder()
                .setCustomId(`mod_edit:${key}`)
                .setLabel(label)
                .setStyle(ButtonStyle.Primary)
            )
          )
        );
      }

      const dashboard = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Moderation dashboard')
        .setDescription('Select a moderation action to edit its response template and embed behavior.')
        .addFields(
          actions.map(([key, label]) => ({
            name: label,
            value: getModerationTemplate(config, key, 'Template not set').useEmbed ? 'Embed enabled' : 'Plain text',
            inline: true
          }))
        );

      return message.reply({ embeds: [dashboard], components: rows }).catch(() => {});
    }
  },

  {
    name: 'poll',
    description: 'Create a simple poll',
    async execute({ message, args }) {
      const text = args.join(' ');
      if (!text) return safeReply(message, 'Usage: poll <question>');
      const poll = await message.channel.send({ content: `📊 **Poll**\n${text}` }).catch(() => null);
      if (!poll) return;
      await poll.react('👍');
      await poll.react('👎');
    }
  },

  {
    name: 'coinflip',
    description: 'Flip a coin',
    async execute({ message }) {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      safeReply(message, `Coinflip: **${result}**`);
    }
  },

  {
    name: 'roll',
    description: 'Roll a dice',
    async execute({ message, args }) {
      const sides = Number(args[0] || 6);
      if (!sides || sides < 1) return safeReply(message, 'Usage: roll <sides>');
      const value = Math.floor(Math.random() * sides) + 1;
      safeReply(message, `🎲 You rolled **${value}** out of **${sides}**.`);
    }
  },

  {
    name: '8ball',
    description: 'Ask the magic 8-ball',
    async execute({ message, args }) {
      const question = args.join(' ');
      if (!question) return safeReply(message, 'Usage: 8ball <question>');
      const answers = [
        'Yes.', 'No.', 'Definitely.', 'Ask again later.', 'Signs point to yes.', 'My sources say no.', 'It is certain.', 'Very doubtful.'
      ];
      const answer = answers[Math.floor(Math.random() * answers.length)];
      safeReply(message, `🎱 **${answer}**`);
    }
  },

  {
    name: 'choose',
    description: 'Choose between options',
    async execute({ message, args }) {
      if (args.length < 2) return safeReply(message, 'Usage: choose <option1> <option2> ...');
      const choice = args[Math.floor(Math.random() * args.length)];
      safeReply(message, `I choose: **${choice}**`);
    }
  },

  {
    name: 'rps',
    description: 'Play rock paper scissors',
    async execute({ message, args }) {
      const choices = ['rock', 'paper', 'scissors'];
      const userChoice = (args[0] || '').toLowerCase();
      if (!choices.includes(userChoice)) {
        return safeReply(message, 'Usage: rps <rock|paper|scissors>');
      }
      const botChoice = choices[Math.floor(Math.random() * choices.length)];
      const wins = {
        rock: 'scissors',
        paper: 'rock',
        scissors: 'paper'
      };
      let result = 'It\'s a draw!';
      if (wins[userChoice] === botChoice) result = 'You win!';
      if (wins[botChoice] === userChoice) result = 'I win!';
      safeReply(message, `You picked **${userChoice}**, I picked **${botChoice}**. ${result}`);
    }
  },

  {
    name: 'ticket',
    description: 'Create a support ticket channel',
    async execute({ message }) {
      const category = message.guild.channels.cache.find((channel) => channel.type === 4 && channel.name.toLowerCase().includes('tickets'));
      const channelName = `ticket-${message.author.username.toLowerCase()}`;
      const created = await message.guild.channels.create({
        name: channelName,
        type: 0,
        parent: category ? category.id : null,
        permissionOverwrites: [
          { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      }).catch(() => null);
      if (!created) return safeReply(message, 'Could not create ticket channel.');
      safeReply(message, `Ticket created: <#${created.id}>`);
    }
  },

  {
    name: 'role',
    description: 'Give a role by name to yourself',
    async execute({ message, args }) {
      const roleName = args.join(' ');
      if (!roleName) return safeReply(message, 'Usage: role <role-name>');
      const role = message.guild.roles.cache.find((item) => item.name.toLowerCase() === roleName.toLowerCase());
      if (!role) return safeReply(message, `I could not find the role **${roleName}**.`);
      if (message.member.roles.cache.has(role.id)) {
        await message.member.roles.remove(role);
        return safeReply(message, `Removed the **${role.name}** role.`);
      }
      await message.member.roles.add(role);
      safeReply(message, `Added the **${role.name}** role.`);
    }
  },

  {
    name: 'servericon',
    description: 'Show the server icon',
    async execute({ message }) {
      const url = message.guild.iconURL({ dynamic: true, size: 4096 });
      message.reply({ content: url || 'No server icon available.' }).catch(() => {});
    }
  },

  {
    name: 'uptime',
    description: 'Show bot uptime',
    async execute({ message, client }) {
      const ms = client.uptime;
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((ms / (1000 * 60)) % 60);
      safeReply(message, `Uptime: **${days}d ${hours}h ${minutes}m**`);
    }
  }
];


