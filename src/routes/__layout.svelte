<script>
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import Panel from '$lib/components/containers/Panel.svelte';

	import '../app.css';
</script>

<div class="flex flex-row">
	<div class="h-screen p-8 w-80">
		<Panel>
			<SiteHeader slot="header" />
			<!-- <p>This is the layout component. It's used to wrap the entire application.</p> -->
		</Panel>
	</div>
	<slot />
</div>
