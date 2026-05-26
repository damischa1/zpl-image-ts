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

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
