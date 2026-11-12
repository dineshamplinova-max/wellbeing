import mongoose from 'mongoose';

// Saved wellbeing quiz results. Only the category, the per-area scores (0-100)
// and the day are kept; individual answers are never sent to or stored by the
// server. Results are saved only when the user chooses to save them.
const scoreSchema = new mongoose.Schema({
  area: { type: String, required: true, maxlength: 40 },
  score: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

const quizResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true, maxlength: 40 },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // Asia/Dubai calendar day
  overall: { type: Number, required: true, min: 0, max: 100 },
  scores: { type: [scoreSchema], required: true },
}, {
  timestamps: true,
  // Same convention as moodSchema: indexes are not built on startup. Until the
  // unique index below is created as a separate, approved step, the controller
  // keeps one result per user, category and day itself.
  autoIndex: false,
});

quizResultSchema.index({ user: 1, category: 1, day: 1 }, { unique: true, name: 'user_category_day_unique' });

const QuizResult = mongoose.model('QuizResult', quizResultSchema);

export default QuizResult;
