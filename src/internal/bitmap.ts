/**
 * Shared bitmap pipeline: input validation, monochrome conversion, rotation,
 * 1-bit packing. Direct transliteration of routines from upstream
 * metafloor/zpl-image (MIT 2019). See ../../NOTICE.md.
 *
 * Internal: imported by `../z64.ts` and `../acs.ts`. Not part of the public
 * API surface. The dist still ships compiled .js/.d.ts for it (so source
 * maps and declaration maps resolve cleanly), but it is not listed in
 * `package.json` "exports" -- consumers cannot reach it.
 */

/** Pixel data input. Each pixel is four consecutive bytes: R, G, B, A. */
export type RgbaInput = Uint8Array | Uint8ClampedArray | readonly number[];

/** Options shared by every encoder. */
export interface RgbaOptions {
    /** Blackness threshold, 1..99. Default 50. */
    black?: number;
    /** If true, do not auto-trim surrounding whitespace. Default false. */
    notrim?: boolean;
    /**
     * Rotation:
     *  - 'N' (default): no rotation
     *  - 'L' or 'B': 90 degrees counter-clockwise
     *  - 'R': 90 degrees clockwise
     *  - 'I': 180 degrees
     */
    rotate?: 'N' | 'L' | 'R' | 'I' | 'B';
}

/** Common fields on every encoder's result. */
export interface BitmapResult {
    /** Uncompressed byte count; used for `^GFA` args 1 and 2. */
    length: number;
    /** Packed bytes per row; used for `^GFA` arg 3. */
    rowlen: number;
    /** Image width after rotation (pixels). */
    width: number;
    /** Image height after rotation (pixels). */
    height: number;
    /**
     * Ready-to-emit `^GFA,length,length,rowlen,payload` command string.
     * Wrap it in `^XA ... ^XZ` (with any `^FO` / `^PR` / `~SD` etc. you need)
     * and send to the printer. Saves consumers from re-templating the
     * length-twice, rowlen-third structure by hand.
     */
    gfa: string;
}

export interface MonoBuffer {
    data: Uint8Array;
    width: number;
    height: number;
}

export interface PreparedBitmap {
    buf: MonoBuffer;
    rowlen: number;
}

/**
 * Validate input, convert to monochrome, and apply the requested rotation.
 * The returned `buf.data` is 1-bit-packed and ready for hex or deflate
 * encoding.
 */
export function prepare(rgba: RgbaInput, width: number, opts: RgbaOptions): PreparedBitmap {
    const w = width | 0;
    if (!w || w < 0) {
        throw new Error('Invalid width');
    }
    const height = Math.trunc(rgba.length / w / 4);
    const black = +(opts.black ?? 0) || 50;
    const mono = monochrome(rgba, w, height, black, opts.notrim === true);

    let buf: MonoBuffer;
    switch (opts.rotate) {
        case 'R':
            buf = right(mono);
            break;
        case 'B':
        case 'L':
            buf = left(mono);
            break;
        case 'I':
            buf = invert(mono);
            break;
        default:
            buf = normal(mono);
            break;
    }

    return {buf, rowlen: Math.trunc((buf.width + 7) / 8)};
}

function normal(mono: MonoBuffer): MonoBuffer {
    const {width, height, data: src} = mono;
    const buf = new Uint8Array(Math.trunc((width + 7) / 8) * height);
    let idx = 0;
    let byte = 0;
    let bitx = 0;
    for (let i = 0, n = src.length; i < n; i++) {
        byte |= src[i]! << (7 - (bitx++ & 7));
        if (bitx === width || !(bitx & 7)) {
            buf[idx++] = byte;
            byte = 0;
            if (bitx === width) {
                bitx = 0;
            }
        }
    }
    return {data: buf, width, height};
}

function invert(mono: MonoBuffer): MonoBuffer {
    const {width, height, data: src} = mono;
    const buf = new Uint8Array(Math.trunc((width + 7) / 8) * height);
    let idx = 0;
    let byte = 0;
    let bitx = 0;
    for (let i = src.length - 1; i >= 0; i--) {
        byte |= src[i]! << (7 - (bitx++ & 7));
        if (bitx === width || !(bitx & 7)) {
            buf[idx++] = byte;
            byte = 0;
            if (bitx === width) {
                bitx = 0;
            }
        }
    }
    return {data: buf, width, height};
}

function left(mono: MonoBuffer): MonoBuffer {
    const {width, height, data: src} = mono;
    const buf = new Uint8Array(Math.trunc((height + 7) / 8) * width);
    let idx = 0;
    let byte = 0;
    for (let x = width - 1; x >= 0; x--) {
        let bitx = 0;
        for (let y = 0; y < height; y++) {
            byte |= src[y * width + x]! << (7 - (bitx++ & 7));
            if (y === height - 1 || !(bitx & 7)) {
                buf[idx++] = byte;
                byte = 0;
            }
        }
    }
    return {data: buf, width: height, height: width};
}

function right(mono: MonoBuffer): MonoBuffer {
    const {width, height, data: src} = mono;
    const buf = new Uint8Array(Math.trunc((height + 7) / 8) * width);
    let idx = 0;
    let byte = 0;
    for (let x = 0; x < width; x++) {
        let bitx = 0;
        for (let y = height - 1; y >= 0; y--) {
            byte |= src[y * width + x]! << (7 - (bitx++ & 7));
            if (y === 0 || !(bitx & 7)) {
                buf[idx++] = byte;
                byte = 0;
            }
        }
    }
    return {data: buf, width: height, height: width};
}

/**
 * Convert RGBA to monochrome, 1 bit per byte. Crops empty space around the
 * edges unless `notrim` is true. Uses Rec.601-style luminance weights with
 * straight alpha blending against a white background.
 */
function monochrome(
    rgba: RgbaInput,
    width: number,
    height: number,
    blackPercent: number,
    notrim: boolean,
): MonoBuffer {
    const black = (255 * blackPercent) / 100;

    let minx: number;
    let maxx: number;
    let miny: number;
    let maxy: number;

    if (notrim) {
        minx = 0;
        miny = 0;
        maxx = width - 1;
        maxy = height - 1;
    } else {
        maxx = 0;
        maxy = 0;
        minx = width;
        miny = height;
        let x = 0;
        let y = 0;
        for (let i = 0, n = width * height * 4; i < n; i += 4) {
            const a = rgba[i + 3]! / 255;
            const r = rgba[i]! * 0.3 * a + 255 * (1 - a);
            const g = rgba[i + 1]! * 0.59 * a + 255 * (1 - a);
            const b = rgba[i + 2]! * 0.11 * a + 255 * (1 - a);
            const gray = r + g + b;

            if (gray <= black) {
                if (minx > x) minx = x;
                if (miny > y) miny = y;
                if (maxx < x) maxx = x;
                if (maxy < y) maxy = y;
            }
            if (++x === width) {
                x = 0;
                y++;
            }
        }
    }

    const cx = maxx - minx + 1;
    const cy = maxy - miny + 1;
    const buf = new Uint8Array(cx * cy);
    let idx = 0;
    for (let y = miny; y <= maxy; y++) {
        let i = (y * width + minx) * 4;
        for (let x = minx; x <= maxx; x++) {
            const a = rgba[i + 3]! / 255;
            const r = rgba[i]! * 0.3 * a + 255 * (1 - a);
            const g = rgba[i + 1]! * 0.59 * a + 255 * (1 - a);
            const b = rgba[i + 2]! * 0.11 * a + 255 * (1 - a);
            const gray = r + g + b;

            buf[idx++] = gray <= black ? 1 : 0;
            i += 4;
        }
    }

    return {data: buf, width: cx, height: cy};
}
