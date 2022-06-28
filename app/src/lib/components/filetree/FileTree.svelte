<script lang="ts">
	import Folder from '$lib/components/filetree/Folder.svelte';
	import type { TreeNode } from '$lib/types/tree';

	export let data: TreeNode[] = [];
</script>

<ul class="flex flex-col p-1 select-none">
	{#each data as datum, _ (datum.id)}
		<li>
			<Folder title={datum.title} nodes={datum.children ?? []} />
		</li>
	{/each}
</ul>
