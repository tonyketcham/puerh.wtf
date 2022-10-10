<script lang="ts">
	import AxisRadial from '$lib/components/dataviz/radar/elements/AxisRadial.svelte';
	import Radar from '$lib/components/dataviz/radar/elements/Radar.svelte';

	import { LayerCake, Svg } from 'layercake';

	// Define some data
	const data = [{ name: 'Allison', fastball: 10, change: 0, slider: 2, cutter: 4, curve: 8 }];

	const seriesKey = 'name';
	const xKey = ['fastball', 'change', 'slider', 'cutter', 'curve'];

	const seriesNames = Object.keys(data[0]).filter((d) => d !== seriesKey);
</script>

<div class="w-full h-56">
	<LayerCake {data} x={xKey} xDomain={[0, 10]} xRange={[0, 10]}>
		<Svg>
			<AxisRadial />
			<Radar />
		</Svg>
	</LayerCake>
</div>
