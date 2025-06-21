const config = {
	content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["var(--font-inter)", "system-ui", "sans-serif"],
				"fira-code": ["var(--font-fira-code)", "monospace"],
				"rock-3d": ["var(--font-rock-3d)", "display"],
			},
			colors: {
				background: "#121012",
				sidebar: "rgba(45,40,45,0.35)",
				ink: "#ffffff",
				"ink-muted": "rgba(255,255,255,0.8)",
				"border-muted": "rgba(255,255,255,0.05)",
				brand: "#edc446",
				"bai-cha": {
					50: "#fefefe",
					100: "#fdfdfd",
					200: "#fafafa",
				},
				"tea-soup": {
					400: "#a8a8a8",
					500: "#8a8a8a",
				},
				heicha: {
					600: "#2a2a2a",
					700: "#1a1a1a",
				},
			},
			textShadow: {
				lg: "0 4px 8px rgba(0, 0, 0, 0.3)",
				"2xl": "1px 2px 0px rgba(0,0,0,0.6)",
			},
			wordSpacing: {
				9: "0.25rem",
			},
			lineHeight: {
				"extra-tight": "1.13703",
			},
		},
	},
	plugins: [require("@tailwindcss/typography"), require("./tailwindPlugins/wordSpacingPlugin.cjs")],
}

module.exports = config
