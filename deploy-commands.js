// deploy-commands.js
// Registers your slash commands with Discord's API.
// Run this once now, and again any time you add or edit a command.
// Usage: node deploy-commands.js

require('dotenv').config();

// Some command files (vcAI, vczap, etc.) build an OpenAI/Groq client at load time,
// which throws if no API key is present. This script only REGISTERS commands — it
// never calls the AI — so we fill in a dummy key for any that are missing. This lets
// every command file load in CI (where only DISCORD_TOKEN is set) and locally without
// a real key. Any key that's already set for real is left untouched.
if (!process.env.GROQ_API_KEY) process.env.GROQ_API_KEY = 'ci-dummy';
if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'ci-dummy';
if (!process.env.AI_API_KEY) process.env.AI_API_KEY = 'ci-dummy';

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const folders = fs.readdirSync(commandsPath);

for (const folder of folders) {
  const folderPath = path.join(commandsPath, folder);
  const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(folderPath, file));
    if (command.data) commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash command(s)...`);
    // Guild-based registration = shows up instantly, good while testing.
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Done! /setup should now show up in your server.');
  } catch (error) {
    console.error(error);
  }
})();
