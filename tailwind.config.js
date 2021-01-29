module.exports = {
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
  darkMode: 'class', // manually trigger
  theme: {
    extend: {},
  },
  variants: {
    extend: {
      strokeWidth: ['hover', 'focus'],
    },
  },
};
