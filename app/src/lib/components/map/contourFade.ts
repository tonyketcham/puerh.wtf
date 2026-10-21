"use client"

/**
 * The origin hero fades its plain contours as it scrolls away (Hero.tsx): `minor` runs from 1 to
 * `floor`. A context rather than an inherited CSS variable: written on the hero every frame, the
 * variable restyled every element of the map beneath it (10–15 ms frames while scrolling).
 */
import { createContext } from "react"
import type { MotionValue } from "motion/react"

export type ContourFade = { minor: MotionValue<number>; floor: number }

export const ContourFadeContext = createContext<ContourFade | null>(null)
