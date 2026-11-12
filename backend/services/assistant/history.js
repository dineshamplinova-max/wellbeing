// Validation for the recent-conversation context sent with each chat message.
//
// Request contract:
// - `message` is the new user turn.
// - `history` is optional. When present it holds only the turns BEFORE that
//   message, oldest first, so it must end with an assistant turn (an empty
//   array means a new conversation).
// - Each turn is exactly { role: 'user' | 'assistant', content: string }.
//
// History is only context for choosing a reply. It is never trusted as identity
// (that always comes from the session) or as medical fact, and it is never stored.

export const MAX_HISTORY_TURNS = 10;
export const MAX_TURN_LENGTH = 2000;
export const MAX_HISTORY_CHARS = MAX_HISTORY_TURNS * MAX_TURN_LENGTH;

const ROLES = new Set(['user', 'assistant']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Returns { history } with a clean copy, or { error } describing the problem.
export const validateHistory = (history) => {
  if (history === undefined) return { history: [] };
  if (!Array.isArray(history)) return { error: 'Conversation history must be a list of turns.' };
  if (history.length > MAX_HISTORY_TURNS) {
    return { error: `Please send at most ${MAX_HISTORY_TURNS} earlier turns.` };
  }

  let total = 0;
  for (const turn of history) {
    if (!isPlainObject(turn)) return { error: 'Each history turn must be an object.' };
    const keys = Object.keys(turn);
    if (keys.length !== 2 || !keys.includes('role') || !keys.includes('content')) {
      return { error: 'Each history turn must have only a role and content.' };
    }
    if (!ROLES.has(turn.role)) return { error: 'History roles must be "user" or "assistant".' };
    if (typeof turn.content !== 'string' || !turn.content.trim()) {
      return { error: 'Each history turn needs some text.' };
    }
    if (turn.content.length > MAX_TURN_LENGTH) {
      return { error: `Each history turn must be ${MAX_TURN_LENGTH} characters or fewer.` };
    }
    total += turn.content.length;
  }
  if (total > MAX_HISTORY_CHARS) return { error: 'The conversation history is too long.' };
  if (history.length > 0 && history[history.length - 1].role !== 'assistant') {
    return { error: 'History must end with a reply; send the new message in "message".' };
  }

  return { history: history.map(({ role, content }) => ({ role, content })) };
};
