import { describe, it, expect } from 'vitest';
import { t2sForEmbed, hasCJK, T2S_VERSION } from '../src/indexer/preproc';
import { denoiseForEmbed } from '../src/indexer/denoise';

describe('t2sForEmbed（008 D2）', () => {
    it('常用字對照：體→体、網→网、後→后、學→学', () => {
        expect(t2sForEmbed('記憶體')).toBe('记忆体');
        expect(t2sForEmbed('網路')).toBe('网路');
        expect(t2sForEmbed('之後')).toBe('之后');
        expect(t2sForEmbed('機器學習')).toBe('机器学习');
    });

    it('一對多取首：乾→干、儘→尽（對齊 t2s-ambiguous.txt）', () => {
        expect(t2sForEmbed('乾')).toBe('干');
        expect(t2sForEmbed('儘')).toBe('尽');
    });

    it('非 CJK 原樣通過（英文/數字/符號/emoji）', () => {
        const s = 'Hello BM25 v1.2.2 — 100% 🎉 [table]|bar';
        expect(t2sForEmbed(s)).toBe(s);
    });

    it('簡體輸入不變（已在目標空間）', () => {
        expect(t2sForEmbed('机器学习与内存管理')).toBe('机器学习与内存管理');
    });

    it('混合文本只轉漢字', () => {
        expect(t2sForEmbed('用 Obsidian 管理筆記')).toBe('用 Obsidian 管理笔记');
    });

    it('空字串 → 空字串', () => {
        expect(t2sForEmbed('')).toBe('');
    });

    it('surrogate pair（emoji）不被拆壞', () => {
        const s = '登山🏔️紀錄';
        const out = t2sForEmbed(s);
        expect(out).toContain('🏔️');
        expect(out).toContain('纪录');
    });
});

describe('hasCJK（008 D4 掃描判準）', () => {
    it('含漢字 → true（繁簡皆然）', () => {
        expect(hasCJK('筆記')).toBe(true);
        expect(hasCJK('笔记')).toBe(true);
        expect(hasCJK('English with 中 one char')).toBe(true);
    });

    it('純英文/數字/符號 → false', () => {
        expect(hasCJK('English only note 123 |---| █▃▅')).toBe(false);
        expect(hasCJK('')).toBe(false);
    });

    it('日文假名不觸發（非漢字）', () => {
        expect(hasCJK('ひらがな カタカナ')).toBe(false);
    });
});

describe('與 denoise 組合順序不變性（D6，fixture = 合成卡 + 符號×術語混合）', () => {
    const fixtures = [
        '# 林曉芙 人物卡\n| 項目 | 數值 |\n|---|---|\n| 訊息總數 | 4,213 |\n一月 ···█▃▅▁·▂▃\n曉芙是研究所同學，現在在竹科做韌體。',
        '| 記憶體用量 | 8GB |\n|---|---|\n網路延遲 ···█▃▅ 軟體版本',
    ];
    it('denoise(t2s(x)) === t2s(denoise(x))', () => {
        for (const f of fixtures) {
            expect(denoiseForEmbed(t2sForEmbed(f))).toBe(t2sForEmbed(denoiseForEmbed(f)));
        }
    });
});

describe('T2S_VERSION', () => {
    it('版本常數存在', () => {
        expect(T2S_VERSION).toBe('1');
    });
});
