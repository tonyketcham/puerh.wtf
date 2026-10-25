import type { IncomingMessage, ServerResponse } from "node:http"
import handler from "../server/cms/handler.mjs"

// Native Vercel Function: intentionally outside the statically exported Next app.
export default function cms(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
	return handler(req, res)
}
