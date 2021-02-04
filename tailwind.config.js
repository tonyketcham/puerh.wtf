module.exports = {
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
  darkMode: 'class', // manually trigger
  theme: {
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
