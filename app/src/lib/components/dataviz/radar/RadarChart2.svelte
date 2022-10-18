<!-- WIP vanilla component closer to the design -->
<script lang="ts">
	import type { SessionFlavorAxes } from '$lib/types/session';
	import { onMount } from 'svelte';

	export let data: SessionFlavorAxes;

	// Don't display the radar until mounted and transformed
	let isLoading = true;

	/**
	 * The min/max values for each category.
	 */
	const range = [0, 10];

	enum Series {
		Start = 'start',
		Finish = 'finish'
	}

	//
	// The key / label for each category.
	//

	type AxisKey = keyof typeof axisKeyToLabelMap;
	type AxisLabel = typeof axisKeyToLabelMap[AxisKey];

	/**
	 * Radar axes key <-> label pairs
	 */
	const axisKeyToLabelMap = {
		cream: 'cream',
		umami: 'umami',
		stone: 'stone',
		spices: 'spices',
		earth: 'earth',
		nuts_roast: 'roast',
		wood: 'wood',
		vegetal: 'vegetal',
		floral: 'floral',
		fruits: 'fruits'
	} as const;

	function getAxisLabel(key: AxisKey): AxisLabel {
		const label = axisKeyToLabelMap[key];

		if (!label) {
			throw new Error(`No label found for key: ${key}`);
		}

		return label;
	}

	type Point = [x: number, y: number];

	const polyDimensions = [200, 200] as const;
	const viewboxToPolyRatio = 1.375;
	const viewBox = [0, 0, ...polyDimensions.map((d) => d * viewboxToPolyRatio)];

	// Generate (i+1)-sided svg polygon point at side i for 100 x 100 viewbox
	const generatePolygonPoint = (i: number, magnitude: number = range[1]): Point => {
		const scale = magnitude / range[1];
		const angle = (i * 2 * Math.PI - Math.PI) / Object.keys(data).length;
		const x = (Math.cos(angle) * 100 + polyDimensions[0] / 2) * scale;
		const y = (Math.sin(angle) * 100 + polyDimensions[1] / 2) * scale;
		return [x, y];
	};

	const generatePolygon = (scale: number) => {
		if (scale < range[0] || scale > range[1]) {
			throw new Error(`Scale must be between ${range}, got ${scale}`);
		}

		return formatPoints(Object.keys(data).map((_, i) => generatePolygonPoint(i, scale)));
	};

	const formatPoints = (points: Point[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

	const wellFormedData = Object.entries(data).map(([axisKey, keyedSeriesData], i) => {
		const valueSet = keyedSeriesData;

		return {
			axis: {
				index: i,
				key: axisKey as AxisKey,
				label: getAxisLabel(axisKey as AxisKey),
				polygonPoint: generatePolygonPoint(i)
			},
			value: valueSet,
			valuePoints: Object.entries(keyedSeriesData).reduce(
				(acc, [key, value]) => ({
					...acc,
					[key]: generatePolygonPoint(i, value)
				}),
				{} as Record<Series, Point>
			)
		};
	});

	let svg: SVGElement;
	let polygonGroup: SVGElement;
	let textGroup: SVGGElement;
	let dataPoints: SVGElement;

	$: polygonPoints = wellFormedData.map(({ axis }) => axis.polygonPoint);
	$: polygonPointsString = formatPoints(polygonPoints);
	$: polygonMarkers = [2, 4, 6, 8].map((magnitude) => generatePolygon(magnitude));

	// Current series to display
	$: series = Series.Start;
	// Current series data
	$: seriesData = wellFormedData.map(({ axis, value, valuePoints }) => ({
		axis,
		value,
		valuePoint: valuePoints[series]
	}));
	$: seriesPolygonPointsString = formatPoints(seriesData.map(({ valuePoint }) => valuePoint));
	// $: () => {
	// 	const transform = transformToCenter(dataPoints);
	// 	dataPoints?.setAttribute('transform', transform);
	// };

	function transformToCenter(nodeToTransform: SVGElement) {
		const { height: containerHeight } = svg?.getBoundingClientRect();
		const { height } = nodeToTransform?.getBoundingClientRect();

		// We want this to strictly be square
		const translateY = (containerHeight - height) / 2;

		return `translate(${translateY}, ${translateY})`;
	}

	function anchorXYRelativeToPoint(point: Point, label: string) {
		const [x, y] = point;
		const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBox;
		const xPercent = ((x - viewBoxX) / viewBoxWidth) * viewboxToPolyRatio;
		const yPercent = ((y - viewBoxY) / viewBoxHeight) * viewboxToPolyRatio;

		// Account for floating point rounding errors for centering on ~0.5
		const anchorXWithPadding =
			xPercent > 0.5
				? { 'text-anchor': 'start', dx: '0.4em' }
				: xPercent >= 0.49
				? { 'text-anchor': 'middle' }
				: { 'text-anchor': 'end', dx: '-0.4em' };

		const anchorYWithPadding =
			yPercent > 0.5
				? { 'dominant-baseline': 'hanging', dy: '0.4em' }
				: yPercent >= 0.49
				? { 'dominant-baseline': 'middle' }
				: { 'dominant-baseline': 'baseline', dy: '-0.4em' };

		return { x: x, y: y, ...anchorXWithPadding, ...anchorYWithPadding };
	}

	onMount(() => {
		const transform = transformToCenter(polygonGroup);
		textGroup?.setAttribute('transform', transform);

		// set polygon origin to center
		polygonGroup.childNodes.forEach((node) => {
			const childTransform = transformToCenter(node as SVGElement);
			(node as SVGElement).setAttribute('transform', childTransform);
		});

		isLoading = false;

		setInterval(() => {
			// series = series === Series.Finish ? Series.Start : Series.Finish;
		}, 2500);
	});
</script>

<svg
	bind:this={svg}
	viewBox={viewBox.join(' ')}
	xmlns="http://www.w3.org/2000/svg"
	preserveAspectRatio="xMidYMid meet"
	class="flex flex-col w-full h-full stroke-current place-content-center transition-opacity {isLoading
		? 'opacity-0'
		: 'opacity-100'}"
>
	<g>
		<g bind:this={polygonGroup}>
			<polygon points={polygonPointsString} fill="none" class="opacity-60" />
			{#each polygonMarkers as polygonMarker, i}
				<polygon points={polygonMarker} fill="none" style="opacity: {(i + 1) * 0.05};" />
			{/each}
		</g>
		<g bind:this={textGroup} class="select-none">
			{#each wellFormedData as datum, _ (datum.axis.key)}
				<text
					{...anchorXYRelativeToPoint(datum.axis.polygonPoint, datum.axis.label)}
					class="text-[0.66rem] text-center font-light opacity-70 fill-current"
					>{datum.axis.label}</text
				>
			{/each}
		</g>
		<polygon
			points={seriesPolygonPointsString}
			transform={`translate(50,50)`}
			class="opacity-60"
			style="		transform-box: fill-box;
		transform-origin: 50% 50%;"
		/>
	</g>
</svg>

<style>
	svg * {
		transform-box: fill-box;
		transform-origin: 50% 50%;
	}
</style>
