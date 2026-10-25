"use client"
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Provider, createStore } from "jotai"
import { useMotionValue, useMotionValueEvent } from "motion/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import FlowAroundArticle from "@/lib/components/session/FlowAroundArticle"
import SessionCarousel from "@/lib/components/session/SessionCarousel"
import PanelSection from "@/lib/components/containers/PanelSection"
import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import PhaseScrubber from "@/lib/components/dataviz/radar/PhaseScrubber"
import { radarAccent } from "@/lib/components/dataviz/radar/geometry"
import { ProvenancePanelsView } from "@/lib/components/properties/ProvenancePanels"
import NotesPanel from "@/lib/components/properties/NotesPanel"
import EntityPage from "@/lib/components/entity/page/EntityPage"
import ResponsiveImage from "@/lib/components/ResponsiveImage"
import SessionCard from "@/lib/components/SessionCard"
import { explorerSessionsAtom } from "@/lib/store/sessionAtom"
import { buildRelationIndex, sessionsOf } from "@/lib/relations"
import { getLiquorColor, liquorVars } from "@/lib/liquor"
import { formatTemp, ratio, formatSeconds } from "@/lib/steeps"
import { generateSessionRotation } from "@/app/sessions/[year]/[month]/[slug]/generateSessionRotation"
import { assetPublicPath } from "./documents"
import {
	journalEntity,
	journalSession,
	recordSlug,
	journalSourcingPoints,
	journalMapPoints,
} from "./journal-data"
import { recordImages } from "./preview-media"
import type { CmsDocument } from "./types"

/** Only ReactMarkdown's sanitized, inert DOM is copied into the visitor's flow renderer. */
function PreviewArticle({ source, photos }: { source: string; photos: React.ReactNode }) {
	const template = useRef<HTMLDivElement>(null)
	const [html, setHtml] = useState("")
	useLayoutEffect(() => {
		setHtml(template.current?.innerHTML || "")
	}, [source])
	return (
		<>
			<div ref={template} hidden aria-hidden="true">
				<ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
			</div>
			<FlowAroundArticle html={html} obstacle={photos} />
		</>
	)
}
export default function JournalPreview({
	document: doc,
	documents,
	urls,
}: {
	document: CmsDocument
	documents: readonly CmsDocument[]
	urls: Record<string, string>
}) {
	const sessions = useMemo(
		() =>
			documents
				.filter((d) => d.collection === "tastings")
				.map((d) => journalSession(d, documents, urls)),
		[documents, urls]
	)
	const [store] = useState(createStore)
	useLayoutEffect(() => {
		store.set(explorerSessionsAtom, sessions)
	}, [store, sessions])
	return (
		<Provider store={store}>
			<JournalContent document={doc} documents={documents} sessions={sessions} urls={urls} />
		</Provider>
	)
}
function JournalContent({
	document: doc,
	documents,
	sessions,
	urls,
}: {
	document: CmsDocument
	documents: readonly CmsDocument[]
	sessions: ReturnType<typeof journalSession>[]
	urls: Record<string, string>
}) {
	const phase = useMotionValue(0),
		[phaseValue, setPhaseValue] = useState(0)
	useMotionValueEvent(phase, "change", setPhaseValue)
	const slug = recordSlug(doc),
		liquor = getLiquorColor(slug),
		accent = radarAccent(liquor)
	const index = useMemo(() => buildRelationIndex(sessions), [sessions])
	const session = useMemo(() => journalSession(doc, documents), [doc, documents])
	const images = useMemo(
		() =>
			recordImages(doc).map((im) => ({
				...im,
				image: urls[assetPublicPath(im.image)] || assetPublicPath(im.image),
				alt: im.alt || "",
				variants: im.variants?.map((v) => ({
					src:
						urls[assetPublicPath(v.path || v.image || "")] ||
						assetPublicPath(v.path || v.image || ""),
					mime: "image/webp" as const,
					width: v.width,
					height: v.height || 1,
				})),
			})),
		[doc, urls]
	)
	const now = useMemo(() => new Date(), [])
	const entity = useMemo(() => journalEntity(doc, documents), [doc, documents])
	if (doc.collection !== "tastings") {
		if (entity) {
			const image = entity.image ? urls[assetPublicPath(entity.image)] || entity.image : null
			const paragraphs = entity.description?.split(/\n\s*\n/) || []
			const hasLead = ["style", "category", "cultivar", "vessel"].includes(entity.kind)
			const descriptionNotes = (hasLead ? paragraphs.slice(1) : paragraphs).join("\n\n")
			return (
				<div className="cms-journal cms-journal-entity" data-journal-preview={doc.id}>
					<EntityPage
						preview
						data={{ ...entity, image }}
						points={journalSourcingPoints(entity, documents, index)}
						mapPoints={entity.kind === "origin" ? journalMapPoints(documents) : undefined}
						cards={Object.fromEntries(
							sessionsOf(index, entity.kind, entity.slug).map((s) => [
								s._slug,
								<SessionCard key={s.id} session={s} now={now} />,
							])
						)}
						lead={
							hasLead && paragraphs[0] ? (
								<ReactMarkdown remarkPlugins={[remarkGfm]}>{paragraphs[0]}</ReactMarkdown>
							) : undefined
						}
						notes={
							descriptionNotes || doc.body ? (
								<div className="space-y-6">
									{descriptionNotes && (
										<ReactMarkdown remarkPlugins={[remarkGfm]}>{descriptionNotes}</ReactMarkdown>
									)}
									{doc.body && (
										<ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
									)}
								</div>
							) : undefined
						}
					/>
				</div>
			)
		}
		return (
			<article className="cms-journal" data-journal-preview={doc.id}>
				<h2 className="cms-journal-title font-rock-3d">{String(doc.data.title || "Untitled")}</h2>
				{images.map((im) => (
					<figure key={im.image}>
						<ResponsiveImage src={im.image} alt={im.alt} variants={im.variants} />
					</figure>
				))}
				<PreviewArticle
					source={[doc.data.description, doc.body].filter(Boolean).join("\n\n")}
					photos={null}
				/>
			</article>
		)
	}
	const brewing = session.brewing,
		temp = formatTemp(brewing?.temperature),
		brewRatio = ratio(brewing?.material_amount, brewing?.liquid_amount)
	return (
		<article
			className="cms-journal"
			data-journal-preview={doc.id}
			style={liquorVars(slug) as CSSProperties}
		>
			<div className="cms-journal-layout">
				<div className="cms-journal-story">
					<p className="cms-eyebrow">
						{session.production_year ? session.production_year + " · " : ""}
						{session.style?.map((s) => s.title).join(" · ") || "Session"}
					</p>
					<h2 className="cms-journal-title font-rock-3d text-shadow-2xl">{session.title}</h2>
					<PreviewArticle
						source={doc.body || "Your session notes will appear here."}
						photos={
							images.length ? (
								<SessionCarousel
									images={images}
									liquorColor={liquor}
									fitToContainer
									cssRotation={generateSessionRotation(slug)}
									continuousRotation={false}
									enablePageScrollControl={false}
								/>
							) : null
						}
					/>
				</div>
				<aside className="cms-journal-properties surface-card rounded-2xl">
					<PanelSection
						title="Session Details"
						rightSlot={<PhaseScrubber phase={phase} value={phaseValue} color={accent} />}
					>
						<div className="mx-auto w-full max-w-[320px]">
							<RadarChart data={session.flavor_axes} phase={phase} color={accent} />
						</div>
					</PanelSection>
					<ProvenancePanelsView session={session} index={index} />
					<NotesPanel previewSession={{ ...session, images }} previewLiquor={liquor} />
				</aside>
			</div>
			{brewing && (
				<div className="cms-journal-brew surface-bar">
					<span>Brewing</span>
					<span>
						{[
							temp ? temp.c + "°C / " + temp.f + "°F" : null,
							brewing.material_amount ? brewing.material_amount + " g" : null,
							brewing.liquid_amount ? brewing.liquid_amount + " mL" : null,
							brewRatio,
							brewing.first_infusion_duration
								? formatSeconds(brewing.first_infusion_duration)
								: null,
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				</div>
			)}
		</article>
	)
}
