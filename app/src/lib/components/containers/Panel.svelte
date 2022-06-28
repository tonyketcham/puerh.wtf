<script lang="ts">
	import { draggable } from '@neodrag/svelte';
	import { getContext, onMount } from 'svelte';

	export let id = '';

	const { getMainContent } = getContext('mainContent');
	let mainContentContainer: HTMLElement;

	onMount(() => {
		mainContentContainer = getMainContent();
	});

	let handle: HTMLDivElement;
	let offset: { x: number; y: number } = { x: 0, y: 0 };
	let isDragging = false;
</script>

<section
	{id}
	class="flex flex-col w-full flex-grow overflow-hidden h-full rounded-2xl border border-white/5 box-border bg-heicha-700 backdrop-brightness-50 backdrop-blur-[48px] transition-opacity duration-200 ease-in-out {isDragging
		? 'bg-opacity-80 border-white/30'
		: 'bg-opacity-40'}"
	style="box-shadow: 0px 8px 14px rgba(0, 0, 0, 0.1);"
	use:draggable={{
		axis: 'both',
		bounds: 'body',
		handle,
		defaultClassDragging: 'bg-heicha-700/80',
		position: { x: offset.x, y: offset.y },
		onDragEnd: ({ offsetX, offsetY }) => {
			offset = { x: offsetX, y: offsetY };
		}
	}}
>
	{#if $$slots.header}
		<div
			bind:this={handle}
			class="bg-heicha-600/5 py-3 px-4 border-b cursor-grab pointer-events-auto {isDragging
				? 'curosr-grabbing border-white/30'
				: 'cursor-grab border-white/5'}"
			on:wheel={(e) => {
				mainContentContainer.scrollTop += e.deltaY;
			}}
			on:mousedown={() => {
				isDragging = true;
			}}
			on:mouseup={() => {
				isDragging = false;
			}}
			on:dblclick={() => {
				offset = { x: 0, y: 0 };
			}}
		>
			<slot name="header" />
		</div>
	{/if}
	<div class="max-h-full overscroll-y-auto pointer-events-auto" style="overflow-y: overlay">
		<slot />
	</div>
</section>
