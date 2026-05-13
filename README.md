<div align="center">

# Vault Curate

[![Release](https://img.shields.io/github/v/release/notoriouslab/vault-curate?style=flat-square)](https://github.com/notoriouslab/vault-curate/releases)
[![License](https://img.shields.io/github/license/notoriouslab/vault-curate?style=flat-square)](LICENSE)
[![Obsidian Desktop](https://img.shields.io/badge/Obsidian-Desktop-7C3AED?style=flat-square&logo=obsidian)](https://obsidian.md/)
[![Ollama Local AI](https://img.shields.io/badge/Ollama-Local_AI-000?style=flat-square)](https://ollama.com/)
[![BRAT Available](https://img.shields.io/badge/BRAT-Available-blue?style=flat-square)](https://github.com/TfTHacker/obsidian42-brat)
[![Last Commit](https://img.shields.io/github/last-commit/notoriouslab/vault-curate)](https://github.com/notoriouslab/vault-curate)

**High-quality Chinese-friendly semantic search for Obsidian, with optional AI curation.**

[繁體中文](./README.zh-TW.md)

</div>

---

> ⓘ **Previously published as `vault-search`** (plugin id and repository renamed). A different plugin authored by a separate developer now occupies the `vault-search` id — see the [Upgrading from vault-search](#upgrading-from-vault-search) section below before installing if you used earlier versions.

**Search by meaning. Rediscover what you forgot.** Hybrid BM25 + semantic + fuzzy ranking. Works out of the box with a built-in on-device model; opt-in AI curation generates descriptions and topic-grouped Maps of Content.

![Search Panel](./docs/search-panel.png)

## Why Vault Curate?

[Andrej Karpathy shared](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) his vision of LLM-maintained knowledge bases — letting AI "compile" your notes into structured wikis. Compelling, but it asks you to hand over full editorial control.

**Vault Curate takes a different stance:** AI should help you *see*, not think for you. The best tools don't replace your writing — they help you **rediscover** what you already know and surface the connections you missed.

| What you get | What it unlocks |
|---|---|
| **Hybrid Fusion search** | BM25 (CJK trigram), semantic embeddings, and fuzzy title matching combined via Reciprocal Rank Fusion. Exact phrases, meaning, and misspellings all find the right note. |
| **Built-in Chinese-first embedding** | `bge-small-zh-v1.5` runs entirely on your device via WebGPU (or WASM fallback). No daemon, no API key, ~110 MB one-time download. |
| **Two-tier provider model** | Stick with the built-in model for true zero-config, or point at Ollama / any OpenAI-compatible endpoint for higher-quality models when you want them. |
| **Discover, not organize** | The Discover tab surfaces Cold (orphan) notes semantically related to your active reading — your blind spots become visible. |
| **Hot/Cold tiering** | Notes auto-classified by links + recency. Cold notes hiding in your vault get spotted next to your active Hot notes. |
| **AI curation (opt-in)** | Off by default. Turn on to generate frontmatter descriptions per note, and topic-grouped Maps of Content via HDBSCAN clustering + LLM naming. |
| **SQLite storage** | Local SQLite database for chunks, embeddings, and full-text search — no fragile `index.json` to corrupt. |
| **Obsidian-native UX** | Sidebar Search/Discover tabs, Cmd/Ctrl+P modal, right-click file menu (Find similar / Generate description), Canvas drag-drop. |

---

## Quick Start

### Path 1 — Built-in (zero-config, default)

1. Install the plugin (see [Installation](#installation))
2. On first launch the **Onboarding** modal appears. Pick **Built-in** and click **Index my vault now**
3. ~110 MB model downloads once, then indexing runs on WebGPU
4. Open the sidebar (compass icon) and start searching

### Path 2 — Ollama (advanced, higher quality)

1. Install [Ollama](https://ollama.com/) and pull a model: `ollama pull qwen3-embedding:0.6b`
2. Pick **Ollama** in the Onboarding modal, then **Index my vault now**
3. Embeddings run against your local Ollama daemon — content never leaves the machine

---

## Installation

### Requirements
- [Obsidian](https://obsidian.md/) desktop
- For Path 2: [Ollama](https://ollama.com/) running locally, or any OpenAI-compatible server

### Install
**BRAT (recommended):**
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add repository: `notoriouslab/vault-curate`
3. Enable "Vault Curate" in Settings → Community plugins

**Manual:**
1. Download `main.js`, `manifest.json`, `styles.css`, `worker.js`, `ort-wasm-simd-threaded.wasm` from [releases](https://github.com/notoriouslab/vault-curate/releases)
2. Copy to `.obsidian/plugins/vault-curate/` in your vault
3. Enable in Settings → Community plugins

> **Tip:** If your vault is Git-tracked, add `.obsidian/plugins/*/data.json` and `.obsidian/plugins/*/index.sqlite` to `.gitignore`.

---

## Upgrading from vault-search

If you used the earlier `vault-search` plugin (BRAT or sideload), follow this path:

1. **Open your vault folder** and locate `.obsidian/plugins/vault-search/`
2. **Delete that folder directly** from the filesystem. ⚠️ Do *not* use Community plugins → Uninstall — a different plugin now occupies the `vault-search` id and may insert itself when you uninstall.
3. **Install Vault Curate** via BRAT pointing at `notoriouslab/vault-curate` (see [Installation](#installation) above)
4. **Enable** it. The first-launch Onboarding modal will rebuild your index automatically.

Embeddings are not reused across versions — a from-scratch rebuild takes ~1–2 minutes on WebGPU for a few hundred notes. Frontmatter descriptions and tags already in your notes are preserved (they live in the `.md` files, not in the index).

If you had keybindings set on `vault-search:*` commands, redo them under `vault-curate:*` in Settings → Hotkeys (5 commands total).

---

## Usage

### Search
- **Cmd/Ctrl+P → "Vault Curate: Semantic search"** for a quick modal
- **Sidebar → Search tab** for persistent results as you read
- **Min score**, **Top results**, **Search scope** (Hot / All / Cold) in Settings → Advanced

### Discover
- **Sidebar → Discover tab → Current note** auto-shows related notes when you open a file (Cold notes highlighted)
- **Discover → Global** surfaces Cold notes most related to your entire Hot pool
- **"Generate MOC" button** exports the current results as a topic-grouped Map of Content (needs AI curation on; falls back to flat MOC if results are too few or too similar)

### Find Similar
- Right-click any `.md` → **VC: Find similar notes** → results in sidebar

### AI Curation (opt-in, off by default)
Enable in **Settings → AI Curation → Enable AI curation**, then:
- Right-click `.md` → **VC: Generate description** writes an LLM-generated description + tags to frontmatter
- **Cmd/Ctrl+P → "Vault Curate: Generate descriptions for current results"** runs it across the sidebar results
- **Cmd/Ctrl+P → "Vault Curate: Generate MOC (topic-grouped)"** runs HDBSCAN clustering then LLM-names each cluster

---

## Privacy

Three modes, picked at Onboarding (changeable anytime in Settings):

| Mode | Where embeddings run | Where note text goes |
|---|---|---|
| **Built-in** | On-device WebGPU / WASM | Stays on your device. |
| **Ollama (local)** | Your local Ollama daemon on 127.0.0.1 | Stays on your device. |
| **OpenAI-compatible** | Any endpoint you point at — local server (LM Studio, llama.cpp, etc.) *or* a remote API (OpenAI etc.) | Could leave your device — depends on the endpoint you choose. |

The AI curation features (description / MOC naming) use whatever LLM endpoint you configure separately; the same privacy reasoning applies.

No telemetry. No usage tracking. No phone-home.

---

## Tech Stack

- **TypeScript** + **esbuild** (two-stage bundle for worker + main)
- **sql.js** (SQLite via WASM) for the storage layer
- **Pure-TS BM25+** (`src/storage/bm25.ts`) for CJK-aware full-text search — no native FTS5 dependency
- **`@huggingface/transformers`** + **`bge-small-zh-v1.5` q8** (~110 MB, WebGPU/WASM) for on-device embeddings
- **`hdbscan-ts`** for topic clustering (MOC 2.0)
- **Optional**: [Ollama](https://ollama.com/) / any OpenAI-compatible endpoint for higher-end embedding / LLM models
- **Reciprocal Rank Fusion** (k=60) for combining BM25 + semantic + fuzzy signals

---

## Development

```bash
git clone https://github.com/notoriouslab/vault-curate.git
cd vault-curate
npm install
npm run dev    # watch mode
npm run build  # production build
npm test       # vitest unit tests
```

---

## License

[MIT](./LICENSE)
