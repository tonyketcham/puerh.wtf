const colors = require('tailwindcss/colors');

module.exports = {
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
  darkMode: 'class', // manually trigger
  theme: {
    extend: {
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        black: colors.black,
        white: colors.white,
        gray: colors.trueGray,
        red: colors.red,
        yellow: colors.yellow,
        amber: colors.amber,
        blue: colors.blue,
        pink: colors.pink,
      },
      width: {
        112: '28rem',
      },
      minHeight: {
        48: '12rem',
      },
    },
  },
  variants: {
    extend: {
      strokeWidth: ['hover', 'focus'],
    },
  },
  plugins: [
    require('tailwindcss-textshadow'),
    require('tailwind-filter-utilities'),
  ],
};
