import Mood from "../models/moodSchema.js";
import { checkinClock, dubaiDay, shiftDay } from "../utils/dubaiDay.js";

// Emoji used by the mood tracker, from highest (5) to lowest (1) rating.
const EMOJI_FOR_RATING = { 5: '😄', 4: '😊', 3: '😐', 2: '😔', 1: '😢' };
const RATING_FOR_EMOJI = Object.fromEntries(Object.entries(EMOJI_FOR_RATING).map(([r, e]) => [e, Number(r)]));
const FACTORS = ['sleep', 'work', 'social', 'exercise', 'health', 'other'];
const MAX_NOTE_LENGTH = 500;
const PERIOD_DAYS = { week: 7, month: 30 };
const MIN_RATED_DAYS_PER_HALF = 3;

const isRating = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const round1 = (n) => Math.round(n * 10) / 10;
const average = (values) => (values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null);
const badRequest = (res, message) => res.status(400).json({ message });
const alreadyCheckedIn = (res) => res.status(409).json({ message: "You have already checked in today. You can edit today's check-in instead." });

// Validates the check-in fields. Only these fields are ever read from the body;
// user, day, date and mood are always set by the server.
const parseCheckin = (body) => {
    const { rating, energy, sleepHours, factors, note } = body;
    if (!isRating(rating)) return { error: 'Please choose a rating from 1 to 5.' };
    const fields = { rating, mood: EMOJI_FOR_RATING[rating] };

    if (energy !== undefined && energy !== null) {
        if (!isRating(energy)) return { error: 'Energy must be a whole number from 1 to 5.' };
        fields.energy = energy;
    }
    if (sleepHours !== undefined && sleepHours !== null) {
        if (typeof sleepHours !== 'number' || !Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) {
            return { error: 'Sleep must be between 0 and 24 hours.' };
        }
        fields.sleepHours = sleepHours;
    }
    if (factors !== undefined && factors !== null) {
        if (!Array.isArray(factors) || factors.length > FACTORS.length || !factors.every((f) => FACTORS.includes(f))) {
            return { error: 'Please choose factors from the list.' };
        }
        fields.factors = [...new Set(factors)];
    }
    if (note !== undefined && note !== null) {
        if (typeof note !== 'string') return { error: 'The note must be text.' };
        const trimmed = note.trim();
        if (trimmed.length > MAX_NOTE_LENGTH) return { error: `Notes must be ${MAX_NOTE_LENGTH} characters or fewer.` };
        if (trimmed) fields.note = trimmed;
    }
    return { fields };
};

// The older tracker sent { date, mood } with one of the five emoji. It is still
// accepted, but only for today and under the same one-per-day rule.
const parseLegacyCheckin = (body, today) => {
    const { date, mood } = body;
    if (date !== undefined) {
        const parsedDate = new Date(date);
        if (typeof date !== 'string' || Number.isNaN(parsedDate.getTime())) return { error: 'Please choose a valid date.' };
        const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dubaiDay(parsedDate);
        if (day !== today) return { error: 'Check-ins can only be added for today.' };
    }
    if (typeof mood !== 'string' || !RATING_FOR_EMOJI[mood]) return { error: 'Please choose a mood.' };
    return { fields: { rating: RATING_FOR_EMOJI[mood], mood } };
};

// Mood entries of the signed-in user (the route checks the URL username is theirs).
export const getMoods = async (req, res) => {
    try {
        const moods = await Mood.find({ user: req.user._id });
        res.json(moods);
    } catch (error) {
        console.error('Fetching moods failed:', error?.name);
        res.status(500).json({ message: 'Could not load mood entries.' });
    }
}

// Creates today's check-in. Accepts the check-in fields or the older { date, mood }.
export const createMood = async (req, res) => {
    try {
        const body = req.body || {};
        const today = dubaiDay();
        const parsed = body.rating !== undefined ? parseCheckin(body) : parseLegacyCheckin(body, today);
        if (parsed.error) return badRequest(res, parsed.error);

        if (await Mood.findOne({ user: req.user._id, day: today })) return alreadyCheckedIn(res);

        const newMood = new Mood({
            ...parsed.fields,
            user: req.user._id,
            day: today,
            date: checkinClock.now(),
        });

        const savedMood = await newMood.save();
        res.json(savedMood);
    } catch (error) {
        // Duplicate key from the unique { user, day } index, once it exists.
        if (error?.code === 11000) return alreadyCheckedIn(res);
        console.error('Saving mood failed:', error?.name);
        res.status(500).json({ message: 'Could not save the mood entry.' });
    }
}

// Today's check-in of the signed-in user, or null.
export const getTodayCheckin = async (req, res) => {
    try {
        const entry = await Mood.findOne({ user: req.user._id, day: dubaiDay() });
        res.json(entry);
    } catch (error) {
        console.error('Fetching check-in failed:', error?.name);
        res.status(500).json({ message: "Could not load today's check-in." });
    }
}

// Replaces the content of today's check-in. Earlier days cannot be edited.
export const updateTodayCheckin = async (req, res) => {
    try {
        const parsed = parseCheckin(req.body || {});
        if (parsed.error) return badRequest(res, parsed.error);

        const entry = await Mood.findOne({ user: req.user._id, day: dubaiDay() });
        if (!entry) return res.status(404).json({ message: 'There is no check-in for today yet.' });

        entry.set({ energy: undefined, sleepHours: undefined, factors: undefined, note: undefined, ...parsed.fields });
        const saved = await entry.save();
        res.json(saved);
    } catch (error) {
        console.error('Updating check-in failed:', error?.name);
        res.status(500).json({ message: "Could not update today's check-in." });
    }
}

// Descriptive summary of the signed-in user's current entries for the last 7 or
// 30 days (Asia/Dubai). Legacy username-based records are never read. Older
// emoji-only entries get their rating from the emoji; nothing is written back.
export const getMoodSummary = async (req, res) => {
    try {
        const period = req.query.period ?? 'week';
        const length = PERIOD_DAYS[period];
        if (!length) return badRequest(res, 'Please choose a period of week or month.');

        const endDay = dubaiDay();
        const startDay = shiftDay(endDay, -(length - 1));
        // One extra day on the query so time-zone edges are not missed; the exact
        // day filter happens below.
        const since = new Date(`${shiftDay(startDay, -1)}T00:00:00Z`);
        const docs = await Mood.find({ user: req.user._id, date: { $gte: since } }).lean();

        const entries = docs
            .map((doc) => ({
                day: doc.day || dubaiDay(new Date(doc.date)),
                rating: isRating(doc.rating) ? doc.rating : RATING_FOR_EMOJI[doc.mood] ?? null,
                energy: doc.energy,
                sleepHours: doc.sleepHours,
                factors: doc.factors || [],
            }))
            .filter((e) => e.day >= startDay && e.day <= endDay);

        const rated = entries.filter((e) => e.rating !== null);
        const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        rated.forEach((e) => { ratingCounts[e.rating] += 1; });
        const factorCounts = {};
        entries.forEach((e) => e.factors.forEach((f) => { factorCounts[f] = (factorCounts[f] || 0) + 1; }));

        const ratingsByDay = {};
        rated.forEach((e) => { (ratingsByDay[e.day] ||= []).push(e.rating); });
        const daily = Object.keys(ratingsByDay).sort().map((day) => ({ day, rating: average(ratingsByDay[day]) }));

        // Compare the earlier and later halves of the period, only with enough data.
        const midDay = shiftDay(startDay, Math.floor(length / 2));
        const earlier = daily.filter((d) => d.day < midDay);
        const later = daily.filter((d) => d.day >= midDay);
        let comparison = null;
        if (earlier.length >= MIN_RATED_DAYS_PER_HALF && later.length >= MIN_RATED_DAYS_PER_HALF) {
            const earlierAverage = average(earlier.map((d) => d.rating));
            const laterAverage = average(later.map((d) => d.rating));
            const diff = laterAverage - earlierAverage;
            comparison = {
                earlierAverage,
                laterAverage,
                direction: diff >= 0.5 ? 'higher' : diff <= -0.5 ? 'lower' : 'similar',
            };
        }

        // Most frequently recorded level(s). Ties are all returned, highest first;
        // entries without a rating (older free-text moods) are not counted.
        const topCount = Math.max(...Object.values(ratingCounts));
        const mostFrequent = rated.length
            ? { levels: [5, 4, 3, 2, 1].filter((level) => ratingCounts[level] === topCount), count: topCount }
            : null;
        const energyValues = entries.filter((e) => isRating(e.energy)).map((e) => e.energy);
        const sleepValues = entries.filter((e) => typeof e.sleepHours === 'number').map((e) => e.sleepHours);

        const averageRating = average(rated.map((e) => e.rating));
        const lastThree = daily.slice(-3);
        const lowRatingNotice = (averageRating !== null && averageRating <= 2)
            || (lastThree.length === 3 && lastThree.every((d) => d.rating <= 2));

        res.json({
            period,
            startDay,
            endDay,
            totalCheckins: entries.length,
            daysWithCheckin: new Set(entries.map((e) => e.day)).size,
            ratedCount: rated.length,
            averageRating,
            ratingCounts,
            factorCounts,
            mostFrequent,
            averageEnergy: average(energyValues),
            energyCount: energyValues.length,
            averageSleepHours: average(sleepValues),
            sleepCount: sleepValues.length,
            daily,
            comparison,
            lowRatingNotice,
        });
    } catch (error) {
        console.error('Mood summary failed:', error?.name);
        res.status(500).json({ message: 'Could not load the mood summary.' });
    }
}
