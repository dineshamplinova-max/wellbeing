import React, { memo, useEffect, useRef, useState } from 'react';
import { FaChild, FaPrayingHands, FaWind, FaWalking, FaChair, FaSpa, FaClock, FaSignal, FaTimes } from 'react-icons/fa';
import './MeditationTracker.css';
import { CATEGORIES, EXERCISES, GENERAL_NOTICE } from './exerciseData.js';

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(({ id, label }) => [id, label]));
const CATEGORY_ICONS = {
  stretching: FaChild,
  yoga: FaPrayingHands,
  breathing: FaWind,
  physical: FaWalking,
  posture: FaChair,
  relaxation: FaSpa,
};

// Shown in place of an exercise picture when there is none or it fails to load.
const ImagePlaceholder = ({ category }) => {
  const Icon = CATEGORY_ICONS[category] || FaSpa;
  return (
    <div
      data-testid="exercise-image-placeholder"
      className="flex h-full w-full items-center justify-center"
      aria-hidden="true"
    >
      <Icon className="h-12 w-12 text-wb-primary" />
    </div>
  );
};

// The exercise's local photo, falling back to the category placeholder.
const ExercisePhoto = ({ exercise }) => {
  const [failed, setFailed] = useState(false);
  if (!exercise.image || failed) return <ImagePlaceholder category={exercise.category} />;
  return (
    <img
      src={exercise.image}
      alt={exercise.imageAlt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
};

const ExerciseImage = ({ src, alt, className }) => <img src={src} alt={alt} className={className} />;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Where Tab (or Shift+Tab) should send focus to keep it inside the guide, or
// null to let the browser move focus normally. `start` is the guide heading,
// which receives focus on open but is not in the Tab order.
export const trapFocusTarget = ({ focusable, active, inside, shiftKey, start }) => {
  if (focusable.length === 0) return start;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (shiftKey) return !inside || active === first || active === start ? last : null;
  return !inside || active === last ? first : null;
};

const ExerciseGuide = ({ exercise, onClose }) => {
  const headingRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const active = document.activeElement;
      const target = trapFocusTarget({
        focusable: Array.from(dialogRef.current.querySelectorAll(FOCUSABLE)),
        active,
        inside: dialogRef.current.contains(active),
        shiftKey: e.shiftKey,
        start: headingRef.current,
      });
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    // If anything outside the guide takes focus while it is open, bring it back.
    const handleFocusIn = (e) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target)) headingRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [onClose]);

  return (
    <div className="med-overlay fixed inset-0 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-guide-title"
        className="med-surface w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="med-badge">
              {CATEGORY_LABELS[exercise.category]}
            </span>
            <h2 id="exercise-guide-title" ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-tight text-wb-text focus:outline-none">
              {exercise.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="med-btn med-btn-neutral flex-shrink-0"
          >
            <FaTimes aria-hidden="true" />
            <span>Close</span>
          </button>
        </div>

        {exercise.image && (
          <figure className="mt-4">
            <div className="med-photo h-48 rounded-2xl sm:h-60">
              <ExercisePhoto exercise={exercise} />
            </div>
            {exercise.credit && (
              <figcaption className="med-credit mt-2">
                Photo:{' '}
                <a href={exercise.credit.url} target="_blank" rel="noopener noreferrer">
                  {exercise.credit.photographer} on {exercise.credit.source}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </figcaption>
            )}
          </figure>
        )}

        <p className="mt-4 text-wb-muted">{exercise.introduction}</p>

        <h3 className="mt-6 text-base font-semibold text-wb-text">Equipment</h3>
        <ul className="mt-2 list-disc pl-5 text-wb-muted">
          {exercise.equipment.map((item) => <li key={item}>{item}</li>)}
        </ul>

        <h3 className="mt-6 text-base font-semibold text-wb-text">Steps</h3>
        <ol aria-label="Steps" className="mt-3 space-y-3">
          {exercise.steps.map((step, index) => (
            <li key={step.text} className="flex gap-3">
              <span className="med-step-num flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" aria-hidden="true">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="text-wb-muted">{step.text}</p>
                {step.image && (
                  <figure className="mt-2">
                    <ExerciseImage src={step.image} alt={step.imageAlt} className="w-full max-w-sm rounded-lg" />
                  </figure>
                )}
              </div>
            </li>
          ))}
        </ol>

        <h3 className="mt-6 text-base font-semibold text-wb-text">How long or how many</h3>
        <p className="mt-2 text-wb-muted">{exercise.guidance}</p>

        <h3 className="mt-6 text-base font-semibold text-wb-text">Safety</h3>
        <ul className="med-notice mt-2 list-disc pl-8 text-wb-muted">
          {exercise.safety.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </div>
    </div>
  );
};

// Static exercise library with category filter and step-by-step guides. It has
// no props and no requests, so the timer ticking above never re-renders it.
const WellnessExercises = () => {
  const [category, setCategory] = useState('all');
  const [openId, setOpenId] = useState(null);
  const returnFocusRef = useRef(null);
  const wasOpen = useRef(false);

  const visible = category === 'all' ? EXERCISES : EXERCISES.filter((e) => e.category === category);
  const openExercise = EXERCISES.find((e) => e.id === openId) || null;

  // After the guide closes, put focus back on the button that opened it.
  useEffect(() => {
    if (openId) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      returnFocusRef.current?.focus();
    }
  }, [openId]);

  const openGuide = (id, button) => {
    returnFocusRef.current = button;
    setOpenId(id);
  };
  // Stable so the guide's keydown listener is not re-added on every render.
  const closeGuide = useRef(() => setOpenId(null)).current;

  const filters = [{ id: 'all', label: 'All' }, ...CATEGORIES];

  return (
    <section aria-labelledby="wellness-exercises-title" className="med-surface mt-6 p-5 sm:p-6">
      <h2 id="wellness-exercises-title" className="text-xl font-semibold tracking-tight text-wb-text">Wellness Exercises</h2>
      <p className="med-notice mt-3">{GENERAL_NOTICE}</p>

      <div role="group" aria-label="Filter exercises by category" className="mt-5 flex flex-wrap gap-2">
        {filters.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
            className="med-chip px-3.5 py-1.5 text-sm"
          >
            {label}
          </button>
        ))}
      </div>

      <ul aria-label="Exercises" className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map((exercise) => (
          <li key={exercise.id} className="med-card flex flex-col">
            <div className="med-photo h-40">
              <ExercisePhoto exercise={exercise} />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <span className="med-badge self-start">
                {CATEGORY_LABELS[exercise.category]}
              </span>
              <h3 className="mt-2 text-base font-semibold text-wb-text">{exercise.name}</h3>
              <p className="mt-1 flex-1 text-sm text-wb-muted">{exercise.description}</p>
              <div className="mt-3 flex items-center gap-4 text-xs font-medium text-wb-muted">
                <span className="flex items-center gap-1">
                  <FaClock className="text-wb-primary" aria-hidden="true" />
                  About {exercise.durationMinutes} min
                </span>
                <span className="flex items-center gap-1">
                  <FaSignal className="text-wb-primary" aria-hidden="true" />
                  {exercise.difficulty}
                </span>
              </div>
              <button
                type="button"
                aria-label={`View guide: ${exercise.name}`}
                onClick={(e) => openGuide(exercise.id, e.currentTarget)}
                className="med-btn med-btn-primary mt-4 w-full"
              >
                View guide
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Keyed by exercise so a different guide always mounts fresh and focuses its own heading. */}
      {openExercise && <ExerciseGuide key={openExercise.id} exercise={openExercise} onClose={closeGuide} />}
    </section>
  );
};

export default memo(WellnessExercises);
