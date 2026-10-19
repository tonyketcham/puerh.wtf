"use client"

import { useEffect, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react"
import { MotionConfig, motion, type Transition } from "motion/react"

/* -------------------------------------------------------------------------------------------------
 * Torn washi tape, stuck to the top-left corner of a card.
 *
 * Aging (both computed on the server by SessionCard and passed in as plain numbers, so server and
 * client render the exact same markup):
 * - `age` (0..1, how long ago the session was): yellows and fades the tape — sepia toward amber,
 *   less saturation, a little transparency and a more contrasty fibre texture.
 * - `curl` (0..1, how old the leaf is): older vintages get a dog-eared, lifted corner. Which corner
 *   is deterministic per seed.
 *
 * `active` (card hovered or keyboard-focused) peels the tape up on a spring.
 * ---------------------------------------------------------------------------------------------- */

export interface TornTapeProps {
	seed: string
	color?: string
	/** 0..1 — session age (yellowing / fading) */
	age?: number
	/** 0..1 — vintage age (corner curl) */
	curl?: number
	/** card is hovered / focused: peel up */
	active?: boolean
	/** seconds; when set, the tape is "slapped on" after this delay on mount */
	enterDelay?: number | null
}

const round = (v: number, p = 3) => Math.round(v * 10 ** p) / 10 ** p

function makePrng(seed: string) {
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

const PEEL_SPRING: Transition = { type: "spring", stiffness: 420, damping: 24, mass: 0.6 }
const SHADOW_REST = "drop-shadow(0px 1px 1px rgba(0, 0, 0, 0.4))"
const SHADOW_PEEL = "drop-shadow(0px 5px 4px rgba(0, 0, 0, 0.5))"

export default function TornTape({
	seed,
	color,
	age = 0,
	curl = 0,
	active = false,
	enterDelay = null,
}: TornTapeProps) {
	const prng = makePrng(seed)
	const randomVal = (min: number, max: number) => {
		const rand = prng() / 4294967295 // normalize to 0-1
		return min + rand * (max - min)
	}

	// NB: the order of prng() calls below is load-bearing: it keeps every existing tape's shape.
	const rotation = randomVal(-12, 20)

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

	const clipPath = generateJaggedPolygon()
	const w = randomVal(2.4, 3.8)
	const h = randomVal(0.95, 1.75)
	const top = randomVal(-0.75, -0.3)
	const left = randomVal(-2, -0.7)
	const textureSeed = prng()
	// New draws (appended so they don't disturb the shape above): which corner curls / peels.
	const corner = prng() % 4
	const flipX = corner === 1 || corner === 3 ? -1 : 1
	const flipY = corner >= 2 ? -1 : 1

	const filterId = `tape-texture-${seed}`
	const a = Math.min(1, Math.max(0, age))
	const c = Math.min(1, Math.max(0, curl))

	// Everything below is drawn in a canonical frame where the curl / peel happens at the TOP-RIGHT
	// corner; the frame is mirrored (flipX / flipY) to put it on the seeded corner.
	// Fold: the corner beyond the 45° line x - y = k is folded back over the tape (a dog-ear).
	const fold = c > 0.04 ? round((0.3 + 0.45 * c) * h) : 0
	const k = round(w - fold)
	const rem = (v: number) => `${round(v)}rem`

	// Session age: amber, faded, a bit more fibrous.
	const agingFilter =
		a > 0.01
			? `sepia(${round(0.55 * a)}) saturate(${round(1 - 0.3 * a)}) hue-rotate(${round(-8 * a)}deg) brightness(${round(1 - 0.07 * a)})`
			: undefined
	const textureSlope = round(1 + 0.9 * a)
	const textureIntercept = round(-0.45 * a)

	const layers = (underside = false) => (
		<>
			<span
				className="absolute inset-0"
				style={{
					clipPath,
					transform: "scale(1.01)",
					backgroundImage:
						"linear-gradient(135deg, rgba(255, 255, 255, 0.6), #fff, rgba(255, 255, 255, 0.6))",
				}}
			/>
			<span
				className="absolute inset-0"
				style={{ clipPath, backgroundColor: color, filter: `url(#${filterId})` }}
			/>
			{underside && (
				<span
					className="absolute inset-0"
					style={{
						clipPath,
						// Matte adhesive side: lighter at the tip (the original corner), shaded into the crease.
						backgroundImage: `radial-gradient(circle at 100% 0%, rgba(255, 255, 255, 0.55) 0, rgba(255, 255, 255, 0.2) ${rem(fold * 0.5)}, rgba(0, 0, 0, 0.22) ${rem(fold * 0.72)})`,
					}}
				/>
			)}
		</>
	)

	return (
		<>
			<svg className="absolute w-0 h-0" aria-hidden="true" focusable="false">
				<filter id={filterId}>
					{/* Create a bevel highlight from the alpha channel */}
					<feGaussianBlur in="SourceAlpha" stdDeviation="0.75" result="blurredAlpha" />
					<feSpecularLighting
						in="blurredAlpha"
						surfaceScale="3"
						specularConstant="0.5"
						specularExponent="15"
						lightingColor="#fff"
						result="specularLighting"
					>
						<feDistantLight azimuth="225" elevation="15" />
					</feSpecularLighting>
					<feComposite
						in="specularLighting"
						in2="SourceAlpha"
						operator="in"
						result="bevelHighlight"
					/>

					{/* Create the fibrous texture */}
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.1 0.4"
						numOctaves="2"
						result="noise"
						seed={textureSeed}
					/>
					<feDiffuseLighting
						in="noise"
						lightingColor="white"
						surfaceScale="1"
						result="diffuseLit"
					>
						<feDistantLight azimuth="45" elevation="30" />
					</feDiffuseLighting>
					{/* Older sessions: more contrast in the fibres */}
					<feComponentTransfer in="diffuseLit" result="diffuseTexture">
						<feFuncR type="linear" slope={textureSlope} intercept={textureIntercept} />
						<feFuncG type="linear" slope={textureSlope} intercept={textureIntercept} />
						<feFuncB type="linear" slope={textureSlope} intercept={textureIntercept} />
					</feComponentTransfer>

					{/* Combine texture with original color */}
					<feComposite
						in="SourceGraphic"
						in2="diffuseTexture"
						operator="arithmetic"
						k1="0.5"
						k2="0.5"
						k3="0"
						k4="0"
						result="texturedGraphic"
					/>

					{/* Add the bevel highlight on top */}
					<feComposite
						in="texturedGraphic"
						in2="bevelHighlight"
						operator="arithmetic"
						k1="1"
						k2="1"
						k3="0"
						k4="0"
					/>
				</filter>
			</svg>

			{/* Positioning + entrance + cast shadow (unrotated, so the shadow always falls down) */}
			<motion.span
				aria-hidden="true"
				className="absolute z-10 block pointer-events-none"
				style={{ width: rem(w), height: rem(h), top: rem(top), left: rem(left) }}
				initial={enterDelay != null ? { opacity: 0, scale: 1.35, filter: SHADOW_REST } : false}
				animate={{ opacity: 1, scale: 1, filter: active ? SHADOW_PEEL : SHADOW_REST }}
				transition={{
					opacity: { duration: 0.12, delay: enterDelay ?? 0 },
					scale: { type: "spring", stiffness: 520, damping: 26, delay: enterDelay ?? 0 },
					filter: PEEL_SPRING,
				}}
			>
				<span className="absolute inset-0 block" style={{ transform: `rotate(${round(rotation)}deg)` }}>
					<span
						className="absolute inset-0 block"
						style={{
							transform: flipX === 1 && flipY === 1 ? undefined : `scale(${flipX}, ${flipY})`,
						}}
					>
						{/* Peel: hinge near the far bottom corner, lift the curled end toward the viewer */}
						<motion.span
							className="absolute inset-0 block"
							style={{ originX: 0.12, originY: 0.85, transformPerspective: 160 }}
							initial={false}
							animate={
								active
									? { rotateX: -16, rotateY: -26, y: -0.5 }
									: { rotateX: 0, rotateY: 0, y: 0 }
							}
							transition={PEEL_SPRING}
						>
							<span
								className="absolute inset-0 block"
								style={{ filter: agingFilter, opacity: round(1 - 0.25 * a) }}
							>
								{fold > 0 && (
									// Soft shadow on the card under the lifted corner
									<span className="absolute inset-0 block" style={{ filter: "blur(1.2px)" }}>
										<span
											className="absolute inset-0 block bg-black/40"
											style={{
												clipPath: `polygon(${rem(k)} 0rem, ${rem(w)} 0rem, ${rem(w)} ${rem(fold)})`,
												transform: "translate(-0.04rem, 0.08rem)",
											}}
										/>
									</span>
								)}

								{/* Tape body, minus the folded corner */}
								<span
									className="absolute inset-0 block"
									style={{
										clipPath:
											fold > 0
												? `polygon(0rem 0rem, ${rem(k)} 0rem, ${rem(w)} ${rem(fold)}, ${rem(w)} ${rem(h)}, 0rem ${rem(h)})`
												: undefined,
									}}
								>
									{layers()}
								</span>

								{fold > 0 && (
									// The flap: the cut-off corner reflected across the fold line
									<span
										className="absolute inset-0 block"
										style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.45))" }}
									>
										<span
											className="absolute inset-0 block"
											style={{
												clipPath: `polygon(${rem(k)} 0rem, ${rem(w)} ${rem(fold)}, ${rem(k)} ${rem(fold)})`,
											}}
										>
											<span
												className="absolute top-0 left-0 block"
												style={{
													width: rem(w),
													height: rem(h),
													transformOrigin: "0 0",
													transform: `translate(${rem(k)}, ${rem(-k)}) matrix(0, 1, 1, 0, 0, 0)`,
												}}
											>
												{layers(true)}
											</span>
										</span>
									</span>
								)}
							</span>
						</motion.span>
					</span>
				</span>
			</motion.span>
		</>
	)
}

/* -------------------------------------------------------------------------------------------------
 * TapedCard: the interactive shell of a SessionCard. Owns hover / focus state (shared with the tape
 * so it peels while the card lifts), the liquor glow along the top edge and the first-load entrance.
 * ---------------------------------------------------------------------------------------------- */

/** Set once the first staggered entrance has played in this page lifetime (client only). */
let hasPlayedEntrance = false

const LIFT_SPRING: Transition = { type: "spring", stiffness: 380, damping: 28, mass: 0.7 }

interface TapedCardProps {
	tape: Omit<TornTapeProps, "active" | "enterDelay">
	/** position in a freshly loaded list; enables the one-time staggered entrance */
	enterIndex?: number
	className?: string
	style?: CSSProperties
	children: ReactNode
}

export function TapedCard({ tape, enterIndex, className, style, children }: TapedCardProps) {
	// Read the module flag once: true on SSR + first hydration, false on later client navigations.
	const [enter] = useState(() => enterIndex != null && !hasPlayedEntrance)
	const [hovered, setHovered] = useState(false)
	const [focused, setFocused] = useState(false)
	const active = hovered || focused

	useEffect(() => {
		if (enterIndex != null) hasPlayedEntrance = true
	}, [enterIndex])

	const delay = enter ? Math.min(enterIndex ?? 0, 10) * 0.055 : 0

	const onFocus = (e: FocusEvent<HTMLElement>) => {
		const target = e.target as HTMLElement
		setFocused(target.matches?.(":focus-visible") ?? true)
	}
	const onBlur = (e: FocusEvent<HTMLElement>) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
	}

	return (
		<MotionConfig reducedMotion="user">
			<motion.div
				className="w-full"
				initial={enter ? { opacity: 0, y: 18 } : false}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					opacity: { duration: 0.32, ease: "easeOut", delay },
					y: { type: "spring", stiffness: 210, damping: 24, mass: 0.9, delay },
				}}
			>
				<motion.article
					className={className}
					style={style}
					initial={false}
					animate={{ y: active ? -2 : 0 }}
					transition={LIFT_SPRING}
					onHoverStart={() => setHovered(true)}
					onHoverEnd={() => setHovered(false)}
					onFocus={onFocus}
					onBlur={onBlur}
				>
					<TornTape {...tape} active={active} enterDelay={enter ? delay + 0.16 : null} />
					{children}

					{/* Liquor glow: the top border picks up the color of the brewed tea */}
					<motion.span
						aria-hidden="true"
						className="pointer-events-none absolute -inset-px z-[1] rounded-2xl border border-[rgb(var(--liquor-text-rgb,var(--liquor-rgb))/0.55)]"
						style={{
							maskImage: "linear-gradient(to bottom, #000, transparent 45%)",
							WebkitMaskImage: "linear-gradient(to bottom, #000, transparent 45%)",
						}}
						initial={false}
						animate={{ opacity: active ? 1 : 0 }}
						transition={{ duration: active ? 0.18 : 0.35, ease: "easeOut" }}
					/>
					<motion.span
						aria-hidden="true"
						className="pointer-events-none absolute -top-px inset-x-8 z-[1] h-px"
						style={{
							backgroundImage:
								"linear-gradient(90deg, transparent, rgb(var(--liquor-text-rgb, var(--liquor-rgb))), transparent)",
							boxShadow: "0 0 12px 1px rgb(var(--liquor-text-rgb, var(--liquor-rgb)) / 0.45)",
						}}
						initial={false}
						animate={{ opacity: active ? 1 : 0, scaleX: active ? 1 : 0.55 }}
						transition={{ opacity: { duration: 0.2 }, scaleX: LIFT_SPRING }}
					/>
				</motion.article>
			</motion.div>
		</MotionConfig>
	)
}
