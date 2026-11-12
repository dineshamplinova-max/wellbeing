// Offline tests for the wellbeing dashboard page and its Navbar link.
// All axios traffic goes to a mock adapter, so no request leaves the test
// process. Only synthetic data is used; the clock is fixed to 31 March 2026.
import '@testing-library/jest-dom';
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Dashboard, { pickMoodFields, pickSessionFields, pickJournalFields } from './compnents/dashboard/Dashboard.jsx';
import Navbar from './compnents/navbar/Navbar';
import { buildDashboardCalls, summarizeActivity } from './compnents/dashboard/dashboardStats';

// jsdom has no canvas: each chart becomes a labelled element that exposes the
// labels, values and animation setting it was given.
jest.mock('react-chartjs-2', () => {
  const mockReact = require('react');
  const mockChart = (kind) => (props) => mockReact.createElement('div', {
    role: 'img',
    'aria-label': props['aria-label'],
    'data-kind': kind,
    'data-chart': JSON.stringify({
      labels: props.data.labels,
      values: props.data.datasets[0].data,
      animation: props.options.animation,
    }),
  });
  return { Line: mockChart('line'), Bar: mockChart('bar') };
});
jest.mock('chart.js', () => ({
  Chart: { register: () => {} },
  LineElement: {}, PointElement: {}, BarElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {}, Filler: {},
}));
// Records what the page passes to buildDashboard, to check that only the
// filtered fields (never private text) are held in its state.
jest.mock('./compnents/dashboard/dashboardStats', () => {
  const actual = jest.requireActual('./compnents/dashboard/dashboardStats');
  const calls = [];
  return {
    ...actual,
    buildDashboardCalls: calls,
    buildDashboard: (...args) => {
      calls.push(args);
      return actual.buildDashboard(...args);
    },
  };
});

const API = 'http://localhost:8000';
const URLS = {
  moods: `${API}/api/moods/testuser`,
  sessions: `${API}/api/meditation/sessions/testuser`,
  journals: `${API}/testuser/journals`,
};

const syntheticMoods = [
  { _id: 'm1', day: '2026-03-31', date: '2026-03-31T05:00:00Z', mood: '😊', rating: 4, note: 'Synthetic private mood note' },
  { _id: 'm2', day: '2026-03-30', date: '2026-03-30T05:00:00Z', mood: '😐', rating: 3 },
  { _id: 'm3', day: '2026-03-29', date: '2026-03-29T05:00:00Z', mood: '😄', rating: 5 },
  { _id: 'm4', day: '2026-03-20', date: '2026-03-20T05:00:00Z', mood: '😔', rating: 2 },
  { _id: 'm5', day: '2026-01-15', date: '2026-01-15T05:00:00Z', mood: '😊', rating: 4 },
];
const syntheticSessions = [
  { _id: 's1', duration: 10, type: 'zen', notes: 'Synthetic private meditation note', date: '2026-03-31T06:00:00Z' },
  { _id: 's2', duration: 5, type: 'zen', date: '2026-03-25T06:00:00Z' },
  { _id: 's3', duration: 20, type: 'zen', date: '2026-03-05T06:00:00Z' },
  { _id: 's4', duration: 15, type: 'zen', date: '2026-02-10T06:00:00Z' },
];
const syntheticJournals = [
  { _id: 'j1', title: 'Synthetic private title', article: 'Synthetic private journal text', tags: ['synthetic-tag'], isPrivate: true, createdAt: '2026-03-31T05:00:00Z' },
  { _id: 'j2', title: 'Synthetic second title', article: 'More synthetic text', createdAt: '2026-03-28T05:00:00Z' },
  { _id: 'j3', title: 'Synthetic older title', article: 'Older synthetic text', createdAt: '2026-02-20T05:00:00Z' },
];

const originalAdapter = axios.defaults.adapter;
let requests;
let responders;

const ok = (data) => (config) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
const fail = (status) => (config) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data: {}, headers: {}, config };
  throw error;
};

beforeEach(() => {
  buildDashboardCalls.length = 0;
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-03-31T08:00:00Z'));
  requests = [];
  responders = {
    [URLS.moods]: ok(syntheticMoods),
    [URLS.sessions]: ok(syntheticSessions),
    [URLS.journals]: ok(syntheticJournals),
  };
  axios.defaults.adapter = async (config) => {
    requests.push(`${config.method} ${config.url}`);
    const responder = config.method === 'get' && responders[config.url];
    if (!responder) throw new Error(`Unexpected request in offline test: ${config.method} ${config.url}`);
    return responder(config);
  };
  localStorage.setItem('tokenUser', 'testuser');
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  localStorage.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const renderDashboard = () => render(
  <MemoryRouter initialEntries={['/testuser/dashboard']}>
    <Routes>
      <Route path="/:username/dashboard" element={<Dashboard />} />
    </Routes>
  </MemoryRouter>
);

const tile = (title) => screen.getAllByTestId('stat-tile').find((t) => within(t).queryByRole('heading', { name: title }));
const waitForLoaded = () => waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Showing the last/));

describe('field picking', () => {
  test('only the fields the dashboard needs are kept; private text is dropped', () => {
    expect(pickJournalFields(syntheticJournals)).toEqual([
      { _id: 'j1', createdAt: '2026-03-31T05:00:00Z' },
      { _id: 'j2', createdAt: '2026-03-28T05:00:00Z' },
      { _id: 'j3', createdAt: '2026-02-20T05:00:00Z' },
    ]);
    expect(Object.keys(pickMoodFields(syntheticMoods)[0]).sort()).toEqual(['date', 'day', 'energy', 'mood', 'rating', 'sleepHours']);
    expect(pickSessionFields(syntheticSessions)[0]).toEqual({ date: '2026-03-31T06:00:00Z', duration: 10 });
    const kept = JSON.stringify([pickMoodFields(syntheticMoods), pickSessionFields(syntheticSessions), pickJournalFields(syntheticJournals)]);
    expect(kept).not.toMatch(/Synthetic|article|title|note|tags/i);
    expect(pickJournalFields(null)).toEqual([]);
    expect(pickJournalFields([null, 'x'])).toEqual([]);
  });
});

describe('Dashboard page', () => {
  test('loads the three existing histories once and shows 30 days by default', async () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1, name: 'Your wellbeing progress' })).toBeInTheDocument();
    await waitForLoaded();

    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false');
    expect(tile('Mood check-ins')).toHaveTextContent('4on 4 of 30 days');
    expect(tile('Average mood')).toHaveTextContent('3.5 / 5from 4 rated check-ins');
    expect(tile('Meditation minutes')).toHaveTextContent('35from 3 saved sessions');
    expect(tile('Journal entries')).toHaveTextContent('2written on 2 days');
    expect(requests.sort()).toEqual([`get ${URLS.journals}`, `get ${URLS.moods}`, `get ${URLS.sessions}`].sort());
  });

  test('switching period recalculates without new requests', async () => {
    renderDashboard();
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(tile('Mood check-ins')).toHaveTextContent('3on 3 of 7 days');
    expect(tile('Average mood')).toHaveTextContent('4 / 5from 3 rated check-ins');
    expect(tile('Meditation minutes')).toHaveTextContent('15from 2 saved sessions');
    expect(tile('Journal entries')).toHaveTextContent('2written on 2 days');

    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(tile('Mood check-ins')).toHaveTextContent('5on 5 of 90 days');
    expect(tile('Average mood')).toHaveTextContent('3.6 / 5');
    expect(tile('Meditation minutes')).toHaveTextContent('50from 4 saved sessions');
    expect(tile('Journal entries')).toHaveTextContent('3written on 3 days');

    expect(requests).toHaveLength(3);
  });

  test('never shows private journal, mood or meditation text', async () => {
    renderDashboard();
    await waitForLoaded();
    expect(document.body).not.toHaveTextContent(/Synthetic/);
    expect(document.body).not.toHaveTextContent(/synthetic-tag/);
  });

  test('shows loading in a tile until its own history arrives', async () => {
    let finishJournals;
    responders[URLS.journals] = (config) => new Promise((resolve) => { finishJournals = () => resolve(ok(syntheticJournals)(config)); });
    renderDashboard();

    await waitFor(() => expect(tile('Meditation minutes')).toHaveTextContent('35'));
    expect(tile('Mood check-ins')).toHaveTextContent('4');
    expect(tile('Journal entries')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status')).toHaveTextContent('Loading your activity…');

    finishJournals();
    await waitFor(() => expect(tile('Journal entries')).toHaveTextContent('2written on 2 days'));
  });

  test('one failed history does not stop the others, and Try again reloads it', async () => {
    responders[URLS.sessions] = fail(500);
    renderDashboard();
    await waitForLoaded();

    expect(tile('Meditation minutes')).toHaveTextContent('This could not be loaded.');
    expect(tile('Mood check-ins')).toHaveTextContent('4on 4 of 30 days');
    expect(tile('Journal entries')).toHaveTextContent('2written on 2 days');
    expect(screen.getByRole('alert')).toHaveTextContent('Some of your activity could not be loaded.');
    // A failed source is not mistaken for "no activity".
    expect(screen.queryByRole('heading', { name: /Nothing recorded/ })).toBeNull();

    responders[URLS.sessions] = ok(syntheticSessions);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(tile('Meditation minutes')).toHaveTextContent('35from 3 saved sessions'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('with no activity in the period, shows a friendly empty state with links', async () => {
    responders[URLS.moods] = ok([]);
    responders[URLS.sessions] = ok([]);
    responders[URLS.journals] = ok([]);
    renderDashboard();
    await waitForLoaded();

    expect(screen.getByRole('heading', { name: 'Nothing recorded in the last 30 days' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check in on your mood' })).toHaveAttribute('href', '/testuser/mood');
    expect(screen.getByRole('link', { name: 'Try a meditation' })).toHaveAttribute('href', '/testuser/meditation');
    expect(screen.getByRole('link', { name: 'Write in your journal' })).toHaveAttribute('href', '/testuser/createjournal');
    expect(tile('Mood check-ins')).toHaveTextContent('0on 0 of 30 days');
    expect(tile('Average mood')).toHaveTextContent('Not enough check-ins yet');
  });

  test('shows counts and averages only: no scores, predictions or diagnoses', async () => {
    renderDashboard();
    await waitForLoaded();
    expect(screen.getByRole('main')).not.toHaveTextContent(/score|risk|predict|diagnos|depress|anxi/i);
  });
});

describe('Detailed sections', () => {
  const region = (name) => screen.getByRole('region', { name });
  const chartIn = (name) => within(region(name)).getByRole('img');
  const chartData = (name) => JSON.parse(chartIn(name).getAttribute('data-chart'));
  const valueAt = (data, label) => data.values[data.labels.indexOf(label)];
  const tableRows = (name) => within(region(name)).getAllByRole('row').slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
  // The statistic block in a section whose label (<dt>) is exactly `label`.
  const stat = (name, label) => within(region(name)).getAllByTestId('section-stat')
    .find((el) => within(el).queryByText(label, { selector: 'dt' }));

  test('mood: a daily line chart for 30 days, a matching table, and descriptive statistics', async () => {
    renderDashboard();
    await waitForLoaded();

    const data = chartData('Mood');
    expect(chartIn('Mood')).toHaveAttribute('data-kind', 'line');
    expect(data.labels).toHaveLength(30);
    expect(data.labels[0]).toBe('2 Mar');
    expect(data.labels[29]).toBe('31 Mar');
    expect(valueAt(data, '31 Mar')).toBe(4);
    expect(valueAt(data, '20 Mar')).toBe(2);
    expect(valueAt(data, '21 Mar')).toBeNull();
    expect(tableRows('Mood')).toEqual([['20 Mar', '2'], ['29 Mar', '5'], ['30 Mar', '3'], ['31 Mar', '4']]);

    expect(stat('Mood', 'Average mood')).toHaveTextContent('Average mood3.5 / 5');
    expect(stat('Mood', 'Days checked in')).toHaveTextContent('Days checked in4 of 30');
    expect(stat('Mood', 'Check-ins')).toHaveTextContent('Check-ins4');
    const counts = within(within(region('Mood')).getByRole('list', { name: 'Rating counts' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(counts).toEqual(['Very good1', 'Good1', 'Okay1', 'Low1', 'Very low0']);
  });

  test('meditation: minutes per day, saved-session statistics and a clear note about what minutes mean', async () => {
    renderDashboard();
    await waitForLoaded();

    const data = chartData('Meditation');
    expect(chartIn('Meditation')).toHaveAttribute('data-kind', 'bar');
    expect(valueAt(data, '31 Mar')).toBe(10);
    expect(valueAt(data, '25 Mar')).toBe(5);
    expect(valueAt(data, '5 Mar')).toBe(20);
    expect(tableRows('Meditation')).toEqual([['5 Mar', '20'], ['25 Mar', '5'], ['31 Mar', '10']]);

    expect(stat('Meditation', 'Saved sessions')).toHaveTextContent('Saved sessions3');
    expect(stat('Meditation', 'Minutes')).toHaveTextContent('Minutes35');
    expect(stat('Meditation', 'Days with a session')).toHaveTextContent('Days with a session3 of 30');
    expect(stat('Meditation', 'Days in a row')).toHaveTextContent('Days in a row1Longest: 1 day');
    expect(region('Meditation')).toHaveTextContent('Minutes are the durations you chose when saving, not measured separately.');
  });

  test('journal: entries per day and counts only, with no titles, text or tags', async () => {
    renderDashboard();
    await waitForLoaded();

    const data = chartData('Journal writing');
    expect(valueAt(data, '31 Mar')).toBe(1);
    expect(valueAt(data, '28 Mar')).toBe(1);
    expect(data.values.reduce((a, b) => a + b, 0)).toBe(2);
    expect(stat('Journal writing', 'Entries')).toHaveTextContent('Entries2');
    expect(stat('Journal writing', 'Days written')).toHaveTextContent('Days written2 of 30');
    expect(stat('Journal writing', 'All entries')).toHaveTextContent('All entries3Since you started');
    expect(region('Journal writing')).not.toHaveTextContent(/Synthetic|synthetic-tag|title/);
  });

  test('activity: a Monday-first calendar marking which activities happened each day, with no score', async () => {
    renderDashboard();
    await waitForLoaded();

    expect(region('Activity by day')).toHaveTextContent(
      'Something was recorded on 7 of 30 days: mood check-ins on 4 days, meditation on 3 days, journal entries on 2 days.'
    );
    const days = within(within(region('Activity by day')).getByRole('list', { name: 'Activity for each of the last 30 days' })).getAllByRole('listitem');
    expect(days).toHaveLength(30);
    expect(days[29]).toHaveTextContent(/31 March: mood check-in, saved meditation session, journal entry/);
    expect(days[2]).toHaveTextContent(/4 March: nothing recorded/);
    expect(region('Activity by day')).not.toHaveTextContent(/score|rank|%/i);
  });

  test('the sections follow the period selector without new requests', async () => {
    renderDashboard();
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(chartData('Mood').labels).toEqual(['25 Mar', '26 Mar', '27 Mar', '28 Mar', '29 Mar', '30 Mar', '31 Mar']);
    expect(chartData('Meditation').values).toEqual([5, 0, 0, 0, 0, 0, 10]);
    expect(within(region('Activity by day')).getAllByRole('listitem').length).toBeGreaterThanOrEqual(7);

    // 90 days are shown by week (13 weeks ending today); the calendar still has every day.
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    const weekly = chartData('Mood');
    expect(weekly.labels).toHaveLength(13);
    expect(weekly.labels[12]).toBe('25 Mar – 31 Mar');
    expect(chartData('Meditation').labels).toHaveLength(13);
    expect(chartData('Journal writing').values.reduce((a, b) => a + b, 0)).toBe(3);
    const days = within(within(region('Activity by day')).getByRole('list', { name: 'Activity for each of the last 90 days' })).getAllByRole('listitem');
    expect(days).toHaveLength(90);
    expect(region('Activity by day')).toHaveTextContent('Something was recorded on 10 of 90 days');

    expect(requests).toHaveLength(3);
  });

  test('too little mood data shows a message instead of a chart or average', async () => {
    responders[URLS.moods] = ok([syntheticMoods[0]]);
    renderDashboard();
    await waitForLoaded();

    expect(within(region('Mood')).queryByRole('img')).toBeNull();
    expect(region('Mood')).toHaveTextContent('Add another rated check-in to see your mood over time.');
    expect(stat('Mood', 'Average mood')).toHaveTextContent('Average moodNot yetShown from 3 rated check-ins');
    expect(within(region('Mood')).queryByRole('list', { name: 'Rating counts' })).toBeNull();
  });

  test('a period without meditation shows a friendly message, and the other sections still work', async () => {
    responders[URLS.sessions] = ok([]);
    renderDashboard();
    await waitForLoaded();

    expect(within(region('Meditation')).queryByRole('img')).toBeNull();
    expect(region('Meditation')).toHaveTextContent('No saved meditation sessions in the last 30 days.');
    expect(within(region('Meditation')).getByRole('link', { name: 'Try a meditation' })).toHaveAttribute('href', '/testuser/meditation');
    expect(chartIn('Mood')).toBeInTheDocument();
    expect(region('Activity by day')).toHaveTextContent('meditation on 0 days');
  });

  test('a failed journal request shows an error in its section and is not counted as no activity', async () => {
    responders[URLS.journals] = fail(500);
    renderDashboard();
    await waitForLoaded();

    expect(region('Journal writing')).toHaveTextContent('Your journal entries could not be loaded.');
    expect(region('Activity by day')).toHaveTextContent('journal entries could not be loaded, so it is not shown.');
    expect(region('Activity by day')).not.toHaveTextContent('journal entries on');
    expect(chartIn('Meditation')).toBeInTheDocument();
  });

  test('charts are animated normally but not when reduced motion is requested', async () => {
    const { unmount } = renderDashboard();
    await waitForLoaded();
    expect(chartData('Mood').animation).toEqual({ duration: 400, easing: 'easeOutQuart' });
    unmount();

    window.matchMedia = (query) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query });
    try {
      renderDashboard();
      await waitForLoaded();
      expect(chartData('Mood').animation).toBe(false);
      expect(chartData('Meditation').animation).toBe(false);
      expect(chartData('Journal writing').animation).toBe(false);
    } finally {
      delete window.matchMedia;
    }
  });

  test('only the filtered fields reach the dashboard calculations, so private text is never held', async () => {
    renderDashboard();
    await waitForLoaded();

    expect(buildDashboardCalls.length).toBeGreaterThan(0);
    expect(JSON.stringify(buildDashboardCalls)).not.toMatch(/Synthetic|article|title|note|tags/i);
    const [sources] = buildDashboardCalls[buildDashboardCalls.length - 1];
    sources.journals.forEach((j) => expect(Object.keys(j).sort()).toEqual(['_id', 'createdAt']));
    sources.sessions.forEach((s) => expect(Object.keys(s).sort()).toEqual(['date', 'duration']));
  });
});

describe('Activity overlap and calendar months', () => {
  const region = (name) => screen.getByRole('region', { name });
  const calendarDays = (period) => within(within(region('Activity by day'))
    .getByRole('list', { name: `Activity for each of the last ${period} days` })).getAllByRole('listitem');
  const TODAY = { days: 30, today: '2026-03-31' };

  test('the helper counts days with more than one activity and with all three', () => {
    const activity = summarizeActivity({ moods: syntheticMoods, sessions: syntheticSessions, journals: syntheticJournals }, TODAY);
    expect(activity.daysWithSeveral).toBe(1); // 31 March
    expect(activity.daysWithAllThree).toBe(1);

    const twoOfThree = summarizeActivity({
      moods: [{ day: '2026-03-30', rating: 3 }, { day: '2026-03-29', rating: 4 }],
      sessions: [{ duration: 5, date: '2026-03-30T06:00:00Z' }],
      journals: [{ createdAt: '2026-03-29T06:00:00Z' }],
    }, TODAY);
    expect(twoOfThree.daysWithSeveral).toBe(2);
    expect(twoOfThree.daysWithAllThree).toBe(0);
  });

  test('"all three" is not reported when a source could not be loaded', () => {
    const activity = summarizeActivity({ moods: syntheticMoods, sessions: syntheticSessions, journals: null }, TODAY);
    expect(activity.daysWithSeveral).toBe(1); // mood and meditation on 31 March
    expect(activity.daysWithAllThree).toBeNull();
  });

  test('the summary explains how activities overlap, in plain words', async () => {
    renderDashboard();
    await waitForLoaded();
    expect(region('Activity by day')).toHaveTextContent('More than one was recorded on 1 day, including all three on 1 day.');

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(region('Activity by day')).toHaveTextContent('Something was recorded on 5 of 7 days');
    expect(region('Activity by day')).toHaveTextContent('More than one was recorded on 1 day, including all three on 1 day.');
    expect(requests).toHaveLength(3);
  });

  test('with one source unavailable, the overlap sentence does not mention all three', async () => {
    responders[URLS.journals] = fail(500);
    renderDashboard();
    await waitForLoaded();
    expect(region('Activity by day')).toHaveTextContent('More than one was recorded on 1 day.');
    expect(region('Activity by day')).not.toHaveTextContent('all three');
  });

  test('when no day had more than one activity, the summary says so', async () => {
    responders[URLS.sessions] = ok([]);
    responders[URLS.journals] = ok([]);
    renderDashboard();
    await waitForLoaded();
    expect(region('Activity by day')).toHaveTextContent('No day had more than one of these.');
  });

  test('the calendar shows the month on the first day and on the 1st of each month', async () => {
    renderDashboard();
    await waitForLoaded();

    // 30 days start on Monday 2 March: only that first cell carries a month.
    const thirty = calendarDays(30);
    expect(within(thirty[0]).getByTestId('calendar-month')).toHaveTextContent('Mar');
    expect(thirty.filter((day) => within(day).queryByTestId('calendar-month'))).toHaveLength(1);

    // 90 days start on 1 January: January, February and March are each labelled once.
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    const months = calendarDays(90)
      .map((day) => within(day).queryByTestId('calendar-month'))
      .filter(Boolean)
      .map((el) => el.textContent);
    expect(months).toEqual(['Jan', 'Feb', 'Mar']);
    // Screen readers still get the full date for every day.
    expect(calendarDays(90)[31]).toHaveTextContent(/Sunday 1 February: nothing recorded/);
  });
});

describe('Navbar', () => {
  test('has a Dashboard link to the signed-in user’s dashboard on desktop and mobile', () => {
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    const links = screen.getAllByRole('link', { name: 'Dashboard' });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/testuser/dashboard'));
    // The existing links are still there.
    expect(screen.getAllByRole('link', { name: 'Mood Tracker' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Meditation' })).toHaveLength(2);
  });
});
