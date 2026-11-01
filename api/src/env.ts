function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const DATABASE_URL = required('DATABASE_URL');
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'https://bystrek.dev')
  .split(',')
  .map((origin) => origin.trim());
// Any localhost origin is trusted alongside CORS_ORIGINS, so a local UI can
// talk to any instance of the API: a page served from localhost means a
// process already running on that machine, which CORS was never guarding
// against. Two spellings of the same rule — a RegExp for Express's cors,
// a glob for better-auth's trustedOrigins.
export const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d+)?$/;
export const LOCALHOST_ORIGIN_PATTERN = 'http://localhost:*';
export const RESEND_API_KEY =
  process.env.BYSTREK_LOCAL_DEV === '1' ? process.env.RESEND_API_KEY : required('RESEND_API_KEY');
export const AUTH_SECRET = required('AUTH_SECRET');
export const UI_URL = process.env.UI_URL ?? 'http://localhost:5173';
export const API_URL = process.env.API_URL ?? 'http://localhost:3000';
export const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://localhost:11434';
export const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen2.5:7b';
function positiveInteger(name: string, fallback: string): number {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
export const LLM_TIMEOUT_MS = positiveInteger('LLM_TIMEOUT_MS', '120000');
// Ollama's `think` option. Unset omits it from the request; set it to "true" or "false".
const configuredLlmThink = process.env.LLM_THINK;
if (configuredLlmThink !== undefined && !['true', 'false'].includes(configuredLlmThink)) {
  throw new Error('LLM_THINK must be "true" or "false" when set');
}
export const LLM_THINK: boolean | undefined =
  configuredLlmThink === undefined ? undefined : configuredLlmThink === 'true';
// OpenAI-compatible transcription server (whisper.cpp `whisper-server`, Speaches).
export const STT_BASE_URL = process.env.STT_BASE_URL ?? 'http://localhost:8178';
// Sent as the `model` form field when set; whisper.cpp ignores it, Speaches requires it.
export const STT_MODEL = process.env.STT_MODEL || undefined;
export const STT_TIMEOUT_MS = positiveInteger('STT_TIMEOUT_MS', '30000');
function requiredEncryptionKey(): Buffer {
  const key = Buffer.from(required('ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode (base64) to 32 bytes for AES-256');
  }
  return key;
}
export const ENCRYPTION_KEY = requiredEncryptionKey();
