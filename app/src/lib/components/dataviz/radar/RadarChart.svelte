<script lang="ts">
	import AxisRadial from '$lib/components/dataviz/radar/elements/AxisRadial.svelte';
	import Radar from '$lib/components/dataviz/radar/elements/Radar.svelte';
	import { LayerCake, Svg } from 'layercake';
	import type { SessionFlavorAxes } from '$lib/types/session';

	// Pull in some data
	export let data: SessionFlavorAxes;

	enum Series {
		Start = 'start',
		Finish = 'finish'
	}

	// Current series to display
	$: series = Series.Start;

	$: dataSeries = Object.entries(data).reduce(
		(acc, [label, axes]) => ({
			...acc,
			[label]: axes[series]
		}),
		{}
	);

	const seriesKey = 'series';
	$: seriesNames = Object.keys(dataSeries).filter((d) => d !== seriesKey);

	const handleXRange = ({ height }: { height: number }) => [0, height / 2];
</script>

<div class="w-full h-48">
	<LayerCake
		padding={{ top: 16, right: 4, bottom: 4, left: 4 }}
		x={seriesNames}
		xDomain={[0, 10]}
		xRange={handleXRange}
		data={[dataSeries]}
	>
		<Svg>
			<AxisRadial />
			<Radar />
		</Svg>
	</LayerCake>
</div>
