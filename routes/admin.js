import { Router } from 'express';
import { execSync } from 'child_process';
import db from '../db.js';
import { requireAdmin } from '../auth.js';
import discordPkg from 'discord.js';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = discordPkg;
import { sendLog, buildStaffUpdateEmbed } from '../src/utils.js';
import { getGuild as getBotGuild, disableDmCommand, enableDmCommand, getDmDisabledCommands } from '../src/database.js';

const router = Router();

let discordClient = null;
export function setDiscordClient(client) {
  discordClient = client;
}

// ── Hardcoded application channel ────────────────────────────────────────────

const APP_CHANNEL_ID = '1503147704522637494';

// ── Edit original Discord message to reflect decision ─────────────────────────

async function updateDiscordApplicationMessage(app, decision, reviewerDisplay) {
  if (!discordClient || !app.discord_message_id) return;
  try {
    const channel = await discordClient.channels.fetch(APP_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(app.discord_message_id).catch(() => null);
    if (!msg || msg.embeds.length === 0) return;
    const accepted = decision === 'accepted';
    const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
      .setColor(accepted ? 0x22c55e : 0xef4444)
      .addFields({
        name: accepted ? '✅ Accepted' : '❌ Denied',
        value: `by ${reviewerDisplay}`,
        inline: false,
      });
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_accept_${app.id}`)
        .setLabel(accepted ? '✅ Accepted' : '✅ Accept')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`app_deny_${app.id}`)
        .setLabel(!accepted ? '❌ Denied' : '❌ Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );
    await msg.edit({ embeds: [updatedEmbed], components: [disabledRow] }).catch(() => null);
  } catch (err) {
    console.error('updateDiscordApplicationMessage error:', err.message);
  }
}

// ── Role map (matches server.js) ──────────────────────────────────────────────

const STAFF_ROLE_ID = '1502594799683895346';
const roleMap = {
  Moderator:         { role: '1495222811755806740', team: '1501681813398093955' },
  'Human Resources': { role: '1495222820400009246', team: '1501681511324451028' },
  Partnership:       { role: '1495222796517773335', team: '1501681321343193160' },
};

// ── Post decision embed to the application thread ─────────────────────────────

async function postThreadDecision(app, decision, adminUsername) {
  if (!discordClient || !app.discord_thread_id) return;
  try {
    const thread = await discordClient.channels.fetch(app.discord_thread_id).catch(() => null);
    if (!thread) return;
    const accepted = decision === 'accepted';
    const embed = new EmbedBuilder()
      .setTitle(accepted ? '✅ Application Accepted' : '❌ Application Denied')
      .setColor(accepted ? 0x22c55e : 0xef4444)
      .setDescription(
        accepted
          ? `**${app.username}** has been accepted for **${app.role}**. Roles will be assigned.`
          : `**${app.username}**'s application for **${app.role}** has been denied.`
      )
      .addFields({ name: '🛡️ Reviewed by', value: adminUsername || 'Admin', inline: true })
      .setTimestamp();
    await thread.send({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.error('Thread decision post failed:', err.message);
  }
}

// ── Assign Discord roles when accepting ───────────────────────────────────────

async function assignRolesOnAccept(app, reviewerUsername, extraRoleIds = []) {
  if (!discordClient) return;
  const guildId = app.guildId || process.env.MAIN_GUILD_ID;
  if (!guildId) return;
  try {
    const guild = await discordClient.guilds.fetch(guildId);
    const member = await guild.members.fetch(app.userId).catch(() => null);
    if (!member) return;

    const toAdd = [STAFF_ROLE_ID, ...extraRoleIds].filter(Boolean);
    await member.roles.add(toAdd).catch(e => console.error('Role add failed:', e.message));

    const dmEmbed = new EmbedBuilder()
      .setTitle('🎉 Application Accepted!')
      .setColor(0x22c55e)
      .setDescription(`Congratulations! Your application for **${app.role}** has been accepted.\n\nPlease join the staff server using the link below and introduce yourself.`)
      .addFields({ name: '📨 Staff Server', value: '[Click here to join](https://discord.gg/AZhhKXs7wA)', inline: false })
      .setFooter({ text: 'Welcome to the team!' }).setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => null);

    // Post to staff updates channel
    try {
      const botConfig = await getBotGuild(guildId);
      const staffEmbed = buildStaffUpdateEmbed('hired', {
        userId: app.userId,
        moderatorId: null,
        role: app.role,
      });
      await sendLog(guild, botConfig, 'staff_updates', staffEmbed);
    } catch {}
  } catch (err) {
    console.error('assignRolesOnAccept error:', err.message);
  }
}

// ── Also notify applicant on deny ─────────────────────────────────────────────

async function notifyApplicantDenied(app) {
  if (!discordClient) return;
  try {
    const user = await discordClient.users.fetch(app.userId).catch(() => null);
    if (user) {
      await user.send({
        content: `❌ Your application for **${app.role}** was reviewed and has been denied. You may apply again in the future.`,
      }).catch(() => null);
    }
  } catch {}
}

// ── Applications ──────────────────────────────────────────────────────────────

router.get('/applications', requireAdmin, (req, res) => {
  res.json(db.getApplications(req.query.status));
});

router.get('/guild-roles', requireAdmin, async (req, res) => {
  if (!discordClient) return res.json([]);
  const guildId = req.query.guildId || process.env.MAIN_GUILD_ID;
  if (!guildId) return res.json([]);
  try {
    const guild = await discordClient.guilds.fetch(guildId);
    await guild.roles.fetch();
    const roles = [...guild.roles.cache.values()]
      .filter(r => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor !== '#000000' ? r.hexColor : null }));
    res.json(roles);
  } catch (err) {
    console.error('guild-roles error:', err.message);
    res.json([]);
  }
});

router.post('/applications/:id/accept', requireAdmin, async (req, res) => {
  const app = db.getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Already ${app.status}` });

  db.updateApplicationStatus(req.params.id, 'accepted');

  const adminUsername = req.session.user?.username || 'Admin';
  const roleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds : [];

  // Fire-and-forget: message update, thread post, role assignment, DM
  Promise.all([
    updateDiscordApplicationMessage(app, 'accepted', adminUsername),
    postThreadDecision(app, 'accepted', adminUsername),
    assignRolesOnAccept(app, adminUsername, roleIds),
  ]).catch(err => console.error('Accept side effects failed:', err.message));

  res.json({ success: true });
});

router.post('/applications/:id/deny', requireAdmin, async (req, res) => {
  const app = db.getApplication(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending') return res.status(409).json({ error: `Already ${app.status}` });

  db.updateApplicationStatus(req.params.id, 'denied');

  const adminUsername = req.session.user?.username || 'Admin';

  // Fire-and-forget: message update, thread post, DM
  Promise.all([
    updateDiscordApplicationMessage(app, 'denied', adminUsername),
    postThreadDecision(app, 'denied', adminUsername),
    notifyApplicantDenied(app),
  ]).catch(err => console.error('Deny side effects failed:', err.message));

  res.json({ success: true });
});

// ── Test Application ──────────────────────────────────────────────────────────

import { ROLE_QUESTIONS } from './applications.js';

const FAKE_FIRST = ['Alex','Jordan','Morgan','Taylor','Casey','Riley','Skyler','Quinn','Avery','Blake','Drew','Jamie'];
const FAKE_LAST  = ['Smith','Williams','Johnson','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson'];
const FAKE_TIMEZONES = ['UTC-8 (PST)','UTC-7 (MST)','UTC-6 (CST)','UTC-5 (EST)','UTC+0 (GMT)','UTC+1 (CET)','UTC+5:30 (IST)','UTC+8 (SGT)','UTC+10 (AEST)'];

function makeFakeUser() {
  const DISCORD_EPOCH = 1420070400000n;
  const ts = BigInt(Date.now()) - DISCORD_EPOCH;
  const snowflake = (ts << 22n) | BigInt(Math.floor(Math.random() * 0xFFFFF));
  const first = FAKE_FIRST[Math.floor(Math.random() * FAKE_FIRST.length)];
  const last  = FAKE_LAST [Math.floor(Math.random() * FAKE_LAST.length)];
  const tag   = Math.floor(Math.random() * 9000) + 1000;
  const userId   = snowflake.toString();
  const username = `${first}${last}${tag}`;
  const avatar   = `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 6)}.png`;
  return { userId, username, avatar };
}

// Models tried in order — first success wins
const HF_GEN_MODELS = [
  {
    url: 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    buildPrompt: (role, numbered) =>
      `[INST] You are filling out a Discord staff application for the role of ${role}. ` +
      `Answer each numbered question in 2–3 natural, genuine sentences as a real person. ` +
      `Do not repeat the question. Number your answers.\n\n${numbered} [/INST]\n1.`,
  },
  {
    url: 'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-alpha',
    buildPrompt: (role, numbered) =>
      `<|system|>You are filling out a Discord staff application for the role of ${role}. ` +
      `Answer each question in 2–3 natural sentences as a real person. ` +
      `Do not repeat the question. Number each answer.</s>\n` +
      `<|user|>${numbered}</s>\n<|assistant|>1.`,
  },
  {
    url: 'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
    buildPrompt: (role, numbered) =>
      `<|system|>You are filling out a Discord staff application for the role of ${role}. ` +
      `Answer each question in 2–3 natural sentences as a real person. ` +
      `Do not repeat the question. Number each answer.</s>\n` +
      `<|user|>${numbered}</s>\n<|assistant|>1.`,
  },
];

async function generateAiAnswers(questions, role) {
  const token = process.env.HUGGINGFACE_TOKEN;

  const shortAnswer = (q) => {
    const lq = q.toLowerCase();
    if (lq.includes('how old') || lq.includes('age'))
      return String(Math.floor(Math.random() * 6) + 18);
    if (lq.includes('timezone'))
      return FAKE_TIMEZONES[Math.floor(Math.random() * FAKE_TIMEZONES.length)];
    if (lq.includes('hours per week') || lq.includes('how many hours'))
      return ['10–15 hours', '15–20 hours', '20–25 hours'][Math.floor(Math.random() * 3)];
    return null;
  };

  const answers  = questions.map(q => shortAnswer(q));
  const essayIdx = answers.map((a, i) => a === null ? i : null).filter(i => i !== null);

  if (essayIdx.length === 0 || !token) {
    if (!token) console.warn('[test-app] HUGGINGFACE_TOKEN not set — using placeholder answers');
    return answers.map((a, i) => a ?? `[TEST] Sample answer for: "${questions[i].slice(0, 60)}"`);
  }

  const numbered = essayIdx.map((qi, n) => `${n + 1}. ${questions[qi]}`).join('\n');

  for (const model of HF_GEN_MODELS) {
    const modelName = model.url.split('/').slice(-2).join('/');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      const hfRes = await fetch(model.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: model.buildPrompt(role, numbered),
          parameters: { max_new_tokens: 1800, return_full_text: false, temperature: 0.75, do_sample: true },
          options: { wait_for_model: true },
        }),
      });
      clearTimeout(timer);

      if (!hfRes.ok) {
        const body = await hfRes.text().catch(() => '');
        console.warn(`[test-app] ${modelName} returned ${hfRes.status}: ${body.slice(0, 200)}`);
        continue;
      }

      const data = await hfRes.json();
      const raw  = (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text) ?? '';
      if (!raw.trim()) {
        console.warn(`[test-app] ${modelName} returned empty text`);
        continue;
      }

      const parts = ('1.' + raw).split(/\n?\d+\.\s+/).filter(Boolean);
      essayIdx.forEach((qi, pi) => {
        answers[qi] = parts[pi]?.trim() || null;
      });
      console.log(`[test-app] Generated answers using ${modelName}`);
      break;
    } catch (e) {
      console.warn(`[test-app] ${modelName} threw: ${e.message}`);
    }
  }

  return answers.map((a, i) => a ?? `[TEST] Sample answer for: "${questions[i].slice(0, 60)}"`);
}

// Human-style answers — casual, short, full of contractions, clearly NOT AI-written.
// Keyed by fragments that appear in standard questions.
const HUMAN_POOL = {
  age:         () => String(Math.floor(Math.random() * 6) + 18),
  timezone:    () => FAKE_TIMEZONES[Math.floor(Math.random() * FAKE_TIMEZONES.length)],
  hours:       () => ['about 10-15 hrs', '15 hrs or so', 'maybe 20 a week'][Math.floor(Math.random() * 3)],
  experience:  () => [
    "yeah i've helped mod a few small servers before, nothing too big but i know the basics",
    "i was a mod on a gaming server for like 8 months, dealt with a lot of drama lol",
    "not professionally but i've been staff on a few communities and learned a ton from it",
  ],
  arguing:     () => [
    "i'd jump in, ask them to take it to dms, and warn if they keep going",
    "separate them first, figure out what started it, then handle it from there",
    "tell them to cool off and move the convo to a private channel if needed",
  ],
  hate:        () => [
    "screenshot it, remove the message, temp mute them, then decide on further action depending on severity",
    "delete it, mute the user, check if it's a pattern, then ban if needed",
    "take it down immediately, check their history, then act accordingly",
  ],
  senior:      () => [
    "honestly i'd treat them the same as anyone else — rank doesn't excuse breaking rules",
    "same as i'd handle anyone. if they broke the rules they get warned like everyone else",
    "no special treatment. i'd probably check with a higher up first tho just to be safe",
  ],
  quality:     () => [
    "being consistent i think — people need to know the rules apply to everyone equally",
    "staying calm under pressure honestly. it's easy to make bad calls when you're frustrated",
    "fairness. it sounds simple but it's actually hard to stay unbiased all the time",
  ],
  difficult:   () => [
    "had to ban someone i was friends with once. wasn't fun but it had to be done",
    "warned a really popular member and got a ton of hate for it. stood my ground though",
    "had to call out a senior mod once for being unfair. it got awkward but someone had to say it",
  ],
  burnout:     () => [
    "i step away when i need to tbh. taking breaks is important",
    "logging off helps. i try not to let server stuff bleed into my day too much",
    "i talk to other staff. helps knowing you're not handling everything alone",
  ],
  tos:         () => [
    "yeah i've read through it. basically no harassment, illegal stuff, or exploiting the platform",
    "pretty familiar with it — covers things like self-harm content, illegal activity, harassment etc",
    "i know the main points — no nsfw in wrong channels, no harassment, no spam bots and stuff",
  ],
  tools:       () => [
    "Carl-bot, MEE6, and Wick mostly. comfortable with all of them",
    "used Dyno a lot, some Carl-bot. picking up new ones is pretty easy tbh",
    "MEE6 and Wick mainly. i'm quick at learning new dashboards though",
  ],
  raid:        () => [
    "lockdown the server, ban raiders as fast as possible, then cleanup after",
    "enable slowmode everywhere, start banning, ping owners to help",
    "raid mode on, mass ban the wave, then review to make sure no innocent members got caught",
  ],
  unfair:      () => [
    "i'd explain exactly what they did and why it broke the rule. calmly though",
    "walk them through it. if they're still unhappy i'd get a second mod to review it",
    "hear them out first — sometimes i'm wrong. if not, i explain my reasoning",
  ],
  bias:        () => [
    "i just apply the rules the same regardless of who it is. if i'm unsure i ask someone else to handle it",
    "remove myself if i'm too close to it. better to let another mod deal with it",
    "treat it like i don't know either of them. the rules are the rules",
  ],
  disagree:    () => [
    "i'd bring it up privately with them first before doing anything",
    "mention it in staff chat and see if others agree. no point making it a big thing",
    "talk to them directly. disagreements are fine as long as we handle it professionally",
  ],
  warning:     () => [
    "something like 'hey [user] please keep things civil in here. this is your first warning'",
    "'[user] — your message broke rule X. consider this a warning, next time will be a mute'",
    "direct and clear. state the rule, state the consequence, no need to write an essay about it",
  ],
  incidents:   () => [
    "most severe first, always. then whatever's easiest to resolve quickly",
    "triage — biggest threat to the server first, then deal with the smaller stuff",
    "check what's most likely to escalate and tackle that first",
  ],
  why:         () => [
    "i've been in this community for a while and genuinely want to help keep it good",
    "i've seen what this server can be and want to help maintain that",
    "honestly it just feels like a good fit. i like the vibe here",
  ],
  anything:    () => [
    "i'm pretty active so response times are usually solid",
    "just that i take this seriously and i'm in it for the long run",
    "not really, i think i covered everything. thanks for the consideration",
  ],
};

function humanAnswer(question) {
  const lq = question.toLowerCase();
  for (const [key, fn] of Object.entries(HUMAN_POOL)) {
    if (lq.includes(key)) {
      const val = fn();
      return Array.isArray(val) ? val[Math.floor(Math.random() * val.length)] : val;
    }
  }
  // Generic fallback — still sounds human
  const fallbacks = [
    "yeah i've dealt with something like that before, handled it fine",
    "honestly just depends on the situation but i'd figure it out",
    "i'd handle it the same way i always do — calmly and fairly",
    "not something i've faced exactly but i'd use common sense and check with the team",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function generateHumanAnswers(questions) {
  return questions.map(q => humanAnswer(q));
}

router.post('/test-application', requireAdmin, async (req, res) => {
  try {
    const { role, answerType = 'ai' } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required' });

    const validRole = db.getRole(role);
    if (!validRole) return res.status(400).json({ error: 'Invalid or inactive role' });

    const questions = ROLE_QUESTIONS[validRole.name] || [];
    if (questions.length === 0) return res.status(400).json({ error: 'No questions for this role' });

    const fakeUser = makeFakeUser();
    const adminUser = req.session.user;

    const testAnswers = answerType === 'human'
      ? generateHumanAnswers(questions)
      : await generateAiAnswers(questions, validRole.name);

    const result = db.insertApplication({
      userId: fakeUser.userId,
      username: `[TEST] ${fakeUser.username}`,
      avatar: fakeUser.avatar,
      role: validRole.name,
      answers: testAnswers,
    });
    const applicationId = result.lastInsertRowid;

    // Send to Discord (same as real flow)
    if (discordClient) {
      try {
        const previewEmbed = new EmbedBuilder()
          .setTitle('📋 [TEST] Staff Application')
          .setColor(0x5865f2)
          .setThumbnail(fakeUser.avatar)
          .addFields(
            { name: '👤 Applicant', value: `**[TEST] ${fakeUser.username}**\n\`${fakeUser.userId}\``, inline: true },
            { name: '📌 Role', value: `${validRole.emoji || ''} ${validRole.name}`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '🎂 Age', value: testAnswers[0], inline: true },
            { name: '🌍 Timezone', value: testAnswers[1], inline: true },
            { name: '⏰ Hours/week', value: testAnswers[2], inline: true },
            { name: `📝 ${(questions[3] || 'Q4').slice(0, 100)}`, value: testAnswers[3]?.slice(0, 300) || '—', inline: false },
          )
          .setFooter({ text: `TEST Application #${applicationId} · ${answerType === 'human' ? '🙋 Human answers' : '🤖 AI answers'} · Reviewed by ${adminUser.username}` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`app_accept_${applicationId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`app_deny_${applicationId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
        );

        const channel = await discordClient.channels.fetch(APP_CHANNEL_ID).catch(() => null);
        if (channel) {
          const msg = await channel.send({ embeds: [previewEmbed], components: [row] });
          const thread = await msg.startThread({
            name: `[TEST] ${fakeUser.username} — ${validRole.name} #${applicationId}`,
            autoArchiveDuration: 60,
          }).catch(() => null);

          if (thread) {
            for (let chunk = 0; chunk < 2; chunk++) {
              const start = chunk * 10;
              const fields = questions.slice(start, start + 10).map((q, i) => ({
                name: `Q${start + i + 1}. ${q.slice(0, 250)}`,
                value: testAnswers[start + i]?.slice(0, 1024) || '—',
              }));
              if (fields.length === 0) continue;
              const chunkEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(chunk === 0
                  ? `📋 [TEST] Full Application — ${fakeUser.username} (Q1–10)`
                  : `📋 [TEST] ${fakeUser.username} (Q11–20)`)
                .addFields(fields);
              await thread.send({ embeds: [chunkEmbed] }).catch(() => null);
            }
            db.updateApplicationDiscordIds(applicationId, msg.id, thread.id);
          } else {
            db.updateApplicationDiscordIds(applicationId, msg.id, null);
          }
        }

        // Preview the staff updates hire notification immediately
        const guildId = process.env.MAIN_GUILD_ID;
        if (guildId) {
          try {
            const guild = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId).catch(() => null);
            if (guild) {
              const botConfig = await getBotGuild(guildId);
              const TASK_CHANNEL_MAP = [
                { keywords: ['mod', 'moderator'],                           id: '1502489464851796099' },
                { keywords: ['hr', 'human resources', 'human res'],         id: '1502489463001972799' },
                { keywords: ['partner', 'management', 'manager', 'admin', 'lead', 'head'], id: '1502489591725166673' },
              ];
              const roleLower = validRole.name.toLowerCase();
              const taskChannelId = TASK_CHANNEL_MAP.find(e => e.keywords.some(k => roleLower.includes(k)))?.id || '1502489464851796099';
              const hireEmbed = buildStaffUpdateEmbed('hired', {
                userId: fakeUser.userId,
                moderatorId: adminUser.userId,
                role: validRole.name,
                taskChannelId,
              });
              hireEmbed.setFooter({ text: '🧪 TEST — this is a preview of the staff updates notification' });
              await sendLog(guild, botConfig, 'staff_updates', hireEmbed, null, `*(Test hire — fake user \`${fakeUser.username}\` · ID \`${fakeUser.userId}\`)*`);
            }
          } catch (suErr) {
            console.error('[test-app] Staff updates preview error:', suErr.message);
          }
        }
      } catch (discordErr) {
        console.error('Test application Discord send error:', discordErr.message);
      }
    }

    res.json({ success: true, applicationId, fakeUser: { username: fakeUser.username, userId: fakeUser.userId }, message: `Test application #${applicationId} sent with ${answerType === 'human' ? '🙋 human-style' : '🤖 AI-generated'} answers. Check Discord for the AI detection result.` });
  } catch (err) {
    console.error('Test application error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── User Blacklist ─────────────────────────────────────────────────────────────

router.get('/blacklist', requireAdmin, (req, res) => {
  res.json(db.getBlacklist());
});

router.post('/blacklist', requireAdmin, (req, res) => {
  const { userId, username, reason } = req.body;
  if (!userId || !username || !reason) return res.status(400).json({ error: 'Missing fields' });
  if (String(reason).length > 500) return res.status(400).json({ error: 'Reason too long (max 500 chars)' });
  try {
    db.insertBlacklist(String(userId).slice(0, 30), String(username).slice(0, 100), String(reason).slice(0, 500));
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Already blacklisted' });
  }
});

router.delete('/blacklist/:id', requireAdmin, (req, res) => {
  const result = db.deleteBlacklist(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── Ban Appeals ────────────────────────────────────────────────────────────────

router.get('/appeals', requireAdmin, (req, res) => {
  res.json(db.getAppeals(req.query.status || undefined));
});

router.post('/appeals/:id/accept', requireAdmin, async (req, res) => {
  const appeal = db.getAppeal(req.params.id);
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
  if (appeal.status !== 'pending') return res.status(409).json({ error: `Appeal already ${appeal.status}` });

  db.updateAppealStatus(req.params.id, 'accepted');
  db.deleteBlacklistByUserId(appeal.userId);

  if (discordClient) {
    try {
      const user = await discordClient.users.fetch(appeal.userId).catch(() => null);
      if (user) {
        await user.send({
          content: `✅ Your ban appeal has been **accepted**. You have been unbanned from the Staff Portal and may log in again.`,
        }).catch(() => null);
      }
    } catch {}
  }

  res.json({ success: true });
});

router.post('/appeals/:id/deny', requireAdmin, async (req, res) => {
  const appeal = db.getAppeal(req.params.id);
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
  if (appeal.status !== 'pending') return res.status(409).json({ error: `Appeal already ${appeal.status}` });

  db.updateAppealStatus(req.params.id, 'denied');

  if (discordClient) {
    try {
      const user = await discordClient.users.fetch(appeal.userId).catch(() => null);
      if (user) {
        await user.send({
          content: `❌ Your ban appeal has been **denied**. If you believe this was a mistake, please contact an administrator.`,
        }).catch(() => null);
      }
    } catch {}
  }

  res.json({ success: true });
});

// ── IP Blacklist ───────────────────────────────────────────────────────────────

router.get('/ip-blacklist', requireAdmin, (req, res) => {
  res.json(db.getIpBlacklist());
});

router.post('/ip-blacklist', requireAdmin, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]{2,39}$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }
  try {
    db.addIpBlacklist(String(ip).slice(0, 45), String(reason || 'Manual').slice(0, 500), req.session.user?.userId);
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'IP already blacklisted' });
  }
});

router.delete('/ip-blacklist/:id', requireAdmin, (req, res) => {
  const result = db.removeIpBlacklist(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── IP Whitelist ──────────────────────────────────────────────────────────────

router.get('/ip-whitelist', requireAdmin, (req, res) => {
  res.json(db.getIpWhitelist());
});

router.post('/ip-whitelist', requireAdmin, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]{2,39}$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }
  try {
    db.addIpWhitelist(String(ip).slice(0, 45), String(reason || 'Manual').slice(0, 500), req.session.user?.userId);
    db.removeIpBlacklistByIp(ip);
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'IP already whitelisted' });
  }
});

router.delete('/ip-whitelist/:id', requireAdmin, (req, res) => {
  const result = db.removeIpWhitelist(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── IP Appeals ────────────────────────────────────────────────────────────────

router.get('/ip-appeals', requireAdmin, (req, res) => {
  const { status } = req.query;
  res.json(db.getIpAppeals(status || null));
});

router.post('/ip-appeals/:id/accept', requireAdmin, (req, res) => {
  const appeal = db.getIpAppeal(req.params.id);
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
  db.updateIpAppealStatus(appeal.id, 'accepted');
  db.removeIpBlacklistByIp(appeal.ip);
  res.json({ success: true });
});

router.post('/ip-appeals/:id/deny', requireAdmin, (req, res) => {
  const appeal = db.getIpAppeal(req.params.id);
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
  db.updateIpAppealStatus(appeal.id, 'denied');
  res.json({ success: true });
});

// ── Admins ────────────────────────────────────────────────────────────────────

router.get('/admins', requireAdmin, (req, res) => {
  res.json(db.getAllAdmins());
});

router.post('/admins', requireAdmin, (req, res) => {
  const { userId, username, role } = req.body;
  if (!userId || !username) return res.status(400).json({ error: 'Missing fields' });
  try {
    db.insertAdmin(String(userId).slice(0, 30), String(username).slice(0, 100), role || 'admin');
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Admin already exists' });
  }
});

router.delete('/admins/:id', requireAdmin, (req, res) => {
  const result = db.deleteAdmin(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── Roles ─────────────────────────────────────────────────────────────────────

router.get('/roles', requireAdmin, (req, res) => {
  res.json(db.getAllRoles());
});

router.post('/roles', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol, nextId } = await import('../jsondb.js');
    const { name, description, emoji, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const rows = readCol('app_roles');
    if (rows.find(r => r.name.toLowerCase() === String(name).toLowerCase())) {
      return res.status(409).json({ error: 'Role name already exists' });
    }
    const id = nextId('app_roles');
    rows.push({
      id,
      name: String(name).slice(0, 100),
      description: String(description || '').slice(0, 500),
      emoji: String(emoji || '📋').slice(0, 8),
      color: String(color || '#6c63ff').slice(0, 20),
      active: 1,
      sort_order: rows.length,
    });
    writeCol('app_roles', rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/roles/:id', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol } = await import('../jsondb.js');
    const rows = readCol('app_roles');
    const i = rows.findIndex(r => r.id === Number(req.params.id));
    if (i < 0) return res.status(404).json({ error: 'Role not found' });
    const { name, description, emoji, color } = req.body;
    if (name) rows[i].name = String(name).slice(0, 100);
    if (description !== undefined) rows[i].description = String(description).slice(0, 500);
    if (emoji) rows[i].emoji = String(emoji).slice(0, 8);
    if (color) rows[i].color = String(color).slice(0, 20);
    writeCol('app_roles', rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/roles/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol } = await import('../jsondb.js');
    const rows = readCol('app_roles');
    const i = rows.findIndex(r => r.id === Number(req.params.id));
    if (i < 0) return res.status(404).json({ error: 'Role not found' });
    rows[i].active = rows[i].active ? 0 : 1;
    writeCol('app_roles', rows);
    res.json({ success: true, active: rows[i].active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roles/:id', requireAdmin, async (req, res) => {
  try {
    const { readCol, writeCol } = await import('../jsondb.js');
    const rows = readCol('app_roles');
    const next = rows.filter(r => r.id !== Number(req.params.id));
    if (next.length === rows.length) return res.status(404).json({ error: 'Role not found' });
    writeCol('app_roles', next);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Apply Servers ─────────────────────────────────────────────────────────────

router.get('/bot-client-id', requireAdmin, (req, res) => {
  const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || '';
  res.json({ clientId });
});

router.get('/apply-servers', requireAdmin, (req, res) => {
  res.json(db.getApplyServers(false));
});

router.get('/apply-servers/guild-info/:guildId', requireAdmin, async (req, res) => {
  try {
    if (!discordClient?.isReady()) return res.status(503).json({ error: 'Bot is not connected' });
    const guild = await discordClient.guilds.fetch(req.params.guildId).catch(() => null);
    if (!guild) return res.status(404).json({ error: 'Guild not found — make sure the bot is in that server' });
    const iconUrl = guild.iconURL({ size: 256, extension: 'png' });
    res.json({ id: guild.id, name: guild.name, icon_url: iconUrl, memberCount: guild.memberCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/apply-servers', requireAdmin, async (req, res) => {
  try {
    const { guildId, name, short_name, description, icon_url, log_channel_id, apply_channel_id, staff_role_id, role_ids } = req.body;
    if (!guildId?.trim()) return res.status(400).json({ error: 'Guild ID is required' });
    if (!name?.trim()) return res.status(400).json({ error: 'Server name is required' });
    const entry = db.insertApplyServer({
      guildId: String(guildId).trim(),
      name: String(name).slice(0, 100),
      short_name: String(short_name || name).slice(0, 30),
      description: String(description || '').slice(0, 300),
      icon_url: icon_url ? String(icon_url).slice(0, 500) : null,
      log_channel_id: log_channel_id ? String(log_channel_id).trim() : null,
      apply_channel_id: apply_channel_id ? String(apply_channel_id).trim() : null,
      staff_role_id: staff_role_id ? String(staff_role_id).trim() : null,
      role_ids: role_ids && typeof role_ids === 'object' ? role_ids : null,
    });
    res.json({ success: true, server: entry });
  } catch (err) {
    res.status(err.message === 'Server already exists' ? 409 : 500).json({ error: err.message });
  }
});

router.put('/apply-servers/:id', requireAdmin, (req, res) => {
  try {
    const { name, short_name, description, icon_url, log_channel_id, apply_channel_id, staff_role_id, role_ids } = req.body;
    const updated = db.updateApplyServer(req.params.id, {
      ...(name !== undefined && { name: String(name).slice(0, 100) }),
      ...(short_name !== undefined && { short_name: String(short_name).slice(0, 30) }),
      ...(description !== undefined && { description: String(description).slice(0, 300) }),
      ...(icon_url !== undefined && { icon_url: icon_url ? String(icon_url).slice(0, 500) : null }),
      ...(log_channel_id !== undefined && { log_channel_id: log_channel_id ? String(log_channel_id).trim() : null }),
      ...(apply_channel_id !== undefined && { apply_channel_id: apply_channel_id ? String(apply_channel_id).trim() : null }),
      ...(staff_role_id !== undefined && { staff_role_id: staff_role_id ? String(staff_role_id).trim() : null }),
      ...(role_ids !== undefined && { role_ids: role_ids && typeof role_ids === 'object' ? role_ids : null }),
    });
    res.json({ success: true, server: updated });
  } catch (err) {
    res.status(err.message === 'Server not found' ? 404 : 500).json({ error: err.message });
  }
});

router.post('/apply-servers/:id/post-apply-message', requireAdmin, async (req, res) => {
  try {
    if (!discordClient?.isReady()) return res.status(503).json({ error: 'Bot is not connected' });

    const server = db.getApplyServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!server.apply_channel_id) return res.status(400).json({ error: 'No apply channel set for this server' });

    const channel = await discordClient.channels.fetch(server.apply_channel_id).catch(() => null);
    if (!channel) return res.status(404).json({ error: 'Channel not found — make sure the bot is in that server and has access to the channel' });

    const domain = (process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || '').split(',')[0].trim();
    const baseUrl = domain ? `https://${domain}` : '';

    const roles = [
      { label: '🔨 Moderator', role: 'Moderator', style: ButtonStyle.Primary },
      { label: '🤝 Human Resources', role: 'Human Resources', style: ButtonStyle.Success },
      { label: '🌐 Partnership Manager', role: 'Partnership', style: ButtonStyle.Secondary },
    ];

    const embed = new EmbedBuilder()
      .setTitle(`📋 Apply for Staff — ${server.name}`)
      .setColor(0x5865f2)
      .setDescription(
        `Want to join the **${server.name}** staff team?\n\nClick a button below to start your application for that role. You'll be taken to our application portal to fill out the form.\n\n**Available Positions:**\n🔨 **Moderator** — Enforce rules, handle reports\n🤝 **Human Resources** — Manage staff, onboarding\n🌐 **Partnership Manager** — Build community partnerships`
      )
      .setFooter({ text: 'Applications are reviewed by our team. Good luck!' })
      .setTimestamp();

    if (server.icon_url) embed.setThumbnail(server.icon_url);

    const row = new ActionRowBuilder().addComponents(
      ...roles.map(r =>
        new ButtonBuilder()
          .setLabel(r.label)
          .setStyle(ButtonStyle.Link)
          .setURL(`${baseUrl}/apply?role=${encodeURIComponent(r.role)}&guildId=${server.guildId}`)
      )
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    res.json({ success: true, messageId: msg.id });
  } catch (err) {
    console.error('post-apply-message error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/apply-servers/:id/toggle', requireAdmin, (req, res) => {
  try {
    const server = db.getApplyServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const updated = db.updateApplyServer(req.params.id, { active: server.active ? 0 : 1 });
    res.json({ success: true, active: updated.active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/apply-servers/:id', requireAdmin, (req, res) => {
  const result = db.deleteApplyServer(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── Discord Channel Lock / Unlock ─────────────────────────────────────────────

const VALID_CHANNEL_ID = /^\d{17,20}$/;

async function discordChannelRequest(method, channelId, body = null) {
  const TOKEN = process.env.TOKEN;
  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  if (!TOKEN || !GUILD_ID) throw new Error('Missing TOKEN or DISCORD_GUILD_ID');
  if (!VALID_CHANNEL_ID.test(channelId)) throw new Error('Invalid channel ID');
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/permissions/${GUILD_ID}`,
    { method, headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null }
  );
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Discord API error');
  }
  return true;
}

// ── Managed Bots ──────────────────────────────────────────────────────────────

router.get('/bots', requireAdmin, (req, res) => {
  res.json(db.getAllBots());
});

router.post('/bots', requireAdmin, (req, res) => {
  const { name, clientId, description, permissions } = req.body;
  if (!name || !clientId) return res.status(400).json({ error: 'Name and Client ID are required.' });
  if (!/^\d{15,20}$/.test(clientId)) return res.status(400).json({ error: 'Client ID must be a valid Discord snowflake (15–20 digits).' });
  try {
    const bot = db.addBot(name, clientId, description || '', permissions || '8');
    res.json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/bots/:id', requireAdmin, (req, res) => {
  const { name, description, permissions } = req.body;
  const bot = db.updateBot(req.params.id, { ...(name && { name }), ...(description !== undefined && { description }), ...(permissions && { permissions }) });
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  res.json(bot);
});

router.delete('/bots/:id', requireAdmin, (req, res) => {
  const bot = db.removeBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  res.json({ success: true });
});

router.post('/channels/:channelId/lock', requireAdmin, async (req, res) => {
  try {
    await discordChannelRequest('PUT', req.params.channelId, { type: 0, deny: '2048' });
    res.json({ success: true, locked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/channels/:channelId/unlock', requireAdmin, async (req, res) => {
  try {
    await discordChannelRequest('DELETE', req.params.channelId);
    res.json({ success: true, locked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DM Command Settings ────────────────────────────────────────────────────────

router.get('/dm-commands', requireAdmin, async (req, res) => {
  const disabled = await getDmDisabledCommands();
  let all = [];
  if (discordClient?.application) {
    try {
      const cmds = await discordClient.application.commands.fetch();
      all = cmds.map(c => c.name).sort();
    } catch {}
  }
  res.json({ disabled, all });
});

router.post('/dm-commands/toggle', requireAdmin, async (req, res) => {
  const { command, action } = req.body;
  if (!command || !['disable', 'enable'].includes(action)) {
    return res.status(400).json({ error: 'command and action (disable|enable) required' });
  }
  const name = String(command).toLowerCase().trim();
  if (action === 'disable') {
    await disableDmCommand(name);
  } else {
    await enableDmCommand(name);
  }
  const disabled = await getDmDisabledCommands();
  res.json({ success: true, disabled });
});

// ── Build Client ──────────────────────────────────────────────────────────────

router.post('/build-client', requireAdmin, (req, res) => {
  try {
    const output = execSync('cd client && npm install && npm run build', {
      timeout: 120000,
      encoding: 'utf8',
    });
    res.json({ success: true, output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, output: err.stdout || '' });
  }
});

export default router;
