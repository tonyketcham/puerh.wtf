<script lang="ts">
	import type { SessionFull } from '$lib/types/session';

	export let session: SessionFull;

	import RadarChart from '$lib/components/dataviz/radar/RadarChart.svelte';
	import DetailsListItem from '$lib/components/DetailsListItem.svelte';
	import PartitionedDivider from '$lib/components/PartitionedDivider.svelte';
	import TeaStyleBadge from '$lib/components/TeaStyleBadge.svelte';

	function formatUrlReference(url: string, postfix: string) {
		const preppedURL = /\?/.test(url) ? url + '&' : url + '?';
		return preppedURL + postfix;
	}

	function extractHostname(url: string) {
		const hostname = new URL(url).hostname;
		// remove www. from hostname if it exists
		return hostname.replace(/^www\./, '');
	}
</script>

<div class="flex flex-col space-y-7">
	<section class="w-full text-bai-cha-200">
		<RadarChart data={session.flavor_axes} />
	</section>

	<ul class="w-full p-2 space-y-3 overflow-hidden text-xs text-bai-cha-200">
		<li>
			<section>
				<h3 class="my-4 text-sm text-tea-soup-400">💽 deets</h3>
				<ul class="w-full space-y-2">
					<DetailsListItem label="excerpt" alignment="start">
						<p class="text-right">{session.excerpt}</p>
					</DetailsListItem>
					<DetailsListItem label="logged_on">
						<time
							>{new Intl.DateTimeFormat('default', {
								year: 'numeric',
								month: 'numeric',
								day: 'numeric',
								hour: 'numeric',
								minute: 'numeric'
							}).format(new Date(session.date))}</time
						>
					</DetailsListItem>

					{#if session.style || session.production_year || session.season || session.elevation || session.aging_conditions}
						<PartitionedDivider />
					{/if}
					{#if session.style && session.style.length > 0}
						<DetailsListItem label="style" alignment="start">
							<div class="w-2/3 space-y-0.5 text-right">
								{#each session.style as genre, _ (genre.id)}
									<TeaStyleBadge color={genre.color ?? genre.category.color} title={genre.title} />
								{/each}
							</div>
						</DetailsListItem>
					{/if}
					{#if session.production_year}
						<DetailsListItem label="production_year">
							<span>{session.production_year}</span>
						</DetailsListItem>
					{/if}
					{#if session.season}
						<DetailsListItem label="season">
							<span>{session.season}</span>
						</DetailsListItem>
					{/if}
					{#if session.elevation}
						<DetailsListItem label="elevation">
							<span>{session.elevation}m</span>
						</DetailsListItem>
					{/if}
					{#if session.aging_conditions}
						<DetailsListItem label="aging" alignment="start">
							<span class="text-right">{session.aging_conditions}</span>
						</DetailsListItem>
					{/if}

					{#if session.vendor || session.purchase_link}
						<PartitionedDivider />
					{/if}
					{#if session.vendor}
						<DetailsListItem label="vendor">
							<div class="flex flex-row space-x-2 truncate place-items-center">
								{#if session.vendor[0].image}
									<img
										src={session.vendor[0].image}
										alt="{session.vendor[0].title} logo"
										class="box-content object-cover object-center w-6 h-6 border rounded-full border-tea-soup-400 bg-heicha-500/30"
									/>
								{/if}
								<span class="truncate">{session.vendor[0].title}</span>
							</div>
						</DetailsListItem>
					{/if}
					{#if session.purchase_link}
						<DetailsListItem label="purchase">
							<div class="flex flex-row space-x-2 truncate place-items-center">
								<a
									href={formatUrlReference(session.purchase_link, 'ref=puerhwtf')}
									target="_blank"
									class="truncate text-tea-soup-400 hover:text-tea-soup-500/80 motion-safe:transition-all"
									>{extractHostname(session.purchase_link)}</a
								>
							</div>
						</DetailsListItem>
					{/if}
				</ul>
			</section>
		</li>

		<PartitionedDivider />
		<li>
			<section>
				<h3 class="my-4 text-sm text-tea-soup-400">📓 notes</h3>
				<ul class="w-full space-y-2">
					{#each Object.entries(session.notes) as [label, description], _ (label)}
						<DetailsListItem {label} alignment="start">
							<span class="w-7/12 text-left">{description}</span>
						</DetailsListItem>
					{/each}
				</ul>
			</section>
		</li>
	</ul>
</div>
