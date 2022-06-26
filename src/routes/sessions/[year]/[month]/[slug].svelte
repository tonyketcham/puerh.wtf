<script context="module" lang="ts">
	export const prerender = true;
	import type { LoadEvent } from '@sveltejs/kit';

	export async function load({ params, url, fetch }: LoadEvent) {
		const apiURL = `/api/sessions/${params.year}/${params.month}/${params.slug}.json`;
		const res = await fetch(apiURL);

		if (res.ok) {
			return {
				status: res.status,
				props: {
					session: await res.json(),
					year: params.year,
					slug: params.slug,
					path: url.pathname
				}
			};
		}

		return {
			status: res.status,
			error: new Error(`Could not load ${url}`)
		};
	}
</script>

<script lang="ts">
	import type { SessionFull } from '$lib/types/session';

	export let session: SessionFull;
	$: images = session?.images ?? [];
</script>

<article class="relative inset-0 h-screen px-56 py-6 parallax">
	<div class="absolute inset-0 px-72 top-72 space-y-8 parallax__layer--back">
		{#if images.length > 0}
			<img
				src={images[0].image}
				alt={images[0].alt}
				class="aspect-square w-5/12 object-cover rounded-xl border border-heicha-700/50"
			/>
		{/if}
		{#if images.length > 3}
			{#each images as image, i}
				{#if i > 2}
					<img
						src={images[i].image}
						alt={images[i].alt}
						class="aspect-square w-5/12 object-cover rounded-xl border border-heicha-700/50"
					/>
				{/if}
			{/each}
		{/if}
	</div>
	<section
		class="relative top-0 block h-screen parallax__layer--base w-[calc(100vw-45rem)] mx-auto"
	>
		<h2 class="font-display text-6xl leading-tight text-shadow-lg py-5">
			{#if session.production_year}
				<span
					class="block max-w-max text-5xl px-1 py-2 bg-heicha-700/50 border border-white/5 rounded-xl"
					>{session.production_year}</span
				>
			{/if}
			<span class="block -word-spacing-9" style="font-size: clamp(16px, 6vw, 60px);"
				>{session.title}</span
			>
		</h2>
		<div
			class="w-7/12 px-6 pb-24 ml-auto session-body-content mt-3 mb-6 prose text-bai-cha-100 prose-headings:text-bai-cha-100 prose-h3:text-xl prose-li:marker:text-bai-cha-100/80 prose-li:text-sm prose-li:text-neutral-300"
		>
			<div class="flex flex-col xl:flex-row space-y-4 xl:space-y-0 xl:space-x-4">
				{#if images.length > 1}
					<img
						src={images[1].image}
						alt={images[1].alt}
						class="aspect-square xl:w-1/2 max-h-max object-cover rounded-xl border border-heicha-700/50 m-0"
					/>
				{/if}
				{#if images.length > 2}
					<img
						src={images[2].image}
						alt={images[2].alt}
						class="aspect-square xl:w-1/2 object-cover rounded-xl border border-heicha-700/50 m-0"
					/>
				{/if}
			</div>
			{@html session._content.html}
		</div>
	</section>
</article>

<style lang="postcss">
	.parallax {
		perspective: 1px;
		@apply overflow-x-hidden overflow-y-auto;
	}
	.parallax__layer--base {
		transform: translateZ(0);
	}
	.parallax__layer--back {
		transform: translateZ(-1px) scale(2);
	}
</style>
