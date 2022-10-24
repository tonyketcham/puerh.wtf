<script lang="ts">
	export let label = '';
	export let alignment = 'center';
	export let flexDirection = 'row';
</script>

<li class="flex flex-{flexDirection} justify-between w-full space-x-2 place-items-{alignment}">
	{#if label}
		<span class="text-bai-cha-200/60">{label}</span>
	{/if}
	<slot />
</li>
