"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { Mic, Square } from "lucide-react"
import {
	createDictationSession,
	type DictationStatus,
	type RecognitionConstructor,
} from "./session"

export interface DictationControlProps {
	value: string
	onChange(value: string): void
	textareaRef?: RefObject<HTMLTextAreaElement | null>
	label?: string
	active?: boolean
}

function recognitionConstructor(): RecognitionConstructor | null {
	if (typeof window === "undefined" || !window.isSecureContext) return null
	const browser = window as unknown as {
		SpeechRecognition?: RecognitionConstructor
		webkitSpeechRecognition?: RecognitionConstructor
	}
	return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null
}

/** Key this control by record identity when an editor changes documents without unmounting. */
export default function DictationControl({
	value,
	onChange,
	textareaRef,
	label = "notes",
	active = true,
}: DictationControlProps) {
	const [supported, setSupported] = useState<boolean | null>(null)
	const [status, setStatus] = useState<DictationStatus>("idle")
	const [interim, setInterim] = useState("")
	const [error, setError] = useState("")
	const [deviceHelp, setDeviceHelp] = useState(false)
	const deviceHelpId = useId()
	const descriptionId = useId()
	const interimId = useId()
	const latest = useRef({ value, onChange, textareaRef })
	useLayoutEffect(() => {
		latest.current = { value, onChange, textareaRef }
	}, [value, onChange, textareaRef])
	const session = useRef<ReturnType<typeof createDictationSession> | null>(null)
	const caretFrame = useRef<number | null>(null)
	const lastTextarea = useRef<HTMLTextAreaElement | null>(null)

	const dispose = () => {
		session.current?.dispose()
		session.current = null
		if (caretFrame.current !== null) cancelAnimationFrame(caretFrame.current)
		caretFrame.current = null
	}
	useEffect(() => {
		setSupported(!!recognitionConstructor())
		lastTextarea.current = latest.current.textareaRef?.current ?? null
		const leave = () => {
			dispose()
			setStatus("idle")
			setInterim("")
		}
		const visibility = () => {
			if (document.visibilityState === "hidden") leave()
		}
		window.addEventListener("pagehide", leave)
		window.addEventListener("popstate", leave)
		window.addEventListener("hashchange", leave)
		document.addEventListener("visibilitychange", visibility)
		return () => {
			window.removeEventListener("pagehide", leave)
			window.removeEventListener("popstate", leave)
			window.removeEventListener("hashchange", leave)
			document.removeEventListener("visibilitychange", visibility)
			dispose()
		}
	}, [])
	useEffect(() => {
		const textarea = textareaRef?.current ?? null
		if (lastTextarea.current !== textarea) {
			dispose()
			setStatus("idle")
			setInterim("")
			lastTextarea.current = textarea
		}
	}, [textareaRef])
	useEffect(() => {
		if (!active) {
			dispose()
			setStatus("idle")
			setInterim("")
		}
	}, [active])

	function start() {
		const Constructor = recognitionConstructor()
		if (!Constructor) {
			setSupported(false)
			return
		}
		dispose()
		setError("")
		let recognition
		try {
			recognition = new Constructor()
		} catch {
			setError("The browser speech service is unavailable. Use keyboard dictation instead.")
			return
		}
		session.current = createDictationSession(recognition, {
			getValue: () => latest.current.value,
			getSelection: () => {
				const textarea = latest.current.textareaRef?.current
				return {
					start: textarea?.selectionStart ?? latest.current.value.length,
					end: textarea?.selectionEnd ?? latest.current.value.length,
				}
			},
			onChange: (next) => {
				latest.current.value = next
				latest.current.onChange(next)
			},
			onCaret: (caret) => {
				if (caretFrame.current !== null) cancelAnimationFrame(caretFrame.current)
				caretFrame.current = requestAnimationFrame(() => {
					// Keep the caret without stealing focus from Stop or another control.
					latest.current.textareaRef?.current?.setSelectionRange(caret, caret)
					caretFrame.current = null
				})
			},
			onInterim: setInterim,
			onStatus: setStatus,
			onError: setError,
			lang: navigator.language || "en-US",
		})
		session.current.start()
	}
	const listening = status !== "idle"
	return (
		<div className="space-y-2" data-dictation-control>
			<div className="cms-dictation-row flex flex-wrap items-center gap-2">
				{supported !== false && (
					<button
						type="button"
						onClick={() => (listening ? session.current?.stop() : start())}
						disabled={!active || supported === null || status === "stopping"}
						aria-pressed={listening}
						aria-describedby={descriptionId}
						aria-controls={interimId}
						className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50"
					>
						{listening ? <Square aria-hidden size={14} /> : <Mic aria-hidden size={14} />}
						{status === "starting"
							? "Cancel microphone"
							: status === "stopping"
							? "Stopping dictation…"
							: status === "listening"
							? "Stop dictation"
							: "Dictate " + label}
					</button>
				)}
				<details className="cms-voice-options">
					<summary>Voice options</summary>
					<div>
						<p id={descriptionId} className="max-w-prose text-[11px] leading-relaxed text-white/60">
							{supported === false
								? "Browser dictation is unavailable here. Your device’s keyboard dictation can still enter text directly into your notes."
								: "Your browser may send audio to its speech service. Only finalized words enter your saved draft. You can also use your device’s keyboard dictation."}
						</p>
						<button
							type="button"
							onClick={() => {
								setDeviceHelp(true)
								latest.current.textareaRef?.current?.focus()
							}}
							aria-expanded={deviceHelp}
							aria-controls={deviceHelpId}
							className="min-h-11 rounded-md px-3 py-2 text-xs text-white/75"
						>
							Use keyboard dictation
						</button>
						{deviceHelp && (
							<p
								id={deviceHelpId}
								className="max-w-prose text-[11px] leading-relaxed text-white/65"
							>
								Your notes are focused. On Windows, press Win + H. On Mac, use your configured
								Dictation shortcut (often the microphone key). On a phone or tablet, tap the
								microphone on your keyboard.
							</p>
						)}
					</div>
				</details>
			</div>
			{(listening || interim) && (
				<p id={interimId} role="status" aria-live="polite" className="text-xs text-amber-200/80">
					{interim
						? "Hearing: " + interim
						: status === "starting"
						? "Waiting for microphone permission…"
						: status === "stopping"
						? "Finishing dictation…"
						: listening
						? "Microphone active. Speak when ready."
						: ""}
				</p>
			)}
			{error && (
				<p role="alert" className="text-xs text-red-200">
					{error}
				</p>
			)}
		</div>
	)
}
