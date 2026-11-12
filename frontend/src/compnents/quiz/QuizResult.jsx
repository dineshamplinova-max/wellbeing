import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowDown, FaArrowUp, FaBook, FaCheckCircle, FaHandsHelping, FaHeart, FaLeaf, FaRedo, FaSave, FaSmile, FaSpinner, FaUsers } from 'react-icons/fa';
import { DISCLAIMER, REFLECTION_RESULT, RULES_NOTICE, SUPPORT_NOTICE } from './quizData';
import { compareWithPrevious, insights, latestResult, needsSupportNotice, recommendations } from './quizEngine';

// Circular meter with a blue-to-green stroke. `label` is the accessible text.
export const ScoreRing = ({ value, size = 120, stroke = 10, label, children }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const gradientId = `wb-ring-${size}`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--wb-primary))" />
            <stop offset="100%" stopColor="rgb(var(--wb-accent))" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--wb-border))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`url(#${gradientId})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 600ms var(--wb-ease)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">{children}</div>
    </div>
  );
};

const BAND_ICON = { good: FaCheckCircle, mixed: FaLeaf, care: FaHeart };
const KIND_ICON = { exercise: FaLeaf, meditation: FaLeaf, journal: FaBook, mood: FaSmile, community: FaUsers, support: FaHandsHelping };

const routeFor = (username, route) => (route === 'support' ? '/support' : `/${username}/${route}`);

const Change = ({ value }) => {
  if (value === 0) return <span className="text-sm text-wb-muted">no change</span>;
  const Icon = value > 0 ? FaArrowUp : FaArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${value > 0 ? 'text-wb-accent-hover' : 'text-wb-muted'}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {value > 0 ? `+${value}` : value}
      <span className="sr-only">{value > 0 ? 'points higher' : 'points lower'}</span>
    </span>
  );
};

const SaveStatus = ({ saveState, onSave }) => {
  if (saveState.status === 'saved') {
    return (
      <p className="wb-badge-success" role="status">
        <FaCheckCircle aria-hidden="true" /> {saveState.replaced ? "Saved. Today's earlier result was replaced." : 'Saved to your history.'}
      </p>
    );
  }
  const saving = saveState.status === 'saving';
  return (
    <div>
      <button type="button" className="wb-btn wb-btn-primary" onClick={onSave} disabled={saving} aria-busy={saving}>
        {saving ? <FaSpinner className="animate-spin" aria-hidden="true" /> : <FaSave aria-hidden="true" />}
        {saving ? 'Saving...' : 'Save to my history'}
      </button>
      {saveState.status === 'error' && <p className="wb-error" role="alert">{saveState.message}</p>}
    </div>
  );
};

const QuizResult = ({ username, category, answers, score, history, saveState, onSave, onRestart, onHome }) => {
  if (!category.scored) {
    return (
      <section className="wb-card" role="status" aria-labelledby="quiz-result-title">
        <h2 id="quiz-result-title" className="wb-h2" tabIndex={-1}>About this questionnaire</h2>
        {REFLECTION_RESULT.map((text) => <p key={text} className="mt-4 text-wb-muted">{text}</p>)}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/support" className="wb-btn wb-btn-secondary">See support options</Link>
          <button type="button" className="wb-btn wb-btn-primary" onClick={onHome}>Back to quizzes</button>
        </div>
      </section>
    );
  }

  const previous = latestResult(history || [], category.id);
  const comparison = compareWithPrevious(score, previous);
  const notes = insights(category, answers, score, comparison);
  const suggestions = recommendations(category, answers, score);
  const showSupport = needsSupportNotice(category, answers, score);
  const BandIcon = BAND_ICON[score.band.id];

  return (
    <div className="space-y-6">
      <section className="wb-card" aria-labelledby="quiz-result-title">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ScoreRing value={score.overall} size={136} label={`Overall ${score.overall} out of 100: ${score.band.label}`}>
            <span className="text-3xl font-bold text-wb-text">{score.overall}</span>
            <span className="text-xs text-wb-muted">out of 100</span>
          </ScoreRing>
          <div className="text-center sm:text-left">
            <p className="text-sm font-medium uppercase tracking-wide text-wb-primary">{category.title}</p>
            <h2 id="quiz-result-title" className="wb-h2 mt-1" tabIndex={-1}>Your wellbeing snapshot</h2>
            <p className="mt-2 inline-flex items-center gap-2 font-semibold text-wb-text">
              <BandIcon className="text-wb-accent" aria-hidden="true" /> {score.band.label}
            </p>
            {comparison && (
              <p className="mt-1 text-sm text-wb-muted">
                Compared with your last saved result ({comparison.previousDay}): <Change value={comparison.overallChange} />
              </p>
            )}
          </div>
        </div>

        <ul className="mt-6 space-y-4" aria-label="Scores by area">
          {score.areas.map((area) => {
            const change = comparison?.areas.find((c) => c.area === area.area)?.change;
            return (
              <li key={area.area}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-wb-text">{area.label}</span>
                  <span className="text-sm text-wb-muted">
                    {area.band.label} · <span className="font-semibold text-wb-text">{area.score}</span>/100
                    {typeof change === 'number' && <> · <Change value={change} /></>}
                  </span>
                </div>
                <div className="wb-progress mt-1" role="meter" aria-label={`${area.label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={area.score}>
                  <div className="wb-progress-bar" style={{ width: `${area.score}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {showSupport && (
        <section className="wb-card wb-highlight" aria-label="Support">
          <p className="text-wb-text">{SUPPORT_NOTICE}</p>
          <Link to="/support" className="wb-link mt-2 inline-block">See support options</Link>
        </section>
      )}

      <section className="wb-card" aria-labelledby="quiz-insights-title">
        <h3 id="quiz-insights-title" className="wb-h3">Personal insights</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-wb-text">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
        <p className="wb-help mt-4">{RULES_NOTICE}</p>
      </section>

      <section aria-labelledby="quiz-suggestions-title">
        <h3 id="quiz-suggestions-title" className="wb-h3">Suggested next steps</h3>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2">
          {suggestions.map((s) => {
            const Icon = KIND_ICON[s.kind] || FaLeaf;
            return (
              <li key={s.key}>
                <Link to={routeFor(username, s.route)} className="wb-card wb-lift flex h-full gap-3 text-left no-underline">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-wb-primary-soft text-wb-primary" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>
                    <span className="block font-semibold text-wb-text">{s.title}</span>
                    <span className="mt-1 block text-sm text-wb-muted">{s.detail}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="wb-surface-soft p-5" aria-labelledby="quiz-save-title">
        <h3 id="quiz-save-title" className="font-semibold text-wb-text">Keep track of your progress</h3>
        <p className="mt-1 text-sm text-wb-muted">
          Saving keeps only your score for each area and today&apos;s date, never your individual answers. You can delete saved results at any time.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SaveStatus saveState={saveState} onSave={onSave} />
          <button type="button" className="wb-btn wb-btn-secondary" onClick={onRestart}>
            <FaRedo aria-hidden="true" /> Retake
          </button>
          <button type="button" className="wb-btn wb-btn-secondary" onClick={onHome}>Back to quizzes</button>
        </div>
      </section>

      <p className="wb-help">{DISCLAIMER}</p>
    </div>
  );
};

export default QuizResult;
