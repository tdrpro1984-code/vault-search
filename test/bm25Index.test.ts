import { describe, it, expect } from 'vitest';
import {
    tokenizeForBM25,
    computeIdf,
    scoreBM25,
    buildBM25Index,
    searchBM25Index,
    type BM25Doc,
} from '../src/storage/bm25';

/** 兩路徑輸出正規化：依（分數 desc、id）排序，分數取到 1e-9。 */
function normalize(hits: { id: string; score: number }[]) {
    return hits
        .map(h => ({ id: h.id, score: Math.round(h.score * 1e9) / 1e9 }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function legacy(docs: BM25Doc[], query: string, limit: number) {
    const qt = tokenizeForBM25(query);
    return normalize(scoreBM25(qt, docs, computeIdf(qt, docs), limit));
}

function indexed(docs: BM25Doc[], query: string, limit: number) {
    const qt = tokenizeForBM25(query);
    return normalize(searchBM25Index(buildBM25Index(docs), qt, limit));
}

const mkDocs = (texts: [string, string][]): BM25Doc[] =>
    texts.map(([id, t]) => ({ id, tokens: tokenizeForBM25(t) }));

describe('BM25 inverted index — 與舊路徑等價（007 D9）', () => {
    it('中文語料：id 與分數全等', () => {
        const docs = mkDocs([
            ['a#0', '繁體中文全文搜尋引擎實戰筆記，選型與架構設計'],
            ['b#0', '今天聚會討論山莊音響設備提升，工程進度報告'],
            ['c#0', '登山裝備清單：帳篷、睡袋、爐頭與行動糧'],
            ['d#0', '搜尋引擎的排序品質評估，繁體中文分詞挑戰'],
            ['e#-1', '這篇描述提到搜尋與登山兩個主題'],
        ]);
        for (const q of ['繁體中文 搜尋', '登山', '音響設備', '排序品質']) {
            expect(indexed(docs, q, 10)).toEqual(legacy(docs, q, 10));
        }
    });

    it('英文與混合語料：等價', () => {
        const docs = mkDocs([
            ['x#0', 'obsidian plugin semantic search with BM25 ranking'],
            ['y#0', 'semantic embeddings for Chinese 語意 檢索'],
            ['z#0', 'BM25 scoring uses idf and term frequency'],
        ]);
        for (const q of ['semantic search', 'BM25 idf', '語意']) {
            expect(indexed(docs, q, 10)).toEqual(legacy(docs, q, 10));
        }
    });

    it('重複 query token（中文疊字）等價——稽核 C1 回歸', () => {
        const docs = mkDocs([
            ['a#0', '貓咪 玩具 貓咪 睡覺'],
            ['b#0', '狗狗 散步'],
            ['c#0', '今天大家都在哈哈哈哈笑個不停'],
        ]);
        // '哈哈哈哈' 經 trigram 化會產生重複 token；'貓咪 貓咪' 直接重複
        for (const q of ['貓咪 貓咪', '哈哈哈哈', '貓咪 貓咪 貓咪 狗狗']) {
            expect(indexed(docs, q, 10)).toEqual(legacy(docs, q, 10));
        }
    });

    it('limit 截斷行為等價', () => {
        const docs = mkDocs(
            Array.from({ length: 30 }, (_, i) => [`n${i}#0`, `共用詞彙 加上獨特內容${i}`] as [string, string]),
        );
        expect(indexed(docs, '共用詞彙', 5)).toEqual(legacy(docs, '共用詞彙', 5));
    });

    it('邊界：空 query / 空 docs / 無命中', () => {
        const docs = mkDocs([['a#0', '有內容的文件']]);
        expect(searchBM25Index(buildBM25Index(docs), [], 10)).toEqual([]);
        expect(searchBM25Index(buildBM25Index([]), tokenizeForBM25('查詢'), 10)).toEqual([]);
        expect(indexed(docs, '完全無關詞xyz', 10)).toEqual(legacy(docs, '完全無關詞xyz', 10));
    });

    it('tf 上限 65535 不 throw（防禦性）', () => {
        const huge = { id: 'h#0', tokens: Array(70000).fill('重複') };
        const idx = buildBM25Index([huge]);
        const hits = searchBM25Index(idx, ['重複'], 10);
        expect(hits).toHaveLength(1);
        expect(Number.isFinite(hits[0].score)).toBe(true);
    });
});
