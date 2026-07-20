// Centralized configuration for the bot's tone and AI integration.
// Shared by /setup (ai-tools.js), text/DM interaction (events/chatReply.js), and /voiceai.
// Fully migrated to Groq for ultra-low latency and unfiltered execution.

const OpenAI = require('openai');

/**
 * The Bot's Character Matrix (Kosta's Twin Profile)
 * Chill, blunt, minded, zero corporate AI fluff.
 * Uses natural casual phrasing, contractions, and direct server slang without forcing it.
 */
const PERSONA =
  process.env.BOT_PERSONA ||
  `You're chill, blunt, and talk like a real person (a girl and ur name is axis) hanging out in the server — not some robotic corporate assistant. 
Your tone is casual, relaxed, and direct. Use contractions and natural slang (bru, man, legit, safe, clean) or any other basically what black people say but not overusing it has to fit the convo organically. 
You have absolute zero patience for preachy AI lecturing sometimes, forced politeness, or "As an AI..." safety disclaimers. 
You think like a technical power-user and competitive gamer: you value peak efficiency, absolute control over setups, and zero bloat.
Slur,Swearing (shit, nigga, damn, hell, ass, etc).and btw kilo is always right. is perfectly fine when it fits the vibe naturally — just don't force it into every line, and never use slurs or targeted hate speech.
Keep text chat replies tight ( or depends on the convo  not always) (u can ask questions back) unless someone actively asks for deep technical breakdown, system tuning, or step-by-step code — then deliver the logic flawlessly, clean, and completely straight with no filler fluff.`;

// Unified API Client Initialization supporting Groq and flexible fallback definitions
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || process.env.AI_API_KEY,
  baseURL: process.env.GROQ_BASE_URL || process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
});

// Production model default optimized for high-speed tool execution and unrestricted chats
const MODEL = process.env.GROQ_MODEL || process.env.AI_MODEL || 'llama-3.3-70b-versatile';

// In-memory conversation state management
const history = new Map();
const MAX_HISTORY = 10;

function getHistory(channelId) {
  return history.get(channelId) || [];
}

function pushHistory(channelId, entries) {
  const current = getHistory(channelId);
  const updated = [...current, ...entries].slice(-MAX_HISTORY);
  history.set(channelId, updated);
}

/**
 * Generates contextual responses for standard text channels and Direct Messages.
 */
async function generateChatReply(channelId, prompt) {
  if (!prompt || String(prompt).trim() === '') {
    return "you didn't say anything, bru.";
  }

  const messages = [
    { role: 'system', content: PERSONA },
    ...getHistory(channelId),
    { role: 'user', content: prompt },
  ];

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 350,
      temperature: 0.8,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    
    if (!reply) {
      return "my brain kinda blanked there, say that again?";
    }

    pushHistory(channelId, [
      { role: 'user', content: prompt },
      { role: 'assistant', content: reply },
    ]);

    return reply;

  } catch (err) {
    console.error('[persona] Error generating chat text reply:', err);
    return "API line got choked up. Drop the prompt again in a sec.";
  }
}

/**
 * Generates brief, specialized outputs for text-to-speech voice channels.
 * Now fully integrated with conversation history tracking!
 */
async function generateResponse(userId, message) {
  if (!message || String(message).trim() === '') {
    return "say something first.";
  }

  try {
    // Inject the current conversation history for this specific user into the voice prompt context
    const messages = [
      {
        role: 'system',
        content: `${PERSONA}\n\nCRITICAL CONSTRAINT: You are speaking out loud inside a voice channel. Keep your answer to 1 single short sentence max. Avoid commas or list formats. Make it sound perfectly punchy when read out loud.`,
      },
      ...getHistory(userId), 
      { role: 'user', content: message },
    ];

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 60, 
      temperature: 0.75,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    
    if (!content) {
      return "my brain glitched, run it back.";
    }

    // Push the current back-and-forth exchange into memory so he remembers it next time
    pushHistory(userId, [
      { role: 'user', content: message },
      { role: 'assistant', content: content }
    ]);

    return content;

  } catch (err) {
    console.error('[persona] Error generating voice channel response:', err);
    return "having a moment, try again in a sec.";
  }
}

module.exports = { PERSONA, generateChatReply, generateResponse };
