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
				heicha: {
					700: '#2D282D',
					900: '#121012'
				}
			},
			fontFamily: {
				display: ['Rock3D-Regular', ...defaultTheme.fontFamily.sans],
				sans: ['FiraCode-Regular', ...defaultTheme.fontFamily.sans]
			}
		},
		dropShadow: {
			split: '0px 4px 0px rgba(255, 255, 255, 0.25)'
		}
	},
	plugins: []
};
