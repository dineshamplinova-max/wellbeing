// Central place for reading backend configuration. Values are read when the
// functions are called (not at import time) so tests can set them first.
// Nothing in this module ever logs or returns a secret value.

const DEV_CORS_ORIGINS = ['http://localhost:3000'];
const SAME_SITE_VALUES = ['lax', 'strict', 'none'];
const MIN_JWT_SECRET_LENGTH = 32;

export const isProduction = () => process.env.NODE_ENV === 'production';

export const getJwtSecret = () => process.env.JWT_SECRET || '';

// MONGODB_URI is the documented name; MOGODB_URL is the misspelled name from the
// old sample file, still accepted so existing .env files keep working.
export const getMongoUri = () => process.env.MONGODB_URI || process.env.MOGODB_URL || '';

// Frontend origins allowed to make credentialed requests. Outside production the
// local React dev server is allowed by default.
export const getCorsOrigins = () => {
  const raw = (process.env.CORS_ORIGINS || '').trim();
  if (raw) return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return isProduction() ? [] : DEV_CORS_ORIGINS;
};

export const getCookieSameSite = () => {
  const value = (process.env.COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  return SAME_SITE_VALUES.includes(value) ? value : 'lax';
};

// WellBridge AI Support provider. "mock" (the default) never loads or calls the
// Anthropic SDK. "claude" is additionally locked in services/assistant/provider.js
// until consent, 18+ eligibility and reviewed safety responses exist. "local"
// (development only) uses a llama.cpp server on this machine's loopback address.
export const ASSISTANT_MODES = ['mock', 'claude', 'local'];
export const DEFAULT_ASSISTANT_MODEL = 'claude-opus-5-5';

export const getAssistantMode = () => (process.env.ASSISTANT_MODE || 'mock').trim().toLowerCase();
export const getAssistantModel = () => (process.env.ASSISTANT_MODEL || '').trim() || DEFAULT_ASSISTANT_MODEL;
// Backend only. Read solely to construct the SDK client in claude mode; never
// logged, returned in a response, or exposed to the frontend.
export const getAnthropicApiKey = () => (process.env.ANTHROPIC_API_KEY || '').trim();

// ---- Local model (ASSISTANT_MODE=local) ----------------------------------------
// The backend talks to the llama.cpp server only over loopback (127.0.0.1 or
// ::1). The URL and key are backend only: never logged, returned in a response,
// or exposed to the frontend.
export const DEFAULT_LOCAL_MODEL_URL = 'http://127.0.0.1:8080';
export const DEFAULT_LOCAL_MODEL_NAME = 'qwen3-4b-q4_k_m';
// CPU inference is slow (measured: ~65 s to read the prompt cold, ~2.5 tokens/s
// to generate), so local mode allows up to 2 minutes. Mock and claude modes are
// unaffected.
export const DEFAULT_LOCAL_MODEL_TIMEOUT_MS = 120_000;
export const MIN_LOCAL_MODEL_TIMEOUT_MS = 5_000;
// Below the page's 130 s local-mode chat timeout (LOCAL_CHAT_TIMEOUT_MS in
// Therapist.jsx), so the page always gets the backend's answer.
export const MAX_LOCAL_MODEL_TIMEOUT_MS = 120_000;

const LOOPBACK_URL_RE = /^http:\/\/(127\.0\.0\.1|\[::1\]):([0-9]{1,5})\/?$/;
const LOCAL_MODEL_NAME_RE = /^[A-Za-z0-9._:-]{1,100}$/;
// Printable ASCII without spaces (safe in an Authorization header), 16-256 characters.
const LOCAL_MODEL_KEY_RE = /^[\x21-\x7E]{16,256}$/;

// The origin (scheme, loopback host and port) to use, or null when the value is
// not exactly http://127.0.0.1:<port> or http://[::1]:<port>. No other host,
// no credentials, path, query or fragment, and no https (loopback only).
export const parseLocalModelUrl = (raw) => {
  const match = typeof raw === 'string' ? raw.match(LOOPBACK_URL_RE) : null;
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `http://${match[1]}:${port}`;
};

export const getLocalModelUrl = () => (process.env.LOCAL_MODEL_URL || '').trim() || DEFAULT_LOCAL_MODEL_URL;
export const getLocalModelName = () => (process.env.LOCAL_MODEL_NAME || '').trim() || DEFAULT_LOCAL_MODEL_NAME;
export const getLocalModelApiKey = () => (process.env.LOCAL_MODEL_API_KEY || '').trim();
// NaN when the value is set but is not a whole number.
export const getLocalModelTimeoutMs = () => {
  const raw = (process.env.LOCAL_MODEL_TIMEOUT_MS || '').trim();
  if (!raw) return DEFAULT_LOCAL_MODEL_TIMEOUT_MS;
  return /^[0-9]{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
};

// Local mode is development only. It is allowed only when NODE_ENV is exactly
// one of these values (test is used by the offline checks; server.js refuses to
// start with it). A missing, misspelt or unexpected NODE_ENV ("Production",
// "prod", "staging", empty) is refused, so a deployment cannot enable it by
// accident. This applies only when ASSISTANT_MODE=local; nothing else changes.
export const LOCAL_MODE_NODE_ENVS = Object.freeze(['development', 'test']);

// Names (never values) of local-model settings that are missing or unusable.
// Checked only when ASSISTANT_MODE=local.
export const findLocalModelProblems = () => {
  const problems = [];
  if (!LOCAL_MODE_NODE_ENVS.includes(process.env.NODE_ENV)) {
    problems.push('ASSISTANT_MODE=local (only allowed when NODE_ENV=development; never in production)');
  }
  if (!parseLocalModelUrl(getLocalModelUrl())) {
    problems.push('LOCAL_MODEL_URL (must be http://127.0.0.1:<port> or http://[::1]:<port>)');
  }
  const localKey = getLocalModelApiKey();
  if (!LOCAL_MODEL_KEY_RE.test(localKey) || localKey.startsWith('replace-with')) {
    problems.push('LOCAL_MODEL_API_KEY (required when ASSISTANT_MODE=local: 16 to 256 printable characters, no spaces, not the sample placeholder)');
  }
  if (!LOCAL_MODEL_NAME_RE.test(getLocalModelName())) {
    problems.push('LOCAL_MODEL_NAME (letters, digits, dot, dash, underscore or colon; at most 100 characters)');
  }
  const timeout = getLocalModelTimeoutMs();
  if (!Number.isInteger(timeout) || timeout < MIN_LOCAL_MODEL_TIMEOUT_MS || timeout > MAX_LOCAL_MODEL_TIMEOUT_MS) {
    problems.push(`LOCAL_MODEL_TIMEOUT_MS (whole milliseconds from ${MIN_LOCAL_MODEL_TIMEOUT_MS} to ${MAX_LOCAL_MODEL_TIMEOUT_MS})`);
  }
  return problems;
};

// Returns the names (never the values) of missing or unusable settings.
export const findConfigProblems = () => {
  const problems = [];
  const secret = getJwtSecret();
  if (secret.length < MIN_JWT_SECRET_LENGTH || secret.startsWith('replace-with')) {
    problems.push(`JWT_SECRET (must be set, at least ${MIN_JWT_SECRET_LENGTH} characters, and not the sample placeholder)`);
  }
  if (!getMongoUri()) problems.push('MONGODB_URI');
  if (isProduction() && !(process.env.CORS_ORIGINS || '').trim()) {
    problems.push('CORS_ORIGINS (required when NODE_ENV=production)');
  }
  const sameSite = (process.env.COOKIE_SAMESITE || '').trim().toLowerCase();
  if (sameSite && !SAME_SITE_VALUES.includes(sameSite)) {
    problems.push('COOKIE_SAMESITE (must be lax, strict or none)');
  }
  if (!ASSISTANT_MODES.includes(getAssistantMode())) {
    problems.push('ASSISTANT_MODE (must be mock, claude or local)');
  }
  if (getAssistantMode() === 'local') problems.push(...findLocalModelProblems());
  return problems;
};
