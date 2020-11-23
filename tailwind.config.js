const colors = require('tailwindcss/colors');

module.exports = {
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: [
      './src/**/*.html',
      './src/**/*.vue',
      './src/**/*.jsx',
    ]
  },
  darkMode: 'class', // manually trigger
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
