/**
 * zpl-image-ts -- TypeScript port of metafloor/zpl-image.
 *
 * Algorithm credit: Mark Warren (https://github.com/metafloor/zpl-image),
 * MIT 2019. This file is a direct transliteration of the corresponding
 * routines in upstream zpl-image.js. See NOTICE.md for full attribution.
 *
 * Isomorphic: uses web-standard `CompressionStream('deflate')` (global in
 * Node 18+ and every evergreen browser) and `Uint8Array.prototype.toBase64()`
 * when available, with a portable btoa-based fallback. Zero runtime deps.
 */

/** Pixel data input. Each pixel is four consecutive bytes: R, G, B, A. */
export type RgbaInput = Uint8Array | Uint8ClampedArray | readonly number[];

/** Options shared by `rgbaToZ64` and `rgbaToACS`. */
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

/** @deprecated Use `RgbaOptions`. Kept as an alias for source compatibility. */
export type RgbaToZ64Options = RgbaOptions;

interface ResultBase {
    /** Uncompressed byte count; used for `^GFA` args 1 and 2. */
    length: number;
    /** Packed bytes per row; used for `^GFA` arg 3. */
    rowlen: number;
    /** Image width after rotation (pixels). */
    width: number;
    /** Image height after rotation (pixels). */
    height: number;
}

export interface RgbaToZ64Result extends ResultBase {
    /** `:Z64:<base64>:<crc16hex>` payload; used for `^GFA` arg 4. */
    z64: string;
}

export interface RgbaToACSResult extends ResultBase {
    /** Hex-encoded payload with ACS run-length codes; used for `^GFA` arg 4. */
    acs: string;
}

interface MonoBuffer {
    data: Uint8Array;
    width: number;
    height: number;
}

interface PreparedBitmap {
    buf: MonoBuffer;
    rowlen: number;
}

/**
 * Validate input, convert to monochrome, and apply the requested rotation.
 * Shared by `rgbaToZ64` and `rgbaToACS`.
 */
function prepare(rgba: RgbaInput, width: number, opts: RgbaOptions): PreparedBitmap {
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

/**
 * Convert an RGBA bitmap to a Zebra Z64-encoded `^GFA` payload.
 *
 * Example usage of the result:
 * ```
 * `^GFA,${r.length},${r.length},${r.rowlen},${r.z64}`
 * ```
 */
export async function rgbaToZ64(
    rgba: RgbaInput,
    width: number,
    opts: RgbaOptions = {},
): Promise<RgbaToZ64Result> {
    const {buf, rowlen} = prepare(rgba, width, opts);
    const deflated = await deflateZlib(buf.data);
    const b64 = bytesToBase64(deflated);
    return {
        length: buf.data.length,
        rowlen,
        width: buf.width,
        height: buf.height,
        z64: ':Z64:' + b64 + ':' + crc16(b64),
    };
}

/**
 * Convert an RGBA bitmap to a Zebra ACS-encoded `^GFA` payload (hex +
 * run-length codes). Synchronous; useful for environments where
 * `CompressionStream` is unavailable or where you want a hex-readable
 * payload for debugging.
 *
 * Example usage of the result:
 * ```
 * `^GFA,${r.length},${r.length},${r.rowlen},${r.acs}`
 * ```
 */
export function rgbaToACS(
    rgba: RgbaInput,
    width: number,
    opts: RgbaOptions = {},
): RgbaToACSResult {
    const {buf, rowlen} = prepare(rgba, width, opts);

    // Hex encode.
    let hex = '';
    for (let i = 0, n = buf.data.length; i < n; i++) {
        hex += hexmap[buf.data[i] as number];
    }

    // Apply ACS run-length compression:
    //   G..Y      = repeats of 1..19
    //   g..y      = repeats of 20..380 (in steps of 20)
    //   z         = repeats of 400 (combined with above for higher counts)
    const lowRun = '_ghijklmnopqrstuvwxy'; // 0..19 (slot 0 unused)
    const highRun = '_GHIJKLMNOPQRSTUVWXY'; // 0..19 (slot 0 unused)
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

// ---------------------------------------------------------------------------
// Web-standard isomorphic primitives (no Node-specific imports)
// ---------------------------------------------------------------------------

async function deflateZlib(buf: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([buf])
        .stream()
        .pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64(buf: Uint8Array): string {
    // TC39 native: Node 22+, Chrome 133+, Firefox 133+, Safari 18.2+.
    const native = (buf as unknown as {toBase64?: () => string}).toBase64;
    if (typeof native === 'function') return native.call(buf);
    // Portable fallback: btoa is global in Node 16+ and all browsers.
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i] as number);
    return btoa(s);
}

// ---------------------------------------------------------------------------
// Internal helpers (direct transliteration of metafloor/zpl-image)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CRC16 used by Zebra. NOT an accumulating CRC -- normal acc would init to
// 0xffff and invert on each call; this one just starts at 0 to match the
// printer's expectation.
// ---------------------------------------------------------------------------

const crcTable: ReadonlyArray<number> = [
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b,
    0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
    0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
    0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
    0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738,
    0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96,
    0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
    0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
    0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
    0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb,
    0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2,
    0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
    0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
    0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
    0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827,
    0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
    0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
    0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
    0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
    0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
];

function crc16(s: string): string {
    let crc = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c > 255) {
            throw new RangeError('crc16: non-byte character at offset ' + i);
        }
        const j = (c ^ (crc >> 8)) & 0xff;
        crc = crcTable[j]! ^ (crc << 8);
    }
    const hex = (crc & 0xffff).toString(16).toLowerCase();
    return '0000'.slice(hex.length) + hex;
}
