import type { ReactNode } from "react"
import LexiconShell from "./_components/LexiconShell"

/** Persists across the lexicon index and its words: Properties panel, status bar. */
export default function LexiconLayout({ children }: { children: ReactNode }) {
	return <LexiconShell>{children}</LexiconShell>
}
