/**
 * ACS encoder: hex + ZPL's Alternative Data Compression Scheme run-length
 * codes. Synchronous (no compression library needed).
 *
 * Algorithm credit: Mark Warren (https://github.com/metafloor/zpl-image),
 * MIT 2019. See ../NOTICE.md for full attribution.
 *
 * Importing this module directly (`import {rgbaToACS} from 'zpl-image-ts/acs'`)
 * leaves the Z64 encoder, its CRC16 table, and CompressionStream glue out of
 * the bundle entirely.
 */

import {prepare, type BitmapResult, type RgbaInput, type RgbaOptions} from './internal/bitmap.js';

export type {RgbaInput, RgbaOptions};

export interface RgbaToACSResult extends BitmapResult {
    /** Hex-encoded payload with ACS run-length codes; used for `^GFA` arg 4. */
    acs: string;
}

/**
 * Convert an RGBA bitmap to a Zebra ACS-encoded `^GFA` payload.
 *
 * @example
 * ```ts
 * const r = rgbaToACS(rgba, width);
 * const cmd = `^GFA,${r.length},${r.length},${r.rowlen},${r.acs}`;
 * ```
 */
export function rgbaToACS(
    rgba: RgbaInput,
    width: number,
    opts: RgbaOptions = {},
): RgbaToACSResult {
    const {buf, rowlen} = prepare(rgba, width, opts);

    let hex = '';
    for (let i = 0, n = buf.data.length; i < n; i++) {
        hex += hexmap[buf.data[i] as number];
    }

    // ACS run-length codes:
    //   G..Y  -> repeats of 1..19
    //   g..y  -> repeats of 20..380 (in steps of 20)
    //   z     -> repeats of 400 (combined with above for higher counts)
    const lowRun = '_ghijklmnopqrstuvwxy';
    const highRun = '_GHIJKLMNOPQRSTUVWXY';
    const re = /([0-9a-fA-F])\1{2,}/g;
    let acs = '';
    let offset = 0;
    let match = re.exec(hex);
    while (match) {
        acs += hex.substring(offset, match.index);
        let l = match[0].length;
        while (l >= 400) {
            acs += 'z';
            l -= 400;
        }
        if (l >= 20) {
            acs += lowRun[Math.trunc(l / 20)];
            l = l % 20;
        }
        if (l) {
            acs += highRun[l];
        }
        acs += match[1];
        offset = re.lastIndex;
        match = re.exec(hex);
    }
    acs += hex.substring(offset);

    return {
        length: buf.data.length,
        rowlen,
        width: buf.width,
        height: buf.height,
        acs,
    };
}

const hexmap: ReadonlyArray<string> = (() => {
    const arr = new Array<string>(256);
    for (let i = 0; i < 16; i++) arr[i] = '0' + i.toString(16);
    for (let i = 16; i < 256; i++) arr[i] = i.toString(16);
    return arr;
})();
