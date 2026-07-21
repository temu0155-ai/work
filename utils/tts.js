const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Female neural voice. Alternatives: 'en-US-JennyNeural', 'en-GB-SoniaNeural'
const VOICE = process.env.TTS_VOICE || 'en-US-AriaNeural';

async function textToSpeechStream(text) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text);
  return audioStream;
}

module.exports = { textToSpeechStream };
