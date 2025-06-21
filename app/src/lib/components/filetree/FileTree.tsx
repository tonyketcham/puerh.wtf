import Folder from "./Folder"
import type { TreeNode } from "../../types/tree"

interface FileTreeProps {
	data: TreeNode[]
}

export default function FileTree({ data }: FileTreeProps) {
	return (
		<div className="flex flex-col p-1 select-none">
			{data.map((datum) => (
				<Folder key={datum.id} title={datum.title} nodes={datum.children ?? []} />
			))}
		</div>
	)
}
