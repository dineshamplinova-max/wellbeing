import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Navbar from '../navbar/Navbar';
import { FaPaperPlane, FaInfoCircle, FaRedo } from 'react-icons/fa';
import './Therapist.css';

// WellBridge AI Support page.
//
// The backend is the source of truth for who may use AI Support. On load the
// page asks GET /api/assistant/status and shows one of: the age confirmation
// (self-declared 18+, separate from consent), a not-eligible notice, the AI
// processing notice (only when the backend says external-provider consent is
// required), or the chat. Nothing about eligibility or consent is kept in the
// browser, and messages live only in this page's memory: they are never put
// in browser storage and disappear on reload or a new session. Only the new
// message and the recent turns of this session are sent; identity always
// comes from the session cookie.

const API_BASE = 'http://localhost:8000/api/assistant';
export const CHAT_URL = `${API_BASE}/chat`;
export const STATUS_URL = `${API_BASE}/status`;
export const ATTESTATION_URL = `${API_BASE}/attestation`;
export const CONSENT_URL = `${API_BASE}/consent`;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_TURNS = 10;
// Longer than the backend's worst case for an external provider (about 40 s).
export const CHAT_TIMEOUT_MS = 45000;
// Local development mode only (a slow on-device model): longer than the
// backend's 120 s local limit. Used only when the status confirms local mode.
export const LOCAL_CHAT_TIMEOUT_MS = 130000;
export const chatTimeoutFor = (status) => (status && isLocal(status.mode) ? LOCAL_CHAT_TIMEOUT_MS : CHAT_TIMEOUT_MS);

// The consent wording below is a DRAFT. It must be replaced with the text
// approved by WellBridge's legal and privacy team before live AI is enabled.
export const NOTICE_IS_DRAFT = true;

// Earlier turns of this session, oldest first, ending with a reply, as the backend expects.
export const historyFrom = (messages) => {
  const turns = messages.map((m) => ({ role: m.role, content: m.text }));
  while (turns.length && turns[turns.length - 1].role !== 'assistant') turns.pop();
  return turns.slice(-MAX_HISTORY_TURNS);
};

export const DISCLAIMER = 'WellBridge AI Support is an automated support tool, not a licensed therapist or medical '
  + 'professional. It does not provide diagnoses or replace professional care.';

const EMERGENCY_TEXT = 'If you are in immediate danger, contact your local emergency services.';
const REPLY_TYPES = new Set(['message', 'declined', 'safety']);
const isMock = (mode) => mode === 'mock';
// Local mode: a development-only AI model on the WellBridge server itself. Any
// other non-mock mode keeps the external-provider wording (fails safe).
const isLocal = (mode) => mode === 'local';

const isValidStatus = (s) => Boolean(s) && typeof s === 'object'
  && typeof s.mode === 'string' && typeof s.eligible === 'boolean' && typeof s.consentRequired === 'boolean'
  && typeof s.consented === 'boolean' && typeof s.noticeVersion === 'string';

// Which screen a backend status calls for. Anything unexpected fails closed.
export const viewFor = (status) => {
  if (!status) return 'loading';
  if (!status.eligible) {
    const reason = status.eligibilityReason;
    return reason === 'attestation-required' || reason === 'attestation-outdated' ? 'attest' : 'ineligible';
  }
  if (status.consentRequired && !status.consented) return 'consent';
  return 'chat';
};

const serverText = (error) => {
  const text = error?.response?.data?.error;
  return typeof text === 'string' && text.length <= 400 ? text : null;
};
const isTimeout = (error) => error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
const SESSION_ENDED = 'Your session has ended. Please sign in again.';

const chatErrorFor = (error) => {
  const status = error?.response?.status;
  if (isTimeout(error)) return 'WellBridge AI Support took too long to reply. Please try again.';
  if (status === 401) return SESSION_ENDED;
  if (status === 429) return 'You have sent a lot of messages in a short time. Please wait a few minutes and try again.';
  if (status === 503) return serverText(error) || 'WellBridge AI Support is temporarily unavailable. Please try again in a few minutes.';
  if (status === 400) return serverText(error) || 'That message could not be sent. Please check it and try again.';
  return 'Your message could not be sent. Please check your connection and try again.';
};

const settingsErrorFor = (error) => {
  const status = error?.response?.status;
  if (status === 401) return SESSION_ENDED;
  if (status === 429) return 'Too many requests. Please wait a few minutes and try again.';
  return 'That could not be saved. Please check your connection and try again.';
};

const replyLabel = (m) => {
  if (m.type === 'safety') return 'Safety notice';
  if (m.type === 'declined') return "Outside what AI Support can help with";
  if (isMock(m.mode)) return 'WellBridge AI Support (practice reply)';
  return isLocal(m.mode) ? 'AI-generated reply (local AI model)' : 'AI-generated reply (external AI provider)';
};

const Checkbox = ({ id, checked, onChange, disabled, children }) => (
  <label htmlFor={id} className="mt-4 flex cursor-pointer items-start gap-3 rounded-wb border border-wb-border bg-wb-surface p-3">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="mt-1 rounded text-wb-primary focus:ring-wb-primary"
    />
    <span>{children}</span>
  </label>
);

const AttestationPanel = ({ outdated, busy, error, onConfirm }) => {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section aria-labelledby="ai-support-age" className="wb-card mt-4">
      <h2 id="ai-support-age" className="wb-h3">Confirm your age</h2>
      <p className="mt-2">WellBridge AI Support is only for adults aged 18 or over.</p>
      <p className="mt-2 text-wb-muted">
        This check uses the age already recorded in your account. Confirming here does not change it.
        {outdated && ' The age recorded in your account has changed since you last confirmed, so please confirm again.'}
      </p>
      <p className="mt-2 text-sm text-wb-muted">This is a self-declaration. WellBridge does not verify your identity or age.</p>
      <Checkbox id="ai-support-adult" checked={confirmed} onChange={setConfirmed} disabled={busy}>
        I confirm that I am 18 years of age or older.
      </Checkbox>
      {error && <p role="alert" className="wb-error mt-3">{error}</p>}
      <button type="button" onClick={onConfirm} disabled={!confirmed || busy} className="wb-btn wb-btn-primary mt-4">
        {busy ? 'Saving…' : 'Continue'}
      </button>
    </section>
  );
};

const IneligiblePanel = ({ reason }) => (
  <section aria-labelledby="ai-support-ineligible" className="wb-card mt-4">
    <h2 id="ai-support-ineligible" className="wb-h3">AI Support is not available</h2>
    <p className="mt-2">
      {reason === 'under-18'
        ? 'WellBridge AI Support is available only to adults aged 18 or over. It uses the age recorded in your account, and that age is under 18.'
        : 'WellBridge AI Support is available only to adults aged 18 or over, based on the age recorded in your account. Your account does not have a valid age recorded.'}
    </p>
    <p className="mt-2 text-wb-muted">All other WellBridge features are still available to you.</p>
    <p className="mt-2 font-semibold">{EMERGENCY_TEXT}</p>
    <p className="mt-3"><a href="/support" className="wb-link">See support options</a></p>
  </section>
);

const EXTERNAL_NOTICE = [
  'When you use AI Support, the message you type and recent messages from this conversation are sent to an external AI provider (Anthropic) to generate a reply.',
  'WellBridge does not save your AI Support conversations. They disappear when you start a new session, reload or leave this page.',
  'The provider processes what you send under its applicable data-retention terms. The final notice will describe those terms once WellBridge\'s privacy team has confirmed them.',
];
const LOCAL_NOTICE = [
  'When you use AI Support, the message you type and recent messages from this conversation are processed by an AI model that runs on the WellBridge server itself to generate a reply. In this mode they are not sent to an external AI company.',
  'WellBridge does not save your AI Support conversations. They disappear when you start a new session, reload or leave this page.',
  'Replies are generated automatically by a small AI model and may be inaccurate or unsuitable. They are checked by automatic rules, not by a person.',
];

const ConsentPanel = ({ mode, noticeVersion, busy, error, onAgree }) => {
  const [agreed, setAgreed] = useState(false);
  const local = isLocal(mode);
  return (
    <section aria-labelledby="ai-support-notice" className="wb-card mt-4">
      <h2 id="ai-support-notice" className="wb-h3">AI processing notice</h2>
      {NOTICE_IS_DRAFT && (
        <p className="mt-2 rounded-wb border border-wb-border bg-wb-subtle p-3 text-sm font-semibold">
          DRAFT: awaiting approval by WellBridge&apos;s legal and privacy team. For development and testing only; this is not a final legal notice.
        </p>
      )}
      <ul className="mt-3 list-disc space-y-2 pl-5">
        {(local ? LOCAL_NOTICE : EXTERNAL_NOTICE).map((item) => <li key={item}>{item}</li>)}
        <li>Your username, email address, age and other account details are not sent. Please do not type names, contact details or private journal content into AI Support.</li>
        <li>AI Support is an automated tool. It is not a crisis service and does not replace professional care. {EMERGENCY_TEXT}</li>
        <li>You can withdraw your consent at any time on this page.</li>
      </ul>
      <p className="mt-3 text-sm text-wb-muted">Notice version: {noticeVersion}</p>
      <Checkbox id="ai-support-consent" checked={agreed} onChange={setAgreed} disabled={busy}>
        {local
          ? 'I have read this notice and I agree that my AI Support messages may be processed by the local AI model as described.'
          : 'I have read this notice and I agree that my AI Support messages may be sent to an external AI provider as described.'}
      </Checkbox>
      <p className="mt-2 text-sm text-wb-muted">If you do not agree, AI Support stays off. All other WellBridge features are still available.</p>
      {error && <p role="alert" className="wb-error mt-3">{error}</p>}
      <button type="button" onClick={onAgree} disabled={!agreed || busy} className="wb-btn wb-btn-primary mt-4">
        {busy ? 'Saving…' : 'Agree and continue'}
      </button>
    </section>
  );
};

const WithdrawPanel = ({ mode, noticeVersion, busy, error, onWithdraw }) => (
  <section aria-labelledby="ai-support-withdraw" className="wb-card mt-4">
    <h2 id="ai-support-withdraw" className="wb-h3">AI processing consent</h2>
    <p className="mt-2 text-wb-muted">
      You agreed to the AI processing notice (version {noticeVersion}).
      {isLocal(mode)
        ? ' Withdrawing stops future AI Support messages from being processed by the local AI model.'
        : ' Withdrawing stops future AI Support messages from being sent to an external AI provider. It does not delete anything the provider has already processed under its terms.'}
      {isMock(mode) && ' Practice replies are not affected.'}
    </p>
    {error && <p role="alert" className="wb-error mt-3">{error}</p>}
    <button type="button" onClick={onWithdraw} disabled={busy} className="wb-btn wb-btn-secondary mt-4">
      {busy ? 'Saving…' : 'Withdraw consent'}
    </button>
  </section>
);

const Therapist = () => {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // Synchronous guards: stop double submissions and ignore replies from a cleared session.
  const sendingRef = useRef(false);
  const settingsRef = useRef(false);
  const sessionRef = useRef(0);
  const statusRequestRef = useRef(0);
  const nextIdRef = useRef(0);
  const mountedRef = useRef(true);
  const endRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, pending]);

  // Clears everything in memory and ignores any reply still on its way.
  const resetConversation = useCallback(() => {
    sessionRef.current += 1;
    sendingRef.current = false;
    setPending(false);
    setMessages([]);
    setDraft('');
    setError('');
  }, []);

  const applyStatus = useCallback((next) => {
    if (!isValidStatus(next)) throw new Error('Unexpected status');
    setStatus(next);
    setStatusError('');
    if (viewFor(next) !== 'chat') resetConversation();
  }, [resetConversation]);

  const loadStatus = useCallback(async () => {
    const request = ++statusRequestRef.current;
    try {
      const { data } = await axios.get(STATUS_URL);
      if (mountedRef.current && request === statusRequestRef.current) applyStatus(data);
    } catch (err) {
      if (!mountedRef.current || request !== statusRequestRef.current) return;
      setStatus(null);
      resetConversation();
      setStatusError(err?.response?.status === 401 ? SESSION_ENDED : 'AI Support could not be loaded. Please check your connection and try again.');
    }
  }, [applyStatus, resetConversation]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Attestation, consent and withdrawal: one at a time, and the backend's reply is the new status.
  const runSetting = async (request, onError) => {
    if (settingsRef.current) return;
    settingsRef.current = true;
    setSettingsBusy(true);
    setSettingsError('');
    try {
      const { data } = await request();
      if (mountedRef.current) applyStatus(data);
    } catch (err) {
      if (mountedRef.current) onError(err);
    } finally {
      settingsRef.current = false;
      if (mountedRef.current) setSettingsBusy(false);
    }
  };

  const confirmAdult = () => runSetting(
    () => axios.post(ATTESTATION_URL, { confirmAdult: true }),
    (err) => {
      const code = err?.response?.data?.code;
      if (code === 'AI_NOT_ELIGIBLE' || code === 'AI_PROFILE_CHANGED') loadStatus();
      setSettingsError(code === 'AI_PROFILE_CHANGED'
        ? 'Your account details changed. Please review this page and confirm again.'
        : code === 'AI_NOT_ELIGIBLE' ? '' : settingsErrorFor(err));
    },
  );

  const agreeToNotice = () => runSetting(
    () => axios.post(CONSENT_URL, { noticeVersion: status.noticeVersion }),
    (err) => {
      const code = err?.response?.data?.code;
      if (code === 'AI_NOTICE_OUTDATED' || code === 'AI_NOT_ELIGIBLE') loadStatus();
      setSettingsError(code === 'AI_NOTICE_OUTDATED'
        ? 'The notice has changed. Please read the current version before agreeing.'
        : code === 'AI_NOT_ELIGIBLE' ? '' : settingsErrorFor(err));
    },
  );

  const withdrawConsent = () => runSetting(
    () => axios.delete(CONSENT_URL),
    (err) => setSettingsError(settingsErrorFor(err)),
  );

  const send = async () => {
    const text = draft;
    if (sendingRef.current || !text.trim() || viewFor(status) !== 'chat') return;
    sendingRef.current = true;
    setPending(true);
    setError('');
    const session = sessionRef.current;
    const history = historyFrom(messages);
    const userMessage = { id: nextIdRef.current++, role: 'user', text };
    setMessages((current) => [...current, userMessage]);
    setDraft('');

    try {
      const { data } = await axios.post(CHAT_URL, { message: text, history }, { timeout: chatTimeoutFor(status) });
      if (!data || !REPLY_TYPES.has(data.type) || typeof data.reply !== 'string') throw new Error('Unexpected reply');
      if (sessionRef.current !== session) return;
      setMessages((current) => [...current, {
        id: nextIdRef.current++,
        role: 'assistant',
        text: data.reply,
        type: data.type,
        mode: data.mode,
      }]);
    } catch (err) {
      if (sessionRef.current !== session) return;
      // Take the unsent message back out and return it to the box so it can be retried.
      setMessages((current) => current.filter((m) => m.id !== userMessage.id));
      setDraft(text);
      setError(chatErrorFor(err));
      // Eligibility or consent changed on the server: show what it now requires.
      const code = err?.response?.data?.code;
      if (code === 'AI_NOT_ELIGIBLE' || code === 'AI_CONSENT_REQUIRED') loadStatus();
    } finally {
      if (sessionRef.current === session) {
        sendingRef.current = false;
        setPending(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send();
  };

  // Enter sends; Shift+Enter adds a new line (and nothing is sent mid-composition).
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const view = viewFor(status);
  const canSend = !pending && draft.trim().length > 0;

  return (
    <div className="min-h-screen bg-wb-bg text-wb-text">
      <Navbar />
      <main className="wb-container max-w-3xl pb-12 pt-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="wb-h2">WellBridge AI Support</h1>
          {view === 'chat' && (
            <button
              type="button"
              onClick={resetConversation}
              disabled={messages.length === 0 && !draft && !error}
              className="wb-btn wb-btn-secondary self-start sm:self-auto"
            >
              <FaRedo aria-hidden="true" className="mr-2" />
              Start a new session
            </button>
          )}
        </div>

        <div role="note" className="wb-card mt-4 flex items-start gap-3">
          <FaInfoCircle aria-hidden="true" className="mt-1 h-5 w-5 flex-shrink-0 text-wb-primary" />
          <div className="space-y-2">
            <p className="font-semibold">{DISCLAIMER}</p>
            {status && isMock(status.mode) && (
              <p className="text-sm text-wb-muted">
                This early version uses practice replies. It is not connected to a real AI service yet. Your messages are
                not saved: they disappear when you start a new session, reload or leave this page.
              </p>
            )}
            {status && isLocal(status.mode) && (
              <p className="text-sm text-wb-muted">
                Replies are generated by an AI model running on the WellBridge server. WellBridge does not save your
                messages: they disappear when you start a new session, reload or leave this page.
              </p>
            )}
            {status && !isMock(status.mode) && !isLocal(status.mode) && (
              <p className="text-sm text-wb-muted">
                Replies are generated by an external AI provider. WellBridge does not save your messages: they disappear
                when you start a new session, reload or leave this page.
              </p>
            )}
          </div>
        </div>

        {view === 'loading' && !statusError && (
          <p role="status" className="mt-4 text-wb-muted">Checking AI Support access…</p>
        )}
        {view === 'loading' && statusError && (
          <div className="wb-card mt-4">
            <p role="alert" className="wb-error">{statusError}</p>
            <button type="button" onClick={loadStatus} className="wb-btn wb-btn-secondary mt-3">Try again</button>
          </div>
        )}

        {view === 'attest' && (
          <AttestationPanel
            outdated={status.eligibilityReason === 'attestation-outdated'}
            busy={settingsBusy}
            error={settingsError}
            onConfirm={confirmAdult}
          />
        )}

        {view === 'ineligible' && <IneligiblePanel reason={status.eligibilityReason} />}

        {view === 'consent' && (
          <ConsentPanel
            key={status.noticeVersion}
            mode={status.mode}
            noticeVersion={status.noticeVersion}
            busy={settingsBusy}
            error={settingsError}
            onAgree={agreeToNotice}
          />
        )}

        {view === 'chat' && (
          <>
            <section aria-labelledby="ai-support-conversation" className="wb-card mt-4">
              <h2 id="ai-support-conversation" className="sr-only">Conversation</h2>
              <div role="log" aria-live="polite" aria-label="Conversation" className="max-h-[28rem] min-h-[12rem] space-y-3 overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-wb-muted">Messages you send appear here. Nothing is saved.</p>
                )}
                {messages.map((m) => (m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-wb bg-wb-primary-soft px-4 py-2">
                      <span className="sr-only">You said: </span>
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-start">
                    <div
                      className={`max-w-[85%] rounded-wb border px-4 py-2 ${
                        m.type === 'message' ? 'border-wb-border bg-wb-surface' : 'border-wb-primary bg-wb-surface'
                      }`}
                      data-testid={m.type === 'safety' ? 'safety-reply' : m.type === 'declined' ? 'declined-reply' : 'assistant-reply'}
                    >
                      <p className="text-xs font-semibold text-wb-muted">{replyLabel(m)}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  </div>
                )))}
                <div ref={endRef} />
              </div>
              {pending && <p role="status" className="mt-3 text-sm text-wb-muted">WellBridge AI Support is replying…</p>}
            </section>

            {error && <p role="alert" className="wb-error mt-3">{error}</p>}

            <form onSubmit={handleSubmit} className="mt-4">
              <label htmlFor="ai-support-message" className="wb-label">Your message</label>
              <textarea
                id="ai-support-message"
                rows={3}
                value={draft}
                maxLength={MAX_MESSAGE_LENGTH}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-describedby="ai-support-help"
                className="wb-input"
                placeholder="Type your message"
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p id="ai-support-help" className="wb-help">
                  Press Enter to send, or Shift+Enter for a new line. {draft.length}/{MAX_MESSAGE_LENGTH} characters
                </p>
                <button type="submit" disabled={!canSend} className="wb-btn wb-btn-primary">
                  <span>{pending ? 'Sending…' : 'Send'}</span>
                  <FaPaperPlane aria-hidden="true" className="ml-2 h-4 w-4" />
                </button>
              </div>
            </form>
          </>
        )}

        {/* Withdrawal stays reachable whenever consent is on record, even if the
            user has since become ineligible (for example after an age edit). */}
        {status?.consented && (
          <WithdrawPanel
            mode={status.mode}
            noticeVersion={status.noticeVersion}
            busy={settingsBusy}
            error={view === 'chat' || view === 'ineligible' ? settingsError : ''}
            onWithdraw={withdrawConsent}
          />
        )}
      </main>
    </div>
  );
};

export default Therapist;
