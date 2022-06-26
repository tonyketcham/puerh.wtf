<script lang="ts">
	export let id = '';
</script>

<section
	{id}
	class="flex flex-col w-full flex-grow overflow-hidden h-full rounded-2xl border border-white/5 box-border bg-heicha-700/[0.35]"
	style="box-shadow: 0px 8px 14px rgba(0, 0, 0, 0.1);
	backdrop-filter: blur(48px);"
>
	{#if $$slots.header}
		<div class="bg-heicha-600/5 py-3 px-4 border-b border-white/5">
			<slot name="header" />
		</div>
	{/if}
	<div class="max-h-full overscroll-y-auto pointer-events-auto" style="overflow-y: overlay">
		<slot />
	</div>
</section>
