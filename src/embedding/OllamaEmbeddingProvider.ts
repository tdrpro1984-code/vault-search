/**
 * OllamaEmbeddingProvider — talks to a local Ollama server at /api/embed.
 *
 * Dimension is discovered on first warmup via a probe embed of "_" — Ollama
 * embedding endpoints don't expose model metadata, so the only way to know
 * the vector size is to embed something and measure.
 */
import type {
    EmbeddingProvider,
    HttpFetch,
    ProgressCallback,
    ProviderType,
} from './EmbeddingProvider';

const EMBED_TIMEOUT_MS = 90_000;

export type OllamaProviderConfig = {
    url: string;        // e.g. http://localhost:11434
    model: string;      // e.g. bge-m3, qwen3-embedding
    apiKey?: string;    // optional (Ollama allows reverse-proxy auth)
};

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    readonly providerType: ProviderType = 'ollama';
    readonly displayName: string;
    private _dimension: number | null = null;
    private warmedUp = false;

    constructor(
        private readonly cfg: OllamaProviderConfig,
        private readonly httpFetch: HttpFetch,
    ) {
        this.displayName = `Ollama: ${cfg.model}`;
    }

    get modelId(): string {
        return `ollama:${this.cfg.model}`;
    }

    get dimension(): number {
        if (this._dimension == null) {
            throw new Error('OllamaEmbeddingProvider.dimension accessed before warmup()');
        }
        return this._dimension;
    }

    async warmup(_onProgress?: ProgressCallback): Promise<void> {
        // Probe with a single short text to learn dimension + verify endpoint.
        const vec = (await this.embedInternal(['_']))[0];
        if (!vec || vec.length === 0) {
            throw new Error(
                `Ollama embed probe returned empty vector. Check that model '${this.cfg.model}' is pulled and the endpoint ${this.cfg.url} is reachable.`,
            );
        }
        this._dimension = vec.length;
        this.warmedUp = true;
    }

    async isReady(): Promise<boolean> {
        return this.warmedUp && this._dimension != null;
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        return this.embedInternal(texts);
    }

    private async embedInternal(texts: string[]): Promise<Float32Array[]> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.cfg.apiKey) headers['Authorization'] = `Bearer ${this.cfg.apiKey}`;

        const resp = await withTimeout(
            this.httpFetch({
                url: `${this.cfg.url.replace(/\/+$/, '')}/api/embed`,
                method: 'POST',
                headers,
                body: JSON.stringify({ model: this.cfg.model, input: texts }),
            }),
            EMBED_TIMEOUT_MS,
            'Ollama embed',
        );
        if (resp.status !== 200) {
            throw new Error(`Ollama embed ${resp.status}: ${truncate(resp.text, 200)}`);
        }
        const data = resp.json as { embeddings?: number[][] };
        const arr = data.embeddings ?? [];
        return arr.map((v) => Float32Array.from(v));
    }

    dispose(): void {
        this.warmedUp = false;
        this._dimension = null;
    }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: number;
    return Promise.race([
        p.finally(() => window.clearTimeout(timer)),
        new Promise<never>((_, rej) => {
            timer = window.setTimeout(() => rej(new Error(`${label} timeout (${ms / 1000}s)`)), ms);
        }),
    ]);
}

function truncate(s: string | undefined, n: number): string {
    if (!s) return '';
    return s.length > n ? `${s.slice(0, n)}…` : s;
}
