// Generates golden vectors from the upstream zpl-image package so the
// TypeScript port can be verified bit-exact. Run once; output is checked in.
const fs = require('node:fs');
const path = require('node:path');
const {rgbaToZ64} = require('zpl-image');

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
