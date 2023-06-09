<script lang="ts">
	import { onMount } from 'svelte';

	const data = {
		cream: {
			start: 4,
			finish: 7
		},
		umami: {
			start: 4,
			finish: 4
		},
		stone: {
			start: 5,
			finish: 4
		},
		spices: {
			start: 7,
			finish: 6
		},
		earth: {
			start: 7,
			finish: 7
		},
		nuts_roast: {
			start: 6,
			finish: 5
		},
		wood: {
			start: 8,
			finish: 8
		},
		vegetal: {
			start: 0,
			finish: 0
		},
		floral: {
			start: 4,
			finish: 4
		},
		fruits: {
			start: 5,
			finish: 5
		}
	} as const;

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

	const flattenSeriesData = (keyedSeriesData: Record<Series, number>) =>
		Object.entries(keyedSeriesData).map(([_, value]) => value);

	const formatPoints = (points: Point[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

	const wellFormedData = Object.entries(data).map(([axisKey, keyedSeriesData], i) => {
		return {
			axis: {
				index: i,
				key: axisKey as AxisKey,
				label: getAxisLabel(axisKey as AxisKey),
				polygonPoint: generatePolygonPoint(i)
			},
			value: flattenSeriesData(keyedSeriesData)
		};
	});

	let svg: SVGElement;
	let polygonGroup: SVGElement;
	let textGroup: SVGGElement;

	$: polygonPoints = wellFormedData.map(({ axis }) => axis.polygonPoint);
	$: polygonPointsString = formatPoints(polygonPoints);
	$: polygonMarkers = [2, 4, 6, 8].map((magnitude) => generatePolygon(magnitude));

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
	</g>
</svg>

<style>
	svg * {
		transform-box: fill-box;
		transform-origin: 50% 50%;
	}
</style>
