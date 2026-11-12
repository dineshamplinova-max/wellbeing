import React, { useState, useEffect } from 'react';
import axios from 'axios';

const PERIOD_LABELS = { week: 'Last 7 days', month: 'Last 30 days' };
const RATING_LABELS = { 5: 'Very good', 4: 'Good', 3: 'Okay', 2: 'Low', 1: 'Very low' };
const FACTOR_LABELS = { sleep: 'Sleep', work: 'Work or study', social: 'Social', exercise: 'Exercise', health: 'Health', other: 'Other' };
const COMPARISON_WORDS = { higher: 'higher than', lower: 'lower than', similar: 'about the same as' };
// Fewer rated check-ins than this and the average is not shown.
const MIN_RATED_FOR_AVERAGE = 3;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// "Good", "Good and Okay", "Good, Okay and Low"
const joinLabels = (labels) => (labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0]);

// Neutral pointers to existing pages; always shown.
const NextSteps = ({ username }) => (
  <div className="mt-6 border-t border-wb-border pt-4">
    <p className="text-wb-muted">
      Looking back can help you notice what supports you. You might like to write about your week.
    </p>
    <p className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
      <a href={`/${encodeURIComponent(username)}/createjournal`} className="wb-link">Write in your journal</a>
      <a href="/support" className="wb-link">Support options</a>
    </p>
  </div>
);

// Descriptive summary of the user's own check-ins. It reports counts and
// averages only; it does not interpret or predict anything.
const MoodSummary = ({ username, refreshKey }) => {
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    axios.get(`http://localhost:8000/api/moods/${encodeURIComponent(username)}/summary?period=${period}`)
      .then((response) => { if (active) setSummary(response.data); })
      .catch(() => { if (active) setError('Your summary could not be loaded. Please try again later.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [username, period, refreshKey]);

  const topFactors = summary
    ? Object.entries(summary.factorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];

  return (
    <section aria-labelledby="mood-summary-title" data-testid="mood-summary">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="mood-summary-title" className="wb-h2">Your summary</h2>
        <div>
          <label htmlFor="summary-period" className="sr-only">Summary period</label>
          <select
            id="summary-period"
            className="wb-input w-auto"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p role="status" className="mt-4 text-wb-muted">Loading your summary…</p>}
      {!loading && error && <p role="alert" className="wb-error">{error}</p>}

      {!loading && !error && summary && (
        summary.totalCheckins === 0 ? (
          <p className="mt-4 text-wb-muted">No check-ins in this period yet.</p>
        ) : (
          <div className="mt-6 space-y-6">
            {summary.ratedCount < 3 && (
              <p className="text-wb-muted">Add a few more check-ins to see patterns over time.</p>
            )}

            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div className="wb-surface-soft p-4">
                <dt className="text-sm text-wb-muted">Check-ins</dt>
                <dd className="mt-1 text-2xl font-semibold">{summary.totalCheckins}</dd>
                <dd className="text-sm text-wb-muted">on {summary.daysWithCheckin} of {summary.period === 'week' ? 7 : 30} days</dd>
              </div>
              <div className="wb-surface-soft p-4" data-testid="average-rating">
                <dt className="text-sm text-wb-muted">Average rating</dt>
                {summary.ratedCount >= MIN_RATED_FOR_AVERAGE && summary.averageRating !== null ? (
                  <>
                    <dd className="mt-1 text-2xl font-semibold">{summary.averageRating}<span className="text-base font-normal text-wb-muted"> / 5</span></dd>
                    <dd className="text-sm text-wb-muted">from {plural(summary.ratedCount, 'rated check-in')}</dd>
                  </>
                ) : (
                  <dd className="mt-1 text-wb-muted">Not enough check-ins yet.</dd>
                )}
              </div>
              {summary.mostFrequent && (
                <div className="wb-surface-soft p-4" data-testid="most-frequent">
                  <dt className="text-sm text-wb-muted">Most often</dt>
                  <dd className="mt-1 text-lg font-semibold">{joinLabels(summary.mostFrequent.levels.map((level) => RATING_LABELS[level]))}</dd>
                  <dd className="text-sm text-wb-muted">
                    {summary.mostFrequent.levels.length > 1
                      ? `${summary.mostFrequent.count} each`
                      : plural(summary.mostFrequent.count, 'check-in')}
                  </dd>
                </div>
              )}
              {summary.energyCount > 0 && (
                <div className="wb-surface-soft p-4" data-testid="average-energy">
                  <dt className="text-sm text-wb-muted">Average energy</dt>
                  <dd className="mt-1 text-2xl font-semibold">{summary.averageEnergy}<span className="text-base font-normal text-wb-muted"> / 5</span></dd>
                  <dd className="text-sm text-wb-muted">from {plural(summary.energyCount, 'check-in')}</dd>
                </div>
              )}
              {summary.sleepCount > 0 && (
                <div className="wb-surface-soft p-4" data-testid="average-sleep">
                  <dt className="text-sm text-wb-muted">Average sleep</dt>
                  <dd className="mt-1 text-2xl font-semibold">{summary.averageSleepHours}<span className="text-base font-normal text-wb-muted"> hours</span></dd>
                  <dd className="text-sm text-wb-muted">from {plural(summary.sleepCount, 'check-in')}</dd>
                </div>
              )}
            </dl>

            {summary.comparison && (
              <p>
                Your average rating in the second half of this period ({summary.comparison.laterAverage}) was{' '}
                {COMPARISON_WORDS[summary.comparison.direction]} the first half ({summary.comparison.earlierAverage}).
              </p>
            )}

            <div>
              <h3 className="wb-h3">Ratings</h3>
              <ul className="mt-3 space-y-2">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = summary.ratingCounts[rating] || 0;
                  const width = summary.ratedCount ? Math.round((count / summary.ratedCount) * 100) : 0;
                  return (
                    <li key={rating} className="flex items-center gap-3">
                      <span className="w-24 flex-shrink-0 text-sm">{RATING_LABELS[rating]}</span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-wb-primary-soft" aria-hidden="true">
                        <span className="block h-full rounded-full bg-wb-primary" style={{ width: `${width}%` }} />
                      </span>
                      <span className="w-8 text-right text-sm">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {topFactors.length > 0 && (
              <p>
                <span className="font-semibold">Factors you noted most: </span>
                {topFactors.map(([factor, count]) => `${FACTOR_LABELS[factor] || factor} (${count})`).join(', ')}
              </p>
            )}

            {summary.lowRatingNotice && (
              <div className="wb-highlight rounded-wb bg-wb-primary-soft/60 p-4">
                <p>
                  Some of your recent check-ins have been lower. You don't have to manage this alone —
                  talking with someone you trust or a professional can help.
                </p>
                <p className="mt-2">
                  <a href="/support" className="wb-link">See support options</a>
                </p>
              </div>
            )}
          </div>
        )
      )}

      {!loading && !error && summary && <NextSteps username={username} />}
    </section>
  );
};

export default MoodSummary;
