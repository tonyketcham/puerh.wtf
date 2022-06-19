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
			<div slot="header" class="flex space-x-2 place-items-center">
				<svg
					width="19"
					height="22"
					viewBox="0 0 19 22"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M1.11322 3V19C1.11322 19.5304 1.3299 20.0391 1.71559 20.4142C2.10128 20.7893 2.62439 21 3.16984 21H15.5096C16.055 21 16.5781 20.7893 16.9638 20.4142C17.3495 20.0391 17.5662 19.5304 17.5662 19V7.342C17.5662 7.07556 17.5114 6.81181 17.4051 6.56624C17.2988 6.32068 17.1431 6.09824 16.9472 5.912L12.3815 1.57C11.9972 1.20466 11.4812 1.00007 10.9439 1H3.16984C2.62439 1 2.10128 1.21071 1.71559 1.58579C1.3299 1.96086 1.11322 2.46957 1.11322 3V3Z"
						stroke="#EDC446"
						stroke-width="1.25"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M6.25482 11H12.4247"
						stroke="white"
						stroke-width="1.25"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M6.25482 16H9.33976"
						stroke="white"
						stroke-width="1.25"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M11.3964 1.5V5C11.3964 5.53043 11.613 6.03914 11.9987 6.41421C12.3844 6.78929 12.9075 7 13.453 7H17"
						stroke="#EDC446"
						stroke-width="1.25"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>

				<h2>Explorer</h2>
			</div>
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
