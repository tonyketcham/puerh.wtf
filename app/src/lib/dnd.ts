/**
 * Native HTML drag-and-drop contract for dragging a session (e.g. from the Explorer tree)
 * onto a drop target (e.g. the Flavor Profile radar → compare).
 *
 * Payload: dataTransfer.setData(SESSION_DRAG_MIME, slug). A text/plain copy (the session path)
 * is also set so drops into other apps degrade gracefully.
 */
export const SESSION_DRAG_MIME = "application/x-puerh-session"

export function setSessionDragData(dataTransfer: DataTransfer, slug: string, href?: string) {
	dataTransfer.setData(SESSION_DRAG_MIME, slug)
	if (href) dataTransfer.setData("text/plain", href)
	dataTransfer.effectAllowed = "copyLink"
}

/**
 * True while a session drag is over a target. Only `types` is readable during dragenter /
 * dragover (getData returns "" until drop), so use this to decide whether to accept.
 */
export function hasSessionDrag(dataTransfer: DataTransfer | null | undefined): boolean {
	return !!dataTransfer && Array.from(dataTransfer.types).includes(SESSION_DRAG_MIME)
}

/** The dragged session slug on drop, or null. */
export function getSessionDragSlug(dataTransfer: DataTransfer | null | undefined): string | null {
	const slug = dataTransfer?.getData(SESSION_DRAG_MIME)
	return slug ? slug : null
}
