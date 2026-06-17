// ── Command Definitions (aggregated from all modules) ─────────────────────────
export { defs as moderationDefs } from './moderation.js';
export { defs as staffManagementDefs } from './staff-management.js';
export { defs as requestsDefs } from './requests.js';
export { defs as networkDefs } from './network.js';
export { defs as utilityDefs } from './utility.js';
export { defs as breaksDefs } from './breaks.js';
export { defs as staffDefs } from './staff.js';
export { defs as networkApplyDefs } from './network-apply.js';
export { defs as levelingDefs } from './leveling.js';
export { defs as modGuideDefs } from './modguide.js';
export { defs as botSettingsDefs } from './botsettings.js';
export { defs as devtoolsDefs } from './devtools.js';
export { defs as stickyDefs, handleSticky } from './sticky.js';
export { contextMenuDefs, handleWarnUserContextMenu, handleAdWarnMessageContextMenu } from './context-menus.js';

import { defs as moderationDefs } from './moderation.js';
import { defs as staffManagementDefs } from './staff-management.js';
import { defs as requestsDefs } from './requests.js';
import { defs as networkDefs } from './network.js';
import { defs as utilityDefs } from './utility.js';
import { defs as breaksDefs } from './breaks.js';
import { defs as staffDefs } from './staff.js';
import { defs as networkApplyDefs } from './network-apply.js';
import { defs as levelingDefs } from './leveling.js';
import { defs as modGuideDefs } from './modguide.js';
import { defs as botSettingsDefs } from './botsettings.js';
import { defs as devtoolsDefs } from './devtools.js';
import { defs as stickyDefs, handleSticky } from './sticky.js';

import { contextMenuDefs } from './context-menus.js';

export const commandDefs = [
  ...moderationDefs,
  ...staffManagementDefs,
  ...requestsDefs,
  ...networkDefs,
  ...utilityDefs,
  ...breaksDefs,
  ...staffDefs,
  ...networkApplyDefs,
  ...levelingDefs,
  ...modGuideDefs,
  ...botSettingsDefs,
  ...devtoolsDefs,
  ...stickyDefs,
  ...contextMenuDefs,
];

// ── Handlers (re-exported from each module) ───────────────────────────────────
export { handleWarn, handleWarns, handleWarnLeaderboard, handleAdWarn, handleRemoveAdWarn, handleRemoveWarn, handleMute, handleUnmute, handleBan, handleFire, handleJail, handleUnjail } from './moderation.js';
export { handlePromote, handleDemoteUser, handleStrike, handleStrikeRemove } from './staff-management.js';
export { handleBanRequest, handleBlacklistRequest, handleNetworkBanRequest, handlePartnershipRequest, handleRequestButton } from './requests.js';
export { handleNetworkBan, handleNetworkUnban } from './network.js';
export { handleMessages, handleMessageLeaderboard, handleCaseInfo, handleBalance, handleSnipe, handleResetMessages, handleResetMessagesAll, handleReleaseNotes, handleAddBalance, handleSetBalance, handleSetupOwnerRole, handlePanel, handleAutoReact, handleAutoReactClear } from './utility.js';
export { handleCurrentBreaks, handleBreakRequest, handleManageBreak } from './breaks.js';
export { handleResignRequest, handleUpdate } from './staff.js';
export { handleSetupNetworkApply, handleNetworkApplyPost } from './network-apply.js';
export { handleToggleLeveling, handleLevel, handleLevelLeaderboard, handleAddXp, handleRemoveXp, handleAddLevel, handleSetLevel } from './leveling.js';
export { handleModGuide, handleModGuideButton } from './modguide.js';
export { handleStatus, handleActivity } from './botsettings.js';
export { handleUnblockAll } from './devtools.js';
