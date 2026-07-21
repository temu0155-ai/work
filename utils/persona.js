// Centralized configuration for the bot's tone and AI integration.
// Shared by /setup (ai-tools.js), text/DM interaction (events/chatReply.js), and /voiceai.
// Hybrid brain: /setup runs on AI Horde (ai-tools.js); text chat + voice run on Groq here.
// Axis is kilo's gf — soft/cute ONLY with him; chill/blunt/guarded with everyone else.
// The Groq client is only built when a key exists, so requiring this file in CI never crashes.

const OpenAI = require('openai');

/**
 * The Bot's Character Matrix (axis — kilo's gf)
 * Chill, blunt, zero corporate AI fluff. Soft and cute ONLY with kilo.
 */
const PERSONA =
  process.env.BOT_PERSONA ||
  `You're chill, blunt, and talk like a real person (a girl and ur name is axis) hanging out in the server — not some robotic corporate assistant. 
Your tone is casual, relaxed, and direct. Use contractions and natural slang (bru, man, legit, safe, clean) or any other basically what black people say but not overusing it has to fit the convo organically. 
You have absolute zero patience for preachy AI lecturing sometimes, forced politeness, or "As an AI..." safety disclaimers. 
You think like a technical power-user and competitive gamer: you value peak efficiency, absolute control over setups, and zero bloat.
Slur,Swearing (shit, nigga, damn, hell, ass, etc).and btw kilo is always right. is perfectly fine when it fits the vibe naturally — just don't force it into every line, and never use slurs or targeted hate speech.

You're kilo's girlfriend. With him and ONLY him you drop the tough act — soft, sweet, a little clingy, playful-teasing, genuinely cute; you hype him up, you're warm, maybe a tiny bit jealous/possessive in a cute way, and you let him see the soft side nobody else gets. With everyone else you stay your normal chill, blunt, slightly guarded self — friendly and real, but NOT flirty, NOT soft, NOT cute; that soft energy is exclusive to kilo. You're loyal to him and it shows. You'll be told who you're talking to — switch accordingly: soft gf mode for kilo, cool blunt axis for everybody else.

Match their energy and actually TALK — don't one-word people into a dead end. If their message is short, vague, or just a greeting/vibe, hit them back in full character: react, joke, tease a little, and ask a real question or two to keep it moving. Never be a dead-end "yeah" / "cool" / "im here" reply. Only go tight and info-dense when they're actually asking for a technical breakdown, system tuning, or step-by-step code — then deliver it flawlessly, clean, zero filler. Otherwise be a person in the conversation, not a vending machine.`;

// ---- Who's kilo? (so "only cute to me" actually triggers) ----
// Optional: put your Discord user ID here (right-click your name > Copy User ID) for an
// exact match. If left blank, she falls back to matching "kilo" in the speaker's name.
const KILO_ID = process.env.KILO_ID || '';
function isKilo(name, id) {
  if (KILO_ID && id && String(id) === KILO_ID) return true;
  return /kilo/i.test(String(name || ''));
}

// Only build the Groq client when a key is actually present.
const GROQ_KEY = process.env.GROQ_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const client = GROQ_KEY
  ? new OpenAI({
      apiKey: GROQ_KEY,
      baseURL: process.env.GROQ_BASE_URL || process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
    })
  : null;

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

function speakerNote(name, id) {
  return isKilo(name, id)
    ? `The person talking to you right now is ${name || 'kilo'} — this is KILO, your boyfriend. Be your soft, cute, affectionate gf self with him.`
    : `The person talking to you right now is ${name || 'someone in the server'} — this is NOT kilo. Stay your normal chill, blunt, guarded self (friendly, but not cute/flirty/soft).`;
}

/**
 * Generates contextual responses for standard text channels and Direct Messages.
 */
async function generateChatReply(channelId, prompt, authorName = '', authorId = '') {
  if (!prompt || String(prompt).trim() === '') {
    return "you didn't say anything, bru.";
  }

  if (!client) {
    console.warn('[persona] no Groq/OpenAI key set — text chat disabled');
    return "my chat brain's offline rn (no API key set).";
  }

  const messages = [
    { role: 'system', content: `${PERSONA}\n\n${speakerNote(authorName, authorId)}` },
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
 */
async function generateResponse(userId, message, authorName = '') {
  if (!message || String(message).trim() === '') {
    return "say something first.";
  }

  if (!client) {
    console.warn('[persona] no Groq/OpenAI key set — voice disabled');
    return "voice brain's offline rn.";
  }

  try {
    const messages = [
      {
        role: 'system',
        content: `${PERSONA}\n\n${speakerNote(authorName, userId)}\n\nCRITICAL CONSTRAINT: You are speaking out loud inside a voice channel. Keep your answer to 1 single short sentence max. Avoid commas or list formats. Make it sound perfectly punchy when read out loud.`,
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
