import type { ReactNode } from "react"
import EntityShell from "@/lib/components/entity/page/EntityShell"

/** Persists across cultivar pages (and the index): Properties panel, status bar. */
export default function CultivarsLayout({ children }: { children: ReactNode }) {
	return <EntityShell kind="cultivar">{children}</EntityShell>
}
