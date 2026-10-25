import type { IncomingMessage, ServerResponse } from "node:http"
export interface CmsHandlerOptions {
	env?: Record<string, string | undefined>
	fetch?: typeof globalThis.fetch
	now?: () => number
}
export function createCmsHandler(
	options?: CmsHandlerOptions
): (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => Promise<void>
declare const handler: ReturnType<typeof createCmsHandler>
export default handler
