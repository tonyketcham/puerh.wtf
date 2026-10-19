import { Fragment, type ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

/**
 * The small slice of markdown entity descriptions use (frontmatter strings, so Flatbread never
 * renders them): paragraphs, `*`/`-` lists, *em*, **strong**, `code`, [links](…) and backslash
 * escapes. Renders React elements, never HTML strings, so a description can't inject markup.
 * Server-safe (no hooks).
 */
export default function Markdown({
	source,
	className,
	skipFirst = false,
}: {
	source: string | null | undefined
	className?: string
	/** leave out the first paragraph (it's already the page's lead) */
	skipFirst?: boolean
}) {
	const blocks = toBlocks(source).slice(skipFirst ? 1 : 0)
	if (!blocks.length) return null
	return (
		<div className={cn("space-y-4", className)}>
			{blocks.map((block, i) =>
				block.type === "list" ? (
					<ul key={i} className="space-y-1.5">
						{block.items.map((item, j) => (
							<li key={j} className="flex gap-2.5">
								<span aria-hidden className="select-none text-white/25">
									–
								</span>
								<span>{inline(item)}</span>
							</li>
						))}
					</ul>
				) : (
					<p key={i}>{inline(block.text)}</p>
				)
			)}
		</div>
	)
}

/** Paragraph count, so a page can tell whether anything is left after its lead. */
export function paragraphCount(source: string | null | undefined): number {
	return toBlocks(source).length
}

type Block = { type: "p"; text: string } | { type: "list"; items: string[] }

const LIST_ITEM = /^\s*[*-]\s+/

function toBlocks(source: string | null | undefined): Block[] {
	const blocks: Block[] = []
	for (const chunk of (source || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
		const lines = chunk.split("\n").filter((l) => l.trim())
		if (!lines.length) continue
		if (lines.every((l) => LIST_ITEM.test(l))) {
			const items = lines.map((l) => l.replace(LIST_ITEM, "").trim())
			// consecutive list chunks (blank lines between items) stay one list
			const last = blocks[blocks.length - 1]
			if (last?.type === "list") last.items.push(...items)
			else blocks.push({ type: "list", items })
		} else {
			blocks.push({ type: "p", text: lines.join(" ").replace(/\s+/g, " ").trim() })
		}
	}
	return blocks
}

const INLINE =
	/\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|(?<!\w)_([^_]+)_(?!\w)|`([^`]+)`/g

/** Escaped punctuation (\[ \*) is literal: swapped for private-use stand-ins while parsing. */
const ESCAPED = /\\([[\]()*_`\\])/g
const STAND_IN_BASE = 0xe000
const STAND_IN = /[-]/g
const protect = (text: string) =>
	text.replace(ESCAPED, (_, c: string) => String.fromCharCode(STAND_IN_BASE + c.charCodeAt(0)))
const restore = (text: string) =>
	text.replace(STAND_IN, (c) => String.fromCharCode(c.charCodeAt(0) - STAND_IN_BASE))

function inline(raw: string): ReactNode {
	const text = protect(raw)
	const out: ReactNode[] = []
	let last = 0
	for (const m of text.matchAll(INLINE)) {
		const at = m.index ?? 0
		if (at > last) out.push(restore(text.slice(last, at)))
		const key = `${at}`
		if (m[1] !== undefined) {
			const href = restore(m[2])
			const external = /^https?:\/\//i.test(href)
			out.push(
				<a
					key={key}
					href={href}
					{...(external ? { target: "_blank", rel: "noopener" } : {})}
					className="underline decoration-white/25 underline-offset-[3px] transition-colors hover:text-white hover:decoration-[var(--entity-accent,#fff2ca)]"
				>
					{restore(m[1])}
					{external && (
						<span aria-hidden className="ml-0.5 text-[0.85em] text-white/35">
							↗
						</span>
					)}
				</a>
			)
		} else if (m[3] !== undefined) {
			out.push(
				<strong key={key} className="font-semibold text-white">
					{restore(m[3])}
				</strong>
			)
		} else if (m[4] !== undefined || m[5] !== undefined) {
			out.push(<em key={key}>{restore(m[4] ?? m[5])}</em>)
		} else if (m[6] !== undefined) {
			out.push(
				<code key={key} className="px-1 rounded-[3px] bg-white/[0.06] text-[0.92em]">
					{restore(m[6])}
				</code>
			)
		}
		last = at + m[0].length
	}
	if (last < text.length) out.push(restore(text.slice(last)))
	return <Fragment>{out}</Fragment>
}
