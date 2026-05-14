/**
 * Indexer — SQLite-backed vault indexer for vault-curate (Phase 4 of 004 rebrand).
 *
 * Design rationale: see openspec/changes/004-vault-curate-rebrand/design.md D2 + D3 + D4.
 *
 * Pipeline per .md file:
 *   1. read content + frontmatter (description / tags / tier inputs)
 *   2. body = stripFrontmatter; chunks = splitChunks(body, title, settings)
 *   3. chunkVecs = await provider.embed(chunks.map(c => c.content))
 *   4. bodyVec = meanPool(chunkVecs)
 *   5. store.upsertNote(...) + store.upsertChunks(...)
 *
 * Embedding pool only contains chunk vectors (NOT title or description).
 * Title is stored as plain text for D6 fuzzy search; description for UI preview.
 *
 * Provider switch detection (Phase 3 dogfood gap fix):
 *   On every scanVault entry, compare meta.embedding_model_id with provider.modelId.
 *   Mismatch → clearAllData() + full re-index. Prevents silent search corruption
 *   when user changes embedding model without mtime change on existing notes.
 */
import { Notice, TFile } from "obsidian";
import type VaultSearchPlugin from "./main";
import { SQLiteStore } from "./storage/SQLiteStore";
import type { EmbeddingProvider } from "./embedding";
import { splitChunks } from "./indexer/chunker";
import { meanPool } from "./utils/meanPool";
import { stripFrontmatter } from "./utils";
import { TOKENIZER_VERSION } from "./storage/cjkTokenize";
import { t } from "./i18n";

const EMBED_BATCH_SIZE = 8;
const PROGRESS_STEP = 1;
// runSemantic does a full-table cosine sweep. Past this chunk count the
// per-query latency creeps above a few seconds on average hardware, so we
// warn the user once at rebuild time rather than per-search.
const LARGE_VAULT_CHUNK_THRESHOLD = 15000;

export class Indexer {
    indexing = false;
    private emptySkippedCount = 0;

    constructor(
        private plugin: VaultSearchPlugin,
        private store: SQLiteStore,
        private provider: EmbeddingProvider,
    ) {}

    /** Replace the active SQLiteStore/provider (used by Settings provider-switch flow). */
    setBackends(store: SQLiteStore, provider: EmbeddingProvider): void {
        this.store = store;
        this.provider = provider;
    }

    shouldExclude(path: string): boolean {
        const configDir = this.plugin.app.vault.configDir;
        if (path.startsWith(configDir + "/") || path === configDir) return true;
        return this.plugin.settings.excludePatterns.some(p => path.includes(p));
    }

    private getMarkdownFiles(): TFile[] {
        return this.plugin.app.vault
            .getMarkdownFiles()
            .filter(f => !this.shouldExclude(f.path));
    }

    private extractTitle(file: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        let title = String(
            cache?.frontmatter?.title ??
            cache?.headings?.find(h => h.level === 1)?.heading ??
            file.basename
        );
        // Strip wikilink syntax: [[path/name]] → name, [[name|alias]] → alias
        if (typeof title === "string" && title.startsWith("[[") && title.endsWith("]]")) {
            title = title.slice(2, -2);
            const pipeIdx = title.indexOf("|");
            if (pipeIdx >= 0) {
                title = title.slice(pipeIdx + 1);
            } else {
                const slashIdx = title.lastIndexOf("/");
                if (slashIdx >= 0) title = title.slice(slashIdx + 1);
            }
        }
        return title;
    }

    private extractDescription(file: TFile): string | null {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter as Record<string, unknown> | undefined;
        const desc = fm?.description;
        return typeof desc === "string" && desc.length > 0 ? desc : null;
    }

    /** Build a Set of file paths that have at least one incoming link (O(N) once). */
    private buildIncomingSet(): Set<string> {
        const set = new Set<string>();
        const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks;
        for (const [src, targets] of Object.entries(resolvedLinks)) {
            for (const path of Object.keys(targets)) {
                if (path !== src) set.add(path);
            }
        }
        return set;
    }

    private computeTier(file: TFile, incomingSet: Set<string>): "hot" | "cold" {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const hasOutgoing = (cache?.links?.length ?? 0) > 0 || (cache?.embeds?.length ?? 0) > 0;
        const hasIncoming = incomingSet.has(file.path);

        const fm = cache?.frontmatter as Record<string, unknown> | undefined;
        const created = fm?.created;
        const createdTs = (typeof created === "string" || typeof created === "number")
            ? new Date(created).getTime()
            : file.stat.ctime;
        const hotMs = this.plugin.settings.hotDays * 24 * 60 * 60 * 1000;
        const isRecent = Date.now() - createdTs < hotMs;

        return (hasOutgoing || hasIncoming || isRecent) ? "hot" : "cold";
    }

    /**
     * Full vault re-index. Wipes existing chunks/notes, re-embeds everything.
     * Always called after provider switch or on user demand.
     */
    async rebuild(): Promise<void> {
        if (this.store.isDisposed) return;
        await this.ensureProviderReady();
        if (this.store.isDisposed) return;
        this.store.clearAllData();
        this.emptySkippedCount = 0;

        const files = this.getMarkdownFiles();
        if (files.length === 0) {
            new Notice(t.noticeIndexDone(0, 0, 0, 0), 5000);
            return;
        }

        const incomingSet = this.buildIncomingSet();
        const progress = new Notice(t.noticeIndexing(0, files.length), 0);

        let done = 0;
        let failed = 0;
        let hot = 0;
        let cold = 0;
        for (const file of files) {
            const ok = await this.indexOne(file, incomingSet);
            if (!ok) failed++;
            else {
                const tier = this.computeTier(file, incomingSet);
                if (tier === "hot") hot++;
                else cold++;
            }
            done++;
            if (done % PROGRESS_STEP === 0 || done === files.length) {
                progress.setMessage(t.noticeIndexing(done, files.length));
                await new Promise(r => window.setTimeout(r, 0));
            }
        }

        progress.hide();
        this.writeIndexMeta();
        await this.store.flush();

        new Notice(t.noticeIndexDone(done - failed, hot, cold, failed), 10000);
        if (this.emptySkippedCount > 0) {
            new Notice(t.noticeEmptySkipped(this.emptySkippedCount), 6000);
        }
        const chunkCount = this.store.countChunks();
        if (chunkCount > LARGE_VAULT_CHUNK_THRESHOLD) {
            new Notice(t.noticeLargeVault(chunkCount), 10000);
        }
        console.debug(`vault-curate: rebuild complete — ${done - failed} notes (${failed} failed, ${this.emptySkippedCount} empty, ${chunkCount} chunks)`);
    }

    /**
     * Incremental update.
     *   - If provider.modelId differs from stored meta, falls through to rebuild().
     *   - Otherwise: re-index notes with mtime > stored mtime, delete vanished notes.
     */
    async update(): Promise<void> {
        if (this.store.isDisposed) return;
        await this.ensureProviderReady();
        if (this.store.isDisposed) return;
        this.emptySkippedCount = 0;

        // Trigger rebuild when:
        //   - has an existing index (last_indexed_at present), AND
        //   - tokenizer version doesn't match (null = pre-r2 index that never
        //     wrote the key; mismatch = real upgrade)
        // Skip for fresh installs (no last_indexed_at) so the first scan isn't
        // wasted on "rebuild" against an empty store.
        const storedTokenizer = this.store.getMeta("cjk_tokenizer_version");
        const hasIndex = !!this.store.getMeta("last_indexed_at");
        if (hasIndex && storedTokenizer !== TOKENIZER_VERSION) {
            new Notice(
                `vault-curate: tokenizer upgraded (${storedTokenizer ?? "v1"} → ${TOKENIZER_VERSION}). Rebuilding index...`,
                8000,
            );
            await this.rebuild();
            return;
        }

        const storedModel = this.store.getMeta("embedding_model_id");
        if (storedModel && storedModel !== this.provider.modelId) {
            new Notice(
                `vault-curate: embedding model changed (${storedModel} → ${this.provider.modelId}). Rebuilding index...`,
                8000,
            );
            await this.rebuild();
            return;
        }

        const files = this.getMarkdownFiles();
        const incomingSet = this.buildIncomingSet();
        const currentPaths = new Set(files.map(f => f.path));

        // Detect stale notes (renamed / deleted) by scanning stored body_vecs.
        const storedPaths = Array.from(this.store.getAllBodyVecs().keys());
        for (const path of storedPaths) {
            if (!currentPaths.has(path)) {
                this.store.deleteNote(path);
            }
        }

        // Filter to notes needing re-embed: missing in store OR mtime newer.
        const toReindex: TFile[] = [];
        for (const file of files) {
            const stored = this.store.getNote(file.path);
            if (!stored || stored.mtime !== file.stat.mtime) {
                toReindex.push(file);
            }
        }

        if (toReindex.length === 0) {
            // Tiers may still need refresh because resolvedLinks may have changed.
            // Cheap pass: re-compute and upsert with same body_vec.
            for (const file of files) {
                const stored = this.store.getNote(file.path);
                if (!stored) continue;
                const newTier = this.computeTier(file, incomingSet);
                if (newTier !== stored.tier) {
                    this.store.upsertNote({ ...stored, tier: newTier });
                }
            }
            await this.store.flush();
            new Notice(t.noticeUpToDate);
            return;
        }

        const progress = new Notice(t.noticeIndexing(0, toReindex.length), 0);
        let done = 0;
        let failed = 0;
        for (const file of toReindex) {
            const ok = await this.indexOne(file, incomingSet);
            if (!ok) failed++;
            done++;
            if (done % PROGRESS_STEP === 0 || done === toReindex.length) {
                progress.setMessage(t.noticeIndexing(done, toReindex.length));
                await new Promise(r => window.setTimeout(r, 0));
            }
        }
        progress.hide();

        // Recompute all tiers (incoming links may have shifted globally).
        for (const file of files) {
            const stored = this.store.getNote(file.path);
            if (!stored) continue;
            const newTier = this.computeTier(file, incomingSet);
            if (newTier !== stored.tier) {
                this.store.upsertNote({ ...stored, tier: newTier });
            }
        }

        this.writeIndexMeta();
        await this.store.flush();

        const total = files.length;
        const hot = files
            .map(f => this.store.getNote(f.path)?.tier)
            .filter(t => t === "hot").length;
        new Notice(t.noticeUpdated(done - failed, total, hot), 10000);
        if (this.emptySkippedCount > 0) {
            new Notice(t.noticeEmptySkipped(this.emptySkippedCount), 6000);
        }
    }

    async indexSingleFile(file: TFile): Promise<void> {
        if (this.store.isDisposed) return;
        await this.ensureProviderReady();
        if (this.store.isDisposed) return;
        const incomingSet = this.buildIncomingSet();
        await this.indexOne(file, incomingSet);
        this.writeIndexMeta();
    }

    removeNote(path: string): void {
        this.store.deleteNote(path);
    }

    async renameNote(oldPath: string, newPath: string, file: TFile): Promise<void> {
        // SQLite has no atomic rename across primary key, so we re-index the file
        // under the new path then delete the old row. Cheaper than a full re-embed
        // would be a row-level update, but renames are rare enough that this is fine.
        this.store.deleteNote(oldPath);
        await this.indexSingleFile(file);
    }

    /** Embed one file end-to-end. Returns false on failure (logged). */
    private async indexOne(file: TFile, incomingSet: Set<string>): Promise<boolean> {
        if (this.store.isDisposed) return false;
        const t0 = Date.now();
        try {
            const content = await this.plugin.app.vault.cachedRead(file);
            const fullBody = stripFrontmatter(content);
            // Cap per-note indexing cost: huge files (e.g. embedded PDFs,
            // financial-report dumps) would otherwise dominate the total
            // rebuild time. The dropped tail is unsearchable, which is a
            // worthwhile trade for keeping the worst-case file under a few
            // seconds. Phase 8 Settings UI will expose this knob.
            const cap = this.plugin.settings.maxIndexableChars;
            const body = cap > 0 && fullBody.length > cap ? fullBody.slice(0, cap) : fullBody;
            if (fullBody.length > body.length) {
                console.debug(`vault-curate: ${file.path} truncated ${fullBody.length} → ${body.length} chars`);
            }
            const title = this.extractTitle(file);
            const description = this.extractDescription(file);
            const tier = this.computeTier(file, incomingSet);

            const chunks = splitChunks(body, title, {
                chunkSize: this.plugin.settings.chunkSize,
                chunkOverlap: this.plugin.settings.chunkOverlap,
            });
            console.debug(`vault-curate: indexing ${file.path} — ${chunks.length} chunks (${body.length} chars)`);

            // Embed in mini-batches so very long notes don't blow request size.
            const chunkVecs: Float32Array[] = [];
            for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
                if (this.store.isDisposed) return false;
                const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
                const tBatch = Date.now();
                const vecs = await this.provider.embed(batch.map(c => c.content));
                console.debug(`vault-curate: embedded batch of ${batch.length} (${Date.now() - tBatch}ms)`);
                chunkVecs.push(...vecs);
            }

            if (this.store.isDisposed) return false;
            if (chunkVecs.length === 0) {
                console.warn(`vault-curate: empty body, no chunks for ${file.path}`);
                this.emptySkippedCount++;
                return false;
            }

            const bodyVec = meanPool(chunkVecs);

            this.store.upsertNote({
                path: file.path,
                mtime: file.stat.mtime,
                title,
                description,
                tier,
                bodyVec,
                bodyDim: bodyVec.length,
                indexedAt: Date.now(),
            });

            this.store.upsertChunks(file.path, chunks.map((c, i) => ({
                notePath: file.path,
                chunkIndex: c.chunkIndex,
                content: c.content,
                vec: chunkVecs[i],
            })));

            console.debug(`vault-curate: ${file.path} indexed in ${Date.now() - t0}ms`);
            return true;
        } catch (err) {
            console.warn(`vault-curate: failed to index ${file.path} after ${Date.now() - t0}ms`, err);
            return false;
        }
    }

    private async ensureProviderReady(): Promise<void> {
        if (await this.provider.isReady()) return;
        console.debug(`vault-curate: warming up ${this.provider.displayName}...`);
        const t0 = Date.now();
        await this.provider.warmup();
        console.debug(`vault-curate: warmup done in ${Date.now() - t0}ms, dim=${this.provider.dimension}, modelId=${this.provider.modelId}`);
    }

    private writeIndexMeta(): void {
        this.store.setMeta("embedding_provider", this.provider.providerType);
        this.store.setMeta("embedding_model_id", this.provider.modelId);
        this.store.setMeta("embedding_dim", String(this.provider.dimension));
        this.store.setMeta("last_indexed_at", new Date().toISOString());
        this.store.setMeta("cjk_tokenizer_version", TOKENIZER_VERSION);
        // Sticky flag: once we've ever finished a rebuild, auto-index on
        // file events stays enabled even if clearAllData wipes the four
        // index-state meta keys (e.g. mid-provider-switch crash).
        this.store.setMeta("bootstrapped", "1");
    }
}
