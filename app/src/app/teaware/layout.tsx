import type { ReactNode } from "react"
import EntityShell from "@/lib/components/entity/page/EntityShell"

/** Persists across vessel pages (and the index): Properties panel, status bar. */
export default function TeawareLayout({ children }: { children: ReactNode }) {
	return <EntityShell kind="vessel">{children}</EntityShell>
}
