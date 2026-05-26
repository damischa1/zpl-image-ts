# zpl-image-ts

TypeScript port of [`metafloor/zpl-image`](https://github.com/metafloor/zpl-image).
Converts an RGBA bitmap into a Zebra `^GFA`-ready Z64 payload (zlib-deflate +
base64 + CRC16 envelope). Isomorphic: runs in Node.js 18+ and any modern
browser, with zero runtime dependencies.

```ts
import {rgbaToZ64} from 'zpl-image-ts';

const result = await rgbaToZ64(rgbaBuffer, width, {rotate: 'R'});
// result.gfa === `^GFA,${result.length},${result.length},${result.rowlen},${result.z64}`
const zpl = '^XA' + result.gfa + '^FS^XZ';
```

## Import paths

Five entry points -- pick whichever matches what you need:

```ts
// Convenience barrel. Bundlers with sideEffects:false respect it and
// tree-shake unused encoders automatically.
import {rgbaToZ64, rgbaToACS, buildZpl} from 'zpl-image-ts';

// Explicit subpath -- guarantees the other encoder, its compression glue,
// and (for /z64) the 256-entry CRC16 table are never bundled.
import {rgbaToZ64} from 'zpl-image-ts/z64';
import {rgbaToACS} from 'zpl-image-ts/acs';

// Browser DOM helpers -- rasterise an ImageBitmapSource (HTMLImageElement,
// Blob, ImageData, ImageBitmap, OffscreenCanvas, ...) before encoding.
// Pulls in zero DOM types on the server side because it lives behind its
// own subpath.
import {imageToZ64, imageToACS} from 'zpl-image-ts/browser';

// ZPL label builder -- wrap one or more ^GFA blocks in a complete
// ^XA...^XZ payload with darkness, print rate, copies, etc. Tiny and
// dependency-free, so importing it from the barrel is fine too.
import {buildZpl} from 'zpl-image-ts/zpl';
```

All five paths re-export `RgbaInput` and `RgbaOptions` where relevant.
The encoder subpaths additionally export their own `RgbaToZ64Result` /
`RgbaToACSResult` types; the `zpl` subpath exports `ZplLabelOptions`.

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
- `result.gfa` ergonomic: every encoder result includes a ready-to-emit
  `^GFA,length,length,rowlen,payload` string, so call sites do not have
  to template the four fields by hand.
- Optional browser DOM helpers (`imageToZ64` / `imageToACS`) under the
  separate `zpl-image-ts/browser` entry point, tree-shaken out of
  server bundles.
- Optional ZPL label builder (`buildZpl`) under `zpl-image-ts/zpl`:
  darkness, print rate, copies, field origin, multi-page batches. So
  callers never have to learn ZPL syntax just to print an image.

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
    gfa: string;    // '^GFA,length,length,rowlen,z64' -- ready to splice into ZPL
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
    gfa: string;    // '^GFA,length,length,rowlen,acs' -- ready to splice into ZPL
};

// Browser-only convenience helpers -- subpath `zpl-image-ts/browser`.
// Rasterise any ImageBitmapSource (HTMLImageElement, Blob, ImageData,
// ImageBitmap, OffscreenCanvas, ...) via createImageBitmap +
// OffscreenCanvas, then run it through rgbaToZ64 / rgbaToACS.
function imageToZ64(
    source: ImageBitmapSource,
    opts?: RgbaOptions,
): Promise<RgbaToZ64Result>;

function imageToACS(
    source: ImageBitmapSource,
    opts?: RgbaOptions,
): Promise<RgbaToACSResult>;

// Wrap one or more ^GFA blocks in a complete ^XA...^XZ label. Subpath
// `zpl-image-ts/zpl`. Re-exported from the barrel.
interface ZplLabelOptions {
    darkness?: number;                  // ~SD, 0..30, one decimal
    printRate?: number;                 // ^PR, 1..14 (inches/sec on most printers)
    copies?: number;                    // ^PQ, omitted when <= 1
    fieldOrigin?: {x: number; y: number}; // ^FO before the ^GFA block
    prelude?: string;                   // raw ZPL after ^XA  (e.g. ^PW, ^LL, ^MM)
    postlude?: string;                  // raw ZPL before ^XZ (e.g. ^XB)
}

function buildZpl(
    gfa: string | readonly string[],
    opts?: ZplLabelOptions,
): string;
```

### Splicing into a ZPL label

```ts
const result = await rgbaToZ64(rgba, width);
const zpl = '^XA' + result.gfa + '^XZ';
// equivalent to manually writing:
//   '^XA^GFA,' + result.length + ',' + result.length + ',' +
//   result.rowlen + ',' + result.z64 + '^XZ'
```

For anything beyond the bare `^XA…^XZ` framing -- darkness, print rate,
copy count, field origin -- use the `buildZpl` helper from
`zpl-image-ts/zpl` (also re-exported from the barrel). It exists so the
caller never has to learn ZPL syntax just to get an image onto paper:

```ts
import {rgbaToZ64, buildZpl} from 'zpl-image-ts';

const result = await rgbaToZ64(rgba, width);
const zpl = buildZpl(result.gfa, {
    darkness: 15,        // ~SD15.0   (media darkness, 0..30, one decimal)
    printRate: 4,        // ^PR4,A,A  (inches/sec, 1..14)
    copies: 2,           // ^PQ2      (omitted when <= 1)
    fieldOrigin: {x: 30, y: 15}, // ^FO30,15 before the ^GFA block
});
// -> '^XA^PR4,A,A~SD15.0^FO30,15^GFA,...^PQ2^XZ'
```

`buildZpl` also accepts an array of `gfa` strings -- e.g. one per page
rasterised from a PDF -- and emits one `^XA…^XZ` block per entry,
joined with `\n`. The same options apply to every label in the batch.
For advanced cases the `prelude` and `postlude` options accept raw ZPL
inserted directly after `^XA` and before `^XZ` respectively
(e.g. `^PW`, `^LL`, `^MM`, `^XB`).

### End-to-end: image to printer over TCP

Zebra network printers accept raw ZPL on TCP port 9100. Combined with
`imageToZ64` (browser/worker) or `rgbaToZ64` (Node + mupdf, sharp, etc.)
the full pipeline is a handful of lines and the caller never types `^XA`:

```ts
// Node: PNG/JPG on disk -> ZPL -> printer
import {readFile} from 'node:fs/promises';
import {createConnection} from 'node:net';
import sharp from 'sharp';
import {rgbaToZ64, buildZpl} from 'zpl-image-ts';

const png = await readFile('label.png');
const {data, info} = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});

const result = await rgbaToZ64(data, info.width, {rotate: 'R'});
const zpl = buildZpl(result.gfa, {darkness: 15, printRate: 4});

await new Promise<void>((resolve, reject) => {
    const sock = createConnection({host: '192.168.1.42', port: 9100}, () => {
        sock.end(zpl, 'ascii', () => resolve());
    });
    sock.once('error', reject);
});
```

```ts
// Browser: <input type="file"> -> ZPL -> POST to your print proxy
import {imageToZ64} from 'zpl-image-ts/browser';
import {buildZpl} from 'zpl-image-ts/zpl';

const file: Blob = input.files![0];
const result = await imageToZ64(file, {rotate: 'R'});
const zpl = buildZpl(result.gfa, {darkness: 15, printRate: 4});

await fetch('/api/print', {method: 'POST', body: zpl});
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

### Legacy browser support (pre-2023)

`rgbaToZ64` relies on the web-standard `CompressionStream('deflate')` API.
That global is available in:

- Node.js 18+ (April 2022)
- Chrome / Edge 80+ (February 2020)
- Safari 16.4+ (March 2023)
- Firefox 113+ (May 2023)

Runtimes older than the above (Safari 16.3 and below, Firefox 112 and below,
any Internet Explorer) **are not supported and no polyfill is bundled**.

If you need to support those runtimes, wrap this library yourself in three
lines using [`fflate`](https://github.com/101arrowz/fflate) (~8 kB min+gz,
faster and smaller than `pako`):

```ts
import {zlibSync} from 'fflate';
import {rgbaToACS} from 'zpl-image-ts/acs';
// ...build your own rgbaToZ64 by replacing the deflate step with zlibSync().
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
