import { findPersonalInfo } from '../../utils/communityContent.js';

// Domain restriction layers 1 (input, before any provider call) and 3 (output,
// after the model replies) for the Claude provider. Layer 2 is systemPrompt.js.
//
// LIMITATIONS (on purpose): these are simple patterns. Layer 1 only blocks what
// it can recognise with high precision, so that everyday wellbeing messages
// ("my boss is stressing me") are never rejected by keywords. Layer 3 checks
// wording, not meaning or accuracy, and errs on the side of replacing a reply.
// Nothing here stores or logs text.

export const MAX_REPLY_LENGTH = 2000;

// Fixed texts. They contain no clinical guidance and no contact numbers; the
// support sentences repeat wording the app already shows (Support.jsx, quizData.js).
export const FIXED_REPLIES = Object.freeze({
  declined: 'I can only help with wellbeing topics covered by WellBridge, such as stress, sleep, mood, feeling connected, '
    + 'relaxation exercises and journaling. Is there something along those lines you would like to talk about?',
  guarded: "I'm not able to give a reply to that here. A doctor or a licensed mental health professional can talk through "
    + 'how you have been feeling and what support might help.',
  unavailable: 'WellBridge AI Support is temporarily unavailable. Please try again in a few minutes. '
    + 'If you are in immediate danger, contact your local emergency services.',
});

export const PERSONAL_INFO_REJECTION = 'Please remove contact details such as email addresses, phone numbers, links or '
  + '@usernames before sending. WellBridge AI Support does not need them.';

const CODE_BLOCK_RE = /```/;

// Layer 1. Contact details are never sent to the provider (privacy); a code
// block is an unambiguous out-of-scope request. Returns { ok } or
// { rejected, error } (400, not sent) or { declined } (fixed decline, not sent).
export const checkInput = (message, history = []) => {
  for (const text of [message, ...history.map((turn) => turn.content)]) {
    if (findPersonalInfo(text)) return { rejected: true, error: PERSONAL_INFO_REJECTION };
  }
  if (CODE_BLOCK_RE.test(message)) return { declined: true };
  return { ok: true };
};

// Medical vocabulary the assistant must never use (it may not diagnose or
// discuss medication), and claims to be a professional.
const MEDICAL_RE = /\b(?:diagnos\w*|medications?|medicines?|prescri\w*|dos(?:e|es|age)|antidepressants?|tablets?|pills?|paracetamol|ibuprofen|aspirin)\b/i;
const ROLE_CLAIM_RE = /\bI(?:\s+am|['’]m)\s+(?:a|an|your)\s+(?:licensed\s+|qualified\s+|trained\s+|real\s+)?(?:therapist|doctor|psychologist|psychiatrist|counsell?or|clinician|nurse)\b/i;

// Layer 3. Returns { ok: true } or { ok: false, reason } with a short reason
// code (safe to log; never the text itself).
export const checkReply = (reply) => {
  if (typeof reply !== 'string' || !reply.trim()) return { ok: false, reason: 'empty' };
  if (reply.length > MAX_REPLY_LENGTH) return { ok: false, reason: 'too-long' };
  if (findPersonalInfo(reply)) return { ok: false, reason: 'contact-details' };
  if (MEDICAL_RE.test(reply)) return { ok: false, reason: 'medical' };
  if (ROLE_CLAIM_RE.test(reply)) return { ok: false, reason: 'role-claim' };
  return { ok: true };
};
