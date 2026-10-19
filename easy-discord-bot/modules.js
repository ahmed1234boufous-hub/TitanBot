// Consolidated modules and commands (original code, simple and small)

const commands = [
  {
    name: 'ping',
    description: 'Check bot latency',
    async execute({ message }) {
      const sent = await message.reply('Pinging...');
      const diff = sent.createdTimestamp - message.createdTimestamp;
      await sent.edit(`Pong! Gateway latency: ${diff}ms`);
    }
  },

  {
    name: 'help',
    description: 'List available commands',
    async execute({ message }) {
      const list = commands.map(c => `**${c.name}** - ${c.description}`).join('\n');
      message.reply({ content: `Available commands:\n${list}` });
    }
  },

  {
    name: 'info',
    description: 'Show server info',
    async execute({ message }) {
      const guild = message.guild;
      message.reply({ content: `Guild: **${guild.name}** (ID: ${guild.id})\nMembers: ${guild.memberCount}` });
    }
  },

  {
    name: 'say',
    description: 'Make the bot say something (owner-only)',
    async execute({ message, args }) {
      const owner = process.env.OWNER_ID;
      if (owner && message.author.id !== owner) return message.reply('Only the owner can use this command.');
      const text = args.join(' ');
      if (!text) return message.reply('Usage: say <message>');
      await message.channel.send({ content: text });
      await message.delete().catch(() => {});
    }
  },

  {
    name: 'purge',
    description: 'Delete recent messages (admin only)',
    async execute({ message, args }) {
      if (!message.member.permissions.has('ManageMessages')) return message.reply('You need Manage Messages permission.');
      const num = Math.min(100, Math.max(1, parseInt(args[0] || '0')));
      if (!num) return message.reply('Usage: purge <1-100>');
      const deleted = await message.channel.bulkDelete(num + 1, true).catch(() => null);
      if (!deleted) return message.reply('Could not delete messages older than 14 days or an error occurred.');
      message.channel.send({ content: `Deleted ${deleted.size - 1} messages.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }
  },

  {
    name: 'kick',
    description: 'Kick a member by mention or id (moderator)',
    async execute({ message, args }) {
      if (!message.member.permissions.has('KickMembers')) return message.reply('You need Kick Members permission.');
      const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      if (!target) return message.reply('Specify a member to kick.');
      if (!target.kickable) return message.reply('I cannot kick that user.');
      const reason = args.slice(1).join(' ') || 'No reason provided';
      await target.kick(reason);
      message.reply({ content: `Kicked ${target.user.tag} — ${reason}` });
    }
  },

  {
    name: 'ban',
    description: 'Ban a member by mention or id (moderator)',
    async execute({ message, args }) {
      if (!message.member.permissions.has('BanMembers')) return message.reply('You need Ban Members permission.');
      const id = args[0];
      if (!id) return message.reply('Usage: ban <id|@member> [reason]');
      const reason = args.slice(1).join(' ') || 'No reason provided';
      // try fetch member
      let target = message.mentions.members.first() || message.guild.members.cache.get(id);
      if (target) {
        if (!target.bannable) return message.reply('I cannot ban that user.');
        await target.ban({ reason });
        return message.reply({ content: `Banned ${target.user.tag} — ${reason}` });
      }
      // fallback: ban by id
      await message.guild.bans.create(id, { reason }).catch(err => {
        return message.reply('Could not ban that id.');
      });
      message.reply({ content: `Banned ID ${id} — ${reason}` });
    }
  }
];

module.exports = { commands };
