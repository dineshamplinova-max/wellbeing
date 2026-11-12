import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import { getCookieSameSite, getJwtSecret, isProduction } from '../config/env.js';

export const AUTH_COOKIE = 'wb_session';
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const JWT_ALGORITHM = 'HS256';

const unauthorized = (res) => res.status(401).json({ error: 'Please sign in to continue.' });

// httpOnly keeps the token away from page scripts. Secure is required in
// production and whenever SameSite=None is configured.
export const cookieOptions = () => {
  const sameSite = getCookieSameSite();
  return {
    httpOnly: true,
    secure: isProduction() || sameSite === 'none',
    sameSite,
    path: '/',
  };
};

// The token only carries the user id (sub) plus issued-at and expiry; roles and
// usernames are always read from the database, never from the token.
export const issueSession = (res, user) => {
  const token = jwt.sign({}, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    subject: String(user._id),
    expiresIn: TOKEN_TTL_SECONDS,
  });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions(), maxAge: TOKEN_TTL_SECONDS * 1000 });
};

export const clearSession = (res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
};

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  const secret = getJwtSecret();
  if (typeof token !== 'string' || !token || !secret) return unauthorized(res);

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
  } catch {
    return unauthorized(res);
  }
  if (typeof payload?.sub !== 'string' || !mongoose.Types.ObjectId.isValid(payload.sub) || typeof payload.exp !== 'number') {
    return unauthorized(res);
  }

  try {
    const user = await User.findById(payload.sub).select('_id username').lean();
    if (!user) return unauthorized(res);
    req.user = { _id: user._id, username: user.username };
    return next();
  } catch (error) {
    return next(error);
  }
};

// For routes that keep the legacy /:username URL shape: the URL username must be
// the signed-in user's own. Data access itself always uses req.user._id.
export const requireSelf = (param = 'username') => (req, res, next) => {
  if (req.user && req.params[param] === req.user.username) return next();
  return res.status(403).json({ error: 'You do not have access to this resource.' });
};
