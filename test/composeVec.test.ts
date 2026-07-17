import { describe, it, expect } from 'vitest';
import { composeNoteVec } from '../src/utils/composeVec';

const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe('composeNoteVec (007 D4/D5)', () => {
    const body = new Float32Array([0.5, 0.5, 0, 0]); // 範數 <1，模擬 mean-pool
    const desc = new Float32Array([0, 0, 1, 0]);     // 單位向量，模擬 provider 輸出

    it('合成分支輸出單位範數', () => {
        expect(norm(composeNoteVec(body, desc, 0.5))).toBeCloseTo(1, 5);
    });

    it('fallback 分支（無 desc）也輸出單位範數，方向與 bodyVec 一致', () => {
        const v = composeNoteVec(body, null, 0.5);
        expect(norm(v)).toBeCloseTo(1, 5);
        const cos = (v[0] * body[0] + v[1] * body[1]) / norm(body);
        expect(cos).toBeCloseTo(1, 5);
    });

    it('alpha=0 與 fallback 等價（逐元素）', () => {
        const a0 = composeNoteVec(body, desc, 0);
        const fb = composeNoteVec(body, null, 0.7);
        for (let i = 0; i < a0.length; i++) expect(a0[i]).toBeCloseTo(fb[i], 6);
    });

    it('alpha=1 純 desc 方向', () => {
        const v = composeNoteVec(body, desc, 1);
        expect(v[2]).toBeCloseTo(1, 5);
        expect(Math.abs(v[0])).toBeLessThan(1e-5);
    });

    it('alpha 單調：越大越靠近 desc', () => {
        const cosDesc = (v: Float32Array) => v[2]; // desc 是 e3 方向
        const c3 = cosDesc(composeNoteVec(body, desc, 0.3));
        const c5 = cosDesc(composeNoteVec(body, desc, 0.5));
        const c7 = cosDesc(composeNoteVec(body, desc, 0.7));
        expect(c3).toBeLessThan(c5);
        expect(c5).toBeLessThan(c7);
    });

    it('維度不符的 desc 防禦性 fallback（provider 切換殘留）', () => {
        const bad = new Float32Array([1, 0]);
        const v = composeNoteVec(body, bad, 0.5);
        expect(norm(v)).toBeCloseTo(1, 5);
        const cos = (v[0] * body[0] + v[1] * body[1]) / norm(body);
        expect(cos).toBeCloseTo(1, 5);
    });

    it('零向量 body + 無 desc 不 throw、不產生 NaN', () => {
        const z = composeNoteVec(new Float32Array([0, 0]), null, 0.5);
        expect(Number.isNaN(z[0])).toBe(false);
    });

    it('NaN / Infinity alpha（data.json 竄改）→ fallback 純 body，零 NaN 外洩（紅隊 C1 回歸）', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            const v = composeNoteVec(body, desc, bad as number);
            expect(v.every(x => Number.isFinite(x))).toBe(true);
        }
        const nanCase = composeNoteVec(body, desc, NaN);
        const fb = composeNoteVec(body, null, 0.5);
        for (let i = 0; i < fb.length; i++) expect(nanCase[i]).toBeCloseTo(fb[i], 6);
    });
});
