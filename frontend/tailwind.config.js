/** @type {import('tailwindcss').Config} */

// WellBridge tokens (white, black, blue and green theme). Values live as CSS
// variables in src/index.css; these entries only expose them as utilities
// (e.g. bg-wb-primary, text-wb-muted, border-wb-border).
const token = (name) => `rgb(var(--wb-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wb: {
          primary: token('primary'),
          'primary-hover': token('primary-hover'),
          'primary-soft': token('primary-soft'),
          accent: token('accent'),
          'accent-hover': token('accent-hover'),
          'accent-soft': token('accent-soft'),
          bg: token('bg'),
          surface: token('surface'),
          subtle: token('subtle'),
          text: token('text'),
          muted: token('text-muted'),
          border: token('border'),
          control: token('control'),
          danger: token('danger'),
          'danger-hover': token('danger-hover'),
        },
      },
      borderRadius: {
        'wb-sm': 'var(--wb-radius-sm)',
        wb: 'var(--wb-radius)',
        'wb-lg': 'var(--wb-radius-lg)',
      },
      // Tailwind's own shadow sizes also use the layered WellBridge depth, so
      // every existing shadow-* card gets the same soft 3D look.
      boxShadow: {
        sm: 'var(--wb-shadow-sm)',
        DEFAULT: 'var(--wb-shadow)',
        md: 'var(--wb-shadow)',
        lg: 'var(--wb-shadow-lg)',
        xl: 'var(--wb-shadow-lg)',
        '2xl': 'var(--wb-shadow-lg)',
        'wb-sm': 'var(--wb-shadow-sm)',
        wb: 'var(--wb-shadow)',
        'wb-lg': 'var(--wb-shadow-lg)',
        'wb-btn': 'var(--wb-shadow-btn)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
