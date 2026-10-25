// @ts-check
/** Bounds apply before native decoding, and variants are generated sequentially. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_INPUT_PIXELS = 12.6 * 1024 * 1024
export const MAX_INPUT_EDGE = 8192
export const MAX_OUTPUT_EDGE = 1600
export const MAX_VARIANT_BYTES = 2 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

/** @param {{size:number,type:string}} file */
export function validateImageFile(file) {
	if (!ALLOWED_IMAGE_TYPES.includes(file.type))
		throw new Error(
			"Choose a JPEG, PNG, or WebP image. Convert HEIC, animated images, and SVG first."
		)
	if (!file.size) throw new Error("This image is empty.")
	if (file.size > MAX_FILE_BYTES) throw new Error("Choose an image smaller than 20 MB.")
}

/** @param {number} width @param {number} height */
export function validateDimensions(width, height) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
		throw new Error("The image dimensions could not be read safely.")
	if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE || width * height > MAX_INPUT_PIXELS)
		throw new Error(
			"This image is too large to process safely on this device. Choose a photo under 13 megapixels and 8192 pixels per side."
		)
}

/**
 * Read only a bounded header before asking the browser to decode pixels.
 * Reject unrecognized/animated inputs rather than expanding arbitrary content.
 * @param {Uint8Array} bytes @param {string} mime
 * @returns {{width:number,height:number}}
 */
export function readImageDimensions(bytes, mime) {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (mime === "image/png") {
		if (
			bytes.length < 24 ||
			v.getUint32(0) !== 0x89504e47 ||
			v.getUint32(4) !== 0x0d0a1a0a ||
			v.getUint32(12) !== 0x49484452
		)
			throw new Error("The PNG header is invalid.")
		let offset = 8
		while (offset + 12 <= bytes.length) {
			const length = v.getUint32(offset),
				kind = v.getUint32(offset + 4)
			if (kind === 0x6163544c)
				throw new Error("Animated PNG is not supported. Choose a still image.")
			if (kind === 0x49444154) break
			if (length > bytes.length - offset - 12) break
			offset += length + 12
		}
		return { width: v.getUint32(16), height: v.getUint32(20) }
	}
	if (mime === "image/jpeg") {
		if (bytes.length < 4 || v.getUint16(0) !== 0xffd8)
			throw new Error("The JPEG header is invalid.")
		let offset = 2
		while (offset + 4 <= bytes.length) {
			if (bytes[offset] !== 0xff) throw new Error("The JPEG header is invalid.")
			while (bytes[offset] === 0xff) offset++
			const marker = bytes[offset++]
			if (marker === 0xd9 || marker === 0xda) break
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
			if (offset + 2 > bytes.length) break
			const length = v.getUint16(offset)
			if (length < 2 || offset + length > bytes.length) break
			if (
				[0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
					marker
				)
			) {
				if (length < 8) break
				return { width: v.getUint16(offset + 5), height: v.getUint16(offset + 3) }
			}
			offset += length
		}
		throw new Error("The JPEG dimensions were not found in its first megabyte.")
	}
	if (mime === "image/webp") {
		if (bytes.length < 30 || v.getUint32(0) !== 0x52494646 || v.getUint32(8) !== 0x57454250)
			throw new Error("The WebP header is invalid.")
		const kind = v.getUint32(12)
		if (kind === 0x56503858) {
			if (bytes[20] & 2) throw new Error("Animated WebP is not supported. Choose a still image.")
			return {
				width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
				height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
			}
		}
		if (kind === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a)
			return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff }
		if (kind === 0x5650384c && bytes[20] === 0x2f) {
			const bits = v.getUint32(21, true)
			return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
		}
		throw new Error("The WebP dimensions could not be read.")
	}
	throw new Error("This image format is not supported.")
}

/** @param {number} width @param {number} height */
export function variantDimensions(width, height) {
	validateDimensions(width, height)
	const maxWidth = Math.min(
		width,
		MAX_OUTPUT_EDGE,
		Math.max(1, Math.floor((MAX_OUTPUT_EDGE * width) / height))
	)
	const widths = [...new Set([480, 960, maxWidth].filter((w) => w <= maxWidth))].sort(
		(a, b) => a - b
	)
	return widths.map((w) => ({ width: w, height: Math.max(1, Math.round((height * w) / width)) }))
}
