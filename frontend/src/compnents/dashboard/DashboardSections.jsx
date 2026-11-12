import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { MIN_RATED_FOR_AVERAGE } from './dashboardStats';
import { THEME, rgba } from '../../theme';

ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Filler);

// WellBridge palette (canvas cannot read the CSS tokens; see src/theme.js).
const PRIMARY = THEME.primary;
const ACCENT = THEME.accent;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_MUTED = THEME.textMuted;

const LABEL_FOR_LEVEL = { 5: 'Very good', 4: 'Good', 3: 'Okay', 2: 'Low', 1: 'Very low' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- Chart data (pure; exported for tests) --------------------------------

// Daily points for 7 and 30 days; weekly points for 90 days so the chart stays readable.
export const isWeekly = (period) => period > 30;

export const formatDay = (day) => new Date(`${day}T00:00:00Z`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const formatWeek = (week) => `${formatDay(week.start)} – ${formatDay(week.end)}`;

const series = (summary, period, key) => (isWeekly(period)
  ? summary.weekly.map((w) => ({ label: formatWeek(w), value: w[key] }))
  : summary.daily.map((d) => ({ label: formatDay(d.day), value: d[key] })));

export const moodSeries = (mood, period) => series(mood, period, 'rating');
export const meditationSeries = (meditation, period) => series(meditation, period, 'minutes');
export const journalSeries = (journal, period) => series(journal, period, 'entries');

export const prefersReducedMotion = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// No animation at all when reduced motion is requested.
export const chartAnimation = () => (prefersReducedMotion() ? false : { duration: 400, easing: 'easeOutQuart' });

const chartOptions = (y) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: chartAnimation(),
  interaction: { mode: 'nearest', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: THEME.surface,
      titleColor: TEXT,
      bodyColor: TEXT,
      borderColor: BORDER,
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
      displayColors: false,
    },
  },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
    y: { grid: { color: rgba(BORDER, 0.9) }, border: { display: false }, ...y },
  },
});

// ---- Shared building blocks -------------------------------------------------

const Section = ({ id, title, intro, className = '', children }) => (
  <section aria-labelledby={id} className={`wb-card ${className}`}>
    <h2 id={id} className="wb-h3">{title}</h2>
    {intro && <p className="mt-1 text-sm text-wb-muted">{intro}</p>}
    {children}
  </section>
);

// `data` is undefined while loading and null if loading failed.
const SectionBody = ({ data, what, children }) => {
  if (data === undefined) return <p className="mt-4 text-wb-muted">Loading…</p>;
  if (data === null) return <p className="mt-4 text-wb-muted">Your {what} could not be loaded.</p>;
  return children(data);
};

const Stats = ({ items }) => (
  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {items.map(({ label, value, detail }) => (
      <div key={label} className="wb-surface-soft p-3" data-testid="section-stat">
        <dt className="text-sm text-wb-muted">{label}</dt>
        <dd className="mt-1 text-xl font-semibold">{value}</dd>
        {detail && <dd className="text-xs text-wb-muted">{detail}</dd>}
      </div>
    ))}
  </dl>
);

const ChartBox = ({ children }) => <div className="mt-5 h-56 sm:h-64">{children}</div>;

// The same values as the chart, as a table (collapsed by default).
const DataTable = ({ caption, columns, rows }) => (
  <details className="mt-3">
    <summary className="wb-link cursor-pointer text-sm">Show the data as a table</summary>
    <div className="mt-2 max-h-64 overflow-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col" className="border-b border-wb-border py-1 pr-4 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells) => (
            <tr key={cells[0]}>{cells.map((cell, j) => <td key={columns[j]} className="border-b border-wb-border py-1 pr-4">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

const unitWord = (period) => (isWeekly(period) ? 'week' : 'day');

// ---- Mood -------------------------------------------------------------------

export const MoodSection = ({ mood, period, username, className }) => (
  <Section
    id="dashboard-mood-title"
    title="Mood"
    intro="Your check-in ratings, from 1 (Very low) to 5 (Very good)."
    className={className}
  >
    <SectionBody data={mood} what="mood check-ins">
      {(m) => {
        if (m.checkins === 0) {
          return (
            <p className="mt-4 text-wb-muted">
              No mood check-ins in the last {period} days. <a href={`/${username}/mood`} className="wb-link">Check in on your mood</a>
            </p>
          );
        }
        const points = moodSeries(m, period).filter((p) => p.value !== null);
        const enoughRated = m.ratedCount >= MIN_RATED_FOR_AVERAGE;
        return (
          <>
            <Stats items={[
              { label: 'Check-ins', value: m.checkins },
              { label: 'Days checked in', value: `${m.daysWithCheckin} of ${period}` },
              { label: 'Rated check-ins', value: m.ratedCount },
              enoughRated
                ? { label: 'Average mood', value: `${m.averageRating} / 5` }
                : { label: 'Average mood', value: 'Not yet', detail: `Shown from ${MIN_RATED_FOR_AVERAGE} rated check-ins` },
            ]}
            />

            {points.length >= 2 ? (
              <>
                <ChartBox>
                  <Line
                    data={{
                      labels: moodSeries(m, period).map((p) => p.label),
                      datasets: [{
                        label: 'Average rating',
                        data: moodSeries(m, period).map((p) => p.value),
                        borderColor: PRIMARY,
                        backgroundColor: PRIMARY,
                        borderWidth: 2.5,
                        cubicInterpolationMode: 'monotone',
                        spanGaps: true,
                        pointRadius: 3.5,
                        pointHoverRadius: 6,
                        pointBorderColor: THEME.surface,
                        pointBorderWidth: 2,
                        clip: 8,
                      }],
                    }}
                    options={chartOptions({
                      min: 1,
                      max: 5,
                      ticks: { stepSize: 1, color: TEXT_MUTED, callback: (v) => (LABEL_FOR_LEVEL[v] ? `${v} ${LABEL_FOR_LEVEL[v]}` : '') },
                    })}
                    role="img"
                    aria-label={`Average mood rating by ${unitWord(period)} for the last ${period} days, with ${plural(points.length, unitWord(period))} rated. The values are in the table below.`}
                  />
                </ChartBox>
                <DataTable
                  caption={`Average mood rating by ${unitWord(period)}`}
                  columns={[isWeekly(period) ? 'Week' : 'Day', 'Average rating (1–5)']}
                  rows={points.map((p) => [p.label, p.value])}
                />
              </>
            ) : (
              <p className="mt-4 text-wb-muted">Add another rated check-in to see your mood over time.</p>
            )}

            {enoughRated && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold">How often each rating was chosen</h3>
                <ul className="mt-2 space-y-1.5" aria-label="Rating counts">
                  {[5, 4, 3, 2, 1].map((level) => {
                    const count = m.ratingCounts[level] || 0;
                    return (
                      <li key={level} className="flex items-center gap-3 text-sm">
                        <span className="w-20 flex-shrink-0">{LABEL_FOR_LEVEL[level]}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-wb-primary-soft" aria-hidden="true">
                          <span className="block h-full rounded-full bg-wb-primary" style={{ width: `${Math.round((count / m.ratedCount) * 100)}%` }} />
                        </span>
                        <span className="w-6 text-right">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        );
      }}
    </SectionBody>
  </Section>
);

// ---- Meditation -------------------------------------------------------------

export const MeditationSection = ({ meditation, period, username, className }) => (
  <Section
    id="dashboard-meditation-title"
    title="Meditation"
    intro="Based on the sessions you saved. Minutes are the durations you chose when saving, not measured separately."
    className={className}
  >
    <SectionBody data={meditation} what="meditation sessions">
      {(m) => {
        if (m.sessions === 0) {
          return (
            <p className="mt-4 text-wb-muted">
              No saved meditation sessions in the last {period} days. <a href={`/${username}/meditation`} className="wb-link">Try a meditation</a>
            </p>
          );
        }
        const points = meditationSeries(m, period);
        return (
          <>
            <Stats items={[
              { label: 'Saved sessions', value: m.sessions },
              { label: 'Minutes', value: m.totalMinutes },
              { label: 'Days with a session', value: `${m.daysWithSession} of ${period}` },
              { label: 'Days in a row', value: m.currentStreak, detail: `Longest: ${plural(m.longestStreak, 'day')}` },
            ]}
            />
            <ChartBox>
              <Bar
                data={{
                  labels: points.map((p) => p.label),
                  datasets: [{ label: 'Minutes', data: points.map((p) => p.value), backgroundColor: PRIMARY, borderRadius: 4, maxBarThickness: 28 }],
                }}
                options={chartOptions({ beginAtZero: true, ticks: { color: TEXT_MUTED, precision: 0 } })}
                role="img"
                aria-label={`Saved meditation minutes by ${unitWord(period)} for the last ${period} days. The values are in the table below.`}
              />
            </ChartBox>
            <DataTable
              caption={`Saved meditation minutes by ${unitWord(period)}`}
              columns={[isWeekly(period) ? 'Week' : 'Day', 'Minutes']}
              rows={points.filter((p) => p.value > 0).map((p) => [p.label, p.value])}
            />
            <p className="mt-3 text-xs text-wb-muted">
              “Days in a row” counts back from today, or from yesterday if you have not saved a session today yet. Days follow the Asia/Dubai calendar.
            </p>
          </>
        );
      }}
    </SectionBody>
  </Section>
);

// ---- Journal ----------------------------------------------------------------

export const JournalSection = ({ journal, period, username, className }) => (
  <Section
    id="dashboard-journal-title"
    title="Journal writing"
    intro="Only how often you wrote is shown here, never what you wrote."
    className={className}
  >
    <SectionBody data={journal} what="journal entries">
      {(j) => {
        if (j.entries === 0) {
          return (
            <p className="mt-4 text-wb-muted">
              No journal entries in the last {period} days. <a href={`/${username}/createjournal`} className="wb-link">Write in your journal</a>
            </p>
          );
        }
        const points = journalSeries(j, period);
        return (
          <>
            <Stats items={[
              { label: 'Entries', value: j.entries },
              { label: 'Days written', value: `${j.daysWithEntry} of ${period}` },
              { label: 'All entries', value: j.totalEntries, detail: 'Since you started' },
            ]}
            />
            <ChartBox>
              <Bar
                data={{
                  labels: points.map((p) => p.label),
                  datasets: [{ label: 'Entries', data: points.map((p) => p.value), backgroundColor: ACCENT, borderRadius: 4, maxBarThickness: 28 }],
                }}
                options={chartOptions({ beginAtZero: true, ticks: { color: TEXT_MUTED, precision: 0, stepSize: 1 } })}
                role="img"
                aria-label={`Journal entries by ${unitWord(period)} for the last ${period} days. The values are in the table below.`}
              />
            </ChartBox>
            <DataTable
              caption={`Journal entries by ${unitWord(period)}`}
              columns={[isWeekly(period) ? 'Week' : 'Day', 'Entries']}
              rows={points.filter((p) => p.value > 0).map((p) => [p.label, p.value])}
            />
          </>
        );
      }}
    </SectionBody>
  </Section>
);

// ---- Combined activity ------------------------------------------------------

const ACTIVITIES = [
  { key: 'mood', label: 'Mood check-in', marker: '●', className: 'text-wb-primary' },
  { key: 'meditation', label: 'Saved meditation session', marker: '■', className: 'text-wb-accent-hover' },
  { key: 'journal', label: 'Journal entry', marker: '▲', className: 'text-wb-muted' },
];

const fullDay = (day) => new Date(`${day}T00:00:00Z`)
  .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Calendar cells, Monday first: empty slots before the first day line it up.
export const calendarCells = (daily) => {
  if (!daily.length) return [];
  const mondayIndex = (new Date(`${daily[0].day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return [...Array(mondayIndex).fill(null), ...daily];
};

export const describeDay = (entry) => {
  const done = ACTIVITIES.filter((a) => entry[a.key] === true).map((a) => a.label.toLowerCase());
  return `${fullDay(entry.day)}: ${done.length ? done.join(', ') : 'nothing recorded'}`;
};

const NAMES = { mood: 'mood check-ins', meditation: 'saved meditation sessions', journal: 'journal entries' };

// One plain sentence on how the activities overlap across days.
export const describeOverlap = (a) => {
  if (a.daysWithSeveral === 0) return 'No day had more than one of these.';
  const allThree = a.daysWithAllThree ? `, including all three on ${plural(a.daysWithAllThree, 'day')}` : '';
  return `More than one was recorded on ${plural(a.daysWithSeveral, 'day')}${allThree}.`;
};

const shortMonth = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

export const ActivitySection = ({ activity, period, className }) => (
  <Section
    id="dashboard-activity-title"
    title="Activity by day"
    intro="Which days had a mood check-in, a saved meditation session or a journal entry."
    className={className}
  >
    <SectionBody data={activity} what="activity">
      {(a) => {
        const parts = [
          a.daysWithMood !== null && `mood check-ins on ${plural(a.daysWithMood, 'day')}`,
          a.daysWithMeditation !== null && `meditation on ${plural(a.daysWithMeditation, 'day')}`,
          a.daysWithJournal !== null && `journal entries on ${plural(a.daysWithJournal, 'day')}`,
        ].filter(Boolean);
        return (
          <>
            <p className="mt-4">
              Something was recorded on {a.activeDays} of {period} days{parts.length ? `: ${parts.join(', ')}.` : '.'}
            </p>
            {a.activeDays > 0 && <p className="mt-1">{describeOverlap(a)}</p>}
            {a.unavailable.length > 0 && (
              <p className="mt-1 text-sm text-wb-muted">
                {a.unavailable.map((key) => NAMES[key]).join(' and ')} could not be loaded, so {a.unavailable.length === 1 ? 'it is' : 'they are'} not shown.
              </p>
            )}

            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Key">
              {ACTIVITIES.filter((act) => !a.unavailable.includes(act.key)).map((act) => (
                <li key={act.key} className="flex items-center gap-1.5">
                  <span className={act.className} aria-hidden="true">{act.marker}</span>
                  {act.label}
                </li>
              ))}
            </ul>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-wb-muted" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
            </div>
            <ul className="mt-1 grid grid-cols-7 gap-1" aria-label={`Activity for each of the last ${period} days`}>
              {calendarCells(a.daily).map((entry, i) => (entry === null ? (
                <li key={`empty-${i}`} aria-hidden="true" />
              ) : (
                <li
                  key={entry.day}
                  className={`flex min-h-[2.75rem] flex-col items-center justify-center rounded-wb-sm border text-xs ${
                    ACTIVITIES.some((act) => entry[act.key]) ? 'border-wb-primary/40 bg-wb-primary-soft/60' : 'border-wb-border bg-wb-surface'
                  }`}
                >
                  <span className="sr-only">{describeDay(entry)}</span>
                  {/* Month shown on the first day and on the 1st, so month changes are visible. */}
                  {(entry === a.daily[0] || entry.day.endsWith('-01')) && (
                    <span aria-hidden="true" className="text-[0.625rem] font-semibold uppercase leading-none text-wb-muted" data-testid="calendar-month">
                      {shortMonth(entry.day)}
                    </span>
                  )}
                  <span aria-hidden="true">{Number(entry.day.slice(8))}</span>
                  <span aria-hidden="true" className="flex gap-0.5 leading-none">
                    {ACTIVITIES.filter((act) => entry[act.key]).map((act) => (
                      <span key={act.key} className={act.className}>{act.marker}</span>
                    ))}
                  </span>
                </li>
              )))}
            </ul>
          </>
        );
      }}
    </SectionBody>
  </Section>
);
