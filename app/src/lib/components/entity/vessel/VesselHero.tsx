"use client"

import { useMemo, type ReactNode } from "react"
import { useAtomValue } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import type { EntityPageData } from "../page/data"
import type { EntityModel } from "../page/model"
import { brewFacts, brewProfile, rotationLabel, timeDomain } from "./brew"
import UseStrip from "./UseStrip"
import VesselGlyph from "./VesselGlyph"
import VesselPhoto from "./VesselPhoto"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * A vessel page's hero (plan §3.2 template, §3.5): the vessel in use (a session photo, else its
 * line silhouette) beside a spec sheet: shape, clay or glaze, what it holds; the mean brew of
 * every session poured from it; and when it was in rotation, on the whole log's timeline.
 */
export default function VesselHero({
	data,
	model,
	lead,
}: {
	data: EntityPageData
	model: EntityModel
	lead?: ReactNode
}) {
	const reduce = useReducedMotion() ?? false
	const index = useAtomValue(relationIndexAtom)
	const spec = data.vessel
	const profile = useMemo(() => brewProfile(model.sessions), [model.sessions])
	const facts = brewFacts(profile)
	const domain = useMemo(() => timeDomain(index.sessions), [index.sessions])
	const rotation = rotationLabel(model.sessions)

	const row = (i: number) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
			: {
					initial: { opacity: 0, y: 6 },
					animate: { opacity: 1, y: 0 },
					transition: { duration: 0.45, ease: EASE, delay: 0.12 + i * 0.06 },
			  }

	return (
		// a container query: the editor column is narrow beside the Explorer and Properties
		<div className="@container" data-recording-key="vessel-hero">
			<div className="grid overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
				<VesselPhoto
					src={data.image}
					kind={spec?.kind}
					title={data.title}
					color={model.accentText}
					className="aspect-[16/10] @2xl:aspect-auto @2xl:min-h-full ring-0"
				/>

				<div className="flex flex-col gap-5 p-5 border-t @2xl:border-t-0 @2xl:border-l border-white/[0.06]">
					<motion.div {...row(0)} className="flex items-start gap-4">
						<VesselGlyph
							kind={spec?.kind}
							title={data.title}
							color={model.accentText}
							delay={0.15}
							className="w-16 shrink-0"
						/>
						<dl className="min-w-0 space-y-1 text-xs">
							{spec?.kind && <Fact label="shape">{spec.kind}</Fact>}
							{spec?.material && <Fact label="body">{spec.material}</Fact>}
							{spec?.volume_ml ? (
								<Fact label="holds">
									<span className="tabular-nums">{spec.volume_ml} ml</span>
								</Fact>
							) : null}
						</dl>
					</motion.div>

					{lead && (
						<motion.div {...row(1)} className="text-sm leading-relaxed text-white/70 max-w-prose">
							{lead}
						</motion.div>
					)}

					{facts.length > 0 && (
						<motion.div {...row(2)} className="space-y-1.5">
							<p className="text-[10.5px] text-white/35">
								{`// mean brew · ${profile.n} ${profile.n === 1 ? "session" : "sessions"}`}
							</p>
							<dl className="grid grid-cols-2 gap-1 @md:grid-cols-4">
								{facts.map((f) => (
									<div
										key={f.k}
										title={f.title}
										className="px-2.5 py-2 rounded-[5px] bg-white/[0.03] ring-1 ring-inset ring-white/[0.05]"
									>
										<dt className="text-[9px] uppercase tracking-[0.12em] text-white/30">{f.k}</dt>
										<dd className="text-sm tabular-nums text-white/85">{f.v}</dd>
									</div>
								))}
							</dl>
						</motion.div>
					)}

					{domain && model.sessions.length > 0 && (
						<motion.div {...row(3)} className="mt-auto space-y-1.5">
							<p className="flex items-baseline justify-between gap-3 text-[10.5px] text-white/35">
								<span>{"// in rotation"}</span>
								{rotation && <span className="tabular-nums text-white/50">{rotation}</span>}
							</p>
							<UseStrip
								sessions={model.sessions}
								domain={domain}
								axis
								recordingKey="vessel-use-strip"
							/>
						</motion.div>
					)}
				</div>
			</div>
		</div>
	)
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-2">
			<dt className="text-[10.5px] text-white/35">{label}</dt>
			<dd className="min-w-0 text-white/80">{children}</dd>
		</div>
	)
}
