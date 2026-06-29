import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { AUTO_CATEGORIES } from './categories.js';

export async function ensureCategories(guild) {
  const categoryIds = {};

  for (const catName of AUTO_CATEGORIES) {
    let existing = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name === catName,
    );

    if (!existing) {
      try {
        existing = await guild.channels.create({
          name: catName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          ],
        });
        console.log(`[Modmail] Created category: ${catName}`);
      } catch (err) {
        console.error(`[Modmail] Failed to create category "${catName}":`, err.message);
        continue;
      }
    }

    categoryIds[catName] = existing.id;
  }

  return categoryIds;
}
