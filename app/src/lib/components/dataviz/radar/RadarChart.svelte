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
	let series = Series.Start;

	$: dataSeries = Object.entries(data).reduce(
		(acc, [label, axes]) => ({
			...acc,
			[label]: axes[series]
		}),
		{}
	);

	// TODO: add a transition to and fro the finish series of data
	// Series enum to array
	// $: seriesArray = Object.entries(Series).map(([_, value]) => value);
	$: seriesArray = [Series.Start];

	$: dataSeriesArray = seriesArray.map((series) => {
		return Object.entries(data).reduce(
			(acc, [label, axes]) => ({
				...acc,
				[label]: axes[series]
			}),
			{}
		);
	});

	const seriesKey = 'series';
	$: seriesNames = Object.keys(dataSeries).filter((d) => d !== seriesKey);

	const handleXRange = ({ height }: { height: number }) => [0, height / 2];

	// TODO: alternate between start / finish series
	// onMount(() => {
	// 	const interval = setInterval(() => {
	// 		series = series === Series.Start ? Series.Finish : Series.Start;
	// 	}, 2000);

	// 	return () => {
	// 		clearInterval(interval);
	// 	};
	// });
</script>

<div class="w-full h-48">
	<LayerCake
		padding={{ top: 28, right: 28, bottom: 28, left: 28 }}
		x={seriesNames}
		xDomain={[0, 10]}
		xRange={handleXRange}
		extents={{ x: [0, 10] }}
		data={dataSeriesArray}
	>
		<Svg>
			<AxisRadial />
			<Radar />
		</Svg>
	</LayerCake>
</div>
