import type { OriginRef } from "./types/origin"

/**
 * Origin files were renamed to short slugs on 2026-10-18 (plan §2.3). Refs are by id so content
 * never broke, but shared filter URLs (?origins=<old slug>) still carry the long admin-chain slugs.
 * Old slug → current slug.
 */
export const LEGACY_ORIGIN_SLUGS: Readonly<Record<string, string>> = {
	"alishan-chiayi-taiwan": "alishan",
	"anxi-fujian-china": "anxi",
	"asamiya-shiga-japan": "asamiya",
	"banpo-lao-zhai-nannou-xishuangbanna-yunnan-china": "banpo-laozhai",
	"bulang-yunnan-china": "bulang",
	"ding-jia-zhai-yiwu-yunnan-china": "dingjiazhai",
	"feng-qing-lincang-yunnan-china": "fengqing",
	"fuding-fujian-china": "fuding",
	"fujian-china": "fujian",
	"gedeng-xishuangbana-yunnan-china": "gedeng",
	"gua-feng-zhai-yiwu-xishuangbanna-yunnan-china": "guafengzhai",
	"guoyoulin-yiwu-xishuangbanna-yunnan-china": "guoyoulin",
	"he-kai-yunnan-china": "hekai",
	"hou-gu-huang-shan-anhui-province-china": "houkeng",
	"huangshan-anhui-china": "huangshan",
	"its-a-mystery-yunnan-china": "yunnan-unknown",
	"jing-mai-yunnan-china": "jingmai",
	"laoshan-qingdao-shandong-china": "laoshan",
	"luoshuidong-mengla-county-xishuangbanna-yunnan-china": "luoshuidong",
	"manzhi-yun-county-lincang-yunnan-china": "mangzhi",
	"manzhuan-xishuangbana-yunnan-china": "manzhuan",
	"menghai-xishuangbanna-yunnan-china": "menghai",
	"mengla-county-xishuangbanna-yunnan-china": "mengla",
	"mori-machi-shizuoka-japan": "mori-machi",
	"nannuo-yunnan-china": "nannuo",
	"ping-keng-tou-guangdong-china": "pingkengtou",
	"qianjiazhai-yunnan-china": "qianjiazhai",
	"suan-zao-shu-ninger-hani-and-yi-autonomous-county-puer-city-yunnan-china": "suanzaoshu",
	"uji-kyoto-japan": "uji",
	"weidong-meng-noy-bulang-menghai-county-xishuangbanna-prefecture-yunnan-province-china": "weidong",
	"wuyi-zhejiang-china": "wuyi-zhejiang",
	"wuyishan-fujian-china": "wuyishan",
	"wuzhou-guangxi-china": "liubao",
	"yibang-xishuangbanna-yunnan-china": "yibang",
	"yiwu-xishuangbanna-yunnan-china": "yiwu",
	"youle-xishuangbana-yunnan-china": "youle",
	"yueyang-hunan-china": "junshan",
}

/** A filter value (current slug, legacy slug or id) as a current slug or id. */
export function canonicalOriginKey(value: string): string {
	return LEGACY_ORIGIN_SLUGS[value] ?? value
}

/** Root-first chain of an origin and its resolved parents: China › Yunnan › … › Gua Feng Zhai. */
export function originChain(origin: OriginRef | null | undefined): OriginRef[] {
	const chain: OriginRef[] = []
	const seen = new Set<string>()
	for (let node = origin; node && !seen.has(node.id); node = node.parent) {
		seen.add(node.id)
		chain.unshift(node)
	}
	return chain
}

/** Every slug and id an origin answers to, including its ancestors (so ?origins=yiwu finds Gua Feng Zhai). */
export function originKeys(origin: OriginRef | null | undefined): string[] {
	return originChain(origin).flatMap((o) => [o._slug, o.id])
}

/** Searchable names for an origin and its ancestors (titles, hanzi, pinyin). */
export function originSearchText(origin: OriginRef | null | undefined): string[] {
	return originChain(origin).flatMap((o) => [o.title, o.hanzi ?? "", o.pinyin ?? ""])
}
