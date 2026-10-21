import type { ReactNode } from "react"
import EntityShell from "@/lib/components/entity/page/EntityShell"

/** Persists across origin pages (and the index): Properties panel, status bar. */
export default function OriginsLayout({ children }: { children: ReactNode }) {
	return <EntityShell kind="origin">{children}</EntityShell>
}
