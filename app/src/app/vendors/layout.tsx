import type { ReactNode } from "react"
import EntityShell from "@/lib/components/entity/page/EntityShell"

/** Persists across vendor pages (and the index): Properties panel, status bar. */
export default function VendorsLayout({ children }: { children: ReactNode }) {
	return <EntityShell kind="vendor">{children}</EntityShell>
}
