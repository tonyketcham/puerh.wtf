/** Shared entity detail payloads for peeks and command results, with no server dependencies. */
import type { OriginKind } from "@/lib/types/origin"

export type OriginPeekDetail = {
	description?: string
	lat?: number
	lon?: number
	precision?: OriginKind
	radius_km?: number
	/** typical garden range in meters */
	elevation?: [number, number]
	confidence?: "high" | "medium" | "low"
}

export type VendorPeekDetail = {
	description?: string
	/** "Kunming, Yunnan, China" */
	place?: string
	website?: string
}

export type TextPeekDetail = {
	description?: string
	hanzi?: string
}

export type VesselPeekDetail = {
	description?: string
	hanzi?: string
	/** gaiwan, teapot, shiboridashi, chawan */
	kind?: string
	material?: string
	volume_ml?: number
	/** a session photo that shows it */
	image?: string
}

export type EntityDetails = {
	origin: Record<string, OriginPeekDetail>
	vendor: Record<string, VendorPeekDetail>
	style: Record<string, TextPeekDetail>
	category: Record<string, TextPeekDetail>
	cultivar: Record<string, TextPeekDetail>
	vessel: Record<string, VesselPeekDetail>
}

export const EMPTY_ENTITY_DETAILS: EntityDetails = {
	origin: {},
	vendor: {},
	style: {},
	category: {},
	cultivar: {},
	vessel: {},
}
