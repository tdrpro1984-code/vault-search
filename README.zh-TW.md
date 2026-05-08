<div align="center">

# Vault Search

[![Release](https://img.shields.io/github/v/release/notoriouslab/vault-search?style=flat-square)](https://github.com/notoriouslab/vault-search/releases)
[![Downloads](https://img.shields.io/github/downloads/notoriouslab/vault-search/total?style=flat-square&color=573E7A)](https://github.com/notoriouslab/vault-search/releases)
[![License](https://img.shields.io/github/license/notoriouslab/vault-search?style=flat-square)](LICENSE)
[![Obsidian Desktop](https://img.shields.io/badge/Obsidian-Desktop-7C3AED?style=flat-square&logo=obsidian)](https://obsidian.md/)
[![Ollama 本地 AI](https://img.shields.io/badge/Ollama-本地AI-000?style=flat-square)](https://ollama.com/)
[![BRAT 可用](https://img.shields.io/badge/BRAT-可用-blue?style=flat-square)](https://github.com/TfTHacker/obsidian42-brat)
[![Last Commit](https://img.shields.io/github/last-commit/notoriouslab/vault-search)](https://github.com/notoriouslab/vault-search)

**Obsidian 本地語意搜尋與發掘 — 找到你想要的，重新發現你遺忘的。簡單、隱私、中文友善。**

[English](./README.md)

</div>

---

**語意搜尋。重新發現被遺忘的筆記。完全本地，真正隱私。**

不需要雲端服務、不需要 API Key、不需要付費訂閱。筆記不離開你的電腦。

![搜尋面板](./docs/search-panel.png)

## 核心定位

[Andrej Karpathy 分享了](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/)他用 LLM 維護知識庫的願景 — 讓 AI「編譯」你的筆記成結構化 wiki。很吸引人，但前提是你願意把編輯權完全交給 AI。

**Vault Search 的信念不同：** AI 應該幫你*看見*，而不是替你思考。最好的工具不會取代你的寫作，而是幫你**重新發現**你已知的，浮出你遺漏的連結。

### 為什麼 Vault Search 重要

| 功能 | 它解鎖了什麼 |
|------|-----------|
| **發掘，而非整理** | 找你*該去看*的筆記，不是強迫重組織。「發掘」分頁浮出語意相關的 Cold（孤立）筆記 — 你的盲區變得可見。 |
| **Hot/Cold 自動分層** | 每筆筆記根據連結和更新日期自動分類。Cold 筆記會和 Hot 活躍筆記一起浮出，把被遺忘的 vault 變成活的待辦清單。 |
| **MOC 一鍵生成** | 搜尋或發掘結果匯出成 Map of Content，帶 wikilink 和預覽。你設計結構；AI 蒐集素材。 |
| **完全本地 + 完全隱私** | Embedding、索引、搜尋、LLM 描述都在你的電腦跑。零雲端、零 API、零追蹤。 |
| **中文優先設計** | 用 `qwen3-embedding:0.6b` 和同義詞擴展。繁體中文 + 英文查詢開箱即用。 |
| **Obsidian 原生體驗** | 側邊欄分頁、Cmd/Ctrl+P 快速搜、右鍵選單整合、Canvas 拖放。結果是一級公民。 |
| **LLM 生成摘要** | 本地 LLM 為筆記產生 frontmatter 描述，Embedding 基於摘要而非原文。長筆記相關性大幅提升。 |
| **輕量級** | 8GB 筆電可用。推薦模型適合 MacBook M2。增量索引 + debounce 機制，日常幾乎無負擔。 |

---

## 快速開始

1. **安裝** — BRAT 或手動；見下方[安裝](#安裝與設定)
2. **Settings → Vault Search** — 選擇 embedding 模型（預設：`qwen3-embedding:0.6b`）
3. **按「重建」** — 建立完整索引
4. **Cmd/Ctrl+P → 「語意搜尋」** 或開啟**發掘**分頁

### 推薦工作流

最佳搜尋和發掘品質：

```
生成描述 → 重建索引 → 搜尋與發掘
（LLM 彙整摘要） （用摘要 embed） （找到並重新發現）
```

**快速設定：** 跳過描述，直接重建和搜尋。  
**最佳品質：** 生成描述（預覽）→ 檢查 → 套用 → 重建。

---

## 核心功能

### 搜尋面板（側邊欄）
- **語意搜尋** — 用模糊描述找筆記，不只是關鍵字
- **搜尋和發掘分頁** — 持續結果，邊讀邊看
- **Hot/Cold 標記** — 視覺區分有連結 vs 孤立筆記
- **Chunking 模式** — 可選：長文分段搜尋
- **相似度門檻** — 調整最低分數篩選結果（0–1）

### 發掘分頁
- **自動模式** — 打開筆記 → 側邊欄自動顯示相關筆記（Cold 筆記特別標示）
- **全域模式** — 找出與你整體 Hot 筆記最相關的 Cold 筆記
- **MOC 匯出** — 一鍵把結果變成 Map of Content，帶 wikilink 和預覽
- **Cold 搜尋** — 專用模式刻意探索孤立筆記

### 描述生成（LLM）
- **自動摘要** — 本地 LLM 為每筆筆記寫 frontmatter 描述
- **更好的 Embedding** — Embedding 模型用摘要而非原文
- **品質提升** — 特別明顯在長、多主題筆記
- **同義詞擴展** — 自訂同義詞提升搜尋召回率

### 快速搜尋（Cmd/Ctrl+P）
- **快速彈窗** — 鍵盤導航，快速跳轉
- **Canvas 拖放** — 拖拉結果到 Canvas 做視覺化
- **右鍵選單** — Obsidian 原生檔案操作（加書籤、重新命名等）

---

## 安裝與設定

### 需求

- [Obsidian](https://obsidian.md/) 桌面版
- [Ollama](https://ollama.com/) 執行中（或任何 OpenAI-compatible 伺服器）
- Embedding 模型 — `ollama pull qwen3-embedding:0.6b`（推薦）
- LLM（選填）— `ollama pull qwen3:1.7b` 用於描述生成

### 安裝外掛

**BRAT（推薦，最快）：**
1. 安裝 [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. 新增 repo：`notoriouslab/vault-search`
3. 在 Settings → Community plugins 啟用「Vault Search」

**手動：**
1. 從 [releases](https://github.com/notoriouslab/vault-search/releases) 下載 `main.js`、`manifest.json`、`styles.css`
2. 複製到 `.obsidian/plugins/vault-search/`
3. 在 Settings → Community plugins 啟用

> **提示：** vault 若用 Git，加入 `.obsidian/plugins/*/data.json` 到 `.gitignore`。

---

## 進階參考

### 設定

**搜尋與索引：**

| 設定 | 預設值 | 說明 |
|---|---|---|
| 伺服器網址 | `http://localhost:11434` | Ollama 或 OpenAI-compatible 伺服器 |
| API 格式 | Ollama | Ollama 或 OpenAI-compatible |
| API Key | — | 選填，用於需要認證的伺服器 |
| Embedding 模型 | `qwen3-embedding:0.6b` | 向量 embedding 模型 |
| 顯示筆數 | 10 | 搜尋和發掘結果上限 |
| 最低分數 | 0.5 | 相似度門檻（0–1），越低結果越多 |
| 最大 Embed 字數 | 2000 | 截取前 N 字；有 description 優先用 description |
| Hot 天數 | 90 | 近 N 天建立的筆記視為 Hot |
| 搜尋範圍 | 僅 Hot | Hot / 全部 / Cold |
| Chunking 模式 | 關閉 | 關閉 / 智慧 / 全部 |
| Chunk 大小 | 1000 | 每個 chunk 字數 |
| Chunk 重疊 | 200 | 相鄰 chunk 重疊字數 |
| 排除路徑 | `_templates/` `.trash/` `3_wiki/` | 略過的資料夾 |
| 同義詞 | — | 每行一組：`關鍵字 = 同義詞1, 同義詞2` |
| 自動索引 | 開啟 | 檔案修改時自動更新 |

**描述生成：**

| 設定 | 預設值 | 說明 |
|---|---|---|
| LLM 模型 | `qwen3:1.7b` | **推薦** — 速度快、品質好 |
| 最短字數 | 30 | 低於此字數重新生成 |

### 指令（Command Palette）

所有指令前綴 **Vault Search:**

| 指令 | 用途 |
|------|------|
| **語意搜尋（彈窗）** | 快速搜尋，鍵盤導航 |
| **開啟搜尋面板** | 側邊欄搜尋和發掘分頁 |
| **尋找相似筆記** | 目前筆記的相關筆記 |
| **發掘相關 Cold 筆記** | 全域發掘 — 找隱藏的好東西 |
| **重建索引** | 全部重新建立索引 |
| **更新索引** | 只處理新增或修改的筆記 |
| **生成描述（預覽）** | LLM 草稿，預覽報告 |
| **套用描述** | 寫入 frontmatter |

### 運作原理

```
筆記 (.md)
    ↓
Ollama Embed API  ← [同義詞擴展]
    ↓
向量索引 (index.json)
    ↓
    ├─ 搜尋查詢 → 餘弦相似度 → 排序結果
    ├─ 發掘 → 向量運算（無 API） → 浮出 Cold 筆記
    └─ Hot/Cold 自動分類（連結+最近日期）
```

**流程：**
1. **索引** — 筆記（或描述）→ embedding 模型 → 向量儲存
2. **搜尋** — 查詢 + 同義詞 → embedding → 餘弦相似度 → 結果
3. **發掘** — 純向量運算，不呼叫 API
4. **Hot/Cold** — 自動分類，發掘照亮你的盲區
5. **MOC** — 匯出為帶 wikilink 的筆記
6. **描述** — 本地 LLM → frontmatter → 更好的 embedding

### 模型推薦

| 模型 | 大小 | 類型 | 備註 |
|------|------|------|------|
| `qwen3-embedding:0.6b` | 639 MB | Embedding | **推薦** — 中英文最佳 |
| `nomic-embed-text` | 274 MB | Embedding | 更輕量，英文為主 |
| `qwen3:1.7b` | 1.4 GB | LLM | **推薦** — 品質 + 速度 |
| `gemma3:1b` | 815 MB | LLM | 更輕量，>500 字不穩定 |

**8GB RAM：** 用 `qwen3-embedding:0.6b` + `qwen3:1.7b` — 兩個都能裝得下。

---

## 開發

```bash
git clone https://github.com/notoriouslab/vault-search.git
cd vault-search
npm install
npm run dev    # watch mode
npm run build  # production build
```

---

## 授權

[MIT](./LICENSE)
