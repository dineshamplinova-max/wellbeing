// Escapes user text so it is matched literally inside a RegExp, never
// interpreted as a pattern (prevents regex injection and ReDoS patterns).
export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
