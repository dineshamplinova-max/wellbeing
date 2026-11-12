// Pure helpers for the personal wellbeing dashboard. They only count and
// average the user's own records: no scores, predictions or diagnoses.
// Every record is placed on an Asia/Dubai calendar day, the same day the
// server uses for mood check-ins. Private text (mood notes, journal titles and
// entries) is never copied into the results.
import { journalDate } from '../journal/journalFilters';

export const PERIODS = [7, 30, 90];
export const DEFAULT_PERIOD = 30;
// Fewer rated check-ins than this and no average is shown (as on the Mood page).
export const MIN_RATED_FOR_AVERAGE = 3;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEVEL_FOR_EMOJI = { '😄': 5, '😊': 4, '😐': 3, '😔': 2, '😢': 1 };

const dubaiDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Asia/Dubai calendar day (YYYY-MM-DD) of a date or timestamp, or null.
export const dubaiDay = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : dubaiDayFormatter.format(date);
};

// Moves a YYYY-MM-DD day by a whole number of days.
export const shiftDay = (day, offset) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const normalizePeriod = (days) => (PERIODS.includes(days) ? days : DEFAULT_PERIOD);

// The days of a period that ends today (inclusive), oldest first.
export const periodDays = (length, today) => Array.from({ length }, (_, i) => shiftDay(today, i - (length - 1)));

// Splits the period into 7-day weeks ending today; the oldest week may be shorter.
export const weeksOf = (days) => {
  const weeks = [];
  for (let end = days.length; end > 0; end -= 7) weeks.unshift(days.slice(Math.max(0, end - 7), end));
  return weeks;
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const isLevel = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const roundOne = (value) => Math.round(value * 10) / 10;
const average = (values) => (values.length ? roundOne(values.reduce((a, b) => a + b, 0) / values.length) : null);

const countByDay = (records, valueOf = () => 1) => {
  const totals = new Map();
  records.forEach((record) => totals.set(record.day, (totals.get(record.day) || 0) + valueOf(record)));
  return totals;
};

// ---- Mood -----------------------------------------------------------------

// Mood check-ins as { day, rating, energy, sleepHours }. Older emoji-only
// entries get their rating from the emoji; any other mood has no rating.
export const moodRecords = (moods) => asArray(moods)
  .map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const day = typeof entry.day === 'string' && DAY_PATTERN.test(entry.day) ? entry.day : dubaiDay(entry.date);
    if (!day) return null;
    return {
      day,
      rating: isLevel(entry.rating) ? entry.rating : LEVEL_FOR_EMOJI[entry.mood] ?? null,
      energy: isLevel(entry.energy) ? entry.energy : null,
      sleepHours: typeof entry.sleepHours === 'number' && entry.sleepHours >= 0 && entry.sleepHours <= 24 ? entry.sleepHours : null,
    };
  })
  .filter(Boolean);

export const summarizeMood = (moods, { days, today }) => {
  const daysInPeriod = periodDays(days, today);
  const inPeriod = moodRecords(moods).filter((r) => r.day >= daysInPeriod[0] && r.day <= today);
  const rated = inPeriod.filter((r) => r.rating !== null);

  const ratingsByDay = new Map();
  rated.forEach((r) => ratingsByDay.set(r.day, [...(ratingsByDay.get(r.day) || []), r.rating]));
  const daily = daysInPeriod.map((day) => ({ day, rating: ratingsByDay.has(day) ? average(ratingsByDay.get(day)) : null }));
  const weekly = weeksOf(daysInPeriod).map((week) => {
    const ratings = week.flatMap((day) => ratingsByDay.get(day) || []);
    return { start: week[0], end: week[week.length - 1], rating: average(ratings), ratedCount: ratings.length };
  });

  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rated.forEach((r) => { ratingCounts[r.rating] += 1; });

  return {
    checkins: inPeriod.length,
    daysWithCheckin: new Set(inPeriod.map((r) => r.day)).size,
    ratedCount: rated.length,
    averageRating: rated.length >= MIN_RATED_FOR_AVERAGE ? average(rated.map((r) => r.rating)) : null,
    ratingCounts,
    averageEnergy: average(inPeriod.filter((r) => r.energy !== null).map((r) => r.energy)),
    averageSleepHours: average(inPeriod.filter((r) => r.sleepHours !== null).map((r) => r.sleepHours)),
    daily,
    weekly,
  };
};

// ---- Meditation -----------------------------------------------------------

// Saved meditation sessions as { day, minutes }. Invalid durations count as 0.
export const meditationRecords = (sessions) => asArray(sessions)
  .map((session) => {
    if (!session || typeof session !== 'object') return null;
    const day = dubaiDay(session.date);
    if (!day) return null;
    const minutes = Number.isFinite(session.duration) && session.duration > 0 ? session.duration : 0;
    return { day, minutes };
  })
  .filter(Boolean);

// Consecutive days with at least one session, ending today, or ending
// yesterday when today has none yet (the day is not over).
export const currentStreak = (activeDays, today) => {
  let day = activeDays.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (activeDays.has(day)) {
    streak += 1;
    day = shiftDay(day, -1);
  }
  return streak;
};

export const longestStreak = (activeDays) => {
  let longest = 0;
  activeDays.forEach((day) => {
    if (activeDays.has(shiftDay(day, -1))) return; // not the start of a run
    let length = 0;
    for (let d = day; activeDays.has(d); d = shiftDay(d, 1)) length += 1;
    longest = Math.max(longest, length);
  });
  return longest;
};

export const summarizeMeditation = (sessions, { days, today }) => {
  const all = meditationRecords(sessions);
  const daysInPeriod = periodDays(days, today);
  const inPeriod = all.filter((r) => r.day >= daysInPeriod[0] && r.day <= today);
  const minutesByDay = countByDay(inPeriod, (r) => r.minutes);
  const allDays = new Set(all.map((r) => r.day));

  return {
    sessions: inPeriod.length,
    totalMinutes: inPeriod.reduce((sum, r) => sum + r.minutes, 0),
    daysWithSession: new Set(inPeriod.map((r) => r.day)).size,
    currentStreak: currentStreak(allDays, today),
    longestStreak: longestStreak(allDays),
    daily: daysInPeriod.map((day) => ({ day, minutes: minutesByDay.get(day) || 0 })),
    weekly: weeksOf(daysInPeriod).map((week) => ({
      start: week[0],
      end: week[week.length - 1],
      minutes: week.reduce((sum, day) => sum + (minutesByDay.get(day) || 0), 0),
    })),
  };
};

// ---- Journal --------------------------------------------------------------

// Journal entries reduced to their day only; titles and text are not kept.
export const journalRecords = (journals) => asArray(journals)
  .map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const day = dubaiDay(journalDate(entry));
    return day ? { day } : null;
  })
  .filter(Boolean);

export const summarizeJournal = (journals, { days, today }) => {
  const all = journalRecords(journals);
  const daysInPeriod = periodDays(days, today);
  const inPeriod = all.filter((r) => r.day >= daysInPeriod[0] && r.day <= today);
  const entriesByDay = countByDay(inPeriod);

  return {
    entries: inPeriod.length,
    totalEntries: all.length,
    daysWithEntry: entriesByDay.size,
    daily: daysInPeriod.map((day) => ({ day, entries: entriesByDay.get(day) || 0 })),
    weekly: weeksOf(daysInPeriod).map((week) => ({
      start: week[0],
      end: week[week.length - 1],
      entries: week.reduce((sum, day) => sum + (entriesByDay.get(day) || 0), 0),
    })),
  };
};

// ---- Combined -------------------------------------------------------------

// Which activities happened on each day of the period. A source that failed
// to load (null) is reported as unavailable rather than as "no activity".
export const summarizeActivity = ({ moods, sessions, journals }, { days, today }) => {
  const daysInPeriod = periodDays(days, today);
  const sources = {
    mood: moods == null ? null : new Set(moodRecords(moods).map((r) => r.day)),
    meditation: sessions == null ? null : new Set(meditationRecords(sessions).map((r) => r.day)),
    journal: journals == null ? null : new Set(journalRecords(journals).map((r) => r.day)),
  };
  const daily = daysInPeriod.map((day) => ({
    day,
    mood: sources.mood ? sources.mood.has(day) : null,
    meditation: sources.meditation ? sources.meditation.has(day) : null,
    journal: sources.journal ? sources.journal.has(day) : null,
  }));
  const countDays = (key) => (sources[key] ? daily.filter((d) => d[key]).length : null);
  const unavailable = Object.keys(sources).filter((key) => sources[key] === null);
  const recordedOn = (d) => Object.keys(sources).filter((key) => d[key] === true).length;

  return {
    daysInPeriod: days,
    activeDays: daily.filter((d) => d.mood || d.meditation || d.journal).length,
    daysWithMood: countDays('mood'),
    daysWithMeditation: countDays('meditation'),
    daysWithJournal: countDays('journal'),
    // How the activities overlap: days with two or more of them, and days with
    // all three (only known when all three sources loaded).
    daysWithSeveral: daily.filter((d) => recordedOn(d) >= 2).length,
    daysWithAllThree: unavailable.length === 0 ? daily.filter((d) => recordedOn(d) === 3).length : null,
    unavailable,
    daily,
  };
};

// Everything the dashboard shows for one period. Pass null for a source that
// failed to load; its section is then null and the others still work.
export const buildDashboard = ({ moods, sessions, journals }, { days, today = dubaiDay(new Date()) } = {}) => {
  const options = { days: normalizePeriod(days), today };
  return {
    period: options.days,
    today,
    mood: moods == null ? null : summarizeMood(moods, options),
    meditation: sessions == null ? null : summarizeMeditation(sessions, options),
    journal: journals == null ? null : summarizeJournal(journals, options),
    activity: summarizeActivity({ moods, sessions, journals }, options),
  };
};
