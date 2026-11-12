// Pure quiz logic: adaptive question flow, validation, scoring, rule-based
// insights, suggestions, comparison with earlier results and milestones.
// Nothing here talks to the network or storage, so it is easy to test.
import { AREA_LABELS, SCORED_CATEGORY_IDS, getCategory } from './quizData';
import { EXERCISES } from '../meditation/exerciseData';

// ---------------------------------------------------------------------------
// Answers and the adaptive flow
// ---------------------------------------------------------------------------

// Wellbeing value of a scored or ordered answer on a 0-4 scale (higher is
// more comfortable), or null when the question has no ordered answer.
export const wellbeingValue = (question, value) => {
  if (value === undefined || value === null) return null;
  let normalized;
  if (question.type === 'scale') {
    const steps = question.options.length - 1;
    if (!Number.isInteger(value) || value < 0 || value > steps) return null;
    normalized = (value / steps) * 4;
  } else if (question.type === 'slider') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    normalized = ((value - question.min) / (question.max - question.min)) * 4;
  } else {
    return null;
  }
  return question.reverse ? 4 - normalized : normalized;
};

const followUpApplies = (question, answers, byId) => {
  if (!question.showIf) return true;
  const source = byId[question.showIf.id];
  const value = source ? wellbeingValue(source, answers[source.id]) : null;
  return value !== null && value < question.showIf.below;
};

// The questions to ask, given the answers so far. Follow-ups appear only when
// their condition is met.
export const visibleQuestions = (category, answers = {}) => {
  const byId = Object.fromEntries(category.questions.map((q) => [q.id, q]));
  return category.questions.filter((q) => followUpApplies(q, answers, byId));
};

// Drops answers to follow-ups that are no longer asked.
export const pruneAnswers = (category, answers) => {
  const visible = new Set(visibleQuestions(category, answers).map((q) => q.id));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => visible.has(id)));
};

export const isRequired = (question) => question.required !== false;

// Returns an error message for the current answer, or '' when it is fine.
export const validateAnswer = (question, value) => {
  const empty = value === undefined || value === null || (Array.isArray(value) && value.length === 0);
  if (empty) return isRequired(question) ? 'Please choose an answer to continue.' : '';
  switch (question.type) {
    case 'scale':
      return Number.isInteger(value) && value >= 0 && value < question.options.length ? '' : 'Please choose one of the options.';
    case 'slider':
      return typeof value === 'number' && value >= question.min && value <= question.max ? '' : 'Please choose a value on the slider.';
    case 'choice':
      return question.options.some((o) => o.value === value) ? '' : 'Please choose one of the options.';
    case 'multi': {
      if (!Array.isArray(value) || !value.every((v) => question.options.some((o) => o.value === v))) return 'Please choose from the list.';
      if (value.length > question.maxSelections) return `Please choose up to ${question.maxSelections}.`;
      return '';
    }
    default:
      return '';
  }
};

// Human-readable answer, used by the conversation view and summaries.
export const answerLabel = (question, value) => {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return 'Skipped';
  switch (question.type) {
    case 'scale': return question.options[value];
    case 'slider': return question.unit ? `${value} ${question.unit}` : `${value} out of ${question.max}`;
    case 'choice': return question.options.find((o) => o.value === value)?.label ?? '';
    case 'multi': return value.map((v) => question.options.find((o) => o.value === v)?.label).filter(Boolean).join(', ');
    default: return String(value);
  }
};

const DEFAULT_ACKS = {
  low: "Thanks for sharing that. It's okay to have harder days.",
  mid: 'Thanks, noted.',
  high: "That's good to hear.",
};

// Scripted reply shown after an answer in the guided conversation view.
export const acknowledgement = (category, question, value) => {
  if (category.neutralAcks) return 'Thank you.';
  if (question.type === 'choice' || question.type === 'multi') {
    return value === undefined || (Array.isArray(value) && value.length === 0)
      ? 'No problem, we can skip that.'
      : 'Thanks, that helps tailor your suggestions.';
  }
  const w = wellbeingValue(question, value);
  if (w === null) return DEFAULT_ACKS.mid;
  const acks = { ...DEFAULT_ACKS, ...(question.area ? question.ack : {}) };
  if (w < 1.5) return acks.low;
  if (w < 2.75) return acks.mid;
  return acks.high;
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const BANDS = {
  good: { id: 'good', label: 'Going well' },
  mixed: { id: 'mixed', label: 'Some ups and downs' },
  care: { id: 'care', label: 'Could use extra care' },
};
export const bandFor = (score) => (score >= 70 ? BANDS.good : score >= 40 ? BANDS.mixed : BANDS.care);

// Area scores (0-100) and an overall score for a scored category.
export const scoreQuiz = (category, answers) => {
  if (!category.scored) return null;
  const totals = {};
  for (const question of visibleQuestions(category, answers)) {
    if (!question.area) continue;
    const w = wellbeingValue(question, answers[question.id]);
    if (w === null) continue;
    (totals[question.area] ||= []).push(w);
  }
  const areas = Object.entries(totals).map(([area, values]) => ({
    area,
    label: AREA_LABELS[area] || area,
    score: Math.round((values.reduce((a, b) => a + b, 0) / values.length / 4) * 100),
  }));
  if (areas.length === 0) return null;
  const overall = Math.round(areas.reduce((sum, a) => sum + a.score, 0) / areas.length);
  return { overall, band: bandFor(overall), areas: areas.map((a) => ({ ...a, band: bandFor(a.score) })) };
};

// The payload the API accepts: { category, scores: { area: score } }.
export const toSavePayload = (categoryId, score) => ({
  category: categoryId,
  scores: Object.fromEntries(score.areas.map((a) => [a.area, a.score])),
});

// ---------------------------------------------------------------------------
// Comparison and history
// ---------------------------------------------------------------------------

const resultTime = (r) => new Date(r.createdAt || `${r.day}T00:00:00Z`).getTime();
export const sortNewestFirst = (history) => [...history].sort((a, b) => resultTime(b) - resultTime(a));

export const latestResult = (history, categoryId) =>
  sortNewestFirst(history).find((r) => r.category === categoryId) || null;

// Differences from an earlier saved result in the same category.
export const compareWithPrevious = (score, previous) => {
  if (!score || !previous) return null;
  const before = Object.fromEntries((previous.scores || []).map((s) => [s.area, s.score]));
  return {
    previousDay: previous.day,
    overallChange: score.overall - previous.overall,
    areas: score.areas
      .filter((a) => typeof before[a.area] === 'number')
      .map((a) => ({ area: a.area, label: a.label, change: a.score - before[a.area] })),
  };
};

// Oldest-to-newest points for the history chart.
export const chartSeries = (history, categoryId, limit = 12) =>
  sortNewestFirst(history.filter((r) => r.category === categoryId)).slice(0, limit).reverse()
    .map((r) => ({ day: r.day, overall: r.overall }));

const dayNumber = (day) => Math.round(new Date(`${day}T00:00:00Z`).getTime() / 86400000);

// Longest run of consecutive days with a saved daily check-in.
export const longestDailyStreak = (history) => {
  const days = [...new Set(history.filter((r) => r.category === 'daily').map((r) => r.day))]
    .map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d - days[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
};

// Optional milestones, all derived from saved results.
export const milestones = (history) => {
  const categories = new Set(history.map((r) => r.category));
  const explored = SCORED_CATEGORY_IDS.filter((id) => categories.has(id)).length;
  const dailyCount = history.filter((r) => r.category === 'daily').length;
  const streak = longestDailyStreak(history);
  const improved = SCORED_CATEGORY_IDS.some((id) => {
    const [latest, previous] = sortNewestFirst(history.filter((r) => r.category === id));
    return latest && previous && latest.overall - previous.overall >= 10;
  });
  return [
    { id: 'first', title: 'First step', description: 'Save your first result.', earned: history.length > 0, progress: `${Math.min(history.length, 1)}/1` },
    { id: 'explorer', title: 'Explorer', description: 'Save a result in every wellbeing quiz.', earned: explored === SCORED_CATEGORY_IDS.length, progress: `${explored}/${SCORED_CATEGORY_IDS.length}` },
    { id: 'streak', title: 'Three in a row', description: 'Check in on three days in a row.', earned: streak >= 3, progress: `${Math.min(streak, 3)}/3` },
    { id: 'regular', title: 'Regular check-ins', description: 'Save five daily check-ins.', earned: dailyCount >= 5, progress: `${Math.min(dailyCount, 5)}/5` },
    { id: 'growth', title: 'Upward step', description: 'Improve a quiz result by 10 points or more.', earned: improved, progress: improved ? '1/1' : '0/1' },
  ];
};

// ---------------------------------------------------------------------------
// Rule-based insights and suggestions
// ---------------------------------------------------------------------------

const exercise = (id) => EXERCISES.find((e) => e.id === id);
const exerciseSuggestion = (id, why) => {
  const ex = exercise(id);
  if (!ex) return null;
  return { key: `exercise-${id}`, kind: 'exercise', title: ex.name, detail: `${ex.durationMinutes} min · ${why}`, route: 'meditation' };
};

const SUGGESTIONS = {
  journal: (prompt) => ({ key: 'journal', kind: 'journal', title: 'Write a short journal entry', detail: `Try this prompt: "${prompt}"`, route: 'createjournal' }),
  mood: { key: 'mood', kind: 'mood', title: 'Log a daily mood check-in', detail: 'Tracking sleep and mood over time can show helpful patterns.', route: 'mood' },
  meditation: { key: 'meditation', kind: 'meditation', title: 'Try a short guided session', detail: 'Even five quiet minutes can help you reset.', route: 'meditation' },
  community: { key: 'community', kind: 'community', title: 'Visit the anonymous community', detail: 'Read or share experiences without your name attached.', route: 'anonymoussharing' },
  support: { key: 'support', kind: 'support', title: 'See support options', detail: 'Ways to reach people who can help.', route: 'support' },
};

const AREA_SUGGESTIONS = {
  mood: () => [SUGGESTIONS.journal('What is one small thing that went okay today?'), SUGGESTIONS.mood],
  energy: () => [exerciseSuggestion('easy-walk', 'gentle movement can lift energy'), exerciseSuggestion('marching-on-the-spot', 'a quick indoor reset')],
  calm: () => [exerciseSuggestion('box-breathing', 'slows things down when stress is high'), exerciseSuggestion('senses-pause', 'brings attention back to the present')],
  coping: () => [SUGGESTIONS.journal('What is one thing I can let go of this week?'), exerciseSuggestion('box-breathing', 'a steady pause before the next task')],
  body: () => [exerciseSuggestion('progressive-muscle-relaxation', 'releases tension step by step'), exerciseSuggestion('shoulder-rolls', 'loosens tight shoulders')],
  rest: () => [exerciseSuggestion('belly-breathing', 'a calm way to wind down before bed'), SUGGESTIONS.mood],
  routine: () => [exerciseSuggestion('childs-pose', 'a gentle stretch for a screen-free wind-down'), SUGGESTIONS.journal('What would a calmer evening routine look like for me?')],
  connection: () => [SUGGESTIONS.community, SUGGESTIONS.journal('Who is someone I would like to reconnect with?')],
  support: () => [SUGGESTIONS.support, SUGGESTIONS.community],
  focus: () => [exerciseSuggestion('seated-chin-tuck', 'a quick desk reset between tasks'), SUGGESTIONS.meditation],
  balance: () => [exerciseSuggestion('neck-side-stretch', 'a short break from the screen'), SUGGESTIONS.journal('What is one thing I enjoy that I can make time for?')],
};

const NEED_SUGGESTIONS = {
  breathe: () => exerciseSuggestion('box-breathing', 'you asked for a moment to breathe'),
  move: () => exerciseSuggestion('easy-walk', 'you asked for some movement'),
  write: () => SUGGESTIONS.journal('What is on my mind right now?'),
  talk: () => SUGGESTIONS.community,
  rest: () => exerciseSuggestion('belly-breathing', 'you asked for rest'),
  breathing: () => exerciseSuggestion('belly-breathing', 'you said slow breathing helps'),
  movement: () => exerciseSuggestion('cat-cow', 'you said movement helps'),
  community: () => SUGGESTIONS.community,
  professional: () => SUGGESTIONS.support,
};

// Up to `limit` suggestions: first from what the person asked for, then for
// the areas with the lowest scores.
export const recommendations = (category, answers, score, limit = 4) => {
  const picked = [];
  const add = (s) => { if (s && !picked.some((p) => p.key === s.key)) picked.push(s); };
  for (const question of visibleQuestions(category, answers)) {
    if (question.type === 'choice' && NEED_SUGGESTIONS[answers[question.id]]) add(NEED_SUGGESTIONS[answers[question.id]]());
  }
  if (score) {
    const byNeed = [...score.areas].sort((a, b) => a.score - b.score);
    for (const area of byNeed) {
      if (area.score >= 70 && picked.length >= 2) break;
      (AREA_SUGGESTIONS[area.area]?.() || []).forEach(add);
    }
  }
  if (picked.length === 0) add(SUGGESTIONS.meditation);
  return picked.slice(0, limit);
};

const FOLLOW_UP_INSIGHTS = {
  s_sources: (labels) => `You mentioned ${labels} adding to your stress. Naming what weighs on you is a useful first step.`,
  sl_blockers: (labels) => `You said ${labels} can get in the way of sleep. Small changes to one of these is a good place to start.`,
  f_blockers: (labels) => `You said ${labels} can get in the way of focus. Shorter work blocks with planned breaks may help.`,
};

// Short, descriptive observations. They describe answers; they never diagnose.
export const insights = (category, answers, score, comparison) => {
  const list = [];
  if (score) {
    const sorted = [...score.areas].sort((a, b) => b.score - a.score);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    if (sorted.length > 1 && strongest.score - weakest.score >= 15) {
      list.push(`${strongest.label} looks like a relative strength right now (${strongest.score}/100).`);
      list.push(`${weakest.label} scored lowest (${weakest.score}/100), so the suggestions below focus there.`);
    } else {
      list.push(`Your answers were fairly even across areas, with an overall score of ${score.overall}/100.`);
    }
  }
  for (const question of visibleQuestions(category, answers)) {
    const value = answers[question.id];
    if (question.type === 'multi' && FOLLOW_UP_INSIGHTS[question.id] && Array.isArray(value)) {
      const chosen = value.filter((v) => v !== 'prefer-not' && v !== 'other');
      if (chosen.length) list.push(FOLLOW_UP_INSIGHTS[question.id](answerLabel(question, chosen).toLowerCase()));
    }
    if (question.id === 'sl_hours' && typeof value === 'number') {
      if (value < 7) list.push(`You usually sleep about ${value} hours. Many adults feel better with around 7 to 9 hours.`);
      else if (value > 9) list.push(`You usually sleep about ${value} hours. If you still feel tired, it may be worth mentioning to a doctor.`);
      else list.push(`You usually sleep about ${value} hours, which is within the commonly suggested 7 to 9 hours for adults.`);
    }
  }
  if (comparison) {
    const { overallChange } = comparison;
    if (overallChange >= 5) list.push(`That is ${overallChange} points higher than your last saved result.`);
    else if (overallChange <= -5) list.push(`That is ${Math.abs(overallChange)} points lower than your last saved result. Be kind to yourself; scores naturally go up and down.`);
    else list.push('That is about the same as your last saved result.');
  }
  return list;
};

// Show the support notice for low overall scores or a very low mood answer.
export const needsSupportNotice = (category, answers, score) => {
  if (score && score.overall < 40) return true;
  const mood = category.questions.find((q) => q.id === 'd_mood');
  const w = mood ? wellbeingValue(mood, answers.d_mood) : null;
  return w !== null && w <= 1.2;
};

export const categoryTitle = (id) => getCategory(id)?.title || id;
