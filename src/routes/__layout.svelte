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

	export let vendors: Vendor[] = [];
</script>

<div class="relative flex flex-row">
	<div class="fixed h-screen p-8 w-80">
		<Panel>
			<SiteHeader slot="header" />
			<SidebarNav {vendors} />
		</Panel>
	</div>
	<div class="relative left-80 right-80">
		<slot />
	</div>
</div>
