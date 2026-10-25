import { expect, test } from "@playwright/test"
import {
	createDictationSession,
	insertDictation,
	rebaseRange,
	type BrowserRecognition,
	type DictationStatus,
	type SpeechResult,
} from "../src/lib/authoring/voice/session"

class FakeRecognition implements BrowserRecognition {
	continuous = false
	interimResults = false
	maxAlternatives = 1
	lang = ""
	onstart: BrowserRecognition["onstart"] = null
	onend: BrowserRecognition["onend"] = null
	onerror: BrowserRecognition["onerror"] = null
	onresult: BrowserRecognition["onresult"] = null
	starts = 0
	stops = 0
	aborts = 0
	start() {
		this.starts++
		this.onstart?.()
	}
	stop() {
		this.stops++
	}
	abort() {
		this.aborts++
		this.onend?.()
	}
	result(text: string, final: boolean): SpeechResult {
		return Object.assign([{ transcript: text }], { isFinal: final })
	}
}

test("only final dictation enters the draft, duplicate final result indexes do not insert twice", () => {
	const recognition = new FakeRecognition()
	let value = "Tea notes",
		interim = "",
		caret = 4
	const changes: string[] = [],
		statuses: DictationStatus[] = []
	const session = createDictationSession(recognition, {
		getValue: () => value,
		getSelection: () => ({ start: 4, end: 4 }),
		onChange: (next) => {
			value = next
			changes.push(next)
		},
		onCaret: (next) => {
			caret = next
		},
		onInterim: (next) => {
			interim = next
		},
		onStatus: (next) => statuses.push(next),
		onError: () => {},
		lang: "en-US",
	})
	expect(recognition.starts).toBe(0)
	session.start()
	recognition.onresult?.({ resultIndex: 0, results: [recognition.result("honey", false)] })
	expect(value).toBe("Tea notes")
	expect(interim).toBe("honey")
	const final = recognition.result("honey", true)
	recognition.onresult?.({ resultIndex: 0, results: [final] })
	recognition.onresult?.({
		resultIndex: 0,
		results: [final, recognition.result("and malt", false)],
	})
	expect(value).toBe("Tea honey notes")
	expect(changes).toHaveLength(1)
	expect(interim).toBe("and malt")
	session.stop()
	expect(recognition.stops).toBe(1)
	recognition.onresult?.({ resultIndex: 1, results: [final, recognition.result("and malt", true)] })
	expect(value).toBe("Tea honey and malt notes")
	expect(caret).toBe(19)
	recognition.onend?.()
	expect(statuses.at(-1)).toBe("idle")
	expect(interim).toBe("")
})

test("dictation preserves concurrent typing and selection replacement, and disposal ignores late results", () => {
	expect(insertDictation("Tea harsh finish", { start: 4, end: 9 }, "sweet").value).toBe(
		"Tea sweet finish"
	)
	expect(rebaseRange("Tea notes", "Warm Tea notes", { start: 4, end: 4 })).toEqual({
		start: 9,
		end: 9,
	})
	const recognition = new FakeRecognition()
	let value = "Tea notes"
	const session = createDictationSession(recognition, {
		getValue: () => value,
		getSelection: () => ({ start: 4, end: 4 }),
		onChange: (next) => {
			value = next
		},
		onCaret: () => {},
		onInterim: () => {},
		onStatus: () => {},
		onError: () => {},
		lang: "en-US",
	})
	session.start()
	value = "Warm Tea notes"
	recognition.onresult?.({ resultIndex: 0, results: [recognition.result("honey", true)] })
	expect(value).toBe("Warm Tea honey notes")
	const lateResult = recognition.onresult
	session.dispose()
	lateResult?.({
		resultIndex: 1,
		results: [recognition.result("honey", true), recognition.result("must not appear", true)],
	})
	expect(value).toBe("Warm Tea honey notes")
	expect(recognition.aborts).toBe(1)
	expect(recognition.onresult).toBeNull()
})

test("permission failures are actionable without clearing the draft or automatically restarting the microphone", () => {
	const recognition = new FakeRecognition(),
		errors: string[] = []
	let value = "Keep my notes"
	const session = createDictationSession(recognition, {
		getValue: () => value,
		getSelection: () => ({ start: value.length, end: value.length }),
		onChange: (next) => {
			value = next
		},
		onCaret: () => {},
		onInterim: () => {},
		onStatus: () => {},
		onError: (next) => errors.push(next),
		lang: "en-US",
	})
	session.start()
	recognition.onerror?.({ error: "not-allowed" })
	recognition.onend?.()
	expect(value).toBe("Keep my notes")
	expect(errors[0]).toMatch(/permission was denied/i)
	expect(recognition.starts).toBe(1)
})
