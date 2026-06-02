import { describe, it, expect } from 'vitest';
import { findH1Collisions } from '../src/indexer/titleCollisions';

describe('findH1Collisions', () => {
    it('returns empty set for empty input', () => {
        expect(findH1Collisions([])).toEqual(new Set());
    });

    it('returns empty set when every H1 is unique', () => {
        const files = [
            { hasFrontmatterTitle: false, h1: 'A' },
            { hasFrontmatterTitle: false, h1: 'B' },
            { hasFrontmatterTitle: false, h1: 'C' },
        ];
        expect(findH1Collisions(files)).toEqual(new Set());
    });

    it('detects an H1 shared across 2+ files', () => {
        const files = [
            { hasFrontmatterTitle: false, h1: 'shared' },
            { hasFrontmatterTitle: false, h1: 'shared' },
            { hasFrontmatterTitle: false, h1: 'unique' },
        ];
        expect(findH1Collisions(files)).toEqual(new Set(['shared']));
    });

    it('still detects collision when one of N copies has frontmatter title', () => {
        // 3 files share H1 'shared', but one has frontmatter title — the
        // other two still collide and should fall back to basename.
        const files = [
            { hasFrontmatterTitle: true, h1: 'shared' },
            { hasFrontmatterTitle: false, h1: 'shared' },
            { hasFrontmatterTitle: false, h1: 'shared' },
        ];
        expect(findH1Collisions(files)).toEqual(new Set(['shared']));
    });

    it('does NOT flag collision when only 1 file participates after FM exclusion', () => {
        // 2 files have same H1 but one is overridden by frontmatter title →
        // only 1 file would use H1 → no collision.
        const files = [
            { hasFrontmatterTitle: true, h1: 'shared' },
            { hasFrontmatterTitle: false, h1: 'shared' },
        ];
        expect(findH1Collisions(files)).toEqual(new Set());
    });

    it('ignores files without an H1', () => {
        const files = [
            { hasFrontmatterTitle: false, h1: null },
            { hasFrontmatterTitle: false, h1: null },
            { hasFrontmatterTitle: false, h1: 'real' },
        ];
        expect(findH1Collisions(files)).toEqual(new Set());
    });

    it('detects multiple distinct colliding H1s', () => {
        const files = [
            { hasFrontmatterTitle: false, h1: 'A' },
            { hasFrontmatterTitle: false, h1: 'A' },
            { hasFrontmatterTitle: false, h1: 'B' },
            { hasFrontmatterTitle: false, h1: 'B' },
            { hasFrontmatterTitle: false, h1: 'B' },
            { hasFrontmatterTitle: false, h1: 'C' },
        ];
        expect(findH1Collisions(files)).toEqual(new Set(['A', 'B']));
    });
});
