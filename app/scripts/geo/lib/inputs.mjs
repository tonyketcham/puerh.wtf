/**
 * The input hash `geo:check` compares against maps-manifest.json: origin frontmatter +
 * curated places (content/geo/places.json) + pipeline params + SCRIPT_VERSION. Budgets are
 * excluded (they don't change output).
 */
import * as params from "../params.mjs"
import { originInputs } from "./origins.mjs"
import { canonicalJson, sha256 } from "./util.mjs"

export function inputHash(origins, places) {
	const { BUDGETS: _budgets, ...rest } = params
	return sha256(canonicalJson({ params: rest, origins: originInputs(origins), places }))
}
