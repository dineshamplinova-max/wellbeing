// Age rules for WellBridge AI Support.
//
// Approved policy (Phase 2a): AI Support only is for adults aged 18 or over,
// in both mock and claude modes. Other WellBridge features are not restricted.
//
// The stored age cannot be relied on: it is typed in by the user at sign-up,
// can be changed on the profile page (any whole number from 0 to 120) and is
// never verified. Eligibility is therefore SELF-DECLARED ONLY: the stored age
// must be 18+ AND the user must have explicitly confirmed being an adult while
// that same age was stored. This is not identity verification and is not
// assumed to be legally sufficient; it is pending organisational and legal
// approval.
//
// So:
// - age is never read from the request body, only from the stored profile;
// - eligibility is checked on the server on every AI Support chat request;
// - any change to the stored age requires a fresh confirmation;
// - replies stay conservative for everyone (a self-declared adult is still
//   not a reliable age), and no advice differs by age.

export const MIN_AI_SUPPORT_AGE = 18;
const MAX_AGE = 120;

export const resolveAgeContext = () => ({ group: 'unverified', reliable: false });

export const safeguardsFor = (ageContext) => ({
  conservative: true,
  // Future age-specific rules (for example, content limits for younger users)
  // plug in here once the policy is approved and age can be established reliably.
  ageGroup: ageContext?.group ?? 'unverified',
});

const isValidAge = (age) => Number.isInteger(age) && age >= 0 && age <= MAX_AGE;
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

// The stored age alone (used before recording an attestation).
// Returns { ok, reason } with reason 'age-missing-or-invalid' | 'under-18' | null.
export const evaluateStoredAge = (profile) => {
  const age = profile?.age;
  if (!isValidAge(age)) return { ok: false, reason: 'age-missing-or-invalid' };
  if (age < MIN_AI_SUPPORT_AGE) return { ok: false, reason: 'under-18' };
  return { ok: true, reason: null };
};

// Full AI Support eligibility from the stored profile. Reasons:
// 'age-missing-or-invalid' | 'under-18' | 'attestation-required' |
// 'attestation-outdated' (the stored age changed, or the record is unusable).
export const evaluateEligibility = (profile) => {
  const age = evaluateStoredAge(profile);
  if (!age.ok) return { eligible: false, reason: age.reason };
  const attestation = profile.assistantAdultAttestation;
  if (!attestation) return { eligible: false, reason: 'attestation-required' };
  if (!isValidDate(attestation.attestedAt)
    || !Number.isInteger(attestation.ageAtAttestation)
    || attestation.ageAtAttestation < MIN_AI_SUPPORT_AGE
    || attestation.ageAtAttestation !== profile.age) {
    return { eligible: false, reason: 'attestation-outdated' };
  }
  return { eligible: true, reason: 'self-declared-adult' };
};
