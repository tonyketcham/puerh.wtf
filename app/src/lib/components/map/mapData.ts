"use client"

/**
 * Map JSON from /public/maps, fetched once per URL and shared by every map on the page (the
 * Properties inset, a peek, the origin hero). A page that already drew an inset hands the
 * same object to the hero it morphs into, synchronously, so the morph never lands on an
 * empty frame.
 */
import { useEffect, useRef, useSyncExternalStore } from "react"

type Entry = { data?: unknown; error?: unknown; promise: Promise<unknown> }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Fetch (once) and cache a map JSON. */
export function loadMapJson<T>(url: string): Promise<T> {
	let entry = entries.get(url)
	if (!entry) {
		const promise = fetch(url)
			.then((res) => {
				if (!res.ok) throw new Error(`${url}: ${res.status}`)
				return res.json()
			})
			.then(
				(data) => {
					entry!.data = data
					notify()
					return data
				},
				(error) => {
					entry!.error = error
					// a failed fetch may be retried by the next reader
					entries.delete(url)
					notify()
					throw error
				}
			)
		entry = { promise }
		entries.set(url, entry)
	}
	return entry.promise as Promise<T>
}

/** Already-loaded JSON, or undefined. */
export const cachedMapJson = <T>(url: string | null | undefined): T | undefined =>
	url ? (entries.get(url)?.data as T | undefined) : undefined

const subscribe = (l: () => void) => {
	listeners.add(l)
	return () => {
		listeners.delete(l)
	}
}

/** The JSON at `url` once it has loaded (null before, and for a null url). */
export function useMapJson<T>(url: string | null | undefined): T | null {
	const data = useSyncExternalStore(
		subscribe,
		() => cachedMapJson<T>(url) ?? null,
		() => null
	)
	useEffect(() => {
		if (url && !cachedMapJson(url)) loadMapJson(url).catch(() => {})
	}, [url])
	return data
}

/** Several JSONs at once: null until every one has loaded (stable array while unchanged). */
export function useMapJsonAll<T>(urls: readonly string[]): T[] | null {
	const key = urls.join("\n")
	const last = useRef<{ key: string; list: T[] } | null>(null)
	const getSnapshot = () => {
		const list = urls.map((u) => cachedMapJson<T>(u))
		if (!list.length || list.some((d) => d === undefined)) return null
		const prev = last.current
		if (prev && prev.key === key && prev.list.every((d, i) => d === list[i])) return prev.list
		last.current = { key, list: list as T[] }
		return last.current.list
	}
	const data = useSyncExternalStore(subscribe, getSnapshot, () => null)
	useEffect(() => {
		for (const u of key ? key.split("\n") : [])
			if (!cachedMapJson(u)) loadMapJson(u).catch(() => {})
	}, [key])
	return data
}

/** Warm the cache ahead of need (hover intent, a click about to navigate). */
export function prefetchMapJson(url: string | null | undefined) {
	if (url && !cachedMapJson(url)) loadMapJson(url).catch(() => {})
}

// ---------------------------------------------------------------------------
// Organic edge masks (8-bit grayscale PNGs, scripts/geo/lib/masks.mjs)
// ---------------------------------------------------------------------------

/**
 * A decoded mask: `image` carries the gray as alpha (for destination-in compositing), `gray` the
 * values themselves (to test, at a point, how much of a layer shows).
 */
export type MapMask = { image: ImageBitmap; gray: Uint8ClampedArray; w: number; h: number }

const masks = new Map<string, { data?: MapMask; promise: Promise<MapMask> }>()

/** Fetch and decode (once) a mask PNG. */
export function loadMapMask(url: string): Promise<MapMask> {
	let entry = masks.get(url)
	if (!entry) {
		const promise = (async () => {
			const img = new Image()
			img.src = url
			await img.decode()
			const w = img.naturalWidth
			const h = img.naturalHeight
			const read = document.createElement("canvas")
			read.width = w
			read.height = h
			const ctx = read.getContext("2d", { willReadFrequently: true })!
			ctx.drawImage(img, 0, 0)
			const px = ctx.getImageData(0, 0, w, h)
			const gray = new Uint8ClampedArray(w * h)
			for (let i = 0; i < gray.length; i++) {
				gray[i] = px.data[i * 4]
				px.data[i * 4] = 0
				px.data[i * 4 + 1] = 0
				px.data[i * 4 + 2] = 0
				px.data[i * 4 + 3] = gray[i]
			}
			const mask = { image: await createImageBitmap(px), gray, w, h }
			entry!.data = mask
			notify()
			return mask
		})()
		promise.catch(() => masks.delete(url))
		entry = { promise }
		masks.set(url, entry)
	}
	return entry.promise
}

/** An already-decoded mask, or undefined. */
export const cachedMapMask = (url: string | null | undefined): MapMask | undefined =>
	url ? masks.get(url)?.data : undefined

/** Warm a mask ahead of need. */
export function prefetchMapMask(url: string | null | undefined) {
	if (url && !masks.has(url)) loadMapMask(url).catch(() => {})
}
