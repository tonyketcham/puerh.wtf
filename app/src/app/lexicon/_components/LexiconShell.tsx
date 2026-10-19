"use client"

import "@/lib/components/entity/page/transitions.css"
import { useLayoutEffect, type ReactNode } from "react"
import { useSetAtom } from "jotai"
import { useParams } from "next/navigation"
import { SessionPropertiesPanel } from "@/lib/components/SessionProperties"
import { sessionAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils"
import LexiconProperties from "./LexiconProperties"
import LexiconStatusBar from "./LexiconStatusBar"

/**
 * The editor frame for /lexicon and /lexicon/[term], like EntityShell for the entity kinds:
 * a word gets the Properties panel and an 8-column editor, the index takes the full width,
 * and the status bar slides between words instead of remounting.
 */
export default function LexiconShell({ children }: { children: ReactNode }) {
	const params = useParams<{ term?: string }>()
	const slug = params?.term ? safeDecode(params.term) : null

	// a word is no session: peeks stop calling a tea "this", radar compares stand down
	const setSession = useSetAtom(sessionAtom)
	useLayoutEffect(() => {
		setSession(null)
	}, [setSession])

	return (
		// [data-statusbar-layout] turns on --statusbar-h (see app.css)
		<div className="flex-1 bg-background text-ink" data-statusbar-layout data-lexicon-shell>
			<div className="grid grid-cols-12 gap-8 p-8">
				<div className={cn("min-w-0", slug ? "col-span-8" : "col-span-12")}>{children}</div>

				{slug && (
					<SessionPropertiesPanel>
						<LexiconProperties slug={slug} />
					</SessionPropertiesPanel>
				)}
			</div>

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
