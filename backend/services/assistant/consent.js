import User from '../../models/userModel.js';

// Consent and adult-attestation records for WellBridge AI Support.
//
// Only metadata is stored, on the existing User document:
//   assistantAdultAttestation { attestedAt, ageAtAttestation }  (self-declared 18+)
//   assistantConsent          { noticeVersion, grantedAt }       (external AI processing)
// No chat message, history, reply, journal, mood or community content is ever
// stored here or anywhere else by AI Support.
//
// Consent is needed before a request to any non-mock provider: an external
// provider (claude mode, still locked) or the local model (local mode, with its
// own notice version). Mock mode sends nothing out.

// The AI processing notice the user agrees to. The approved notice text does
// not exist yet (legal review pending), so this is a DRAFT version. Publishing
// the approved notice must bump this value, which invalidates every consent
// given to the draft.
export const AI_NOTICE_VERSION = 'wb-ai-notice-draft-1';
// The separate notice for local mode (a model on WellBridge's own server, not
// an external company). Also a DRAFT. Consent to one notice never counts for
// the other, so switching modes asks again.
export const LOCAL_AI_NOTICE_VERSION = 'wb-ai-local-notice-draft-1';

// The notice that applies to a provider mode. Mock and claude keep the
// existing version.
export const noticeVersionFor = (mode) => (mode === 'local' ? LOCAL_AI_NOTICE_VERSION : AI_NOTICE_VERSION);

const PROFILE_FIELDS = 'age assistantAdultAttestation assistantConsent';
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

// Consent is valid only for the current notice version of the given mode.
export const evaluateConsent = (profile, mode) => {
  const consent = profile?.assistantConsent;
  const consented = Boolean(consent) && consent.noticeVersion === noticeVersionFor(mode) && isValidDate(consent.grantedAt);
  return { consented };
};

// The fields AI Support needs, for the signed-in user only. null if not found.
export const loadAssistantProfile = (userId) => User.findById(userId).select(PROFILE_FIELDS).lean();

// Records a self-declared adult confirmation for the age stored right now. The
// filter repeats that age, so a concurrent age edit cannot be attested by
// mistake. Returns true when the record was written. Timestamps are set here.
export const recordAdultAttestation = async (userId, storedAge) => {
  const result = await User.updateOne(
    { _id: userId, age: storedAge },
    { $set: { assistantAdultAttestation: { attestedAt: new Date(), ageAtAttestation: storedAge } } },
  );
  return result?.matchedCount === 1;
};

export const grantConsent = async (userId, mode) => {
  const result = await User.updateOne(
    { _id: userId },
    { $set: { assistantConsent: { noticeVersion: noticeVersionFor(mode), grantedAt: new Date() } } },
  );
  return result?.matchedCount === 1;
};

// Withdrawal removes the consent record; the next request that would go to an
// external provider is refused. Idempotent.
export const withdrawConsent = async (userId) => {
  await User.updateOne({ _id: userId }, { $unset: { assistantConsent: 1 } });
};
