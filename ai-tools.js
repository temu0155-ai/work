// ai-tools.js
// Discord AI setup assistant — powered by NVIDIA NIM (free hosted endpoint)
// Model: qwen/qwen3.5-122b-a10b (122B MoE, 10B active — agent-ready / tool-calling)

const OpenAI = require('openai');
const { PermissionFlagsBits, ChannelType } = require('discord.js');

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY, // starts with "nvapi-", from build.nvidia.com/settings/api-keys
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// ---- Conversation memory, per Discord channel ----
// Lives in memory only — resets if the bot restarts, which is fine for setup sessions.
const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 12; // ~6 exchanges of context

function getHistory(sessionId) {
  return conversationHistory.get(sessionId) || [];
}

function pushHistory(sessionId, entries) {
  const updated = [...getHistory(sessionId), ...entries].slice(-MAX_HISTORY_MESSAGES);
  conversationHistory.set(sessionId, updated);
}

// Permission names the AI is allowed to use — these map directly to discord.js's PermissionFlagsBits.
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

// Every action the AI can take. destructive: true means it only runs if the
// word "confirm" appears somewhere in the admin's original prompt.
const toolDefs = [
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
      const channel = await guild.channels.create({
        name: args.name,
        type: args.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
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
];

const toolsByName = Object.fromEntries(toolDefs.map((t) => [t.name, t]));
const tools = toolDefs.map((t) => t.schema);

// sessionId ties memory to a place — pass interaction.channelId so each
// channel's /setup conversation has its own thread of context.
async function runAiSetup(prompt, guild, sessionId) {
  const history = sessionId ? getHistory(sessionId) : [];

  const response = await client.chat.completions.create({
    model: 'qwen/qwen3.5-122b-a10b',
    messages: [
      {
        role: 'system',
        content:
          'You are a Discord server setup assistant with memory of this conversation. Use the provided tools to create and manage channels, categories, roles, permissions, and role assignments based on the request. Create categories before the channels that belong in them. If asked for a full server setup, be thorough. Use earlier messages in this conversation for context — e.g. "that category" refers to one just created.',
      },
      ...history,
      { role: 'user', content: prompt },
    ],
    tools,
    tool_choice: 'auto',
  });

  const message = response.choices[0].message;
  const calls = message.tool_calls || [];

  let summary;

  if (calls.length === 0) {
    summary = message.content || 'No actions were taken.';
  } else {
    const userConfirmed = /\bconfirm\b/i.test(prompt);
    const results = [];
    const blocked = [];

    for (const call of calls) {
      const tool = toolsByName[call.function.name];
      if (!tool) continue;
      const args = JSON.parse(call.function.arguments);

      if (tool.destructive && !userConfirmed) {
        blocked.push(`${call.function.name.replace('_', ' ')}: ${args.channelName || args.roleName}`);
        continue;
      }

      try {
        results.push(await tool.run(args, guild));
      } catch (err) {
        results.push(`Failed on ${call.function.name}: ${err.message}`);
      }
    }

    summary = results.length ? `Done!\n${results.join('\n')}` : '';
    if (blocked.length) {
      summary += `${summary ? '\n\n' : ''}Skipped these deletions for safety — add the word "confirm" to your prompt if you really want them:\n${blocked.join('\n')}`;
    }
    summary = summary || message.content || 'No actions were taken.';
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
