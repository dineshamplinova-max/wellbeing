// Small fixed-window, in-memory rate limiter for the sign-in and sign-up routes,
// built without extra dependencies.
//
// Limitations (documented on purpose):
// - Counts live in this process only. They reset when the server restarts and are
//   not shared between several server instances.
// - Memory is bounded by maxKeys: expired windows are dropped first, then the
//   oldest windows. A flood of distinct keys can therefore evict older counters.
// - Behind a reverse proxy, configure Express "trust proxy" so req.ip is the
//   client address rather than the proxy's.
export const createRateLimiter = ({ windowMs, max, keyFn, message, maxKeys = 10000, now = Date.now }) => {
  const hits = new Map();

  const evict = (time) => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= time) hits.delete(key);
    }
    // Still full: drop the oldest windows (a Map iterates in insertion order).
    while (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
  };

  const limiter = (req, res, next) => {
    const time = now();
    const key = keyFn(req);
    let entry = hits.get(key);
    if (entry && entry.resetAt <= time) {
      hits.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (hits.size >= maxKeys) evict(time);
      entry = { count: 0, resetAt: time + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - time) / 1000)));
      return res.status(429).json({ error: message, message });
    }
    return next();
  };

  limiter.trackedKeys = () => hits.size;
  limiter.reset = () => hits.clear();
  return limiter;
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const SIGN_IN_MESSAGE = 'Too many sign-in attempts. Please wait 15 minutes and try again.';

const clientIp = (req) => req.ip || 'unknown';

// Caps all sign-in attempts from one address, whichever usernames are tried.
export const loginIpLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 50,
  keyFn: clientIp,
  message: SIGN_IN_MESSAGE,
});

// Caps attempts against a single username from one address.
export const loginLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  keyFn: (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase().slice(0, 64) : '';
    return `${clientIp(req)}|${username}`;
  },
  message: SIGN_IN_MESSAGE,
});

export const signupLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  keyFn: clientIp,
  message: 'Too many sign-up attempts. Please try again later.',
});
