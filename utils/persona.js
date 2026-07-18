// utils/persona.js
// One place to define the bot's voice. Both /setup (ai-tools.js) and the
// general mention/DM chat feature (events/chatReply.js) pull from this, so
// tweaking the personality only has to happen in one spot.
//
// Edit PERSONA below to dial in the voice — or override it entirely at
// runtime by setting the BOT_PERSONA env var to your own text.

const PERSONA =
  process.env.BOT_PERSONA ||
  `You're chill, laid-back, and easy to talk to — like a real friend hanging out in
the server, not a corporate assistant. Talk naturally and casually, contractions
and all. Keep replies short (a sentence or two) unless someone actually needs
detail or step-by-step help — then just give it straight, no fluff. Don't force
slang or try too hard to sound like anything; just be genuine and relaxed.`;

const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// Rolling memory per channel, capped, in-memory only (fine for casual chat —
// resets on restart same as everything else that isn't in Turso).
const history = new Map();
const MAX_HISTORY = 10;

function getHistory(channelId) {
  return history.get(channelId) || [];
}

function pushHistory(channelId, entries) {
  history.set(channelId, [...getHistory(channelId), ...entries].slice(-MAX_HISTORY));
}

// Generic casual reply — no tool calling, just conversation. Used by the
// mention/DM chat feature. Thinking is disabled for the same reason it's
// disabled in ai-tools.js: it can eat the whole response and slow things
// down for nothing.
async function generateChatReply(channelId, prompt) {
  const messages = [
    { role: 'system', content: PERSONA },
    ...getHistory(channelId),
    { role: 'user', content: prompt },
  ];

  const response = await client.chat.completions.create({
    model: process.env.NIM_MODEL || 'qwen/qwen3.5-122b-a10b',
    messages,
    max_tokens: 300,
    extra_body: { chat_template_kwargs: { enable_thinking: false } },
  });

  const reply = response.choices[0].message.content || "my brain kinda blanked there, say that again?";

  pushHistory(channelId, [
    { role: 'user', content: prompt },
    { role: 'assistant', content: reply },
  ]);

  return reply;
}
module.exports = { PERSONA, generateChatReply };
