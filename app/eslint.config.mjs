import nextVitals from "eslint-config-next/core-web-vitals"
import prettier from "eslint-config-prettier"

export default [
	{
		ignores: [
			".next/**",
			"build/**",
			"node_modules/**",
			"package/**",
			"playwright-report/**",
			"test-results/**",
			"vue/**",
		],
	},
	...nextVitals,
	prettier,
	{
		rules: {
			"react-hooks/immutability": "off",
			"react-hooks/purity": "off",
			"react-hooks/set-state-in-effect": "off",
		},
	},
]
