/** Optional structured steep notes. Legacy Markdown remains authoritative for old write-ups. */
export function infusionIssues(value) {
	if (value == null) return []
	if (!Array.isArray(value)) return ["Steep log must be a list."]
	const issues = []
	const seen = new Set()
	for (const item of value) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			issues.push("Each steep must be an object.")
			continue
		}
		if (!Number.isInteger(item.number) || item.number < 1 || seen.has(item.number))
			issues.push("Steep numbers must be unique positive integers.")
		seen.add(item.number)
		if (
			item.duration_seconds != null &&
			(typeof item.duration_seconds !== "number" ||
				!Number.isFinite(item.duration_seconds) ||
				item.duration_seconds < 0)
		)
			issues.push("Steep duration must be a nonnegative number of seconds.")
		if (item.note != null && typeof item.note !== "string") issues.push("Steep notes must be text.")
		if (
			item.at != null &&
			item.at !== "" &&
			(typeof item.at !== "string" || !Number.isFinite(Date.parse(item.at)))
		)
			issues.push("Steep date must be a valid date and time.")
	}
	return [...new Set(issues)]
}

const escapeHtml = (text) =>
	String(text).replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
	)

/** Used by public pages and the editor preview so their steep logs stay identical. */
export function infusionHtml(value) {
	if (!Array.isArray(value) || !value.length || infusionIssues(value).length) return ""
	return (
		"<h2>Steep log</h2><ol data-infusion-log>" +
		value
			.map(
				(item) =>
					'<li value="' +
					item.number +
					'" data-steep-number="' +
					item.number +
					'">' +
					"<strong>Steep " +
					item.number +
					"</strong>" +
					(item.duration_seconds != null ? " · " + item.duration_seconds + " s" : "") +
					(item.at
						? ' · <time datetime="' +
						  escapeHtml(item.at) +
						  '">' +
						  escapeHtml(new Date(item.at).toISOString().slice(0, 16).replace("T", " ") + " UTC") +
						  "</time>"
						: "") +
					(item.note ? "<p>" + escapeHtml(item.note).replace(/\r?\n/g, "<br>") + "</p>" : "") +
					"</li>"
			)
			.join("") +
		"</ol>"
	)
}
