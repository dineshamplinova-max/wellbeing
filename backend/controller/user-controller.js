import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import User from '../models/userModel.js';
import Journal from '../models/journalModel.js';
import Mood from '../models/moodSchema.js';
import LegacyMood from '../models/mood.js';
import MeditationSession from '../models/MeditationSession.js';
import QuizResult from '../models/quizResultModel.js';
import { toSafeUser } from '../utils/safeUser.js';
import { issueSession, clearSession } from '../middleware/requireAuth.js';

const GENDERS = ['Male', 'Female', 'Non Binary'];
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,40}$/;
// Usernames that would collide with existing top-level API paths.
const RESERVED_USERNAMES = new Set(['api', 'signup', 'login', 'logout', 'users', 'journals', 'journal-delete', 'delete-user', 'uploads', 'upload1']);
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything beyond 72 bytes
// Compared against when a username does not exist, so a failed login takes
// about as long whether or not the account exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('wellbridge-timing-placeholder', 10);

const isNonEmptyString = (value, maxLength) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

// Reads the editable profile fields. Only allowlisted fields are returned, so
// anything else in the request (roles, ids, journals, profilePicture paths...) is ignored.
const readProfileFields = (body, { required }) => {
  const values = {};
  const has = (key) => body[key] !== undefined;

  if (required || has('name')) {
    if (!isNonEmptyString(body.name, 100)) return { error: 'Please enter your name (up to 100 characters).' };
    values.name = body.name.trim();
  }
  if (required || has('email')) {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return { error: 'Please enter a valid email address.' };
    values.email = email;
  }
  if (required || has('gender')) {
    if (!GENDERS.includes(body.gender)) return { error: 'Please choose a gender option.' };
    values.gender = body.gender;
  }
  if (required || has('age')) {
    const age = Number(body.age);
    if (body.age === '' || body.age === null || !Number.isInteger(age) || age < 0 || age > 120) {
      return { error: 'Please enter a valid age.' };
    }
    values.age = age;
  }
  if (has('bio')) {
    if (typeof body.bio !== 'string' || body.bio.length > 1000) return { error: 'Bio must be 1000 characters or fewer.' };
    values.bio = body.bio;
  }
  return { values };
};

const passwordProblem = (password) => {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return 'Password is too long.';
  return null;
};

// Removes the picture Multer saved for this request when signup does not
// complete. Only req.file.path (the random name Multer just generated) is ever
// touched, so existing user images are never affected.
const discardSignupUpload = async (req) => {
  const filePath = req.file?.path;
  if (typeof filePath !== 'string' || !filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('Removing an unused signup upload failed:', error?.code);
  }
};

// User Signup
export const userSignup = async (req, res) => {
  let created = false;
  try {
    const body = req.body || {};
    const { username, password } = body;

    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username.toLowerCase())) {
      return res.status(400).json({ error: 'Usernames must be 3–40 letters, numbers, dots, dashes or underscores.' });
    }
    const badPassword = passwordProblem(password);
    if (badPassword) return res.status(400).json({ error: badPassword });

    const { values, error } = readProfileFields(body, { required: true });
    if (error) return res.status(400).json({ error });

    const exist = await User.exists({ $or: [{ username }, { email: values.email }] });
    if (exist) {
      return res.status(409).json({ msg: 'Username or email already exists!' });
    }

    const newUser = new User({ ...values, username, password });
    if (req.file) {
      newUser.profilePicture = `uploads/${req.file.filename}`;
    }
    await newUser.save();
    created = true;
    return res.status(200).json(toSafeUser(newUser));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ msg: 'Username or email already exists!' });
    console.error('Signup failed:', error?.name);
    return res.status(500).json({ error: 'Could not create the account. Please try again.' });
  } finally {
    if (!created) await discardSignupUpload(req);
  }
};

// User Login: sets the session cookie and returns the safe user profile.
export const userLogin = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    // Strings only, so query operators such as {"$ne": null} cannot be injected.
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = await User.findOne({ username }).select('+password');
    const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    issueSession(res, user);
    return res.status(200).json({ user: toSafeUser(user) });
  } catch (error) {
    console.error('Login failed:', error?.name);
    return res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
};

export const userLogout = (req, res) => {
  clearSession(res);
  return res.status(200).json({ msg: 'Signed out.' });
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
    return res.status(200).json({ user: toSafeUser(user) });
  } catch (error) {
    console.error('Loading the current user failed:', error?.name);
    return res.status(500).json({ error: 'Could not load your account.' });
  }
};

// Delete the signed-in user's account and the personal records that belong to it.
export const deleteUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('_id username').lean();
    if (!user) {
      return res.status(404).json({ msg: 'User not found!' });
    }
    // Never run a delete whose filter could end up empty.
    if (!userId || typeof user.username !== 'string' || !user.username) {
      console.error('Account deletion stopped: incomplete user identifiers');
      return res.status(500).json({ error: 'Could not delete the account. Please try again.' });
    }

    // Personal records are removed before the account itself, so a failure part-way
    // leaves the account in place and the request can be retried. Anonymous
    // community posts are not linked to accounts and are kept, as are any
    // comments or likes this user left on other people's journals.
    await Journal.deleteMany({ author: userId });
    await Mood.deleteMany({ user: userId });
    await LegacyMood.deleteMany({ username: user.username });
    await MeditationSession.deleteMany({ user: userId });
    await QuizResult.deleteMany({ user: userId });
    await User.deleteOne({ _id: userId });

    clearSession(res);
    return res.status(200).json({ msg: 'Your account and its journals, mood records, meditation sessions and saved quiz results were deleted.' });
  } catch (error) {
    console.error('Account deletion failed:', error?.name);
    return res.status(500).json({ error: 'Could not delete the account. Please try again.' });
  }
};

// Update the signed-in user's profile. A new password requires the current one.
export const updateUser = async (req, res) => {
  try {
    const body = req.body || {};
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ msg: 'User not found!' });
    }

    const { values, error } = readProfileFields(body, { required: false });
    if (error) return res.status(400).json({ msg: error });

    const wantsNewPassword = body.password !== undefined && body.password !== '';
    if (wantsNewPassword) {
      const badPassword = passwordProblem(body.password);
      if (badPassword) return res.status(400).json({ msg: badPassword });
      const currentPasswordOk = typeof body.currentPassword === 'string'
        && body.currentPassword.length > 0
        && await bcrypt.compare(body.currentPassword, user.password);
      if (!currentPasswordOk) {
        return res.status(403).json({ msg: 'Current password is incorrect.' });
      }
      user.password = body.password; // hashed by the pre-save hook
    }

    if (values.email && values.email !== user.email && await User.exists({ email: values.email, _id: { $ne: user._id } })) {
      return res.status(409).json({ msg: 'That email address is already in use.' });
    }

    Object.assign(user, values);
    await user.save();
    return res.status(200).json(toSafeUser(user));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ msg: 'That email address is already in use.' });
    console.error('Updating user failed:', error?.name);
    return res.status(500).json({ error: 'Could not update the profile. Please try again.' });
  }
};

// Profile details for the signed-in user (the route checks the URL username is theirs).
export const getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(toSafeUser(user));
  } catch (error) {
    console.error('Fetching user details failed:', error?.name);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
