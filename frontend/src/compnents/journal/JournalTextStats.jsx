import React from 'react';

// The server rejects journal text longer than this, counted the same way (.length).
// Shown for information only; nothing here blocks typing or changes the text.
export const MAX_ARTICLE_LENGTH = 20000;
const WORDS_PER_MINUTE = 200;

// Word count, character count and an approximate reading time for journal text.
export const getTextStats = (text) => {
  const value = typeof text === 'string' ? text : '';
  const trimmed = value.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    words,
    characters: value.length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
};

const formatNumber = (n) => n.toLocaleString('en-US');

const JournalTextStats = ({ id, text }) => {
  const { words, characters, readingMinutes } = getTextStats(text);
  return (
    <p id={id} className="mt-2 text-sm text-wb-muted">
      {formatNumber(words)} {words === 1 ? 'word' : 'words'}
      {' · '}
      {formatNumber(characters)} / {formatNumber(MAX_ARTICLE_LENGTH)} characters
      {' · '}
      {readingMinutes === 0 ? '– min read' : `about ${readingMinutes} min read`}
    </p>
  );
};

export default JournalTextStats;
