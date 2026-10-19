"use client"

import { useAtomValue, useSetAtom } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { MAP_LAYERS, mapLayersAtom, toggleMapLayerAtom } from "./mapState"

/**
 * The origin map's layer switches, set into the status bar like an IDE's view toggles:
 *
 *   layers  ● contours · ○ ridges · ● rivers · ○ supply lines
 */
export default function MapLayerToggles({ className }: { className?: string }) {
	const layers = useAtomValue(mapLayersAtom)
	const toggle = useSetAtom(toggleMapLayerAtom)
	const reduce = useReducedMotion() ?? false
	return (
		<div
			role="group"
			aria-label="Map layers"
			className={cn("flex items-stretch", className)}
			data-recording-key="map-layer-toggles"
		>
			<span className="flex items-center pr-1.5 text-white/30">layers</span>
			{MAP_LAYERS.map(({ id, label, title }) => {
				const on = layers[id]
				return (
					<button
						key={id}
						type="button"
						aria-pressed={on}
						title={title}
						onClick={() => toggle(id)}
						className={cn(
							"flex items-center gap-1.5 px-1.5 outline-none transition-colors",
							"hover:bg-white/[0.06] focus-visible:bg-white/[0.08]",
							on ? "text-white/80" : "text-white/35 hover:text-white/70"
						)}
					>
						<span aria-hidden className="relative grid size-2 place-items-center">
							<span className="absolute inset-0 rounded-full ring-1 ring-inset ring-current opacity-60" />
							<motion.span
								className="size-1 rounded-full bg-current"
								initial={false}
								animate={{ scale: on ? 1 : 0 }}
								transition={
									reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 30 }
								}
							/>
						</span>
						{label}
					</button>
				)
			})}
		</div>
	)
}
