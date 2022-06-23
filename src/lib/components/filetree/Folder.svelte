<script lang="ts">
	import File from './File.svelte';
	import { slide } from 'svelte/transition';
	import type { TreeNode } from '$lib/types/tree';

	export let expanded = false;
	export let title: string;
	export let nodes: TreeNode[];

	function toggle() {
		expanded = !expanded;
	}
</script>

<div
	on:click={toggle}
	class="px-2.5 py-1.5 text-left flex space-x-2 place-items-center cursor-pointer"
>
	<svg
		width="6"
		height="6"
		viewBox="0 0 6 6"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		class="w-2 h-2 transition-transform duration-200"
		class:rotate-90={expanded}
	>
		<g opacity="0.4">
			<path d="M2 1L4 3L2 5" stroke="white" stroke-linecap="round" stroke-linejoin="round" />
		</g>
	</svg>

	<svg
		width="16"
		height="16"
		viewBox="0 0 16 16"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		class="w-4 h-4 text-bai-cha-50 flex-shrink-0"
	>
		<path
			d="M14.6666 12.6667V6C14.6666 5.64638 14.5262 5.30724 14.2761 5.05719C14.0261 4.80714 13.6869 4.66667 13.3333 4.66667H8.82398C8.57632 4.66666 8.33355 4.59767 8.1229 4.46744C7.91224 4.33721 7.74202 4.15088 7.63131 3.92933L7.03531 2.73733C6.92456 2.51569 6.75423 2.32929 6.54345 2.19905C6.33266 2.06881 6.08976 1.99988 5.84198 2H2.66665C2.31302 2 1.97389 2.14048 1.72384 2.39052C1.47379 2.64057 1.33331 2.97971 1.33331 3.33333V12.6667C1.33331 13.0203 1.47379 13.3594 1.72384 13.6095C1.97389 13.8595 2.31302 14 2.66665 14H13.3333C13.6869 14 14.0261 13.8595 14.2761 13.6095C14.5262 13.3594 14.6666 13.0203 14.6666 12.6667Z"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
	<span class="font-normal opacity-60">{title}</span>
</div>

{#if expanded}
	<ul transition:slide={{ duration: 300 }} class="pl-4">
		{#each nodes as node}
			<li>
				{#if node?.children}
					<svelte:self {...node} />
				{:else}
					<File {node} />
				{/if}
			</li>
		{/each}
	</ul>
{/if}
