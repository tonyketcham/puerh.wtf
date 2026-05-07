const colors = require('tailwindcss/colors');

module.exports = {
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
  mode: 'jit',
  darkMode: 'class', // manually trigger
  theme: {
    extend: {
      colors: {
        gray: colors.warmGray,
        primary: {
          light: '#FEF4E8',
          dark: '#030302',
        },
      },
      fontFamily: {
        sans: ['Lexend', 'Helvetica', 'Arial', 'sans-serif'],
        cursive: ['Caveat', 'cursive'],
      },
      gridTemplateRows: {
        12: 'repeat(12, minmax(0, 1fr))',
      },
      width: {
        112: '28rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
    require('tailwindcss-textshadow'),
  ],
};
