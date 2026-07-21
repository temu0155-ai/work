// ai-tools.js
// Discord AI setup assistant — powered by Groq.
// Model: set via GROQ_MODEL env var, defaults to llama-3.3-70b-versatile,
// which supports tool/function calling.

const OpenAI = require('openai');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { PERSONA } = require('./utils/persona');

const client = new OpenAI({
  apiKey: process.env.AI_HORDE_API_KEY || '0000000000',
  baseURL: 'https://oai.aihorde.net/v1',
  defaultHeaders: {
    'Client-Agent': 'KiloBot:1.0.0:discord-bot',
    'HTTP-Referer': 'https://github.com/discordjs',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KiloBot/1.0.0',
  },
});

const MODEL = process.env.AI_MODEL || 'cognitivecomputations/Dolphin-2.6-Mistral-7B';

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

const toolDefs = [
  {
    name: 'list_channels',
    destructive: false,
    silent: true,
    schema: {
      type: 'function',
      function: {
        name: 'list_channels',
        description:
          'List all existing channels and categories in the server. Call this before creating or editing channels so you know what already exists.',
        parameters: { type: 'object', properties: {} },
      },
    },
    run: async (_args, guild) => {
      const lines = [...guild.channels.cache.values()]
        .sort((a, b) => a.position - b.position)
        .map((c) => {
          const kind =
            c.type === ChannelType.GuildCategory ? 'category' : c.type === ChannelType.GuildVoice ? 'voice' : 'text';
          const parent = c.parent ? ` (in ${c.parent.name})` : '';
          return `- ${c.name} [${kind}]${parent}`;
        });
      return formatList('Existing channels:', lines, 'No channels exist yet.');
    },
  },
  {
    name: 'list_roles',
    destructive: false,
    silent: true,
    schema: {
      type: 'function',
      function: {
        name: 'list_roles',
        description:
          'List all existing roles in the server. Call this before creating roles or assigning them so you know what already exists.',
        parameters: { type: 'object', properties: {} },
      },
    },
    run: async (_args, guild) => {
      const lines = [...guild.roles.cache.values()]
        .filter((r) => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map((r) => `- ${r.name}${r.color ? ` (${r.hexColor})` : ''}`);
      return formatList('Existing roles:', lines, 'No custom roles exist yet.');
    },
  },
  {
    name: 'create_category',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'create_category',
        description: 'Create a channel category to group channels under',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      },
    },
    run: async (args, guild) => {
      const existing = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === args.name.toLowerCase()
      );
      if (existing) return `Category "${args.name}" already exists — skipped`;
      const cat = await guild.channels.create({ name: args.name, type: ChannelType.GuildCategory });
      return `Created category "${cat.name}"`;
    },
  },
  {
    name: 'create_channel',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'create_channel',
        description: 'Create a text or voice channel, optionally inside a category',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['text', 'voice'] },
            categoryName: { type: 'string', description: 'Existing or just-created category to place this channel under' },
            topic: { type: 'string', description: 'Optional topic/description, text channels only' },
          },
          required: ['name', 'type'],
        },
      },
    },
    run: async (args, guild) => {
      const parent = args.categoryName
        ? guild.channels.cache.find(
            (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === args.categoryName.toLowerCase()
          )
        : undefined;
      const targetType = args.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const existing = guild.channels.cache.find(
        (c) =>
          c.type === targetType &&
          c.name.toLowerCase() === args.name.toLowerCase() &&
          (c.parentId || null) === (parent?.id || null)
      );
      if (existing) return `Channel "${args.name}" already exists${parent ? ` under ${parent.name}` : ''} — skipped`;
      const channel = await guild.channels.create({
        name: args.name,
        type: targetType,
        parent: parent?.id,
        topic: args.type !== 'voice' ? args.topic : undefined,
      });
      return `Created ${args.type} channel "${channel.name}"${parent ? ` under ${parent.name}` : ''}`;
    },
  },
  {
    name: 'create_role',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'create_role',
        description: 'Create a role, optionally with a color, hoist (shown separately in the member list), and permissions',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            color: { type: 'string', description: 'Hex code like "#5865F2"' },
            hoist: { type: 'boolean' },
            permissions: { type: 'array', items: { type: 'string', enum: PERMISSION_NAMES } },
          },
          required: ['name'],
        },
      },
    },
    run: async (args, guild) => {
      const existing = findRole(guild, args.name);
      if (existing) return `Role "${args.name}" already exists — skipped`;
      const role = await guild.roles.create({
        name: args.name,
        color: args.color || undefined,
        hoist: !!args.hoist,
        permissions: resolvePermissions(args.permissions),
      });
      return `Created role "${role.name}"`;
    },
  },
  {
    name: 'assign_role',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'assign_role',
        description: 'Give an existing role to a specific server member',
        parameters: {
          type: 'object',
          properties: {
            roleName: { type: 'string' },
            memberName: { type: 'string', description: 'Username or display name' },
          },
          required: ['roleName', 'memberName'],
        },
      },
    },
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
    name: 'remove_role',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'remove_role',
        description: 'Remove a role from a specific server member',
        parameters: {
          type: 'object',
          properties: {
            roleName: { type: 'string' },
            memberName: { type: 'string', description: 'Username or display name' },
          },
          required: ['roleName', 'memberName'],
        },
      },
    },
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
    name: 'edit_channel',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'edit_channel',
        description: 'Rename a channel, change its topic, or set slowmode',
        parameters: {
          type: 'object',
          properties: {
            channelName: { type: 'string' },
            newName: { type: 'string' },
            topic: { type: 'string' },
            slowmodeSeconds: { type: 'number', description: '0 to disable' },
          },
          required: ['channelName'],
        },
      },
    },
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
    name: 'set_channel_permissions',
    destructive: false,
    schema: {
      type: 'function',
      function: {
        name: 'set_channel_permissions',
        description: 'Allow or deny permissions for a role in one channel — e.g. make a channel private or read-only',
        parameters: {
          type: 'object',
          properties: {
            channelName: { type: 'string' },
            roleName: { type: 'string', description: 'Use "@everyone" for the default role' },
            allow: { type: 'array', items: { type: 'string', enum: PERMISSION_NAMES } },
            deny: { type: 'array', items: { type: 'string', enum: PERMISSION_NAMES } },
          },
          required: ['channelName', 'roleName'],
        },
      },
    },
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
    name: 'delete_channel',
    destructive: true,
    schema: {
      type: 'function',
      function: {
        name: 'delete_channel',
        description: 'Permanently delete a channel',
        parameters: {
          type: 'object',
          properties: { channelName: { type: 'string' } },
          required: ['channelName'],
        },
      },
    },
    run: async (args, guild) => {
      const channel = findChannel(guild, args.channelName);
      if (!channel) return `Couldn't find a channel named "${args.channelName}"`;
      const name = channel.name;
      await channel.delete();
      return `Deleted channel "${name}"`;
    },
  },
  {
    name: 'delete_role',
    destructive: true,
    schema: {
      type: 'function',
      function: {
        name: 'delete_role',
        description: 'Permanently delete a role',
        parameters: {
          type: 'object',
          properties: { roleName: { type: 'string' } },
          required: ['roleName'],
        },
      },
    },
    run: async (args, guild) => {
      const role = findRole(guild, args.roleName);
      if (!role) return `Couldn't find a role named "${args.roleName}"`;
      const name = role.name;
      await role.delete();
      return `Deleted role "${name}"`;
    },
  },
  {
    name: 'kick_member',
    destructive: true,
    schema: {
      type: 'function',
      function: {
        name: 'kick_member',
        description: 'Kick a member from the server',
        parameters: {
          type: 'object',
          properties: { memberName: { type: 'string', description: 'Username or display name' } },
          required: ['memberName'],
        },
      },
    },
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
const tools = toolDefs.map((t) => t.schema);

async function runAiSetup(prompt, guild, sessionId, requesterMember) {
  if (requesterMember && !requesterMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return "You need Administrator permission to use `/setup`.";
  }
  if (!requesterMember) {
    console.warn('[ai-tools] runAiSetup called without requesterMember — the admin-only check is being skipped.');
  }

  const history = sessionId ? getHistory(sessionId) : [];
  const userConfirmed = /\bconfirm\b/i.test(prompt);

  const messages = [
    {
      role: 'system',
      content:
        `${PERSONA}\n\nYou're also the server's setup assistant with memory of this conversation. You were created by Kilo — you know him and that he built you. Use the provided tools to create and manage channels, categories, roles, permissions, role assignments, and member kicks based on the request. Call list_channels and/or list_roles first whenever you need to know what already exists — e.g. before deciding what still needs to be created, or to resolve a name the user gave loosely. Create categories before the channels that belong in them. If asked for a full server setup, be thorough. Use earlier messages in this conversation for context — e.g. "that category" refers to one just created. Keep your final summary short and casual, matching your voice — you don't need to narrate every step formally.`,
    },
    ...history,
    { role: 'user', content: prompt },
  ];

  const results = [];
  const blocked = [];
  let finalMessageContent = null;
  let hitRoundCap = true;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 700,
      });

      const message = response.choices[0].message;
      const calls = message.tool_calls || [];

      if (calls.length === 0) {
        finalMessageContent = message.content || null;
        hitRoundCap = false;
        break;
      }

      messages.push(message);

      const callResults = await Promise.all(
        calls.map(async (call) => {
          const tool = toolsByName[call.function.name];
          let toolResultText;

          if (!tool) {
            toolResultText = `Unknown tool "${call.function.name}"`;
          } else {
            let args = {};
            try {
              args = JSON.parse(call.function.arguments || '{}');
            } catch (e) {
              toolResultText = `Invalid tool arguments format.`;
            }

            if (tool.destructive && !userConfirmed) {
              const label = `${call.function.name.replace(/_/g, ' ')}: ${args.channelName || args.roleName || args.memberName}`;
              blocked.push(label);
              console.log(
                `[ai-tools] blocked destructive action (no confirm) | guild=${guild.id} requester=${requesterMember?.id || 'unknown'} | ${call.function.name}(${JSON.stringify(args)})`
              );
              toolResultText = 'Skipped — this is destructive and the prompt did not include "confirm".';
            } else {
              try {
                toolResultText = await tool.run(args, guild);
                if (tool.destructive) {
                  console.log(
                    `[ai-tools] destructive action | guild=${guild.id} requester=${requesterMember?.id || 'unknown'} | ${call.function.name}(${JSON.stringify(args)}) -> ${toolResultText}`
                  );
                }
              } catch (err) {
                toolResultText = `Failed on ${call.function.name}: ${err.message}`;
              }
            }
          }

          return { id: call.id, name: call.function.name, toolResultText, silent: tool?.silent };
        })
      );

      for (const { toolResultText, silent } of callResults) {
        if (!silent) results.push(toolResultText);
      }

      for (const { id, name, toolResultText } of callResults) {
        messages.push({
          role: 'tool',
          tool_call_id: id,
          name: name,
          content: String(toolResultText),
        });
      }
    }
  } catch (err) {
    return `Couldn't reach the AI model just now (${err.message}). Try again in a moment.`;
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

module.exports = { runAiSetup };
