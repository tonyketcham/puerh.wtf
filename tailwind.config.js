const colors = require('windicss/colors');

module.exports = {
  darkMode: 'class', // manually trigger
  purge: {
    options: {
      enabled: true,
      keyframes: true,
      content: ['./public/index.html', './src/**/*.vue'],
      // considers dynamic class bindings when purging unused classes
      // credit: https://github.com/matebek https://dev.to/matebek
      defaultExtractor: (content) => [
        ...(content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || []),
        ...(content.match(/(?<=class:)[^=>/\s]*/g) || []),
      ],
    },
  },
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: colors.black,
      white: colors.white,
      gray: colors.trueGray,
      indigo: colors.indigo,
      red: colors.rose,
      yellow: colors.amber,
      green: colors.lime,
      teal: colors.teal,
      cyan: colors.cyan,
    },
    extend: {
      width: {
        112: '28rem',
      },
    },
  },
  plugins: [
    // require('windicss/plugin/typography'),
    // require('windicss/plugin/filters'),
  ],
};
