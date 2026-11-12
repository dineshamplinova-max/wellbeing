import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import Navbar from '../navbar/Navbar';
import MoodSummary from './MoodSummary';
import { THEME, rgba } from '../../theme';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

// Mood levels: the five emoji map to the same 1–5 scale as the check-in rating.
//   😄 = 5 Very good, 😊 = 4 Good, 😐 = 3 Okay, 😔 = 2 Low, 😢 = 1 Very low
const RATINGS = [
  { value: 5, emoji: '😄', label: 'Very good' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 2, emoji: '😔', label: 'Low' },
  { value: 1, emoji: '😢', label: 'Very low' },
];
const FACTORS = [
  { value: 'sleep', label: 'Sleep' },
  { value: 'work', label: 'Work or study' },
  { value: 'social', label: 'Social' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'health', label: 'Health' },
  { value: 'other', label: 'Other' },
];
const MAX_NOTE_LENGTH = 500;
const EMPTY_FORM = { rating: null, energy: '', sleepHours: '', factors: [], note: '' };

const LEVEL_FOR_EMOJI = Object.fromEntries(RATINGS.map(({ value, emoji }) => [emoji, value]));
const LABEL_FOR_LEVEL = Object.fromEntries(RATINGS.map(({ value, label }) => [value, label]));
const levelText = (level) => `${level} – ${LABEL_FOR_LEVEL[level]}`;

// Chart colours from the WellBridge palette (canvas cannot read the CSS tokens; see src/theme.js).
const PRIMARY = THEME.primary;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_MUTED = THEME.textMuted;

// Same calendar day as the server uses for check-ins.
const dubaiDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' });
const formatDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Saved entries only, oldest first. Check-ins use their rating; older entries use
// the emoji scale above. Entries with any other mood are left out, never estimated.
const chartPoints = (entries) => entries
  .map((entry) => {
    const level = Number.isInteger(entry.rating) && LABEL_FOR_LEVEL[entry.rating] ? entry.rating : LEVEL_FOR_EMOJI[entry.mood];
    const parsed = entry.date ? new Date(entry.date) : null;
    const day = entry.day || (parsed && !Number.isNaN(parsed.getTime()) ? dubaiDayFormatter.format(parsed) : null);
    return level && day ? { day, level } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.day.localeCompare(b.day));

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Soft blue-to-green fill under the line, for a layered look.
const areaFill = ({ chart }) => {
  const { ctx, chartArea } = chart;
  if (!chartArea) return rgba(PRIMARY, 0.1);
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, rgba(PRIMARY, 0.2));
  gradient.addColorStop(1, rgba(THEME.accent, 0.03));
  return gradient;
};

const chartOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  // One short draw-in; none at all when reduced motion is requested.
  animation: prefersReducedMotion() ? false : { duration: 500, easing: 'easeOutQuart' },
  interaction: { mode: 'nearest', intersect: false },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      min: 1,
      max: 5,
      grid: { color: rgba(BORDER, 0.9) },
      border: { display: false },
      ticks: { stepSize: 1, color: TEXT_MUTED, callback: (value) => (LABEL_FOR_LEVEL[value] ? `${value} ${LABEL_FOR_LEVEL[value]}` : '') },
    },
  },
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
      callbacks: { label: (context) => levelText(context.parsed.y) },
    },
  },
});

const formFromEntry = (entry) => ({
  rating: entry.rating ?? null,
  energy: entry.energy ? String(entry.energy) : '',
  sleepHours: typeof entry.sleepHours === 'number' ? String(entry.sleepHours) : '',
  factors: entry.factors || [],
  note: entry.note || '',
});

// Only the check-in fields are sent; the server sets the user, day and date.
const payloadFromForm = (form) => {
  const payload = { rating: form.rating, factors: form.factors };
  if (form.energy) payload.energy = Number(form.energy);
  if (form.sleepHours !== '') payload.sleepHours = Number(form.sleepHours);
  if (form.note.trim()) payload.note = form.note.trim();
  return payload;
};

const MoodTrack = () => {
  const [moodData, setMoodData] = useState([]);
  const [todayEntry, setTodayEntry] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [summaryKey, setSummaryKey] = useState(0);

  // tokenUser only builds the URL; the API checks the session cookie.
  const username = localStorage.getItem('tokenUser');
  const base = `http://localhost:8000/api/moods/${encodeURIComponent(username)}`;

  useEffect(() => {
    Promise.all([axios.get(base), axios.get(`${base}/today`)])
      .then(([history, today]) => {
        setMoodData(history.data);
        if (today.data) {
          setTodayEntry(today.data);
          setForm(formFromEntry(today.data));
        }
      })
      .catch(() => setError('Your check-ins could not be loaded. Please try again later.'))
      .finally(() => setLoading(false));
  }, [base]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const toggleFactor = (value) => setForm((prev) => ({
    ...prev,
    factors: prev.factors.includes(value) ? prev.factors.filter((f) => f !== value) : [...prev.factors, value],
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.rating) {
      setError('Please choose how you are feeling today.');
      return;
    }
    setSaving(true);
    try {
      const request = todayEntry
        ? axios.patch(`${base}/today`, payloadFromForm(form))
        : axios.post(base, payloadFromForm(form));
      const { data } = await request;
      setTodayEntry(data);
      setForm(formFromEntry(data));
      setMoodData((prev) => [...prev.filter((entry) => entry._id !== data._id), data]);
      setMessage(todayEntry ? "Today's check-in was updated." : "Today's check-in was saved.");
      setSummaryKey((key) => key + 1);
    } catch (err) {
      setError(err?.response?.data?.message || 'Your check-in could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const points = chartPoints(moodData);
  const chartData = {
    labels: points.map((p) => formatDay(p.day)),
    datasets: [{
      label: 'Mood level',
      data: points.map((p) => p.level),
      borderColor: PRIMARY,
      borderWidth: 2.5,
      cubicInterpolationMode: 'monotone', // smooth curve that never overshoots 1–5
      fill: 'start',
      backgroundColor: areaFill,
      pointRadius: 3.5,
      pointHoverRadius: 6,
      pointBackgroundColor: PRIMARY,
      pointBorderColor: THEME.surface,
      pointBorderWidth: 2,
      clip: 8, // keep points at 1 and 5 fully visible
    }],
  };

  return (
    <div className="min-h-screen bg-wb-bg text-wb-text">
      <Navbar />
      <main className="wb-container grid gap-6 pb-16 pt-24 lg:grid-cols-2">
        <form className="wb-card" onSubmit={handleSubmit} aria-labelledby="checkin-title" noValidate>
          <h1 id="checkin-title" className="wb-h2">Today's check-in</h1>
          <p className="mt-2 text-wb-muted">
            {todayEntry ? 'You have checked in today. You can edit your check-in until the end of the day.' : 'One check-in per day. Only the rating is required.'}
          </p>

          {loading ? (
            <p role="status" className="mt-4 text-wb-muted">Loading…</p>
          ) : (
            <>
              <fieldset className="mt-6">
                <legend className="wb-label">How are you feeling today?</legend>
                <div className="grid grid-cols-5 gap-2">
                  {RATINGS.map(({ value, emoji, label }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer flex-col items-center gap-1 rounded-wb border p-2 text-center text-sm focus-within:ring-2 focus-within:ring-wb-primary ${form.rating === value ? 'border-wb-primary bg-wb-primary-soft font-semibold' : 'border-wb-border bg-wb-surface'}`}
                    >
                      <input
                        type="radio"
                        name="rating"
                        value={value}
                        checked={form.rating === value}
                        onChange={() => update('rating', value)}
                        className="sr-only"
                      />
                      <span className="text-2xl sm:text-3xl" aria-hidden="true">{emoji}</span>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="checkin-energy" className="wb-label">Energy (optional)</label>
                  <select id="checkin-energy" className="wb-input" value={form.energy} onChange={(e) => update('energy', e.target.value)}>
                    <option value="">Not set</option>
                    <option value="1">1 – Very low</option>
                    <option value="2">2 – Low</option>
                    <option value="3">3 – Moderate</option>
                    <option value="4">4 – High</option>
                    <option value="5">5 – Very high</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="checkin-sleep" className="wb-label">Hours of sleep (optional)</label>
                  <input
                    id="checkin-sleep"
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    inputMode="decimal"
                    className="wb-input"
                    value={form.sleepHours}
                    onChange={(e) => update('sleepHours', e.target.value)}
                  />
                </div>
              </div>

              <fieldset className="mt-6">
                <legend className="wb-label">What affected your day? (optional)</legend>
                <div className="flex flex-wrap gap-2">
                  {FACTORS.map(({ value, label }) => (
                    <label key={value} className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-wb border border-wb-border bg-wb-surface px-3">
                      <input
                        type="checkbox"
                        checked={form.factors.includes(value)}
                        onChange={() => toggleFactor(value)}
                        className="rounded text-wb-primary focus:ring-wb-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-6">
                <label htmlFor="checkin-note" className="wb-label">Note (optional)</label>
                <textarea
                  id="checkin-note"
                  rows={3}
                  maxLength={MAX_NOTE_LENGTH}
                  aria-describedby="checkin-note-count"
                  className="wb-input"
                  value={form.note}
                  onChange={(e) => update('note', e.target.value)}
                />
                <p id="checkin-note-count" className="wb-help">{form.note.length}/{MAX_NOTE_LENGTH} characters</p>
              </div>

              {error && <p role="alert" className="wb-error">{error}</p>}
              {message && <p role="status" className="mt-3 text-wb-text">{message}</p>}

              <button type="submit" className="wb-btn wb-btn-primary mt-6" disabled={saving}>
                {saving ? 'Saving…' : todayEntry ? 'Update check-in' : 'Save check-in'}
              </button>
            </>
          )}
        </form>

        <section className="wb-card flex flex-col" aria-labelledby="mood-chart-title">
          <h2 id="mood-chart-title" className="wb-h2">Mood over time</h2>
          <p className="mt-2 text-wb-muted">Each point is a saved check-in, from 1 (Very low) to 5 (Very good).</p>
          {points.length >= 2 ? (
            <>
              <div className="mt-6 min-h-[18rem] flex-1">
                <Line
                  data={chartData}
                  options={chartOptions()}
                  role="img"
                  aria-label={`Mood over time: ${points.length} check-ins from ${formatDay(points[0].day)} to ${formatDay(points[points.length - 1].day)}. Each value is listed in the table that follows.`}
                />
              </div>
              <table className="sr-only">
                <caption>Mood check-ins by date</caption>
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Mood level</th></tr>
                </thead>
                <tbody>
                  {points.map((p, index) => (
                    <tr key={`${p.day}-${index}`}><td>{formatDay(p.day)}</td><td>{levelText(p.level)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="mt-4 text-wb-muted">
              {points.length === 1
                ? `1 check-in so far: ${levelText(points[0].level)} on ${formatDay(points[0].day)}. Add another to see your mood over time.`
                : 'No check-ins yet. Your mood over time will appear here once you have saved at least two.'}
            </p>
          )}
        </section>

        {username && (
          <div className="wb-card lg:col-span-2">
            <MoodSummary username={username} refreshKey={summaryKey} />
          </div>
        )}
      </main>
    </div>
  );
};

export default MoodTrack;
