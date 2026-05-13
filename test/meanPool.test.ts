import { describe, it, expect } from 'vitest';
import { meanPool } from '../src/utils/meanPool';

describe('meanPool', () => {
    it('averages elementwise across vectors', () => {
        const a = new Float32Array([1, 2, 3]);
        const b = new Float32Array([3, 4, 5]);
        const c = new Float32Array([5, 6, 7]);
        const out = meanPool([a, b, c]);
        expect(Array.from(out)).toEqual([3, 4, 5]);
    });

    it('returns the same vector when given a single input', () => {
        const a = new Float32Array([0.1, 0.2, 0.3]);
        const out = meanPool([a]);
        expect(Array.from(out)).toEqual(Array.from(a));
    });

    it('preserves dimension', () => {
        const a = new Float32Array(768);
        const b = new Float32Array(768);
        a[5] = 2;
        b[5] = 4;
        const out = meanPool([a, b]);
        expect(out.length).toBe(768);
        expect(out[5]).toBeCloseTo(3, 6);
    });

    it('throws on empty input', () => {
        expect(() => meanPool([])).toThrow(/empty input/i);
    });

    it('throws on zero-dimensional vectors', () => {
        expect(() => meanPool([new Float32Array(0)])).toThrow(/zero-dimensional/i);
    });

    it('throws on dimension mismatch', () => {
        const a = new Float32Array([1, 2, 3]);
        const b = new Float32Array([1, 2]);
        expect(() => meanPool([a, b])).toThrow(/dimension mismatch/i);
    });
});
