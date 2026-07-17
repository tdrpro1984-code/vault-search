/**
 * denoise — strip non-semantic markdown structure symbols from embed input.
 *
 * Design rationale: openspec/changes/007-embed-denoise-desc-weight/design.md
 * D1 (injection point) + D3 (rule set). Template-heavy notes (person cards)
 * share table borders / rhythm bars across files, which dominates note-level
 * cosine and crowds Find Similar top-N with sibling cards. Stripping the
 * symbols lowers card-card similarity AND raises the signal/noise of the
 * remaining semantic content (2026-07-17 pilot: ranking flipped).
 *
 * ONLY the embedding input goes through `denoiseForEmbed`; `chunks.content`
 * keeps the raw text so BM25 and snippets are unaffected. User queries are
 * NOT denoised (no markdown structure in queries; stripping could hurt).
 *
 * DENOISE_VERSION is bound to the rule set below — any rule change MUST bump
 * it. The one-time upgrade scan in `Indexer.update()` keys off this value to
 * decide which notes need a re-embed.
 *
 * Rule set v1 = R1-R4. Measured on the dogfood vault (2,540 notes,
 * 2026-07-17): union trigger 16% of notes, 88/88 person cards covered.
 * Deliberately excluded because their trigger rate degenerates the upgrade
 * scan into a near-full rebuild for negligible embedding benefit:
 * hr-only lines (76% of notes), heading `#` prefixes (37%), code fence
 * markers (1%, fenced content is semantic and kept regardless).
 *
 * Regexes are built via the RegExp constructor with escape strings so this
 * source file stays plain ASCII (some editing tools decode raw unicode
 * escapes inside regex literals, which corrupted earlier files — see
 * description-generator.ts for the same pattern).
 */

export const DENOISE_VERSION = "1";

// R1: table divider row (|---|:---:|) — the whole line has no semantic chars.
const TABLE_DIVIDER = new RegExp("^\\s*\\|[\\s\\-:|]+\\|\\s*$");
// R2: table pipe -> space (cell words survive).
const PIPE_G = new RegExp("\\|", "g");
// R3: Box Drawing U+2500-257F + Block Elements U+2580-259F runs -> one space.
const BLOCK_RUN_G = new RegExp("[\\u2500-\\u257F\\u2580-\\u259F]+", "g");
// R4: middle-dot (U+00B7) runs of >= 2 (rhythm bars like `···`). A single
// U+00B7 is a CJK name separator and MUST survive — two-sided boundary case.
const DOT_RUN_G = new RegExp("\\u00B7{2,}", "g");

const MULTI_SPACE_G = new RegExp("[ \\t]{2,}", "g");

// Detection twins of R1-R4 (no `g` flag: `.test()` on a /g regex is stateful
// via lastIndex and would return alternating results).
const HAS_PIPE = new RegExp("\\|");
const HAS_BLOCK = new RegExp("[\\u2500-\\u257F\\u2580-\\u259F]");
const HAS_DOT_RUN = new RegExp("\\u00B7{2,}");

/**
 * True when the text contains anything R1-R4 would rewrite.
 *
 * This is the upgrade-scan skip predicate (design D2). It deliberately
 * ignores whitespace: `denoiseForEmbed(text) !== text` would be true for
 * nearly every note because of whitespace folding, degenerating the
 * incremental scan into a full re-embed. HAS_PIPE also covers R1 (divider
 * rows always contain pipes).
 */
export function hasDenoisableContent(text: string): boolean {
    return HAS_PIPE.test(text) || HAS_BLOCK.test(text) || HAS_DOT_RUN.test(text);
}

/**
 * Strip R1-R4 structure symbols and fold the leftover whitespace.
 *
 * Contract:
 *   - Line-based: the chunker's title prefix line passes through unchanged
 *     (unless the title itself contains rule symbols).
 *   - Never throws on empty input; empty in -> empty out.
 *   - Content words are never removed — only symbols and whitespace.
 */
export function denoiseForEmbed(text: string): string {
    const out: string[] = [];
    for (const line of text.split("\n")) {
        if (TABLE_DIVIDER.test(line)) continue;
        const cleaned = line
            .replace(PIPE_G, " ")
            .replace(BLOCK_RUN_G, " ")
            .replace(DOT_RUN_G, " ")
            .replace(MULTI_SPACE_G, " ")
            .trim();
        // Fold blank-line runs: keep at most one empty line between content.
        if (cleaned.length === 0) {
            if (out.length === 0 || out[out.length - 1] === "") continue;
            out.push("");
            continue;
        }
        out.push(cleaned);
    }
    // Drop a trailing blank left by the folding loop.
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    return out.join("\n");
}
