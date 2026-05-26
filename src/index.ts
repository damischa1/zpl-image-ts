/**
 * zpl-image-ts -- TypeScript port of metafloor/zpl-image.
 *
 * This is the convenience barrel re-export. For maximum tree-shaking, import
 * the specific encoder you need directly:
 *
 * ```ts
 * import {rgbaToZ64} from 'zpl-image-ts/z64';  // ACS code not bundled
 * import {rgbaToACS} from 'zpl-image-ts/acs';  // Z64 code not bundled
 * ```
 *
 * Most modern bundlers (Vite, esbuild, Rollup, Webpack 5) tree-shake this
 * barrel correctly too, because `package.json` declares `"sideEffects": false`
 * and both subentries are pure named exports.
 */

export {rgbaToZ64, type RgbaToZ64Result} from './z64.js';
export {rgbaToACS, type RgbaToACSResult} from './acs.js';
export type {RgbaInput, RgbaOptions} from './internal/bitmap.js';
