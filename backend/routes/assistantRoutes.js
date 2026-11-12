import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { screenMessage, screenRecentHistory, getSafetyResponse } from '../services/assistant/safety.js';
import { evaluateEligibility, evaluateStoredAge, resolveAgeContext, safeguardsFor } from '../services/assistant/ageSafeguards.js';
import { validateHistory } from '../services/assistant/history.js';
import { currentMode, getProvider, LIVE_CLAUDE_APPROVED } from '../services/assistant/provider.js';
import {
  evaluateConsent,
  grantConsent,
  loadAssistantProfile,
  noticeVersionFor,
  recordAdultAttestation,
  withdrawConsent,
} from '../services/assistant/consent.js';

// WellBridge AI Support: text chat answered by the configured provider
// (services/assistant/provider.js). The default, and the only mode available
// until live mode is approved, is the development-only mock, which sends
// nothing to any external service. No conversation content is stored and
// message contents are never logged. AI Support is for self-declared adults
// (18+) only; other WellBridge features are not affected.

const router = express.Router();

export const MAX_MESSAGE_LENGTH = 2000;

// Per signed-in user, keyed by the id that requireAuth loaded from the session.
export const assistantLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyFn: (req) => `assistant|${String(req.user._id)}`,
  message: 'You have sent a lot of messages in a short time. Please wait a few minutes and try again.',
});

// Usage cap for an external provider only (claude mode): per signed-in user per
// day. Same in-memory limits as the other limiters (see rateLimit.js).
export const ASSISTANT_DAILY_LIMIT = 200;
export const assistantDailyLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  max: ASSISTANT_DAILY_LIMIT,
  keyFn: (req) => `assistant-daily|${String(req.user._id)}`,
  message: 'You have reached the daily limit for AI Support messages. Please try again tomorrow.',
});

// Status, attestation and consent requests (cheap, but writes are limited too).
export const assistantSettingsLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  keyFn: (req) => `assistant-settings|${String(req.user._id)}`,
  message: 'Too many requests. Please wait a few minutes and try again.',
});

// Fixed texts. The last sentence of NOT_ELIGIBLE repeats wording the app
// already shows (Support.jsx, quizData.js), so an ineligible user is still
// pointed to emergency help.
export const NOT_ELIGIBLE_TEXT = 'WellBridge AI Support is available only to adults aged 18 or over who have confirmed '
  + 'their age. All other WellBridge features are still available to you. If you are in immediate danger, contact '
  + 'your local emergency services.';
export const CONSENT_REQUIRED_TEXT = 'Live AI Support sends your messages to an external AI provider. Please read and '
  + 'accept the AI processing notice before continuing.';
export const LOCAL_CONSENT_REQUIRED_TEXT = 'AI Support in this mode uses an AI model running on the WellBridge server. '
  + 'Please read and accept the AI processing notice before continuing.';

// Runs a limiter inline; false means it has already sent the 429 response.
const passesLimiter = (limiter, req, res) => {
  let passed = false;
  limiter(req, res, () => { passed = true; });
  return passed;
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// A body with only the allowed keys (identity is never taken from the body).
const onlyKeys = (body, allowed) => isPlainObject(body) && Object.keys(body).every((key) => allowed.includes(key));

const badRequest = (res, error, extra = {}) => res.status(400).json({ success: false, error, ...extra });
const notEligible = (res, reason) => res.status(403).json({ success: false, code: 'AI_NOT_ELIGIBLE', reason, error: NOT_ELIGIBLE_TEXT });
const consentRequired = (res, mode) => res.status(403).json({
  success: false,
  code: 'AI_CONSENT_REQUIRED',
  noticeVersion: noticeVersionFor(mode),
  error: mode === 'local' ? LOCAL_CONSENT_REQUIRED_TEXT : CONSENT_REQUIRED_TEXT,
});

const sendSafety = (res, category, mode) => {
  const safety = getSafetyResponse(category);
  return res.json({ success: true, type: 'safety', reply: safety.text, reviewed: safety.reviewed, mode });
};

// Only what the page needs to decide what to show. Never keys, ages,
// timestamps or other configuration.
const statusBody = (profile) => {
  const mode = currentMode();
  const eligibility = evaluateEligibility(profile);
  return {
    success: true,
    mode,
    liveApproved: LIVE_CLAUDE_APPROVED,
    consentRequired: mode !== 'mock',
    noticeVersion: noticeVersionFor(mode),
    eligible: eligibility.eligible,
    eligibilityReason: eligibility.reason,
    consented: evaluateConsent(profile, mode).consented,
  };
};

const sendStatus = async (req, res) => res.json(statusBody(await loadAssistantProfile(req.user._id)));

const settingsRoute = (handler) => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('AI Support settings request failed:', error?.name);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};

router.get('/status', requireAuth, assistantSettingsLimiter, settingsRoute(sendStatus));

// Self-declared adult confirmation for the age currently stored on the
// profile. Body: exactly { confirmAdult: true }. Under-18, missing or invalid
// ages are refused and nothing is recorded.
router.post('/attestation', requireAuth, assistantSettingsLimiter, settingsRoute(async (req, res) => {
  if (!onlyKeys(req.body, ['confirmAdult']) || req.body.confirmAdult !== true) {
    return badRequest(res, 'Please confirm that you are 18 or older.');
  }
  const profile = await loadAssistantProfile(req.user._id);
  const age = evaluateStoredAge(profile);
  if (!age.ok) return notEligible(res, age.reason);
  if (!await recordAdultAttestation(req.user._id, profile.age)) {
    return res.status(409).json({ success: false, code: 'AI_PROFILE_CHANGED', error: 'Your profile changed. Please try again.' });
  }
  return sendStatus(req, res);
}));

// Consent to external AI processing for the current notice version.
// Body: exactly { noticeVersion }. Only an eligible user can consent.
router.post('/consent', requireAuth, assistantSettingsLimiter, settingsRoute(async (req, res) => {
  if (!onlyKeys(req.body, ['noticeVersion']) || typeof req.body.noticeVersion !== 'string') {
    return badRequest(res, 'Please accept the current AI processing notice.');
  }
  const mode = currentMode();
  const noticeVersion = noticeVersionFor(mode);
  if (req.body.noticeVersion !== noticeVersion) {
    return badRequest(res, 'The AI processing notice has changed. Please read the current version.', {
      code: 'AI_NOTICE_OUTDATED', noticeVersion,
    });
  }
  const eligibility = evaluateEligibility(await loadAssistantProfile(req.user._id));
  if (!eligibility.eligible) return notEligible(res, eligibility.reason);
  await grantConsent(req.user._id, mode);
  return sendStatus(req, res);
}));

// Withdrawal: the next request that would go to an external provider is refused.
router.delete('/consent', requireAuth, assistantSettingsLimiter, settingsRoute(async (req, res) => {
  if (req.body !== undefined && !onlyKeys(req.body, [])) return badRequest(res, 'No details are needed to withdraw consent.');
  await withdrawConsent(req.user._id);
  return sendStatus(req, res);
}));

// Order (Phase 2a): authentication, rate limit, validation, 18+ eligibility,
// crisis screening (new message and recent history), provider selection,
// consent for any non-mock provider, then the provider. Nothing is selected
// or initialised before screening, and nothing reaches an external provider
// without current consent.
router.post('/chat', requireAuth, assistantLimiter, async (req, res) => {
  // Replies are personal: never cache them.
  res.set('Cache-Control', 'no-store');
  try {
    // Only `message` and `history` are read. Any username, user id or age in the
    // body is ignored: the user is always req.user.
    const body = req.body;
    const message = body && typeof body === 'object' && !Array.isArray(body) ? body.message : undefined;
    if (typeof message !== 'string') return badRequest(res, 'Please send your message as text.');
    if (!message.trim()) return badRequest(res, 'Please type a message first.');
    if (message.length > MAX_MESSAGE_LENGTH) {
      return badRequest(res, `Please keep your message to ${MAX_MESSAGE_LENGTH} characters or fewer.`);
    }
    // Earlier turns of this page session: context only, never identity or fact, never stored.
    const { history, error: historyError } = validateHistory(body.history);
    if (historyError) return badRequest(res, historyError);

    // 18+ (self-declared) in every mode, from the stored profile on every request.
    const profile = await loadAssistantProfile(req.user._id);
    const eligibility = evaluateEligibility(profile);
    if (!eligibility.eligible) return notEligible(res, eligibility.reason);

    // Possible crisis or medical-emergency messages never reach any reply
    // provider. Product decision B5: once the safety pathway has started in this
    // session (a flagged recent user turn, or a safety response already sent),
    // it continues even if the subject changes.
    const screening = screenMessage(message);
    const continuing = screening.flagged ? screening : screenRecentHistory(history);
    if (continuing.flagged) return sendSafety(res, continuing.category, currentMode());

    const provider = await getProvider();
    if (provider.mode !== 'mock') {
      if (!evaluateConsent(profile, provider.mode).consented) return consentRequired(res, provider.mode);
      if (!passesLimiter(assistantDailyLimiter, req, res)) return undefined;
    }

    const safeguards = safeguardsFor(resolveAgeContext(req.user));
    const result = await provider.generateReply({ message, history, safeguards });
    switch (result?.kind) {
      case 'message':
      case 'declined':
        return res.json({ success: true, type: result.kind, reply: result.reply, mode: provider.mode });
      case 'safety':
        return sendSafety(res, result.category, provider.mode);
      case 'rejected':
        return badRequest(res, result.error);
      case 'unavailable':
        // Product decision B7: a fixed message, never a silent mock reply.
        return res.status(503).json({ success: false, type: 'unavailable', error: result.reply, mode: provider.mode });
      default:
        throw Object.assign(new Error('Unknown provider result'), { name: 'ProviderResultError' });
    }
  } catch (error) {
    console.error('Assistant request failed:', error?.name);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

export default router;
