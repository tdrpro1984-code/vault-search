/**
 * WasmEmbeddingProvider — runs transformers.js + Xenova/bge-base-zh inside a
 * Web Worker. The worker source must be supplied by main.ts (read from the
 * plugin folder as a string and passed in via ProviderContext).
 *
 * Dimension is learned from the worker's `ready` message (worker runs a probe
 * embed during init).
 */
import type {
    EmbeddingProvider,
    ProgressCallback,
    ProviderType,
} from './EmbeddingProvider';

export type WasmProviderConfig = {
    modelId: string;     // e.g. 'Xenova/bge-base-zh'
    dtype: 'fp32' | 'fp16' | 'q8' | 'q4';
};

type PendingEmbed = {
    resolve: (vecs: Float32Array[]) => void;
    reject: (err: Error) => void;
};

const EMBED_TIMEOUT_MS = 60_000;

export class WasmEmbeddingProvider implements EmbeddingProvider {
    readonly providerType: ProviderType = 'wasm';
    readonly displayName: string;

    private worker: Worker | null = null;
    private workerUrl: string | null = null;
    private _dimension: number | null = null;
    private initPromise: Promise<void> | null = null;
    private initResolve: (() => void) | null = null;
    private initReject: ((err: Error) => void) | null = null;
    private onProgress?: ProgressCallback;
    private nextEmbedId = 1;
    private readonly pending = new Map<number, PendingEmbed>();
    private warmedUp = false;

    constructor(
        private readonly cfg: WasmProviderConfig,
        private readonly workerSource: string,
    ) {
        this.displayName = `Built-in (${shortModelName(cfg.modelId)}, ${cfg.dtype})`;
        if (!workerSource) {
            throw new Error('WasmEmbeddingProvider requires workerSource (read worker.js).');
        }
    }

    get modelId(): string {
        return `${this.cfg.modelId}@${this.cfg.dtype}`;
    }

    get dimension(): number {
        if (this._dimension == null) {
            throw new Error('WasmEmbeddingProvider.dimension accessed before warmup()');
        }
        return this._dimension;
    }

    async warmup(onProgress?: ProgressCallback): Promise<void> {
        if (this.warmedUp) return;
        if (this.initPromise) return this.initPromise;
        this.onProgress = onProgress;
        this.initPromise = new Promise<void>((resolve, reject) => {
            this.initResolve = resolve;
            this.initReject = reject;
        });
        this.bootWorker();
        return this.initPromise;
    }

    async isReady(): Promise<boolean> {
        return this.warmedUp && this._dimension != null && this.worker != null;
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        if (!this.warmedUp || !this.worker) {
            throw new Error('WasmEmbeddingProvider not warmed up. Call warmup() first.');
        }
        const id = this.nextEmbedId++;
        return new Promise<Float32Array[]>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`WASM embed timeout (${EMBED_TIMEOUT_MS / 1000}s)`));
            }, EMBED_TIMEOUT_MS);
            this.pending.set(id, {
                resolve: (vecs) => {
                    clearTimeout(timer);
                    resolve(vecs);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });
            this.worker!.postMessage({ type: 'embed', id, texts });
        });
    }

    dispose(): void {
        if (this.worker) {
            try {
                this.worker.postMessage({ type: 'dispose' });
            } catch {
                /* ignore */
            }
            this.worker.terminate();
            this.worker = null;
        }
        if (this.workerUrl) {
            URL.revokeObjectURL(this.workerUrl);
            this.workerUrl = null;
        }
        this.warmedUp = false;
        this._dimension = null;
        for (const p of this.pending.values()) {
            p.reject(new Error('Provider disposed'));
        }
        this.pending.clear();
        this.initPromise = null;
        this.initResolve = null;
        this.initReject = null;
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    private bootWorker(): void {
        const blob = new Blob([this.workerSource], { type: 'application/javascript' });
        this.workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(this.workerUrl);
        this.worker = worker;

        worker.onmessage = (event: MessageEvent) => this.handleWorkerMessage(event.data);
        worker.onerror = (event: ErrorEvent) => {
            const err = new Error(event.message || 'WASM worker error');
            this.failInit(err);
        };

        worker.postMessage({
            type: 'init',
            modelId: this.cfg.modelId,
            dtype: this.cfg.dtype,
        });
    }

    private handleWorkerMessage(msg: unknown): void {
        const m = msg as
            | { type: 'ready'; dimension: number }
            | { type: 'init-error'; message: string; stack?: string }
            | { type: 'progress'; loaded: number; total: number; phase?: string }
            | { type: 'result'; id: number; vectors: Float32Array[] | null; error?: string };
        if (m.type === 'ready') {
            this._dimension = m.dimension;
            this.warmedUp = true;
            this.initResolve?.();
        } else if (m.type === 'init-error') {
            this.failInit(new Error(`Worker init failed: ${m.message}`));
        } else if (m.type === 'progress') {
            this.onProgress?.(m.loaded, m.total, m.phase);
        } else if (m.type === 'result') {
            const p = this.pending.get(m.id);
            if (!p) return;
            this.pending.delete(m.id);
            if (m.error || !m.vectors) {
                p.reject(new Error(m.error ?? 'embed failed'));
            } else {
                p.resolve(m.vectors);
            }
        }
    }

    private failInit(err: Error): void {
        this.initReject?.(err);
        this.dispose();
    }
}

function shortModelName(modelId: string): string {
    // 'Xenova/bge-base-zh' → 'bge-base-zh'
    const slash = modelId.lastIndexOf('/');
    return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}
