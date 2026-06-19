export const pendingApprovals  = new Map(); // key: `GUILDID_APPROVERID` → { applicantId, staffRoleId, teamRoleId }
export const xpCooldowns       = new Map(); // key: `${guildId}-${userId}` → last XP gain timestamp
export const arCache            = new Map(); // userId → { ar, fetchedAt }
export const arReactCooldowns   = new Map(); // userId → last reaction timestamp
