import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaBrain, FaBullseye, FaComments, FaListOl, FaMoon, FaSun, FaUsers, FaWind } from 'react-icons/fa';
import Navbar from '../navbar/Navbar';
import { CATEGORIES, DISCLAIMER, getCategory } from './quizData';
import { isRequired, pruneAnswers, scoreQuiz, toSavePayload, validateAnswer, visibleQuestions } from './quizEngine';
import { AnswerInput, ConversationTranscript } from './QuizQuestion.jsx';
import QuizResult, { ScoreRing } from './QuizResult.jsx';
import QuizHistory from './QuizHistory.jsx';

// The previous version called Gemini from the browser, which exposed an API key
// and sent answers to a third party. This version has no AI: scoring,
// insights and suggestions are fixed rules in quizEngine.js. Results reach the
// server only when the user chooses to save them, and then only as area
// scores. The two-week reflection is never scored, saved or sent.
const API = 'http://localhost:8000';
const resultsUrl = (username) => `${API}/api/quiz/${encodeURIComponent(username)}/results`;

const ICONS = { sun: FaSun, wind: FaWind, moon: FaMoon, users: FaUsers, target: FaBullseye, brain: FaBrain };

// In-progress answers are kept in sessionStorage (this tab only, cleared when
// it closes) so a refresh or a visit to another page does not lose them. The
// private reflection questionnaire is never stored.
const draftKey = (username) => `wb-quiz-draft:${username}`;
export const readDraft = (username) => {
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(draftKey(username)) || 'null');
    const category = draft && getCategory(draft.categoryId);
    if (!category || category.privateOnly || typeof draft.answers !== 'object' || !Number.isInteger(draft.step)) return null;
    return { categoryId: category.id, answers: draft.answers, step: draft.step, mode: draft.mode === 'chat' ? 'chat' : 'steps' };
  } catch {
    return null;
  }
};
const writeDraft = (username, draft) => {
  try { window.sessionStorage.setItem(draftKey(username), JSON.stringify(draft)); } catch { /* storage unavailable */ }
};
const clearDraft = (username) => {
  try { window.sessionStorage.removeItem(draftKey(username)); } catch { /* storage unavailable */ }
};

const saveErrorMessage = (error) => {
  if (!error?.response) return 'We could not reach the server. Please check your connection and try again.';
  return error.response.data?.message || 'Your result could not be saved. Please try again.';
};

const CategoryCard = ({ category, onStart, featured }) => {
  const Icon = ICONS[category.icon] || FaBrain;
  return (
    <button
      type="button"
      onClick={() => onStart(category.id)}
      className={`wb-card wb-lift flex h-full w-full flex-col text-left ${featured ? 'sm:flex-row sm:items-center sm:gap-6' : ''}`}
    >
      <span className={`flex flex-shrink-0 items-center justify-center rounded-wb bg-gradient-to-br from-wb-primary-soft to-wb-accent-soft text-wb-primary shadow-wb-sm ${featured ? 'h-16 w-16 text-2xl' : 'h-12 w-12 text-xl'}`} aria-hidden="true">
        <Icon />
      </span>
      <span className="mt-4 block sm:mt-0">
        <span className="block text-lg font-semibold text-wb-text">{category.title}</span>
        <span className="mt-1 block text-wb-muted">{category.tagline}</span>
        <span className="mt-2 block text-sm text-wb-muted">
          About {category.minutes} min{category.scored ? '' : ' · not scored or saved'}
        </span>
      </span>
    </button>
  );
};

const ModeToggle = ({ mode, onChange }) => (
  <fieldset className="inline-flex rounded-wb border border-wb-border bg-wb-surface p-1 shadow-wb-sm">
    <legend className="sr-only">Quiz view</legend>
    {[{ id: 'steps', label: 'Step by step', Icon: FaListOl }, { id: 'chat', label: 'Guided conversation', Icon: FaComments }].map(({ id, label, Icon }) => (
      <label key={id} className="cursor-pointer">
        <input type="radio" name="quiz-mode" value={id} checked={mode === id} onChange={() => onChange(id)} className="peer sr-only" />
        <span className="flex items-center gap-2 rounded-wb-sm px-3 py-2 text-sm font-medium text-wb-muted transition peer-checked:bg-wb-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-wb-primary peer-focus-visible:ring-offset-2">
          <Icon aria-hidden="true" /> {label}
        </span>
      </label>
    ))}
  </fieldset>
);

const Quiz = () => {
  const { username } = useParams();
  const [screen, setScreen] = useState('home'); // home | quiz | result
  const [categoryId, setCategoryId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('steps');
  const [error, setError] = useState('');
  const [score, setScore] = useState(null);
  const [saveState, setSaveState] = useState({ status: 'idle' });
  const [history, setHistory] = useState(undefined); // undefined loading, null failed
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [draft, setDraft] = useState(() => readDraft(username));
  const headingRef = useRef(null);
  const savingRef = useRef(false);

  const category = categoryId ? getCategory(categoryId) : null;
  const questions = useMemo(() => (category ? visibleQuestions(category, answers) : []), [category, answers]);
  const current = questions[Math.min(step, questions.length - 1)];
  const isLast = step >= questions.length - 1;

  useEffect(() => {
    let active = true;
    setHistory(undefined);
    axios.get(resultsUrl(username))
      .then((response) => { if (active) setHistory(Array.isArray(response.data) ? response.data : []); })
      .catch(() => { if (active) setHistory(null); });
    return () => { active = false; };
  }, [username, historyAttempt]);

  // Keep the in-progress quiz in this tab's session storage.
  useEffect(() => {
    if (screen !== 'quiz' || !category || category.privateOnly) return;
    writeDraft(username, { categoryId: category.id, answers, step, mode });
  }, [screen, category, answers, step, mode, username]);

  // Move focus to the new question or result heading for keyboard and
  // screen-reader users.
  useEffect(() => {
    if (screen === 'home') return;
    const target = screen === 'quiz' ? headingRef.current : document.getElementById('quiz-result-title');
    if (target) target.focus({ preventScroll: false });
  }, [screen, step]);

  const begin = useCallback((id, from = null) => {
    setCategoryId(id);
    setAnswers(from?.answers || {});
    setStep(from?.step || 0);
    setMode(from?.mode || mode);
    setError('');
    setScore(null);
    setSaveState({ status: 'idle' });
    savingRef.current = false;
    if (!from) clearDraft(username);
    setDraft(null);
    setScreen('quiz');
  }, [mode, username]);

  const goHome = () => {
    setDraft(readDraft(username));
    setScreen('home');
    window.scrollTo?.(0, 0);
  };

  const discardDraft = () => {
    clearDraft(username);
    setDraft(null);
  };

  const answer = (value) => {
    setAnswers((prev) => pruneAnswers(category, { ...prev, [current.id]: value }));
    setError('');
  };

  const finish = (finalAnswers) => {
    setScore(scoreQuiz(category, finalAnswers));
    clearDraft(username);
    setScreen('result');
  };

  const next = (event) => {
    event.preventDefault();
    const problem = validateAnswer(current, answers[current.id]);
    if (problem) {
      setError(problem);
      return;
    }
    if (isLast) finish(answers);
    else setStep((s) => s + 1);
  };

  const previous = () => {
    setError('');
    setStep((s) => Math.max(0, s - 1));
  };

  const save = async () => {
    if (savingRef.current || saveState.status === 'saved' || !score) return;
    savingRef.current = true;
    setSaveState({ status: 'saving' });
    try {
      const response = await axios.post(resultsUrl(username), toSavePayload(category.id, score));
      const saved = response.data?.result;
      if (saved) {
        setHistory((prev) => [saved, ...(Array.isArray(prev) ? prev.filter((r) => !(r.category === saved.category && r.day === saved.day)) : [])]);
      }
      setSaveState({ status: 'saved', replaced: Boolean(response.data?.replaced) });
    } catch (err) {
      savingRef.current = false;
      setSaveState({ status: 'error', message: saveErrorMessage(err) });
    }
  };

  const deleteResult = async (id) => {
    await axios.delete(`${resultsUrl(username)}/${encodeURIComponent(id)}`);
    setHistory((prev) => (Array.isArray(prev) ? prev.filter((r) => r._id !== id) : prev));
  };

  const clearHistory = async () => {
    await axios.delete(resultsUrl(username));
    setHistory([]);
  };

  const featured = CATEGORIES.filter((c) => c.featured);
  const others = CATEGORIES.filter((c) => !c.featured);

  let content;
  if (screen === 'quiz' && category && current) {
    const progress = Math.round((step / questions.length) * 100);
    const headingId = `quiz-question-${current.id}`;
    const answered = answers[current.id] !== undefined && !(Array.isArray(answers[current.id]) && answers[current.id].length === 0);
    content = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="wb-btn wb-btn-secondary" onClick={goHome}>
            <FaArrowLeft aria-hidden="true" /> {category.privateOnly ? 'Leave quiz' : 'Save & exit'}
          </button>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        <div className="wb-glass flex items-center gap-4 rounded-wb-lg p-4">
          <ScoreRing value={progress} size={64} stroke={7} label={`${progress}% complete`}>
            <span className="text-sm font-semibold text-wb-text">{progress}%</span>
          </ScoreRing>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-wb-text">{category.title}</p>
            <p className="text-sm text-wb-muted" aria-live="polite">Question {step + 1} of {questions.length}</p>
            <div className="wb-progress mt-2" aria-hidden="true">
              <div className="wb-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            {category.questions.some((q) => q.showIf) && (
              <p className="mt-1 text-xs text-wb-muted">Follow-up questions may appear based on your answers.</p>
            )}
          </div>
        </div>

        {mode === 'chat' && (
          <div className="wb-card">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-wb-muted">Guided conversation · scripted replies, not AI</p>
            <ConversationTranscript category={category} entries={questions.slice(0, step).map((q) => ({ question: q, value: answers[q.id] }))} />
          </div>
        )}

        <form className="wb-card" onSubmit={next} noValidate key={current.id}>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="wb-h3 focus:outline-none">{current.text}</h2>
          {current.help && <p className="wb-help">{current.help}</p>}
          <div className="mt-5">
            <AnswerInput question={current} value={answers[current.id]} onChange={answer} headingId={headingId} />
          </div>
          {error && <p className="wb-error" role="alert">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="wb-btn wb-btn-secondary" onClick={previous} disabled={step === 0}>
              <FaArrowLeft aria-hidden="true" /> Previous
            </button>
            <button type="submit" className="wb-btn wb-btn-primary">
              {isLast ? 'See my results' : !answered && !isRequired(current) ? 'Skip' : 'Next'}
              <FaArrowRight aria-hidden="true" />
            </button>
          </div>
        </form>
        <p className="wb-help">{DISCLAIMER}</p>
      </div>
    );
  } else if (screen === 'result' && category) {
    content = (
      <QuizResult
        username={username}
        category={category}
        answers={answers}
        score={score}
        history={Array.isArray(history) ? history : []}
        saveState={saveState}
        onSave={save}
        onRestart={() => begin(category.id)}
        onHome={goHome}
      />
    );
  } else {
    const draftCategory = draft && getCategory(draft.categoryId);
    content = (
      <div className="space-y-8">
        <section className="wb-hero-bg relative overflow-hidden rounded-wb-lg border border-wb-border p-6 shadow-wb sm:p-10">
          <span className="wb-float-shape wb-float-shape-blue -right-10 -top-10 h-40 w-40" aria-hidden="true" />
          <span className="wb-float-shape wb-float-shape-green -bottom-12 right-24 h-32 w-32" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-wb-primary">Wellbeing quizzes</p>
            <h1 className="wb-h1 mt-2">How are you, really?</h1>
            <p className="mt-3 text-lg text-wb-muted">
              Short, interactive check-ins on mood, stress, sleep, connection and focus, with personal insights and next steps.
            </p>
            <p className="wb-help mt-4">{DISCLAIMER}</p>
          </div>
        </section>

        {draftCategory && (
          <section className="wb-surface-soft flex flex-wrap items-center justify-between gap-3 p-4" aria-label="Unfinished quiz">
            <p className="text-wb-text">You have an unfinished <strong>{draftCategory.title}</strong> quiz.</p>
            <div className="flex gap-2">
              <button type="button" className="wb-btn wb-btn-primary" onClick={() => begin(draft.categoryId, draft)}>Resume</button>
              <button type="button" className="wb-btn wb-btn-secondary" onClick={discardDraft}>Discard</button>
            </div>
          </section>
        )}

        <section aria-labelledby="quiz-choose-title" className="space-y-4">
          <h2 id="quiz-choose-title" className="wb-h2">Choose a quiz</h2>
          {featured.map((c) => <CategoryCard key={c.id} category={c} onStart={(id) => begin(id)} featured />)}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((c) => <CategoryCard key={c.id} category={c} onStart={(id) => begin(id)} />)}
          </div>
        </section>

        <QuizHistory history={history} onRetry={() => setHistoryAttempt((n) => n + 1)} onDelete={deleteResult} onClear={clearHistory} />
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="wb-page">
        <div className="wb-container max-w-4xl">{content}</div>
      </main>
    </>
  );
};

export default Quiz;
