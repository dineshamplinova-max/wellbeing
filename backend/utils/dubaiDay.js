// Calendar days for mood check-ins follow Asia/Dubai (UTC+4, no daylight saving).
// Days are plain 'YYYY-MM-DD' strings so they compare and sort as text.
export const CHECKIN_TIME_ZONE = 'Asia/Dubai';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHECKIN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Replaceable clock so offline tests can fix "today" without waiting.
export const checkinClock = { now: () => new Date() };

export const dubaiDay = (date = checkinClock.now()) => {
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Adds (or subtracts) whole days to a 'YYYY-MM-DD' string.
export const shiftDay = (day, offset) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
