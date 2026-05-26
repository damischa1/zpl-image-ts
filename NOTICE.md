# Credits and attribution

This package is a TypeScript port of [`zpl-image`](https://github.com/metafloor/zpl-image)
by **Mark Warren** (`metafloor`), originally published 2019 under the MIT license.

The algorithm in `src/index.ts` -- luminance thresholding, optional rotation,
1-bit packing, deflate compression, base64 + CRC16 envelope -- is a direct
translation of the corresponding routines in the upstream
`zpl-image.js`. The bit-level output of `rgbaToZ64` is verified to match the
original implementation byte-for-byte via the golden vector test suite under
`test/fixtures/`.

## What was changed in this port

- Rewritten in TypeScript with full type declarations.
- Node-only: no browser fallback, no `pako` dependency. Uses Node's built-in
  `node:zlib` for deflate.
- ESM with named exports (the original was a UMD bundle whose
  `module.exports = factory()` pattern hid named exports from Node's
  cjs-module-lexer, breaking `import {rgbaToZ64}` under real ESM).
- Narrowed scope: only `rgbaToZ64` is exported. The original's
  `rgbaToACS`, `imageToZ64`, `imageToACS`, and DOM helpers were dropped --
  they are easy to reintroduce later if needed.
- Vitest test suite with golden vectors captured from the upstream package
  guarantees bit-exact compatibility.

## Original upstream license

The upstream `zpl-image` is distributed under the MIT license. The full
upstream `LICENSE` text reads:

```
zpl-image

Copyright 2019 Mark Warren

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
