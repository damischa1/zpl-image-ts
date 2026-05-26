# zpl-image-ts

TypeScript port of [`metafloor/zpl-image`](https://github.com/metafloor/zpl-image).
Converts an RGBA bitmap into a Zebra `^GFA`-ready Z64 payload (zlib-deflate +
base64 + CRC16 envelope). Isomorphic: runs in Node.js 18+ and any modern
browser, with zero runtime dependencies.

```ts
import {rgbaToZ64} from 'zpl-image-ts';

const result = await rgbaToZ64(rgbaBuffer, width, {rotate: 'R'});
// `^GFA,${result.length},${result.length},${result.rowlen},${result.z64}`
```

## Why a fork?

- Native TypeScript types (no community-maintained shim drift).
- Pure ESM with named exports -- the upstream UMD bundle's
  `module.exports = factory()` shape is opaque to Node's `cjs-module-lexer`,
  so `import {rgbaToZ64} from 'zpl-image'` throws `SyntaxError: The
  requested module does not provide an export named 'rgbaToZ64'` under
  real Node ESM (tsx/esbuild masks this).
- Isomorphic with zero dependencies: drops `pako` in favour of the
  web-standard `CompressionStream('deflate')` (global in Node 18+ and all
  evergreen browsers since 2023). No Node-specific imports.
- Narrower API surface (only `rgbaToZ64`), smaller install.

## Credits

All credit for the algorithm goes to **Mark Warren** (`metafloor`) -- this is
strictly a transliteration, not a redesign. See [NOTICE.md](NOTICE.md) for the
full attribution and upstream license. Both this port and the upstream are
distributed under the MIT license.

## API

```ts
function rgbaToZ64(
    rgba: Uint8Array | Uint8ClampedArray | number[],
    width: number,
    opts?: {
        /** Blackness threshold 1..99. Default 50. */
        black?: number;
        /** Skip auto-trimming whitespace padding. Default false. */
        notrim?: boolean;
        /** 'N' (none), 'L' / 'B' (90 CCW), 'R' (90 CW), 'I' (180). */
        rotate?: 'N' | 'L' | 'R' | 'I' | 'B';
    },
): Promise<{
    length: number; // uncompressed byte count -> ^GFA arg 1 & 2
    rowlen: number; // packed bytes per row    -> ^GFA arg 3
    width: number; // rotated image width in pixels
    height: number; // rotated image height in pixels
    z64: string; // ':Z64:<base64>:<crc16hex>' -> ^GFA arg 4
}>;
```

`Node.js Buffer` is accepted at runtime since `Buffer extends Uint8Array`;
the type was dropped from the signature to keep the package free of
`@types/node` requirements in browser builds.

The function is `async` because the underlying `CompressionStream` API is
stream-based -- there is no synchronous web-standard equivalent. In Node
the deflate is still effectively synchronous (a single microtask), so the
overhead is negligible.

## Runtime requirements

| Runtime | Required APIs | Status |
| --- | --- | --- |
| Node.js | `CompressionStream`, `Blob`, `Response`, `btoa` | All global since Node 18 |
| Chromium | same | All shipped, evergreen |
| Firefox | same | All shipped, evergreen |
| Safari | same | Shipped 16.4+ (March 2023) |

Native `Uint8Array.prototype.toBase64()` (TC39, Node 22+, Chrome 133+,
Firefox 133+, Safari 18.2+) is used when available; otherwise a portable
`btoa(String.fromCharCode(...))` fallback kicks in.

## Compatibility

Output is verified bit-exact against upstream `zpl-image@0.3.0` via the
golden-vector suite in `test/fixtures/fixtures.json`. Any drift fails the
test run.

## What is intentionally not ported

The following upstream feature is **not implemented** in this port. It is
not needed for the typical "PNG → Zebra label" pipeline; it can be added
later if a concrete need arises.

### `rgbaToACS` (Alternative Data Compression Scheme)

Upstream also exposes `rgbaToACS`, which produces a hex-encoded ZPL payload
using ZPL's run-length codes (`G..Y`, `g..z`) instead of the `:Z64:`
deflate + base64 + CRC16 envelope.

ACS is essentially obsolete on modern Zebra firmware:

- **Z64 is universally supported** on every Zebra printer made in the last
  ~10 years (ZD-, ZT-, ZQ-series and later).
- **Z64 is shorter on the wire** because deflate compresses far better
  than ACS run-length codes (especially on photo-like data).
- ACS is only useful if (a) you're targeting pre-2010 firmware that lacks
  Z64, (b) you need hex-readable output for debugging, or (c) your
  transport mangles `+` / `/` / `=` in base64.

If you ever do need ACS, the internal `monochrome` / `normal` / `invert` /
`left` / `right` pipeline is already in place -- only a ~30-line ACS
encoder would have to be added.

### Browser DOM helpers (`imageToZ64`)

Upstream's `imageToZ64` takes an `HTMLImageElement`, draws it onto a
`<canvas>`, and extracts RGBA via `getImageData()`. This is a thin
convenience wrapper -- in modern code the equivalent is one line using
`createImageBitmap()` + `OffscreenCanvas`, so it is not bundled:

```ts
const bitmap = await createImageBitmap(blob);
const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
const ctx = canvas.getContext('2d')!;
ctx.drawImage(bitmap, 0, 0);
const {data, width} = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
const result = await rgbaToZ64(data, width);
```

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
