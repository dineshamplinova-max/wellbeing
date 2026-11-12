import mongoose from 'mongoose';

// Current mood entries, keyed by user id. Older emoji-only entries have just
// user/date/mood; daily check-ins also have day, rating and the optional fields.
// (models/mood.js describes the legacy username-based records in the same
// collection and is deliberately left unchanged.)
const moodSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, required: true },
    mood: { type: String, required: true },
    day: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, // Asia/Dubai calendar day
    rating: { type: Number, min: 1, max: 5 },
    energy: { type: Number, min: 1, max: 5 },
    sleepHours: { type: Number, min: 0, max: 24 },
    factors: { type: [String], default: undefined },
    note: { type: String, maxlength: 500 },
  }, {
    timestamps: true,
    // Do not build indexes on startup. The unique index below is created on a real
    // database only as a separate, explicitly approved step; until then the
    // controller enforces one check-in per day itself.
    autoIndex: false,
  });

// One check-in per user per day. Entries without a day (older emoji-only and
// legacy records) are outside the index.
moodSchema.index(
  { user: 1, day: 1 },
  { unique: true, partialFilterExpression: { day: { $type: 'string' } }, name: 'user_day_unique' }
);

  const Mood = mongoose.model('Mood', moodSchema);

  export default Mood;
