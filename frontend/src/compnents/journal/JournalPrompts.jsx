import React from 'react';

// Fixed, optional starter prompts for a new journal. Choosing one only adds its
// text to the editor; the prompt itself is never saved or sent anywhere.
export const JOURNAL_PROMPTS = [
  'Something that went well today was…',
  "Right now I'm feeling… because…",
  "One thing I'm grateful for is…",
  "Something that's been on my mind lately is…",
  'One small thing I can do for myself this week is…',
  "A moment from today I'd like to remember is…",
];

const JournalPrompts = ({ onSelect }) => (
  <div role="group" aria-labelledby="journal-prompts-title">
    <p id="journal-prompts-title" className="block text-sm font-medium text-wb-muted mb-1">
      Need a starting point? (optional)
    </p>
    <p className="text-sm text-wb-muted mb-3">
      Choose a prompt to add it to your journal. You can change or remove it at any time.
    </p>
    <div className="flex flex-wrap gap-2">
      {JOURNAL_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="px-3 py-2 rounded-lg border border-wb-border bg-wb-subtle text-sm text-left text-wb-muted hover:border-wb-primary hover:text-wb-primary focus:outline-none focus:ring-2 focus:ring-wb-primary transition-colors"
        >
          {prompt}
        </button>
      ))}
    </div>
  </div>
);

export default JournalPrompts;
