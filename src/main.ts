import { normalizePath, Notice, Plugin, TFile, requestUrl } from "obsidian";
import { SQLiteStore, type PersistAdapter } from "./storage/SQLiteStore";
import {
    createProvider,
    type EmbeddingProvider,
    type HttpFetch,
    type ProviderType,
} from "./embedding";
import {
    VaultSearchData,
    VaultSearchDataLegacy,
    VaultSearchSettings,
    VaultSearchIndex,
    DEFAULT_SETTINGS,
} from "./types";
import { Indexer } from "./indexer";
import { SearchModal } from "./searcher";
import { SearchView, VIEW_TYPE_SEARCH } from "./search-view";
import { VaultSearchSettingTab } from "./settings";
import { searchNoteScore } from "./utils";
import { DescriptionGenerator } from "./description-generator";
import { t } from "./i18n";

export default class VaultSearchPlugin extends Plugin {
    settings!: VaultSearchSettings;
    index: VaultSearchIndex | null = null;
    indexer!: Indexer;
    descGenerator!: DescriptionGenerator;
    private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    async onload() {
        await this.loadSettings();
        this.indexer = new Indexer(this);
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
                if (!this.index || Object.keys(this.index.notes).length === 0) {
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
                if (!file || !this.index) return false;
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

        this.addCommand({
            id: "desc-preview",
            name: t.cmdDescPreview,
            callback: () => this.descGenerator.preview(),
        });

        this.addCommand({
            id: "desc-apply",
            name: t.cmdDescApply,
            callback: () => this.descGenerator.apply(),
        });

        this.addCommand({
            id: "global-discover",
            name: t.cmdGlobalDiscover,
            callback: () => void this.openGlobalDiscover(),
        });

        this.addCommand({
            id: "generate-moc-grouped",
            name: t.cmdGenerateMocGrouped,
            checkCallback: (checking) => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
                const view = leaf?.view as SearchView | undefined;
                const results = view?.getCurrentResults() ?? [];
                if (results.length < 5) return false;
                if (checking) return true;
                void view!.generateMocGroupedFlow();
                return true;
            },
        });

        // Active Discovery: file-open listener
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (!file || !this.index) return;
                this.onActiveFileChange(file);
            })
        );

        // Register vault events for auto-indexing
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

        // Settings tab
        this.addSettingTab(new VaultSearchSettingTab(this.app, this));

        // ─── Phase 1 (004 rebrand) — Worker boot probe dev command ───
        // Verifies that the bundled worker.js can be loaded + Web Worker boots
        // in the Obsidian Electron renderer environment. Removed in Phase 3
        // (Task 3.3) when real WasmEmbeddingProvider takes over worker comms.
        this.addCommand({
            id: "dev-worker-probe",
            name: "[004 dev] Phase 1 worker boot probe",
            callback: () => void this.dev004WorkerProbe(),
        });

        // ─── Phase 2 (004 rebrand) — SQLite storage probe dev command ───
        // Verifies sql.js + FTS5 + Float32Array round-trip in Obsidian Electron.
        this.addCommand({
            id: "dev-sqlite-probe",
            name: "[004 dev] Phase 2 SQLite probe",
            callback: () => void this.dev004SqliteProbe(),
        });

        // ─── Phase 3 (004 rebrand) — Embedding provider probe (per type) ───
        this.addCommand({
            id: "dev-wasm-embed-probe",
            name: "[004 dev] Phase 3 WASM embed probe (bge-base-zh q8)",
            callback: () => void this.dev004EmbedProbe('wasm'),
        });
        this.addCommand({
            id: "dev-ollama-embed-probe",
            name: "[004 dev] Phase 3 Ollama embed probe",
            callback: () => void this.dev004EmbedProbe('ollama'),
        });
        this.addCommand({
            id: "dev-openai-embed-probe",
            name: "[004 dev] Phase 3 OpenAI-compatible embed probe",
            callback: () => void this.dev004EmbedProbe('openai-compatible'),
        });

        console.debug("Vault Search loaded");
    }

    /**
     * Phase 3 dogfood: instantiate one of the three providers, warmup, embed
     * 3 Chinese sample texts + 1 English, verify dimension + ranking sanity.
     */
    private async dev004EmbedProbe(type: ProviderType): Promise<void> {
        const log = (msg: string) => console.log(`[004 embed-probe ${type}]`, msg);
        let provider: EmbeddingProvider | null = null;
        try {
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

            let workerSource = '';
            if (type === 'wasm') {
                const manifestDir = this.manifest.dir;
                if (!manifestDir) throw new Error('manifest.dir undefined');
                const workerPath = normalizePath(`${manifestDir}/worker.js`);
                if (!(await this.app.vault.adapter.exists(workerPath))) {
                    throw new Error(`worker.js not found at ${workerPath}`);
                }
                workerSource = await this.app.vault.adapter.read(workerPath);
                log(`worker.js loaded (${workerSource.length} bytes)`);
            }

            const cfg = (() => {
                if (type === 'wasm') {
                    return {
                        providerType: 'wasm' as const,
                        wasmModelId: 'Xenova/bge-base-zh',
                        wasmDtype: 'q8' as const,
                    };
                }
                if (type === 'ollama') {
                    const url = this.settings?.ollamaUrl || 'http://localhost:11434';
                    const model = this.settings?.ollamaModel || 'bge-m3';
                    return { providerType: 'ollama' as const, ollamaUrl: url, ollamaModel: model };
                }
                const url = this.settings?.ollamaUrl || 'http://localhost:11434';
                const model = this.settings?.ollamaModel || 'text-embedding-3-small';
                return {
                    providerType: 'openai-compatible' as const,
                    openaiUrl: url,
                    openaiModel: model,
                    apiKey: undefined,
                };
            })();

            provider = createProvider(cfg, { workerSource, httpFetch });
            log(`built provider: ${provider.displayName}`);

            const startWarm = Date.now();
            await provider.warmup((loaded, total, phase) => {
                if (total > 0 && loaded === total) {
                    log(`progress: ${phase ?? ''} complete (${total} bytes)`);
                }
            });
            log(`warmup done in ${Date.now() - startWarm}ms, dim=${provider.dimension}, modelId=${provider.modelId}`);

            const samples = [
                '主公在 Obsidian 裡寫了關於 LLM 和 RAG 的筆記',
                '靈修筆記：聖經中提到智慧的價值勝過珠寶',
                'TypeScript Obsidian plugin development with esbuild bundler',
            ];
            const startEmbed = Date.now();
            const vecs = await provider.embed(samples);
            const embedMs = Date.now() - startEmbed;
            log(`embed ${samples.length} texts in ${embedMs}ms (${(embedMs / samples.length).toFixed(0)}ms/text)`);
            for (let i = 0; i < vecs.length; i++) {
                if (vecs[i].length !== provider.dimension) {
                    throw new Error(`vec[${i}].length = ${vecs[i].length}, expected ${provider.dimension}`);
                }
            }

            // Ranking sanity: query 'Karpathy LLM' should match sample 0 best
            const [qVec] = await provider.embed(['Karpathy 對 LLM 的看法']);
            const cos = (a: Float32Array, b: Float32Array): number => {
                let dot = 0, na = 0, nb = 0;
                for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
                return dot / (Math.sqrt(na) * Math.sqrt(nb));
            };
            const scored = vecs.map((v, idx) => ({ idx, sim: cos(qVec, v) }))
                .sort((a, b) => b.sim - a.sim);
            log(`ranking: ${JSON.stringify(scored.map(s => ({ idx: s.idx, sim: Number(s.sim.toFixed(3)) })))}`);
            if (scored[0].idx !== 0) {
                throw new Error(`expected sample 0 ('LLM RAG') to rank first, got idx ${scored[0].idx}`);
            }

            new Notice(
                `[004 embed-probe ${type}] ✅ dim=${provider.dimension}, ${samples.length} embeds in ${embedMs}ms, ranking OK`,
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`[004 embed-probe ${type}] ❌ ${msg}`);
            console.error(`[004 embed-probe ${type}]`, err);
        } finally {
            provider?.dispose();
        }
    }

    /**
     * Phase 2 dogfood: open SQLite db, write a synthetic note + chunks, query via FTS5
     * (with CJK trigram tokenisation), verify Float32Array round-trip.
     */
    private async dev004SqliteProbe(): Promise<void> {
        const log = (msg: string) => console.log("[004 sqlite-probe]", msg);
        try {
            const manifestDir = this.manifest.dir;
            if (!manifestDir) {
                new Notice("[004 sqlite-probe] manifest.dir is undefined");
                return;
            }
            const dbPath = normalizePath(`${manifestDir}/dev-probe.sqlite`);
            // Wipe previous probe artifact for a clean run.
            if (await this.app.vault.adapter.exists(dbPath)) {
                await this.app.vault.adapter.remove(dbPath);
            }

            const adapter: PersistAdapter = {
                read: async (path) => {
                    const exists = await this.app.vault.adapter.exists(path);
                    if (!exists) return null;
                    const buf = await this.app.vault.adapter.readBinary(path);
                    return new Uint8Array(buf);
                },
                write: async (path, bytes) => {
                    const ab = bytes.buffer.slice(
                        bytes.byteOffset,
                        bytes.byteOffset + bytes.byteLength,
                    ) as ArrayBuffer;
                    await this.app.vault.adapter.writeBinary(path, ab);
                },
                exists: (path) => this.app.vault.adapter.exists(path),
            };

            log(`opening db at ${dbPath}`);
            const store = await SQLiteStore.open(adapter, dbPath);

            // schema_version should be auto-set on first open
            const ver = store.getMeta("schema_version");
            log(`schema_version = ${ver}`);
            if (ver !== "1") throw new Error(`expected schema_version '1', got ${ver}`);

            // Round-trip a note with a 768-dim vector
            const dim = 768;
            const bodyVec = new Float32Array(dim);
            for (let i = 0; i < dim; i++) bodyVec[i] = Math.sin(i / 50);
            store.upsertNote({
                path: "probe/test.md",
                mtime: Date.now(),
                title: "主公的測試筆記",
                description: "測試 SQLite 是否能存中文 description",
                tier: "hot",
                bodyVec,
                bodyDim: dim,
                indexedAt: Date.now(),
            });
            const got = store.getNote("probe/test.md");
            if (!got) throw new Error("getNote returned null");
            if (got.title !== "主公的測試筆記") {
                throw new Error(`title mismatch: ${got.title}`);
            }
            if (got.bodyVec.length !== dim) {
                throw new Error(`bodyVec.length = ${got.bodyVec.length}`);
            }
            // Sample a few values
            for (let i = 0; i < 10; i++) {
                if (Math.abs(got.bodyVec[i] - bodyVec[i]) > 1e-6) {
                    throw new Error(`vec[${i}] mismatch: ${got.bodyVec[i]} vs ${bodyVec[i]}`);
                }
            }
            log("note round-trip OK");

            // Round-trip chunks + FTS5 BM25 search
            const chunks = [
                { notePath: "probe/test.md", chunkIndex: 0, content: "主公在 Obsidian 寫關於 LLM 的筆記", vec: bodyVec },
                { notePath: "probe/test.md", chunkIndex: 1, content: "今天測試 sql.js 的 FTS5 中文 trigram", vec: bodyVec },
            ];
            store.upsertChunks("probe/test.md", chunks);
            log(`inserted ${chunks.length} chunks + FTS rows`);

            // Search for a CJK term (raw query; searchBM25 tokenises internally)
            const q1 = "LLM 筆記";
            const hits1 = store.searchBM25(q1, 10);
            log(`bm25('${q1}') -> ${hits1.length} hits: ${JSON.stringify(hits1)}`);
            if (hits1.length === 0) throw new Error("expected at least 1 BM25 hit for 'LLM 筆記'");

            // Search for ASCII term
            const q2 = "sql.js";
            const hits2 = store.searchBM25(q2, 10);
            log(`bm25('${q2}') -> ${hits2.length} hits: ${JSON.stringify(hits2)}`);

            // Verify getAllBodyVecs + getAllTitles
            const allBody = store.getAllBodyVecs();
            const allTitles = store.getAllTitles();
            log(`allBodyVecs size = ${allBody.size}, allTitles size = ${allTitles.size}`);

            await store.flush();
            log(`flushed; file exists = ${await adapter.exists(dbPath)}`);

            // Clean up
            await store.dispose();
            await this.app.vault.adapter.remove(dbPath);

            new Notice(
                `[004 sqlite-probe] ✅ schema v${ver}, note round-trip OK, BM25 hits = ${hits1.length} + ${hits2.length}`,
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`[004 sqlite-probe] ❌ ${msg}`);
            console.error("[004 sqlite-probe]", err);
        }
    }

    /** Phase 1 dogfood: load worker.js from plugin folder, spawn Web Worker, expect 'ready'. */
    private async dev004WorkerProbe(): Promise<void> {
        try {
            const manifestDir = this.manifest.dir;
            if (!manifestDir) {
                new Notice("[004 probe] manifest.dir is undefined");
                return;
            }
            const workerPath = normalizePath(`${manifestDir}/worker.js`);
            const exists = await this.app.vault.adapter.exists(workerPath);
            if (!exists) {
                new Notice(`[004 probe] worker.js not found at ${workerPath}`);
                return;
            }
            const workerSource = await this.app.vault.adapter.read(workerPath);
            const blob = new Blob([workerSource], { type: "application/javascript" });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);
            const readyP = new Promise<string>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("timeout after 5s")), 5000);
                worker.onmessage = (e) => {
                    clearTimeout(timer);
                    resolve(JSON.stringify(e.data));
                };
                worker.onerror = (e) => {
                    clearTimeout(timer);
                    reject(new Error(e.message || "worker error"));
                };
            });
            const msg = await readyP;
            worker.terminate();
            URL.revokeObjectURL(url);
            new Notice(`[004 probe] ✅ Worker booted. First message: ${msg}`);
            console.log("[004 probe] worker.js size:", workerSource.length, "bytes");
            console.log("[004 probe] first message:", msg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`[004 probe] ❌ ${msg}`);
            console.error("[004 probe]", err);
        }
    }

    onunload() {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        if (this.activeDiscoverTimer) clearTimeout(this.activeDiscoverTimer);
        console.debug("Vault Search unloaded");
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

    private activeDiscoverTimer: ReturnType<typeof setTimeout> | null = null;
    private lastDiscoverPath: string | null = null;

    private onActiveFileChange(file: TFile) {
        if (file.extension !== "md") return;
        if (file.path === this.lastDiscoverPath) return;
        if (this.activeDiscoverTimer) clearTimeout(this.activeDiscoverTimer);
        this.activeDiscoverTimer = setTimeout(() => {
            this.lastDiscoverPath = file.path;
            const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
            if (!leaf) return;
            const view = leaf.view as SearchView;
            if (view.isDiscoverTabActive()) {
                view.discoverForFile(file);
            }
        }, 500);
    }

    private async openGlobalDiscover() {
        if (!this.index) {
            new Notice(t.discoverNoIndex);
            return;
        }
        await this.activateView();
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
        if (!leaf) return;
        const view = leaf.view as SearchView;
        view.showGlobalDiscover();
    }

    // ── Find Similar ─────────────────────────────────

    async findSimilar(file: TFile) {
        if (!this.index) {
            new Notice(t.noticeIndexEmpty);
            return;
        }
        const entry = this.index.notes[file.path];
        if (!entry || !entry.embedding || entry.embedding.length === 0) {
            new Notice(t.notIndexed);
            return;
        }

        // Collect all query vectors: main embedding + chunks
        const queryVecs: number[][] = [entry.embedding];
        if (entry.chunks) {
            for (const chunk of entry.chunks) {
                if (chunk.length > 0) queryVecs.push(chunk);
            }
        }

        const results: import("./types").SearchResult[] = [];
        for (const [path, other] of Object.entries(this.index.notes)) {
            if (path === file.path) continue;
            let maxScore = 0;
            for (const qv of queryVecs) {
                const s = searchNoteScore(qv, other);
                if (s > maxScore) maxScore = s;
            }
            if (maxScore >= this.settings.minScore) {
                results.push({ path, title: other.title, tags: other.tags, score: maxScore, tier: other.tier });
            }
        }
        results.sort((a, b) => b.score - a.score);
        const topResults = results.slice(0, this.settings.topResults);

        if (topResults.length === 0) {
            new Notice(t.noSimilar);
            return;
        }

        // Show in sidebar
        await this.activateView();
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH)[0];
        if (leaf) {
            const view = leaf.view as SearchView;
            view.showResults(topResults, t.similarTo(entry.title));
        }
    }

    async rebuildIndex() {
        if (this.indexer.indexing) { new Notice(t.indexingInProgress); return; }
        this.indexer.indexing = true;
        try {
            await this.indexer.rebuild();
            await this.saveIndex();
        } finally {
            this.indexer.indexing = false;
        }
    }

    async updateIndex() {
        if (this.indexer.indexing) { new Notice(t.indexingInProgress); return; }
        this.indexer.indexing = true;
        try {
            await this.indexer.update();
            await this.saveIndex();
        } finally {
            this.indexer.indexing = false;
        }
    }

    private onFileChange(file: unknown, type: string) {
        if (!this.settings.autoIndex || this.migrating || this.indexer.indexing) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.indexer.shouldExclude(file.path)) return;

        const existing = this.debounceTimers.get(file.path);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(
            file.path,
            setTimeout(() => {
                this.debounceTimers.delete(file.path);
                if (type === "delete") {
                    this.indexer.removeFromIndex(file.path);
                    void this.saveIndex();
                } else {
                    void this.indexer.indexSingleFile(file).then(() => this.saveIndex());
                }
            }, 2000)
        );
    }

    private async onFileRename(file: unknown, oldPath: string) {
        if (!this.settings.autoIndex) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;

        this.indexer.renameInIndex(oldPath, file.path);
        await this.saveIndex();
    }

    private migrating = false;

    private indexPath(): string {
        return normalizePath(
            `${this.app.vault.configDir}/plugins/${this.manifest.id}/index.json`
        );
    }

    async loadSettings() {
        const data = await this.loadData() as Partial<VaultSearchDataLegacy> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);

        // Migration: v0.2.0 stored index in data.json, v0.3.0 uses index.json
        if (data?.index) {
            this.migrating = true;
            this.index = data.index;
            await this.saveIndex();
            await this.saveData({ settings: this.settings } as VaultSearchData);
            this.migrating = false;
        } else {
            this.index = await this.loadIndex();
        }
    }

    private async loadIndex(): Promise<VaultSearchIndex | null> {
        try {
            const raw = await this.app.vault.adapter.read(this.indexPath());
            return JSON.parse(raw) as VaultSearchIndex;
        } catch (e) {
            // File not found is normal (first run), parse error is not
            if (await this.app.vault.adapter.exists(this.indexPath())) {
                console.error("Vault Search: Failed to parse index.json", e);
                new Notice(t.noticeIndexCorrupt);
            }
            return null;
        }
    }

    async saveSettings() {
        await this.saveData({ settings: this.settings } as VaultSearchData);
    }

    async saveIndex() {
        if (!this.index) return;
        await this.app.vault.adapter.write(
            this.indexPath(),
            JSON.stringify(this.index)
        );
    }
}
