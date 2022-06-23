<script context="module" lang="ts">
	import type { LoadEvent } from '@sveltejs/kit';
	import type { TastingPreview } from '$lib/types/tasting';
	import type { Vendor } from '$lib/types/vendor';
	import type { Category } from '$lib/types/category';

	export async function load({ fetch }: LoadEvent) {
		const tastingRes = await fetch('/api/tastings.json');
		const vendorsRes = await fetch('/api/vendors.json');
		const categoriesRes = await fetch('/api/categories.json');

		return {
			status: vendorsRes.status,
			props: {
				tastings: tastingRes.ok && ((await tastingRes.json()).allTastings as TastingPreview[]),
				vendors: vendorsRes.ok && ((await vendorsRes.json()).allVendors as Vendor[]),
				categories: categoriesRes.ok && ((await categoriesRes.json()).allCategories as Category[])
			}
		};
	}
</script>

<script lang="ts">
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import Panel from '$lib/components/containers/Panel.svelte';
	import '../app.css';
	import FileTree from '$lib/components/filetree/FileTree.svelte';

	export let tastings: TastingPreview[] = [];
	export let vendors: Vendor[] = [];
	export let categories: Category[] = [];
</script>

<svelte:head>
	<title>puerh.wtf - a tea log</title>
</svelte:head>

<div class="relative flex flex-row">
	<div id="background" class="absolute inset-0" />
	<div class="fixed z-20 flex flex-col w-[340px] h-screen p-8 space-y-10 pointer-events-none">
		<SiteHeader />
		<Panel id="nav">
			<div slot="header" class="flex space-x-2 place-items-center justify-between">
				<h2>Explorer</h2>
				<!-- TODO: add search -->
			</div>
			<FileTree
				data={[
					{ id: 'sessions', title: 'Sessions', children: tastings },
					{ id: 'vendors', title: 'Vendors', children: vendors },
					{ id: 'categories', title: 'Categories', children: categories }
				]}
			/>
		</Panel>
	</div>
	<div class="relative z-0 flex-1">
		<slot />
	</div>
	<div class="fixed z-20 flex flex-col w-[340px] right-0 h-screen p-8 pointer-events-none">
		<Panel id="details">
			<!-- <SiteHeader slot="header" /> -->
		</Panel>
	</div>
</div>
