const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				'tea-soup': {
					400: '#f2c94c',
					500: '#ffd369'
				},
				'bai-cha': {
					50: '#fcfff0',
					100: '#eeeeee',
					200: '#eef5dB'
				},
				maofeng: '#42723c',
				matcha: '#10522f',
				heicha: {
					50: '#f4f4f5',
					100: '#e9eaea',
					200: '#c8c9cc',
					300: '#a7a9ad',
					400: '#64696f',
					500: '#222831',
					600: '#141410',
					700: '#0f0f0c',
					800: '#0e0e0c',
					900: '#0a0a08'
				}
			},
			fontFamily: {
				sans: ['Karrik-Regular', ...defaultTheme.fontFamily.sans],
				'sans-italic': ['Karrik-Italic', ...defaultTheme.fontFamily.sans]
			}
		}
	},
	plugins: []
};
