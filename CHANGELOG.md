# Changelog

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
