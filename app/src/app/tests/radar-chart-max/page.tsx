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

export default function RadarChartMaxTest() {
	return (
		<TestPageWrapper>
			<div className="min-h-screen p-8 bg-gray-900">
				<div className="max-w-2xl mx-auto">
					<h1 className="mb-8 text-2xl font-bold text-white">
						Radar Chart Test - All Axes at Maximum (10)
					</h1>
					<div className="w-full p-4 bg-gray-800 rounded-lg h-96">
						<RadarChart data={maxAxesData} recordingKey="radar-chart-max" />
					</div>
				</div>
			</div>
		</TestPageWrapper>
	)
}
