import { createServer } from "node:http"
import { createCmsHandler } from "./handler.mjs"

const port = Number(process.env.CMS_PORT || 7379)
const handler = createCmsHandler()
const server = createServer((req, res) => {
	const path = new URL(req.url, "http://localhost").pathname
	if (path !== "/api/cms") {
		res.writeHead(404)
		res.end("Not found")
		return
	}
	handler(req, res)
})
server.listen(port, "127.0.0.1", () =>
	process.stdout.write(`CMS API listening on http://127.0.0.1:${port}/api/cms\n`)
)
