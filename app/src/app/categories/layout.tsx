import type { ReactNode } from "react"
import EntityShell from "@/lib/components/entity/page/EntityShell"

/** Persists across category pages (and the index): Properties panel, status bar. */
export default function CategoriesLayout({ children }: { children: ReactNode }) {
	return <EntityShell kind="category">{children}</EntityShell>
}
