/**
 * Origin map state shared between the map and the status bar (plan §4.5 step 7): which layers
 * are on. IDE-style toggles live in the status bar; the map reads them.
 *
 * - contours: Tanaka contour bands (off leaves coast, rivers and the points)
 * - ridges:   raise the ridgeline relief over the six tea mountains (it also shows on its own
 *             at the top of /origins, and flattens as you scroll)
 * - rivers:   rivers and lakes
 * - supply:   supply lines, an arc from each origin to the city its vendor ships from
 *
 * (Storage places arrive with structured storage in Phase 6.)
 */
import { atom } from "jotai"

export type MapLayer = "contours" | "ridges" | "rivers" | "supply"
export type MapLayers = Record<MapLayer, boolean>

export const MAP_LAYERS: readonly { id: MapLayer; label: string; title: string }[] = [
	{ id: "contours", label: "contours", title: "Contour lines, lit from the north-west" },
	{ id: "ridges", label: "ridges", title: "Ridgelines over the six tea mountains" },
	{ id: "rivers", label: "rivers", title: "Rivers and lakes" },
	{ id: "supply", label: "supply lines", title: "From each origin to its vendor's city" },
]

export const mapLayersAtom = atom<MapLayers>({
	contours: true,
	ridges: false,
	rivers: true,
	supply: false,
})

export const toggleMapLayerAtom = atom(null, (get, set, layer: MapLayer) => {
	const layers = get(mapLayersAtom)
	set(mapLayersAtom, { ...layers, [layer]: !layers[layer] })
})
