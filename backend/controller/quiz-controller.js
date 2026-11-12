import mongoose from 'mongoose';
import QuizResult from '../models/quizResultModel.js';
import { dubaiDay } from '../utils/dubaiDay.js';

// Scored quiz categories and the wellbeing areas each one reports. The
// unscored "Two-week reflection" questionnaire is deliberately not listed: its
// answers are never sent to or saved by the server.
export const QUIZ_AREAS = {
  daily: ['mood', 'energy', 'calm', 'rest'],
  stress: ['calm', 'coping', 'body'],
  sleep: ['rest', 'routine'],
  connection: ['connection', 'support'],
  focus: ['focus', 'balance'],
};
const MAX_RESULTS_RETURNED = 200;

const badRequest = (res, message) => res.status(400).json({ message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Only these fields ever leave the server.
const toPublicResult = (doc) => ({
  _id: String(doc._id),
  category: doc.category,
  day: doc.day,
  overall: doc.overall,
  scores: (doc.scores || []).map(({ area, score }) => ({ area, score })),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// Validates { category, scores: { area: 0-100 } }. Every area of the category
// must be present and nothing else is accepted. The overall score is computed
// here, never taken from the request.
export const parseQuizResult = (body) => {
  const { category, scores } = body || {};
  const areas = typeof category === 'string' && Object.hasOwn(QUIZ_AREAS, category) ? QUIZ_AREAS[category] : null;
  if (!areas) return { error: 'Please choose a valid quiz.' };
  if (!isPlainObject(scores)) return { error: 'Quiz scores are missing.' };

  const keys = Object.keys(scores);
  if (keys.length !== areas.length || !keys.every((k) => areas.includes(k))) {
    return { error: 'Quiz scores do not match this quiz.' };
  }
  const list = [];
  for (const area of areas) {
    const score = scores[area];
    if (!Number.isInteger(score) || score < 0 || score > 100) return { error: 'Scores must be whole numbers from 0 to 100.' };
    list.push({ area, score });
  }
  const overall = Math.round(list.reduce((sum, s) => sum + s.score, 0) / list.length);
  return { fields: { category, scores: list, overall } };
};

// The signed-in user's saved results, newest first.
export const listQuizResults = async (req, res) => {
  try {
    const docs = await QuizResult.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS_RETURNED)
      .lean();
    res.json(docs.map(toPublicResult));
  } catch (error) {
    console.error('Fetching quiz results failed:', error?.name);
    res.status(500).json({ message: 'Could not load your quiz history.' });
  }
};

// Saves a result. One result per quiz per day: saving the same quiz again on
// the same day replaces that day's result.
//
// The save is a single atomic upsert on { user, category, day }, which the
// unique index user_category_day_unique backs. The filter always uses the
// signed-in user's id, never anything from the request. If two saves race and
// one loses on the unique index (duplicate key 11000), it is retried once as a
// plain update of that same user's, category's and day's result, so the last
// save wins and the client never sees the duplicate-key error.
export const saveQuizResult = async (req, res) => {
  try {
    const parsed = parseQuizResult(req.body);
    if (parsed.error) return badRequest(res, parsed.error);

    const filter = { user: req.user._id, category: parsed.fields.category, day: dubaiDay() };
    const update = { $set: { scores: parsed.fields.scores, overall: parsed.fields.overall } };
    const options = { new: true, runValidators: true, lean: true };

    let saved;
    let replaced;
    try {
      const outcome = await QuizResult.findOneAndUpdate(filter, update, { ...options, upsert: true, includeResultMetadata: true });
      saved = outcome?.value;
      replaced = Boolean(outcome?.lastErrorObject?.updatedExisting);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      saved = await QuizResult.findOneAndUpdate(filter, update, options);
      replaced = true;
    }
    if (!saved) {
      console.error('Saving quiz result failed: no document after upsert');
      return res.status(500).json({ message: 'Could not save your quiz result.' });
    }
    return res.status(replaced ? 200 : 201).json({ result: toPublicResult(saved), replaced });
  } catch (error) {
    console.error('Saving quiz result failed:', error?.name);
    return res.status(500).json({ message: 'Could not save your quiz result.' });
  }
};

// Deletes one of the signed-in user's own results.
export const deleteQuizResult = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ message: 'Result not found.' });
    const outcome = await QuizResult.deleteOne({ _id: id, user: req.user._id });
    if (!outcome?.deletedCount) return res.status(404).json({ message: 'Result not found.' });
    return res.json({ message: 'Result deleted.' });
  } catch (error) {
    console.error('Deleting quiz result failed:', error?.name);
    return res.status(500).json({ message: 'Could not delete the result.' });
  }
};

// Deletes all of the signed-in user's saved results.
export const clearQuizResults = async (req, res) => {
  try {
    // Never run a delete whose filter could end up empty.
    if (!req.user?._id) return res.status(401).json({ error: 'Please sign in to continue.' });
    const outcome = await QuizResult.deleteMany({ user: req.user._id });
    return res.json({ message: 'Your quiz history was deleted.', deletedCount: outcome?.deletedCount ?? 0 });
  } catch (error) {
    console.error('Clearing quiz results failed:', error?.name);
    return res.status(500).json({ message: 'Could not delete your quiz history.' });
  }
};
