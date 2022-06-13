<script lang="ts">
	import type { Vendor } from 'src/routes/api/vendors/index.json';

	export let vendors: Vendor[] = [];
</script>

<ul class="flex flex-col">
	{#each vendors as vendor, _ (vendor.id)}
		<li>
			<button class="w-full px-4 py-2 text-left hover:bg-tea-soup-400 hover:text-heicha-800">
				<span>{vendor.title}</span>
			</button>
		</li>
	{:else}
		<p>Error fetching vendors</p>
	{/each}
</ul>
