// Offline tests for the WellBridge AI Support page (mock replies, plus the
// Phase 2b eligibility and consent screens). All axios traffic goes to a mock
// adapter, so no request leaves the test process; any unexpected request fails
// the test. Only synthetic messages are used.
import '@testing-library/jest-dom';
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Therapist, {
  DISCLAIMER, MAX_MESSAGE_LENGTH, MAX_HISTORY_TURNS, CHAT_TIMEOUT_MS, LOCAL_CHAT_TIMEOUT_MS, chatTimeoutFor, historyFrom, viewFor,
  CHAT_URL, STATUS_URL, ATTESTATION_URL, CONSENT_URL,
} from './compnents/AITherapist/Therapist.jsx';

const MOCK_REPLY = 'It sounds like there is a lot going on. What feels most pressing for you right now?';
const SYNTHETIC = 'Synthetic test message about exams';
const NOTICE = 'wb-ai-notice-draft-1';
// Shapes match backend/routes/assistantRoutes.js (statusBody).
const STATUS = {
  success: true, mode: 'mock', liveApproved: false, consentRequired: false, noticeVersion: NOTICE,
  eligible: true, eligibilityReason: 'self-declared-adult', consented: false,
};
const withStatus = (fields) => ({ ...STATUS, ...fields });

const originalAdapter = axios.defaults.adapter;
let requests;
let responder;       // POST chat
let statusResponder; // GET status
let attestResponder; // POST attestation
let consentResponder; // POST consent
let withdrawResponder; // DELETE consent

const ok = (data) => (config) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
const fail = (status, data = { success: false, error: 'synthetic' }) => (config) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, headers: {}, config };
  throw error;
};
// A reply that only arrives when the test says so.
const deferred = () => {
  let release;
  const responderFn = (config) => new Promise((resolve) => { release = () => resolve(ok({ success: true, type: 'message', reply: MOCK_REPLY, mode: 'mock' })(config)); });
  return { responderFn, release: () => release() };
};

let setItemSpy;
beforeEach(() => {
  requests = [];
  responder = ok({ success: true, type: 'message', reply: MOCK_REPLY, mode: 'mock' });
  statusResponder = ok(STATUS);
  attestResponder = () => { throw new Error('attestation not expected'); };
  consentResponder = () => { throw new Error('consent not expected'); };
  withdrawResponder = () => { throw new Error('withdrawal not expected'); };
  axios.defaults.adapter = async (config) => {
    requests.push(config);
    const key = `${config.method} ${config.url}`;
    if (key === `post ${CHAT_URL}`) return responder(config);
    if (key === `get ${STATUS_URL}`) return statusResponder(config);
    if (key === `post ${ATTESTATION_URL}`) return attestResponder(config);
    if (key === `post ${CONSENT_URL}`) return consentResponder(config);
    if (key === `delete ${CONSENT_URL}`) return withdrawResponder(config);
    throw new Error(`Unexpected request: ${key}`);
  };
  localStorage.setItem('tokenUser', 'testuser');
  setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  localStorage.clear();
  sessionStorage.clear();
  jest.restoreAllMocks();
});

const renderRaw = () => render(<MemoryRouter><Therapist /></MemoryRouter>);
// Renders and waits for the status check to open the chat.
const renderPage = async () => {
  const utils = renderRaw();
  await screen.findByLabelText('Your message');
  return utils;
};
const box = () => screen.getByLabelText('Your message');
const sendButton = () => screen.getByRole('button', { name: /Send|Sending/ });
const log = () => screen.getByRole('log', { name: 'Conversation' });
const type = (text) => fireEvent.change(box(), { target: { value: text } });
const chatRequests = () => requests.filter((r) => r.url === CHAT_URL);
const bodyOf = (r) => (r.data === undefined ? undefined : JSON.parse(r.data));

describe('WellBridge AI Support page', () => {
  test('shows the name, the persistent disclaimer and the mock notice', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'WellBridge AI Support' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(DISCLAIMER);
    expect(screen.getByRole('note')).toHaveTextContent('It is not connected to a real AI service yet.');
    expect(within(log()).getByText('Messages you send appear here. Nothing is saved.')).toBeInTheDocument();
    expect(box()).toHaveAttribute('maxLength', String(MAX_MESSAGE_LENGTH));
    // No voice controls in Phase 1.
    expect(screen.queryByRole('button', { name: /microphone|speak|voice/i })).toBeNull();
  });

  test('sends only the message and this session\'s history, and shows the reply, with a loading state while waiting', async () => {
    const reply = deferred();
    responder = reply.responderFn;
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());

    expect(screen.getByRole('status')).toHaveTextContent('WellBridge AI Support is replying…');
    expect(sendButton()).toBeDisabled();
    expect(within(log()).getByText(SYNTHETIC)).toBeInTheDocument();
    expect(box()).toHaveValue('');

    reply.release();
    expect(await within(log()).findByText(MOCK_REPLY)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(chatRequests()).toHaveLength(1);
    expect(JSON.parse(chatRequests()[0].data)).toEqual({ message: SYNTHETIC, history: [] });
    expect(chatRequests()[0].timeout).toBe(CHAT_TIMEOUT_MS);
    expect(screen.getByTestId('assistant-reply')).toHaveTextContent('practice reply');
  });

  test('Enter sends; Shift+Enter does not', async () => {
    await renderPage();
    type('first synthetic line');
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(chatRequests()).toHaveLength(0);

    fireEvent.keyDown(box(), { key: 'Enter' });
    await within(log()).findByText(MOCK_REPLY);
    expect(chatRequests()).toHaveLength(1);
  });

  test('empty or whitespace-only messages cannot be sent', async () => {
    await renderPage();
    expect(sendButton()).toBeDisabled();
    type('   \n  ');
    expect(sendButton()).toBeDisabled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.click(sendButton());
    expect(chatRequests()).toHaveLength(0);
  });

  test('a second send while waiting is ignored (no duplicate submission)', async () => {
    const reply = deferred();
    responder = reply.responderFn;
    await renderPage();
    type(SYNTHETIC);
    fireEvent.keyDown(box(), { key: 'Enter' });
    type('another synthetic message');
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.click(sendButton());
    expect(chatRequests()).toHaveLength(1);

    reply.release();
    await within(log()).findByText(MOCK_REPLY);
    expect(chatRequests()).toHaveLength(1);
  });

  test('a failed request shows an error, removes the unsent message and puts it back in the box', async () => {
    responder = fail(500);
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Your message could not be sent.');
    expect(within(log()).queryByText(SYNTHETIC)).toBeNull();
    expect(box()).toHaveValue(SYNTHETIC);
    expect(sendButton()).toBeEnabled();

    // Retrying after the problem clears works and removes the error.
    responder = ok({ success: true, type: 'message', reply: MOCK_REPLY, mode: 'mock' });
    fireEvent.click(sendButton());
    await within(log()).findByText(MOCK_REPLY);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a rate-limited request explains that the user should wait', async () => {
    responder = fail(429);
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a few minutes and try again.');
  });

  test('a safety reply from the backend is shown as a safety notice', async () => {
    responder = ok({ success: true, type: 'safety', reviewed: false, reply: 'Synthetic safety placeholder', mode: 'mock' });
    await renderPage();
    type('synthetic safety test');
    fireEvent.click(sendButton());
    const notice = await screen.findByTestId('safety-reply');
    expect(notice).toHaveTextContent('Safety notice');
    expect(notice).toHaveTextContent('Synthetic safety placeholder');
    expect(screen.queryByTestId('assistant-reply')).toBeNull();
  });

  test('starting a new session clears the messages, and a late reply is ignored', async () => {
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await within(log()).findByText(MOCK_REPLY);

    fireEvent.click(screen.getByRole('button', { name: 'Start a new session' }));
    expect(within(log()).queryByText(SYNTHETIC)).toBeNull();
    expect(within(log()).queryByText(MOCK_REPLY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Start a new session' })).toBeDisabled();

    // Clear while a reply is still on its way: it must not appear afterwards.
    const reply = deferred();
    responder = reply.responderFn;
    type('second synthetic message');
    fireEvent.click(sendButton());
    fireEvent.click(screen.getByRole('button', { name: 'Start a new session' }));
    reply.release();
    await waitFor(() => expect(chatRequests()).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(within(log()).queryByText(MOCK_REPLY)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(sendButton()).toBeDisabled(); // empty box after clearing
  });

  test('regression: the earlier question and answer are sent as context with a short reply', async () => {
    const QUESTION = 'Synthetic reply. When did the headache and dizziness start?';
    responder = ok({ success: true, type: 'message', reply: QUESTION, mode: 'mock' });
    await renderPage();
    type('I felt a little dizzy and had a little bit of a headache.');
    fireEvent.click(sendButton());
    await within(log()).findByText(QUESTION);

    responder = ok({ success: true, type: 'message', reply: 'Synthetic answer reply', mode: 'mock' });
    type('1 hour back');
    fireEvent.click(sendButton());
    await within(log()).findByText('Synthetic answer reply');

    expect(JSON.parse(chatRequests()[1].data)).toEqual({
      message: '1 hour back',
      history: [
        { role: 'user', content: 'I felt a little dizzy and had a little bit of a headache.' },
        { role: 'assistant', content: QUESTION },
      ],
    });
  });

  test(`only the last ${MAX_HISTORY_TURNS} turns are sent, and a new session clears the context`, async () => {
    let n = 0;
    responder = (config) => { n += 1; return ok({ success: true, type: 'message', reply: `Synthetic reply ${n}`, mode: 'mock' })(config); };
    await renderPage();
    for (let i = 1; i <= 7; i += 1) {
      type(`synthetic message ${i}`);
      fireEvent.click(sendButton());
      await within(log()).findByText(`Synthetic reply ${i}`);
    }
    const last = JSON.parse(chatRequests()[6].data);
    expect(last.history).toHaveLength(MAX_HISTORY_TURNS);
    expect(last.history[0]).toEqual({ role: 'user', content: 'synthetic message 2' });
    expect(last.history[MAX_HISTORY_TURNS - 1]).toEqual({ role: 'assistant', content: 'Synthetic reply 6' });

    fireEvent.click(screen.getByRole('button', { name: 'Start a new session' }));
    type('fresh synthetic message');
    fireEvent.click(sendButton());
    await within(log()).findByText('Synthetic reply 8');
    expect(JSON.parse(chatRequests()[7].data)).toEqual({ message: 'fresh synthetic message', history: [] });
  });

  test('a message that failed to send is not included in later context', async () => {
    responder = fail(500);
    await renderPage();
    type('first synthetic message');
    fireEvent.click(sendButton());
    await screen.findByRole('alert');

    responder = ok({ success: true, type: 'message', reply: MOCK_REPLY, mode: 'mock' });
    type('second synthetic message');
    fireEvent.click(sendButton());
    await within(log()).findByText(MOCK_REPLY);
    expect(JSON.parse(chatRequests()[1].data).history).toEqual([]);
  });

  test('historyFrom keeps role and text only, and always ends with a reply', () => {
    const messages = [
      { id: 1, role: 'user', text: 'a' },
      { id: 2, role: 'assistant', text: 'b', type: 'message' },
      { id: 3, role: 'user', text: 'c' },
    ];
    expect(historyFrom(messages)).toEqual([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]);
    expect(historyFrom([])).toEqual([]);
  });

  test('messages are never written to browser storage and are gone after a reload', async () => {
    const { unmount } = await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await within(log()).findByText(MOCK_REPLY);

    // Only the pre-existing sign-in name is in storage; nothing was written during the chat.
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(Object.keys(localStorage)).toEqual(['tokenUser']);
    expect(sessionStorage.length).toBe(0);

    unmount();
    await renderPage();
    expect(within(log()).queryByText(SYNTHETIC)).toBeNull();
    expect(within(log()).queryByText(MOCK_REPLY)).toBeNull();
  });
});

describe('AI Support eligibility and consent (Phase 2b)', () => {
  test('viewFor follows the backend status and fails closed on unknown reasons', () => {
    expect(viewFor(null)).toBe('loading');
    expect(viewFor(STATUS)).toBe('chat');
    expect(viewFor(withStatus({ eligible: false, eligibilityReason: 'attestation-required' }))).toBe('attest');
    expect(viewFor(withStatus({ eligible: false, eligibilityReason: 'attestation-outdated' }))).toBe('attest');
    expect(viewFor(withStatus({ eligible: false, eligibilityReason: 'under-18' }))).toBe('ineligible');
    expect(viewFor(withStatus({ eligible: false, eligibilityReason: 'something-new' }))).toBe('ineligible');
    expect(viewFor(withStatus({ consentRequired: true, consented: false }))).toBe('consent');
    expect(viewFor(withStatus({ consentRequired: true, consented: true }))).toBe('chat');
  });

  test('shows a loading state, then the chat; no consent screen in mock mode', async () => {
    renderRaw();
    expect(screen.getByRole('status')).toHaveTextContent('Checking AI Support access');
    await screen.findByLabelText('Your message');
    expect(screen.queryByRole('heading', { name: 'AI processing notice' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Confirm your age' })).toBeNull();
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`get ${STATUS_URL}`]);
  });

  test('adult attestation: explicit checkbox, Continue disabled until ticked, exact body, then the chat', async () => {
    statusResponder = ok(withStatus({ eligible: false, eligibilityReason: 'attestation-required' }));
    attestResponder = ok(STATUS);
    renderRaw();
    await screen.findByRole('heading', { name: 'Confirm your age' });
    expect(screen.getByText(/uses the age already recorded in your account/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Your message')).toBeNull();
    const checkbox = screen.getByLabelText('I confirm that I am 18 years of age or older.');
    const proceed = screen.getByRole('button', { name: 'Continue' });
    expect(checkbox).not.toBeChecked();
    expect(proceed).toBeDisabled();
    expect(screen.queryByRole('spinbutton')).toBeNull(); // no way to change the age here
    fireEvent.click(checkbox);
    expect(requests.filter((r) => r.url === ATTESTATION_URL)).toHaveLength(0); // ticking alone sends nothing
    expect(proceed).toBeEnabled();
    fireEvent.click(proceed);
    await screen.findByLabelText('Your message');
    const sent = requests.filter((r) => r.url === ATTESTATION_URL);
    expect(sent).toHaveLength(1);
    expect(bodyOf(sent[0])).toEqual({ confirmAdult: true });
  });

  test('an outdated attestation asks for a fresh confirmation', async () => {
    statusResponder = ok(withStatus({ eligible: false, eligibilityReason: 'attestation-outdated' }));
    renderRaw();
    await screen.findByRole('heading', { name: 'Confirm your age' });
    expect(screen.getByText(/has changed since you last confirmed/)).toBeInTheDocument();
  });

  test.each(['under-18', 'age-missing-or-invalid'])('%s: no chat, no confirmation, no way around it', async (reason) => {
    statusResponder = ok(withStatus({ eligible: false, eligibilityReason: reason }));
    renderRaw();
    await screen.findByRole('heading', { name: 'AI Support is not available' });
    expect(screen.getByText(/All other WellBridge features are still available/)).toBeInTheDocument();
    expect(screen.getByText(/If you are in immediate danger, contact your local emergency services/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See support options' })).toHaveAttribute('href', '/support');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByLabelText('Your message')).toBeNull();
  });

  test('a backend refusal during attestation shows what the backend now says', async () => {
    let calls = 0;
    statusResponder = (config) => {
      calls += 1;
      return ok(withStatus({ eligible: false, eligibilityReason: calls === 1 ? 'attestation-required' : 'under-18' }))(config);
    };
    attestResponder = fail(403, { success: false, code: 'AI_NOT_ELIGIBLE', reason: 'under-18', error: 'synthetic' });
    renderRaw();
    fireEvent.click(await screen.findByLabelText('I confirm that I am 18 years of age or older.'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'AI Support is not available' });
  });

  test('consent notice: shown only when required, labelled DRAFT, unticked, no automatic consent', async () => {
    statusResponder = ok(withStatus({ mode: 'claude', consentRequired: true }));
    consentResponder = ok(withStatus({ mode: 'claude', consentRequired: true, consented: true }));
    renderRaw();
    const heading = await screen.findByRole('heading', { name: 'AI processing notice' });
    const panel = heading.closest('section');
    expect(panel).toHaveTextContent(/DRAFT: awaiting approval by WellBridge's legal and privacy team/);
    expect(panel).toHaveTextContent('external AI provider');
    expect(panel).toHaveTextContent('WellBridge does not save your AI Support conversations');
    expect(panel).toHaveTextContent('applicable data-retention terms');
    expect(panel).toHaveTextContent('Please do not type names, contact details or private journal content');
    expect(panel).toHaveTextContent('It is not a crisis service and does not replace professional care');
    expect(panel).toHaveTextContent('You can withdraw your consent at any time');
    expect(panel).toHaveTextContent(`Notice version: ${NOTICE}`);
    expect(panel).not.toHaveTextContent(/zero data retention|never stored by|not retained|deleted immediately|\b\d+ days\b/i);
    expect(screen.queryByLabelText('Your message')).toBeNull();
    const checkbox = screen.getByLabelText(/I have read this notice and I agree/);
    const agree = screen.getByRole('button', { name: 'Agree and continue' });
    expect(checkbox).not.toBeChecked();
    expect(agree).toBeDisabled();
    fireEvent.click(checkbox);
    expect(requests.filter((r) => r.url === CONSENT_URL)).toHaveLength(0);
    fireEvent.click(agree);
    await screen.findByLabelText('Your message');
    const sent = requests.filter((r) => r.url === CONSENT_URL);
    expect(sent).toHaveLength(1);
    expect(bodyOf(sent[0])).toEqual({ noticeVersion: NOTICE }); // the version the backend sent
    expect(screen.getByRole('note')).toHaveTextContent('Replies are generated by an external AI provider.');
  });

  test('an outdated notice version reloads the notice and asks again', async () => {
    let calls = 0;
    statusResponder = (config) => {
      calls += 1;
      return ok(withStatus({ mode: 'claude', consentRequired: true, noticeVersion: calls === 1 ? NOTICE : 'wb-ai-notice-draft-2' }))(config);
    };
    consentResponder = fail(400, { success: false, code: 'AI_NOTICE_OUTDATED', noticeVersion: 'wb-ai-notice-draft-2', error: 'synthetic' });
    renderRaw();
    fireEvent.click(await screen.findByLabelText(/I have read this notice and I agree/));
    fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }));
    expect(await screen.findByText('Notice version: wb-ai-notice-draft-2')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('The notice has changed.');
    expect(screen.getByLabelText(/I have read this notice and I agree/)).not.toBeChecked();
  });

  test('withdrawal: DELETE with no body, explained honestly, then the consent notice returns', async () => {
    statusResponder = ok(withStatus({ mode: 'claude', consentRequired: true, consented: true }));
    withdrawResponder = ok(withStatus({ mode: 'claude', consentRequired: true, consented: false }));
    await renderPage();
    const panel = screen.getByRole('heading', { name: 'AI processing consent' }).closest('section');
    expect(panel).toHaveTextContent('stops future AI Support messages from being sent to an external AI provider');
    expect(panel).toHaveTextContent('It does not delete anything the provider has already processed');
    fireEvent.click(within(panel).getByRole('button', { name: 'Withdraw consent' }));
    await screen.findByRole('heading', { name: 'AI processing notice' });
    expect(screen.queryByLabelText('Your message')).toBeNull();
    const sent = requests.filter((r) => r.method === 'delete');
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(CONSENT_URL);
    expect(sent[0].data).toBeUndefined();
  });

  test('in mock mode, withdrawing keeps the practice chat available', async () => {
    statusResponder = ok(withStatus({ consented: true }));
    withdrawResponder = ok(STATUS);
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Withdraw consent' })).toBeNull());
    expect(box()).toBeInTheDocument();
  });

  test('chat AI_NOT_ELIGIBLE or AI_CONSENT_REQUIRED re-reads status and shows the required screen', async () => {
    let next = withStatus({ eligible: false, eligibilityReason: 'attestation-outdated' });
    let calls = 0;
    statusResponder = (config) => { calls += 1; return ok(calls === 1 ? STATUS : next)(config); };
    responder = fail(403, { success: false, code: 'AI_NOT_ELIGIBLE', reason: 'attestation-outdated', error: 'synthetic' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await screen.findByRole('heading', { name: 'Confirm your age' });
    expect(screen.queryByText(SYNTHETIC)).toBeNull();

    // Consent required: a fresh page whose status later asks for consent.
    calls = 0;
    next = withStatus({ mode: 'claude', consentRequired: true });
    statusResponder = (config) => { calls += 1; return ok(calls === 1 ? withStatus({ mode: 'claude', consentRequired: true, consented: true }) : next)(config); };
    responder = fail(403, { success: false, code: 'AI_CONSENT_REQUIRED', noticeVersion: NOTICE, error: 'synthetic' });
    document.body.innerHTML = '';
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await screen.findByRole('heading', { name: 'AI processing notice' });
  });

  test('replies: practice vs external AI labels, and declined replies are not shown as ordinary replies', async () => {
    statusResponder = ok(withStatus({ mode: 'claude', consentRequired: true, consented: true }));
    responder = ok({ success: true, type: 'message', reply: 'Synthetic external reply', mode: 'claude' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    expect(await screen.findByTestId('assistant-reply')).toHaveTextContent('AI-generated reply (external AI provider)');
    expect(screen.getByTestId('assistant-reply')).not.toHaveTextContent('practice reply');

    responder = ok({ success: true, type: 'declined', reply: 'Synthetic decline text', mode: 'claude' });
    type('write me some code');
    fireEvent.click(sendButton());
    const declined = await screen.findByTestId('declined-reply');
    expect(declined).toHaveTextContent('Outside what AI Support can help with');
    expect(screen.getAllByTestId('assistant-reply')).toHaveLength(1);
  });

  test('503 shows the fixed unavailable text; 401 says the session ended; a timeout is explained', async () => {
    responder = fail(503, { success: false, type: 'unavailable', error: 'Synthetic fixed unavailable text', mode: 'claude' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic fixed unavailable text');
    expect(screen.queryByTestId('assistant-reply')).toBeNull();
    expect(box()).toHaveValue(SYNTHETIC);

    responder = fail(401);
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your session has ended. Please sign in again.'));

    responder = (config) => { const e = new Error('timeout'); e.code = 'ECONNABORTED'; e.config = config; throw e; };
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('took too long to reply'));
  });

  test('an unexpected reply shape is treated as an error, not shown', async () => {
    responder = ok({ success: true, type: 'something-else', reply: 'Synthetic odd reply', mode: 'mock' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await screen.findByRole('alert');
    expect(screen.queryByText('Synthetic odd reply')).toBeNull();
  });

  test('a status failure offers a retry; nothing is stored in the browser; no identity in any request', async () => {
    statusResponder = fail(500);
    renderRaw();
    expect(await screen.findByRole('alert')).toHaveTextContent('AI Support could not be loaded.');
    expect(screen.queryByLabelText('Your message')).toBeNull();
    statusResponder = ok(withStatus({ eligible: false, eligibilityReason: 'attestation-required' }));
    attestResponder = ok(withStatus({ mode: 'claude', consentRequired: true }));
    consentResponder = ok(withStatus({ mode: 'claude', consentRequired: true, consented: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(await screen.findByLabelText('I confirm that I am 18 years of age or older.'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByLabelText(/I have read this notice and I agree/));
    fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }));
    await screen.findByLabelText('Your message');

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(Object.keys(localStorage)).toEqual(['tokenUser']);
    expect(sessionStorage.length).toBe(0);
    for (const r of requests) {
      const text = r.data === undefined ? '' : String(r.data);
      expect(text).not.toMatch(/testuser|userId|username|"age"/);
    }
  });
});

// Local mode (development only): a llama.cpp model on the WellBridge server.
// Shapes match backend/routes/assistantRoutes.js with ASSISTANT_MODE=local.
const LOCAL_NOTICE_VERSION = 'wb-ai-local-notice-draft-1';
const LOCAL_STATUS = { mode: 'local', consentRequired: true, noticeVersion: LOCAL_NOTICE_VERSION };

describe('WellBridge AI Support page in local-model mode', () => {
  test('chat timeout: 130 s only when the status confirms local mode; mock and claude keep 45 s', async () => {
    expect(CHAT_TIMEOUT_MS).toBe(45000);
    expect(LOCAL_CHAT_TIMEOUT_MS).toBe(130000);
    expect(chatTimeoutFor(withStatus({ mode: 'local' }))).toBe(LOCAL_CHAT_TIMEOUT_MS);
    for (const status of [withStatus({ mode: 'mock' }), withStatus({ mode: 'claude' }), withStatus({ mode: 'LOCAL' }),
      withStatus({ mode: 'unknown' }), null, undefined, {}]) {
      expect(chatTimeoutFor(status)).toBe(CHAT_TIMEOUT_MS);
    }

    statusResponder = ok(withStatus({ ...LOCAL_STATUS, consented: true }));
    responder = ok({ success: true, type: 'message', reply: 'Synthetic local reply', mode: 'local' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await screen.findByTestId('assistant-reply');
    expect(chatRequests()).toHaveLength(1);
    expect(chatRequests()[0].timeout).toBe(LOCAL_CHAT_TIMEOUT_MS);
  });

  test('claude mode (still locked on the server) keeps the 45 s chat timeout', async () => {
    statusResponder = ok(withStatus({ mode: 'claude', consentRequired: true, consented: true }));
    responder = ok({ success: true, type: 'message', reply: 'Synthetic external reply', mode: 'claude' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    await screen.findByTestId('assistant-reply');
    expect(chatRequests()).toHaveLength(1);
    expect(chatRequests()[0].timeout).toBe(CHAT_TIMEOUT_MS);
  });

  test('local consent notice: own wording and version, DRAFT, unticked, no external-provider claims', async () => {
    statusResponder = ok(withStatus(LOCAL_STATUS));
    consentResponder = ok(withStatus({ ...LOCAL_STATUS, consented: true }));
    renderRaw();
    const panel = (await screen.findByRole('heading', { name: 'AI processing notice' })).closest('section');
    expect(panel).toHaveTextContent(/DRAFT: awaiting approval by WellBridge's legal and privacy team/);
    expect(panel).toHaveTextContent('processed by an AI model that runs on the WellBridge server itself');
    expect(panel).toHaveTextContent('they are not sent to an external AI company');
    expect(panel).toHaveTextContent('may be inaccurate or unsuitable');
    expect(panel).toHaveTextContent('Please do not type names, contact details or private journal content');
    expect(panel).toHaveTextContent('It is not a crisis service and does not replace professional care');
    expect(panel).toHaveTextContent('You can withdraw your consent at any time');
    expect(panel).toHaveTextContent(`Notice version: ${LOCAL_NOTICE_VERSION}`);
    expect(panel).not.toHaveTextContent(/Anthropic|sent to an external AI provider|data-retention terms/);
    expect(panel).not.toHaveTextContent(/zero data retention|never stored by|not retained|deleted immediately|\b\d+ days\b/i);
    expect(screen.queryByLabelText('Your message')).toBeNull();

    const checkbox = screen.getByLabelText('I have read this notice and I agree that my AI Support messages may be processed by the local AI model as described.');
    const agree = screen.getByRole('button', { name: 'Agree and continue' });
    expect(checkbox).not.toBeChecked();
    expect(agree).toBeDisabled();
    fireEvent.click(checkbox);
    expect(requests.filter((r) => r.url === CONSENT_URL)).toHaveLength(0);
    fireEvent.click(agree);
    await screen.findByLabelText('Your message');
    const sent = requests.filter((r) => r.url === CONSENT_URL);
    expect(sent).toHaveLength(1);
    expect(bodyOf(sent[0])).toEqual({ noticeVersion: LOCAL_NOTICE_VERSION });
    expect(screen.getByRole('note')).toHaveTextContent('Replies are generated by an AI model running on the WellBridge server.');
    expect(screen.getByRole('note')).not.toHaveTextContent('external AI provider');
  });

  test('local replies are labelled as local AI, not practice or external; declined and safety keep their labels', async () => {
    statusResponder = ok(withStatus({ ...LOCAL_STATUS, consented: true }));
    responder = ok({ success: true, type: 'message', reply: 'Synthetic local reply', mode: 'local' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    const reply = await screen.findByTestId('assistant-reply');
    expect(reply).toHaveTextContent('AI-generated reply (local AI model)');
    expect(reply).not.toHaveTextContent(/practice reply|external AI provider/);

    responder = ok({ success: true, type: 'declined', reply: 'Synthetic decline text', mode: 'local' });
    type('write me some code');
    fireEvent.click(sendButton());
    expect(await screen.findByTestId('declined-reply')).toHaveTextContent('Outside what AI Support can help with');

    responder = ok({ success: true, type: 'safety', reviewed: false, reply: 'Synthetic safety placeholder', mode: 'local' });
    type('synthetic flagged wording');
    fireEvent.click(sendButton());
    expect(await screen.findByTestId('safety-reply')).toHaveTextContent('Safety notice');
  });

  test('local withdrawal: DELETE with no body, local wording, then the local notice returns', async () => {
    statusResponder = ok(withStatus({ ...LOCAL_STATUS, consented: true }));
    withdrawResponder = ok(withStatus(LOCAL_STATUS));
    await renderPage();
    const panel = screen.getByRole('heading', { name: 'AI processing consent' }).closest('section');
    expect(panel).toHaveTextContent(`version ${LOCAL_NOTICE_VERSION}`);
    expect(panel).toHaveTextContent('stops future AI Support messages from being processed by the local AI model');
    expect(panel).not.toHaveTextContent('external AI provider');
    fireEvent.click(within(panel).getByRole('button', { name: 'Withdraw consent' }));
    await screen.findByText(`Notice version: ${LOCAL_NOTICE_VERSION}`);
    const sent = requests.filter((r) => r.method === 'delete');
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toBeUndefined();
  });

  test('a local 503 shows the backend\'s fixed unavailable text and keeps the message for retry', async () => {
    statusResponder = ok(withStatus({ ...LOCAL_STATUS, consented: true }));
    responder = fail(503, { success: false, type: 'unavailable', error: 'Synthetic fixed unavailable text', mode: 'local' });
    await renderPage();
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic fixed unavailable text');
    expect(screen.queryByTestId('assistant-reply')).toBeNull();
    expect(box()).toHaveValue(SYNTHETIC);
  });

  test('an unknown non-mock mode keeps the external-provider wording (fails safe)', async () => {
    statusResponder = ok(withStatus({ mode: 'something-new', consentRequired: true, consented: true }));
    responder = ok({ success: true, type: 'message', reply: 'Synthetic other reply', mode: 'something-new' });
    await renderPage();
    expect(screen.getByRole('note')).toHaveTextContent('Replies are generated by an external AI provider.');
    type(SYNTHETIC);
    fireEvent.click(sendButton());
    expect(await screen.findByTestId('assistant-reply')).toHaveTextContent('AI-generated reply (external AI provider)');
  });

  test('the frontend never refers to the local model server, its address or its key', () => {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(full);
      }
    };
    walk(__dirname);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect({ file, hit: /127\.0\.0\.1|\[::1\]|:8080|LOCAL_MODEL|llama|chat\/completions/i.test(source) }).toEqual({ file, hit: false });
    }
  });
});
