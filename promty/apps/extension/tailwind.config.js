/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./public/popup.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        main: '#141A2A',
        card: '#0F1420',
        surface: '#00223B',
        accent: '#2166E9',
        danger: '#C32A2A',
        warning: '#D3CD2D',
      }
    },
  },
  plugins: [],
};
