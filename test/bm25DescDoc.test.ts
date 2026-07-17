import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { SQLiteStore, type PersistAdapter } from '../src/storage/SQLiteStore';

const adapter: PersistAdapter = {
    read: async () => null,
    write: async () => { /* in-memory test store */ },
    exists: async () => false,
};

let store: SQLiteStore;

beforeAll(async () => {
    const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
    store = await SQLiteStore.open(adapter, 'test.db', new Uint8Array(wasm));
});

describe('BM25 description 虛擬 doc (007 D7)', () => {
    it('desc 含罕見詞（chunks 不含）→ BM25 可檢出、chunkIndex 解析為 -1', () => {
        const vec = new Float32Array([1, 0]);
        store.upsertNote({
            path: 'note-a.md',
            mtime: 1,
            title: '筆記A',
            description: '這篇筆記討論青蛙撞奶的製作方式',
            tier: 'hot',
            bodyVec: vec,
            bodyDim: 2,
            indexedAt: 1,
            descVec: null,
        });
        store.upsertChunks('note-a.md', [
            { notePath: 'note-a.md', chunkIndex: 0, content: '筆記A\n完全不相關的內文，講登山裝備', vec },
        ]);

        const hits = store.searchBM25('青蛙撞奶', 10);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].notePath).toBe('note-a.md');
        expect(hits[0].chunkIndex).toBe(-1);
        expect(Number.isNaN(hits[0].chunkIndex)).toBe(false);
    });

    it('chunk 命中仍正常（虛擬 doc 不排擠既有路徑）', () => {
        const hits = store.searchBM25('登山裝備', 10);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].notePath).toBe('note-a.md');
        expect(hits[0].chunkIndex).toBe(0);
    });

    it('無 description 的 note 不產生虛擬 doc（不 throw）', () => {
        const vec = new Float32Array([0, 1]);
        store.upsertNote({
            path: 'note-b.md', mtime: 1, title: '筆記B', description: null,
            tier: 'cold', bodyVec: vec, bodyDim: 2, indexedAt: 1, descVec: null,
        });
        store.upsertChunks('note-b.md', [
            { notePath: 'note-b.md', chunkIndex: 0, content: '筆記B\n露營帳篷選購', vec },
        ]);
        expect(() => store.searchBM25('露營帳篷', 10)).not.toThrow();
    });
});
