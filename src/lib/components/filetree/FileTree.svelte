<script lang="ts">
	import Folder from '$lib/components/filetree/Folder.svelte';
	import type { TreeNode } from '$lib/types/tree';

	export let data: TreeNode[] = [];

	let expandedNodes: string[] = [];
</script>

<ul class="flex flex-col py-2">
	{#each data as datum, _ (datum.id)}
		<li>
			<Folder title={datum.title} nodes={datum.children ?? []} />
		</li>
	{/each}
</ul>
