module.exports = {
  mode: 'jit',
  purge: {
    enabled: process.env.NODE_ENV === 'production',
    content: ['./src/**/*.html', './src/**/*.vue', './src/**/*.jsx'],
  },
  darkMode: 'class', // manually trigger
  theme: {
    extend: {
      colors: {
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
    require('tailwindcss-textshadow'),
    require('tailwind-filter-utilities'),
  ],
};
