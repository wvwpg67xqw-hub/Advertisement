import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder, ActivityType } = pkg;
import client from '../../botClient.js';

const OWNER_ID = process.env.OWNER_ID || '1453592157607825595';

function isOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

// ── Command Definitions ───────────────────────────────────────────────────────

export const defs = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Change the bot\'s online status')
    .addStringOption(o =>
      o.setName('status')
        .setDescription('Status to set')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Online',    value: 'online'    },
          { name: '🟡 Idle',      value: 'idle'      },
          { name: '🔴 Do Not Disturb', value: 'dnd' },
          { name: '⚫ Invisible', value: 'invisible' },
        )),

  new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Change what the bot is doing')
    .addStringOption(o =>
      o.setName('type')
        .setDescription('Activity type')
        .setRequired(true)
        .addChoices(
          { name: '🎮 Playing',    value: 'playing'    },
          { name: '📺 Watching',   value: 'watching'   },
          { name: '🎵 Listening',  value: 'listening'  },
          { name: '🏆 Competing',  value: 'competing'  },
          { name: '❌ Clear',      value: 'clear'      },
        ))
    .addStringOption(o =>
      o.setName('text')
        .setDescription('What to display (leave blank when clearing)')),
];

// ── Status Labels ─────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  online:    '🟢 Online',
  idle:      '🟡 Idle',
  dnd:       '🔴 Do Not Disturb',
  invisible: '⚫ Invisible',
};

const ACTIVITY_TYPES = {
  playing:   ActivityType.Playing,
  watching:  ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
};

const ACTIVITY_LABELS = {
  playing:   '🎮 Playing',
  watching:  '📺 Watching',
  listening: '🎵 Listening to',
  competing: '🏆 Competing in',
};

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleStatus(interaction) {
  if (!isOwner(interaction)) {
    return interaction.reply({ content: '❌ Only the bot owner can change the status.', flags: 64 });
  }

  const status = interaction.options.getString('status');

  try {
    await client.user.setStatus(status);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('✅ Status Updated')
          .setDescription(`Bot status set to **${STATUS_LABELS[status]}**.`)
          .setTimestamp(),
      ],
      flags: 64,
    });
  } catch (err) {
    return interaction.reply({ content: `❌ Failed to update status: ${err.message}`, flags: 64 });
  }
}

export async function handleActivity(interaction) {
  if (!isOwner(interaction)) {
    return interaction.reply({ content: '❌ Only the bot owner can change the activity.', flags: 64 });
  }

  const type = interaction.options.getString('type');
  const text = interaction.options.getString('text');

  try {
    if (type === 'clear') {
      client.user.setActivity(null);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('✅ Activity Cleared')
            .setDescription('Bot activity has been removed.')
            .setTimestamp(),
        ],
        flags: 64,
      });
    }

    if (!text) {
      return interaction.reply({ content: '❌ Please provide text for the activity.', flags: 64 });
    }

    client.user.setActivity(text, { type: ACTIVITY_TYPES[type] });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('✅ Activity Updated')
          .setDescription(`Bot is now **${ACTIVITY_LABELS[type]} ${text}**.`)
          .setTimestamp(),
      ],
      flags: 64,
    });
  } catch (err) {
    return interaction.reply({ content: `❌ Failed to update activity: ${err.message}`, flags: 64 });
  }
}
