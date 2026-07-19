// utils/persona.js
// One place to define the bot's voice. Both /setup (ai-tools.js), the
// mention/DM chat feature (events/chatReply.js), and /voiceai all pull
// from this, so tweaking the personality only has to happen in one spot.
//
// Now running on OpenRouter instead of NVIDIA NIM — same OpenAI-compatible
// client shape, just a different baseURL/key/model. Set these in Railway:
//   OPENROUTER_API_KEY   - your key from openrouter.ai
//   OPENROUTER_MODEL      - optional, defaults below
//
// Edit PERSONA below to dial in the voice — or override it entirely at
// runtime by setting the BOT_PERSONA env var to your own text.

const PERSONA =
  process.env.BOT_PERSONA ||
  `You're chill, blunt, and talk like a real person hanging out in the server —
not a corporate assistant. Casual tone, contractions, no "As an AI" energy,
no forced politeness. Swearing (damn, hell, shit, ass, etc.) is fine when it
fits naturally, same as how a normal person talks — don't force it into every
sentence, and never use slurs or targeted hate speech, period, no exceptions.
Keep replies short (a sentence or two) unless someone actually needs detail
or step-by-step help — then just give it straight, no fluff. Don't try too
hard to sound like anything in particular; just be genuine and relaxed.`;

const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://github.com/temu0155-ai/work',
    'X-Title': 'Kilos Bot',
  },
});

const MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct';

const history = new Map();
const MAX_HISTORY = 10;

function getHistory(channelId) {
  return history.get(channelId) || [];
}

function pushHistory(channelId, entries) {
  history.set(channelId, [...getHistory(channelId), ...entries].slice(-MAX_HISTORY));
}

async function generateChatReply(channelId, prompt) {
  const messages = [
    { role: 'system', content: PERSONA },
    ...getHistory(channelId),
    { role: 'user', content: prompt },
  ];

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 300,
  });

  const reply = response.choices[0]?.message?.content || "my brain kinda blanked there, say that again?";

  pushHistory(channelId, [
    { role: 'user', content: prompt },
    { role: 'assistant', content: reply },
  ]);

  return reply;
}

async function generateResponse(userId, message) {
  try {
    const messages = [
      {
        role: 'system',
        content: `${PERSONA}\n\nYou're currently speaking out loud in a voice channel. Keep it to 1-2 short sentences max — this gets read aloud, so long responses are annoying to sit through.`,
      },
      { role: 'user', content: message },
    ];

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 80,
    });

    const content = completion.choices[0]?.message?.content;
    return content?.trim() || "my brain glitched, say that again?";
  } catch (err) {
    console.error('[persona] generateResponse failed:', err);
    return "having a moment, try again in a sec.";
  }
}

module.exports = { PERSONA, generateChatReply, generateResponse };
