require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

// Music player attached to the client so commands can reach it via interaction.client.distube
client.distube = new DisTube(client, {
  plugins: [new YtDlpPlugin({ update: false })],
  emitNewSongOnly: true,
});

// ---- Load slash commands from every commands/<category>/*.js file ----
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const categories = fs.readdirSync(commandsPath);

for (const category of categories) {
  const categoryPath = path.join(commandsPath, category);
  const commandFiles = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(categoryPath, file));
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] Command at ${file} is missing "data" or "execute".`);
    }
  }
}

// ---- Load event handlers from events/*.js ----
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// ---- Basic DisTube event feedback (song start / add / errors) ----
client.distube
  .on('playSong', (queue, song) => {
    queue.textChannel?.send(`🎶 Now playing: **${song.name}** (requested by ${song.user})`);
  })
  .on('addSong', (queue, song) => {
    queue.textChannel?.send(`✅ Added to queue: **${song.name}**`);
  })
  .on('error', (channel, e) => {
    console.error(e);
    if (channel?.send) channel.send('❌ An error occurred while playing music.');
  })
  .on('empty', (channel) => {
    channel?.send('👋 Voice channel is empty, leaving.');
  })
  .on('finish', (queue) => {
    queue.textChannel?.send('✅ Queue finished.');
  });

client.login(process.env.DISCORD_TOKEN);
