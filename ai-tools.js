// ai-tools.js
// Discord AI setup assistant — powered by AI Horde (text generation).
// Horde has NO native tool calling, so we prompt the model to emit a JSON
// tool-call block and parse it ourselves. Everything else is unchanged.

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { PERSONA } = require('./utils/persona');

// ---- Horde config (all optional via env) ----
const HORDE_BASE = 'https://stablehorde.net/api/v2';
const HORDE_API_KEY = process.env.HORDE_API_KEY || '_3yoqnqv3UOLBaJQxE-_Jg'; // 10 zeros = anonymous [[18]]
const HORDE_MODEL = process.env.HORDE_MODEL || '';              // '' = any available worker
const HORDE_MAX_LENGTH = parseInt(process.env.HORDE_MAX_LENGTH || '400', 10);
const HORDE_MAX_CONTEXT = parseInt(process.env.HORDE_MAX_CONTEXT || '4096', 10);
const HORDE_POLL_MS = 1500;     // Horde caches status ~1s [[2]]
const HORDE_TIMEOUT_MS = 90000; // give queued/anonymous gens time
const CLIENT_AGENT = 'kilo-discord-setup-bot:1.0:anonymous';

const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 12;
const MAX_TOOL_ROUNDS = 5;

function getHistory(sessionId) {
  return conversationHistory.get(sessionId) || [];
}
function pushHistory(sessionId, entries) {
  const updated = [...getHistory(sessionId), ...entries].slice(-MAX_HISTORY_MESSAGES);
  conversationHistory.set(sessionId, updated);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function safeText(res) {
  try { return (await res.text()).slice(0, 200); } catch { return ''; }
}

const PERMISSION_NAMES = [
  'Administrator', 'ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers',
  'ManageMessages', 'MentionEveryone', 'ManageWebhooks', 'ManageNicknames',
  'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'Connect', 'Speak',
  'MuteMembers', 'DeafenMembers',
];

function resolvePermissions(names = []) {
  return names.filter((n) => PERMISSION_NAMES.includes(n));
}
function findChannel(guild, name) {
  return guild.channels.cache.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
}
function findRole(guild, name) {
  if (name === '@everyone') return guild.roles.everyone;
  return guild.roles.cache.find((r) => r.name.toLowerCase() === String(name).toLowerCase());
}
async function findMember(guild, name) {
  const members = await guild.members.fetch();
  return members.find(
    (m) =>
      m.user.username.toLowerCase() === String(name).toLowerCase() ||
      m.displayName.toLowerCase() === String(name).toLowerCase()
  );
}
function formatList(header, lines, emptyMessage, limit = 150) {
  if (!lines.length) return emptyMessage;
  const shown = lines.slice(0, limit);
  let text = `${header}\n${shown.join('\n')}`;
  if (lines.length > limit) text += `\n...and ${lines.length - limit} more`;
  return text;
}

// ===================== TOOLS (UNCHANGED) =====================
const toolDefs = [
  {
    name: 'list_channels', destructive: false, silent: true,
    schema: { type: 'function', function: { name: 'list_channels',
      description: 'List all existing channels and categories in the server. Call this before creating or editing channels so you know what already exists.',
      parameters: { type: 'object', properties: {} } } },
    run: async (_args, guild) => {
      const lines = [...guild.channels.cache.values()]
        .sort((a, b) => a.position - b.position)
        .map((c) => {
          const kind = c.type === ChannelType.GuildCategory ? 'category' : c.type === ChannelType.GuildVoice ? 'voice' : 'text';
          const parent = c.parent ? ` (in ${c.parent.name})` : '';
          return `- ${c.name} [${kind}]${parent}`;
        });
      return formatList('Existing channels:', lines, 'No channels exist yet.');
    },
  },
  {
    name: 'list_roles', destructive: false, silent: true,
    schema: { type: 'function', function: { name: 'list_roles',
      description: 'List all existing roles in the server. Call this before creating roles or assigning them so you know what already exists.',
      parameters: { type: 'object', properties: {} } } },
    run: async (_args, guild) => {
      const lines = [...guild.roles.cache.values()]
        .filter((r) => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map((r) => `- ${r.name}${r.color ? ` (${r.hexColor})` : ''}`);
      return formatList('Existing roles:', lines, 'No custom roles exist yet.');
    },
  },
  {
    name: 'create_category', destructive: false,
    schema: { type: 'function', function: { name: 'create_category',
      description: 'Create a channel category to group channels under',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
    run: async (args, guild) => {
      const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === args.name.toLowerCase());
      if (existing) return `Category "${args.name}" already exists — skipped`;
      const cat = await guild.channels.create({ name: args.name, type: ChannelType.GuildCategory });
      return `Created category "${cat.name}"`;
    },
  },
  {
    name: 'create_channel', destructive: false,
    schema: { type: 'function', function: { name: 'create_channel',
      description: 'Create a text or voice channel, optionally inside a category',
      parameters: { type: 'object', properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['text', 'voice'] },
        categoryName: { type: 'string', description: 'Existing or just-created category to place this channel under' },
        topic: { type: 'string', description: 'Optional topic/description, text channels only' },
      }, required: ['name', 'type'] } } },
    run: async (args, guild) => {
      const parent = args.categoryName
        ? guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === args.categoryName.toLowerCase())
        : undefined;
      const targetType = args.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const existing = guild.channels.cache.find((c) => c.type === targetType && c.name.toLowerCase() === args.name.toLowerCase() && (c.parentId || null) === (parent?.id || null));
      if (existing) return `Channel "${args.name}" already exists${parent ? ` under ${parent.name}` : ''} — skipped`;
      const channel = await guild.channels.create({ name: args.name, type: targetType, parent: parent?.id, topic: args.type !== 'voice' ? args.topic : undefined });
      return `Created ${args.type} channel "${channel.name}"${parent ? ` under ${parent.name}` : ''}`;
    },
  },
  {
    name: 'create_role', destructive: false,
    schema: { type: 'function', function: { name: 'create_role',
      description: 'Create a role, optionally with a color, hoist (shown separately in the member list), and permissions',
      parameters: { type: 'object', properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'Hex code like "#5865F2"' },
        hoist: { type: 'boolean' },
        permissions: { type: 'array', items: { type: 'string', enum: PERMISSION_NAMES } },
      }, required: ['name'] } } },
    run: async (args, guild) => {
      const existing = findRole(guild, args.name);
      if (existing) return `Role "${args.name}" already exists — skipped`;
      const role = await guild.roles.create({ name: args.name, color: args.color || undefined, hoist: !!args.hoist, permissions: resolvePermissions(args.permissions) });
      return `Created role "${role.name}"`;
    },
  },
  {
    name: 'assign_role', destructive: false,
    schema: { type: 'function', function: { name: 'assign_role',
      description: 'Give an existing role to a specific server member',
      parameters: { type: 'object', properties: {
        roleName: { type: 'string' },
        memberName: { type: 'string', description: 'Username or display name' },
      }, required: ['roleName', 'memberName'] } } },
    run: async (args, guild) => {
      const role = findRole(guild, args.roleName);
      if (!role) return `Couldn't find a role named "${args.roleName}"`;
      const member = await findMember(guild, args.memberName);
      if (!member) return `Couldn't find a member named "${args.memberName}"`;
      await member.roles.add(role);
      return `Gave "${role.name}" to ${member.displayName}`;
    },
  },
  {
    name: 'remove_role', destructive: false,
    schema: { type: 'function', function: { name: 'remove_role',
      description: 'Remove a role from a specific server member',
      parameters: { type: 'object', properties: {
        roleName: { type: 'string' },
        memberName: { type: 'string', description: 'Username or display name' },
      }, required: ['roleName', 'memberName'] } } },
    run: async (args, guild) => {
      const role = findRole(guild, args.roleName);
      if (!role) return `Couldn't find a role named "${args.roleName}"`;
      const member = await findMember(guild, args.memberName);
      if (!member) return `Couldn't find a member named "${args.memberName}"`;
      await member.roles.remove(role);
      return `Removed "${role.name}" from ${member.displayName}`;
    },
  },
  {
    name: 'edit_channel', destructive: false,
    schema: { type: 'function', function: { name: 'edit_channel',
      description: 'Rename a channel, change its topic, or set slowmode',
      parameters: { type: 'object', properties: {
        channelName: { type: 'string' },
        newName: { type: 'string' },
        topic: { type: 'string' },
        slowmodeSeconds: { type: 'number', description: '0 to disable' },
      }, required: ['channelName'] } } },
    run: async (args, guild) => {
      const channel = findChannel(guild, args.channelName);
      if (!channel) return `Couldn't find a channel named "${args.channelName}"`;
      if (args.newName) await channel.setName(args.newName);
      if (args.topic !== undefined) await channel.setTopic(args.topic);
      if (args.slowmodeSeconds !== undefined) await channel.setRateLimitPerUser(args.slowmodeSeconds);
      return `Updated "${channel.name}"`;
    },
  },
  {
    name: 'set_channel_permissions', destructive: false,
    schema: { type: 'function', function: { name: 'set_channel_permissions',
      description: 'Allow or deny permissions for a role in one channel — e.g. make a channel private or read-only',
      parameters: { type: 'object', properties: {
        channelName: { type: 'string' },
        roleName: { type: 'string', description: 'Use "@everyone" for the default role' },
        allow: { type: 'array', items: { type: 'string', enum: PERMISSION_NAMES } },
        deny: { type: 'array', items: { type: 'string', enum: PERMISSION_NAMES } },
      }, required: ['channelName', 'roleName'] } } },
    run: async (args, guild) => {
      const channel = findChannel(guild, args.channelName);
      if (!channel) return `Couldn't find a channel named "${args.channelName}"`;
      const role = findRole(guild, args.roleName);
      if (!role) return `Couldn't find a role named "${args.roleName}"`;
      const overwrites = {};
      for (const name of args.allow || []) overwrites[name] = true;
      for (const name of args.deny || []) overwrites[name] = false;
      await channel.permissionOverwrites.edit(role, overwrites);
      return `Updated permissions for "${role.name}" in "${channel.name}"`;
    },
  },
  {
    name: 'delete_channel', destructive: true,
    schema: { type: 'function', function: { name: 'delete_channel',
      description: 'Permanently delete a channel',
      parameters: { type: 'object', properties: { channelName: { type: 'string' } }, required: ['channelName'] } } },
    run: async (args, guild) => {
      const channel = findChannel(guild, args.channelName);
      if (!channel) return `Couldn't find a channel named "${args.channelName}"`;
      const name = channel.name;
      await channel.delete();
      return `Deleted channel "${name}"`;
    },
  },
  {
    name: 'delete_role', destructive: true,
    schema: { type: 'function', function: { name: 'delete_role',
      description: 'Permanently delete a role',
      parameters: { type: 'object', properties: { roleName: { type: 'string' } }, required: ['roleName'] } } },
    run: async (args, guild) => {
      const role = findRole(guild, args.roleName);
      if (!role) return `Couldn't find a role named "${args.roleName}"`;
      const name = role.name;
      await role.delete();
      return `Deleted role "${name}"`;
    },
  },
  {
    name: 'kick_member', destructive: true,
    schema: { type: 'function', function: { name: 'kick_member',
      description: 'Kick a member from the server',
      parameters: { type: 'object', properties: { memberName: { type: 'string', description: 'Username or display name' } }, required: ['memberName'] } } },
    run: async (args, guild) => {
      const member = await findMember(guild, args.memberName);
      if (!member) return `Couldn't find a member named "${args.memberName}"`;
      const name = member.displayName;
      await member.kick();
      return `Kicked ${name}`;
    },
  },
];

const toolsByName = Object.fromEntries(toolDefs.map((t) => [t.name, t]));

// ===================== HORDE BRAIN (NEW) =====================
function buildToolCatalog() {
  return toolDefs.map((t) => {
    const fn = t.schema.function;
    const props = JSON.stringify(fn.parameters.properties || {});
    const req = fn.parameters.required?.length ? ` (required: ${fn.parameters.required.join(', ')})` : '';
    return `- ${fn.name}: ${fn.description}\n  params: ${props}${req}`;
  }).join('\n');
}

function buildPrompt(history, userPrompt) {
  const sys =
    `${PERSONA}\n\nYou are the server's setup assistant. You manage channels, categories, roles, permissions, role assignments, and kicks by calling tools.\n\n` +
    `To call tools, reply with ONLY a fenced JSON array, exactly like:\n` +
    '```tool_calls\n[{"name":"create_channel","arguments":{"name":"general","type":"text"}}]\n```\n\n' +
    `Available tools:\n${buildToolCatalog()}\n\n` +
    `Rules:\n` +
    `- Call list_channels and/or list_roles first when you need to know what exists.\n` +
    `- Create categories before the channels that go in them.\n` +
    `- When finished, reply with a short casual plain-text summary and NO code fence / NO JSON.\n` +
    `- Output EITHER a tool_calls block OR a final answer. Never both.`;
  const convo = history.map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
  return `${sys}\n\n${convo ? convo + '\n' : ''}User: ${userPrompt}\nAssistant:`;
}

function stripFences(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, '').replace(/```/g, '').trim();
}

// Pull a JSON tool-call array out of the model's text. Returns null => treat as final answer.
function extractToolCalls(text) {
  if (!text) return null;
  let candidate = null;
  const m = text.match(/```(?:tool_calls|json)?\s*([\s\S]*?)```/i);
  if (m) candidate = m[1];
  if (!candidate) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) candidate = text.slice(start, end + 1);
  }
  if (!candidate) return null;
  candidate = candidate.trim();
  if (!candidate.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return null;
    const calls = parsed
      .filter((c) => c && typeof c.name === 'string')
      .map((c) => ({ name: c.name, arguments: (c.arguments && typeof c.arguments === 'object') ? c.arguments : (c.args || {}) }));
    return calls.length ? calls : null;
  } catch {
    return null;
  }
}

// Submit -> poll -> return generated text. (Horde async workflow [[2]])
async function hordeGenerate(promptText) {
  const body = {
    prompt: promptText,
    params: {
      n: 1,
      max_length: HORDE_MAX_LENGTH,
      max_context_length: HORDE_MAX_CONTEXT,
      temperature: 0.2, // low temp = reliable JSON
      top_p: 0.9,
      rep_pen: 1.1,
    },
  };
  if (HORDE_MODEL) body.models = [HORDE_MODEL];

  const headers = { 'Content-Type': 'application/json', apikey: HORDE_API_KEY, 'Client-Agent': CLIENT_AGENT };

  const submitRes = await fetch(`${HORDE_BASE}/generate/text/async`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!submitRes.ok) throw new Error(`Horde submit failed (${submitRes.status}): ${await safeText(submitRes)}`);
  const submit = await submitRes.json();
  if (submit.message) console.warn('[ai-tools] horde message:', submit.message);
  const id = submit.id;
  if (!id) throw new Error('Horde did not return a request id');

  const deadline = Date.now() + HORDE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(HORDE_POLL_MS);
    const statusRes = await fetch(`${HORDE_BASE}/generate/text/status/${id}`, { headers: { apikey: HORDE_API_KEY, 'Client-Agent': CLIENT_AGENT } });
    if (!statusRes.ok) continue; // transient; keep polling
    const status = await statusRes.json();
    if (status.is_possible === false) {
      try { await fetch(`${HORDE_BASE}/generate/text/status/${id}`, { method: 'DELETE', headers: { apikey: HORDE_API_KEY } }); } catch {}
      throw new Error('no Horde worker can fit this prompt — try a bigger model or shorter history');
    }
    if (status.faulted) throw new Error('Horde request faulted');
    if (status.done && status.generations && status.generations.length) {
      return status.generations[0].text || '';
    }
  }
  try { await fetch(`${HORDE_BASE}/generate/text/status/${id}`, { method: 'DELETE', headers: { apikey: HORDE_API_KEY } }); } catch {}
  throw new Error('Horde generation timed out');
}

// ===================== ENTRYPOINT (same signature/behavior) =====================
async function runAiSetup(prompt, guild, sessionId, requesterMember) {
  if (requesterMember && !requesterMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return "You need Administrator permission to use `/setup`.";
  }
  if (!requesterMember) {
    console.warn('[ai-tools] runAiSetup called without requesterMember — the admin-only check is being skipped.');
  }

  const history = sessionId ? getHistory(sessionId) : [];
  const userConfirmed = /\bconfirm\b/i.test(prompt);

  let promptText = buildPrompt(history, prompt);
  const results = [];
  const blocked = [];
  let finalMessageContent = null;
  let hitRoundCap = true;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const raw = await hordeGenerate(promptText);
      const calls = extractToolCalls(raw);

      if (!calls) {
        finalMessageContent = stripFences(raw) || null;
        hitRoundCap = false;
        break;
      }

      const callResults = [];
      for (const call of calls) {
        const tool = toolsByName[call.name];
        let toolResultText;
        if (!tool) {
          toolResultText = `Unknown tool "${call.name}"`;
        } else if (tool.destructive && !userConfirmed) {
          const label = `${call.name.replace(/_/g, ' ')}: ${call.arguments.channelName || call.arguments.roleName || call.arguments.memberName}`;
          blocked.push(label);
          console.log(`[ai-tools] blocked destructive (no confirm) | guild=${guild.id} requester=${requesterMember?.id || 'unknown'} | ${call.name}(${JSON.stringify(call.arguments)})`);
          toolResultText = 'Skipped — this is destructive and the prompt did not include "confirm".';
        } else {
          try {
            toolResultText = await tool.run(call.arguments, guild);
            if (tool.destructive) console.log(`[ai-tools] destructive action | guild=${guild.id} requester=${requesterMember?.id || 'unknown'} | ${call.name} -> ${toolResultText}`);
          } catch (err) {
            toolResultText = `Failed on ${call.name}: ${err.message}`;
          }
        }
        callResults.push({ name: call.name, toolResultText, silent: tool?.silent });
      }

      for (const { toolResultText, silent } of callResults) {
        if (!silent) results.push(toolResultText);
      }

      // feed the model what happened, then loop
      const feedback = callResults.map((r) => `- ${r.name} -> ${r.toolResultText}`).join('\n');
      promptText += `\n${raw}\nTool results:\n${feedback}\nAssistant:`;
    }
  } catch (err) {
    return `Couldn't reach the AI Horde just now (${err.message}). Try again in a moment.`;
  }

  let summary = results.length ? `Done!\n${results.join('\n')}` : '';
  if (blocked.length) {
    const uniqueBlocked = [...new Set(blocked)];
    summary += `${summary ? '\n\n' : ''}Skipped these for safety — add the word "confirm" to your prompt if you really want them:\n${uniqueBlocked.join('\n')}`;
  }
  summary = summary || finalMessageContent || 'No actions were taken.';
  if (hitRoundCap) {
    summary += `\n\n(Stopped after ${MAX_TOOL_ROUNDS} steps to be safe — send another /setup message to continue.)`;
  }
  if (summary.length > 1900) {
    summary = summary.slice(0, 1900) + '\n...(truncated — check your server to see everything that was created)';
  }
  if (sessionId) {
    pushHistory(sessionId, [
      { role: 'user', content: prompt },
      { role: 'assistant', content: summary },
    ]);
  }
  return summary;
}

module.exports = { runAiSetup };      throw new Error('Generation faulted on AI Horde\'s end — try again.');
    }

    if (status.done) {
      const result = await fetchResult(jobId);
      if (!result.generations || result.generations.length === 0) {
        throw new Error('AI Horde returned no images.');
      }
      return result.generations.map((g) => ({
        url: g.img,
        seed: g.seed,
        model: g.model,
        worker: g.worker_name,
      }));
    }
  }

  throw new Error('Timed out waiting for AI Horde to finish generating.');
}

module.exports = { generateImage, submitImageRequest, checkStatus, fetchResult };
