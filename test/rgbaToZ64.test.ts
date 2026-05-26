import {describe, expect, it} from 'vitest';

import {
    rgbaToZ64,
    rgbaToACS,
    type RgbaOptions,
    type RgbaToZ64Result,
    type RgbaToACSResult,
} from '../src/index.js';
// JSON imports work in both Node ESM (via Vite) and browser mode.
import z64FixturesJson from './fixtures/fixtures.json' with {type: 'json'};
import acsFixturesJson from './fixtures/fixtures-acs.json' with {type: 'json'};

interface Z64Fixture {
    name: string;
    width: number;
    height: number;
    opts: RgbaOptions;
    /** base64-encoded RGBA bytes */
    rgba: string;
    expected: RgbaToZ64Result;
}

interface ACSFixture {
    name: string;
    width: number;
    height: number;
    opts: RgbaOptions;
    rgba: string;
    expected: RgbaToACSResult;
}

const z64Fixtures = z64FixturesJson as Z64Fixture[];
const acsFixtures = acsFixturesJson as ACSFixture[];

/** Isomorphic base64 -> Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
    const native = (Uint8Array as unknown as {fromBase64?: (s: string) => Uint8Array}).fromBase64;
    if (typeof native === 'function') return native(b64);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

describe('rgbaToZ64 -- bit-exact compatibility with upstream metafloor/zpl-image', () => {
    for (const fx of z64Fixtures) {
        it(fx.name, async () => {
            const rgba = base64ToBytes(fx.rgba);
            const got = await rgbaToZ64(rgba, fx.width, fx.opts);
            const {length, rowlen, z64} = fx.expected;
            const expected = {
                ...fx.expected,
                gfa: `^GFA,${length},${length},${rowlen},${z64}`,
            };
            expect(got).toEqual(expected);
        });
    }
});

describe('rgbaToACS -- bit-exact compatibility with upstream metafloor/zpl-image', () => {
    for (const fx of acsFixtures) {
        it(fx.name, () => {
            const rgba = base64ToBytes(fx.rgba);
            const got = rgbaToACS(rgba, fx.width, fx.opts);
            const {length, rowlen, acs} = fx.expected;
            const expected = {
                ...fx.expected,
                gfa: `^GFA,${length},${length},${rowlen},${acs}`,
            };
            expect(got).toEqual(expected);
        });
    }
});

describe('rgbaToZ64 -- input validation', () => {
    it('rejects on zero width', async () => {
        await expect(rgbaToZ64(new Uint8Array(16), 0)).rejects.toThrow(/Invalid width/);
    });

    it('rejects on negative width', async () => {
        await expect(rgbaToZ64(new Uint8Array(16), -4)).rejects.toThrow(/Invalid width/);
    });

    it('accepts Uint8ClampedArray input', async () => {
        const data = new Uint8ClampedArray(8 * 4 * 4);
        for (let i = 0; i < data.length; i++) data[i] = 0xff;
        const r = await rgbaToZ64(data, 8, {notrim: true});
        expect(r.width).toBe(8);
        expect(r.height).toBe(4);
    });

    it('accepts plain number[] input', async () => {
        const arr: number[] = [];
        for (let i = 0; i < 8 * 4; i++) arr.push(0, 0, 0, 255);
        const r = await rgbaToZ64(arr, 8, {notrim: true});
        expect(r.width).toBe(8);
        expect(r.height).toBe(4);
        expect(r.z64.startsWith(':Z64:')).toBe(true);
    });

    it('z64 envelope ends with 4-hex CRC', async () => {
        const data = new Uint8Array(8 * 4 * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = 0xff; // opaque black
        }
        const r = await rgbaToZ64(data, 8, {notrim: true});
        expect(r.z64).toMatch(/^:Z64:[A-Za-z0-9+/=]+:[0-9a-f]{4}$/);
    });
});

describe('rgbaToZ64 -- structural invariants', () => {
    function solidBlack(w: number, h: number): Uint8Array {
        const buf = new Uint8Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            buf[i * 4 + 3] = 0xff;
        }
        return buf;
    }

    it("rotate 'B' produces the same output as rotate 'L'", async () => {
        const w = 12,
            h = 7;
        const buf = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                buf[i + 3] = 0xff;
                if (x < y) buf[i] = buf[i + 1] = buf[i + 2] = 0;
                else buf[i] = buf[i + 1] = buf[i + 2] = 0xff;
            }
        }
        const l = await rgbaToZ64(buf, w, {notrim: true, rotate: 'L'});
        const b = await rgbaToZ64(buf, w, {notrim: true, rotate: 'B'});
        expect(b).toEqual(l);
    });

    it('is deterministic: identical input -> identical output across calls', async () => {
        const buf = solidBlack(33, 17);
        const [a, b, c] = await Promise.all([
            rgbaToZ64(buf, 33, {notrim: true}),
            rgbaToZ64(buf, 33, {notrim: true}),
            rgbaToZ64(buf, 33, {notrim: true}),
        ]);
        expect(a).toEqual(b);
        expect(b).toEqual(c);
    });

    it('length === rowlen * height for unrotated output', async () => {
        for (const w of [1, 7, 8, 9, 15, 16, 17, 33, 100]) {
            const r = await rgbaToZ64(solidBlack(w, 5), w, {notrim: true});
            expect(r.width).toBe(w);
            expect(r.height).toBe(5);
            expect(r.rowlen).toBe(Math.ceil(w / 8));
            expect(r.length).toBe(r.rowlen * r.height);
        }
    });

    it('rotation swaps width and height (90 deg)', async () => {
        const buf = solidBlack(24, 9);
        const r = await rgbaToZ64(buf, 24, {notrim: true, rotate: 'R'});
        const l = await rgbaToZ64(buf, 24, {notrim: true, rotate: 'L'});
        expect(r.width).toBe(9);
        expect(r.height).toBe(24);
        expect(l.width).toBe(9);
        expect(l.height).toBe(24);
    });

    it('180-degree rotation preserves dimensions', async () => {
        const buf = solidBlack(24, 9);
        const i = await rgbaToZ64(buf, 24, {notrim: true, rotate: 'I'});
        expect(i.width).toBe(24);
        expect(i.height).toBe(9);
    });

    it('rotating a centrally-symmetric image by I is a no-op vs N', async () => {
        const buf = solidBlack(16, 8);
        const n = await rgbaToZ64(buf, 16, {notrim: true, rotate: 'N'});
        const i = await rgbaToZ64(buf, 16, {notrim: true, rotate: 'I'});
        expect(i).toEqual(n);
    });

    it('rotating by R then by L preserves dimensions consistency', async () => {
        const buf = solidBlack(20, 11);
        const r = await rgbaToZ64(buf, 20, {notrim: true, rotate: 'R'});
        const l = await rgbaToZ64(buf, 20, {notrim: true, rotate: 'L'});
        expect(r.width).toBe(l.width);
        expect(r.height).toBe(l.height);
        expect(r.rowlen).toBe(l.rowlen);
        expect(r.length).toBe(l.length);
    });

    it('default options match {black:50, notrim:false}', async () => {
        const buf = new Uint8Array(16 * 8 * 4);
        for (let y = 2; y < 6; y++) {
            for (let x = 4; x < 12; x++) {
                const i = (y * 16 + x) * 4;
                buf[i + 3] = 0xff;
            }
        }
        for (let i = 0; i < buf.length; i += 4) {
            if (buf[i + 3] === 0) {
                buf[i] = buf[i + 1] = buf[i + 2] = 0xff;
                buf[i + 3] = 0xff;
            }
        }
        const a = await rgbaToZ64(buf, 16);
        const b = await rgbaToZ64(buf, 16, {black: 50, notrim: false});
        expect(a).toEqual(b);
        expect(a.width).toBe(8);
        expect(a.height).toBe(4);
    });
});

describe('result.gfa convenience field', () => {
    it('z64 result.gfa is ^GFA,length,length,rowlen,z64', async () => {
        const buf = new Uint8Array(8 * 4 * 4);
        for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 0xff;
        const r = await rgbaToZ64(buf, 8, {notrim: true});
        expect(r.gfa).toBe(`^GFA,${r.length},${r.length},${r.rowlen},${r.z64}`);
    });

    it('acs result.gfa is ^GFA,length,length,rowlen,acs', () => {
        const buf = new Uint8Array(8 * 4 * 4);
        for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 0xff;
        const r = rgbaToACS(buf, 8, {notrim: true});
        expect(r.gfa).toBe(`^GFA,${r.length},${r.length},${r.rowlen},${r.acs}`);
    });
});

describe.skipIf(typeof createImageBitmap === 'undefined')(
    'browser helpers (zpl-image-ts/browser)',
    () => {
        it('imageToZ64 + imageToACS via ImageData match the raw rgbaToZ64/ACS path', async () => {
            const {imageToZ64, imageToACS} = await import('../src/browser.js');
            const w = 12,
                h = 8;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const black = (x + y) % 2 === 0;
                    data[i] = data[i + 1] = data[i + 2] = black ? 0 : 0xff;
                    data[i + 3] = 0xff;
                }
            }
            const imageData = new ImageData(data, w, h);
            const z = await imageToZ64(imageData, {notrim: true});
            const a = await imageToACS(imageData, {notrim: true});
            const directZ = await rgbaToZ64(data, w, {notrim: true});
            const directA = rgbaToACS(data, w, {notrim: true});
            expect(z).toEqual(directZ);
            expect(a).toEqual(directA);
        });

        it('imageToZ64 accepts an ImageBitmap and does not close caller bitmaps', async () => {
            const {imageToZ64} = await import('../src/browser.js');
            const w = 8,
                h = 4;
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < data.length; i += 4) data[i + 3] = 0xff;
            const bitmap = await createImageBitmap(new ImageData(data, w, h));
            const r = await imageToZ64(bitmap, {notrim: true});
            expect(r.width).toBe(w);
            expect(r.height).toBe(h);
            // Caller-owned bitmap must still be usable.
            expect(bitmap.width).toBe(w);
            bitmap.close();
        });
    },
);
