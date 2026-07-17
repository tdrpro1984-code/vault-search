import { describe, it, expect } from 'vitest';
import { l2normalize } from '../src/utils/l2normalize';

const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe('l2normalize', () => {
    it('輸出單位範數（|v| = 1 ± 1e-5）', () => {
        const v = l2normalize(new Float32Array([3, 4]));
        expect(norm(v)).toBeCloseTo(1, 5);
        expect(v[0]).toBeCloseTo(0.6, 5);
        expect(v[1]).toBeCloseTo(0.8, 5);
    });

    it('範數 <1 的 mean-pool 向量被放大到單位（bug 修復場景）', () => {
        // 模擬兩個單位向量的 mean：範數 < 1
        const pooled = new Float32Array([0.5, 0.5, 0, 0]);
        expect(norm(pooled)).toBeLessThan(1);
        expect(norm(l2normalize(pooled))).toBeCloseTo(1, 5);
    });

    it('冪等：normalize 兩次 = 一次', () => {
        const once = l2normalize(new Float32Array([1, 2, 3]));
        const twice = l2normalize(once);
        for (let i = 0; i < once.length; i++) expect(twice[i]).toBeCloseTo(once[i], 6);
    });

    it('零向量原樣返回，不產生 NaN', () => {
        const z = l2normalize(new Float32Array([0, 0, 0]));
        expect(Array.from(z)).toEqual([0, 0, 0]);
    });

    it('方向不變（縮放不旋轉）', () => {
        const v = new Float32Array([2, -1, 0.5]);
        const n = l2normalize(v);
        const cos = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / norm(v);
        expect(cos).toBeCloseTo(1, 6);
    });
});
