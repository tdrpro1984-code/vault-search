# Changelog

## 1.1.0 — 2026-07-07

New feature, from forum-zh thread #61655 community feedback.

### Added
- **Relation graph (Canvas)**. Generate an editable Obsidian Canvas around any note: center note plus its top-K semantic neighbors laid out radially, every edge labeled with its similarity score. Purple edges mark notes that are semantically close but not yet wikilinked — connections the native graph view can't surface; gray edges (with direction arrows) mark existing wikilinks; cyan nodes mark Cold notes. Three entry points: command palette (`Generate relation graph (Canvas)`), file right-click (`VC: Generate relation graph`), and a **Graph** button on the Discover sidebar (targets the pinned note when pinned). Right-click any node inside the generated canvas to expand one hop further.
- **Relation graph folder** setting (Advanced). Generated `.canvas` files are written to this folder (default `Vault Curate Canvases`; empty = vault root) with a timestamped filename — an edited graph is never overwritten by a later run.

### Notes
- Zero new dependencies; the graph is assembled from the existing note-level embedding index. Generation reuses the *Find similar notes* similarity pass, so it is instant even on large vaults.

## 1.0.4 — 2026-06-02

UX patch from forum-zh thread #61655 community feedback.

### Fixed
- **Duplicate-looking titles in result lists**. Template-generated notes that share the same `# H1` heading (a common pattern for clinical / journaling / log templates) previously all rendered with the same title in Search / Discover lists, making them indistinguishable. The H1 fallback now performs a collision check across the vault — H1s that appear in 2+ files automatically fall back to `file.basename` so each note remains visually unique. Frontmatter `title:` (when present) still wins unconditionally.

### Notes
- Existing indexes auto-migrate on the next **Update** — files whose stored title differs under the new rule are re-indexed transparently. No manual Rebuild required.

## 1.0.3 — 2026-05-21

Audit compliance patch — addresses three findings raised by the Obsidian Developer Dashboard auto-audit.

### Changed
- **Build**: esbuild now strips `require("node:fs")` and `require("node:crypto")` references from the bundled `sql.js` Emscripten output. Those branches are dead code in Obsidian's renderer process; removing the syntactic references resolves the Dashboard's "Direct Filesystem Access" warning without changing runtime behaviour.

### Docs
- README + README.zh-TW: added an "Audit disclosures" section explaining the remaining audit findings — vault enumeration (necessary for indexing; user-scopable via `excludePatterns`), and `new Function` inside the bundled `@huggingface/transformers` (model-loading internals only; Vault Curate's own source contains zero `eval` / `new Function`).

## 1.0.2 — 2026-05-21

UX patch from community feedback (forum-zh thread #61655) + own dogfood.

### Fixed
- LLM model dropdown stuck on "Loading..." when using built-in WebGPU embedding + AI curation. The dropdown now correctly fetches Ollama models even when the embedding provider is set to `wasm`. ([#7](https://github.com/notoriouslab/vault-curate/issues/7))

### Added
- **Hover preview** integration for Search and Discover result items. Holding Cmd/Ctrl while hovering a result now shows Obsidian's native Page Preview popup, same as for `[[wikilinks]]`. Registers as a hover source so it can be toggled in Settings → Core plugins → Page preview. ([#6](https://github.com/notoriouslab/vault-curate/issues/6))
- **Pin Discover** sidebar to lock against active-file switching. Click the 📌 button in the Discover toolbar to keep the current note's discovery context visible while you click through to peek at results. Auto-unpins on file delete or when switching to Global mode; rename-aware. ([#6](https://github.com/notoriouslab/vault-curate/issues/6))

### i18n
- 5 new strings for the pin feature (English + Traditional Chinese)

---

Earlier versions: see [GitHub releases](https://github.com/notoriouslab/vault-curate/releases).
