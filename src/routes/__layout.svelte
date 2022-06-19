<script context="module" lang="ts">
	import type { LoadEvent } from '@sveltejs/kit';

	export async function load({ fetch }: LoadEvent) {
		const url = '/api/vendors.json';
		const response = await fetch(url);

		return {
			status: response.status,
			props: {
				vendors: response.ok && ((await response.json()).allVendors as Vendor[])
			}
		};
	}
</script>

<script lang="ts">
	import type { Vendor } from 'src/routes/api/vendors/index.json';

	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import SidebarNav from '$lib/components/SidebarNav.svelte';
	import Panel from '$lib/components/containers/Panel.svelte';
	import '../app.css';

	// export let vendors: Vendor[] = [];
</script>

<svelte:head>
	<title>puerh.wtf - a tea log</title>
</svelte:head>

<div class="relative flex flex-row">
	<div class="fixed z-20 flex flex-col w-[340px] h-screen p-8 space-y-10">
		<SiteHeader />
		<Panel id="nav">
			<SidebarNav />
		</Panel>
	</div>
	<div class="relative z-0 flex-1">
		<slot />
	</div>
	<div class="fixed z-20 flex flex-col w-[340px] right-0 h-screen p-8">
		<Panel id="details">
			<!-- <SiteHeader slot="header" /> -->
			<SidebarNav />
		</Panel>
	</div>
</div>
