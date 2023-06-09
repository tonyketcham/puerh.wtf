<script lang="ts">
	import Panel from '$lib/components/containers/Panel.svelte';
	import { setContext } from 'svelte';

	let site: HTMLElement;
	setContext('siteContent', {
		getSiteContent: () => site
	});
</script>

<main bind:this={site} class="relative z-0 flex-1">
	<slot />
</main>
<div class="fixed z-20 flex flex-col w-[340px] right-0 h-screen p-8 pointer-events-none">
	<Panel id="details">
		<div slot="header" class="flex justify-between space-x-2 place-items-center">
			<h2>Details</h2>
			<!-- TODO: add search -->
		</div>
		<slot name="details" />
	</Panel>
</div>
