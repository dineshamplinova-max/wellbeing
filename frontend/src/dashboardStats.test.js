// Unit tests for the wellbeing dashboard helpers. Synthetic records only.
// Asia/Dubai is UTC+4 with no daylight saving, so 20:00 UTC is midnight there.
import {
  PERIODS, DEFAULT_PERIOD, dubaiDay, shiftDay, normalizePeriod, periodDays, weeksOf,
  moodRecords, summarizeMood, meditationRecords, currentStreak, longestStreak,
  summarizeMeditation, journalRecords, summarizeJournal, summarizeActivity, buildDashboard,
} from './compnents/dashboard/dashboardStats';

const TODAY = '2026-03-31';
// A valid ObjectId whose embedded timestamp is the given time.
const idFor = (iso, suffix = 'aaaaaaaaaaaaaaaa') => Math.floor(Date.parse(iso) / 1000).toString(16).padStart(8, '0') + suffix;

describe('days and periods', () => {
  test('dubaiDay uses the Asia/Dubai calendar day', () => {
    expect(dubaiDay('2026-03-04T19:59:59Z')).toBe('2026-03-04');
    expect(dubaiDay('2026-03-04T20:00:00Z')).toBe('2026-03-05');
    expect(dubaiDay(new Date('2026-12-31T21:30:00Z'))).toBe('2027-01-01');
    expect(dubaiDay('not a date')).toBeNull();
    expect(dubaiDay(undefined)).toBeNull();
    expect(dubaiDay(null)).toBeNull();
  });

  test('shiftDay crosses month and year ends', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('periods default to 30 days and only allow 7, 30 or 90', () => {
    expect(PERIODS).toEqual([7, 30, 90]);
    expect(DEFAULT_PERIOD).toBe(30);
    expect(normalizePeriod(7)).toBe(7);
    expect(normalizePeriod(90)).toBe(90);
    expect(normalizePeriod(14)).toBe(30);
    expect(normalizePeriod(undefined)).toBe(30);
  });

  test('periodDays lists the days ending today, oldest first, and weeks end today', () => {
    const days = periodDays(7, TODAY);
    expect(days).toEqual(['2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(periodDays(30, TODAY)).toHaveLength(30);
    const weeks = weeksOf(periodDays(30, TODAY));
    expect(weeks.map((w) => w.length)).toEqual([2, 7, 7, 7, 7]);
    expect(weeks[weeks.length - 1][6]).toBe(TODAY);
    expect(weeksOf(periodDays(90, TODAY))).toHaveLength(13);
  });
});

describe('mood', () => {
  const moods = [
    { _id: 'm1', day: '2026-03-31', date: '2026-03-31T05:00:00Z', mood: '😊', rating: 4, energy: 3, sleepHours: 7, note: 'Synthetic private note' },
    { _id: 'm2', day: '2026-03-30', date: '2026-03-30T05:00:00Z', mood: '😐', rating: 3 },
    // Older emoji-only entry without a day: rating from the emoji, day from the Dubai date.
    { _id: 'm3', date: '2026-03-28T21:00:00Z', mood: '😄' },
    // Unknown mood: counts as a check-in, but has no rating.
    { _id: 'm4', day: '2026-03-27', date: '2026-03-27T05:00:00Z', mood: 'calm' },
    { _id: 'm5', day: '2026-03-10', date: '2026-03-10T05:00:00Z', mood: '😔', rating: 2 },
    null, 'not a record', { _id: 'm6', date: 'not a date', mood: '😊' },
  ];

  test('records use the stored day, fall back to the Dubai date, and never keep notes', () => {
    const records = moodRecords(moods);
    expect(records).toEqual([
      { day: '2026-03-31', rating: 4, energy: 3, sleepHours: 7 },
      { day: '2026-03-30', rating: 3, energy: null, sleepHours: null },
      { day: '2026-03-29', rating: 5, energy: null, sleepHours: null },
      { day: '2026-03-27', rating: null, energy: null, sleepHours: null },
      { day: '2026-03-10', rating: 2, energy: null, sleepHours: null },
    ]);
    expect(JSON.stringify(records)).not.toMatch(/Synthetic private note/);
  });

  test('a 7-day summary counts check-ins, averages ratings and lists each day', () => {
    const summary = summarizeMood(moods, { days: 7, today: TODAY });
    expect(summary.checkins).toBe(4);
    expect(summary.daysWithCheckin).toBe(4);
    expect(summary.ratedCount).toBe(3);
    expect(summary.averageRating).toBe(4); // (4 + 3 + 5) / 3
    expect(summary.ratingCounts).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
    expect(summary.averageEnergy).toBe(3);
    expect(summary.averageSleepHours).toBe(7);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.find((d) => d.day === '2026-03-29').rating).toBe(5);
    expect(summary.daily.find((d) => d.day === '2026-03-26').rating).toBeNull();
    expect(summary.weekly).toEqual([{ start: '2026-03-25', end: TODAY, rating: 4, ratedCount: 3 }]);
  });

  test('the average is hidden with fewer than 3 rated check-ins, and rounded to one decimal', () => {
    const two = [{ day: TODAY, rating: 4 }, { day: '2026-03-30', rating: 5 }];
    expect(summarizeMood(two, { days: 7, today: TODAY }).averageRating).toBeNull();
    const three = [...two, { day: '2026-03-29', rating: 5 }];
    expect(summarizeMood(three, { days: 7, today: TODAY }).averageRating).toBe(4.7);
  });

  test('longer periods include older check-ins; empty input gives zero counts', () => {
    expect(summarizeMood(moods, { days: 30, today: TODAY }).checkins).toBe(5);
    const empty = summarizeMood([], { days: 7, today: TODAY });
    expect(empty.checkins).toBe(0);
    expect(empty.averageRating).toBeNull();
    expect(empty.daily.every((d) => d.rating === null)).toBe(true);
  });
});

describe('meditation', () => {
  const sessions = [
    { _id: 's1', duration: 10, type: 'breathing', notes: 'Synthetic note', date: '2026-03-31T06:00:00Z' },
    { _id: 's2', duration: 5, type: 'zen', date: '2026-03-30T06:00:00Z' },
    // 21:00 UTC on the 28th is already the 29th in Dubai.
    { _id: 's3', duration: 15, type: 'mindfulness', date: '2026-03-28T21:00:00Z' },
    { _id: 's4', duration: 20, type: 'zen', date: '2026-03-20T06:00:00Z' },
    { _id: 's5', duration: 'oops', type: 'zen', date: '2026-03-31T07:00:00Z' },
    { _id: 's6', duration: 10, type: 'zen', date: 'not a date' },
  ];

  test('records are grouped by Dubai day; invalid durations count as zero minutes', () => {
    expect(meditationRecords(sessions)).toEqual([
      { day: '2026-03-31', minutes: 10 },
      { day: '2026-03-30', minutes: 5 },
      { day: '2026-03-29', minutes: 15 },
      { day: '2026-03-20', minutes: 20 },
      { day: '2026-03-31', minutes: 0 },
    ]);
  });

  test('a 7-day summary totals sessions and minutes and lists each day', () => {
    const summary = summarizeMeditation(sessions, { days: 7, today: TODAY });
    expect(summary.sessions).toBe(4);
    expect(summary.totalMinutes).toBe(30);
    expect(summary.daysWithSession).toBe(3);
    expect(summary.daily.find((d) => d.day === TODAY).minutes).toBe(10);
    expect(summary.weekly).toEqual([{ start: '2026-03-25', end: TODAY, minutes: 30 }]);
    expect(summarizeMeditation(sessions, { days: 30, today: TODAY }).totalMinutes).toBe(50);
  });

  test('the current streak ends today, or yesterday if today has no session yet', () => {
    const days = new Set(['2026-03-31', '2026-03-30', '2026-03-29', '2026-03-27']);
    expect(currentStreak(days, TODAY)).toBe(3);
    expect(currentStreak(new Set(['2026-03-30', '2026-03-29']), TODAY)).toBe(2);
    expect(currentStreak(new Set(['2026-03-29']), TODAY)).toBe(0);
    expect(currentStreak(new Set(), TODAY)).toBe(0);
    expect(summarizeMeditation(sessions, { days: 7, today: TODAY }).currentStreak).toBe(3);
  });

  test('the longest streak is the longest run of consecutive days in the history', () => {
    expect(longestStreak(new Set(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02', '2026-03-10']))).toBe(4);
    expect(longestStreak(new Set())).toBe(0);
  });
});

describe('journal', () => {
  const journals = [
    { _id: idFor('2026-03-31T05:00:00Z'), title: 'Synthetic title', article: 'Synthetic private journal text', createdAt: '2026-03-31T05:00:00Z', isPrivate: true },
    { _id: idFor('2026-03-31T09:00:00Z', 'bbbbbbbbbbbbbbbb'), title: 'Second', article: 'More text', createdAt: '2026-03-31T09:00:00Z' },
    // No createdAt: the day comes from the ObjectId (21:00 UTC on the 26th is the 27th in Dubai).
    { _id: idFor('2026-03-26T21:00:00Z', 'cccccccccccccccc'), title: 'Old', article: 'Old text' },
    { _id: idFor('2026-02-01T05:00:00Z', 'dddddddddddddddd'), title: 'Older', article: 'Text', createdAt: '2026-02-01T05:00:00Z' },
    { _id: 'not-an-id', title: 'Undated', article: 'Text' },
  ];

  test('records keep only the day: no titles or journal text', () => {
    const records = journalRecords(journals);
    expect(records).toEqual([{ day: '2026-03-31' }, { day: '2026-03-31' }, { day: '2026-03-27' }, { day: '2026-02-01' }]);
    expect(JSON.stringify(records)).not.toMatch(/Synthetic|title|article|text/i);
  });

  test('a 7-day summary counts entries and writing days; the total covers all dated entries', () => {
    const summary = summarizeJournal(journals, { days: 7, today: TODAY });
    expect(summary.entries).toBe(3);
    expect(summary.daysWithEntry).toBe(2);
    expect(summary.totalEntries).toBe(4);
    expect(summary.daily.find((d) => d.day === TODAY).entries).toBe(2);
    expect(summary.weekly).toEqual([{ start: '2026-03-25', end: TODAY, entries: 3 }]);
    expect(JSON.stringify(summary)).not.toMatch(/Synthetic|article/i);
  });
});

describe('combined activity and the whole dashboard', () => {
  const moods = [{ day: TODAY, rating: 4 }, { day: '2026-03-29', rating: 3 }];
  const sessions = [{ duration: 10, date: '2026-03-30T06:00:00Z' }];
  const journals = [{ createdAt: '2026-03-29T06:00:00Z', article: 'Synthetic private journal text' }];

  test('activity marks which activities happened on each day', () => {
    const activity = summarizeActivity({ moods, sessions, journals }, { days: 7, today: TODAY });
    expect(activity.activeDays).toBe(3);
    expect(activity.daysWithMood).toBe(2);
    expect(activity.daysWithMeditation).toBe(1);
    expect(activity.daysWithJournal).toBe(1);
    expect(activity.unavailable).toEqual([]);
    expect(activity.daily.find((d) => d.day === '2026-03-29')).toEqual({ day: '2026-03-29', mood: true, meditation: false, journal: true });
  });

  test('a source that failed to load is reported as unavailable, not as no activity', () => {
    const dashboard = buildDashboard({ moods, sessions: null, journals }, { days: 7, today: TODAY });
    expect(dashboard.meditation).toBeNull();
    expect(dashboard.mood.checkins).toBe(2);
    expect(dashboard.activity.unavailable).toEqual(['meditation']);
    expect(dashboard.activity.daysWithMeditation).toBeNull();
    expect(dashboard.activity.daily[0].meditation).toBeNull();
  });

  test('buildDashboard defaults to 30 days, rejects other periods, and does not change its inputs', () => {
    const input = { moods: [...moods], sessions: [...sessions], journals: [...journals] };
    const snapshot = JSON.stringify(input);
    expect(buildDashboard(input, { today: TODAY }).period).toBe(30);
    expect(buildDashboard(input, { days: 12, today: TODAY }).period).toBe(30);
    const ninety = buildDashboard(input, { days: 90, today: TODAY });
    expect(ninety.period).toBe(90);
    expect(ninety.activity.daily).toHaveLength(90);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(JSON.stringify(ninety)).not.toMatch(/Synthetic private/);
  });

  test('the results contain counts and averages only: no scores or labels', () => {
    const dashboard = buildDashboard({ moods, sessions, journals }, { days: 30, today: TODAY });
    expect(JSON.stringify(dashboard)).not.toMatch(/score|risk|diagnos|predict|depress|anxi/i);
  });
});
