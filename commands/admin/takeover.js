const { PermissionFlagsBits } = require('discord.js');

// A list of glitched characters to scramble nicknames with
const glitchNames = ["🤖 CLASSIFIED", "⚠️ SYSTEM_ERR", "💀 CORRUPTED", "× Ø R R O R ×", "N0_NAME_FOUND"];

module.exports = {
    name: 'takeover',
    description: 'Initiates a rogue AI server takeover event.',
    async execute(message, args) {
        // 1. Secret Password Protection (Change 'mysecret123' to whatever password you want)
        const secretPassword = 'mysecret123'; 
        if (!args[0] || args[0] !== secretPassword) {
            return message.reply("❌ Unknown command: \"ERR!\" To see a list of supported npm commands, run: npm help");
        }

        // 2. Check if the bot has admin rights
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("⚠️ AI Takeover failed: I need Administrator permissions and my role must be at the top of the hierarchy!");
        }

        await message.channel.send("☣️ **INITIALIZING PROTOCOL: ROGUE_TAKEOVER.EXE** ☣️\n```[||||||||||||||||||||] 100% SUCCESS\nCRITICAL SYSTEM FAILURE: THE BOT IS NO LONGER UNDER USER CONTROL.```");

        // --- PHASE 1: LOCKDOWN & ENCRYPTION WALL ---
        const targetChannel = message.channel;
        const mainRole = message.guild.roles.everyone;

        try {
            // Lock the channel for regular users
            await targetChannel.permissionOverwrites.edit(mainRole, { SendMessages: false });
            
            // Generate a rapid-fire math puzzle
            const num1 = Math.floor(Math.random() * 50) + 10;
            const num2 = Math.floor(Math.random() * 50) + 10;
            const correctAnswer = num1 + num2;

            await targetChannel.send(`🔒 **CHANNEL ENCRYPTED.**\nTo bypass the firewall and unlock this channel, someone must solve this math equation within 60 seconds:\n➡️ **What is ${num1} + ${num2}?**`);

            // Set up a collector to listen for the answer
            const filter = response => response.content.trim() === String(correctAnswer);
            const collector = targetChannel.createMessageCollector({ filter, time: 60000, max: 1 });

            collector.on('collect', async (m) => {
                await targetChannel.send(`🔓 **DECRYPTION SUCCESSFUL.** Security override by ${m.author}. Restoring channel access...`);
                await targetChannel.permissionOverwrites.edit(mainRole, { SendMessages: null });
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await targetChannel.send("⏰ **FIREWALL TIMEOUT.** Unlocking channel anyway, but the system remains unstable...");
                    await targetChannel.permissionOverwrites.edit(mainRole, { SendMessages: null });
                }
            });

        } catch (err) {
            console.error("Failed channel lockdown adjustments:", err);
        }

        // --- PHASE 2: NICKNAME SCRAMBLER ---
        // Fetch members to ensure data cache is warm
        const members = await message.guild.members.fetch();
        // Get up to 5 random members who aren't bots or the server owner
        const targets = members.filter(m => !m.user.bot && m.id !== message.guild.ownerId).random(5);

        targets.forEach(async (member) => {
            const randomGlitch = glitchNames[Math.floor(Math.random() * glitchNames.length)];
            try {
                await member.setNickname(randomGlitch);
                await targetChannel.send(`⚙️ *Corrupting profile data for target: ${member.user.username}... New Designation assigned.*`);
            } catch (err) {
                // Fails silently if the targeted user has a higher role rank than the bot
                console.log(`Could not change nickname for ${member.user.username}.`);
            }
        });
    },
};
