import React from 'react';
import { FaCheck } from 'react-icons/fa';
import { acknowledgement, answerLabel } from './quizEngine';

// Native radio and checkbox inputs stay in the tab order (sr-only, not
// display:none); the card next to each one shows its checked and focus state.
const optionCard = 'flex items-center gap-3 rounded-wb border-2 border-wb-border bg-wb-surface px-4 py-3 text-wb-text shadow-wb-sm transition '
  + 'peer-checked:border-wb-primary peer-checked:bg-wb-primary-soft peer-focus-visible:ring-2 peer-focus-visible:ring-wb-primary peer-focus-visible:ring-offset-2 '
  + 'peer-disabled:cursor-not-allowed peer-disabled:opacity-50';

const SLIDER_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];

const Marker = ({ checked, square }) => (
  <span
    aria-hidden="true"
    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center border-2 ${square ? 'rounded' : 'rounded-full'} ${checked ? 'border-wb-primary bg-wb-primary text-white' : 'border-wb-control'}`}
  >
    {checked && <FaCheck className="h-2.5 w-2.5" />}
  </span>
);

const OptionList = ({ name, options, isChecked, onToggle, type, isDisabled = () => false }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {options.map((option) => {
      const checked = isChecked(option.value);
      return (
        <label key={String(option.value)} className="relative block cursor-pointer">
          <input
            type={type}
            name={name}
            value={option.value}
            checked={checked}
            disabled={isDisabled(option.value, checked)}
            onChange={() => onToggle(option.value)}
            className="peer sr-only"
          />
          <span className={optionCard}>
            <Marker checked={checked} square={type === 'checkbox'} />
            <span>{option.label}</span>
          </span>
        </label>
      );
    })}
  </div>
);

const SliderInput = ({ question, value, onChange, headingId }) => {
  const answered = typeof value === 'number';
  const shown = answered ? value : (question.min + question.max) / 2;
  // Any interaction with the slider (dragging, clicking or its own keys) answers
  // it. Tabbing onto it does not.
  const commit = (event) => onChange(Number(event.target.value));
  const commitKey = (event) => { if (SLIDER_KEYS.includes(event.key)) commit(event); };
  return (
    <div>
      <div className="flex items-baseline justify-center gap-2" aria-live="polite">
        <span className="text-5xl font-bold tabular-nums text-wb-text">{answered ? shown : '–'}</span>
        <span className="text-wb-muted">{question.unit || `/ ${question.max}`}</span>
      </div>
      <input
        type="range"
        min={question.min}
        max={question.max}
        step={question.step || 1}
        value={shown}
        onChange={commit}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commitKey}
        aria-labelledby={headingId}
        aria-valuetext={answered ? answerLabel(question, value) : 'Not answered yet'}
        className="mt-4 w-full cursor-pointer accent-wb-primary"
        data-testid={`slider-${question.id}`}
      />
      <div className="mt-1 flex justify-between text-sm text-wb-muted" aria-hidden="true">
        <span>{question.minLabel}</span>
        <span>{question.maxLabel}</span>
      </div>
      {!answered && <p className="wb-help text-center">Move the slider or use the arrow keys to answer.</p>}
    </div>
  );
};

export const AnswerInput = ({ question, value, onChange, headingId }) => {
  const name = `quiz-${question.id}`;
  switch (question.type) {
    case 'scale':
      return (
        <fieldset aria-labelledby={headingId}>
          <OptionList
            type="radio"
            name={name}
            options={question.options.map((label, index) => ({ value: index, label }))}
            isChecked={(v) => value === v}
            onToggle={onChange}
          />
        </fieldset>
      );
    case 'choice':
      return (
        <fieldset aria-labelledby={headingId}>
          <OptionList type="radio" name={name} options={question.options} isChecked={(v) => value === v} onToggle={onChange} />
        </fieldset>
      );
    case 'multi': {
      const selected = Array.isArray(value) ? value : [];
      const full = selected.length >= question.maxSelections;
      return (
        <fieldset aria-labelledby={headingId}>
          <OptionList
            type="checkbox"
            name={name}
            options={question.options}
            isChecked={(v) => selected.includes(v)}
            isDisabled={(v, checked) => full && !checked}
            onToggle={(v) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])}
          />
          <p className="wb-help" aria-live="polite">{selected.length} of {question.maxSelections} selected</p>
        </fieldset>
      );
    }
    case 'slider':
      return <SliderInput question={question} value={value} onChange={onChange} headingId={headingId} />;
    default:
      return null;
  }
};

// Earlier questions and answers shown as a chat, each followed by a scripted
// reply. Clearly labelled as scripted so it is never mistaken for AI.
export const ConversationTranscript = ({ category, entries }) => (
  <ol className="space-y-3" aria-label="Conversation so far">
    {entries.map(({ question, value }) => (
      <li key={question.id} className="space-y-2">
        <p className="max-w-[85%] rounded-wb rounded-tl-sm bg-wb-subtle px-4 py-2 text-wb-text shadow-wb-sm">{question.text}</p>
        <p className="ml-auto max-w-[85%] rounded-wb rounded-tr-sm bg-wb-primary px-4 py-2 text-right text-white shadow-wb-sm">
          <span className="sr-only">You answered: </span>{answerLabel(question, value)}
        </p>
        <p className="max-w-[85%] rounded-wb rounded-tl-sm bg-wb-accent-soft px-4 py-2 text-wb-text shadow-wb-sm">
          {acknowledgement(category, question, value)}
        </p>
      </li>
    ))}
  </ol>
);
