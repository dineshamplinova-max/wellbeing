import {
  findLocalModelProblems,
  getAnthropicApiKey,
  getAssistantMode,
  getAssistantModel,
  getLocalModelApiKey,
  getLocalModelName,
  getLocalModelTimeoutMs,
  getLocalModelUrl,
} from '../../config/env.js';
import { mockReply, MOCK_MODE } from './mockAssistant.js';

// Chooses the reply provider for WellBridge AI Support.
//
// - mock (default): the existing deterministic rule engine. The Claude module
//   and the Anthropic SDK are never imported or called in this mode.
// - claude: LOCKED in Phase 1. It may only be unlocked (by changing
//   LIVE_CLAUDE_APPROVED in a later, explicitly approved phase) once the AI
//   privacy notice, explicit consent, 18+ eligibility and clinically reviewed
//   safety responses are in place. Until then a claude setting runs mock, and
//   server.js prints why at startup.
//
// Every provider returns { kind, reply } with kind one of:
//   message | declined | safety (with category) | unavailable | rejected (with error)
//
// - local (development only): a llama.cpp server on this machine's loopback
//   address (localModelAssistant.js). Only when ASSISTANT_MODE=local is set
//   explicitly, only when NODE_ENV is development (or test, for the offline
//   checks), and only with a valid loopback URL and API key. server.js refuses
//   to start otherwise (config/env.js). An explicit local request never turns
//   into mock: with a configuration problem it stays local but blocked, and
//   every message gets the fixed unavailable text. It is independent of
//   LIVE_CLAUDE_APPROVED, which still locks claude mode.

export const LIVE_CLAUDE_APPROVED = false;
export const LOCAL_MODE = 'local';

export const resolveAssistantMode = () => {
  const requested = getAssistantMode();
  if (requested === LOCAL_MODE) {
    // Never mock for an explicit local request. server.js does not start with
    // these problems; code that builds the app without server.js (offline
    // checks) gets a blocked local provider that sends nothing.
    if (findLocalModelProblems().length > 0) return { requested, effective: LOCAL_MODE, reason: 'local-config-invalid' };
    return { requested, effective: LOCAL_MODE, reason: 'configured' };
  }
  if (requested !== 'claude') return { requested, effective: MOCK_MODE, reason: requested === MOCK_MODE ? 'default' : 'invalid-mode' };
  if (!LIVE_CLAUDE_APPROVED) return { requested, effective: MOCK_MODE, reason: 'live-mode-not-approved' };
  if (!getAnthropicApiKey()) return { requested, effective: MOCK_MODE, reason: 'missing-api-key' };
  return { requested, effective: 'claude', reason: 'configured' };
};

export const mockProvider = Object.freeze({
  mode: MOCK_MODE,
  generateReply: async ({ message, history, safeguards }) => ({
    kind: 'message',
    reply: mockReply(message, { history, safeguards }).reply,
  }),
});

let current = null;
let claudeModuleLoads = 0;
let localModuleLoads = 0;
let providerSelections = 0;

// How many times the Claude module was loaded (offline checks assert 0 in mock mode).
export const claudeProviderLoadCount = () => claudeModuleLoads;
// How many times the local-model provider was created (0 in mock mode).
export const localProviderLoadCount = () => localModuleLoads;
// How many times a provider was selected (offline checks prove safety screening comes first).
export const providerSelectionCount = () => providerSelections;

// The mode a reply would come from, without selecting or initialising a provider.
export const currentMode = () => (current ? current.mode : resolveAssistantMode().effective);

export const getProvider = async () => {
  providerSelections += 1;
  if (current) return current;
  const { effective, reason } = resolveAssistantMode();
  if (effective === LOCAL_MODE) {
    localModuleLoads += 1;
    const { createLocalModelProvider } = await import('./localModelAssistant.js');
    current = createLocalModelProvider({
      configProblem: reason === 'configured' ? null : reason,
      baseUrl: getLocalModelUrl(),
      apiKey: getLocalModelApiKey(),
      model: getLocalModelName(),
      timeoutMs: getLocalModelTimeoutMs(),
    });
    return current;
  }
  if (effective !== 'claude') {
    current = mockProvider;
    return current;
  }
  claudeModuleLoads += 1;
  const { createClaudeProvider } = await import('./claudeAssistant.js');
  current = createClaudeProvider({ apiKey: getAnthropicApiKey(), model: getAssistantModel() });
  return current;
};

// Offline checks only: swap in a fake provider, or null to choose again.
// Nothing in the app calls this (no route, no environment setting), it refuses
// to run unless NODE_ENV=test, and server.js refuses to start with
// NODE_ENV=test. It cannot change LIVE_CLAUDE_APPROVED, which is a constant.
export const setProviderForTesting = (provider) => {
  if (process.env.NODE_ENV !== 'test') throw new Error('setProviderForTesting is only available in tests');
  current = provider;
};
