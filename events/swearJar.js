const badWords = require("../data/badwords.js");
const swearStats = {};

module.exports = {
    name: "messageCreate",
    async execute(message) {
        if (message.author.bot) return;

        const lowerMessage = message.content.toLowerCase();
        const containsBadWord = badWords.some(word => lowerMessage.includes(word));

        if (containsBadWord) {
            if (!swearStats[message.author.id]) {
                swearStats[message.author.id] = 0;
            }
            swearStats[message.author.id]++;

            try {
                await message.channel.send(`${message.author.username} now has ${swearStats[message.author.id]} swears.`);
            } catch (err) {
                console.error("Failed to send swear jar message:", err);
            }
        }
    }
};
