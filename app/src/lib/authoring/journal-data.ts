import { FLAVOR_AXES, NOTE_STAGES, type SessionFull } from "@/lib/types/session"
import type { OriginRef } from "@/lib/types/origin"
import type { EntityPageData } from "@/lib/content/entities"
import { SHARED, DETAILS } from "@/lib/components/map/geo"
import type { MapPoint } from "@/lib/components/map/points"
import { blendColors, buildEntityModel, liftedColor } from "@/lib/components/entity/page/model"
import {
	buildRelationIndex,
	related,
	entityKeys,
	sessionsOf,
	sessionColor,
	type RelationIndex,
} from "@/lib/relations"
import type { DotMapPoint } from "@/lib/components/entity/page/DotMap"
import type { PageKind } from "@/lib/peek"
import type { CmsDocument, Collection } from "./types"
import { assetPublicPath } from "./documents"
import { recordImages } from "./preview-media"

export const recordSlug = (doc: CmsDocument) => doc.path.split("/").pop()!.replace(/\.md$/, "")
const object = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const string = (v: unknown) => (typeof v === "string" ? v : "")
const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
export function journalSession(
	doc: CmsDocument,
	documents: readonly CmsDocument[],
	urls: Record<string, string> = {}
): SessionFull {
	const data = doc.data
	const find = (collection: Collection, id: unknown) =>
		documents.find((d) => d.collection === collection && d.id === id)
	const refs = (
		collection: Collection,
		ids: unknown
	): (Record<string, unknown> & { id: string; _slug: string; title: string })[] =>
		(Array.isArray(ids) ? ids : ids ? [ids] : []).flatMap((id) => {
			const d = find(collection, id)
			return d ? [{ ...d.data, id: d.id, _slug: recordSlug(d), title: string(d.data.title) }] : []
		})
	const origin = (id: unknown, seen = new Set<string>()): OriginRef | null => {
		const d = find("origins", id)
		if (!d || seen.has(d.id) || seen.size > 8) return null
		return {
			...d.data,
			id: d.id,
			_slug: recordSlug(d),
			title: string(d.data.title),
			parent: origin(d.data.parent, new Set([...seen, d.id])),
		} as OriginRef
	}
	const origins = (Array.isArray(data.origin) ? data.origin : data.origin ? [data.origin] : [])
		.map((id) => origin(id))
		.filter((o): o is OriginRef => !!o)
	const styles = refs("styles", data.style).map((d) => {
		const c = find("categories", d.category)
		return {
			...d,
			color: string(d.color) || null,
			category: c
				? { _slug: recordSlug(c), title: string(c.data.title), color: string(c.data.color) || null }
				: null,
		}
	})
	return {
		id: doc.id,
		_slug: recordSlug(doc),
		_collection: "Session",
		title: string(data.title) || "Untitled session",
		tea_name: string(data.tea_name),
		date: string(data.date),
		excerpt: string(data.excerpt),
		production_year: number(data.production_year),
		style: styles,
		vendor: refs("vendors", data.vendor),
		origin: origins,
		origin_note: data.origin_note ?? null,
		cultivar: refs("cultivars", data.cultivar),
		tags: refs("tags", data.tags),
		vessel: refs("vessels", data.vessel),
		author: refs("authors", data.author),
		storage: data.storage ?? null,
		harvest: data.harvest ?? null,
		season_note: data.season_note ?? null,
		elevation: data.elevation ?? null,
		aging_conditions: data.aging_conditions ?? null,
		rating: number(data.rating) ?? 0,
		purchase_link: data.purchase_link ?? null,
		picking: data.picking ?? null,
		notes: Object.fromEntries(NOTE_STAGES.map((key) => [key, string(object(data.notes)[key])])),
		flavor_axes: Object.fromEntries(
			FLAVOR_AXES.map((key) => [
				key,
				{
					start: number(object(object(data.flavor_axes)[key]).start) ?? 0,
					finish: number(object(object(data.flavor_axes)[key]).finish) ?? 0,
				},
			])
		),
		brewing: data.brewing ?? null,
		images: recordImages(doc).map((im) => ({
			image: urls[assetPublicPath(im.image)] || assetPublicPath(im.image),
			alt: im.alt || "",
			caption: im.caption,
		})),
		_content: { html: "" },
	} as unknown as SessionFull
}
const kinds: Partial<Record<Collection, PageKind>> = {
	vendors: "vendor",
	origins: "origin",
	styles: "style",
	categories: "category",
	cultivars: "cultivar",
	vessels: "vessel",
}
export function journalEntity(
	doc: CmsDocument,
	documents: readonly CmsDocument[]
): EntityPageData | null {
	const kind = kinds[doc.collection]
	if (!kind) return null
	const d = doc.data,
		parentCollection = doc.collection === "styles" ? "categories" : "origins"
	const ancestors: EntityPageData["ancestors"] = []
	let parent = d.parent || d.category
	const seen = new Set([doc.id])
	while (typeof parent === "string" && !seen.has(parent)) {
		seen.add(parent)
		const p = documents.find((item) => item.id === parent && item.collection === parentCollection)
		if (!p) break
		ancestors.unshift({
			kind: kinds[p.collection]!,
			slug: recordSlug(p),
			title: string(p.data.title),
			hanzi: string(p.data.hanzi) || null,
		})
		parent = p.data.parent
	}
	const bases: Record<string, string> = {
		instagram: "https://www.instagram.com/",
		facebook: "https://www.facebook.com/",
		twitter: "https://x.com/",
		youtube: "https://www.youtube.com/@",
	}
	const links = Object.entries(object(d.links)).flatMap(([label, value]) => {
		if (typeof value !== "string" || !value.trim()) return []
		const href = /^https?:\/\//i.test(value)
			? value
			: bases[label]
			? bases[label] + value.replace(/^@/, "")
			: "https://" + value
		return /^https?:\/\//i.test(href) ? [{ label, href }] : []
	})
	const facts = ["material", "volume_ml", "municipality", "country", "location"].flatMap((key) =>
		d[key] == null || d[key] === ""
			? []
			: [
					{
						label: key === "volume_ml" ? "capacity" : key,
						value: String(d[key]) + (key === "volume_ml" ? " mL" : ""),
					},
			  ]
	)
	return {
		kind,
		slug: recordSlug(doc),
		id: doc.id,
		title: string(d.title) || "Untitled " + kind,
		hanzi: string(d.hanzi) || null,
		pinyin: string(d.pinyin) || null,
		color: string(d.color) || null,
		image: string(d.image) || null,
		description: string(d.description) || null,
		contentHtml: null,
		ancestors,
		children: documents
			.filter((c) =>
				kind === "style"
					? c.collection === "cultivars" &&
					  Array.isArray(c.data.styles) &&
					  c.data.styles.includes(doc.id)
					: kind === "cultivar"
					? c.collection === "styles" && Array.isArray(d.styles) && d.styles.includes(c.id)
					: c.data.parent === doc.id || c.data.category === doc.id
			)
			.flatMap((c) =>
				kinds[c.collection]
					? [{ kind: kinds[c.collection]!, slug: recordSlug(c), title: string(c.data.title) }]
					: []
			),
		facts,
		geo:
			d.geo && Number.isFinite(object(d.geo).lat) && Number.isFinite(object(d.geo).lon)
				? (d.geo as EntityPageData["geo"])
				: null,
		originKind: (d.kind as EntityPageData["originKind"]) ?? null,
		groups: Array.isArray(d.groups) ? d.groups : [],
		place:
			[d.location, d.municipality, d.country]
				.filter((p, i, all) => typeof p === "string" && p.trim() && all.indexOf(p) === i)
				.join(", ") || null,
		links,
		nearby: [],
		vessel:
			doc.collection === "vessels"
				? {
						kind: string(d.kind) || null,
						material: string(d.material) || null,
						volume_ml: number(d.volume_ml),
				  }
				: null,
	}
}

/** Use the same relation rollups and liquor accents as EntityPageServer's sourcing map. */
export function journalSourcingPoints(
	entity: EntityPageData,
	documents: readonly CmsDocument[],
	index: RelationIndex
): DotMapPoint[] {
	if (!["vendor", "cultivar", "style", "category"].includes(entity.kind)) return []
	const own = sessionsOf(index, entity.kind, entity.slug)
	const accent = buildEntityModel(index, entity.kind, entity.slug).accentText
	return related(index, entity.kind, entity.slug, "origin", { rollup: false }).flatMap(
		({ node, count }) => {
			const doc = documents.find((d) => d.collection === "origins" && recordSlug(d) === node.slug)
			const geo = object(doc?.data.geo)
			if (
				!doc ||
				doc.data.kind === "unknown" ||
				!Number.isFinite(geo.lat) ||
				!Number.isFinite(geo.lon)
			)
				return []
			const there = own.filter((s) =>
				entityKeys(s, "origin", { rollup: false }).includes(node.slug)
			)
			return [
				{
					slug: node.slug,
					title: string(doc.data.title),
					lat: Number(geo.lat),
					lon: Number(geo.lon),
					count,
					color:
						entity.kind === "style" || entity.kind === "category"
							? there.length
								? liftedColor(blendColors(there.map(sessionColor)))
								: undefined
							: accent,
				},
			]
		}
	)
}
/** Project current catalog coordinates into the visitor map's shared Mercator frame. */
export function journalMapPoints(documents: readonly CmsDocument[]): MapPoint[] {
	return documents
		.filter((d) => d.collection === "origins")
		.flatMap((doc) => {
			const entity = journalEntity(doc, documents),
				geo = object(doc.data.geo)
			if (
				!entity ||
				doc.data.kind === "unknown" ||
				!Number.isFinite(geo.lat) ||
				!Number.isFinite(geo.lon)
			)
				return []
			const lat = Number(geo.lat),
				lon = Number(geo.lon),
				[x, y] = SHARED.forward(lon, lat),
				radiusKm = number(geo.radius_km) || 0
			const elevations = Array.isArray(geo.elevation_m)
				? geo.elevation_m.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
				: []
			return [
				{
					slug: entity.slug,
					title: entity.title,
					hanzi: entity.hanzi,
					pinyin: entity.pinyin,
					kind: string(doc.data.kind) || "unknown",
					precision: string(geo.precision) || "unknown",
					radiusKm,
					r: SHARED.kmToUnits(radiusKm, lat),
					x,
					y,
					lat,
					lon,
					elevation: elevations.length
						? ([elevations[0], elevations[elevations.length - 1]] as [number, number])
						: null,
					parent: entity.ancestors.at(-1)?.slug || null,
					ancestors: entity.ancestors.map((a) => a.slug).reverse(),
					detail: DETAILS.some((d) => d.id === entity.slug),
				},
			]
		})
}

/** Include only the session cards actually rendered by the native entity page. */
export function previewDocuments(
	document: CmsDocument | undefined,
	catalog: readonly CmsDocument[] = []
): CmsDocument[] {
	if (!document) return []
	const entity = journalEntity(document, catalog)
	if (!entity) return [document]
	const sessions = catalog.filter((d) => d.collection === "tastings")
	const index = buildRelationIndex(sessions.map((d) => journalSession(d, catalog)))
	const ids = new Set(sessionsOf(index, entity.kind, entity.slug).map((s) => s.id))
	return [document, ...sessions.filter((d) => ids.has(d.id))]
}
