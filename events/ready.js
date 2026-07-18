const { Events } = require('discord.js');
const { initDb } = require('../db');
const { flushSession } = require('./voiceStateUpdate');

const VOICE_FLUSH_INTERVAL_MS = 5 * 60_000; // credit long voice sessions every 5 min

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    try {
      await initDb();
    } catch (err) {
      console.error('[db] Failed to connect/initialize Turso database:', err);
    }

    client.voiceSessions ??= new Map();

    // Periodically flush + restart in-progress voice sessions so someone
    // sitting in a call for hours doesn't lose all their XP if the bot
    // restarts, and so /rank reflects roughly-current progress mid-call.
    setInterval(async () => {
      const keys = [...client.voiceSessions.keys()];
      for (const key of keys) {
        const [guildId, userId] = key.split('-');
        await flushSession(client, guildId, userId);
        client.voiceSessions.set(key, { joinedAt: Date.now() }); // restart the session clock
      }
    }, VOICE_FLUSH_INTERVAL_MS);
  },
};
