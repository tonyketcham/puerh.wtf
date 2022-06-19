<script context="module" lang="ts">
	import type { LoadEvent } from '@sveltejs/kit';

	export async function load({ params, url, fetch }: LoadEvent) {
		const apiURL = `/api/tastings/${params.year}/${params.month}/${params.slug}.json`;
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
	import type { TastingFull } from '$lib/types/tasting';

	export let session: TastingFull;
</script>

<article class="relative inset-0 h-screen px-56 py-6 parallax">
	<div class="absolute inset-0 w-full px-56 top-96 parallax__layer--back">
		<img src="/images/uploads/1988-wuyi_4.jpeg" alt="Test" width="500" />
	</div>
	<section class="relative top-0 block w-full h-screen mx-28 parallax__layer--base contrast-2003">
		<h2 class="font-display text-[121px] leading-[113.7%] text-shadow-md">
			{session.production_year} <br /><span
				class="block mr-80 -word-spacing-9"
				style="font-size: clamp(64px, 6vw, 121px); line-height: clamp(100%, 6vw, 113.7%);"
				>{session.title}</span
			>
		</h2>
		<div
			class="session-body-content py-10 prose text-white prose-headings:text-white prose-h3:before:content-['###_'] prose-h3:before:opacity-50 prose-li:marker:text-white/50 session-body text-shadow-lg"
		>
			{@html session.content.html}
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
	.session-body-content {
		@apply text-shadow-md;
	}
</style>
