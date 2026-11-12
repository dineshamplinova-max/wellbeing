// Offline tests for journal search, tag filtering, sorting and the reading page.
// All axios traffic goes to a mock adapter, so no request ever leaves the test
// process. Only synthetic journal entries are used.
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import Readjournal from './compnents/journal/Readjournal';
import JournalDetail from './compnents/journal/Readonejournal';
import { collectTags, filterJournals, journalDate, journalTags, sortJournals } from './compnents/journal/journalFilters';

// A valid ObjectId whose embedded timestamp is the given date.
const idFor = (iso, suffix) => Math.floor(Date.parse(iso) / 1000).toString(16).padStart(8, '0') + suffix;

const walk = {
  _id: idFor('2026-01-10T08:00:00.000Z', 'aaaaaaaaaaaaaaaa'),
  title: 'Morning walk',
  article: 'Synthetic note about a quiet park.',
  tags: ['outdoors', 'Calm'],
  createdAt: '2026-01-10T08:00:00.000Z',
};
const project = {
  _id: idFor('2026-03-05T18:30:00.000Z', 'bbbbbbbbbbbbbbbb'),
  title: 'Project day',
  article: 'Synthetic text: finished the report early.',
  tags: ['work'],
  createdAt: '2026-03-05T18:30:00.000Z',
};
// No createdAt: its date comes from the ObjectId (1 Feb 2026).
const evening = {
  _id: idFor('2026-02-01T21:00:00.000Z', 'cccccccccccccccc'),
  title: 'Evening thoughts',
  article: 'Synthetic reflection mentioning the park again.',
  tags: ['calm', ' reflection '],
};
// Malformed on purpose: no article, tags not an array, invalid date and id.
const malformed = {
  _id: 'not-an-object-id',
  title: 'Untitled check',
  tags: 'not-an-array',
  createdAt: 'not a date',
};
const syntheticJournals = [walk, project, evening, malformed];

const originalAdapter = axios.defaults.adapter;
let requests;
let listResponse;
let detailResponse;

beforeEach(() => {
  requests = [];
  listResponse = syntheticJournals;
  detailResponse = null;
  localStorage.setItem('tokenUser', 'testuser');
  axios.defaults.adapter = async (config) => {
    requests.push(config);
    const reply = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
    if (config.method === 'get' && config.url === 'http://localhost:8000/testuser/journals') return reply(listResponse);
    if (config.method === 'delete' && config.url.startsWith('http://localhost:8000/journal-delete/testuser/')) return reply({ msg: 'deleted' });
    if (config.method === 'get' && config.url.startsWith('http://localhost:8000/testuser/') && detailResponse) return reply(detailResponse);
    const error = new Error(`Unexpected request in offline test: ${config.method} ${config.url}`);
    error.response = { status: 404, data: {}, headers: {}, config };
    throw error;
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  localStorage.clear();
  sessionStorage.clear();
  jest.restoreAllMocks();
});

const EditStub = () => <div>edit page {useParams().id}</div>;

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/testuser/readjournals']}>
      <Routes>
        <Route path="/:username/readjournals" element={<Readjournal />} />
        <Route path="/:username/journals/:id/edit" element={<EditStub />} />
      </Routes>
    </MemoryRouter>
  );

const renderDetail = (id) =>
  render(
    <MemoryRouter initialEntries={[`/testuser/readjournals/${id}`]}>
      <Routes>
        <Route path="/:username/readjournals/:id" element={<JournalDetail />} />
      </Routes>
    </MemoryRouter>
  );

const cardTitles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);
const search = (value) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } });

describe('journal filter helpers', () => {
  test('journalDate uses a valid createdAt, falls back to the ObjectId, and copes with bad ids', () => {
    expect(journalDate(walk).toISOString()).toBe('2026-01-10T08:00:00.000Z');
    expect(journalDate(evening).toISOString()).toBe('2026-02-01T21:00:00.000Z');
    expect(journalDate({ ...evening, createdAt: 'not a date' }).toISOString()).toBe('2026-02-01T21:00:00.000Z');
    expect(journalDate(malformed)).toBeNull();
    expect(journalDate({ _id: 12345 })).toBeNull();
    expect(journalDate({ _id: 'zzzzzzzzzzzzzzzzzzzzzzzz' })).toBeNull();
    expect(journalDate(null)).toBeNull();
    expect(journalDate(undefined)).toBeNull();
  });

  test('sorting is newest first by default, deterministic, and does not change the input', () => {
    const input = [...syntheticJournals];
    const snapshot = [...input];
    expect(sortJournals(input).map((j) => j.title)).toEqual(['Project day', 'Evening thoughts', 'Morning walk', 'Untitled check']);
    expect(sortJournals(input, 'oldest').map((j) => j.title)).toEqual(['Morning walk', 'Evening thoughts', 'Project day', 'Untitled check']);
    expect(input).toEqual(snapshot);
    expect(sortJournals(input)).not.toBe(input);

    // Same date: ordered by id, the same way every time.
    const sameDay = [
      { _id: idFor('2026-04-01T00:00:00.000Z', '0000000000000002'), createdAt: '2026-04-01T00:00:00.000Z' },
      { _id: idFor('2026-04-01T00:00:00.000Z', '0000000000000001'), createdAt: '2026-04-01T00:00:00.000Z' },
    ];
    expect(sortJournals(sameDay, 'oldest').map((j) => j._id.slice(-1))).toEqual(['1', '2']);
    expect(sortJournals([...sameDay].reverse(), 'oldest').map((j) => j._id.slice(-1))).toEqual(['1', '2']);
    expect(sortJournals(sameDay, 'newest').map((j) => j._id.slice(-1))).toEqual(['2', '1']);
  });

  test('search matches title or text, ignoring case and spaces, and handles missing fields', () => {
    expect(filterJournals(syntheticJournals, { query: '  PARK ' }).map((j) => j.title)).toEqual(['Morning walk', 'Evening thoughts']);
    expect(filterJournals(syntheticJournals, { query: 'project' }).map((j) => j.title)).toEqual(['Project day']);
    expect(filterJournals(syntheticJournals, { query: 'nothing like this' })).toEqual([]);
    expect(filterJournals([{ title: 42, article: null }, null, 'text'], { query: 'a' })).toEqual([]);
    expect(filterJournals('not an array')).toEqual([]);
  });

  test('tags are collected once each in A–Z order and filtering ignores case', () => {
    expect(collectTags(syntheticJournals)).toEqual(['Calm', 'outdoors', 'reflection', 'work']);
    expect(journalTags({ tags: [1, null, ' a ', ''] })).toEqual(['a']);
    expect(journalTags(malformed)).toEqual([]);
    expect(filterJournals(syntheticJournals, { tag: 'calm' }).map((j) => j.title)).toEqual(['Morning walk', 'Evening thoughts']);
    expect(filterJournals(syntheticJournals, { tag: 'Calm', query: 'project' })).toEqual([]);
  });
});

describe('Your Journal list', () => {
  test('shows every entry newest first, including one with no article, using one request', async () => {
    renderList();
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    expect(cardTitles()).toEqual(['Project day', 'Evening thoughts', 'Morning walk', 'Untitled check']);
    expect(screen.getByLabelText('Sort').value).toBe('newest');
    expect(screen.getByText('Showing 4 of 4 entries')).toBeTruthy();

    // The entry without createdAt shows its ObjectId date.
    const eveningTime = screen.getByText(journalDate(evening).toLocaleDateString());
    expect(eveningTime.getAttribute('datetime')).toBe(journalDate(evening).toISOString());
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['get http://localhost:8000/testuser/journals']);
  });

  test('search updates as you type, shows an empty state, and stays in memory only', async () => {
    renderList();
    await waitFor(() => expect(cardTitles()).toHaveLength(4));

    search('park');
    expect(cardTitles()).toEqual(['Evening thoughts', 'Morning walk']);
    search('PROJECT');
    expect(cardTitles()).toEqual(['Project day']);

    search('no synthetic match');
    expect(cardTitles()).toEqual([]);
    expect(screen.getByText('No entries match your search.')).toBeTruthy();
    expect(screen.getByText('Showing 0 of 4 entries')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toHaveLength(4);
    expect(screen.getByLabelText('Search').value).toBe('');

    // Nothing was sent or stored while searching.
    expect(requests).toHaveLength(1);
    expect(Object.keys(localStorage)).toEqual(['tokenUser']);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('');
  });

  test('the tag filter lists only existing tags and combines with search', async () => {
    renderList();
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    const tagSelect = screen.getByLabelText('Tag');
    expect(within(tagSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['All tags', 'Calm', 'outdoors', 'reflection', 'work']);

    fireEvent.change(tagSelect, { target: { value: 'Calm' } });
    expect(cardTitles()).toEqual(['Evening thoughts', 'Morning walk']);
    search('evening');
    expect(cardTitles()).toEqual(['Evening thoughts']);

    fireEvent.change(tagSelect, { target: { value: '' } });
    search('');
    expect(cardTitles()).toHaveLength(4);
    expect(requests).toHaveLength(1);
  });

  test('oldest first reverses the order', async () => {
    renderList();
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'oldest' } });
    expect(cardTitles()).toEqual(['Morning walk', 'Evening thoughts', 'Project day', 'Untitled check']);
  });

  test('no entries shows a friendly message and no controls', async () => {
    listResponse = [];
    renderList();
    expect(await screen.findByText('No journal entries yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Write your first entry' }).getAttribute('href')).toBe('/testuser/createjournal');
    expect(screen.queryByLabelText('Search')).toBeNull();
  });

  test('Edit still opens the edit page for that entry', async () => {
    renderList();
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(await screen.findByText(`edit page ${project._id}`)).toBeTruthy();
  });

  test('Delete still confirms, calls the same endpoint and removes the card', async () => {
    renderList();
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    // The confirmation adds exactly one more Delete button, rendered after the cards.
    expect(screen.getByText('Are you sure you want to delete this journal?')).toBeTruthy();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    expect(deleteButtons).toHaveLength(5);
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => expect(cardTitles()).toEqual(['Evening thoughts', 'Morning walk', 'Untitled check']));

    const del = requests.find((r) => r.method === 'delete');
    expect(del.url).toBe(`http://localhost:8000/journal-delete/testuser/${project._id}`);
    expect(screen.queryByText('Are you sure you want to delete this journal?')).toBeNull();
  });
});

describe('Journal reading page', () => {
  test('shows the date, keeps paragraph breaks and shows tags', async () => {
    detailResponse = { ...walk, article: 'First synthetic paragraph.\n\nSecond synthetic paragraph.' };
    renderDetail(walk._id);
    const heading = await screen.findByRole('heading', { name: 'Morning walk' });
    expect(heading).toBeTruthy();
    const walkDate = new Date('2026-01-10T08:00:00.000Z');
    expect(screen.getByText(walkDate.toLocaleDateString()).getAttribute('datetime')).toBe(walkDate.toISOString());

    const article = screen.getByText(/First synthetic paragraph/);
    expect(article.textContent).toBe('First synthetic paragraph.\n\nSecond synthetic paragraph.');
    expect(article.className).toMatch('whitespace-pre-line');
    expect(screen.getByText('outdoors')).toBeTruthy();
    expect(screen.getByText('Calm')).toBeTruthy();
  });

  test('uses the ObjectId date when createdAt is missing, and copes with malformed data', async () => {
    detailResponse = evening;
    const { unmount } = renderDetail(evening._id);
    await screen.findByRole('heading', { name: 'Evening thoughts' });
    const eveningDate = new Date('2026-02-01T21:00:00.000Z');
    expect(screen.getByText(eveningDate.toLocaleDateString()).getAttribute('datetime')).toBe(eveningDate.toISOString());
    unmount();

    detailResponse = malformed;
    renderDetail('not-an-object-id');
    await screen.findByRole('heading', { name: 'Untitled check' });
    // No usable date, so no date is shown (in any numeric date format).
    expect(screen.queryByText(/\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/)).toBeNull();
  });

  test('a failed request still shows the existing error message', async () => {
    renderDetail(walk._id);
    expect(await screen.findByText('Error fetching journal details')).toBeTruthy();
  });
});
