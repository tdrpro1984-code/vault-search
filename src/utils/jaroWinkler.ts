/**
 * Jaro-Winkler distance for fuzzy title matching.
 *
 * Design rationale: see openspec/changes/004-vault-curate-rebrand/design.md D6.
 *
 * Used as the third retriever in hybrid search. Targets the "I remember
 * roughly what the note was called" scenario — handles typos, partial
 * recall, and CJK code-unit prefix matching well enough for tie-breaking.
 *
 * Implementation note: we operate on UTF-16 code units (JS string indexing).
 * For BMP CJK characters this is fine — they're a single code unit each.
 */

/** Classic Jaro distance ∈ [0, 1]; 1 = identical. */
export function jaro(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const aMatches = new Array<boolean>(a.length).fill(false);
    const bMatches = new Array<boolean>(b.length).fill(false);

    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(b.length - 1, i + matchWindow);
        for (let j = start; j <= end; j++) {
            if (bMatches[j]) continue;
            if (a[i] !== b[j]) continue;
            aMatches[i] = true;
            bMatches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    // Transpositions
    let k = 0;
    let transpositions = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aMatches[i]) continue;
        while (!bMatches[k]) k++;
        if (a[i] !== b[k]) transpositions++;
        k++;
    }
    transpositions = transpositions / 2;

    return (
        matches / a.length +
        matches / b.length +
        (matches - transpositions) / matches
    ) / 3;
}

/**
 * Jaro-Winkler: rewards matching prefixes (up to 4 chars) by adding
 *     prefix * scaling * (1 - jaro)
 * where scaling = 0.1 (Winkler's standard value).
 */
export function jaroWinkler(a: string, b: string): number {
    const j = jaro(a, b);
    if (j === 0) return 0;

    let prefix = 0;
    const max = Math.min(4, Math.min(a.length, b.length));
    for (let i = 0; i < max; i++) {
        if (a[i] === b[i]) prefix++;
        else break;
    }
    return j + prefix * 0.1 * (1 - j);
}

/**
 * Score every note title against the query, return paths whose
 * similarity ≥ minScore (default 0.7 per design.md D6), sorted descending.
 *
 * Both query and title are lower-cased before comparison so ASCII case
 * doesn't penalise matches; CJK characters are unaffected.
 */
export function fuzzyTitleSearch(
    query: string,
    titles: Map<string, string>,
    top: number = 50,
    minScore: number = 0.7,
): Map<string, number> {
    const q = query.toLowerCase().trim();
    const out: Array<[string, number]> = [];
    for (const [path, title] of titles) {
        if (!title) continue;
        const score = jaroWinkler(q, title.toLowerCase());
        if (score >= minScore) out.push([path, score]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return new Map(out.slice(0, top));
}
