import {readFileSync} from 'node:fs';
import {Buffer} from 'node:buffer';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {rgbaToZ64, type RgbaToZ64Options, type RgbaToZ64Result} from '../src/index.ts';

interface Fixture {
    name: string;
    width: number;
    height: number;
    opts: RgbaToZ64Options;
    /** base64-encoded RGBA bytes */
    rgba: string;
    expected: RgbaToZ64Result;
}

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(here, 'fixtures', 'fixtures.json'), 'utf8');
const fixtures = JSON.parse(raw) as Fixture[];

describe('rgbaToZ64 -- bit-exact compatibility with upstream metafloor/zpl-image', () => {
    for (const fx of fixtures) {
        it(fx.name, () => {
            const rgba = new Uint8Array(Buffer.from(fx.rgba, 'base64'));
            const got = rgbaToZ64(rgba, fx.width, fx.opts);
            expect(got).toEqual(fx.expected);
        });
    }
});

describe('rgbaToZ64 -- input validation', () => {
    it('throws on zero width', () => {
        expect(() => rgbaToZ64(new Uint8Array(16), 0)).toThrow(/Invalid width/);
    });

    it('throws on negative width', () => {
        expect(() => rgbaToZ64(new Uint8Array(16), -4)).toThrow(/Invalid width/);
    });

    it('accepts Buffer input', () => {
        const data = Buffer.alloc(8 * 4 * 4, 0xff);
        // alpha bytes too -- pure white
        for (let i = 0; i < data.length; i++) data[i] = 0xff;
        const r = rgbaToZ64(data, 8, {notrim: true});
        expect(r.width).toBe(8);
        expect(r.height).toBe(4);
    });

    it('accepts plain number[] input', () => {
        const arr: number[] = [];
        for (let i = 0; i < 8 * 4; i++) arr.push(0, 0, 0, 255);
        const r = rgbaToZ64(arr, 8, {notrim: true});
        expect(r.width).toBe(8);
        expect(r.height).toBe(4);
        expect(r.z64.startsWith(':Z64:')).toBe(true);
    });

    it('z64 envelope ends with 4-hex CRC', () => {
        const data = new Uint8Array(8 * 4 * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = 0xff; // opaque black
        }
        const r = rgbaToZ64(data, 8, {notrim: true});
        expect(r.z64).toMatch(/^:Z64:[A-Za-z0-9+/=]+:[0-9a-f]{4}$/);
    });
});
