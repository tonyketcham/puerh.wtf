"use client"

import StatusBarFrame from "@/lib/components/containers/StatusBarFrame"
import type { ReactNode } from "react"
import { LEXICON_GROUP_META, peakStage } from "@/lib/lexicon"
import { NOTE_STAGE_META } from "@/lib/noteStages"
import { useLexiconWord } from "./useLexiconWord"

/**
 * The status bar on lexicon pages, VS Code style:
 *
 *   [‘ descriptor] 18 refs · 13 list it · cream · mostly taste      2001–2021 · avg 86.1 · ■ #B0702C · ⌘K
 *
 * The kind block is tinted with the word's blended liquor. On the index it sums up the lexicon.
 */
export default function LexiconStatusBar({ slug }: { slug: string | null }) {
	const { index, lexicon, entry, model } = useLexiconWord(slug)

	const left: ReactNode[] = []
	if (model && entry) {
		const { stats } = model
		const peak = peakStage(entry)
		left.push(
			<span key="refs" title="Sessions that mention it (find all references)">
				{stats.count} {stats.count === 1 ? "ref" : "refs"}
			</span>,
			<span key="listed" title="Sessions whose notes list it">
				{entry.listed.length} list it
			</span>,
			<span key="group">{LEXICON_GROUP_META[entry.group].label}</span>
		)
		if (peak)
			left.push(
				<span key="peak">
					<span className="text-white/35">mostly</span> {NOTE_STAGE_META[peak].title.toLowerCase()}
				</span>
			)
	} else {
		left.push(
			<span key="words">{lexicon.size.toLocaleString("en-US")} words</span>,
			<span key="paged">{lexicon.paged.length} with pages</span>,
			<span key="sessions">{index.sessions.length} sessions</span>
		)
	}

	return (
		<StatusBarFrame
			pageKey={slug ?? "index"}
			label="Lexicon status"
			recordingKey="lexicon-status-bar"
			glyph="‘"
			name={entry ? "descriptor" : "lexicon"}
			accent={model?.accent ?? null}
			stats={model?.stats}
			left={left}
		/>
	)
}
