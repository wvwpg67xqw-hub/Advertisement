import { Client, GatewayIntentBits, Partials, ChannelType } from 'discord.js';
import {
  handleUserDM, handleCategorySelection, handleReply, handleClose, handleSub,
  handleMove, handleSnippetAdd, handleSnippetRemove, handleSnippetList,
  handleSnippetView, handleSnippetUse, handleHelp, handleEscalate,
  handleBlock, handleUnblock, handleMenuEdit, handleMenuEditSelection,
  handleMenuEditModalSubmit, getStaffGuild,
} from './handlers.js';
import { getSnippet } from './db.js';
import { ensureCategories } from './setup.js';

const TOKEN         = process.env.MODMAIL_BOT_TOKEN;
const STAFF_SERVER_ID = process.env.STAFF_SERVER_ID;

export function startModmailBot() {
  if (!TOKEN) {
    console.warn('[Modmail] MODMAIL_BOT_TOKEN is not set — modmail bot will not start.');
    return;
  }
  if (!STAFF_SERVER_ID) {
    console.warn('[Modmail] STAFF_SERVER_ID is not set — modmail bot will not start.');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once('clientReady', async () => {
    console.log(`[Modmail] Bot ready: ${client.user.tag}`);
    await client.guilds.fetch();

    const staffGuild = client.guilds.cache.get(STAFF_SERVER_ID);
    if (staffGuild) {
      try {
        await staffGuild.fetch();
        await ensureCategories(staffGuild);
        console.log('[Modmail] Categories ensured on staff server.');
      } catch (err) {
        console.error('[Modmail] Failed to ensure categories:', err.message);
      }
    } else {
      console.error(`[Modmail] Staff guild ${STAFF_SERVER_ID} not found. Make sure the bot is in that server.`);
    }
  });

  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'modmail_category') {
          await handleCategorySelection(client, interaction);
        } else if (interaction.customId === 'menu_edit_select') {
          await handleMenuEditSelection(interaction);
        }
      } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('menu_edit_modal_')) {
          await handleMenuEditModalSubmit(interaction);
        }
      }
    } catch (err) {
      console.error('[Modmail] Interaction error:', err.message);
    }
  });

  client.on('messageCreate', async message => {
    try {
      if (message.author.bot) return;

      if (message.channel.type === ChannelType.DM) {
        await handleUserDM(client, message);
        return;
      }

      if (message.guild?.id !== STAFF_SERVER_ID) return;

      const content = message.content.trim();
      const lower   = content.toLowerCase();

      if (lower.startsWith('.close')) { await handleClose(message);   return; }
      if (lower === '.sub')     { await handleSub(message);          return; }
      if (lower === '.block')   { await handleBlock(message);        return; }
      if (lower === '.escalate'){ await handleEscalate(message);     return; }
      if (lower === '.menu edit'){ await handleMenuEdit(message);    return; }
      if (lower === '.a' || lower === '.help') { await handleHelp(message); return; }

      if (lower.startsWith('.r ') || lower === '.r')   { await handleReply(message, false); return; }
      if (lower.startsWith('.ar ') || lower === '.ar') { await handleReply(message, true);  return; }

      if (lower.startsWith('.move'))            { await handleMove(message);           return; }
      if (lower.startsWith('.snippet add '))    { await handleSnippetAdd(message);     return; }
      if (lower.startsWith('.snippet remove ')) { await handleSnippetRemove(message);  return; }
      if (lower === '.snippet list' || lower === '.snippet') { await handleSnippetList(message); return; }
      if (lower.startsWith('.s '))              { await handleSnippetView(message, lower.slice(3).trim()); return; }
      if (lower.startsWith('.unblock'))         { await handleUnblock(message);        return; }

      if (lower.startsWith('.a ') || lower.startsWith('.help ')) {
        const arg = content.trim().split(/\s+/).slice(1).join(' ');
        await handleHelp(message, arg);
        return;
      }

      if (lower.startsWith('.') && !lower.startsWith('..')) {
        const snippetName = lower.slice(1).split(/\s+/)[0];
        if (snippetName && getSnippet(snippetName)) {
          await handleSnippetUse(message, snippetName);
        }
      }
    } catch (err) {
      console.error('[Modmail] Message handler error:', err.message);
    }
  });

  client.login(TOKEN).catch(err => {
    console.error('[Modmail] Failed to login (invalid token or no network):', err.message);
  });

  process.on('unhandledRejection', (reason, promise) => {
    if (String(reason).includes('TOKEN_INVALID') || String(reason).includes('DISALLOWED_INTENTS')) {
      console.error('[Modmail] Bot error (check token/intents):', reason);
    }
  });
}
