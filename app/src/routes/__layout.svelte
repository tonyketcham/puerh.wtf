<script context="module" lang="ts">
	export const prerender = true;

	import type { LoadEvent } from '@sveltejs/kit';
	import type { SessionPreview } from '$lib/types/session';
	import type { Vendor } from '$lib/types/vendor';
	import type { Category } from '$lib/types/category';

	export async function load({ fetch }: LoadEvent) {
		const tastingRes = await fetch('/api/sessions.json');
		const vendorsRes = await fetch('/api/vendors.json');
		const categoriesRes = await fetch('/api/categories.json');

		return {
			status: vendorsRes.status,
			props: {
				sessions: tastingRes.ok && ((await tastingRes.json()).allSessions as SessionPreview[]),
				vendors: vendorsRes.ok && ((await vendorsRes.json()).allVendors as Vendor[]),
				categories: categoriesRes.ok && ((await categoriesRes.json()).allCategories as Category[])
			}
		};
	}
</script>

<script lang="ts">
	import '../app.css';
	import { setContext } from 'svelte';
	import NavSidebar from '$lib/components/NavSidebar.svelte';

	export let sessions: SessionPreview[] = [];

	// ref to the site content container
	let site: HTMLElement;
	setContext('siteContent', {
		getSiteContent: () => site
	});
</script>

<svelte:head>
	<title>puerh.wtf - a tea log</title>
</svelte:head>

<div bind:this={site} class="relative flex flex-row">
	<NavSidebar {sessions} />
	<slot />
</div>
