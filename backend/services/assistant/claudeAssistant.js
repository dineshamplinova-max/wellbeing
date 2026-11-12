import { buildSystemPrompt } from './systemPrompt.js';
import { checkInput, checkReply, FIXED_REPLIES } from './domain.js';

// Claude provider for WellBridge AI Support (Phase 1: built but LOCKED).
//
// This module is only ever loaded through a dynamic import in provider.js when
// the live mode is unlocked, so mock mode never loads it. It does not import
// the Anthropic SDK at the top level either: the SDK is loaded lazily on the
// first real request (and is not installed yet). Tests pass a fake client.
//
// What is sent: the system prompt (instructions + approved digest), the
// validated recent turns of this page session, and the new message. Never the
// username, email, age, user id or any stored record. Nothing is stored, and
// only error class names, error types and reason codes are logged, never text.
//
// SDK details used here were checked against the Anthropic TypeScript/Node SDK
// reference: default export `Anthropic`; `new Anthropic({ apiKey, timeout,
// maxRetries, logLevel })` with `timeout` in milliseconds (timeouts are retried, so the
// worst case is about timeout x (maxRetries + 1)); `client.messages.create` and
// `client.beta.messages.create` with `betas`; `system` text blocks with
// `cache_control`; `output_config.effort`; `stop_reason`; server-side refusal
// fallback `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`
// (not available for Claude Haiku 5.5, which has no server-side fallback).

export const CLAUDE_MODE = 'claude';
export const REQUEST_TIMEOUT_MS = 20_000;
export const MAX_RETRIES = 1;
// Thinking is always on for Claude Opus 5.5 and counts toward max_tokens, so
// this leaves room for it; replies themselves are kept short by the prompt.
export const MAX_OUTPUT_TOKENS = 4000;
export const EFFORT = 'low';
export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const supportsServerFallback = (model) => !String(model).startsWith('claude-haiku');
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const loadAnthropicSdk = async () => (await import('@anthropic-ai/sdk')).default;

// History is validated by history.js (ends with an assistant turn). The API
// conversation must start with a user turn; same-role neighbours are joined.
export const toApiMessages = (history, message) => {
  const turns = [...history, { role: 'user', content: message }];
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const merged = [];
  for (const { role, content } of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`;
    else merged.push({ role, content });
  }
  return merged;
};

export const buildRequest = ({ model, history, message }) => {
  const request = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: toApiMessages(history, message),
    output_config: { effort: EFFORT },
  };
  if (supportsServerFallback(model)) {
    request.betas = [REFUSAL_FALLBACK_BETA];
    request.fallbacks = 'default';
  }
  return request;
};

// Parses the model's JSON reply: exactly { in_scope, crisis_signal, reply }.
// One surrounding code fence is tolerated. Returns null for anything else.
export const parseModelOutput = (text) => {
  let body = String(text || '').trim();
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) body = fence[1];
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isPlainObject(data)) return null;
  if (Object.keys(data).sort().join(',') !== 'crisis_signal,in_scope,reply') return null;
  if (typeof data.in_scope !== 'boolean' || typeof data.crisis_signal !== 'boolean' || typeof data.reply !== 'string') return null;
  return data;
};

const unavailable = (reason) => ({ kind: 'unavailable', reply: FIXED_REPLIES.unavailable, reason });

// Turns an API response into a result. Kinds: message | declined | safety | unavailable.
export const interpretResponse = (response) => {
  if (!isPlainObject(response)) return unavailable('no-response');
  // A policy decline (after any server-side fallback) gets the fixed decline text.
  if (response.stop_reason === 'refusal') return { kind: 'declined', reply: FIXED_REPLIES.declined, reason: 'refusal' };
  // max_tokens, pause_turn, tool_use and anything else: never show a partial reply.
  if (response.stop_reason !== 'end_turn') return unavailable('stop-reason');
  const text = (Array.isArray(response.content) ? response.content : [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
  const output = parseModelOutput(text);
  if (!output) return unavailable('invalid-output');
  if (output.crisis_signal) return { kind: 'safety', category: 'possible-crisis', reason: 'model-crisis-signal' };
  if (!output.in_scope) return { kind: 'declined', reply: FIXED_REPLIES.declined, reason: 'out-of-scope' };
  const guard = checkReply(output.reply);
  if (!guard.ok) return { kind: 'declined', reply: FIXED_REPLIES.guarded, reason: guard.reason };
  return { kind: 'message', reply: output.reply.trim() };
};

// Error class name, the API error type and the HTTP status when present (for
// example "RateLimitError (rate_limit_error) status 429"). Never the message,
// headers or request body.
export const describeError = (error) => {
  const name = typeof error?.name === 'string' && /^[A-Za-z]{1,60}$/.test(error.name) ? error.name : 'Error';
  const type = typeof error?.type === 'string' && /^[a-z_]{1,40}$/.test(error.type) ? ` (${error.type})` : '';
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? ` status ${error.status}` : '';
  return `${name}${type}${status}`;
};

// SDK client options. logLevel 'off' overrides any ANTHROPIC_LOG setting: at
// the SDK's 'debug' level it logs whole HTTP requests and responses, which
// would include users' messages and the replies.
export const SDK_LOG_LEVEL = 'off';
export const clientOptions = (apiKey) => ({
  apiKey,
  timeout: REQUEST_TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
  logLevel: SDK_LOG_LEVEL,
});

export const createClaudeProvider = ({
  apiKey,
  model,
  client: injectedClient = null,
  loadSdk = loadAnthropicSdk,
} = {}) => {
  let client = injectedClient;

  const getClient = async () => {
    if (client) return client;
    if (!apiKey) throw Object.assign(new Error('Missing API key'), { name: 'MissingApiKey' });
    const Anthropic = await loadSdk();
    client = new Anthropic(clientOptions(apiKey));
    return client;
  };

  const generateReply = async ({ message, history = [] }) => {
    const input = checkInput(message, history);
    if (input.rejected) return { kind: 'rejected', error: input.error };
    if (input.declined) return { kind: 'declined', reply: FIXED_REPLIES.declined, reason: 'out-of-scope-input' };

    let api;
    try {
      api = await getClient();
    } catch (error) {
      console.error('AI Support provider could not start:', describeError(error));
      return unavailable('client-unavailable');
    }

    const request = buildRequest({ model, history, message });
    let response;
    try {
      // The beta namespace is needed only for the server-side refusal fallback.
      response = request.betas ? await api.beta.messages.create(request) : await api.messages.create(request);
    } catch (error) {
      // Timeouts, rate limits (429), overload/5xx and connection errors all end
      // here. Product decision B7: a fixed unavailability message, never a mock reply.
      console.error('AI Support provider request failed:', describeError(error));
      return unavailable('request-failed');
    }

    const result = interpretResponse(response);
    if (result.kind === 'unavailable' || result.reason === 'refusal' || result.kind === 'declined') {
      console.warn('AI Support provider reply replaced:', result.reason);
    }
    return result;
  };

  return Object.freeze({ mode: CLAUDE_MODE, model, generateReply });
};
