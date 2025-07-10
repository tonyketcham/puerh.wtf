import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import TestPageWrapper from "@/lib/components/TestPageWrapper"
import type { SessionFlavorAxes } from "@/lib/types/session"

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

export default function RadarChartMinTest() {
	return (
		<TestPageWrapper>
			<div className="min-h-screen p-8 bg-gray-900">
				<div className="max-w-2xl mx-auto">
					<h1 className="mb-8 text-2xl font-bold text-white">
						Radar Chart Test - All Axes at Minimum (0)
					</h1>
					<div className="w-full p-4 bg-gray-800 rounded-lg h-96">
						<RadarChart data={minAxesData} recordingKey="radar-chart-min" />
					</div>
				</div>
			</div>
		</TestPageWrapper>
	)
}
