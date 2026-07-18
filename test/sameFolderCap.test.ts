import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { SQLiteStore, type PersistAdapter } from '../src/storage/SQLiteStore';
import { findSimilarSqlite } from '../src/search/discoverSqlite';

const adapter: PersistAdapter = {
    read: async () => null,
    write: async () => { /* in-memory */ },
    exists: async () => false,
};

let store: SQLiteStore;

/** 造一個可控的小宇宙：query 與 cards 同資料夾且分數最高，dialogs 跨資料夾次之。 */
function unit(dim: number, hot: number, spread: number): Float32Array {
    // 與 query（e0 方向）的 cosine 由 hot 分量控制
    const v = new Float32Array(dim);
    v[0] = hot;
    v[1] = spread;
    const n = Math.hypot(hot, spread);
    v[0] /= n; v[1] /= n;
    return v;
}

beforeAll(async () => {
    const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
    store = await SQLiteStore.open(adapter, 'test.db', new Uint8Array(wasm));
    const mk = (path: string, cos: number) => {
        const vec = unit(4, cos, Math.sqrt(1 - cos * cos));
        store.upsertNote({
            path, mtime: 1, title: path, description: null, tier: 'hot',
            bodyVec: vec, bodyDim: 4, indexedAt: 1, descVec: null,
        });
    };
    mk('people/query.md', 1.0);
    // 同資料夾五張卡，分數最高
    mk('people/card1.md', 0.99);
    mk('people/card2.md', 0.98);
    mk('people/card3.md', 0.97);
    mk('people/card4.md', 0.96);
    mk('people/card5.md', 0.95);
    // 跨資料夾對話，分數次之
    mk('chats/dlg1.md', 0.90);
    mk('chats/dlg2.md', 0.89);
    mk('chats/dlg3.md', 0.88);
    mk('chats/dlg4.md', 0.87);
});

describe('findSimilarSqlite 同資料夾限額（008 D7）', () => {
    it('cap=3：同資料夾最多 3、遞補跨資料夾且分數序保持', () => {
        const r = findSimilarSqlite('people/query.md', store, { minScore: 0.5, topResults: 6, sameFolderCap: 3 });
        const sameFolder = r.filter(x => x.path.startsWith('people/')).length;
        expect(sameFolder).toBe(3);
        expect(r.map(x => x.path)).toEqual([
            'people/card1.md', 'people/card2.md', 'people/card3.md',
            'chats/dlg1.md', 'chats/dlg2.md', 'chats/dlg3.md',
        ]);
        // 分數單調遞減（不改分數只改組成）
        for (let i = 1; i < r.length; i++) expect(r[i].score).toBeLessThanOrEqual(r[i - 1].score);
    });

    it('cap=0 / 未給：現狀不變（純分數序）', () => {
        for (const settings of [{ minScore: 0.5, topResults: 6, sameFolderCap: 0 }, { minScore: 0.5, topResults: 6 }]) {
            const r = findSimilarSqlite('people/query.md', store, settings);
            expect(r.map(x => x.path).slice(0, 5)).toEqual([
                'people/card1.md', 'people/card2.md', 'people/card3.md', 'people/card4.md', 'people/card5.md',
            ]);
        }
    });

    it('跨資料夾 query 不受限額影響', () => {
        const r = findSimilarSqlite('chats/dlg1.md', store, { minScore: 0.5, topResults: 8, sameFolderCap: 3 });
        // chats/ 只有 3 篇其他對話，未達限額——結果與無限額相同
        const noCap = findSimilarSqlite('chats/dlg1.md', store, { minScore: 0.5, topResults: 8 });
        expect(r.map(x => x.path)).toEqual(noCap.map(x => x.path));
    });

    it('root 目錄筆記（folder=""）限額同樣適用不 throw', () => {
        const vec = new Float32Array([0.7, 0.71, 0, 0]);
        store.upsertNote({ path: 'rootnote.md', mtime: 1, title: 'r', description: null, tier: 'hot', bodyVec: vec, bodyDim: 4, indexedAt: 1, descVec: null });
        expect(() => findSimilarSqlite('rootnote.md', store, { minScore: 0.1, topResults: 5, sameFolderCap: 3 })).not.toThrow();
    });
});
