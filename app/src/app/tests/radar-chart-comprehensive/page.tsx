import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import TestPageWrapper from "@/lib/components/TestPageWrapper"
import type { SessionFlavorAxes } from "@/lib/types/session"

const maxAxesData: SessionFlavorAxes = {
	vegetal: { start: 10, finish: 10 },
	floral: { start: 10, finish: 10 },
	fruits: { start: 10, finish: 10 },
	spices: { start: 10, finish: 10 },
	wood: { start: 10, finish: 10 },
	earth: { start: 10, finish: 10 },
	nuts_roast: { start: 10, finish: 10 },
	cream: { start: 10, finish: 10 },
	stone: { start: 10, finish: 10 },
	umami: { start: 10, finish: 10 },
}

const minAxesData: SessionFlavorAxes = {
	vegetal: { start: 0, finish: 0 },
	floral: { start: 0, finish: 0 },
	fruits: { start: 0, finish: 0 },
	spices: { start: 0, finish: 0 },
	wood: { start: 0, finish: 0 },
	earth: { start: 0, finish: 0 },
	nuts_roast: { start: 0, finish: 0 },
	cream: { start: 0, finish: 0 },
	stone: { start: 0, finish: 0 },
	umami: { start: 0, finish: 0 },
}

const mixedAxesData: SessionFlavorAxes = {
	vegetal: { start: 3, finish: 7 },
	floral: { start: 8, finish: 2 },
	fruits: { start: 6, finish: 9 },
	spices: { start: 2, finish: 4 },
	wood: { start: 9, finish: 6 },
	earth: { start: 4, finish: 8 },
	nuts_roast: { start: 7, finish: 3 },
	cream: { start: 1, finish: 5 },
	stone: { start: 5, finish: 7 },
	umami: { start: 8, finish: 9 },
}

const singleHighAxesData: SessionFlavorAxes = {
	vegetal: { start: 0, finish: 0 },
	floral: { start: 10, finish: 10 },
	fruits: { start: 0, finish: 0 },
	spices: { start: 0, finish: 0 },
	wood: { start: 0, finish: 0 },
	earth: { start: 0, finish: 0 },
	nuts_roast: { start: 0, finish: 0 },
	cream: { start: 0, finish: 0 },
	stone: { start: 0, finish: 0 },
	umami: { start: 0, finish: 0 },
}

export default function RadarChartComprehensiveTest() {
	return (
		<TestPageWrapper>
			<div className="min-h-screen p-8 bg-gray-900">
				<div className="max-w-6xl mx-auto">
					<h1 className="mb-8 text-3xl font-bold text-center text-white">Radar Chart Test Suite</h1>

					<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
						{/* All Axes at Maximum (10) */}
						<div className="p-6 bg-gray-800 rounded-lg">
							<h2 className="mb-4 text-xl font-semibold text-white">All Axes at Maximum (10)</h2>
							<div className="w-full h-80">
								<RadarChart data={maxAxesData} recordingKey="radar-chart-max-comprehensive" />
							</div>
							<p className="mt-2 text-sm text-gray-400">
								Perfect circle - all flavor axes at maximum intensity
							</p>
						</div>

						{/* All Axes at Minimum (0) */}
						<div className="p-6 bg-gray-800 rounded-lg">
							<h2 className="mb-4 text-xl font-semibold text-white">All Axes at Minimum (0)</h2>
							<div className="w-full h-80">
								<RadarChart data={minAxesData} recordingKey="radar-chart-min-comprehensive" />
							</div>
							<p className="mt-2 text-sm text-gray-400">
								Center point - no flavor intensity detected
							</p>
						</div>

						{/* Mixed Values */}
						<div className="p-6 bg-gray-800 rounded-lg">
							<h2 className="mb-4 text-xl font-semibold text-white">
								Mixed Values (Realistic Profile)
							</h2>
							<div className="w-full h-80">
								<RadarChart data={mixedAxesData} recordingKey="radar-chart-mixed-comprehensive" />
							</div>
							<p className="mt-2 text-sm text-gray-400">
								Varied intensity - typical tea flavor profile
							</p>
						</div>

						{/* Single High Axis */}
						<div className="p-6 bg-gray-800 rounded-lg">
							<h2 className="mb-4 text-xl font-semibold text-white">
								Single Dominant Axis (Floral)
							</h2>
							<div className="w-full h-80">
								<RadarChart
									data={singleHighAxesData}
									recordingKey="radar-chart-single-comprehensive"
								/>
							</div>
							<p className="mt-2 text-sm text-gray-400">
								Strong single characteristic - highly floral tea
							</p>
						</div>
					</div>

					<div className="p-6 mt-12 bg-gray-800 rounded-lg">
						<h2 className="mb-4 text-xl font-semibold text-white">Test Notes</h2>
						<ul className="space-y-2 text-gray-300">
							<li>
								• The radar chart visualizes 10 flavor axes: vegetal, floral, fruits, spices, wood,
								earth, nuts_roast, cream, stone, umami
							</li>
							<li>• Values range from 0 (no intensity) to 10 (maximum intensity)</li>
							<li>• The chart currently uses only the 'start' values for visualization</li>
							<li>• All axes at 10 creates a perfect circle touching the outer ring</li>
							<li>• All axes at 0 creates a single point at the center</li>
						</ul>
					</div>
				</div>
			</div>
		</TestPageWrapper>
	)
}
