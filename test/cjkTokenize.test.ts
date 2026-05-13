import { describe, it, expect } from 'vitest';
import { tokenizeCJK } from '../src/storage/cjkTokenize';

describe('tokenizeCJK', () => {
    it('produces empty string for empty input', () => {
        expect(tokenizeCJK('')).toBe('');
    });

    it('lowercases pure ASCII words and preserves them', () => {
        expect(tokenizeCJK('Hello World')).toBe('hello world');
    });

    it('emits CJK trigrams sliding by one char', () => {
        // 主公在 → trigram '主公在'
        // 公在很 → trigram '公在很'
        // 等等。最後不足三字的尾巴：tail = '很好' → still emit one bigram-ish trigram '在很好' from offset 2
        const out = tokenizeCJK('主公在很好');
        // expected trigrams from each start position: 主公在, 公在很, 在很好
        expect(out).toBe('主公在 公在很 在很好');
    });

    it('mixes CJK trigrams + ASCII words correctly', () => {
        const out = tokenizeCJK('使用 Obsidian 寫筆記');
        // 使用 -> trigram '使用 ' or just '使用'? The CJK runs end at space.
        // Expectation per design: split CJK into trigrams within a CJK run; keep ASCII words intact.
        // '使用' is a 2-char CJK run -> emit single '使用' (no full trigram possible)
        // '寫筆記' is 3-char run -> '寫筆記'
        expect(out).toBe('使用 obsidian 寫筆記');
    });

    it('handles ASCII digits and dashes inside words', () => {
        expect(tokenizeCJK('GPT-4 model')).toBe('gpt-4 model');
    });

    it('skips punctuation but does not break trigram window', () => {
        // 中文 punctuation 中斷 CJK run，trigram only within each run
        const out = tokenizeCJK('主公，你好嗎？');
        // run1 = '主公' (2 chars) -> '主公'
        // run2 = '你好嗎' (3 chars) -> '你好嗎'
        expect(out).toBe('主公 你好嗎');
    });

    it('handles 4+ char CJK run with sliding trigrams', () => {
        // '一二三四' -> 一二三, 二三四
        expect(tokenizeCJK('一二三四')).toBe('一二三 二三四');
    });

    it('produces deterministic output (same input → same output)', () => {
        const input = '主公的 vault 有 LLM 筆記';
        expect(tokenizeCJK(input)).toBe(tokenizeCJK(input));
    });
});
