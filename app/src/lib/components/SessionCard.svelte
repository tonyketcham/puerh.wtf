<script lang="ts">
	import type { SessionPreviewWithFeatureImage } from '$lib/types/session';
	import { buildLink } from '$lib/utils/BuildLinkToGivenCollectionNode';

	export let session: SessionPreviewWithFeatureImage;
</script>

<article
	class="box-border relative w-full overflow-hidden border group h-28 rounded-2xl border-white/5 bg-heicha-700 bg-opacity-40"
>
	<a sveltekit:prefetch href={buildLink(session)} class="flex flex-row divide-x-2 divide-white/5">
		<div class="flex flex-col justify-center flex-shrink-0 w-40 h-full overflow-hidden">
			<img
				src={session.images?.[0].image}
				alt={session.images?.[0].alt}
				class="object-cover image-zoom"
			/>
		</div>
		<div class="p-5">
			<h3 class="text-2xl">
				{#if session.production_year}
					<span class="opacity-80 group-hover:opacity-100 group-hover:text-white">
						{session.production_year}
					</span>
				{/if}
				<span class="opacity-80 group-hover:opacity-100 group-hover:text-tea-soup-500">
					{session.title}
				</span>
			</h3>
			<p class="text-bai-cha-200 opacity-60 group-hover:opacity-80">{session.excerpt}</p>
		</div>
	</a>
	<div class="absolute top-2.5 right-2.5">
		<span
			class="block w-3 h-3 rounded-2xl"
			style="background-color: {session?.style?.[0]?.category.color}"
		/>
	</div>
</article>
