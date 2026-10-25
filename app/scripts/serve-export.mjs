import { createServer } from "node:http"
import { access, readFile, stat } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const types = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	// Next's exported router loads Flight payloads from index.txt and accepts text/plain.
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".webp": "image/webp",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
}

/** Serve actual export files, including RSC payloads; never fall back to the home page. */
export function createExportServer(root) {
	const directory = resolve(root)
	return createServer(async (request, response) => {
		if (request.method !== "GET" && request.method !== "HEAD") {
			response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed")
			return
		}
		try {
			const url = new URL(request.url, "http://localhost")
			const pathname = decodeURIComponent(url.pathname)
			let file = resolve(directory, `.${pathname}`)
			if (file !== directory && !file.startsWith(directory + sep)) {
				response.writeHead(403).end("Forbidden")
				return
			}
			if ((await stat(file)).isDirectory()) {
				if (!url.pathname.endsWith("/")) {
					response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end()
					return
				}
				file = resolve(file, "index.html")
			}
			const data = await readFile(file)
			response.writeHead(200, {
				"Content-Type": types[extname(file)] || "application/octet-stream",
				"Content-Length": data.length,
				"Cache-Control": "no-store",
			})
			response.end(request.method === "HEAD" ? undefined : data)
		} catch (error) {
			response.writeHead(error instanceof URIError ? 400 : 404)
			response.end(request.method === "HEAD" ? undefined : "Not found")
		}
	})
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = fileURLToPath(new URL("../out/", import.meta.url))
	await access(resolve(root, "index.html")).catch(() => {
		throw new Error("No static export found. Build the app before running test:export.")
	})
	const port = Number(process.argv[2] || 3300)
	createExportServer(root).listen(port, "127.0.0.1", () => {
		console.log(`Static export on http://127.0.0.1:${port}`)
	})
}
