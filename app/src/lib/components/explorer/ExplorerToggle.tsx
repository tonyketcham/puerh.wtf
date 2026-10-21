"use client"

import { useAtom } from "jotai"
import { PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { explorerDrawerOpenAtom } from "./state"

export const EXPLORER_DRAWER_ID = "explorer-drawer"

/**
 * Opens the Explorer drawer from the compact masthead (below xl, where the Explorer isn't
 * docked). Labelled, not just an icon: on a phone it is the way into the session index.
 */
export default function ExplorerToggle({ className }: { className?: string }) {
	const [open, setOpen] = useAtom(explorerDrawerOpenAtom)
	return (
		<button
			type="button"
			data-explorer-toggle
			aria-controls={EXPLORER_DRAWER_ID}
			aria-expanded={open}
			onClick={() => setOpen(!open)}
			className={cn(
				"pointer-events-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md font-fira-code text-xs",
				"text-white/70 ring-1 ring-inset ring-white/[0.06] bg-[var(--surface-face)] shadow-key outline-none transition-colors",
				"hover:text-white hover:bg-white/[0.06] focus-visible:ring-white/50",
				className
			)}
		>
			<PanelLeftOpen size={14} strokeWidth={1.75} aria-hidden />
			Explorer
		</button>
	)
}
