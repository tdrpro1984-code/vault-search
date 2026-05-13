<div align="center">

# Vault Curate

[![Release](https://img.shields.io/github/v/release/notoriouslab/vault-curate?style=flat-square)](https://github.com/notoriouslab/vault-curate/releases)
[![License](https://img.shields.io/github/license/notoriouslab/vault-curate?style=flat-square)](LICENSE)
[![Obsidian Desktop](https://img.shields.io/badge/Obsidian-Desktop-7C3AED?style=flat-square&logo=obsidian)](https://obsidian.md/)
[![Ollama 本地 AI](https://img.shields.io/badge/Ollama-本地AI-000?style=flat-square)](https://ollama.com/)
[![BRAT 可用](https://img.shields.io/badge/BRAT-可用-blue?style=flat-square)](https://github.com/TfTHacker/obsidian42-brat)
[![Last Commit](https://img.shields.io/github/last-commit/notoriouslab/vault-curate)](https://github.com/notoriouslab/vault-curate)

**為 Obsidian 打造的高品質中文語意搜尋與 AI 整理工具。**

[English](./README.md)

</div>

---

> ⓘ **本 plugin 前身為 `vault-search`**（plugin id 與 repository 已改名）。目前 `vault-search` id 由另一位開發者的同名 plugin 佔用 — 若你曾使用舊版，請先閱讀下方 [從 vault-search 升級](#從-vault-search-升級) 章節再安裝。

**用意義搜尋，重新發現遺忘的筆記。** Hybrid 搜尋融合 BM25 + 語意 + 模糊比對；內建裝置端模型，零設定即可使用；AI 整理（描述生成、主題分群 MOC）可選擇性開啟。

![搜尋面板](./docs/search-panel.png)

## 為什麼選擇 Vault Curate？

[Andrej Karpathy 分享了](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/)他用 LLM 維護知識庫的願景 — 讓 AI「編譯」筆記成結構化 wiki。很吸引人，但前提是把編輯權完全交給 AI。

**Vault Curate 走另一條路**：AI 應該幫你**看見**，不是替你思考。最好的工具不取代你的寫作，而是幫你**重新發現**已有的內容，浮現你錯過的連結。

| 功能 | 帶來什麼 |
|---|---|
| **Hybrid Fusion 搜尋** | 用 Reciprocal Rank Fusion 結合 BM25（CJK trigram）、語意 embedding、模糊標題比對。確切字詞、相近意義、錯字都能找到對的筆記。 |
| **內建中文 embedding** | `bge-small-zh-v1.5` 在裝置端透過 WebGPU（或 WASM fallback）執行。不需 daemon、不需 API key，首次下載約 110 MB。 |
| **雙軌 provider 設計** | 預設用內建模型（真零設定），需要高品質模型時可改指向 Ollama 或任意 OpenAI-compatible endpoint。 |
| **Discover：發掘而非整理** | Discover 分頁浮現與你目前在讀內容語意相關的 Cold（孤立）筆記 — 把盲區攤在眼前。 |
| **Hot/Cold 自動分層** | 依連結 + 近期建立自動分類。藏在 vault 裡的 Cold 筆記會跟你 Hot 主題一起被看見。 |
| **AI 整理（可選擇）** | 預設關閉。開啟後可為單篇筆記生成 frontmatter description，並透過 HDBSCAN 分群 + LLM 命名產生主題分群 MOC。 |
| **SQLite 儲存** | 本地 SQLite 資料庫存 chunks、embedding、全文索引 — 沒有脆弱的 `index.json` 會壞掉。 |
| **Obsidian 原生 UX** | 側邊欄 Search / Discover 兩 tab、Cmd/Ctrl+P modal、右鍵選單（尋找相似 / 生成 description）、拖曳至 Canvas。 |

---

## 快速開始

### 路徑 1 — 內建模型（零設定，預設）

1. 安裝 plugin（見下方 [安裝](#安裝)）
2. 首次啟動會彈出 **Onboarding** 視窗，選 **內建** → 點 **現在開始建立索引**
3. 約 110 MB 模型一次性下載，之後在 WebGPU 上跑索引
4. 點側邊欄羅盤 icon 開啟，就可以開始搜尋

### 路徑 2 — Ollama（進階，品質更高）

1. 安裝 [Ollama](https://ollama.com/) 並下載模型：`ollama pull qwen3-embedding:0.6b`
2. 在 Onboarding 視窗選 **Ollama**，按 **現在開始建立索引**
3. Embedding 透過本機 Ollama daemon 計算，內容不離開電腦

---

## 安裝

### 需求
- [Obsidian](https://obsidian.md/) 桌面版
- 走路徑 2 額外需要：本機 [Ollama](https://ollama.com/) 或任意 OpenAI-compatible 伺服器

### 安裝步驟
**BRAT（推薦）：**
1. 安裝 [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. 加入 repository：`notoriouslab/vault-curate`
3. 在「Settings → Community plugins」啟用 "Vault Curate"

**手動：**
1. 從 [releases](https://github.com/notoriouslab/vault-curate/releases) 下載 `main.js`、`manifest.json`、`styles.css`、`worker.js`、`ort-wasm-simd-threaded.wasm`
2. 複製到 vault 的 `.obsidian/plugins/vault-curate/`
3. 在「Settings → Community plugins」啟用

> **提示**：vault 若有 Git 追蹤，建議在 `.gitignore` 加上 `.obsidian/plugins/*/data.json` 與 `.obsidian/plugins/*/index.sqlite`。

---

## 從 vault-search 升級

如果你曾用過舊版 `vault-search`（BRAT 或手動裝），請依此步驟：

1. **打開 vault 資料夾**，找到 `.obsidian/plugins/vault-search/`
2. **直接從檔案系統刪除整個資料夾**。⚠️ **不要**在「Community plugins → Uninstall」執行卸載 — 目前 `vault-search` id 由另一個 plugin 佔用，按 Uninstall 可能會被它插入。
3. **用 BRAT 安裝 Vault Curate**，倉庫指向 `notoriouslab/vault-curate`（見 [安裝](#安裝)）
4. **啟用**。首次啟動的 Onboarding 視窗會自動建立新索引。

舊版 embedding 不會被沿用 —— WebGPU 路徑下幾百篇筆記重建約 1–2 分鐘。筆記裡既有的 frontmatter（description / tags）會完整保留（這些存在 `.md` 檔案，不在索引裡）。

如果你之前對 `vault-search:*` 指令設過快捷鍵，請到「Settings → Hotkeys」改為 `vault-curate:*`（共 5 個指令）。

---

## 使用方式

### 搜尋
- **Cmd/Ctrl+P → 「Vault Curate: 語意搜尋（彈窗）」** 快速搜尋
- **側邊欄 → 搜尋 tab** 持續顯示結果
- **最低分數**、**顯示筆數**、**搜尋範圍**（Hot / All / Cold）在「Settings → 進階」

### Discover
- **側邊欄 → 發掘 tab → 當前筆記** 開啟筆記時自動顯示相關筆記（Cold 筆記突顯）
- **發掘 → 全域** 浮現與整個 Hot 池子最相關的 Cold 筆記
- **「生成 MOC」按鈕** 把當前結果輸出為主題分群 Map of Content（需啟用 AI 整理；結果太少或主題過於相近時自動退回平面 MOC）

### 尋找相似
- 在任意 `.md` 右鍵 → **VC: 尋找相似筆記** → 結果顯示在側邊欄

### AI 整理（預設關閉）
在「Settings → AI 整理 → 啟用 AI 整理」開啟後：
- 右鍵 `.md` → **VC: 生成 description** 用 LLM 生成 description + tags 寫入 frontmatter
- **Cmd/Ctrl+P → 「Vault Curate: 為目前結果生成 description」** 對側邊欄結果批次跑
- **Cmd/Ctrl+P → 「Vault Curate: 生成 MOC（主題分群）」** 透過 HDBSCAN 分群再請 LLM 命名

---

## 隱私

三種模式，Onboarding 時選擇（設定中隨時可改）：

| 模式 | Embedding 在哪算 | 筆記內容去哪 |
|---|---|---|
| **內建** | 裝置端 WebGPU / WASM | 留在裝置上。 |
| **Ollama（本機）** | 本機 Ollama daemon（127.0.0.1） | 留在裝置上。 |
| **OpenAI-compatible** | 你指定的任意 endpoint — 可以是本機伺服器（LM Studio、llama.cpp 等）**也可以**是遠端 API（OpenAI 等） | 視你選的 endpoint 而定，可能離開裝置。 |

AI 整理（description / MOC 命名）所用的 LLM endpoint 另外設定，相同邏輯適用。

無遙測。無使用追蹤。無 phone-home。

---

## 技術棧

- **TypeScript** + **esbuild**（worker + main 兩階段 bundle）
- **sql.js**（SQLite via WASM）做儲存層
- **純 TS BM25+**（`src/storage/bm25.ts`）做 CJK 友善全文搜尋 — 不依賴原生 FTS5
- **`@huggingface/transformers`** + **`bge-small-zh-v1.5` q8**（~110 MB，WebGPU/WASM）做裝置端 embedding
- **`hdbscan-ts`** 做主題分群（MOC 2.0）
- **可選**：[Ollama](https://ollama.com/) / 任意 OpenAI-compatible endpoint 接更高階 embedding / LLM 模型
- **Reciprocal Rank Fusion**（k=60）融合 BM25 + 語意 + 模糊三路訊號

---

## 開發

```bash
git clone https://github.com/notoriouslab/vault-curate.git
cd vault-curate
npm install
npm run dev    # 監看模式
npm run build  # 產生 production build
npm test       # vitest 單元測試
```

---

## License

[MIT](./LICENSE)
