/**
 * Pure helper for H1 collision detection used by Indexer.extractTitle.
 *
 * An H1 "collides" when 2+ files (without a frontmatter `title:`) share the
 * exact same first H1 heading text. Template-generated notes are the typical
 * case — e.g. a clinical / journal / log template whose first heading is the
 * same literal string across N notes. Listing all of them as that same H1
 * makes them indistinguishable in result lists, so the Indexer falls back to
 * `file.basename` for collision-positive H1s.
 *
 * Files with an explicit frontmatter `title:` never participate (user intent
 * wins) and are skipped from the count.
 */

export type FileTitleSource = {
    /** True if the file has a frontmatter `title:` value (any non-null). */
    hasFrontmatterTitle: boolean;
    /** First H1 heading text, already trimmed. null/empty if no H1. */
    h1: string | null;
};

export function findH1Collisions(files: FileTitleSource[]): Set<string> {
    const counts = new Map<string, number>();
    for (const f of files) {
        if (f.hasFrontmatterTitle) continue;
        if (!f.h1) continue;
        counts.set(f.h1, (counts.get(f.h1) ?? 0) + 1);
    }
    const collisions = new Set<string>();
    for (const [h1, n] of counts) {
        if (n > 1) collisions.add(h1);
    }
    return collisions;
}
