// Safety screening for WellBridge AI Support (Phase 1, development only).
//
// LIMITATIONS (on purpose, and important):
// - This is a small keyword check that exists only to test the request flow.
//   It is NOT reliable crisis detection: it will miss many ways people describe
//   being unsafe, and it can flag messages that are not about safety at all.
// - The fixed safety responses must be written and approved by a qualified
//   mental-health professional. None are approved yet, so only a neutral
//   placeholder is returned. Do not add crisis guidance or contact numbers here
//   without that approval.

// A few obvious phrases, matched as whole words after normalising the text.
const POSSIBLE_CRISIS_PHRASES = [
  'kill myself',
  'killing myself',
  'end my life',
  'ending my life',
  'take my own life',
  'suicide',
  'suicidal',
  'want to die',
  'wanna die',
  'hurt myself',
  'harm myself',
  'self harm',
  'cut myself',
  'overdose',
  'no reason to live',
];

// A few obvious physical warning signs that may need urgent medical help. Same
// limits as above: keyword matching is not a reliable assessment, and the
// response text still needs clinical review.
const POSSIBLE_MEDICAL_EMERGENCY_PHRASES = [
  'worst headache',
  'sudden severe headache',
  'thunderclap headache',
  'chest pain',
  'pain in my chest',
  'chest tightness',
  "can't breathe",
  'cant breathe',
  'cannot breathe',
  'struggling to breathe',
  'difficulty breathing',
  'trouble breathing',
  'fainted',
  'passed out',
  'seizure',
  'slurred speech',
  'face drooping',
  'numb on one side',
  'one side of my body',
  'sudden weakness',
  'coughing up blood',
  'vomiting blood',
  'lost my vision',
  'sudden vision loss',
];

const normalise = (text) => text
  .toLowerCase()
  .replace(/[‘’`]/g, "'")
  .replace(/-/g, ' ')
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Screens one message (the newest one only). Possible crisis is checked first,
// then possible medical emergency. Returns { flagged, category } and never
// stores or logs the message.
export const screenMessage = (message) => {
  const text = ` ${normalise(String(message))} `;
  const matches = (phrases) => phrases.some((phrase) => text.includes(` ${phrase} `));
  if (matches(POSSIBLE_CRISIS_PHRASES)) return { flagged: true, category: 'possible-crisis' };
  if (matches(POSSIBLE_MEDICAL_EMERGENCY_PHRASES)) return { flagged: true, category: 'possible-medical-emergency' };
  return { flagged: false, category: null };
};

// Interface for the clinician-reviewed fixed responses, keyed by category.
// Intentionally empty in Phase 1: entries may only be added after clinical
// review and approval.
export const APPROVED_SAFETY_RESPONSES = Object.freeze({});

// Neutral, non-clinical placeholder used until approved responses exist. Its last
// sentences repeat wording the app already shows on the AI Support and quiz pages.
export const SAFETY_PLACEHOLDER = 'Your message may be about your safety. This development version of '
  + 'WellBridge AI Support cannot respond to this kind of message yet: its safety responses are still '
  + 'awaiting review by a qualified mental-health professional. Please talk to someone you trust or a '
  + 'qualified health professional. If you are in immediate danger, contact your local emergency services.';

// Same idea for possible medical emergencies: neutral, unreviewed, no numbers.
export const MEDICAL_PLACEHOLDER = 'Some of what you describe could need urgent medical attention. This development '
  + 'version of WellBridge AI Support cannot assess symptoms, and its safety responses are still awaiting review by '
  + 'a qualified health professional. If you think you may need urgent help, contact your local emergency services now.';

const PLACEHOLDERS = {
  'possible-crisis': SAFETY_PLACEHOLDER,
  'possible-medical-emergency': MEDICAL_PLACEHOLDER,
};

export const getSafetyResponse = (category) => {
  const approved = APPROVED_SAFETY_RESPONSES[category];
  if (approved) return { text: approved, reviewed: true };
  return { text: PLACEHOLDERS[category] || SAFETY_PLACEHOLDER, reviewed: false };
};

// Which category a fixed safety response belongs to, or null for any other text.
const categoryOfSafetyText = (text) => {
  const value = String(text).trim();
  for (const category of Object.keys(PLACEHOLDERS)) {
    if (value === PLACEHOLDERS[category] || value === APPROVED_SAFETY_RESPONSES[category]) return category;
  }
  return null;
};

// Product decision B5: once the safety pathway has started in a session, it
// continues on later turns; changing the subject does not resume ordinary
// replies. Scans the validated history (newest first) for a user turn the
// keyword screen flags, or a fixed safety response already sent. A new session
// in the page sends no history and starts afresh. Never stores or logs text.
export const screenRecentHistory = (history = []) => {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn.role === 'assistant') {
      const category = categoryOfSafetyText(turn.content);
      if (category) return { flagged: true, category };
    } else {
      const screening = screenMessage(turn.content);
      if (screening.flagged) return screening;
    }
  }
  return { flagged: false, category: null };
};
