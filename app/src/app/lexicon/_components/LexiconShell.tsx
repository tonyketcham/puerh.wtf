"use client"

import "@/lib/components/entity/page/transitions.css"
import type { ReactNode } from "react"
import { useParams } from "next/navigation"
import EditorFrame from "@/lib/components/containers/EditorFrame"
import LexiconProperties from "./LexiconProperties"
import LexiconStatusBar from "./LexiconStatusBar"

/**
 * The editor frame for /lexicon and /lexicon/[term], like EntityShell for the entity kinds:
 * a word gets the Properties panel and a capped editor, the index takes the full width,
 * and the status bar slides between words instead of remounting.
 */
export default function LexiconShell({ children }: { children: ReactNode }) {
	const params = useParams<{ term?: string }>()
	const slug = params?.term ? safeDecode(params.term) : null

	return (
		// [data-statusbar-layout] turns on --statusbar-h (see app.css)
		<div className="flex-1 bg-background text-ink" data-statusbar-layout data-lexicon-shell>
			<EditorFrame panel={slug ? <LexiconProperties slug={slug} /> : undefined}>
				{children}
			</EditorFrame>

			<LexiconStatusBar slug={slug} />
		</div>
	)
}

function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s)
	} catch {
		return s
	}
}
