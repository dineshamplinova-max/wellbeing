// Offline tests for the wellbeing quiz: the pure quiz engine and the Quiz page.
// All axios traffic goes to a mock adapter, so no request leaves the test
// process. Only synthetic data is used.
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Quiz from './compnents/quiz/Quiz';
import { CATEGORIES, getCategory, SCORED_CATEGORY_IDS } from './compnents/quiz/quizData';
import {
  acknowledgement, compareWithPrevious, insights, longestDailyStreak, milestones, needsSupportNotice,
  pruneAnswers, recommendations, scoreQuiz, toSavePayload, validateAnswer, visibleQuestions, wellbeingValue,
} from './compnents/quiz/quizEngine';
import { EXERCISES } from './compnents/meditation/exerciseData';

jest.mock('react-chartjs-2', () => {
  const mockReact = require('react');
  return { Line: (props) => mockReact.createElement('div', { 'data-testid': 'trend-chart', 'data-points': props.data.datasets[0].data.join(',') }) };
});
jest.mock('chart.js', () => ({
  Chart: { register: () => {} }, LineElement: {}, PointElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {}, Filler: {},
}));

// Mirrors QUIZ_AREAS in backend/controller/quiz-controller.js. If this test
// fails, the frontend would send scores the API rejects.
const BACKEND_QUIZ_AREAS = {
  daily: ['mood', 'energy', 'calm', 'rest'],
  stress: ['calm', 'coping', 'body'],
  sleep: ['rest', 'routine'],
  connection: ['connection', 'support'],
  focus: ['focus', 'balance'],
};

const RESULTS_URL = 'http://localhost:8000/api/quiz/testuser/results';
const originalAdapter = axios.defaults.adapter;
let sentRequests;
let historyData;
let historyFails;
let postResponder;

const reply = (config, data, status = 200) => {
  const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.response = response;
    throw error;
  }
  return response;
};

const mockAdapter = async (config) => {
  sentRequests.push(config);
  const { method, url } = config;
  if (method === 'get' && url === RESULTS_URL) {
    if (historyFails) return reply(config, { message: 'fail' }, 500);
    return reply(config, historyData);
  }
  if (method === 'post' && url === RESULTS_URL) return postResponder(config);
  if (method === 'delete' && url.startsWith(RESULTS_URL)) return reply(config, { message: 'ok' });
  if (method === 'get' && url.includes('/api/auth/me')) return reply(config, { user: { username: 'testuser' } });
  throw new Error(`Unexpected request in offline test: ${method} ${url}`);
};

const savedResult = (category, day, overall, scores) => ({
  _id: `${category}-${day}`, category, day, overall,
  scores: Object.entries(scores).map(([area, score]) => ({ area, score })),
  createdAt: `${day}T08:00:00.000Z`, updatedAt: `${day}T08:00:00.000Z`,
});

beforeEach(() => {
  sentRequests = [];
  historyData = [];
  historyFails = false;
  postResponder = (config) => {
    const body = JSON.parse(config.data);
    const scores = Object.entries(body.scores).map(([area, score]) => ({ area, score }));
    const overall = Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length);
    return reply(config, { result: { _id: 'new-1', category: body.category, day: '2026-10-31', overall, scores, createdAt: '2026-10-31T09:00:00.000Z' }, replaced: false }, 201);
  };
  axios.defaults.adapter = mockAdapter;
  window.sessionStorage.clear();
  window.localStorage.setItem('tokenUser', 'testuser');
  window.scrollTo = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  window.localStorage.removeItem('tokenUser');
  jest.restoreAllMocks();
});

const renderQuiz = () => render(
  <MemoryRouter initialEntries={['/testuser/quiz']}>
    <Routes>
      <Route path="/:username/quiz" element={<Quiz />} />
      <Route path="*" element={<div>other page</div>} />
    </Routes>
  </MemoryRouter>
);

const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|Skip|See my results)/ }));
const choose = (label) => fireEvent.click(screen.getByLabelText(label));
// change() alone does not fire when the value equals the slider's midpoint; a
// mouse-up records it, as a click on the thumb does in a browser.
const slide = (id, value) => {
  const slider = screen.getByTestId(`slider-${id}`);
  fireEvent.change(slider, { target: { value: String(value) } });
  fireEvent.mouseUp(slider);
};
const heading = () => screen.getByRole('heading', { level: 2 });
const posts = () => sentRequests.filter((r) => r.method === 'post');

const startQuiz = async (title) => {
  renderQuiz();
  await screen.findByText(/No saved results yet|Saved results/);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }));
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
describe('quiz engine', () => {
  test('scored categories report exactly the areas the API accepts', () => {
    expect(SCORED_CATEGORY_IDS.sort()).toEqual(Object.keys(BACKEND_QUIZ_AREAS).sort());
    for (const category of CATEGORIES.filter((c) => c.scored)) {
      const areas = [...new Set(category.questions.filter((q) => q.area).map((q) => q.area))].sort();
      expect(areas).toEqual([...BACKEND_QUIZ_AREAS[category.id]].sort());
    }
  });

  test('every question is well formed and question ids are unique', () => {
    const ids = CATEGORIES.flatMap((c) => c.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of CATEGORIES) {
      for (const q of category.questions) {
        expect(['scale', 'slider', 'choice', 'multi']).toContain(q.type);
        if (q.showIf) expect(category.questions.some((p) => p.id === q.showIf.id)).toBe(true);
        if (q.type === 'multi') expect(q.maxSelections).toBeGreaterThan(0);
      }
    }
  });

  test('the original 15 reflection questions and options are preserved and never scored', () => {
    const reflection = getCategory('reflection');
    expect(reflection.questions).toHaveLength(15);
    expect(reflection.questions[0].text).toBe('How often have you felt down, depressed, or hopeless in the past two weeks?');
    expect(reflection.questions[0].options).toEqual(['Not at all', 'Several days', 'More than half the days', 'Nearly every day']);
    expect(reflection.scored).toBe(false);
    expect(reflection.privateOnly).toBe(true);
    expect(scoreQuiz(reflection, { r_1: 3 })).toBeNull();
    expect(acknowledgement(reflection, reflection.questions[0], 3)).toBe('Thank you.');
  });

  test('wellbeing values handle reversed questions and sliders', () => {
    const stress = getCategory('stress');
    const overwhelmed = stress.questions.find((q) => q.id === 's_overwhelmed');
    expect(wellbeingValue(overwhelmed, 4)).toBe(0); // "Always" overwhelmed
    expect(wellbeingValue(overwhelmed, 0)).toBe(4);
    const todo = stress.questions.find((q) => q.id === 's_todo');
    expect(wellbeingValue(todo, 5)).toBe(2);
    expect(wellbeingValue(todo, undefined)).toBeNull();
  });

  test('follow-up questions appear only when their condition is met and are pruned otherwise', () => {
    const stress = getCategory('stress');
    expect(visibleQuestions(stress, {}).map((q) => q.id)).not.toContain('s_sources');
    expect(visibleQuestions(stress, { s_overwhelmed: 3 }).map((q) => q.id)).toContain('s_sources');
    expect(visibleQuestions(stress, { s_overwhelmed: 1 }).map((q) => q.id)).not.toContain('s_sources');
    expect(pruneAnswers(stress, { s_overwhelmed: 1, s_sources: ['work'] })).toEqual({ s_overwhelmed: 1 });
  });

  test('answer validation covers required, optional, range and selection limits', () => {
    const daily = getCategory('daily');
    const mood = daily.questions.find((q) => q.id === 'd_mood');
    const need = daily.questions.find((q) => q.id === 'd_need');
    const sources = getCategory('stress').questions.find((q) => q.id === 's_sources');
    expect(validateAnswer(mood, undefined)).toMatch(/choose an answer/);
    expect(validateAnswer(mood, 11)).toMatch(/slider/);
    expect(validateAnswer(mood, 7)).toBe('');
    expect(validateAnswer(need, undefined)).toBe('');
    expect(validateAnswer(need, 'nonsense')).toMatch(/options/);
    expect(validateAnswer(sources, [])).toMatch(/choose an answer/);
    expect(validateAnswer(sources, ['work', 'money', 'health', 'online'])).toMatch(/up to 3/);
    expect(validateAnswer(sources, ['work'])).toBe('');
  });

  test('scores are 0-100 per area with an overall score and band', () => {
    const daily = getCategory('daily');
    const score = scoreQuiz(daily, { d_mood: 10, d_energy: 4, d_stress: 0, d_sleep: 2 });
    expect(score.areas.map((a) => [a.area, a.score])).toEqual([['mood', 100], ['energy', 100], ['calm', 100], ['rest', 50]]);
    expect(score.overall).toBe(88);
    expect(score.band.label).toBe('Going well');
    expect(toSavePayload('daily', score)).toEqual({ category: 'daily', scores: { mood: 100, energy: 100, calm: 100, rest: 50 } });
    expect(scoreQuiz(daily, { d_mood: 0, d_energy: 0, d_stress: 4, d_sleep: 0 }).band.label).toBe('Could use extra care');
  });

  test('suggestions point to real exercises and existing pages, starting with the stated need', () => {
    const daily = getCategory('daily');
    const answers = { d_mood: 6, d_energy: 2, d_stress: 3, d_sleep: 2, d_need: 'write' };
    const list = recommendations(daily, answers, scoreQuiz(daily, answers));
    expect(list[0].kind).toBe('journal');
    expect(list.length).toBeLessThanOrEqual(4);
    const exerciseNames = EXERCISES.map((e) => e.name);
    for (const s of list) {
      expect(['meditation', 'createjournal', 'mood', 'anonymoussharing', 'support']).toContain(s.route);
      if (s.kind === 'exercise') expect(exerciseNames).toContain(s.title);
    }
  });

  test('insights are descriptive, mention follow-ups and compare with the previous result', () => {
    const stress = getCategory('stress');
    const answers = { s_overwhelmed: 4, s_relax: 0, s_handle: 3, s_todo: 8, s_tension: 1, s_sources: ['work', 'money'] };
    const score = scoreQuiz(stress, answers);
    const previous = savedResult('stress', '2026-10-01', score.overall - 20, { calm: 10, coping: 50, body: 50 });
    const comparison = compareWithPrevious(score, previous);
    expect(comparison.overallChange).toBe(20);
    const text = insights(stress, answers, score, comparison).join(' ');
    expect(text).toMatch(/work or study, money/);
    expect(text).toMatch(/20 points higher/);
    expect(text).not.toMatch(/diagnos|disorder|depress|anxiety/i);
  });

  test('the support notice appears for low scores or a very low mood', () => {
    const daily = getCategory('daily');
    const low = { d_mood: 1, d_energy: 3, d_stress: 1, d_sleep: 3 };
    expect(needsSupportNotice(daily, low, scoreQuiz(daily, low))).toBe(true);
    const fine = { d_mood: 7, d_energy: 3, d_stress: 1, d_sleep: 3 };
    expect(needsSupportNotice(daily, fine, scoreQuiz(daily, fine))).toBe(false);
  });

  test('streaks and milestones are derived from saved results', () => {
    const history = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'].map((d, i) => savedResult('daily', d, 50 + i * 5, { mood: 50, energy: 50, calm: 50, rest: 50 }));
    expect(longestDailyStreak(history)).toBe(3);
    const byId = Object.fromEntries(milestones(history).map((m) => [m.id, m]));
    expect(byId.first.earned).toBe(true);
    expect(byId.streak.earned).toBe(true);
    expect(byId.regular.earned).toBe(false);
    expect(byId.regular.progress).toBe('4/5');
    expect(byId.explorer.progress).toBe('1/5');
    expect(milestones([]).every((m) => !m.earned)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quiz page
// ---------------------------------------------------------------------------
describe('Quiz page', () => {
  test('shows every category, the disclaimer and an empty history state', async () => {
    renderQuiz();
    for (const category of CATEGORIES) expect(screen.getByRole('button', { name: new RegExp(category.title) })).toBeTruthy();
    expect(screen.getAllByText(/not a medical or psychological assessment/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toMatch(/Loading your history/);
    expect(await screen.findByText(/No saved results yet/)).toBeTruthy();
  });

  test('daily check-in: validation, previous/next, progress, result and saving only scores', async () => {
    await startQuiz('Quick daily check-in');
    expect(heading().textContent).toBe('Overall, how is your mood today?');
    expect(screen.getByText('Question 1 of 5')).toBeTruthy();

    next();
    expect(screen.getByRole('alert').textContent).toMatch(/Please choose an answer/);
    slide('d_mood', 8);
    expect(screen.queryByRole('alert')).toBeNull();
    next();

    expect(heading().textContent).toBe('How much energy do you have today?');
    choose('Quite a lot');
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(screen.getByTestId('slider-d_mood').value).toBe('8');
    next();
    expect(screen.getByLabelText('Quite a lot').checked).toBe(true);
    next();
    choose('A little');
    next();
    choose('Well');
    next();

    expect(heading().textContent).toBe('What would help you most today?');
    expect(screen.getByRole('button', { name: /See my results/ })).toBeTruthy();
    next(); // optional question may be skipped

    expect(await screen.findByText('Your wellbeing snapshot')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Overall 76 out of 100: Going well/ })).toBeTruthy();
    expect(screen.getByText(/not generated by AI/)).toBeTruthy();
    expect(screen.getAllByRole('meter')).toHaveLength(4);

    const saveButton = screen.getByRole('button', { name: /Save to my history/ });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(await screen.findByText('Saved to your history.')).toBeTruthy();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0].data)).toEqual({ category: 'daily', scores: { mood: 80, energy: 75, calm: 75, rest: 75 } });
    expect(window.sessionStorage.length).toBe(0);
  });

  test('adaptive follow-up appears for a high-stress answer and multi-select enforces its limit', async () => {
    await startQuiz('Stress & calm');
    choose('Often'); // overwhelmed often -> follow-up added
    expect(screen.getByText('Question 1 of 6')).toBeTruthy();
    next();
    choose('Rarely'); next();
    choose('Agree'); next();
    slide('s_todo', 6); next();
    choose('Rarely'); next(); // tension rarely -> no optional follow-up

    expect(heading().textContent).toBe('What has been adding to your stress?');
    next();
    expect(screen.getByRole('alert').textContent).toMatch(/choose an answer/);
    ['Work or study', 'Money', 'Health'].forEach(choose);
    expect(screen.getByLabelText('Relationships').disabled).toBe(true);
    expect(screen.getByText('3 of 3 selected')).toBeTruthy();
    next();

    expect(await screen.findByText(/work or study, money, health adding to your stress/)).toBeTruthy();
  });

  test('the two-week reflection is not scored, saved, sent or stored as a draft', async () => {
    await startQuiz('Two-week reflection');
    for (let i = 0; i < 15; i += 1) {
      choose('Several days');
      next();
    }
    expect(await screen.findByText('About this questionnaire')).toBeTruthy();
    expect(screen.getByText(/Your answers were not sent anywhere or saved/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save to my history/ })).toBeNull();
    expect(posts()).toHaveLength(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  test('an unfinished quiz survives a page reload and can be resumed or discarded', async () => {
    const first = renderQuiz();
    await screen.findByText(/No saved results yet/);
    fireEvent.click(screen.getByRole('button', { name: /Sleep & rest/ }));
    choose('Good');
    next();
    choose('Often');
    first.unmount();

    renderQuiz();
    await screen.findByText(/No saved results yet/);
    expect(screen.getByText(/You have an unfinished/).textContent).toMatch(/Sleep & rest/);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(heading().textContent).toBe('How often do you wake up feeling rested?');
    expect(screen.getByLabelText('Often').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Save & exit/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText(/You have an unfinished/)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  test('guided conversation shows earlier answers with scripted, clearly labelled replies', async () => {
    await startQuiz('Quick daily check-in');
    fireEvent.click(screen.getByLabelText(/Guided conversation/));
    expect(screen.getByText(/scripted replies, not AI/)).toBeTruthy();
    slide('d_mood', 9);
    next();
    const transcript = screen.getByRole('list', { name: 'Conversation so far' });
    expect(within(transcript).getByText('Overall, how is your mood today?')).toBeTruthy();
    expect(within(transcript).getByText('9 out of 10')).toBeTruthy();
    expect(within(transcript).getByText("That's good to hear.")).toBeTruthy();
  });

  test('a failed save shows the server message and can be retried', async () => {
    let calls = 0;
    postResponder = (config) => {
      calls += 1;
      if (calls === 1) return reply(config, { message: 'Quiz scores do not match this quiz.' }, 400);
      return reply(config, { result: { _id: 'x', category: 'daily', day: '2026-10-31', overall: 50, scores: [] }, replaced: true });
    };
    await startQuiz('Quick daily check-in');
    slide('d_mood', 5); next();
    choose('Some'); next();
    choose('Moderately'); next();
    choose('Okay'); next();
    next();
    fireEvent.click(await screen.findByRole('button', { name: /Save to my history/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('Quiz scores do not match this quiz.');
    fireEvent.click(screen.getByRole('button', { name: /Save to my history/ }));
    expect(await screen.findByText(/earlier result was replaced/)).toBeTruthy();
  });

  test('history shows the trend, comparison and milestones, and supports delete with confirmation', async () => {
    historyData = [
      savedResult('daily', '2026-10-01', 40, { mood: 40, energy: 40, calm: 40, rest: 40 }),
      savedResult('daily', '2026-10-02', 60, { mood: 60, energy: 60, calm: 60, rest: 60 }),
    ];
    renderQuiz();
    expect((await screen.findByTestId('trend-chart')).getAttribute('data-points')).toBe('40,60');
    expect(screen.getByText(/Milestones/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Quick daily check-in result from 2026-10-01' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(screen.queryByText(/2026-10-01/)).toBeNull());
    const del = sentRequests.find((r) => r.method === 'delete');
    expect(del.url).toBe(`${RESULTS_URL}/daily-2026-10-01`);

    fireEvent.click(screen.getByRole('button', { name: /^Quick daily check-in/ }));
    slide('d_mood', 10); next();
    choose('Plenty'); next();
    choose('Not at all'); next();
    choose('Very well'); next();
    next();
    expect(await screen.findByText(/Compared with your last saved result \(2026-10-02\)/)).toBeTruthy();
    expect(screen.getByText(/40 points higher than your last saved result/)).toBeTruthy();
  });

  test('a history loading error offers a retry', async () => {
    historyFails = true;
    renderQuiz();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/);
    historyFails = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(await screen.findByText(/No saved results yet/)).toBeTruthy();
  });

  test('answer options are real, keyboard-focusable inputs', async () => {
    await startQuiz('Focus & balance');
    const radios = screen.getAllByRole('radio', { name: /Never|Rarely|Sometimes|Often|Always/ });
    expect(radios).toHaveLength(5);
    radios[2].focus();
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2].className).not.toMatch(/\bhidden\b/);
  });
});
