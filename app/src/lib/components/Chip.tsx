import type { PropsWithChildren } from "react"

export default function Chip({ children }: PropsWithChildren) {
	return (
		// TODO: check HTML semantics for tags
		<span className="px-2 py-1.5 text-xs rounded-sm text-ink-muted ring-1 ring-heicha-500 bg-white/10">
			{children}
		</span>
	)
}
