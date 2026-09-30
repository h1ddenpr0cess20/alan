export const KNOWN_VOICES = Object.freeze([
  'ripple', 'vesper', 'stone', 'meridian', 'tempo', 'beacon', 'cinder',
]);

function flag(value, fallback) {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

export function loadConfig(env = process.env) {
  const defaultVoice = env.OPENAI_VOICE || KNOWN_VOICES[0];

  return {
    port: Number(env.PORT) || 5173,
    baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: env.OPENAI_API_KEY,
    defaultModel: env.OPENAI_LIVE_MODEL || 'gpt-live-1',
    backendModel: env.OPENAI_BACKEND_MODEL || 'gpt-5.6-terra',
    webSearch: flag(env.WEB_SEARCH, true),
    defaultVoice,
    voices: KNOWN_VOICES.includes(defaultVoice)
      ? [...KNOWN_VOICES]
      : [defaultVoice, ...KNOWN_VOICES],
    memory: flag(env.MEMORY, true),
  };
}
