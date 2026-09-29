/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0b6bcb', foreground: '#ffffff' },
        surface: '#ffffff',
        'on-surface': '#1a1a1a',
      },
      borderRadius: { lg: '12px' },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
