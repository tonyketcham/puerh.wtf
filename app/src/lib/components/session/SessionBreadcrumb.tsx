"use client"

import { useAtomValue } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import OriginTrail from "@/lib/components/entity/OriginTrail"
import { sessionAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"

/**
 * VS Code-style breadcrumb above the Rock 3D title: where the leaf grew.
 *
 * Lives in the sessions layout (not the page) so it persists across session navigation: crumbs
 * shared by two teas stay put and only the changed tail animates. Its line is always reserved,
 * so the title never shifts when the store fills in after hydration.
 */
export default function SessionBreadcrumb({
	className,
	recordingKey,
}: {
	className?: string
	recordingKey?: string
}) {
	const session = useAtomValue(sessionAtom)
	const reduce = useReducedMotion() ?? false

	return (
		<div className={cn("h-5", className)} data-recording-key={recordingKey}>
			<AnimatePresence initial={false}>
				{session && (
					<motion.div
						key="trail"
						initial={{ opacity: 0, y: reduce ? 0 : -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ type: "spring", stiffness: 520, damping: 38 }}
					>
						<OriginTrail
							origins={session.origin}
							originNote={session.origin_note}
							variant="breadcrumb"
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
