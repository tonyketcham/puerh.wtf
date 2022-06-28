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
	import Giscus from '@giscus/svelte';
	import type { SessionFull } from '$lib/types/session';
	import { onMount } from 'svelte';

	export let session: SessionFull;
	$: images = session?.images ?? [];

	onMount(() => {
		window.scrollTo(0, 0);
	});
</script>

<article class="px-56 pt-6 pb-8">
	<section class="relative top-0 block w-[calc(100vw-45rem)] mx-auto">
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
		<div class="relative flex flex-col xl:flex-row space-y-4 xl:space-y-0 xl:space-x-4 mt-3">
			<div class="xl:sticky top-24 space-y-4">
				{#if images.length > 0}
					<div class="rounded-xl border border-heicha-700/50 overflow-hidden">
						<img src={images[0].image} alt={images[0].alt} class="object-cover image-zoom" />
					</div>
				{/if}
				{#if images.length > 3}
					{#each images as _, i}
						{#if i > 2}
							<div class="rounded-xl border border-heicha-700/50 overflow-hidden">
								<img src={images[i].image} alt={images[i].alt} class="object-cover image-zoom" />
							</div>
						{/if}
					{/each}
				{/if}
			</div>
			<div class="space-y-3.5">
				<div class="flex flex-col xl:flex-row justify-between space-y-4 xl:space-y-0 xl:space-x-4">
					{#if images.length > 1}
						<div class="w-1/2 rounded-xl border border-heicha-700/50 overflow-hidden">
							<img
								src={images[1].image}
								alt={images[1].alt}
								class="aspect-square object-cover m-0 image-zoom"
							/>
						</div>
					{/if}
					{#if images.length > 2}
						<div class="w-1/2 rounded-xl border border-heicha-700/50 overflow-hidden">
							<img
								src={images[2].image}
								alt={images[2].alt}
								class="aspect-square object-cover m-0 image-zoom"
							/>
						</div>
					{/if}
				</div>
				<div
					class="session-body-content prose text-bai-cha-100 prose-headings:text-bai-cha-100 prose-h3:text-xl prose-li:marker:text-bai-cha-100/80 prose-li:text-sm prose-p:text-sm prose-li:text-neutral-300 prose-a:text-tea-soup-400 prose-strong:text-bai-cha-50 z-10 relative"
				>
					{@html session._content.html}
				</div>
			</div>
		</div>
		<div class="w-11/12 mx-auto h-0.5 bg-heicha-700/20 mt-16 mb-8" />
		<section>
			<Giscus
				id="comments"
				repo="tonyketcham/puerh.wtf"
				repoId="MDEwOlJlcG9zaXRvcnkzMTMwMzU3OTA="
				category="Teas I've logged"
				categoryId="DIC_kwDOEqiMDs4CP6yW"
				mapping="pathname"
				reactionsEnabled="1"
				emitMetadata="0"
				inputPosition="top"
				theme="transparent_dark"
				lang="en"
				loading="lazy"
			/>
		</section>
	</section>
</article>

<style lang="postcss">
	.image-zoom {
		@apply hover:scale-125 transform-gpu transition-transform;
	}
</style>
