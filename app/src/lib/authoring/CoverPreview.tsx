"use client"

import { useState } from "react"
import SessionCard from "@/lib/components/SessionCard"
import { journalSession } from "./journal-data"
import { previewAssetPaths } from "./preview-assets"
import { assetPublicPath } from "./documents"
import type { CmsDocument } from "./types"

/** The real shelf card, with navigation disabled while inspecting a local cover. */
export default function CoverPreview({
	document,
	documents,
	urls,
}: {
	document: CmsDocument
	documents: readonly CmsDocument[]
	urls: Record<string, string>
}) {
	const [open, setOpen] = useState(false),
		[now] = useState(() => new Date())
	const session = journalSession(document, documents, urls)
	const cover = session.images?.[0]
	const waitingForUrls = previewAssetPaths([document]).some(
		(asset) => !urls[assetPublicPath(asset.path)]
	)
	if (!cover) return null
	return (
		<details className="cms-cover-preview" onToggle={(e) => setOpen(e.currentTarget.open)}>
			<summary>Preview shelf cover</summary>
			{open &&
				(waitingForUrls ? (
					<p className="cms-muted" role="status">
						Preparing the cover preview…
					</p>
				) : (
					<>
						<figure
							role="img"
							aria-label={"Shelf cover preview for " + session.title + ". " + cover.alt}
						>
							<div
								className="cms-journal cms-shelf-tile"
								inert
								aria-hidden="true"
								data-cover-preview
							>
								<SessionCard session={session} variant="tile" now={now} />
							</div>
						</figure>
						<p className="cms-muted">
							Your first photo becomes the cover. The shelf crops it to fit; the full photo stays in
							the session.
						</p>
					</>
				))}
		</details>
	)
}
