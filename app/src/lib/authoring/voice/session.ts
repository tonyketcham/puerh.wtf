export interface SpeechResult {
	isFinal: boolean
	readonly length: number
	[index: number]: { transcript: string }
}
export interface SpeechResultEvent {
	resultIndex: number
	results: ArrayLike<SpeechResult>
}
export interface BrowserRecognition {
	continuous: boolean
	interimResults: boolean
	lang: string
	maxAlternatives: number
	onstart: (() => void) | null
	onend: (() => void) | null
	onerror: ((event: { error: string }) => void) | null
	onresult: ((event: SpeechResultEvent) => void) | null
	start(): void
	stop(): void
	abort(): void
}
export type RecognitionConstructor = new () => BrowserRecognition
export type DictationStatus = "idle" | "starting" | "listening" | "stopping"
export interface TextRange {
	start: number
	end: number
}

/** Rebase the insertion point over one external text edit; never replace newly typed text. */
export function rebaseRange(previous: string, next: string, range: TextRange): TextRange {
	if (previous === next) return range
	let prefix = 0
	while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix])
		prefix++
	let oldEnd = previous.length,
		newEnd = next.length
	while (oldEnd > prefix && newEnd > prefix && previous[oldEnd - 1] === next[newEnd - 1]) {
		oldEnd--
		newEnd--
	}
	if (range.end <= prefix) return range
	if (range.start >= oldEnd)
		return { start: range.start + newEnd - oldEnd, end: range.end + newEnd - oldEnd }
	return { start: newEnd, end: newEnd }
}

/** Add a finalized phrase at the captured caret/selection, with readable word boundaries. */
export function insertDictation(value: string, range: TextRange, transcript: string) {
	const phrase = transcript.trim()
	const start = Math.max(0, Math.min(value.length, range.start))
	const end = Math.max(start, Math.min(value.length, range.end))
	if (!phrase) return { value, caret: start }
	const before = value.slice(0, start),
		after = value.slice(end)
	const leading = before && !/\s$/.test(before) && !/^[,.;:!?)]/.test(phrase) ? " " : ""
	const trailing = after && !/^\s/.test(after) && !/^[,.;:!?)]/.test(after) ? " " : ""
	const text = leading + phrase + trailing
	return { value: before + text + after, caret: before.length + text.length }
}

export function speechErrorMessage(error: string) {
	const messages: Record<string, string> = {
		"not-allowed":
			"Microphone permission was denied. Allow it in site settings, or use your keyboard microphone.",
		"service-not-allowed":
			"Browser speech recognition is not allowed. Use your keyboard microphone instead.",
		"audio-capture":
			"No microphone is available. Connect one, or use your device’s keyboard dictation.",
		network: "The browser speech service could not connect. Your finalized words have been kept.",
		"no-speech": "No speech was detected. Start dictation again when you are ready.",
		"language-not-supported":
			"This speech language is unavailable. Use your keyboard microphone instead.",
	}
	return messages[error] ?? "Dictation stopped. Your finalized text has been kept."
}

export interface DictationSessionOptions {
	getValue(): string
	getSelection(): TextRange
	onChange(value: string): void
	onCaret(caret: number): void
	onInterim(value: string): void
	onStatus(status: DictationStatus): void
	onError(message: string): void
	lang: string
}

/** One deliberate microphone session. Only final results enter the saved value. */
export function createDictationSession(
	recognition: BrowserRecognition,
	options: DictationSessionOptions
) {
	let disposed = false,
		stopping = false,
		started = false,
		ended = false
	let previous = options.getValue(),
		range = options.getSelection()
	const finalized = new Set<number>()
	recognition.continuous = true
	recognition.interimResults = true
	recognition.maxAlternatives = 1
	recognition.lang = options.lang
	recognition.onstart = () => {
		if (!disposed) {
			started = true
			options.onStatus(stopping ? "stopping" : "listening")
		}
	}
	recognition.onresult = (event) => {
		if (disposed || ended) return
		const interim: string[] = []
		for (let i = 0; i < event.results.length; i++) {
			const result = event.results[i],
				transcript = result[0]?.transcript ?? ""
			if (!result.isFinal) {
				interim.push(transcript)
				continue
			}
			if (finalized.has(i)) continue
			finalized.add(i)
			const current = options.getValue()
			range = rebaseRange(previous, current, range)
			const inserted = insertDictation(current, range, transcript)
			previous = inserted.value
			range = { start: inserted.caret, end: inserted.caret }
			if (inserted.value !== current) {
				options.onChange(inserted.value)
				options.onCaret(inserted.caret)
			}
		}
		options.onInterim(interim.join(" ").trim())
	}
	recognition.onerror = (event) => {
		if (disposed) return
		ended = true
		if (event.error !== "aborted") options.onError(speechErrorMessage(event.error))
		options.onInterim("")
		options.onStatus("idle")
	}
	recognition.onend = () => {
		if (disposed) return
		ended = true
		options.onInterim("")
		options.onStatus("idle")
	}
	return {
		start() {
			if (disposed) return
			options.onStatus("starting")
			try {
				recognition.start()
			} catch {
				options.onStatus("idle")
				options.onError("Dictation could not start. Try your keyboard microphone instead.")
			}
		},
		stop() {
			if (disposed || stopping) return
			stopping = true
			options.onStatus("stopping")
			try {
				if (started) recognition.stop()
				else recognition.abort()
			} catch {
				options.onInterim("")
				options.onStatus("idle")
			}
		},
		dispose() {
			if (disposed) return
			disposed = true
			recognition.onresult = null
			recognition.onerror = null
			recognition.onstart = null
			recognition.onend = null
			try {
				recognition.abort()
			} catch {}
		},
	}
}
