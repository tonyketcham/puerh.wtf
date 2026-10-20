import { Fragment } from "react"
import SessionCard from "@/lib/components/SessionCard"
import MiniRadar from "@/lib/components/dataviz/radar/MiniRadar"
import { GaiwanIcon } from "@/lib/components/icons/TeaIcons"
import { buildSessionLog, type LogMonth, type LogSpan } from "@/lib/sessionLog"
import type { ExplorerSession } from "@/lib/types/session"

/** a slot's width: of 6 columns when wide, of 2 in between (see halfSpans), 1 on phones */
const SPAN: Record<`${LogSpan}-${1 | 2}`, string> = {
	"2-1": "@4xl/log:col-span-2",
	"2-2": "@xl/log:col-span-2 @4xl/log:col-span-2",
	"4-1": "@4xl/log:col-span-4",
	"4-2": "@xl/log:col-span-2 @4xl/log:col-span-4",
	"6-1": "@4xl/log:col-span-6",
	"6-2": "@xl/log:col-span-2 @4xl/log:col-span-6",
}

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]
/** 一月 … 十二月 */
const MONTHS_HANZI = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"].map(
	(n) => `${n}月`
)

/**
 * Server component. The recent sessions as a log: month by month, the newest as the hero, the
 * rest on a shelf whose slots the sessions size themselves (see sessionLog.ts), with each
 * month's cups summed up in its header and the quiet stretches between months marked.
 */
export default function SessionLog({
	sessions,
	limit = 10,
	now,
}: {
	/** every session, newest first: older ones feed the margin notes */
	sessions: readonly ExplorerSession[]
	limit?: number
	now: Date
}) {
	const months = buildSessionLog(sessions, limit)
	const shown = months.reduce((n, m) => n + m.count, 0)
	let enter = 0

	return (
		// a named container: tiles read its width (phone → compact rows) as well as their own
		<section className="@container/log space-y-4">
			<h3 className="flex items-center gap-3 my-4 text-sm text-tea-soup-400">
				<span className="flex items-center gap-1.5">
					<GaiwanIcon />
					recents
				</span>
				<span className="tabular-nums text-white/25">{shown}</span>
				<span aria-hidden="true" className="flex-1 h-px bg-white/5" />
			</h3>

			{months.map((month) => (
				<Fragment key={month.key}>
					{month.quietBefore != null && month.quietBefore >= 28 && <Quiet days={month.quietBefore} />}
					<div className="space-y-3">
						<MonthHeader month={month} />
						<div className="grid grid-cols-1 gap-3 @xl/log:grid-cols-2 @4xl/log:grid-cols-6">
							{month.slots.map((slot) => (
								<div key={slot.session.id} className={SPAN[`${slot.span}-${slot.half}`]}>
									<SessionCard
										session={slot.session}
										variant={slot.variant}
										note={slot.note}
										enterIndex={enter++}
										now={now}
									/>
								</div>
							))}
						</div>
					</div>
				</Fragment>
			))}
		</section>
	)
}

/** 07 七月 July 2022 ──── ●●● 3 cups · avg 88 ⬠ */
function MonthHeader({ month }: { month: LogMonth }) {
	return (
		<div className="flex items-end gap-3 pt-2">
			<span aria-hidden className="text-3xl leading-none font-rock-3d text-white/85">
				{String(month.month).padStart(2, "0")}
			</span>
			<span className="flex items-baseline gap-2 pb-0.5 text-xs whitespace-nowrap">
				{/* the wrappers' print red */}
				<span className="text-[#d8452f]/90">{MONTHS_HANZI[month.month - 1]}</span>
				<span className="text-white/60">
					{MONTHS[month.month - 1]} <span className="text-white/35">{month.year}</span>
				</span>
			</span>
			<span aria-hidden className="flex-1 h-px mb-1.5 bg-white/[0.06]" />
			<span className="flex items-center gap-2.5 pb-0.5 text-[11px] leading-none tabular-nums text-white/35 whitespace-nowrap">
				{/* the month's liquors, in the order they were poured */}
				<span aria-hidden className="flex items-center">
					{month.liquors.map((color, i) => (
						<span
							key={i}
							className="size-2.5 rounded-full ring-[1.5px] ring-[#121012]"
							style={{ backgroundColor: color, marginLeft: i ? -3 : 0 }}
						/>
					))}
				</span>
				<span>
					{month.count} {month.count === 1 ? "cup" : "cups"}
				</span>
				{month.avgRating != null && month.count > 1 && (
					<span className="hidden @md:inline">avg {Math.round(month.avgRating)}</span>
				)}
				{month.centroid && month.count > 1 && (
					<span title="The month's flavor, averaged" className="hidden @md:inline-flex">
						<MiniRadar data={month.centroid} color="#c9b98f" className="size-6" />
					</span>
				)}
			</span>
		</div>
	)
}

/** ┄┄ 6 weeks quiet ┄┄ */
function Quiet({ days }: { days: number }) {
	const label = days < 60 ? `${Math.round(days / 7)} weeks` : `${Math.round(days / 30.44)} months`
	return (
		<p className="flex items-center gap-3 py-1 text-[10px] text-white/25">
			<span aria-hidden className="flex-1 border-t border-dashed border-white/[0.08]" />
			{`// ${label} without a session`}
			<span aria-hidden className="flex-1 border-t border-dashed border-white/[0.08]" />
		</p>
	)
}
