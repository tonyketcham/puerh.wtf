const colors = require('windicss/colors');

module.exports = {
  attributify: true,
  extract: {
    include: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
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
    require('windicss/plugin/line-clamp'),
    require('@windicss/plugin-question-mark'),
  ],
};
