import { describe, it, expect } from 'vitest';
import { rrfFuse, topNFused } from '../src/search/rrfFuse';

describe('rrfFuse', () => {
    it('ranks shared documents higher than retriever-unique ones', () => {
        const a = new Map([['x', 1.0], ['y', 0.5], ['z', 0.2]]);
        const b = new Map([['x', 5.0], ['w', 4.0], ['y', 3.0]]);
        const fused = rrfFuse([a, b], [1, 1]);
        // x is rank 0 in both → highest fused score
        const sorted = Array.from(fused.entries()).sort((a, b) => b[1] - a[1]);
        expect(sorted[0][0]).toBe('x');
        expect(sorted[1][0]).toBe('y'); // present in both
        // w only in b at rank 1, z only in a at rank 2 → w outranks z
        const idxW = sorted.findIndex(([id]) => id === 'w');
        const idxZ = sorted.findIndex(([id]) => id === 'z');
        expect(idxW).toBeLessThan(idxZ);
    });

    it('weight 0 means retriever is ignored', () => {
        const a = new Map([['only-in-a', 99]]);
        const b = new Map([['only-in-b', 1]]);
        const fused = rrfFuse([a, b], [0, 1]);
        expect(fused.has('only-in-a')).toBe(false);
        expect(fused.get('only-in-b')).toBeGreaterThan(0);
    });

    it('higher weight amplifies that retriever rank contribution', () => {
        const a = new Map([['x', 1]]);
        const b = new Map([['y', 1]]);
        const fusedEqual = rrfFuse([a, b], [1, 1]);
        const fusedAHeavy = rrfFuse([a, b], [2, 1]);
        expect(fusedAHeavy.get('x')! / fusedAHeavy.get('y')!).toBeGreaterThan(
            fusedEqual.get('x')! / fusedEqual.get('y')!,
        );
    });

    it('uses standard k=60 by default', () => {
        const r = new Map([['x', 1]]);
        const fused = rrfFuse([r], [1]);
        // x at rank 0 → score = 1 / (60 + 0 + 1) = 1/61
        expect(fused.get('x')).toBeCloseTo(1 / 61, 6);
    });

    it('honours custom k', () => {
        const r = new Map([['x', 1]]);
        const fused = rrfFuse([r], [1], 10);
        expect(fused.get('x')).toBeCloseTo(1 / 11, 6);
    });

    it('throws on length mismatch', () => {
        expect(() => rrfFuse([new Map(), new Map()], [1])).toThrow(/length/i);
    });

    it('returns empty fused map when all inputs empty', () => {
        const fused = rrfFuse([new Map(), new Map()], [1, 1]);
        expect(fused.size).toBe(0);
    });
});

describe('topNFused', () => {
    it('returns descending-sorted top N', () => {
        const fused = new Map([['a', 0.1], ['b', 0.5], ['c', 0.3]]);
        const top2 = topNFused(fused, 2);
        expect(top2).toEqual([
            { docId: 'b', score: 0.5 },
            { docId: 'c', score: 0.3 },
        ]);
    });

    it('returns all when N exceeds size', () => {
        const fused = new Map([['a', 0.1]]);
        expect(topNFused(fused, 10)).toHaveLength(1);
    });
});
