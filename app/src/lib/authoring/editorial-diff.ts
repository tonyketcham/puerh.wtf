/** Review just the revised paragraphs, retaining their editorial formatting. */
export function revisedPassages(before: string, after: string) {
	const normalize = (value: string) => value.replace(/\r\n/g, "\n").trimEnd()
	const a = normalize(before).split(/\n\s*\n/),
		b = normalize(after).split(/\n\s*\n/)
	let first = 0,
		lastA = a.length,
		lastB = b.length
	while (first < lastA && first < lastB && a[first] === b[first]) first++
	while (lastA > first && lastB > first && a[lastA - 1] === b[lastB - 1]) {
		lastA--
		lastB--
	}
	return { before: a.slice(first, lastA).join("\n\n"), after: b.slice(first, lastB).join("\n\n") }
}
export function addedWordRanges(before: string, after: string): [number, number][] {
	const a = [...before.matchAll(/\S+/g)].map((m) => m[0]),
		b = [...after.matchAll(/\S+/g)]
	const added = new Set<number>()
	if (a.length * b.length > 250000) {
		let start = 0,
			endA = a.length,
			endB = b.length
		while (start < endA && start < endB && a[start] === b[start][0]) start++
		while (endA > start && endB > start && a[endA - 1] === b[endB - 1][0]) {
			endA--
			endB--
		}
		for (let j = start; j < endB; j++) added.add(j)
	} else {
		const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
		for (let i = a.length - 1; i >= 0; i--)
			for (let j = b.length - 1; j >= 0; j--)
				rows[i][j] =
					a[i] === b[j][0] ? 1 + rows[i + 1][j + 1] : Math.max(rows[i + 1][j], rows[i][j + 1])
		let i = 0,
			j = 0
		while (j < b.length) {
			if (i < a.length && a[i] === b[j][0]) {
				i++
				j++
			} else if (i < a.length && rows[i + 1][j] > rows[i][j + 1]) i++
			else added.add(j++)
		}
	}
	return [...added].map((j) => [b[j].index!, b[j].index! + b[j][0].length])
}
type Node = {
	type: string
	value?: string
	children?: Node[]
	position?: { start: { offset?: number } }
	data?: Record<string, unknown>
}
export function remarkEditorialChanges({ before, after }: { before: string; after: string }) {
	const ranges = addedWordRanges(before, after)
	return (tree: unknown) => {
		const walk = (parent: Node) => {
			if (!parent.children) return
			parent.children = parent.children.flatMap((node) => {
				if (node.type !== "text" || node.position?.start.offset == null) {
					walk(node)
					return [node]
				}
				const value = node.value || "",
					offset = node.position.start.offset
				const pieces: Node[] = []
				let cursor = 0
				for (const [start, end] of ranges) {
					const lo = Math.max(0, start - offset),
						hi = Math.min(value.length, end - offset)
					if (lo >= hi) continue
					if (lo > cursor) pieces.push({ type: "text", value: value.slice(cursor, lo) })
					pieces.push({
						type: "emphasis",
						data: { hName: "mark" },
						children: [{ type: "text", value: value.slice(lo, hi) }],
					})
					cursor = hi
				}
				if (!pieces.length) return [node]
				if (cursor < value.length) pieces.push({ type: "text", value: value.slice(cursor) })
				return pieces
			})
		}
		walk(tree as Node)
	}
}
