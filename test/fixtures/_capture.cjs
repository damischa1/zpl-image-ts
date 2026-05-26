// Generates golden vectors from the upstream zpl-image package so the
// TypeScript port can be verified bit-exact. Run once; output is checked in.
const fs = require('node:fs');
const path = require('node:path');
const {rgbaToZ64, rgbaToACS} = require('zpl-image');

function makeRgba(w, h, fillFn) {
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [r, g, b, a] = fillFn(x, y);
            const i = (y * w + x) * 4;
            buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
        }
    }
    return buf;
}

const cases = [
    {
        name: 'solid-black-8x4',
        width: 8, height: 4,
        opts: {notrim: true},
        rgba: makeRgba(8, 4, () => [0, 0, 0, 255]),
    },
    {
        name: 'solid-white-8x4-notrim',
        width: 8, height: 4,
        opts: {notrim: true},
        rgba: makeRgba(8, 4, () => [255, 255, 255, 255]),
    },
    {
        name: 'checkerboard-16x16',
        width: 16, height: 16,
        opts: {notrim: true},
        rgba: makeRgba(16, 16, (x, y) => ((x + y) & 1) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'diagonal-32x32-rotate-R',
        width: 32, height: 32,
        opts: {notrim: true, rotate: 'R'},
        rgba: makeRgba(32, 32, (x, y) => x === y ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'diagonal-32x32-rotate-L',
        width: 32, height: 32,
        opts: {notrim: true, rotate: 'L'},
        rgba: makeRgba(32, 32, (x, y) => x === y ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'diagonal-32x32-rotate-I',
        width: 32, height: 32,
        opts: {notrim: true, rotate: 'I'},
        rgba: makeRgba(32, 32, (x, y) => x === y ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'padded-trim-default',
        width: 16, height: 8,
        opts: {},
        rgba: makeRgba(16, 8, (x, y) => (x >= 4 && x < 12 && y >= 2 && y < 6) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'alpha-blend-grey',
        width: 8, height: 8,
        opts: {notrim: true},
        rgba: makeRgba(8, 8, (x) => [0, 0, 0, x * 32]),
    },
    {
        name: 'threshold-25-percent',
        width: 8, height: 8,
        opts: {notrim: true, black: 25},
        rgba: makeRgba(8, 8, (x) => [x * 32, x * 32, x * 32, 255]),
    },
    {
        name: 'threshold-75-percent',
        width: 8, height: 8,
        opts: {notrim: true, black: 75},
        rgba: makeRgba(8, 8, (x) => [x * 32, x * 32, x * 32, 255]),
    },

    // ----- Bit-packing edge cases: non-byte-aligned widths -----
    // The packing loop emits a partial byte whenever bitx == width OR (bitx & 7) == 0.
    // Widths that are not multiples of 8 stress the "trailing partial byte" branch.
    {
        name: 'width-1-tall',
        width: 1, height: 16,
        opts: {notrim: true},
        rgba: makeRgba(1, 16, (_x, y) => (y & 1) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'width-7-checker',
        width: 7, height: 5,
        opts: {notrim: true},
        rgba: makeRgba(7, 5, (x, y) => ((x + y) & 1) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'width-9-vertical-stripes',
        width: 9, height: 4,
        opts: {notrim: true},
        rgba: makeRgba(9, 4, (x) => (x & 1) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'width-15-horizontal-stripes',
        width: 15, height: 6,
        opts: {notrim: true},
        rgba: makeRgba(15, 6, (_x, y) => (y & 1) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'width-17-diagonal',
        width: 17, height: 17,
        opts: {notrim: true},
        rgba: makeRgba(17, 17, (x, y) => x === y ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'width-33-frame',
        width: 33, height: 12,
        opts: {notrim: true},
        rgba: makeRgba(33, 12, (x, y) =>
            (x === 0 || x === 32 || y === 0 || y === 11) ? [0,0,0,255] : [255,255,255,255]),
    },

    // ----- Rotation completeness -----
    {
        name: 'rotate-N-explicit-8x4',
        width: 8, height: 4,
        opts: {notrim: true, rotate: 'N'},
        rgba: makeRgba(8, 4, (x, y) => ((x + y) & 1) ? [0,0,0,255] : [255,255,255,255]),
    },
    {
        name: 'rotate-B-alias-for-L-asymmetric',
        // Asymmetric pattern: row index visible in output after rotation
        width: 8, height: 4,
        opts: {notrim: true, rotate: 'B'},
        rgba: makeRgba(8, 4, (x, y) => (x < y + 1) ? [0,0,0,255] : [255,255,255,255]),
    },

    // ----- Luminance weighting (.3 R + .59 G + .11 B) -----
    // Pure green should appear darkest at full intensity (.59 weight),
    // pure blue should remain almost white (.11). black=50 -> threshold = 127.5
    {
        name: 'pure-red-8x1',
        width: 8, height: 1,
        opts: {notrim: true},
        rgba: makeRgba(8, 1, (x) => [x * 36, 0, 0, 255]),
    },
    {
        name: 'pure-green-8x1',
        width: 8, height: 1,
        opts: {notrim: true},
        rgba: makeRgba(8, 1, (x) => [0, x * 36, 0, 255]),
    },
    {
        name: 'pure-blue-8x1',
        width: 8, height: 1,
        opts: {notrim: true},
        rgba: makeRgba(8, 1, (x) => [0, 0, x * 36, 255]),
    },

    // ----- Alpha edge cases -----
    {
        name: 'fully-transparent-black-is-white',
        width: 8, height: 4,
        opts: {notrim: true},
        rgba: makeRgba(8, 4, () => [0, 0, 0, 0]),
    },

    // ----- Trim with asymmetric bounding box -----
    // Black square offset to bottom-right -> minx,miny > 0 and maxx,maxy < edges.
    {
        name: 'trim-asymmetric-bbox',
        width: 24, height: 16,
        opts: {},
        rgba: makeRgba(24, 16, (x, y) =>
            (x >= 17 && x < 22 && y >= 11 && y < 14) ? [0,0,0,255] : [255,255,255,255]),
    },

    // ----- Realistic-size deflate determinism -----
    // Larger image with a repeating pattern; verifies node:zlib output matches upstream
    // byte-for-byte (default compression level, raw deflate via zlib.deflateSync).
    {
        name: 'large-200x96-pattern',
        width: 200, height: 96,
        opts: {notrim: true},
        rgba: makeRgba(200, 96, (x, y) =>
            ((x >> 3) + (y >> 3)) & 1 ? [0,0,0,255] : [255,255,255,255]),
    },
];

const out = cases.map(c => ({
    name: c.name,
    width: c.width,
    height: c.height,
    opts: c.opts,
    rgba: Buffer.from(c.rgba).toString('base64'),
    expected: rgbaToZ64(c.rgba, c.width, c.opts),
}));

const outPath = path.resolve(__dirname, 'fixtures.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', out.length, 'fixtures to', outPath);

// ----- ACS fixtures (same cases, separate file). -----
const acsOut = cases.map(c => ({
    name: c.name,
    width: c.width,
    height: c.height,
    opts: c.opts,
    rgba: Buffer.from(c.rgba).toString('base64'),
    expected: rgbaToACS(c.rgba, c.width, c.opts),
}));
const acsPath = path.resolve(__dirname, 'fixtures-acs.json');
fs.writeFileSync(acsPath, JSON.stringify(acsOut, null, 2));
console.log('Wrote', acsOut.length, 'ACS fixtures to', acsPath);
