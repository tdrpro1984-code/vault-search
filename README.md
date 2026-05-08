<div align="center">

# Vault Search

[![Release](https://img.shields.io/github/v/release/notoriouslab/vault-search?style=flat-square)](https://github.com/notoriouslab/vault-search/releases)
[![Downloads](https://img.shields.io/github/downloads/notoriouslab/vault-search/total?style=flat-square&color=573E7A)](https://github.com/notoriouslab/vault-search/releases)
[![License](https://img.shields.io/github/license/notoriouslab/vault-search?style=flat-square)](LICENSE)
[![Obsidian Desktop](https://img.shields.io/badge/Obsidian-Desktop-7C3AED?style=flat-square&logo=obsidian)](https://obsidian.md/)
[![Ollama Local AI](https://img.shields.io/badge/Ollama-Local_AI-000?style=flat-square)](https://ollama.com/)
[![BRAT Available](https://img.shields.io/badge/BRAT-Available-blue?style=flat-square)](https://github.com/TfTHacker/obsidian42-brat)
[![Last Commit](https://img.shields.io/github/last-commit/notoriouslab/vault-search)](https://github.com/notoriouslab/vault-search)

**Local-first semantic search & discovery for Obsidian — find what you mean, rediscover what you forgot. Simple, private, Chinese-friendly.**

[繁體中文](./README.zh-TW.md)

</div>

---

**Search by meaning. Rediscover what you forgot. All local, all private.**

No cloud services. No API keys. No subscription. Your notes never leave your machine.

![Search Panel](./docs/search-panel.png)

## Core Positioning

[Andrej Karpathy shared](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/) his vision of LLM-maintained knowledge bases — letting AI "compile" your notes into structured wikis. Compelling, but it asks you to hand over full editorial control.

**Vault Search takes a different stance:** AI should help you *see*, not think for you. The best tools don't replace your writing — they help you **rediscover** what you already know and surface the connections you missed.

### Why Vault Search matters

| Feature | What it unlocks |
|---------|-----------------|
| **Discover, not organize** | Find notes you *should* be reading, not force you to reorganize. The Discover tab surfaces Cold (orphan) notes semantically related to your thinking—your blind spots become visible. |
| **Hot/Cold tiering** | Every note is auto-classified by links and recency. Cold notes hiding in your vault get spotted next to your active Hot notes, turning forgotten vaults into living backlogs. |
| **MOC generation** | One click exports search or Discover results as a Map of Content note with wikilinks and previews. You design; AI gathers. |
| **Fully local + private** | Embedding, indexing, search, and LLM descriptions all run on your machine via Ollama or OpenAI-compatible servers. Zero cloud, zero keys, zero telemetry. |
| **Chinese-native design** | Built with `qwen3-embedding:0.6b` and synonym expansion. Traditional Chinese + English queries work seamlessly out of the box. |
| **Obsidian-native UX** | Sidebar Search/Discover tabs, Cmd/Ctrl+P modal, right-click file menu integration, Canvas drag-drop. Results feel like first-class Obsidian citizens. |
| **LLM-powered summaries** | Local LLM generates frontmatter descriptions for your notes, so embeddings work on curated summaries instead of raw text. Dramatically better relevance on long notes. |
| **Lightweight** | 8GB laptops. Recommended models fit on MacBook M2. Incremental indexing + debounce = near-zero daily overhead. |

---

## Quick Start

1. **Install** — BRAT or manual; see [Installation](#installation) below
2. **Settings → Vault Search** — Select your embedding model (default: `qwen3-embedding:0.6b`)
3. **Click "Rebuild"** — Full index of your vault
4. **Cmd/Ctrl+P → "Semantic search"** or open the **Discover** tab

### Recommended Workflow

For best search and Discover quality:

```
Generate descriptions → Rebuild index → Search & Discover
(LLM summarizes notes)  (embed with summaries)  (find and rediscover)
```

**Quick setup:** Just Rebuild and search (skip descriptions for speed).  
**Best quality:** Generate descriptions (preview) → review → Apply → Rebuild.

---

## Core Features

### Search Panel (Sidebar)
- **Semantic search** — Find notes by meaning, not keywords
- **Search & Discover tabs** — Persistent results as you read and write
- **Hot/Cold badges** — Visual distinction of linked vs. orphan notes
- **Chunking mode** — Optional: break long documents into overlapping segments
- **Similarity threshold** — Adjust Min Score to filter results (0–1)

### Discover Tab
- **Active mode** — Open a note → sidebar auto-shows related notes (Cold notes highlighted)
- **Global mode** — Surface Cold notes most related to your entire Hot pool
- **MOC export** — One-click Map of Content with wikilinks and previews
- **Cold-only search** — Dedicated mode for intentional exploration of orphan notes

### Description Generator (LLM)
- **Auto-summaries** — Local LLM writes frontmatter descriptions for each note
- **Better embeddings** — Embedding model uses summaries instead of raw text
- **Quality boost** — Especially noticeable on long, multi-topic notes
- **Synonym expansion** — Define synonyms to improve recall

### Modal Search (Cmd/Ctrl+P)
- **Instant search** — Quick modal with keyboard nav
- **Canvas drag-drop** — Drag results onto Canvas for visual mapping
- **Right-click menu** — Native Obsidian file operations (bookmark, rename, etc.)

---

## Installation & Setup

### Requirements

- [Obsidian](https://obsidian.md/) desktop
- [Ollama](https://ollama.com/) running locally (or any OpenAI-compatible server)
- Embedding model — `ollama pull qwen3-embedding:0.6b` (recommended)
- LLM (optional) — `ollama pull qwen3:1.7b` for description generation

### Install Plugin

**BRAT (recommended, fastest):**
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add repository: `notoriouslab/vault-search`
3. Enable "Vault Search" in Settings → Community plugins

**Manual:**
1. Download `main.js`, `manifest.json`, `styles.css` from [releases](https://github.com/notoriouslab/vault-search/releases)
2. Copy to `.obsidian/plugins/vault-search/` in your vault
3. Enable in Settings → Community plugins

> **Tip:** If vault is Git-tracked, add `.obsidian/plugins/*/data.json` to `.gitignore`.

---

## Advanced Reference

### Settings

<details>
<summary><strong>Search & Index</strong></summary>

| Setting | Default | Description |
|---|---|---|
| Server URL | `http://localhost:11434` | Ollama or OpenAI-compatible server |
| API format | Ollama | Ollama or OpenAI-compatible |
| API Key | — | Optional, for authenticated servers |
| Embedding model | `qwen3-embedding:0.6b` | Model for vector embeddings |
| Top results | 10 | Max results in search and Discover |
| Min score | 0.5 | Similarity threshold (0–1). Lower = more results |
| Max embed chars | 2000 | Content truncation. Notes with descriptions use description instead |
| Hot days | 90 | Notes created within N days are Hot |
| Search scope | Hot only | Hot / All / Cold |
| Chunking mode | Off | Off / Smart / All |
| Chunk size | 1000 | Characters per chunk |
| Chunk overlap | 200 | Overlapping characters |
| Exclude patterns | `_templates/` `.trash/` `3_wiki/` | Folders to skip |
| Synonyms | — | `keyword = syn1, syn2` per line |
| Auto-index | On | Re-embed on file change. Keeps Discover fresh |

</details>

<details>
<summary><strong>Description Generator</strong></summary>

| Setting | Default | Description |
|---|---|---|
| LLM model | `qwen3:1.7b` | Recommended: fast, good quality |
| Min description length | 30 | Shorter descriptions get rewritten. Good descriptions improve search and Discover |

</details>

### Commands (Command Palette)

All prefixed with **Vault Search:**

| Command | Purpose |
|---------|---------|
| **Semantic search (modal)** | Quick search with keyboard nav |
| **Open search panel** | Sidebar with Search & Discover tabs |
| **Find similar notes** | Related notes for current file |
| **Discover related Cold notes** | Global discover — find hidden gems |
| **Rebuild index** | Full re-index (run after settings changes) |
| **Update index** | Incremental update |
| **Generate descriptions (preview)** | LLM drafts descriptions, preview before apply |
| **Apply descriptions** | Write descriptions to frontmatter |

### How It Works

```
Your notes (.md)
    ↓
Ollama Embed API  ←  [Synonym expansion]
    ↓
Vector Index (index.json) 
    ↓
    ├─ Search query → cosine similarity → ranked results
    ├─ Discover → vector math (no API calls) → Cold notes surfaced
    └─ Hot/Cold classification (links + recency)
```

**Workflow:**
1. **Index** — Note (or description) → embedding model → vector in `index.json`
2. **Search** — Query + synonyms → embedding → cosine similarity → results
3. **Discover** — Pure vector math on existing embeddings (no API)
4. **Hot/Cold** — Auto-classified by links and recency
5. **MOC** — Export results as linked note with previews
6. **Descriptions** — Local LLM → frontmatter → better embeddings

### Model Recommendations

| Model | Size | Type | Notes |
|-------|------|------|-------|
| `qwen3-embedding:0.6b` | 639 MB | Embedding | **Recommended** — Chinese + English |
| `nomic-embed-text` | 274 MB | Embedding | Lighter, English-focused |
| `qwen3:1.7b` | 1.4 GB | LLM | **Recommended** — quality + speed |
| `gemma3:1b` | 815 MB | LLM | Lighter, unstable >500 char input |

**For 8GB RAM:** Use `qwen3-embedding:0.6b` + `qwen3:1.7b` — both fit comfortably.

---

## Development

```bash
git clone https://github.com/notoriouslab/vault-search.git
cd vault-search
npm install
npm run dev    # watch mode
npm run build  # production build
```

---

## License

[MIT](./LICENSE)
