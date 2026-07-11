// ai-tools.js - FULL SERVER ADMIN BOT
const OpenAI = require('openai');
const { REST, Routes, PermissionFlagsBits } = require('discord.js');

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const tools = [
  // ===== CHANNELS =====
  {
    type: 'function',
    function: {
      name: 'create_channel',
      description: 'Create a text, voice, or announcement channel',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['text', 'voice', 'announcement'] },
          categoryName: { type: 'string' },
          topic: { type: 'string', description: 'Channel description/topic' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_channel',
      description: 'Delete a channel by name',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_channel',
      description: 'Edit channel name, topic, or category',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current channel name' },
          newName: { type: 'string' },
          topic: { type: 'string' },
          categoryName: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a channel category',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },

  // ===== ROLES =====
  {
    type: 'function',
    function: {
      name: 'create_role',
      description: 'Create a role with optional color and permissions',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'Hex color like #FF0000 or name like "Red"' },
          permissions: { type: 'array', items: { type: 'string' }, description: 'Permission names like "Administrator", "KickMembers", "BanMembers"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_role',
      description: 'Delete a role by name',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assign_role',
      description: 'Assign a role to a user by username or ID',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Username or user ID' },
          roleName: { type: 'string' },
        },
        required: ['username', 'roleName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_role',
      description: 'Remove a role from a user',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          roleName: { type: 'string' },
        },
        required: ['username', 'roleName'],
      },
    },
  },

  // ===== MEMBERS =====
  {
    type: 'function',
    function: {
      name: 'kick_member',
      description: 'Kick a member from the server',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['username'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ban_member',
      description: 'Ban a member from the server',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          reason: { type: 'string' },
          deleteMessageDays: { type: 'number', description: 'Delete messages from last X days (0-7)' },
        },
        required: ['username'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unban_member',
      description: 'Unban a user by ID',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'timeout_member',
      description: 'Timeout a member (mute them) for X minutes',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          minutes: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['username', 'minutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_nickname',
      description: 'Change a member\'s nickname',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          nickname: { type: 'string' },
        },
        required: ['username', 'nickname'],
      },
    },
  },

  // ===== MESSAGES =====
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a channel',
      parameters: {
        type: 'object',
        properties: {
          channelName: { type: 'string' },
          content: { type: 'string' },
          embed: { type: 'object', description: 'Optional embed object with title, description, color' },
        },
        required: ['channelName', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_message',
      description: 'Delete a message by ID',
      parameters: {
        type: 'object',
        properties: {
          channelName: { type: 'string' },
          messageId: { type: 'string' },
        },
        required: ['channelName', 'messageId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pin_message',
      description: 'Pin a message in a channel',
      parameters: {
        type: 'object',
        properties: {
          channelName: { type: 'string' },
          messageId: { type: 'string' },
        },
        required: ['channelName', 'messageId'],
      },
    },
  },

  // ===== ONBOARDING =====
  {
    type: 'function',
    function: {
      name: 'update_onboarding',
      description: 'Add a question to server onboarding',
      parameters: {
        type: 'object',
        properties: {
          questionTitle: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                emoji: { type: 'string' },
                name: { type: 'string' },
                roleToAssign: { type: 'string', description: 'Optional role name to auto-assign' },
              },
            },
          },
          multiSelect: { type: 'boolean' },
        },
        required: ['questionTitle', 'options'],
      },
    },
  },

  // ===== SERVER SETTINGS =====
  {
    type: 'function',
    function: {
      name: 'edit_server',
      description: 'Edit server name, icon, or verification level',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          verificationLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'very_high'] },
        },
      },
    },
  },
];

async function runAiSetup(prompt, guild) {
  try {
    console.log(`[AI] Sending request to NVIDIA for prompt: "${prompt.substring(0, 50)}..."`);
    
    const response = await client.chat.completions.create({
      model: 'qwen/qwen3.5-397b-a17b',
      messages: [
        {
          role: 'system',
          content:
            'You are a Discord server administrator with FULL control. Use the provided tools to manage channels, roles, members, messages, onboarding, and server settings based on the user request. Be precise with usernames and channel names.',
        },
        { role: 'user', content: prompt },
      ],
      tools,
      tool_choice: 'auto',
      max_tokens: 4000,
    });

    const message = response.choices[0].message;
    const calls = message.tool_calls || [];
    const results = [];

    for (const call of calls) {
      const args = JSON.parse(call.function.arguments);
      console.log(`[AI] Executing: ${call.function.name}`, args);

      try {
        const result = await executeTool(call.function.name, args, guild);
        results.push(result);
      } catch (err) {
        console.error(`[AI] Tool error:`, err.message);
        results.push(`❌ ${call.function.name} failed: ${err.message}`);
      }
    }

    return results.length > 0
      ? `✅ Done! Executed ${results.length} action(s):\n${results.join('\n')}`
      : message.content || 'No actions were taken.';

  } catch (error) {
    console.error('[AI ERROR]', error.message);
    throw error;
  }
}

async function executeTool(toolName, args, guild) {
  switch (toolName) {
    case 'create_channel':
      const channel = await guild.channels.create({
        name: args.name,
        type: args.type === 'voice' ? 2 : args.type === 'announcement' ? 5 : 0,
        topic: args.topic,
      });
      return `✅ Created channel: #${channel.name}`;

    case 'delete_channel':
      const delChannel = guild.channels.cache.find(c => c.name === args.name);
      if (delChannel) {
        await delChannel.delete();
        return `✅ Deleted channel: #${args.name}`;
      }
      return `❌ Channel #${args.name} not found`;

    case 'edit_channel':
      const editChannel = guild.channels.cache.find(c => c.name === args.name);
      if (editChannel) {
        await editChannel.edit({
          name: args.newName,
          topic: args.topic,
        });
        return `✅ Edited channel: #${args.name}`;
      }
      return `❌ Channel #${args.name} not found`;

    case 'create_category':
      const category = await guild.channels.create({
        name: args.name,
        type: 4,
      });
      return `✅ Created category: ${category.name}`;

    case 'create_role':
      const role = await guild.roles.create({
        name: args.name,
        color: args.color,
        permissions: args.permissions ? args.permissions.map(p => PermissionFlagsBits[p]) : [],
      });
      return `✅ Created role: @${role.name}`;

    case 'delete_role':
      const delRole = guild.roles.cache.find(r => r.name === args.name);
      if (delRole) {
        await delRole.delete();
        return `✅ Deleted role: @${args.name}`;
      }
      return `❌ Role @${args.name} not found`;

    case 'assign_role':
      const member = guild.members.cache.find(m => m.user.username === args.username || m.user.tag === args.username || m.id === args.username);
      const roleToAssign = guild.roles.cache.find(r => r.name === args.roleName);
      if (member && roleToAssign) {
        await member.roles.add(roleToAssign);
        return `✅ Assigned @${args.roleName} to ${args.username}`;
      }
      return `❌ User or role not found`;

    case 'remove_role':
      const member2 = guild.members.cache.find(m => m.user.username === args.username || m.user.tag === args.username);
      const roleToRemove = guild.roles.cache.find(r => r.name === args.roleName);
      if (member2 && roleToRemove) {
        await member2.roles.remove(roleToRemove);
        return `✅ Removed @${args.roleName} from ${args.username}`;
      }
      return `❌ User or role not found`;

    case 'kick_member':
      const kickMember = guild.members.cache.find(m => m.user.username === args.username || m.user.tag === args.username);
      if (kickMember) {
        await kickMember.kick(args.reason);
        return `✅ Kicked ${args.username}`;
      }
      return `❌ User ${args.username} not found`;

    case 'ban_member':
      const banMember = guild.members.cache.find(m => m.user.username === args.username || m.user.tag === args.username);
      if (banMember) {
        await banMember.ban({ reason: args.reason, deleteMessageDays: args.deleteMessageDays || 0 });
        return `✅ Banned ${args.username}`;
      }
      return `❌ User ${args.username} not found`;

    case 'unban_member':
      await guild.members.unban(args.userId);
      return `✅ Unbanned user ID ${args.userId}`;

    case 'timeout_member':
      const timeoutMember = guild.members.cache.find(m => m.user.username === args.username || m.user.tag === args.username);
      if (timeoutMember) {
        await timeoutMember.timeout(args.minutes * 60 * 1000, args.reason);
        return `✅ Timed out ${args.username} for ${args.minutes} minutes`;
      }
      return `❌ User ${args.username} not found`;

    case 'set_nickname':
      const nickMember = guild.members.cache.find(m => m.user.username === args.username || m.user.tag === args.username);
      if (nickMember) {
        await nickMember.setNickname(args.nickname);
        return `✅ Set nickname for ${args.username} to ${args.nickname}`;
      }
      return `❌ User ${args.username} not found`;

    case 'send_message':
      const msgChannel = guild.channels.cache.find(c => c.name === args.channelName);
      if (msgChannel) {
        await msgChannel.send(args.content);
        return `✅ Sent message to #${args.channelName}`;
      }
      return `❌ Channel #${args.channelName} not found`;

    case 'delete_message':
      const delMsgChannel = guild.channels.cache.find(c => c.name === args.channelName);
      if (delMsgChannel) {
        const msg = await delMsgChannel.messages.fetch(args.messageId);
        await msg.delete();
        return `✅ Deleted message`;
      }
      return `❌ Channel not found`;

    case 'pin_message':
      const pinChannel = guild.channels.cache.find(c => c.name === args.channelName);
      if (pinChannel) {
        const msg = await pinChannel.messages.fetch(args.messageId);
        await msg.pin();
        return `✅ Pinned message`;
      }
      return `❌ Channel not found`;

    case 'update_onboarding':
      await addOnboardingQuestion(guild, args);
      return `✅ Added onboarding question: "${args.questionTitle}"`;

    case 'edit_server':
      await guild.edit({
        name: args.name,
        verificationLevel: args.verificationLevel ? ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].indexOf(args.verificationLevel.toUpperCase()) : undefined,
      });
      return `✅ Edited server settings`;

    default:
      return `️ Unknown tool: ${toolName}`;
  }
}

async function addOnboardingQuestion(guild, { questionTitle, options, multiSelect = false }) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  let currentOnboarding;
  try {
    currentOnboarding = await rest.get(Routes.guildOnboarding(guild.id));
  } catch (err) {
    currentOnboarding = { enabled: true, questions: [], default_channel_ids: [] };
  }

  const newQuestion = {
    id: null,
    title: questionTitle,
    options: options.map((opt, i) => ({
      id: null,
      title: `${opt.emoji || ''} ${opt.name}`.trim(),
      description: null,
      emoji: opt.emoji ? { name: opt.emoji } : null,
      role_ids: opt.roleToAssign ? [guild.roles.cache.find(r => r.name === opt.roleToAssign)?.id].filter(Boolean) : [],
      channel_ids: [],
    })),
    single_select: !multiSelect,
    required: false,
    in_onboarding: true,
  };

  const existingQuestions = (currentOnboarding.questions || []).map(q => ({
    ...q,
    in_onboarding: true,
  }));

  const updatedOnboarding = {
    enabled: currentOnboarding.enabled ?? true,
    default_channel_ids: currentOnboarding.default_channel_ids || [],
    questions: [...existingQuestions, newQuestion],
  };

  await rest.put(Routes.guildOnboarding(guild.id), { body: updatedOnboarding });
}

module.exports = { runAiSetup };
