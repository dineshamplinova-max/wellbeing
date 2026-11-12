// Offline tests for the daily check-in form, the mood summary and the support page.
// All axios traffic goes to a mock adapter, so no request leaves the test process.
// Only synthetic data is used.
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MoodTrack from './compnents/moodtrack/MoodTrack';
import Support from './compnents/support/Support';

// jsdom has no canvas, so the chart is replaced with an empty component.
jest.mock('react-chartjs-2', () => ({ Line: () => null, Bar: () => null }));
jest.mock('chart.js', () => ({
  Chart: { register: () => {} }, LineElement: {}, PointElement: {}, Filler: {},
  BarElement: {}, CategoryScale: {}, LinearScale: {}, Tooltip: {}, Legend: {},
}));

const BASE = 'http://localhost:8000/api/moods/testuser';
const originalAdapter = axios.defaults.adapter;
let sentRequests;
let historyEntries;
let todayEntry;
let summaryData;
let writeResponder;

const sparseLowSummary = {
  period: 'week', startDay: '2026-09-29', endDay: '2026-10-05',
  totalCheckins: 2, daysWithCheckin: 2, ratedCount: 2, averageRating: 1.5,
  ratingCounts: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0 }, factorCounts: { work: 1 },
  averageEnergy: null, averageSleepHours: null,
  daily: [{ day: '2026-10-04', rating: 2 }, { day: '2026-10-05', rating: 1 }],
  comparison: null, lowRatingNotice: true,
};

const reply = (config, data, status = 200) => {
  const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.response = response;
    throw error;
  }
  return response;
};

// Answers locally; any unexpected request fails the test.
const mockAdapter = async (config) => {
  sentRequests.push(config);
  const { method, url } = config;
  if (method === 'get' && url === BASE) return reply(config, historyEntries);
  if (method === 'get' && url === `${BASE}/today`) return reply(config, todayEntry);
  if (method === 'get' && url.startsWith(`${BASE}/summary?period=`)) return reply(config, summaryData);
  if ((method === 'post' && url === BASE) || (method === 'patch' && url === `${BASE}/today`)) {
    return writeResponder(config);
  }
  throw new Error(`Unexpected request in offline test: ${method} ${url}`);
};

const savedEntry = (config) => ({ _id: 'entry-1', day: '2026-10-05', ...JSON.parse(config.data) });

beforeEach(() => {
  sentRequests = [];
  historyEntries = [];
  todayEntry = null;
  summaryData = { ...sparseLowSummary, totalCheckins: 0, ratedCount: 0, lowRatingNotice: false };
  writeResponder = (config) => reply(config, savedEntry(config));
  axios.defaults.adapter = mockAdapter;
  localStorage.setItem('tokenUser', 'testuser');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  localStorage.clear();
  jest.restoreAllMocks();
});

const renderMoodTrack = () => render(<MemoryRouter><MoodTrack /></MemoryRouter>);
const findWrite = (method) => sentRequests.find((r) => r.method === method);

describe('Daily check-in form', () => {
  test('a new check-in sends only the check-in fields', async () => {
    renderMoodTrack();
    fireEvent.click(await screen.findByRole('radio', { name: 'Good' }));
    fireEvent.change(screen.getByLabelText('Energy (optional)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sleep' }));
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  Synthetic note  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));

    await screen.findByText("Today's check-in was saved.");
    const post = findWrite('post');
    expect(post.url).toBe(BASE);
    expect(JSON.parse(post.data)).toEqual({ rating: 4, energy: 3, factors: ['sleep'], note: 'Synthetic note' });
  });

  test('the note is limited to 500 characters and shows a counter', async () => {
    renderMoodTrack();
    const note = await screen.findByLabelText('Note (optional)');
    expect(note.getAttribute('maxLength')).toBe('500');
    expect(screen.getByText('0/500 characters')).toBeTruthy();
    fireEvent.change(note, { target: { value: 'Synthetic words' } });
    expect(screen.getByText('15/500 characters')).toBeTruthy();
  });

  test("today's existing check-in is pre-filled and saved with PATCH", async () => {
    todayEntry = { _id: 'entry-1', day: '2026-10-05', rating: 2, mood: '😔', factors: ['work'], note: 'Earlier synthetic note' };
    renderMoodTrack();
    const low = await screen.findByRole('radio', { name: 'Low' });
    expect(low.checked).toBe(true);
    expect(screen.getByLabelText('Note (optional)').value).toBe('Earlier synthetic note');

    fireEvent.click(screen.getByRole('button', { name: 'Update check-in' }));
    await screen.findByText("Today's check-in was updated.");
    expect(findWrite('post')).toBeUndefined();
    const patch = findWrite('patch');
    expect(patch.url).toBe(`${BASE}/today`);
    expect(JSON.parse(patch.data)).toEqual({ rating: 2, factors: ['work'], note: 'Earlier synthetic note' });
  });

  test('a missing rating or a server rejection shows a visible message', async () => {
    renderMoodTrack();
    fireEvent.click(await screen.findByRole('button', { name: 'Save check-in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Please choose how you are feeling today.');
    expect(findWrite('post')).toBeUndefined();

    writeResponder = (config) => reply(config, { message: "You have already checked in today. You can edit today's check-in instead." }, 409);
    fireEvent.click(screen.getByRole('radio', { name: 'Okay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch('already checked in today'));
  });

  test('the save button is disabled while saving', async () => {
    let finish;
    writeResponder = (config) => new Promise((resolve) => { finish = () => resolve(reply(config, savedEntry(config))); });
    renderMoodTrack();
    fireEvent.click(await screen.findByRole('radio', { name: 'Okay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }));

    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect(saving.disabled).toBe(true);
    finish();
    const done = await screen.findByRole('button', { name: 'Update check-in' });
    expect(done.disabled).toBe(false);
  });
});

describe('Mood summary', () => {
  test('sparse, lower ratings: neutral wording and a support link', async () => {
    summaryData = sparseLowSummary;
    renderMoodTrack();
    expect(await screen.findByText('Add a few more check-ins to see patterns over time.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'See support options' });
    expect(link.getAttribute('href')).toBe('/support');

    const text = screen.getByTestId('mood-summary').textContent;
    expect(text).not.toMatch(/diagnos|risk|predict|crisis|declin/i);
  });

  test('no check-ins: a simple empty message and no support notice', async () => {
    renderMoodTrack();
    expect(await screen.findByText('No check-ins in this period yet.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'See support options' })).toBeNull();
    // The neutral journal and support links are still offered.
    expect(screen.getByRole('link', { name: 'Write in your journal' }).getAttribute('href')).toBe('/testuser/createjournal');
    expect(screen.getByRole('link', { name: 'Support options' }).getAttribute('href')).toBe('/support');
  });
});

describe('Weekly insights', () => {
  const weeklySummary = {
    ...sparseLowSummary,
    totalCheckins: 4, daysWithCheckin: 4, ratedCount: 4, averageRating: 3.3,
    ratingCounts: { 1: 0, 2: 0, 3: 2, 4: 2, 5: 0 },
    mostFrequent: { levels: [4, 3], count: 2 },
    averageEnergy: 3.5, energyCount: 2, averageSleepHours: null, sleepCount: 0,
    lowRatingNotice: false,
  };

  test('shows the average, tied most frequent moods and only the metrics that were saved', async () => {
    summaryData = weeklySummary;
    renderMoodTrack();
    const average = await screen.findByTestId('average-rating');
    expect(average.textContent).toMatch('3.3');
    expect(average.textContent).toMatch('from 4 rated check-ins');

    const frequent = screen.getByTestId('most-frequent');
    expect(frequent.textContent).toMatch('Good and Okay');
    expect(frequent.textContent).toMatch('2 each');

    expect(screen.getByTestId('average-energy').textContent).toMatch('from 2 check-ins');
    expect(screen.queryByTestId('average-sleep')).toBeNull();

    expect(screen.getByRole('link', { name: 'Write in your journal' }).getAttribute('href')).toBe('/testuser/createjournal');
    expect(screen.getByRole('link', { name: 'Support options' }).getAttribute('href')).toBe('/support');
    expect(screen.getByTestId('mood-summary').textContent).not.toMatch(/diagnos|risk|predict|crisis|declin/i);
  });

  test('a single most frequent mood and the average threshold', async () => {
    summaryData = {
      ...sparseLowSummary,
      ratedCount: 2, averageRating: 2, ratingCounts: { 1: 0, 2: 2, 3: 0, 4: 0, 5: 0 },
      mostFrequent: { levels: [2], count: 2 }, energyCount: 0, sleepCount: 0,
    };
    renderMoodTrack();
    const average = await screen.findByTestId('average-rating');
    expect(average.textContent).toBe('Average ratingNot enough check-ins yet.');
    expect(screen.getByTestId('most-frequent').textContent).toMatch(/Low2 check-ins$/);
    expect(screen.queryByTestId('average-energy')).toBeNull();
  });
});

describe('Mood over time chart', () => {
  test('uses saved entries in date order, maps emoji to 1–5 and leaves out unknown moods', async () => {
    historyEntries = [
      { _id: 'a', day: '2026-10-05', rating: 2, mood: '😔' },
      { _id: 'b', date: '2026-10-01T00:00:00.000Z', mood: '😊' }, // older emoji-only entry
      { _id: 'c', date: '2026-10-02T00:00:00.000Z', mood: 'calm' }, // unknown mood: left out
      { _id: 'd', day: '2026-10-03', rating: 5, mood: '😄' },
    ];
    renderMoodTrack();
    const table = await screen.findByRole('table', { name: 'Mood check-ins by date' });
    const rows = within(table).getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['1 Oct', '4 – Good'],
      ['3 Oct', '5 – Very good'],
      ['5 Oct', '2 – Low'],
    ]);
  });

  test('fewer than two usable entries shows a message instead of a chart', async () => {
    historyEntries = [
      { _id: 'a', day: '2026-10-05', rating: 4, mood: '😊' },
      { _id: 'b', date: '2026-10-02T00:00:00.000Z', mood: 'calm' },
    ];
    renderMoodTrack();
    expect(await screen.findByText('1 check-in so far: 4 – Good on 5 Oct. Add another to see your mood over time.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Mood check-ins by date' })).toBeNull();
  });
});

describe('Support page', () => {
  test('renders without sign-in and lists no phone numbers', () => {
    localStorage.clear();
    render(<MemoryRouter><Support /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Support options' })).toBeTruthy();
    const main = screen.getByRole('main').textContent;
    expect(main).toMatch(/emergency services/);
    expect(main).not.toMatch(/\d{3,}|\+\d/);
    expect(sentRequests).toHaveLength(0);
  });
});
