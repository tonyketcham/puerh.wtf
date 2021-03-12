const colors = require('tailwindcss/colors');

module.exports = {
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
  darkMode: 'class', // manually trigger
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: colors.white,
      black: colors.black,
      gray: colors.warmGray,
      red: colors.red,
      orange: colors.orange,
      yellow: colors.amber,
      green: colors.lime,
      blue: colors.cyan,
      indigo: colors.indigo,
      pink: colors.rose,
    },
    extend: {
      width: {
        112: '28rem',
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
