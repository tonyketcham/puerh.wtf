<script lang="ts">
	export let color: string;
	export let title: string;
</script>

<div class="flex flex-row justify-end space-x-2 place-items-center">
	{#if color}
		<div class="flex-shrink-0">
			<div class="w-2.5 h-2.5 rounded-full" style="background-color: {color};" />
		</div>
	{/if}
	<span class="flex-shrink">{title}</span>
</div>
