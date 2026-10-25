# Device-only image tools

Run from app/ before dev or static export:
    node src/lib/authoring/media/prepare-codecs.mjs

The script copies installed codec files, their licenses, and the plain ESM worker
to public/authoring-codecs/v1/. No CDN, external API, or Next runtime server is
required. The app downloads these modules only when optimizeImage starts a worker.

The worker checks a bounded header before decoding. JPEG/PNG/still WebP only; input
20 MiB, under 13.2 million pixels and 8192px per edge. Native createImageBitmap
applies image orientation, then pixel data is resized with jSquash's WASM Lanczos
resizer and encoded with libwebp WASM at quality 80. Encoded pixels contain no source
EXIF/XMP/ICC metadata. Output widths are 480/960/1600 where possible, capped by
the original and 1600px on either edge, without upscaling. Variants and files run
sequentially; terminating each job releases its worker/WASM memory.

The largest sanitized WebP is the picture fallback. All returned blobs stay local;
callers persist them through the draft IndexedDB model. A deliberate content push
owns remote writes. Each variant is limited to 2 MiB; the push composer additionally
checks the service's complete request size.

Official references:
- https://github.com/jamsinclair/jSquash/tree/main/packages/webp
- https://github.com/jamsinclair/jSquash/tree/main/packages/resize
- https://webaudio.github.io/web-speech-api/ (dictation may use a browser speech service)

Browser acceptance checks successful same-origin WASM responses, WebP chunk
structure and actual decoded sizes.
