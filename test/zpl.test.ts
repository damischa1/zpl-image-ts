import {describe, it, expect} from 'vitest';
import {buildZpl} from '../src/zpl.js';

describe('buildZpl', () => {
    const GFA = '^GFA,16,16,4,abcd';

    it('wraps a single gfa block in ^XA...^XZ with no decorators by default', () => {
        expect(buildZpl(GFA)).toBe(`^XA${GFA}^XZ`);
    });

    it('emits ~SD with one decimal for darkness', () => {
        expect(buildZpl(GFA, {darkness: 15})).toBe(`^XA~SD15.0${GFA}^XZ`);
        expect(buildZpl(GFA, {darkness: 12.5})).toBe(`^XA~SD12.5${GFA}^XZ`);
    });

    it('clamps darkness to 0..30', () => {
        expect(buildZpl(GFA, {darkness: -10})).toBe(`^XA~SD0.0${GFA}^XZ`);
        expect(buildZpl(GFA, {darkness: 99})).toBe(`^XA~SD30.0${GFA}^XZ`);
    });

    it('emits ^PR<rate>,A,A for printRate', () => {
        expect(buildZpl(GFA, {printRate: 4})).toBe(`^XA^PR4,A,A${GFA}^XZ`);
    });

    it('clamps printRate to 1..14 and truncates floats', () => {
        expect(buildZpl(GFA, {printRate: 0})).toBe(`^XA^PR1,A,A${GFA}^XZ`);
        expect(buildZpl(GFA, {printRate: 99})).toBe(`^XA^PR14,A,A${GFA}^XZ`);
        expect(buildZpl(GFA, {printRate: 6.9})).toBe(`^XA^PR6,A,A${GFA}^XZ`);
    });

    it('combines printRate, darkness and fieldOrigin in canonical order', () => {
        const out = buildZpl(GFA, {darkness: 20, printRate: 6, fieldOrigin: {x: 30, y: 15}});
        expect(out).toBe(`^XA^PR6,A,A~SD20.0^FO30,15${GFA}^XZ`);
    });

    it('emits ^PQ only when copies > 1, and after the gfa block', () => {
        expect(buildZpl(GFA, {copies: 1})).toBe(`^XA${GFA}^XZ`);
        expect(buildZpl(GFA, {copies: 3})).toBe(`^XA${GFA}^PQ3^XZ`);
    });

    it('clamps negative fieldOrigin to 0', () => {
        expect(buildZpl(GFA, {fieldOrigin: {x: -5, y: -1}})).toBe(`^XA^FO0,0${GFA}^XZ`);
    });

    it('places prelude after ^XA and postlude before ^XZ', () => {
        const out = buildZpl(GFA, {prelude: '^PW800^LL400', postlude: '^XB'});
        expect(out).toBe(`^XA^PW800^LL400${GFA}^XB^XZ`);
    });

    it('emits one ^XA...^XZ block per gfa when given an array', () => {
        const out = buildZpl([GFA, GFA], {darkness: 15});
        expect(out).toBe(`^XA~SD15.0${GFA}^XZ\n^XA~SD15.0${GFA}^XZ`);
    });

    it('matches the legacy printableZPL output from metafloor/zpl-image consumers', () => {
        // Equivalent to: `^XA^PR${rate},A,A~SD${dark}.0${gf}^XZ`
        const out = buildZpl(GFA, {darkness: 18, printRate: 4});
        expect(out).toBe(`^XA^PR4,A,A~SD18.0${GFA}^XZ`);
    });
});
