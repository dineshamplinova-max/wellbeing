import { screenMessage } from '../services/assistant/safety.js';

// Screening for new community posts and comments, run before anything is saved.
//
// 1. Personal information (emails, phone numbers, links, @handles) is rejected
//    so it is never stored. This protects the writer's anonymity and other
//    people's privacy.
// 2. Possible crisis or medical-emergency wording (the existing keyword check
//    from the AI Support safety module) does not block posting: the content is
//    saved as pending_review and shown to nobody until a moderator reviews it.
//
// LIMITATIONS (on purpose, and important): both checks are simple patterns.
// They miss many ways of sharing personal details or describing being unsafe,
// and they can flag harmless text. They are a first filter, not a moderation or
// clinical assessment. Screened text is never logged.

// Zero-width and other invisible characters are removed so they cannot be used
// to slip past the checks; other control characters (except newline and tab)
// are removed from stored text.
// Built from code points so the source contains no invisible characters.
const range = (from, to) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
const INVISIBLE_RE = new RegExp(`[${range(0x200b, 0x200f)}${range(0x2028, 0x202e)}${range(0x2060, 0x2064)}${String.fromCharCode(0xfeff)}]`, 'g');
const CONTROL_RE = new RegExp(`[${range(0x00, 0x08)}${range(0x0b, 0x0c)}${range(0x0e, 0x1f)}${String.fromCharCode(0x7f)}]`, 'g');

export const cleanText = (text) => String(text).replace(INVISIBLE_RE, '').replace(CONTROL_RE, '');

const EMAIL_RE = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const DOMAIN_RE = /\b[a-z0-9-]{2,}\.(?:com|net|org|io|co|me|app|info|biz|ly|gg|tv|xyz|ae|uk|us|in|ca|au)\b/i;
const HANDLE_RE = /(?:^|[^\w@.])@[a-z0-9_.]{2,30}/i;
// A run of digits with optional spaces, dots, dashes, slashes or brackets. Only
// runs with 9+ digits count as phone numbers, so dates such as 2026-11-02 or
// 02/11/2026 (8 digits) are not flagged.
const DIGIT_RUN_RE = /\+?\(?\d[\d\s().\/-]{6,}\d/g;
const MIN_PHONE_DIGITS = 9;

const hasPhoneNumber = (text) => (text.match(DIGIT_RUN_RE) || [])
  .some((run) => run.replace(/\D/g, '').length >= MIN_PHONE_DIGITS);

// Returns the first personal-information category found, or null.
export const findPersonalInfo = (text) => {
  const value = cleanText(text);
  if (EMAIL_RE.test(value)) return 'email';
  if (hasPhoneNumber(value)) return 'phone';
  if (URL_RE.test(value) || DOMAIN_RE.test(value)) return 'link';
  if (HANDLE_RE.test(value)) return 'handle';
  return null;
};

export const PERSONAL_INFO_MESSAGES = Object.freeze({
  email: 'Please remove the email address. Posts must not include contact details, yours or anyone else\'s.',
  phone: 'Please remove the phone number. Posts must not include contact details, yours or anyone else\'s.',
  link: 'Please remove the link or website address. Links are not allowed in community posts.',
  handle: 'Please remove the @username. Posts must not include social media handles, yours or anyone else\'s.',
});

// Shown to the writer when their content is held for review. It only repeats
// sentences the app already shows on the AI Support and quiz pages; any change
// to this wording, or any crisis contact details, needs review by a qualified
// mental-health professional first.
export const HELD_FOR_REVIEW_MESSAGE = 'Thank you for sharing. What you wrote will be reviewed by a moderator before it '
  + 'appears in the community. Please talk to someone you trust or a qualified health professional. '
  + 'If you are in immediate danger, contact your local emergency services.';

// Screens every piece of user text that will be shown publicly. Returns
// { personalInfo } for rejected content or { flaggedCategory } (null when clear).
export const screenCommunityText = (parts) => {
  const texts = parts.filter((p) => typeof p === 'string' && p.length > 0);
  for (const text of texts) {
    const personalInfo = findPersonalInfo(text);
    if (personalInfo) return { personalInfo, flaggedCategory: null };
  }
  const { flagged, category } = screenMessage(texts.map(cleanText).join('. '));
  return { personalInfo: null, flaggedCategory: flagged ? category : null };
};
