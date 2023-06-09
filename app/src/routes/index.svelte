<script context="module" lang="ts">
	export const prerender = true;

	import type { LoadEvent } from '@sveltejs/kit';
	import type { SessionPreviewWithFeatureImage } from '$lib/types/session';

	export async function load({ fetch }: LoadEvent) {
		const tastingRes = await fetch('/api/sessions.json?limit=10&withImages=true');

		return {
			status: tastingRes.status,
			props: {
				sessions:
					tastingRes.ok &&
					((await tastingRes.json()).allSessions as SessionPreviewWithFeatureImage[])
			}
		};
	}
</script>

<script lang="ts">
	import SessionCard from '$lib/components/SessionCard.svelte';
	import Heading2 from '$lib/components/typography/Heading2.svelte';

	export let sessions: SessionPreviewWithFeatureImage[] = [];
</script>

<div class="relative inset-0 h-screen pl-56 py-6 space-y-1.5 mx-28">
	<section class="block w-full">
		<Heading2>A tea log</Heading2>
		<p class="max-w-prose">
			...for documenting tea sessions to learn complexities like terroir in retrospect while
			focusing more on an individual tea.
		</p>
	</section>
	<section class="space-y-2.5">
		<h3 class="my-4 text-sm text-tea-soup-400">🫖 recents</h3>
		{#each sessions as session}
			<SessionCard {session} />
		{/each}
	</section>
</div>
