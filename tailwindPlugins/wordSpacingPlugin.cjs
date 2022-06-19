const plugin = require('tailwindcss/plugin');

const positiveWordSpacing = {
	1: 0.25,
	2: 0.5,
	3: 0.75,
	4: 1,
	5: 1.25,
	6: 1.5,
	7: 1.75,
	8: 2,
	9: 2.25,
	10: 2.5
};

const negativeWordSpacing = Object.entries(positiveWordSpacing).reduce(
	(acc, [key, value]) => ({
		...acc,
		[`-${key}`]: value * -1
	}),
	{}
);

const wordSpacing = plugin(
	function ({ matchUtilities, theme }) {
		const values = theme('wordSpacing');

		matchUtilities(
			{
				'word-spacing': (value) => ({
					'word-spacing': `${value}rem`
				})
			},
			{ values }
		);
	},
	{
		theme: {
			wordSpacing: {
				...negativeWordSpacing,
				...positiveWordSpacing
			}
		},
		variants: {
			wordSpacing: ['responsive']
		}
	}
);

module.exports = wordSpacing;
