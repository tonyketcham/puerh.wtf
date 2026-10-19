import type { ReactNode } from "react"
import EntityShell from "@/lib/components/entity/page/EntityShell"

/** Persists across style pages (and the index): Properties panel, status bar. */
export default function StylesLayout({ children }: { children: ReactNode }) {
	return <EntityShell kind="style">{children}</EntityShell>
}
