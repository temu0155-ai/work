const { Events, ChannelType } = require('discord.js');
const { addVoiceXp } = require('../utils/xp');

// client.voiceSessions: Map<"guildId-userId", { joinedAt: number }>
// Tracked in-memory only. If the bot restarts mid-session that session's
// partial minutes are lost — acceptable tradeoff for simplicity. The
// periodic flush in events/ready.js (every 5 min) limits how much can be
// lost at once for long-running sessions.

function sessionKey(guildId, userId) {
  return `${guildId}-${userId}`;
}

function isTrackable(channel, member) {
  if (!channel) return false;
  if (member.user.bot) return false;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) return false;
  if (channel.guild.afkChannelId === channel.id) return false;
  return true;
}

async function flushSession(client, guildId, userId) {
  const key = sessionKey(guildId, userId);
  const session = client.voiceSessions.get(key);
  if (!session) return;

  const minutes = (Date.now() - session.joinedAt) / 60_000;
  client.voiceSessions.delete(key);

  try {
    await addVoiceXp(guildId, userId, minutes);
  } catch (err) {
    console.error('[xp] Failed to award voice XP:', err);
  }
}

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(oldState, newState, client) {
    client.voiceSessions ??= new Map();

    const guildId = newState.guild.id;
    const userId = newState.id;
    const member = newState.member;
    if (!member) return;

    const wasTrackable = isTrackable(oldState.channel, member);
    const nowTrackable = isTrackable(newState.channel, member);

    // Left a trackable channel (or moved out of one) — flush what they earned.
    if (wasTrackable && oldState.channelId !== newState.channelId) {
      await flushSession(client, guildId, userId);
    }

    // Joined a trackable channel (or moved into one) — start a new session.
    if (nowTrackable && oldState.channelId !== newState.channelId) {
      client.voiceSessions.set(sessionKey(guildId, userId), { joinedAt: Date.now() });
    }
  },
};

module.exports.flushSession = flushSession;
