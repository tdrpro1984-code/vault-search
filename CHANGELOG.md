# Changelog

## 1.2.0 — 2026-07-17

Search-quality release. Template-heavy notes (person cards, log templates) no longer crowd *Find similar* / Discover / relation-graph results with their template siblings — the genuinely related content now surfaces. Driven by a real-vault case where a person card's own conversation file ranked #10 behind nine sibling cards; after this release it ranks #1.

### Fixed
- **Long notes were systematically under-scored.** Note-level vectors are mean-pooled from chunk vectors without re-normalization, so multi-chunk notes had norm < 1 while rankers assumed unit vectors (dot = cosine). Vectors are now L2-normalized at the read boundary. This alone moved the dogfood case's target conversation from rank #10 to #1 — expect similarity results to change (for the better) across the vault.

### Changed
- **Embedding input is denoised.** Markdown structure symbols (table borders/divider rows, block/bar characters like `█▃▅`, middle-dot runs) are stripped from the text fed to the embedding model. Shared template symbols dominated note-to-note cosine for templated notes. Stored chunk text is untouched — keyword search and snippets are unaffected. Single middle dots (CJK name separators, e.g. 趙·雲) are preserved.
- **Note ranking vector now blends the frontmatter `description`.** `noteVec = normalize(0.5·desc + 0.5·body)` when a description (≥10 chars) exists; body-only otherwise. A semantic description pins *who/what the note is about*, which plain body text can't when bodies share a template. Blend weight is tunable via `descWeight` in `data.json` (no UI control on purpose).
- **Description generator sees content, not template.** Sampling now denoises first and takes head 1200 + tail 800 chars (personal content in templated notes tends to live at the end), and the prompt forbids describing the note's format/structure. Previously the LLM described the template ("contains statistics tables…") for exactly the notes that needed a semantic description most.

### Added
- **Descriptions are keyword-searchable.** Each note's `description` joins the BM25 pool as a virtual document — terms that appear only in the description now hit in search.
- **Zero-effort upgrade.** First launch after upgrading runs a one-time incremental pass: only notes containing strippable symbols are re-embedded (16% of the dogfood vault, not a full rebuild), and existing descriptions get their embeddings backfilled (descriptions only — seconds per thousand notes). A progress notice shows while this runs; interrupting is safe (it resumes on next launch).

### Notes
- Hidden settings: `descWeight` (default 0.5, validated by a two-sided boundary scan — higher values start sacrificing true positives) and `minDescChars` (default 10).
- Remaining topic-level neighbors (people who discuss the same subjects) are a semantic-resolution limit of the built-in model; a larger embedding model via the Ollama/OpenAI provider raises that ceiling at the cost of speed.

## 1.1.1 — 2026-07-07

Audit compliance patch — addresses type-safety warnings raised by the Obsidian Developer Dashboard on the 1.1.0 audit. No behaviour changes.

### Changed
- Frontmatter access now uses type annotations instead of type assertions (`indexer.ts`, `main.ts`, `search-view.ts`) — resolves one unsafe-`any` assignment and four unnecessary-assertion warnings.
- A vault `rename` event handler now explicitly `void`s its async re-index call (floating-promise warning).
- Removed redundant type assertions in `types.ts` (settings default) and `workers/embeddingWorker.ts` (transformers.js pipeline options) — current typings accept the literals directly. Type-level only; emitted JS is identical.

### Notes
- The Dashboard's remaining recommendations are intentional and already disclosed in the README: vault enumeration (required for index build, scopable via `excludePatterns`) and extra release files (`*.wasm` fetched once at first run and cached). The `PluginSettingTab.display` deprecation (Obsidian 1.13+) is deferred — migrating to `getSettingDefinitions` would raise `minAppVersion` from 1.7.2 and drop users on 1.7–1.12.

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
