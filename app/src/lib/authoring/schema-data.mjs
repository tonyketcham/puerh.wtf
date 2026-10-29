// Shared authoring schema: no browser, Node, authorization, or persistence dependencies.
const text = (name, label, extra = {}) => ({ name, label, type: "text", ...extra })
const number = (name, label, extra = {}) => ({ name, label, type: "number", ...extra })
const relation = (name, label, collection, multiple = true, required = false) => ({
	name,
	label,
	type: "relation",
	collection,
	multiple,
	required,
})
const select = (name, label, options, extra = {}) => ({
	name,
	label,
	type: "select",
	options,
	...extra,
})
const object = (name, label, fields, extra = {}) => ({
	name,
	label,
	type: "object",
	fields,
	...extra,
})
const description = text("description", "Description", { type: "textarea" })
const image = text("image", "Image", { type: "image" })
const identity = [text("title", "Name", { required: true })]
const color = text("color", "Color", { type: "color" })
const originKinds = [
	"country",
	"province",
	"prefecture",
	"county",
	"mountain-area",
	"township",
	"village",
	"forest",
	"unknown",
]
export const NOTE_FIELDS = [
	"dry_leaf_nose",
	"wet_leaf_nose",
	"mouthfeel",
	"taste",
	"finish",
	"empty_cup",
	"cha_qi",
]
export const AXIS_FIELDS = [
	"vegetal",
	"floral",
	"fruits",
	"spices",
	"earth",
	"wood",
	"nuts_roast",
	"cream",
	"stone",
	"umami",
]
const label = (name) => name.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase())
const links = (names) =>
	object(
		"links",
		"Links",
		names.map((name) => text(name, label(name)))
	)
export const COLLECTIONS = [
	{
		name: "tastings",
		label: "Sessions",
		singular: "Session",
		route: "sessions",
		fields: [
			text("title", "Tea name", { required: true }),
			text("tea_name", "Original tea name"),
			{
				name: "date",
				label: "Session date",
				type: "datetime",
				required: true,
				hint: "Preserves the stored instant; publication is separate.",
			},
			text("excerpt", "Excerpt"),
			relation("author", "Authors", "authors"),
			relation("style", "Styles", "styles"),
			relation("cultivar", "Cultivars", "cultivars"),
			relation("origin", "Origins", "origins"),
			select("origin_note", "Origin note", ["blend", "undisclosed", "unknown"]),
			relation("vendor", "Vendors", "vendors"),
			relation("sourced_from", "Supplier", "vendors"),
			relation("vessel", "Vessels", "vessels"),
			relation("tags", "Tags", "tags"),
			number("production_year", "Production year", { min: 1, step: 1 }),
			object("harvest", "Harvest", [
				select("season", "Season", ["spring", "summer", "autumn", "winter"]),
				number("month", "Month", { min: 1, max: 12, step: 1 }),
				{ name: "years", label: "Harvest years", type: "list", itemType: "number" },
			]),
			text("season_note", "Harvest note"),
			text("picking", "Picking"),
			number("elevation", "Elevation (m)"),
			text("aging_conditions", "Aging note", { type: "textarea" }),
			{
				name: "storage",
				label: "Storage history",
				type: "list",
				fields: [
					text("place", "Place", { required: true }),
					number("from", "From year", { step: 1 }),
					number("to", "To year", { step: 1 }),
					select("humidity", "Humidity", ["dry", "natural", "wet"]),
					{ name: "approx", label: "Approximate", type: "boolean" },
				],
			},
			text("purchase_link", "Purchase link"),
			number("rating", "Preference rating", { min: 0, max: 100, step: 0.5 }),
			object("brewing", "Brewing", [
				number("temperature", "Water temperature (°F)", {
					min: 0,
					max: 705,
					hint: "Stored in Fahrenheit; converting the display must not change the unit.",
				}),
				number("material_amount", "Leaf (g)", { min: 0, step: 0.01 }),
				number("liquid_amount", "Water (mL)", { min: 0 }),
				number("first_infusion_duration", "First infusion (s)", { min: 0 }),
				number("infusion_increment", "Infusion increment (s)", { min: 0 }),
				text("vessel", "Vessel note"),
			]),
			object(
				"notes",
				"Tasting notes",
				NOTE_FIELDS.map((name) => text(name, label(name), { type: "textarea" }))
			),
			object(
				"flavor_axes",
				"Flavor profile",
				AXIS_FIELDS.map((name) =>
					object(name, label(name), [
						number("start", "Start", { min: 0, max: 10 }),
						number("finish", "Finish", { min: 0, max: 10 }),
					])
				)
			),
			{
				name: "images",
				label: "Images",
				type: "list",
				fields: [image, text("alt", "Alt text"), text("caption", "Caption")],
			},
		],
	},
	{
		name: "vendors",
		label: "Vendors",
		singular: "Vendor",
		route: "vendors",
		fields: [
			...identity,
			image,
			text("location", "Location"),
			text("municipality", "Municipality"),
			text("country", "Country"),
			links(["website", "instagram", "twitter", "youtube", "facebook"]),
			description,
		],
	},
	{
		name: "origins",
		label: "Origins",
		singular: "Origin",
		route: "origins",
		fields: [
			...identity,
			text("hanzi", "Hanzi / Kanji"),
			text("pinyin", "Pinyin"),
			select("kind", "Kind", originKinds),
			relation("parent", "Parent", "origins", false),
			{ name: "groups", label: "Groups", type: "list", itemType: "text" },
			object("geo", "Geography", [
				number("lat", "Latitude", { min: -90, max: 90 }),
				number("lon", "Longitude", { min: -180, max: 180 }),
				select("precision", "Precision", originKinds),
				number("radius_km", "Radius (km)", { min: 0 }),
				{ name: "elevation_m", label: "Elevation range (m)", type: "list", itemType: "number" },
				select("confidence", "Confidence", ["high", "medium", "low"]),
				text("source", "Source URL"),
			]),
			description,
		],
	},
	{
		name: "styles",
		label: "Styles",
		singular: "Style",
		route: "styles",
		fields: [
			...identity,
			relation("category", "Category", "categories", false),
			color,
			description,
		],
	},
	{
		name: "categories",
		label: "Categories",
		singular: "Category",
		route: "categories",
		fields: [...identity, color, description],
	},
	{
		name: "cultivars",
		label: "Cultivars",
		singular: "Cultivar",
		route: "cultivars",
		fields: [
			...identity,
			text("hanzi", "Hanzi"),
			relation("styles", "Related styles", "styles"),
			description,
			{ name: "videos", label: "Videos", type: "list", fields: [text("video", "Video URL")] },
		],
	},
	{
		name: "vessels",
		label: "Teaware",
		singular: "Vessel",
		route: "teaware",
		fields: [
			...identity,
			text("hanzi", "Hanzi"),
			select("kind", "Shape", ["gaiwan", "teapot", "shiboridashi", "chawan"]),
			text("material", "Material"),
			number("volume_ml", "Volume (mL)", { min: 0 }),
			image,
			description,
		],
	},
	{
		name: "authors",
		label: "Authors",
		singular: "Author",
		route: null,
		fields: [
			...identity,
			image,
			links(["website", "instagram", "github", "youtube", "facebook"]),
			text("excerpt", "Excerpt"),
		],
	},
	{ name: "tags", label: "Tags", singular: "Tag", route: null, fields: [...identity, color] },
]
export const SCHEMAS = Object.fromEntries(COLLECTIONS.map((schema) => [schema.name, schema]))
export const RELATION_FIELDS = {
	tastings: {
		author: "authors",
		style: "styles",
		cultivar: "cultivars",
		origin: "origins",
		vendor: "vendors",
		sourced_from: "vendors",
		tags: "tags",
		vessel: "vessels",
	},
	origins: { parent: "origins" },
	styles: { category: "categories" },
	cultivars: { styles: "styles" },
}
