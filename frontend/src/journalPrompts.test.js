// Offline tests for the optional guided prompts on the Create Journal page.
// window.fetch is mocked, so no request ever leaves the test process.
// Only synthetic data is used.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateJournal from './compnents/journal/Createjournal';
import { JOURNAL_PROMPTS } from './compnents/journal/JournalPrompts';

const originalFetch = window.fetch;
let fetchCalls;

beforeEach(() => {
  fetchCalls = [];
  localStorage.setItem('tokenUser', 'testuser');
  // Answers only the existing create-journal request; anything else fails the test.
  window.fetch = jest.fn(async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url) === 'http://localhost:8000/testuser' && options?.method === 'POST') {
      return { ok: true, status: 201, json: async () => ({ _id: 'journal-test-id' }) };
    }
    throw new Error(`Unexpected fetch in offline test: ${url}`);
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  window.fetch = originalFetch;
  localStorage.clear();
  jest.restoreAllMocks();
});

const renderCreateJournal = () =>
  render(
    <MemoryRouter initialEntries={['/testuser/createjournal']}>
      <Routes>
        <Route path="/:username/createjournal" element={<CreateJournal />} />
        <Route path="/:username/readjournals" element={<div>journal list</div>} />
      </Routes>
    </MemoryRouter>
  );

const content = () => screen.getByLabelText('Content');
const choosePrompt = (prompt) => fireEvent.click(screen.getByRole('button', { name: prompt }));
const fillTitle = (value) =>
  fireEvent.change(screen.getByPlaceholderText('Give your journal a meaningful title'), { target: { value } });
const publish = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Publish Journal' }));
  await waitFor(() => expect(fetchCalls).toHaveLength(1));
  await screen.findByText('journal list');
  return fetchCalls[0];
};
const sentFields = (call) => Object.fromEntries(call.options.body.entries());

describe('Guided journaling prompts', () => {
  test('writing without a prompt sends the same request as before', async () => {
    renderCreateJournal();
    fillTitle('Synthetic title');
    fireEvent.change(content(), { target: { value: 'Synthetic entry written without a prompt' } });
    const call = await publish();

    expect(call.url).toBe('http://localhost:8000/testuser');
    expect(call.options).toEqual(expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(call.options.body).toBeInstanceOf(FormData);
    expect(sentFields(call)).toEqual({
      title: 'Synthetic title',
      article: 'Synthetic entry written without a prompt',
      isPrivate: 'false',
    });
  });

  test('choosing a prompt in an empty editor adds its text, focuses the end and sends nothing', () => {
    renderCreateJournal();
    JOURNAL_PROMPTS.forEach((prompt) => {
      expect(screen.getByRole('button', { name: prompt }).getAttribute('type')).toBe('button');
    });

    choosePrompt(JOURNAL_PROMPTS[0]);
    const textarea = content();
    expect(textarea.value).toBe(`${JOURNAL_PROMPTS[0]} `);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test('existing text is kept and the prompt is added as a new paragraph', () => {
    renderCreateJournal();
    fireEvent.change(content(), { target: { value: 'Synthetic first thoughts.' } });
    choosePrompt(JOURNAL_PROMPTS[2]);
    expect(content().value).toBe(`Synthetic first thoughts.\n\n${JOURNAL_PROMPTS[2]} `);

    choosePrompt(JOURNAL_PROMPTS[3]);
    expect(content().value).toBe(`Synthetic first thoughts.\n\n${JOURNAL_PROMPTS[2]} \n\n${JOURNAL_PROMPTS[3]} `);
    expect(document.activeElement).toBe(content());
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test('inserted prompt text can be cleared or edited, and the edited text is what is saved', async () => {
    renderCreateJournal();
    choosePrompt(JOURNAL_PROMPTS[1]);
    fireEvent.change(content(), { target: { value: '' } });
    expect(content().value).toBe('');

    choosePrompt(JOURNAL_PROMPTS[4]);
    fireEvent.change(content(), { target: { value: 'Synthetic text that replaced the prompt' } });
    fillTitle('Synthetic edited title');
    const call = await publish();
    expect(sentFields(call).article).toBe('Synthetic text that replaced the prompt');
  });

  test('a prompt adds no new field to the request', async () => {
    renderCreateJournal();
    fillTitle('Synthetic title');
    choosePrompt(JOURNAL_PROMPTS[5]);
    fireEvent.change(content(), { target: { value: `${content().value}synthetic answer` } });
    const call = await publish();

    const fields = sentFields(call);
    expect(Object.keys(fields).sort()).toEqual(['article', 'isPrivate', 'title']);
    expect(fields).not.toHaveProperty('prompt');
    expect(fields.article).toBe(`${JOURNAL_PROMPTS[5]} synthetic answer`);
  });
});
