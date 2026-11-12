import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import Navbar from '../navbar/Navbar';
import { buildDashboard, DEFAULT_PERIOD, PERIODS } from './dashboardStats';
import { ActivitySection, JournalSection, MeditationSection, MoodSection } from './DashboardSections.jsx';

const API = 'http://localhost:8000';

// Each history is reduced to the fields the dashboard needs as soon as it
// arrives, so private text (journal titles and entries, mood and meditation
// notes) is never kept in state, shown or logged.
export const pickMoodFields = (moods) => (Array.isArray(moods) ? moods : [])
  .filter((m) => m && typeof m === 'object')
  .map(({ day, date, mood, rating, energy, sleepHours }) => ({ day, date, mood, rating, energy, sleepHours }));

export const pickSessionFields = (sessions) => (Array.isArray(sessions) ? sessions : [])
  .filter((s) => s && typeof s === 'object')
  .map(({ date, duration }) => ({ date, duration }));

export const pickJournalFields = (journals) => (Array.isArray(journals) ? journals : [])
  .filter((j) => j && typeof j === 'object')
  .map(({ _id, createdAt }) => ({ _id, createdAt }));

const SOURCES = [
  { key: 'moods', url: (u) => `${API}/api/moods/${u}`, pick: pickMoodFields },
  { key: 'sessions', url: (u) => `${API}/api/meditation/sessions/${u}`, pick: pickSessionFields },
  { key: 'journals', url: (u) => `${API}/${u}/journals`, pick: pickJournalFields },
];

const INITIAL = { moods: undefined, sessions: undefined, journals: undefined };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One summary tile. `data` is undefined while loading and null if loading failed.
const StatTile = ({ title, data, render }) => {
  let body;
  if (data === undefined) {
    body = <p className="mt-2 text-wb-muted">Loading…</p>;
  } else if (data === null) {
    body = <p className="mt-2 text-wb-muted">This could not be loaded.</p>;
  } else {
    body = render(data);
  }
  return (
    <div className="wb-card flex flex-col" data-testid="stat-tile">
      <h2 className="text-sm font-medium text-wb-muted">{title}</h2>
      {body}
    </div>
  );
};

const Value = ({ children, unit }) => (
  <p className="mt-2 text-3xl font-semibold text-wb-text">
    {children}
    {unit && <span className="text-base font-normal text-wb-muted"> {unit}</span>}
  </p>
);

const Detail = ({ children }) => <p className="mt-1 text-sm text-wb-muted">{children}</p>;

const Dashboard = () => {
  const { username } = useParams();
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [data, setData] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);

  // The three histories load independently; one failing does not stop the others.
  useEffect(() => {
    let active = true;
    const user = encodeURIComponent(username);
    setData(INITIAL);
    SOURCES.forEach(({ key, url, pick }) => {
      axios.get(url(user))
        .then((response) => { if (active) setData((prev) => ({ ...prev, [key]: pick(response.data) })); })
        .catch(() => { if (active) setData((prev) => ({ ...prev, [key]: null })); });
    });
    return () => { active = false; };
  }, [username, attempt]);

  // Sections stay undefined while loading; buildDashboard gets null for those.
  const dashboard = useMemo(() => buildDashboard({
    moods: data.moods ?? null,
    sessions: data.sessions ?? null,
    journals: data.journals ?? null,
  }, { days: period }), [data, period]);

  const sectionData = (key, section) => (data[key] === undefined ? undefined : section);
  const loading = Object.values(data).some((v) => v === undefined);
  const failed = Object.values(data).some((v) => v === null);
  const noActivity = !loading && !failed && dashboard.activity.activeDays === 0;
  const u = encodeURIComponent(username);

  return (
    <div className="min-h-screen bg-wb-bg text-wb-text">
      <Navbar />
      <main className="wb-container pb-16 pt-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="wb-h2">Your wellbeing progress</h1>
            <p className="mt-2 text-wb-muted">
              A summary of your own check-ins, meditation and journal writing. Only you can see this page.
            </p>
          </div>
          <div role="group" aria-label="Period" className="flex gap-2">
            {PERIODS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={period === days}
                onClick={() => setPeriod(days)}
                className={`min-h-[2.75rem] rounded-wb border px-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-wb-primary ${
                  period === days ? 'border-wb-primary bg-wb-primary-soft font-semibold' : 'border-wb-border bg-wb-surface'
                }`}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>

        <p role="status" className="sr-only">
          {loading ? 'Loading your activity…' : `Showing the last ${period} days.`}
        </p>

        {failed && !loading && (
          <div role="alert" className="wb-card mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Some of your activity could not be loaded. The rest is shown below.</p>
            <button type="button" className="wb-btn wb-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        <section aria-label={`Last ${period} days at a glance`} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            title="Mood check-ins"
            data={sectionData('moods', dashboard.mood)}
            render={(mood) => (
              <>
                <Value>{mood.checkins}</Value>
                <Detail>on {mood.daysWithCheckin} of {period} days</Detail>
              </>
            )}
          />
          <StatTile
            title="Average mood"
            data={sectionData('moods', dashboard.mood)}
            render={(mood) => (mood.averageRating === null ? (
              <>
                <p className="mt-2 text-wb-muted">Not enough check-ins yet</p>
                <Detail>Shown from 3 rated check-ins</Detail>
              </>
            ) : (
              <>
                <Value unit="/ 5">{mood.averageRating}</Value>
                <Detail>from {plural(mood.ratedCount, 'rated check-in')}</Detail>
              </>
            ))}
          />
          <StatTile
            title="Meditation minutes"
            data={sectionData('sessions', dashboard.meditation)}
            render={(meditation) => (
              <>
                <Value>{meditation.totalMinutes}</Value>
                <Detail>from {plural(meditation.sessions, 'saved session')}</Detail>
              </>
            )}
          />
          <StatTile
            title="Journal entries"
            data={sectionData('journals', dashboard.journal)}
            render={(journal) => (
              <>
                <Value>{journal.entries}</Value>
                <Detail>written on {plural(journal.daysWithEntry, 'day')}</Detail>
              </>
            )}
          />
        </section>

        {!noActivity && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <MoodSection mood={sectionData('moods', dashboard.mood)} period={period} username={u} className="lg:col-span-2" />
            <MeditationSection meditation={sectionData('sessions', dashboard.meditation)} period={period} username={u} />
            <JournalSection journal={sectionData('journals', dashboard.journal)} period={period} username={u} />
            <ActivitySection activity={loading ? undefined : dashboard.activity} period={period} className="lg:col-span-2" />
          </div>
        )}

        {noActivity && (
          <section aria-labelledby="dashboard-empty-title" className="wb-card mt-6">
            <h2 id="dashboard-empty-title" className="wb-h3">Nothing recorded in the last {period} days</h2>
            <p className="mt-2 text-wb-muted">
              Your progress appears here as you use WellBridge. You could start with one of these:
            </p>
            <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <a href={`/${u}/mood`} className="wb-link">Check in on your mood</a>
              <a href={`/${u}/meditation`} className="wb-link">Try a meditation</a>
              <a href={`/${u}/createjournal`} className="wb-link">Write in your journal</a>
            </p>
          </section>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
