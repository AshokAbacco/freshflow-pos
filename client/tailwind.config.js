/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    /*
     * Typography is locked to exactly four sizes. `fontSize` replaces (not extends) Tailwind's scale,
     * so classes like text-lg or text-xs do not exist and cannot drift into the UI.
     */
    fontSize: {
      h1: ['18px', { lineHeight: '24px', letterSpacing: '-0.012em' }],
      h2: ['16px', { lineHeight: '22px', letterSpacing: '-0.008em' }],
      body: ['14px', { lineHeight: '20px', letterSpacing: '-0.003em' }],
      desc: ['12px', { lineHeight: '16px' }],
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: '#059669',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Inter"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.04)',
        lift: '0 12px 40px rgba(15, 23, 42, 0.12)',
        glass: '0 24px 64px rgba(15, 23, 42, 0.18)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        'sheet-in': 'sheet-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'fade-in': 'fade-in 150ms ease-out',
        pop: 'pop 220ms ease-out',
      },
    },
  },
  plugins: [],
};
