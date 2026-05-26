# zpl-image-ts

TypeScript port of [`metafloor/zpl-image`](https://github.com/metafloor/zpl-image).
Converts an RGBA bitmap into a Zebra `^GFA`-ready Z64 payload (raw-deflate +
base64 + CRC16 envelope) for Node.js.

```ts
import {rgbaToZ64} from 'zpl-image-ts';

const result = rgbaToZ64(rgbaBuffer, width, {rotate: 'R'});
// `^GFA,${result.length},${result.length},${result.rowlen},${result.z64}`
```

## Why a fork?

- Native TypeScript types (no community-maintained shim drift).
- Pure ESM with named exports -- the upstream UMD bundle's
  `module.exports = factory()` shape is opaque to Node's `cjs-module-lexer`,
  so `import {rgbaToZ64} from 'zpl-image'` throws `SyntaxError: The
  requested module does not provide an export named 'rgbaToZ64'` under
  real Node ESM (tsx/esbuild masks this).
- Node-only: drops the `pako` browser dependency; uses built-in `node:zlib`.
- Narrower API surface (only `rgbaToZ64`), smaller install.

## Credits

All credit for the algorithm goes to **Mark Warren** (`metafloor`) -- this is
strictly a transliteration, not a redesign. See [NOTICE.md](NOTICE.md) for the
full attribution and upstream license. Both this port and the upstream are
distributed under the MIT license.

## API

```ts
function rgbaToZ64(
    rgba: Uint8Array | Uint8ClampedArray | Buffer | number[],
    width: number,
    opts?: {
        /** Blackness threshold 1..99. Default 50. */
        black?: number;
        /** Skip auto-trimming whitespace padding. Default false. */
        notrim?: boolean;
        /** 'N' (none), 'L' / 'B' (90 CCW), 'R' (90 CW), 'I' (180). */
        rotate?: 'N' | 'L' | 'R' | 'I' | 'B';
    },
): {
    length: number; // uncompressed byte count -> ^GFA arg 1 & 2
    rowlen: number; // packed bytes per row    -> ^GFA arg 3
    width: number; // rotated image width in pixels
    height: number; // rotated image height in pixels
    z64: string; // ':Z64:<base64>:<crc16hex>' -> ^GFA arg 4
};
```

## Compatibility

Output is verified bit-exact against upstream `zpl-image@0.3.0` via the
golden-vector suite in `test/fixtures/fixtures.json`. Any drift fails the
test run.

## What is intentionally not ported

The following upstream features are **not implemented** in this port. None of
them are needed for the typical "PNG → Zebra label" pipeline; they can be
added later if a concrete need arises.

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
  Z64, (b) you need hex-readable output for debugging, or (c) your transport
  mangles `+` / `/` / `=` in base64.

If you ever do need ACS, the internal `monochrome` / `normal` / `invert` /
`left` / `right` pipeline is already in place -- only a ~30-line ACS encoder
would have to be added.

### Browser DOM helpers (`imageToZ64`)

Upstream's `imageToZ64` takes an `HTMLImageElement`, draws it onto a
`<canvas>`, and extracts RGBA via `getImageData()`. This is a thin
convenience wrapper -- in modern code the equivalent is one line using
`createImageBitmap()` + `OffscreenCanvas`, so there is no need to bundle it.

### Browser support (no `pako`)

Currently Node-only. See [Browser support](#browser-support) below for how
the port could be made isomorphic.

## Browser support

Not implemented today, but it would be cheap to add using modern web
platform APIs that did not exist when upstream `zpl-image` was written
(2019). The required ingredients:

| Need | 2019 (upstream) | 2026 (built-in) |
| --- | --- | --- |
| zlib deflate | bundle [`pako`](https://github.com/nodeca/pako) (~45 kB min) | `new CompressionStream('deflate')` -- Web Streams, all evergreen browsers since 2023 |
| `Uint8Array` → base64 | hand-rolled `btoa` over `String.fromCharCode` chunks | `uint8array.toBase64()` -- TC39 Stage 3, shipped Chrome 133 / Firefox 133 / Safari 18.2 (2025) |
| image → RGBA | DOM `<canvas>` + `getImageData()` | `createImageBitmap()` + `OffscreenCanvas` (works inside Workers) |

Sketched isomorphic core:

```ts
async function deflateZlib(buf: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([buf]).stream()
            .pipeThrough(new CompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const {deflateSync} = await import('node:zlib');
    return new Uint8Array(deflateSync(buf));
}

function bytesToBase64(buf: Uint8Array): string {
    // Modern path -- one line.
    if (typeof (buf as any).toBase64 === 'function') return (buf as any).toBase64();
    // Node fallback.
    if (typeof Buffer !== 'undefined') return Buffer.from(buf).toString('base64');
    // Pre-2025 browser fallback.
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]!);
    return btoa(s);
}
```

Tradeoffs:

- `CompressionStream` is **async-only**, so adding browser support means
  `rgbaToZ64` becomes `Promise<Result>` (breaking change in this package).
  The cleanest path is a single isomorphic async API; an alternative is a
  separate `zpl-image-ts/browser` entry point via package `exports`
  conditions, keeping the Node API synchronous.
- Result is still **zero runtime dependencies** -- both APIs are built into
  the platform.
- `CompressionStream('deflate')` produces the same zlib-wrapped byte stream
  as Node's `zlib.deflateSync`, so the existing golden vectors keep
  applying byte-for-byte.

This work is not on the immediate roadmap. PRs welcome.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
