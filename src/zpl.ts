/**
 * Tiny, dependency-free ZPL II label builder.
 *
 * Wraps one or more `^GFA` blocks (produced by `rgbaToZ64` / `rgbaToACS`
 * via their `gfa` field, or by `imageToZ64` / `imageToACS`) in a complete
 * `^XA ... ^XZ` payload with the most common printer-control directives:
 *
 *   `~SD` (set darkness), `^PR` (print rate), `^PQ` (quantity / copies),
 *   `^FO` (field origin) and arbitrary pre/postlude ZPL for advanced use.
 *
 * The point of this module is so that **callers can stay completely
 * ignorant of ZPL syntax** -- pass an image in, get bytes ready to write
 * to TCP port 9100 out. No knowledge of `^XA`, `^GFA`, darkness scale,
 * or print-rate units required.
 */

/**
 * Options that decorate the generated ZPL with printer-control commands.
 * Every field is optional -- omit to defer to the printer's stored
 * defaults (configured from the LCD panel or via ZPL stored elsewhere).
 */
export interface ZplLabelOptions {
    /**
     * Media darkness, ZPL `~SD` command. Range `0.0`..`30.0` (in tenths;
     * one decimal of precision). Values outside the range are clamped.
     * Typical thermal-transfer setting is `10`..`20`.
     *
     * Omit to leave the printer at its stored darkness.
     */
    darkness?: number;

    /**
     * Print rate, ZPL `^PR` command. Inches/second on most Zebra
     * desktop and tabletop printers; integer `1`..`14`. Values outside
     * the range are clamped. Print, slew and backfeed rates are all
     * set to the same value (mirroring the existing print-server
     * conventions in metafloor/zpl-image-based stacks).
     *
     * Omit to leave the printer at its stored print rate.
     */
    printRate?: number;

    /**
     * Number of copies of the label, ZPL `^PQ` command. Positive
     * integer; values `< 1` are coerced to `1`. Omit (or pass `1`) to
     * print a single copy and skip emitting `^PQ` entirely.
     */
    copies?: number;

    /**
     * Field origin in dots, ZPL `^FO` command, emitted directly before
     * the `^GFA` block. Useful for offsetting the graphic from the
     * top-left of the label. Negative values are clamped to `0`.
     *
     * Omit to print the graphic at `(0, 0)` without emitting `^FO`.
     */
    fieldOrigin?: {x: number; y: number};

    /**
     * Raw ZPL inserted **immediately after `^XA`** and before any of
     * the directives above. Use to set label dimensions (`^PW`,
     * `^LL`), print mode (`^MM`), media tracking (`^MN`), etc. The
     * string is concatenated verbatim -- caller is responsible for
     * correctness.
     */
    prelude?: string;

    /**
     * Raw ZPL inserted **immediately before `^XZ`** (after the `^GFA`
     * block and any `^PQ`). Use for end-of-label directives such as
     * `^XB` (suppress backfeed) that some workflows need.
     */
    postlude?: string;
}

/**
 * Build a complete ZPL payload from one or more `^GFA` graphic blocks.
 *
 * - Pass a single `gfa` string to produce a single `^XA...^XZ` label.
 * - Pass an array (e.g. one entry per page rasterised from a PDF) to
 *   produce one `^XA...^XZ` block per entry, joined with `\n`. The
 *   same options apply to every label in the batch.
 *
 * The returned string is byte-for-byte ready to write to TCP port
 * 9100, USB, or whichever transport your printer speaks.
 *
 * @example
 * const res = await rgbaToZ64(rgba, width);
 * const zpl = buildZpl(res.gfa, {darkness: 15, printRate: 4});
 * // -> '^XA^PR4,A,A~SD15.0^GFA,...^XZ'
 */
export function buildZpl(gfa: string | readonly string[], opts: ZplLabelOptions = {}): string {
    const blocks = typeof gfa === 'string' ? [gfa] : gfa;
    return blocks.map((g) => buildSingleLabel(g, opts)).join('\n');
}

function buildSingleLabel(gfa: string, opts: ZplLabelOptions): string {
    const parts: string[] = ['^XA'];

    if (opts.prelude) parts.push(opts.prelude);

    if (opts.printRate !== undefined) {
        const rate = clampInt(opts.printRate, 1, 14);
        // ^PR<print>,<slew>,<backfeed> -- mirror all three to the same
        // rate, which is the safe default the upstream print server uses.
        parts.push(`^PR${rate},A,A`);
    }

    if (opts.darkness !== undefined) {
        const dark = clampFloat(opts.darkness, 0, 30);
        // ~SD accepts one decimal of precision.
        parts.push(`~SD${dark.toFixed(1)}`);
    }

    if (opts.fieldOrigin) {
        const x = Math.max(0, Math.trunc(opts.fieldOrigin.x));
        const y = Math.max(0, Math.trunc(opts.fieldOrigin.y));
        parts.push(`^FO${x},${y}`);
    }

    parts.push(gfa);

    if (opts.copies !== undefined && opts.copies > 1) {
        parts.push(`^PQ${Math.trunc(opts.copies)}`);
    }

    if (opts.postlude) parts.push(opts.postlude);

    parts.push('^XZ');
    return parts.join('');
}

function clampInt(value: number, min: number, max: number): number {
    return Math.min(Math.max(Math.trunc(value), min), max);
}

function clampFloat(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
