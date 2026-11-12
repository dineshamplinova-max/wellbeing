// Offline tests for the word count, character count and reading-time line on the
// Create and Edit Journal pages. window.fetch and axios are mocked, so no request
// ever leaves the test process. Only synthetic data is used.
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateJournal from './compnents/journal/Createjournal';
import UpdateJournal from './compnents/journal/Updatejournal';
import { JOURNAL_PROMPTS } from './compnents/journal/JournalPrompts';
import { getTextStats, MAX_ARTICLE_LENGTH } from './compnents/journal/JournalTextStats';

const originalFetch = window.fetch;
const originalAdapter = axios.defaults.adapter;
let fetchCalls;
let axiosRequests;

const syntheticJournal = {
  _id: 'journal-test-id',
  title: 'Synthetic title',
  article: 'Synthetic saved journal body',
  tags: ['synthetic-tag'],
  coverPicture: '',
};

beforeEach(() => {
  fetchCalls = [];
  axiosRequests = [];
  localStorage.setItem('tokenUser', 'testuser');
  window.fetch = jest.fn(async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url) === 'http://localhost:8000/testuser' && options?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ _id: 'journal-test-id' }) };
    }
    throw new Error(`Unexpected fetch in offline test: ${url}`);
  });
  axios.defaults.adapter = async (config) => {
    axiosRequests.push(config);
    const reply = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
    if (config.method === 'get' && config.url === 'http://localhost:8000/testuser/journal-test-id') return reply(syntheticJournal);
    if (config.method === 'put' && config.url === 'http://localhost:8000/journals/testuser/journal-test-id') return reply({ ok: true });
    throw new Error(`Unexpected request in offline test: ${config.method} ${config.url}`);
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  window.fetch = originalFetch;
  axios.defaults.adapter = originalAdapter;
  localStorage.clear();
  jest.restoreAllMocks();
});

const renderAt = (path, routePath, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={element} />
        <Route path="/:username/readjournals" element={<div>journal list</div>} />
        <Route path="/:username/profile" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>
  );
const renderCreate = () => renderAt('/testuser/createjournal', '/:username/createjournal', <CreateJournal />);
const renderEdit = () => renderAt('/testuser/journals/journal-test-id/edit', '/:username/journals/:id/edit', <UpdateJournal />);

// The stats line is found through the textarea's aria-describedby, which also
// checks that the two are linked.
const statsFor = (textarea) => document.getElementById(textarea.getAttribute('aria-describedby'));
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('getTextStats', () => {
  test('empty or whitespace-only text has no words and no reading time', () => {
    expect(getTextStats('')).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
    expect(getTextStats('  \n\t ')).toEqual({ words: 0, characters: 5, readingMinutes: 0 });
    expect(getTextStats(undefined)).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
  });

  test('extra spaces, tabs and new lines do not create extra words', () => {
    const text = '  Synthetic   words\n\nacross\tlines ';
    expect(getTextStats(text)).toEqual({ words: 4, characters: text.length, readingMinutes: 1 });
  });

  test('reading time rounds up at about 200 words per minute', () => {
    expect(getTextStats('one').readingMinutes).toBe(1);
    expect(getTextStats(words(200)).readingMinutes).toBe(1);
    expect(getTextStats(words(201)).readingMinutes).toBe(2);
    expect(getTextStats(words(1000)).readingMinutes).toBe(5);
  });

  test('characters are counted like the server limit and never capped', () => {
    expect(MAX_ARTICLE_LENGTH).toBe(20000);
    expect(getTextStats('a'.repeat(MAX_ARTICLE_LENGTH + 1)).characters).toBe(20001);
  });
});

describe('Create Journal page', () => {
  const content = () => screen.getByLabelText('Content');

  test('shows live counts that update while typing and when a prompt is added', () => {
    renderCreate();
    expect(content().getAttribute('aria-describedby')).toBe('journal-article-stats');
    expect(statsFor(content()).textContent).toBe('0 words · 0 / 20,000 characters · – min read');

    fireEvent.change(content(), { target: { value: 'Synthetic journal entry' } });
    expect(statsFor(content()).textContent).toBe('3 words · 23 / 20,000 characters · about 1 min read');

    fireEvent.change(content(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: JOURNAL_PROMPTS[0] }));
    const { words: promptWords, characters } = getTextStats(content().value);
    expect(statsFor(content()).textContent).toBe(`${promptWords} words · ${characters} / 20,000 characters · about 1 min read`);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test('text over the limit is not blocked or shortened, and the request is unchanged', async () => {
    renderCreate();
    const longText = 'a'.repeat(MAX_ARTICLE_LENGTH + 1);
    fireEvent.change(screen.getByPlaceholderText('Give your journal a meaningful title'), { target: { value: 'Synthetic title' } });
    fireEvent.change(content(), { target: { value: longText } });
    expect(content().value).toHaveLength(20001);
    expect(statsFor(content()).textContent).toBe('1 word · 20,001 / 20,000 characters · about 1 min read');

    fireEvent.click(screen.getByRole('button', { name: 'Publish Journal' }));
    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    await screen.findByText('journal list');

    const call = fetchCalls[0];
    expect(call.url).toBe('http://localhost:8000/testuser');
    expect(call.options).toEqual(expect.objectContaining({ method: 'POST', credentials: 'include' }));
    const fields = Object.fromEntries(call.options.body.entries());
    expect(Object.keys(fields).sort()).toEqual(['article', 'isPrivate', 'title']);
    expect(fields.article).toBe(longText);
  });
});

describe('Edit Journal page', () => {
  const content = () => screen.getByLabelText('Your Journal');

  test('shows counts for the loaded journal and updates them while editing', async () => {
    renderEdit();
    await waitFor(() => expect(content().value).toBe('Synthetic saved journal body'));
    expect(content().getAttribute('aria-describedby')).toBe('article-stats');
    expect(statsFor(content()).textContent).toBe('4 words · 28 / 20,000 characters · about 1 min read');

    fireEvent.change(content(), { target: { name: 'article', value: 'Synthetic edit' } });
    expect(statsFor(content()).textContent).toBe('2 words · 14 / 20,000 characters · about 1 min read');
  });

  test('the save request is unchanged', async () => {
    renderEdit();
    await waitFor(() => expect(content().value).toBe('Synthetic saved journal body'));
    fireEvent.change(content(), { target: { name: 'article', value: 'Synthetic edited body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('profile page');

    const put = axiosRequests.find((r) => r.method === 'put');
    expect(put.url).toBe('http://localhost:8000/journals/testuser/journal-test-id');
    const body = JSON.parse(put.data);
    expect(Object.keys(body).sort()).toEqual(['article', 'tags', 'title']);
    expect(body).toEqual({ title: 'Synthetic title', article: 'Synthetic edited body', tags: ['synthetic-tag'] });
  });
});
