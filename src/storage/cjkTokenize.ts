/**
 * CJK trigram tokenizer for FTS5 indexing.
 *
 * FTS5's built-in `unicode61` tokenizer treats whole CJK strings as a single token
 * (no word boundaries between Chinese characters), making BM25 search useless for
 * Chinese vaults. This module pre-tokenizes content into trigrams so that FTS5 can
 * index meaningful sub-strings.
 *
 * Strategy:
 *   - CJK character runs: emit overlapping trigrams (sliding window of 3, step 1).
 *     A run of length 1 or 2 emits a single token of that length.
 *   - ASCII alphanumeric runs: emit lowercased word as-is (preserves "GPT-4" intact).
 *   - Everything else (whitespace, punctuation, symbols): break the run, no token.
 *
 * Apply to both content (write to chunks_fts.content) and queries (before MATCH).
 */
const CJK_RE = /[㐀-鿿豈-﫿]/;
const ASCII_WORD_RE = /[a-zA-Z0-9_-]/;

function isCJK(ch: string): boolean {
    return CJK_RE.test(ch);
}

function isAsciiWord(ch: string): boolean {
    return ASCII_WORD_RE.test(ch);
}

export function tokenizeCJK(text: string): string {
    if (!text) return '';
    const tokens: string[] = [];
    const n = text.length;
    let i = 0;
    while (i < n) {
        const ch = text[i];
        if (isCJK(ch)) {
            let end = i;
            while (end < n && isCJK(text[end])) end++;
            const run = text.slice(i, end);
            if (run.length <= 3) {
                tokens.push(run);
            } else {
                for (let s = 0; s <= run.length - 3; s++) {
                    tokens.push(run.slice(s, s + 3));
                }
            }
            i = end;
        } else if (isAsciiWord(ch)) {
            let end = i;
            while (end < n && isAsciiWord(text[end])) end++;
            tokens.push(text.slice(i, end).toLowerCase());
            i = end;
        } else {
            i++;
        }
    }
    return tokens.join(' ');
}
