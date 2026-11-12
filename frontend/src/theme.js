// JavaScript copy of the WellBridge colour tokens defined in src/index.css,
// for code that needs real colour strings (Chart.js draws on a canvas and
// cannot read CSS variables). Keep these values in sync with index.css.
export const THEME = Object.freeze({
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primarySoft: '#EFF6FF',
  accent: '#16A34A',
  accentHover: '#15803D',
  accentSoft: '#F0FDF4',
  surface: '#FFFFFF',
  subtle: '#F8FAFC',
  text: '#171717',
  textMuted: '#525252',
  border: '#E5E7EB',
});

// '#2563EB', 0.2 -> 'rgba(37, 99, 235, 0.2)'
export const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
