const DEFAULT_MEDIATION_TEMPLATES = {
  timeout: {
    title: '⏳ User Timed Out',
    description: '**Target:** {target}\n**Moderator:** {moderator}\n**Duration:** {duration}\n**Reason:** {reason}',
    color: '#5865F2',
    footer: 'TitanBot Moderation'
  },
  untimeout: {
    title: '✅ Timeout Removed',
    description: '**Target:** {target}\n**Moderator:** {moderator}\n**Reason:** {reason}',
    color: '#57F287',
    footer: 'TitanBot Moderation'
  },
  warn: {
    title: '⚠️ User Warned',
    description: '**Target:** {target}\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Total Warns:** {totalWarns}',
    color: '#FAA61A',
    footer: 'TitanBot Moderation'
  },
  ban: {
    title: '🚫 User Banned',
    description: '**Target:** {target}\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case ID:** #{caseId}',
    color: '#ED4245',
    footer: 'TitanBot Moderation'
  },
  unban: {
    title: '✅ User Unbanned',
    description: '**Target:** {target}\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case ID:** #{caseId}',
    color: '#57F287',
    footer: 'TitanBot Moderation'
  },
  kick: {
    title: '👢 User Kicked',
    description: '**Target:** {target}\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case ID:** #{caseId}',
    color: '#E67E22',
    footer: 'TitanBot Moderation'
  }
};

function replaceTokens(value, variables = {}) {
  if (typeof value !== 'string') return value;
  let result = value;
  for (const [key, variable] of Object.entries(variables)) {
    const token = `{${key}}`;
    const raw = variable == null ? '' : String(variable);
    result = result.split(token).join(raw);
  }
  return result;
}

function normalizeHexColor(color) {
  if (typeof color === 'number') return color;
  if (typeof color !== 'string') return undefined;
  const trimmed = color.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }
  return undefined;
}

function getActionDefaults(action) {
  return DEFAULT_MEDIATION_TEMPLATES[action] || DEFAULT_MEDIATION_TEMPLATES.timeout;
}

export function getModerationEmbedConfig(guildConfig, action) {
  const actionKey = action || 'timeout';
  const config = guildConfig?.moderationEmbeds || {};
  const defaults = getActionDefaults(actionKey);
  const saved = config[actionKey] || {};
  return {
    ...defaults,
    ...saved,
    title: saved.title || defaults.title,
    description: saved.description || defaults.description,
    color: saved.color || defaults.color,
    footer: saved.footer || defaults.footer,
    image: saved.image || undefined,
  };
}

export function buildModerationActionEmbed(guildConfig, action, variables = {}) {
  const template = getModerationEmbedConfig(guildConfig, action);
  const description = replaceTokens(template.description || '', variables);
  const title = replaceTokens(template.title || '', variables);
  const footer = replaceTokens(template.footer || '', variables);
  const color = normalizeHexColor(template.color) ?? 0x5865F2;
  const embed = new (await import('discord.js')).EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);

  if (footer) {
    embed.setFooter({ text: footer });
  }

  if (template.image) {
    embed.setImage(template.image);
  }

  return embed;
}

export function buildModerationDashboardPreview(guildConfig, action, variables = {}) {
  return buildModerationActionEmbed(guildConfig, action, variables);
}
