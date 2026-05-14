import { Menu, normalizePath, Notice, Plugin, TFile, requestUrl } from "obsidian";
import workerSource from "@inline/worker";
import { SQLiteStore, type PersistAdapter } from "./storage/SQLiteStore";
import {
    createProvider,
    type EmbeddingProvider,
    type EmbeddingSettings,
    type HttpFetch,
} from "./embedding";
import {
    VaultSearchData,
    VaultSearchSettings,
    DEFAULT_SETTINGS,
} from "./types";
import { Indexer } from "./indexer";
import { SearchModal } from "./searcher";
import { SearchView, VIEW_TYPE_SEARCH } from "./search-view";
import { VaultSearchSettingTab } from "./settings";
import { findSimilarSqlite } from "./search/discoverSqlite";
import { DescriptionGenerator } from "./description-generator";
import { OnboardingModal, applyOnboardingChoice } from "./ui/OnboardingModal";
import { t } from "./i18n";

export default class VaultSearchPlugin extends Plugin {
    settings!: VaultSearchSettings;
    indexer!: Indexer;
    descGenerator!: DescriptionGenerator;
    store: SQLiteStore | null = null;
    provider: EmbeddingProvider | null = null;
    private debounceTimers: Map<string, number> = new Map();

    async onload() {
        await this.loadSettings();

        // Phase 4 (004 rebrand): open SQLite store + create embedding provider.
        // Wrap in try/catch so a backend failure cannot prevent the plugin
        // from registering its commands — diagnostics belong in the console,
        // not a dead palette.
        try {
            this.store = await this.openStore();
            this.provider = await this.buildProvider();
            this.indexer = new Indexer(this, this.store, this.provider);
        } catch (err) {
            console.error("vault-curate: backend init failed", err);
            new Notice(
                `vault-curate: backend init failed — ${err instanceof Error ? err.message : String(err)}`,
                10000,
            );
        }
        this.descGenerator = new DescriptionGenerator(this);

        // Register sidebar view
        this.registerView(VIEW_TYPE_SEARCH, (leaf) => new SearchView(leaf, this));

        // Ribbon icon to open sidebar
        this.addRibbonIcon("compass", t.viewDisplayName, () => {
            void this.activateView();
        });

        // Register commands
        this.addCommand({
            id: "semantic-search",
            name: t.cmdSemanticSearch,
            callback: () => {
                if (!this.store || !this.provider) {
                    new Notice(t.noticeIndexEmpty);
                    return;
                }
                new SearchModal(this.app, this).open();
            },
        });

        this.addCommand({
            id: "open-search-panel",
            name: t.cmdOpenPanel,
            callback: () => this.activateView(),
        });

        this.addCommand({
            id: "find-similar",
            name: t.cmdFindSimilar,
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!this.store) return false;
                if (checking) return true;
                void this.findSimilar(file);
                return true;
            },
        });

        this.addCommand({
            id: "rebuild-index",
            name: t.cmdRebuild,
            callback: () => this.rebuildIndex(),
        });

        this.addCommand({
            id: "update-index",
            name: t.cmdUpdate,
            callback: () => this.updateIndex(),
        });

        // Phase 6 (004 rebrand): description generation is now per-note,
        // gated by enableAICuration. checkCallback hides the command from
        // the palette when the gate is off or no markdown file is active.
        this.addCommand({
            id: "desc-active-note",
            name: t.cmdDescActive,
            checkCallback: (checking) => {
                if (!this.settings.enableAICuration) return false;
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (checking) return true;
                void this.descGenerator.generateForActiveNote(file);
                return true;
            },
        });

        this.addCommand({
            id: "desc-current-results",
            name: t.cmdDescSelected,
            checkCallback: (checking) => {
                // Gate on AI curation only. Empty/no-sidebar runtime check
                // happens in the handler so the command is discoverable
                // before the user has searched anything.
                if (!this.settings.enableAICuration) return false;
                if (checking) return true;
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
                const view = leaf?.view as SearchView | undefined;
                if (!view) {
                    new Notice(t.descOpenSidebarFirst);
                    return true;
                }
                if (view.getCurrentResults().length === 0) {
                    new Notice(t.descNoEligible);
                    return true;
                }
                void this.generateDescriptionsForResults(view);
                return true;
            },
        });

        // Phase 6/8: right-click items on any .md file in the file
        // explorer or editor. "Find similar" always shows when an index
        // exists; "Generate description" is gated on enableAICuration.
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (!(file instanceof TFile) || file.extension !== "md") return;
                if (this.store) {
                    menu.addItem((item) => {
                        item.setTitle(t.menuFindSimilar)
                            .setIcon("search")
                            .onClick(() => void this.findSimilar(file));
                    });
                }
                if (this.settings.enableAICuration) {
                    menu.addItem((item) => {
                        item.setTitle(t.menuDescGenerate)
                            .setIcon("sparkles")
                            .onClick(() => void this.descGenerator.generateForActiveNote(file));
                    });
                }
            }),
        );

        this.addCommand({
            id: "global-discover",
            name: t.cmdGlobalDiscover,
            callback: () => void this.openGlobalDiscover(),
        });

        this.addCommand({
            id: "generate-moc-grouped",
            name: t.cmdGenerateMocGrouped,
            checkCallback: (checking) => {
                // Gate on AI curation only. The grouped flow has its own
                // fallback-to-flat path when result count < 5, so we keep
                // the command discoverable regardless of current results.
                if (!this.settings.enableAICuration) return false;
                if (checking) return true;
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
                const view = leaf?.view as SearchView | undefined;
                if (!view) {
                    new Notice(t.descOpenSidebarFirst);
                    return true;
                }
                void view.generateMocGroupedFlow();
                return true;
            },
        });

        // Active Discovery: file-open listener
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (!file || !this.store) return;
                this.onActiveFileChange(file);
            })
        );

        // Register vault events for auto-indexing.
        // Defer to `onLayoutReady` so we don't catch the synthetic `create`
        // events that Obsidian emits for every existing file during workspace
        // load — those would otherwise queue 300+ single-file index calls and
        // saturate the embedding provider on plugin enable.
        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(
                this.app.vault.on("modify", (file) => this.onFileChange(file, "modify"))
            );
            this.registerEvent(
                this.app.vault.on("create", (file) => this.onFileChange(file, "create"))
            );
            this.registerEvent(
                this.app.vault.on("delete", (file) => this.onFileChange(file, "delete"))
            );
            this.registerEvent(
                this.app.vault.on("rename", (file, oldPath) => this.onFileRename(file, oldPath))
            );
        });

        // Settings tab
        this.addSettingTab(new VaultSearchSettingTab(this.app, this));

        // Phase 8 (004 rebrand) first-launch onboarding. The modal pops
        // when both signals are absent:
        //   - last_indexed_at  → set by the indexer on first successful rebuild
        //   - onboarding_dismissed → set when the user clicks Skip / Esc / X
        // Either signal alone is enough to stop bouncing the modal each launch.
        // If store init failed, surface a recovery notice rather than going
        // silent.
        this.app.workspace.onLayoutReady(() => {
            if (!this.store) {
                new Notice("vault-curate: backend not ready — reload the plugin or check console.", 10000);
                return;
            }
            const indexed = this.store.getMeta("last_indexed_at");
            const dismissed = this.store.getMeta("onboarding_dismissed");
            if (!indexed && !dismissed) {
                this.showOnboardingModal();
            }
        });
        console.debug("Vault Curate loaded");
    }
    onunload() {
        for (const timer of this.debounceTimers.values()) {
            window.clearTimeout(timer);
        }
        if (this.activeDiscoverTimer) window.clearTimeout(this.activeDiscoverTimer);
        // Best-effort flush + dispose. We cannot await in onunload, but
        // SQLiteStore.dispose() flushes synchronously when pending mutations.
        void this.store?.dispose();
        this.provider?.dispose();
        console.debug("Vault Curate unloaded");
    }

    /** Public — also called from Settings → AI Curation → "Re-run onboarding". */
    showOnboardingModal() {
        // Clear the dismissed flag so a Skip from this re-run doesn't stick.
        this.store?.setMeta("onboarding_dismissed", "");
        new OnboardingModal(this.app, this, (choice) => {
            void applyOnboardingChoice(this, choice);
        }).open();
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({ type: VIEW_TYPE_SEARCH, active: true });
            }
        }
        if (leaf) {
            void workspace.revealLeaf(leaf);
            // Focus the search input
            const view = leaf.view as SearchView;
            if (view.focusInput) view.focusInput();
        }
    }

    // ── Active Discovery ────────────────────────────────

    private activeDiscoverTimer: number | null = null;
    private lastDiscoverPath: string | null = null;

    private onActiveFileChange(file: TFile) {
        if (file.extension !== "md") return;
        if (file.path === this.lastDiscoverPath) return;
        if (this.activeDiscoverTimer) window.clearTimeout(this.activeDiscoverTimer);
        this.activeDiscoverTimer = window.setTimeout(() => {
            this.lastDiscoverPath = file.path;
            const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
            if (!leaf) return;
            const view = leaf.view as SearchView;
            if (view.isDiscoverTabActive()) {
                void view.discoverForFile(file);
            }
        }, 500);
    }

    private async openGlobalDiscover() {
        if (!this.store) {
            new Notice(t.discoverNoIndex);
            return;
        }
        await this.activateView();
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
        if (!leaf) return;
        const view = leaf.view as SearchView;
        view.showGlobalDiscover();
    }

    /**
     * Phase 6: batch-generate descriptions for the current search/Discover
     * results panel. Skips notes that already have a description; opens a
     * Notice if nothing is eligible so the user isn't left wondering.
     */
    async generateDescriptionsForResults(view: SearchView): Promise<void> {
        const results = view.getCurrentResults();
        const targets: TFile[] = [];
        let skippedNonString = 0;
        for (const r of results) {
            const file = this.app.vault.getAbstractFileByPath(r.path);
            if (!(file instanceof TFile) || file.extension !== "md") continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter as Record<string, unknown> | undefined;
            const desc = fm?.description;
            if (desc === undefined || desc === null) {
                targets.push(file);
            } else if (typeof desc === "string") {
                if (desc.trim().length === 0) targets.push(file);
                // non-empty string description → skip (already curated)
            } else {
                // Number, array, object — non-standard. Skip to avoid
                // overwriting structured data the user might be relying on.
                skippedNonString++;
            }
        }
        if (skippedNonString > 0) {
            console.warn(`vault-curate: skipped ${skippedNonString} notes whose existing description is not a string (would clobber structured data).`);
        }
        if (targets.length === 0) {
            new Notice(t.descNoEligible);
            return;
        }
        await this.descGenerator.generateForFiles(targets);
    }

    // ── Find Similar (Phase 8: SQLite-backed) ────────────

    async findSimilar(file: TFile) {
        const store = this.store;
        if (!store) {
            new Notice(t.noticeIndexEmpty);
            return;
        }
        const note = store.getNote(file.path);
        if (!note || note.bodyVec.length === 0) {
            new Notice(t.notIndexed);
            return;
        }

        const topResults = findSimilarSqlite(file.path, store, {
            minScore: this.settings.minScore,
            topResults: this.settings.topResults,
        });

        if (topResults.length === 0) {
            new Notice(t.noSimilar);
            return;
        }

        await this.activateView();
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
        if (leaf) {
            const view = leaf.view as SearchView;
            view.showResults(topResults, t.similarTo(note.title));
        }
    }

    async rebuildIndex() {
        if (!this.indexer) {
            new Notice("vault-curate: backend not ready — see console for init error");
            return;
        }
        if (this.indexer.indexing) { new Notice(t.indexingInProgress); return; }
        this.indexer.indexing = true;
        try {
            await this.indexer.rebuild();
        } finally {
            this.indexer.indexing = false;
        }
    }

    async updateIndex() {
        if (!this.indexer) {
            new Notice("vault-curate: backend not ready — see console for init error");
            return;
        }
        if (this.indexer.indexing) { new Notice(t.indexingInProgress); return; }
        this.indexer.indexing = true;
        try {
            await this.indexer.update();
        } finally {
            this.indexer.indexing = false;
        }
    }

    private onFileChange(file: unknown, type: string) {
        if (!this.indexer || !this.store) return;
        if (!this.settings.autoIndex || this.indexer.indexing) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.indexer.shouldExclude(file.path)) return;
        // Skip startup `create` storm: Obsidian re-emits a create event for
        // every existing file when a plugin enables. Only honour incremental
        // events after the user has explicitly run a full rebuild at least
        // once (signalled by meta.bootstrapped — sticky across clearAllData).
        if (!this.store.getMeta("bootstrapped")) return;

        const existing = this.debounceTimers.get(file.path);
        if (existing) window.clearTimeout(existing);

        this.debounceTimers.set(
            file.path,
            window.setTimeout(() => {
                this.debounceTimers.delete(file.path);
                if (type === "delete") {
                    this.indexer.removeNote(file.path);
                } else {
                    void this.indexer.indexSingleFile(file);
                }
            }, 2000)
        );
    }

    private async onFileRename(file: unknown, oldPath: string) {
        if (!this.indexer || !this.store || !this.settings.autoIndex) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.store.getMeta("bootstrapped")) return;

        await this.indexer.renameNote(oldPath, file.path, file);
    }

    /** DB path inside the plugin folder. */
    private dbPath(): string {
        return normalizePath(
            `${this.app.vault.configDir}/plugins/${this.manifest.id}/index.sqlite`
        );
    }

    /** Drop legacy v0.3.x index.json file once the SQLite store is healthy. */
    private async dropLegacyIndexJson(): Promise<void> {
        const legacy = normalizePath(
            `${this.app.vault.configDir}/plugins/${this.manifest.id}/index.json`
        );
        try {
            if (await this.app.vault.adapter.exists(legacy)) {
                await this.app.vault.adapter.remove(legacy);
                console.debug("vault-curate: removed legacy index.json");
            }
        } catch (err) {
            console.warn("vault-curate: failed to remove legacy index.json", err);
        }
    }

    private async openStore(): Promise<SQLiteStore> {
        const adapter: PersistAdapter = {
            read: async (path) => {
                const exists = await this.app.vault.adapter.exists(path);
                if (!exists) return null;
                const buf = await this.app.vault.adapter.readBinary(path);
                return new Uint8Array(buf);
            },
            write: async (path, bytes) => {
                // Copy into a fresh ArrayBuffer so writeBinary's strict
                // ArrayBuffer signature is satisfied without an `as` cast
                // (Uint8Array.buffer is ArrayBufferLike — ArrayBuffer |
                // SharedArrayBuffer — in current TS lib types).
                const ab = new ArrayBuffer(bytes.byteLength);
                new Uint8Array(ab).set(bytes);
                await this.app.vault.adapter.writeBinary(path, ab);
            },
            exists: (path) => this.app.vault.adapter.exists(path),
        };
        const store = await SQLiteStore.open(adapter, this.dbPath());
        await this.dropLegacyIndexJson();
        return store;
    }

    /**
     * Build the embedding provider from current settings.
     *
     * Provider selection (Phase 4 wires the WASM default; Phase 8 Settings UI
     * will expose a first-class picker):
     *   - "wasm"              → built-in transformers.js (default, zero-config)
     *   - "ollama"            → external Ollama
     *   - "openai-compatible" → external OpenAI-compatible endpoint
     */
    private async buildProvider(): Promise<EmbeddingProvider> {
        const httpFetch: HttpFetch = async (req) => {
            const resp = await requestUrl({
                url: req.url,
                method: req.method,
                headers: req.headers,
                body: req.body,
                throw: false,
            });
            let parsedJson: unknown = null;
            try { parsedJson = resp.json; } catch { /* may not be JSON */ }
            return { status: resp.status, text: resp.text, json: parsedJson };
        };

        const providerType = this.settings.embeddingProvider;
        if (providerType === "wasm") {
            return createProvider(
                {
                    providerType: "wasm",
                    // Phase 4 dogfood: bge-base-zh (110M params) takes ~6s/chunk
                    // in Obsidian's Electron worker (wasm only, no native ORT).
                    // Switched to bge-small-zh-v1.5 (33M params) to land in the
                    // same speed class as competitor MiniLM-L12 while keeping
                    // Chinese embedding quality far above the multilingual MiniLM.
                    wasmModelId: "Xenova/bge-small-zh-v1.5",
                    wasmDtype: "q8",
                },
                { workerSource },
            );
        }

        const cfg: EmbeddingSettings = providerType === "openai-compatible"
            ? {
                providerType: "openai-compatible",
                openaiUrl: this.settings.ollamaUrl,
                openaiModel: this.settings.ollamaModel,
                apiKey: this.settings.apiKey || undefined,
            }
            : {
                providerType: "ollama",
                ollamaUrl: this.settings.ollamaUrl,
                ollamaModel: this.settings.ollamaModel,
                apiKey: this.settings.apiKey || undefined,
            };

        return createProvider(cfg, { httpFetch });
    }

    /** Tear down old provider/store, build new from current settings. Used after Settings save. */
    async reloadBackends(): Promise<void> {
        const oldProvider = this.provider;
        let newProvider: EmbeddingProvider | null = null;
        try {
            newProvider = await this.buildProvider();
            this.provider = newProvider;
            // `this.indexer` is undefined when the original backend init failed
            // (try/catch in onload). Skip the setBackends call so reloadBackends
            // doesn't throw before the user has a chance to fix the underlying
            // issue and reload the plugin.
            if (this.store && this.indexer) {
                this.indexer.setBackends(this.store, newProvider);
            }
        } catch (err) {
            // Roll back a partial swap (buildProvider OK but setBackends threw):
            // restore oldProvider as live, dispose the orphan newProvider.
            if (newProvider && this.provider === newProvider) {
                this.provider = oldProvider;
                newProvider.dispose();
            }
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`vault-curate: provider switch failed — ${msg}`, 10000);
            throw err;
        }
        // Swap succeeded; safe to dispose old.
        oldProvider?.dispose();
    }
    async loadSettings() {
        const raw: unknown = await this.loadData();
        // data.json should always parse to an object. If a user (or a tool
        // crash) left it in a non-object shape, back the broken file up so
        // they can inspect it instead of silently overwriting on the next
        // saveData, then fall back to defaults.
        if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
            console.warn("vault-curate: data.json is not an object — using defaults. Got:", typeof raw);
            await this.backupCorruptDataJson(raw);
        }
        const data = (raw && typeof raw === "object" && !Array.isArray(raw))
            ? raw as Partial<VaultSearchData>
            : null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);

        // Phase 4 (004 rebrand) chunk tuning migration: v0.3 default 1000/200
        // is too small for bge-small-zh WASM throughput in Obsidian's Electron
        // worker. Force-upgrade users still on the old default.
        if (this.settings.chunkSize === 1000 && this.settings.chunkOverlap === 200) {
            this.settings.chunkSize = 2000;
            this.settings.chunkOverlap = 100;
        }

        // Defend against data.json tampering / partial load: clamp topResults
        // like the UI onChange handler does. NaN / null / non-positive falls
        // back to default; values above 100 are capped to prevent OOM during
        // searchHybrid's full-chunk cosine sweep.
        const tr = Number(this.settings.topResults);
        this.settings.topResults = Number.isFinite(tr) && tr > 0
            ? Math.min(Math.trunc(tr), 100)
            : DEFAULT_SETTINGS.topResults;

        // Phase 8 (004 rebrand): strip legacy v0.3.x fields that were carried
        // along by the loose Object.assign spread. Avoids stale `chunkingMode`,
        // `minDescLength`, and embedded `index` chunks polluting data.json.
        const settingsAny = this.settings as unknown as Record<string, unknown>;
        delete settingsAny.chunkingMode;
        delete settingsAny.minDescLength;
        delete settingsAny.index;

        await this.saveData({ settings: this.settings } as VaultSearchData);
    }

    async saveSettings() {
        await this.saveData({ settings: this.settings } as VaultSearchData);
    }

    /** Snapshot a malformed data.json before defaults overwrite it. Best-effort. */
    private async backupCorruptDataJson(raw: unknown): Promise<void> {
        try {
            const dir = this.manifest.dir;
            if (!dir) return;
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            // 6-char random suffix so two corrupt loads in the same ms (or
            // a manifest.dir-undefined retry loop) don't overwrite each
            // other's evidence. Math.random is enough — this is forensics,
            // not crypto.
            const rand = Math.random().toString(36).slice(2, 8);
            const path = normalizePath(`${dir}/data.corrupt-${stamp}-${rand}.json`);
            const payload = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
            await this.app.vault.adapter.write(path, payload);
            console.warn(`vault-curate: backed up corrupt data.json to ${path}`);
        } catch (err) {
            console.warn("vault-curate: failed to back up corrupt data.json", err);
        }
    }
}
