/** "Dà Yè Zhòng" → "Da Ye Zhong" */
export function stripMarks(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}+/gu, "")
		.normalize("NFC")
}
