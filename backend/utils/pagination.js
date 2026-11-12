// Page/limit parsing shared by every community list endpoint.
//
// - Missing values use the defaults.
// - A limit above maxLimit is lowered to maxLimit.
// - Anything malformed (non-digits, zero, arrays, objects) or a page beyond
//   maxPage is rejected, so callers return 400.

const parsePositiveInt = (value) => {
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
};

export const parsePagination = (query = {}, { defaultLimit, maxLimit, maxPage }) => {
  let page = 1;
  let limit = defaultLimit;

  if (query.page !== undefined) {
    page = parsePositiveInt(query.page);
    if (page === null || page > maxPage) return { error: `Page must be a whole number from 1 to ${maxPage}.` };
  }
  if (query.limit !== undefined) {
    const requested = parsePositiveInt(query.limit);
    if (requested === null) return { error: 'Limit must be a whole number of 1 or more.' };
    limit = Math.min(requested, maxLimit);
  }
  return { page, limit, skip: (page - 1) * limit };
};

// Callers fetch limit + 1 documents; the extra one only tells us whether another
// page exists, so no total count query is needed.
export const pageResponse = (docs, { page, limit }, serialize) => ({
  items: docs.slice(0, limit).map(serialize),
  page,
  limit,
  hasMore: docs.length > limit,
});
