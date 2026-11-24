/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        carbon: {
          950: '#090d14',
          900: '#0f1520',
          800: '#161f2e',
          700: '#1f2b3f',
        },
      },
    },
  },
  plugins: [],
};
