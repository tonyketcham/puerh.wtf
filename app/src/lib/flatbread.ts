/**
 * The one Flatbread GraphQL client every server module shares (api.ts, entityDetails.ts, entity
 * page data).
 *
 * A static build prerenders ~450 pages across Next's workers, each running several pages at once,
 * and the root layout alone asks for every session, vendor, category and peek detail on every
 * page. Unchecked, that is hundreds of simultaneous requests against the single Flatbread
 * server, which starts refusing connections (ECONNREFUSED) under the load. So, in production:
 *
 * - **memoized per process:** content can't change mid-build, so a query with the same
 *   variables runs once per worker and later pages get a structured clone of the result
 *   (a clone, so a caller sorting or mutating its copy can't leak into another page)
 * - **capped:** at most MAX_IN_FLIGHT requests per worker are on the wire at a time
 * - **retried:** connection errors back off and retry, so a momentary refusal isn't a failed page
 *
 * In development every request goes straight through, so content edits show on reload.
 */
import { GraphQLClient } from "graphql-request"

const client = new GraphQLClient(process.env.FLATBREAD_URL || "http://localhost:5057/graphql", {
	headers: {},
})

const isProduction = process.env.NODE_ENV === "production"

/** Requests on the wire per worker process. */
const MAX_IN_FLIGHT = 4
/** Retries after the first attempt; backoff doubles from BASE_DELAY_MS, with jitter. */
const RETRIES = 6
const BASE_DELAY_MS = 150

let inFlight = 0
const waiting: Array<() => void> = []

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
	if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve))
	inFlight++
	try {
		return await run()
	} finally {
		inFlight--
		waiting.shift()?.()
	}
}

/** Errors worth retrying: the server was busy or the socket dropped, not a bad query. */
function isTransient(error: unknown): boolean {
	const seen = new Set<unknown>()
	let current: unknown = error
	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current)
		const { code, message } = current as { code?: unknown; message?: unknown }
		if (
			typeof code === "string" &&
			/^(ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET)$/.test(code)
		)
			return true
		if (typeof message === "string" && /fetch failed|socket hang up|ECONNREFUSED|ECONNRESET/.test(message))
			return true
		current = (current as { cause?: unknown }).cause
	}
	return false
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function send<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await withSlot(() => client.request<T>(query, variables))
		} catch (error) {
			if (attempt >= RETRIES || !isTransient(error)) throw error
			await sleep(BASE_DELAY_MS * 2 ** attempt * (0.75 + Math.random() * 0.5))
		}
	}
}

const results = new Map<string, Promise<unknown>>()

/** Run a Flatbread query (memoized, capped and retried during a production build). */
export async function request<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
	if (!isProduction) return client.request<T>(query, variables)

	const key = `${query}\u0000${JSON.stringify(variables ?? {})}`
	let hit = results.get(key) as Promise<T> | undefined
	if (!hit) {
		hit = send<T>(query, variables)
		// a failed request shouldn't poison the worker for every later page
		hit.catch(() => results.delete(key))
		results.set(key, hit)
	}
	return structuredClone(await hit)
}
