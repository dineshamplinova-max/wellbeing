// Search, tag filtering and sorting for the signed-in user's own journal list.
// These work only on journals already loaded in the page: nothing is sent,
// stored or logged, and no labels are added to any entry.

const OBJECT_ID = /^[0-9a-f]{24}$/i;

const asText = (value) => (typeof value === 'string' ? value : '');

const validDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// createdAt when it is a valid date; otherwise the creation time stored in the
// MongoDB ObjectId. Returns null when neither can be used.
export const journalDate = (journal) => {
  const created = validDate(journal?.createdAt);
  if (created) return created;
  const id = asText(journal?._id);
  if (!OBJECT_ID.test(id)) return null;
  return new Date(parseInt(id.slice(0, 8), 16) * 1000);
};

// A journal's own tags as trimmed strings; anything malformed is ignored.
export const journalTags = (journal) =>
  Array.isArray(journal?.tags)
    ? journal.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
    : [];

// Every tag the user has used, once each (ignoring case), in A–Z order.
export const collectTags = (journals) => {
  const byKey = new Map();
  (Array.isArray(journals) ? journals : []).forEach((journal) => {
    journalTags(journal).forEach((tag) => {
      const key = tag.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, tag);
    });
  });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
};

// Entries whose title or text contains the query (ignoring case and surrounding
// spaces) and, when a tag is chosen, that have that tag. Non-objects are dropped.
export const filterJournals = (journals, { query = '', tag = '' } = {}) => {
  const needle = asText(query).trim().toLowerCase();
  const tagKey = asText(tag).trim().toLowerCase();
  return (Array.isArray(journals) ? journals : []).filter((journal) => {
    if (!journal || typeof journal !== 'object') return false;
    if (tagKey && !journalTags(journal).some((t) => t.toLowerCase() === tagKey)) return false;
    if (!needle) return true;
    return asText(journal.title).toLowerCase().includes(needle)
      || asText(journal.article).toLowerCase().includes(needle);
  });
};

// Newest or oldest first, returned as a new array. Entries without a usable date
// go last; equal dates are ordered by id so the result is always the same.
export const sortJournals = (journals, order = 'newest') => {
  const direction = order === 'oldest' ? 1 : -1;
  const compareIds = (a, b) => {
    const idA = asText(a?._id);
    const idB = asText(b?._id);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  };
  return [...(Array.isArray(journals) ? journals : [])].sort((a, b) => {
    const dateA = journalDate(a);
    const dateB = journalDate(b);
    if (!dateA || !dateB) {
      if (dateA) return -1;
      if (dateB) return 1;
      return compareIds(a, b);
    }
    return (dateA.getTime() - dateB.getTime()) * direction || compareIds(a, b) * direction;
  });
};
