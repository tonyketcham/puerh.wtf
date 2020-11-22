const colors = require('tailwindcss/colors');

module.exports = {
  purge: [],
  darkMode: 'class', // or 'media' or 'class'
  theme: {
    colors: {
      gray: colors.blueGray,
      red: colors.red,
      orange: colors.orange,
      yellow: colors.amber,
      green: colors.lime,
      teal: colors.teal,
      cyan: colors.cyan,
      indigo: colors.indigo,
      purple: colors.purple,
      pink: colors.pink,
      rose: colors.rose,
      white: colors.white
    },
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
