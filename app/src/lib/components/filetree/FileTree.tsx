import Folder from "./Folder"
import type { TreeNode } from "../../types/tree"

interface FileTreeProps {
	data: TreeNode[]
}

export default function FileTree({ data }: FileTreeProps) {
	return (
		<div className="flex flex-col select-none">
			{data.map((node) => {
				return <Folder key={node.id} title={node.title} nodes={node.children ?? []} />
			})}
		</div>
	)
}
