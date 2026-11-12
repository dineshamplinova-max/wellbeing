import { parseLocalModelUrl } from '../../config/env.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { checkInput, FIXED_REPLIES } from './domain.js';
// Reused unchanged from the Claude provider: the turn merging and the output
// pipeline (exact JSON shape, crisis signal, scope, then domain.js checkReply).
// That module never imports the Anthropic SDK at the top level (it is loaded
// lazily, and only by createClaudeProvider), so nothing from the SDK runs here.
import { interpretResponse, toApiMessages } from './claudeAssistant.js';

// Local model provider for WellBridge AI Support (ASSISTANT_MODE=local,
// development only): a llama.cpp server's OpenAI-compatible chat endpoint on
// this machine's loopback address.
//
// What is sent: the system prompt (instructions + approved digest), the
// validated recent turns of this page session and the new message. Never the
// username, email, age, user id or any stored record (journals, moods, profile,
// community posts). Nothing is stored. Only short reason codes are logged,
// never prompts, replies, tokens, URLs or keys.
//
// Safety: the route has already applied authentication, rate limits, 18+
// eligibility, crisis screening, consent and the daily cap before this runs.
// Failures never fall back to a mock reply (product decision B7): they give the
// fixed unavailable text. No automatic retries.

export const LOCAL_MODE = 'local';
export const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
// Replies are kept short by the prompt (domain.js allows at most 2000 characters).
// 256 leaves ~230 tokens (~900 characters) for the reply after the JSON wrapper
// and bounds CPU generation time. A reply that hits the limit (finish_reason
// "length") is never shown: it gets the fixed unavailable text.
export const MAX_OUTPUT_TOKENS = 256;
// Only the most recent validated turns are sent to the model, to keep CPU
// prompt processing short. Safety screening has already run on the FULL
// validated history in the route (assistantRoutes.js) before this is reached.
export const MAX_LOCAL_HISTORY_TURNS = 4;
export const TEMPERATURE = 0.3;
// A normal reply is a few kilobytes; anything far larger is refused unread.
export const MAX_RESPONSE_BYTES = 64 * 1024;
// One request at a time: CPU inference is slow, and a queue would only time out.
export const MAX_IN_FLIGHT = 1;
// After a timeout (or a network failure after the request may have been
// received), llama-server may still be working on the abandoned request:
// closing the connection is not guaranteed to cancel it. Nothing more is sent
// until this has passed, so requests never overlap on the server. It covers a
// slow CPU case: reading the ~4,000-token prompt plus MAX_OUTPUT_TOKENS of
// generation. Requests that got any HTTP response (the server had finished) and
// refused connections (nothing was received) do not start a cooldown.
export const TIMEOUT_COOLDOWN_MS = 180_000;
const MAY_STILL_BE_RUNNING = new Set(['local-timeout', 'local-request-failed']);

// Asks llama.cpp to constrain the output to the JSON the parser expects. The
// reply is validated in full afterwards either way (parseModelOutput).
export const RESPONSE_FORMAT = Object.freeze({
  type: 'json_schema',
  json_schema: {
    name: 'wellbridge_reply',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        in_scope: { type: 'boolean' },
        crisis_signal: { type: 'boolean' },
        reply: { type: 'string' },
      },
      required: ['in_scope', 'crisis_signal', 'reply'],
      additionalProperties: false,
    },
  },
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = (reason) => ({ kind: 'unavailable', reply: FIXED_REPLIES.unavailable, reason });
// Reason codes only (fixed strings chosen here), never text from the model or the request.
const logFailure = (reason) => console.error('AI Support local model request failed:', reason);

// The last MAX_LOCAL_HISTORY_TURNS turns. toApiMessages then drops a leading
// assistant turn, so the conversation still starts with the user.
export const trimLocalHistory = (history) => (Array.isArray(history) ? history.slice(-MAX_LOCAL_HISTORY_TURNS) : []);

export const buildLocalRequest = ({ model, history, message }) => ({
  model,
  messages: [{ role: 'system', content: buildSystemPrompt() }, ...toApiMessages(trimLocalHistory(history), message)],
  max_tokens: MAX_OUTPUT_TOKENS,
  temperature: TEMPERATURE,
  stream: false,
  response_format: RESPONSE_FORMAT,
  // Qwen3: answer directly, without a thinking section.
  chat_template_kwargs: { enable_thinking: false },
});

// Qwen3 may put an EMPTY thinking block in front of the answer. Only an empty
// one is removed; any other text around the JSON makes the reply invalid.
const EMPTY_THINK_RE = /^\s*<think>\s*<\/think>\s*/;
export const stripEmptyThinkBlock = (text) => text.replace(EMPTY_THINK_RE, '');

// Turns an OpenAI-style chat completion into the shape interpretResponse reads.
// Only finish_reason "stop" is a complete answer. Any reasoning field the server
// returns is ignored (never shown, never logged).
export const toInterpretable = (data) => {
  if (!isPlainObject(data) || !Array.isArray(data.choices) || data.choices.length !== 1) return null;
  const [choice] = data.choices;
  if (!isPlainObject(choice) || !isPlainObject(choice.message) || typeof choice.message.content !== 'string') return null;
  return {
    stop_reason: choice.finish_reason === 'stop' ? 'end_turn' : 'incomplete',
    content: [{ type: 'text', text: stripEmptyThinkBlock(choice.message.content) }],
  };
};

// Reads at most `limit` bytes of the body as UTF-8. null when it is larger or
// not valid UTF-8; the rest of the body is then discarded unread.
export const readLimitedText = async (response, limit = MAX_RESPONSE_BYTES) => {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return null;
  }
};

// A reason code for a failed fetch. AbortSignal.timeout raises TimeoutError.
const fetchFailureReason = (error) => {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'local-timeout';
  if (error?.cause?.code === 'ECONNREFUSED') return 'local-unreachable';
  return 'local-request-failed';
};

// Distinct codes help the manual compatibility check: an older or differently
// built llama-server may reject response_format or chat_template_kwargs (400),
// not offer the endpoint (404) or not support a feature (501). The error body
// is never read or logged.
const httpFailureReason = (status) => {
  if (status === 401 || status === 403) return 'local-auth-failed';
  if (status === 400) return 'local-request-rejected';
  if (status === 404) return 'local-endpoint-not-found';
  if (status === 501) return 'local-not-supported';
  if (status === 503) return 'local-server-busy-or-loading';
  if (status >= 300 && status < 400) return 'local-redirect-refused';
  return 'local-http-error';
};

export const createLocalModelProvider = ({
  baseUrl,
  apiKey,
  model,
  timeoutMs,
  // A configuration problem found by provider.js: the provider is blocked and sends nothing.
  configProblem = null,
  cooldownMs = TIMEOUT_COOLDOWN_MS,
  // Looked up at call time, so offline checks can replace globalThis.fetch.
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) => {
  // Checked again here, so this module can never be pointed at another host.
  const origin = parseLocalModelUrl(baseUrl);
  const configured = !configProblem && Boolean(origin) && typeof apiKey === 'string' && apiKey.length > 0
    && Number.isInteger(timeoutMs) && timeoutMs > 0;
  const endpoint = origin ? `${origin}${CHAT_COMPLETIONS_PATH}` : null;
  let inFlight = 0;
  // Nothing is sent before this time (see TIMEOUT_COOLDOWN_MS).
  let blockedUntil = 0;

  const send = async (request) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { failure: fetchFailureReason(error) };
    }
    if (response.status !== 200 || response.redirected) {
      await response.body?.cancel().catch(() => {});
      return { failure: response.redirected ? 'local-redirect-refused' : httpFailureReason(response.status) };
    }
    if (!/^application\/json\b/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel().catch(() => {});
      return { failure: 'local-not-json' };
    }
    let text;
    try {
      text = await readLimitedText(response);
    } catch (error) {
      return { failure: fetchFailureReason(error) };
    }
    if (text === null) return { failure: 'local-response-too-large-or-invalid' };
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { failure: 'local-invalid-json' };
    }
  };

  const generateReply = async ({ message, history = [] }) => {
    const input = checkInput(message, history);
    if (input.rejected) return { kind: 'rejected', error: input.error };
    if (input.declined) return { kind: 'declined', reply: FIXED_REPLIES.declined, reason: 'out-of-scope-input' };

    if (!configured) {
      logFailure('local-config-invalid');
      return unavailable('local-config-invalid');
    }
    if (inFlight >= MAX_IN_FLIGHT) {
      logFailure('local-busy');
      return unavailable('local-busy');
    }
    if (now() < blockedUntil) {
      logFailure('local-cooling-down');
      return unavailable('local-cooling-down');
    }

    inFlight += 1;
    let outcome;
    try {
      outcome = await send(buildLocalRequest({ model, history, message }));
    } catch {
      // send() handles its own errors; anything else is treated as unknown.
      outcome = { failure: 'local-request-failed' };
    } finally {
      // Set before the lock is released (same synchronous step), so no request
      // can slip in between.
      if (!outcome || MAY_STILL_BE_RUNNING.has(outcome.failure)) blockedUntil = now() + cooldownMs;
      inFlight -= 1;
    }
    if (outcome.failure) {
      logFailure(outcome.failure);
      return unavailable(outcome.failure);
    }

    const shaped = toInterpretable(outcome.data);
    if (!shaped) {
      logFailure('local-unexpected-shape');
      return unavailable('local-unexpected-shape');
    }
    const result = interpretResponse(shaped);
    if (result.kind === 'unavailable' || result.kind === 'declined') {
      console.warn('AI Support local model reply replaced:', result.reason);
    }
    return result;
  };

  return Object.freeze({ mode: LOCAL_MODE, model, generateReply });
};
