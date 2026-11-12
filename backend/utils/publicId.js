import crypto from 'crypto';

// Public identifiers for community posts and comments.
//
// - Format: "WB-" (posts) or "WBC-" (comments) followed by 8 characters from the
//   Crockford base32 alphabet (no I, L, O or U, so IDs are easy to read aloud).
// - Every character comes from crypto.randomInt, which is cryptographically
//   secure and unbiased. IDs are never sequential and never derived from the
//   MongoDB _id, which is not exposed publicly.
// - 32^8 (about 1.1 trillion) combinations; collisions are still handled by a
//   unique index and a bounded retry (createWithUniqueId).

export const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ID_BODY_LENGTH = 8;
export const POST_ID_PREFIX = 'WB';
export const COMMENT_ID_PREFIX = 'WBC';
export const MAX_ID_ATTEMPTS = 5;

const MAX_INPUT_LENGTH = 20;
const BODY_PATTERN = `[${ID_ALPHABET}]{${ID_BODY_LENGTH}}`;
const POST_ID_RE = new RegExp(`^${POST_ID_PREFIX}-?(${BODY_PATTERN})$`);
const COMMENT_ID_RE = new RegExp(`^${COMMENT_ID_PREFIX}-?(${BODY_PATTERN})$`);

export const generateId = (prefix, randomInt = crypto.randomInt) => {
  let body = '';
  for (let i = 0; i < ID_BODY_LENGTH; i += 1) body += ID_ALPHABET[randomInt(0, ID_ALPHABET.length)];
  return `${prefix}-${body}`;
};

// Replaceable generators so offline tests can force collisions. Production code
// always goes through these objects.
export const idSource = {
  post: () => generateId(POST_ID_PREFIX),
  comment: () => generateId(COMMENT_ID_PREFIX),
};

// Turns user input such as "WB-A7K92M4Q", "#wb-a7k92m4q" or "wba7k92m4q" into the
// canonical form, or returns null. Anything that is not a short string (objects,
// arrays, query operators) is rejected.
const normalizeWith = (re, prefix) => (input) => {
  if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) return null;
  const compact = input.trim().replace(/^#/, '').toUpperCase();
  const match = re.exec(compact);
  return match ? `${prefix}-${match[1]}` : null;
};

export const normalizePublicId = normalizeWith(POST_ID_RE, POST_ID_PREFIX);
export const normalizeCommentId = normalizeWith(COMMENT_ID_RE, COMMENT_ID_PREFIX);

export const isDuplicateKeyError = (error, fields) => {
  if (!error || error.code !== 11000) return false;
  const keys = Object.keys(error.keyPattern || error.keyValue || {});
  return keys.some((key) => fields.includes(key));
};

export class PublicIdExhaustedError extends Error {
  constructor() {
    super('Could not allocate a unique public ID');
    this.code = 'PUBLIC_ID_EXHAUSTED';
  }
}

// Calls save(id) with a fresh ID until it succeeds. Only duplicate-key errors on
// the given fields are retried; every other error is passed straight up.
export const createWithUniqueId = async (save, { generate, fields, maxAttempts = MAX_ID_ATTEMPTS }) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await save(generate());
    } catch (error) {
      if (!isDuplicateKeyError(error, fields)) throw error;
    }
  }
  throw new PublicIdExhaustedError();
};
