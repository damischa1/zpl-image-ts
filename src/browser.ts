/**
 * Browser DOM helpers: rasterize an image source via `createImageBitmap` +
 * `OffscreenCanvas`, then run it through `rgbaToZ64` / `rgbaToACS`.
 *
 * Subpath-only entry (`zpl-image-ts/browser`). Not re-exported from the
 * main barrel because both APIs require browser-only globals
 * (`createImageBitmap`, `OffscreenCanvas`) that do not exist in Node.
 *
 * Mirrors upstream `imageToZ64` / `imageToACS` but accepts any
 * `ImageBitmapSource` -- not just `HTMLImageElement` -- so a `Blob` from
 * `fetch()` or an `ImageData` you already have can be passed directly.
 */

import {rgbaToZ64, type RgbaToZ64Result} from './z64.js';
import {rgbaToACS, type RgbaToACSResult} from './acs.js';
import type {RgbaOptions} from './internal/bitmap.js';

export type {RgbaOptions, RgbaToZ64Result, RgbaToACSResult};

/**
 * Decode `source` into RGBA pixels via the platform's image decoder, then
 * compress with Z64. Available in any context that has `createImageBitmap`
 * (every evergreen browser, plus modern web workers).
 */
export async function imageToZ64(
    source: ImageBitmapSource,
    opts?: RgbaOptions,
): Promise<RgbaToZ64Result> {
    const {rgba, width} = await rasterize(source);
    return rgbaToZ64(rgba, width, opts);
}

/**
 * Decode `source` into RGBA pixels and encode with ACS run-length codes.
 * Sync compression -- only the rasterisation step is async because
 * `createImageBitmap` is.
 */
export async function imageToACS(
    source: ImageBitmapSource,
    opts?: RgbaOptions,
): Promise<RgbaToACSResult> {
    const {rgba, width} = await rasterize(source);
    return rgbaToACS(rgba, width, opts);
}

async function rasterize(
    source: ImageBitmapSource,
): Promise<{rgba: Uint8ClampedArray; width: number}> {
    const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source);
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error(
                'imageToZ64/imageToACS: OffscreenCanvas 2D context unavailable in this runtime',
            );
        }
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return {rgba: imageData.data, width: imageData.width};
    } finally {
        // Only close the bitmap we just created -- never the caller's.
        if (source !== bitmap) bitmap.close();
    }
}
