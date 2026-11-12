import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { FaMedal, FaTrashAlt } from 'react-icons/fa';
import { CATEGORIES } from './quizData';
import { bandFor, categoryTitle, chartSeries, milestones, sortNewestFirst } from './quizEngine';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const SCORED = CATEGORIES.filter((c) => c.scored);

const TrendChart = ({ history }) => {
  const withData = SCORED.filter((c) => history.some((r) => r.category === c.id));
  const [selected, setSelected] = useState(withData[0]?.id || 'daily');
  const categoryId = withData.some((c) => c.id === selected) ? selected : withData[0]?.id;
  const series = chartSeries(history, categoryId);

  const data = {
    labels: series.map((p) => p.day),
    datasets: [{
      label: 'Overall score',
      data: series.map((p) => p.overall),
      borderColor: 'rgb(37, 99, 235)',
      backgroundColor: 'rgba(22, 163, 74, 0.12)',
      pointBackgroundColor: 'rgb(22, 163, 74)',
      fill: true,
      tension: 0.35,
    }],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { min: 0, max: 100, ticks: { stepSize: 25 } } },
    plugins: { legend: { display: false } },
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="wb-h3">Your trend</h3>
        <label className="flex items-center gap-2 text-sm text-wb-muted">
          Quiz
          <select className="wb-input w-auto py-1" value={categoryId} onChange={(e) => setSelected(e.target.value)}>
            {withData.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 h-56" role="img" aria-label={`Overall scores for ${categoryTitle(categoryId)}: ${series.map((p) => `${p.day} ${p.overall}`).join(', ')}`}>
        {series.length > 1
          ? <Line data={data} options={options} />
          : <p className="flex h-full items-center justify-center text-center text-wb-muted">Save this quiz on another day to see a trend line.</p>}
      </div>
    </div>
  );
};

const Milestones = ({ history }) => (
  <details className="group">
    <summary className="cursor-pointer font-semibold text-wb-text">Milestones (optional)</summary>
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {milestones(history).map((m) => (
        <li key={m.id} className={`flex items-start gap-3 rounded-wb border p-3 ${m.earned ? 'border-wb-accent bg-wb-accent-soft' : 'border-wb-border bg-wb-surface'}`}>
          <FaMedal className={`mt-1 flex-shrink-0 ${m.earned ? 'text-wb-accent' : 'text-wb-control'}`} aria-hidden="true" />
          <span>
            <span className="block font-medium text-wb-text">{m.title} <span className="text-sm font-normal text-wb-muted">({m.earned ? 'earned' : m.progress})</span></span>
            <span className="block text-sm text-wb-muted">{m.description}</span>
          </span>
        </li>
      ))}
    </ul>
  </details>
);

const QuizHistory = ({ history, onRetry, onDelete, onClear }) => {
  const [confirming, setConfirming] = useState(null); // result id, 'all' or null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sorted = useMemo(() => (Array.isArray(history) ? sortNewestFirst(history) : []), [history]);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setConfirming(null);
    } catch {
      setError('That could not be deleted. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (history === undefined) {
    body = <p className="text-wb-muted" role="status">Loading your history…</p>;
  } else if (history === null) {
    body = (
      <div role="alert">
        <p className="text-wb-muted">Your quiz history could not be loaded.</p>
        <button type="button" className="wb-btn wb-btn-secondary mt-3" onClick={onRetry}>Try again</button>
      </div>
    );
  } else if (sorted.length === 0) {
    body = <p className="text-wb-muted">No saved results yet. Finish a quiz and choose &quot;Save to my history&quot; to start tracking your progress.</p>;
  } else {
    body = (
      <div className="space-y-6">
        <TrendChart history={sorted} />
        <div>
          <h3 className="wb-h3">Saved results</h3>
          <ul className="mt-3 divide-y divide-wb-border">
            {sorted.slice(0, 20).map((r) => (
              <li key={r._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium text-wb-text">{categoryTitle(r.category)}</span>
                  <span className="block text-sm text-wb-muted">{r.day} · {r.overall}/100 · {bandFor(r.overall).label}</span>
                </span>
                {confirming === r._id ? (
                  <span className="flex gap-2">
                    <button type="button" className="wb-btn wb-btn-secondary" disabled={busy} onClick={() => run(() => onDelete(r._id))}>Confirm delete</button>
                    <button type="button" className="wb-btn wb-btn-secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="wb-btn wb-btn-secondary" onClick={() => setConfirming(r._id)} aria-label={`Delete ${categoryTitle(r.category)} result from ${r.day}`}>
                    <FaTrashAlt aria-hidden="true" /> Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <Milestones history={sorted} />
        <div className="border-t border-wb-border pt-4">
          {confirming === 'all' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-wb-text">Delete all saved quiz results? This cannot be undone.</span>
              <button type="button" className="wb-btn wb-btn-secondary" disabled={busy} onClick={() => run(onClear)}>Delete all</button>
              <button type="button" className="wb-btn wb-btn-secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="wb-link text-sm" onClick={() => setConfirming('all')}>Delete all saved results</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="wb-card" aria-labelledby="quiz-history-title">
      <h2 id="quiz-history-title" className="wb-h2">History &amp; progress</h2>
      <div className="mt-4">{body}</div>
      {error && <p className="wb-error" role="alert">{error}</p>}
    </section>
  );
};

export default QuizHistory;
