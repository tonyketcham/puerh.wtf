<script lang="ts">
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import Panel from '$lib/components/containers/Panel.svelte';
	import FileTree from '$lib/components/filetree/FileTree.svelte';
	import type { SessionPreview } from '$lib/types/session';

	export let sessions: SessionPreview[] = [];
	// export let vendors: Vendor[] = [];
	// export let categories: Category[] = [];
</script>

<div class="fixed z-20 flex flex-col w-[340px] h-screen p-8 space-y-10 pointer-events-none">
	<SiteHeader />
	<Panel id="nav">
		<div slot="header" class="flex justify-between space-x-2 place-items-center">
			<h2>Explorer</h2>
			<!-- TODO: add search -->
		</div>
		<FileTree
			data={[
				{ id: 'sessions', title: 'Sessions', children: sessions }
				// { id: 'vendors', title: 'Vendors', children: vendors },
				// { id: 'categories', title: 'Categories', children: categories }
			]}
		/>
	</Panel>
</div>
