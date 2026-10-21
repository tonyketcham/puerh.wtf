"use client"

import { useMemo, useState } from "react"
import FileTree from "@/lib/components/filetree/FileTree"
import Panel from "@/lib/components/containers/Panel"
import type { TreeNode } from "@/lib/types/tree"

export default function TreeFixture() {
	const [mode, setMode] = useState("all")
	const nodes = useMemo<TreeNode[]>(
		() =>
			Array.from({ length: 10000 }, (_, i) => ({
				id: `fixture-${i}`,
				title: `Session ${String(i).padStart(5, "0")}`,
				production_year: 1990 + (i % 30),
			})),
		[]
	)
	const data = useMemo(
		() => [
			{
				id: "fixture",
				title: "Fixture sessions",
				children:
					mode === "empty"
						? []
						: mode === "tail"
						? nodes.slice(-50)
						: mode === "nested"
						? [{ id: "branch", title: "Branch", children: nodes }]
						: nodes,
				total: nodes.length,
			},
		],
		[nodes, mode]
	)
	return (
		<section data-recording-key="virtual-tree-fixture">
			<div className="flex gap-4 mb-4">
				{["all", "tail", "empty", "nested"].map((name) => (
					<button key={name} onClick={() => setMode(name)}>
						{name}
					</button>
				))}
			</div>
			<div className="w-[380px] h-[540px]">
				<Panel className="h-full">
					<FileTree data={data} />
				</Panel>
			</div>
		</section>
	)
}
