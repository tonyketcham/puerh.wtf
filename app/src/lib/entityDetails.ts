/**
 * The few entity fields a peek card shows that the relation index doesn't carry: descriptions,
 * vendor cities and sites, cultivar hanzi, origin coordinates and garden elevations, and what a
 * vessel is made of and holds.
 *
 * Loaded once by the root layout (one Flatbread round trip, next to getExplorerSessions) and
 * handed to the EntityPeek host, so opening a peek never fetches. Entries without anything to
 * add are dropped and descriptions are clipped to what the card shows, to keep the payload small.
 */
import { gql } from "graphql-request"
import * as flatbread from "@/lib/flatbread"
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

/** A peek shows three lines of description at most. */
const DESCRIPTION_MAX = 240

function clip(text: string | null | undefined): string | undefined {
	const t = (text || "").replace(/\s+/g, " ").trim()
	if (!t) return undefined
	if (t.length <= DESCRIPTION_MAX) return t
	const cut = t.slice(0, DESCRIPTION_MAX)
	return `${cut
		.slice(0, Math.max(cut.lastIndexOf(" "), DESCRIPTION_MAX * 0.6))
		.replace(/[,;:.\s]+$/, "")}…`
}

/** Drop undefined fields; null when nothing is left. */
function compact<T extends Record<string, unknown>>(entry: T): T | null {
	const out = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined))
	return Object.keys(out).length ? (out as T) : null
}

function bySlug<T extends Record<string, unknown>, R extends Record<string, unknown>>(
	list: (T & { _slug?: string | null })[] | null | undefined,
	map: (item: T) => R
): Record<string, R> {
	const out: Record<string, R> = {}
	for (const item of list || []) {
		if (!item?._slug) continue
		const entry = compact(map(item))
		if (entry) out[item._slug] = entry
	}
	return out
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)

type Raw = Record<string, unknown> & { _slug?: string | null }

export async function getEntityDetails(): Promise<EntityDetails> {
	const query = gql`
		query EntityPeekDetails {
			allOrigins {
				_slug
				description
				geo {
					lat
					lon
					precision
					radius_km
					elevation_m
					confidence
				}
			}
			allVendors {
				_slug
				description
				location
				municipality
				country
				links {
					website
				}
			}
			allStyles {
				_slug
				description
			}
			allCategories {
				_slug
				description
			}
			allVarietals {
				_slug
				hanzi
				description
			}
			allVessels {
				_slug
				hanzi
				kind
				material
				volume_ml
				image
				description
			}
		}
	`

	const data: Record<string, Raw[] | null> = await flatbread.request(query)

	return {
		origin: bySlug(data.allOrigins, (o: Raw) => {
			const geo = (o.geo || {}) as Record<string, unknown>
			const range = Array.isArray(geo.elevation_m)
				? (geo.elevation_m as unknown[]).map(num).filter((n): n is number => n !== undefined)
				: []
			return {
				description: clip(o.description as string),
				lat: num(geo.lat),
				lon: num(geo.lon),
				precision: (geo.precision as OriginKind) || undefined,
				radius_km: num(geo.radius_km),
				elevation: range.length
					? ([range[0], range[range.length - 1]] as [number, number])
					: undefined,
				confidence: (geo.confidence as OriginPeekDetail["confidence"]) || undefined,
			}
		}),
		vendor: bySlug(data.allVendors, (v: Raw) => {
			const place = [v.location, v.municipality, v.country]
				.map((p) => (typeof p === "string" ? p.trim() : ""))
				.filter((p, i, all) => p && all.indexOf(p) === i)
				.join(", ")
			const links = (v.links || {}) as Record<string, unknown>
			return {
				description: clip(v.description as string),
				place: place || undefined,
				website: typeof links.website === "string" && links.website ? links.website : undefined,
			}
		}),
		style: bySlug(data.allStyles, (s: Raw) => ({ description: clip(s.description as string) })),
		category: bySlug(data.allCategories, (c: Raw) => ({
			description: clip(c.description as string),
		})),
		cultivar: bySlug(data.allVarietals, (c: Raw) => ({
			description: clip(c.description as string),
			hanzi: typeof c.hanzi === "string" && c.hanzi.trim() ? c.hanzi.trim() : undefined,
		})),
		vessel: bySlug(data.allVessels, (v: Raw) => ({
			description: clip(v.description as string),
			hanzi: str(v.hanzi),
			kind: str(v.kind),
			material: str(v.material),
			volume_ml: num(v.volume_ml),
			image: str(v.image),
		})),
	}
}
