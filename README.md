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

## Import paths

Three entry points -- pick whichever matches what you need:

```ts
// Convenience barrel. Bundlers with sideEffects:false respect it and
// tree-shake unused encoders automatically.
import {rgbaToZ64, rgbaToACS} from 'zpl-image-ts';

// Explicit subpath -- guarantees the other encoder, its compression glue,
// and (for /z64) the 256-entry CRC16 table are never bundled.
import {rgbaToZ64} from 'zpl-image-ts/z64';
import {rgbaToACS} from 'zpl-image-ts/acs';
```

All three paths re-export `RgbaInput` and `RgbaOptions`. The `./z64` and
`./acs` subpaths additionally export their own `RgbaToZ64Result` /
`RgbaToACSResult` types.

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
- Narrower API surface (`rgbaToZ64` + `rgbaToACS` only -- the DOM-bound
  `imageToZ64` / `imageToACS` helpers are replaced by a one-liner using
  `createImageBitmap()` + `OffscreenCanvas`).

## Credits

All credit for the algorithm goes to **Mark Warren** (`metafloor`) -- this is
strictly a transliteration, not a redesign. See [NOTICE.md](NOTICE.md) for the
full attribution and upstream license. Both this port and the upstream are
distributed under the MIT license.

## API

```ts
type RgbaInput = Uint8Array | Uint8ClampedArray | readonly number[];

interface RgbaOptions {
    /** Blackness threshold 1..99. Default 50. */
    black?: number;
    /** Skip auto-trimming whitespace padding. Default false. */
    notrim?: boolean;
    /** 'N' (none), 'L' / 'B' (90 CCW), 'R' (90 CW), 'I' (180). */
    rotate?: 'N' | 'L' | 'R' | 'I' | 'B';
}

// Deflate + base64 + CRC16 (preferred -- shorter on the wire, supported on
// every modern Zebra printer). Async because CompressionStream is the
// underlying web-standard primitive.
function rgbaToZ64(
    rgba: RgbaInput,
    width: number,
    opts?: RgbaOptions,
): Promise<{
    length: number; // uncompressed byte count -> ^GFA arg 1 & 2
    rowlen: number; // packed bytes per row    -> ^GFA arg 3
    width: number;  // rotated image width in pixels
    height: number; // rotated image height in pixels
    z64: string;    // ':Z64:<base64>:<crc16hex>' -> ^GFA arg 4
}>;

// Hex + run-length codes (Alternative Data Compression Scheme).
// Synchronous -- no compression library needed. Useful when you want a
// hex-readable payload for debugging, or for older Zebra firmware that
// predates Z64 support.
function rgbaToACS(
    rgba: RgbaInput,
    width: number,
    opts?: RgbaOptions,
): {
    length: number;
    rowlen: number;
    width: number;
    height: number;
    acs: string;    // hex with G..Y / g..z / z run-length codes
};
```

`Node.js Buffer` is accepted at runtime since `Buffer extends Uint8Array`;
the type was dropped from the signature to keep the package free of
`@types/node` requirements in browser builds.

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

Output is verified bit-exact against upstream `zpl-image@0.3.0` for both
`rgbaToZ64` and `rgbaToACS` via golden-vector suites in
`test/fixtures/fixtures.json` and `test/fixtures/fixtures-acs.json`. Any
drift fails the test run.

## What is intentionally not ported

### Browser DOM helpers (`imageToZ64` / `imageToACS`)

Upstream's `imageToZ64` / `imageToACS` take an `HTMLImageElement`, draw it
onto a `<canvas>`, and extract RGBA via `getImageData()`. These are thin
convenience wrappers -- in modern code the equivalent is one line using
`createImageBitmap()` + `OffscreenCanvas`, so they are not bundled:

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
