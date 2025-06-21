import type { CSSProperties } from "react"

interface TornTapeProps {
	seed: string
	color?: string
}

export default function TornTape({ seed, color }: TornTapeProps) {
	const getPseudoRandom = (seed: string) => {
		let h = 1779033703 ^ seed.length
		for (let i = 0; i < seed.length; i++) {
			h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
			h = (h << 13) | (h >>> 19)
		}
		return () => {
			h = Math.imul(h ^ (h >>> 16), 2246822507)
			h = Math.imul(h ^ (h >>> 13), 3266489909)
			return (h ^= h >>> 16) >>> 0
		}
	}

	const prng = getPseudoRandom(seed)
	const randomVal = (min: number, max: number) => {
		const rand = prng() / 4294967295 // normalize to 0-1
		return min + rand * (max - min)
	}

	const generateJaggedPolygon = () => {
		const points = []
		const segments = 10
		const jaggedness = 15

		// Top edge (mostly straight)
		points.push(`0% ${randomVal(0, 5)}%`)
		for (let i = 1; i < segments; i++) {
			points.push(`${(i / segments) * 100}% ${randomVal(0, 5)}%`)
		}
		points.push(`100% ${randomVal(0, 5)}%`)

		// Right edge (torn)
		for (let i = 1; i < segments; i++) {
			points.push(`${100 - randomVal(0, jaggedness)}% ${(i / segments) * 100}%`)
		}
		points.push(`${100 - randomVal(0, jaggedness)}% 100%`)

		// Bottom edge (mostly straight)
		for (let i = segments; i > 0; i--) {
			points.push(`${(i / segments) * 100}% ${100 - randomVal(0, 5)}%`)
		}
		points.push(`0% ${100 - randomVal(0, 5)}%`)

		// Left edge (torn)
		for (let i = segments - 1; i > 0; i--) {
			points.push(`${randomVal(0, jaggedness)}% ${(i / segments) * 100}%`)
		}

		return `polygon(${points.join(", ")})`
	}

	const tapeStyle: CSSProperties = {
		backgroundColor: color,
		width: `${randomVal(2.5, 4)}rem`,
		height: `${randomVal(1.25, 1.75)}rem`,
		top: `${randomVal(-0.4, -0.8)}rem`,
		right: `${randomVal(0.5, 1.75)}rem`,
		transform: `rotate(${randomVal(-12, 12)}deg)`,
		clipPath: generateJaggedPolygon(),
		filter: `url(#tape-texture-${seed})`,
	}

	return (
		<>
			<svg className="absolute w-0 h-0">
				<filter id={`tape-texture-${seed}`}>
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.1 0.4"
						numOctaves="2"
						result="noise"
						seed={prng()}
					/>
					<feDiffuseLighting in="noise" lightingColor="white" surfaceScale="1">
						<feDistantLight azimuth="45" elevation="30" />
					</feDiffuseLighting>
					<feComposite
						in="SourceGraphic"
						in2="diffuse"
						operator="arithmetic"
						k1="0.5"
						k2="0.5"
						k3="0"
						k4="0"
					/>
				</filter>
			</svg>
			<span className="absolute z-10 block shadow-sm" style={tapeStyle} />
		</>
	)
}
