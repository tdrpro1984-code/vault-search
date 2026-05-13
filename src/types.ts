// ============================================================
// vault-search types
// ============================================================

export type ApiFormat = "ollama" | "openai";
export type EmbeddingProviderType = "wasm" | "ollama" | "openai-compatible";

export interface VaultSearchSettings {
    /** Phase 4 (004 rebrand): which embedding backend to use.
     *  - "wasm"              → built-in Xenova/bge-base-zh q8 (zero-config default)
     *  - "ollama"            → external Ollama (advanced, higher quality)
     *  - "openai-compatible" → external OpenAI-compatible endpoint
     *  Phase 8 will expose this in the Settings UI.
     */
    embeddingProvider: EmbeddingProviderType;
    /** Maximum characters embedded per note. Anything beyond this is dropped
     *  before chunking, capping the worst-case per-note indexing cost. */
    maxIndexableChars: number;
    ollamaUrl: string;
    ollamaModel: string;
    apiFormat: ApiFormat;
    apiKey: string;
    topResults: number;
    minScore: number;
    maxEmbedChars: number;
    hotDays: number;
    searchScope: "hot" | "all" | "cold";
    excludePatterns: string[];
    autoIndex: boolean;
    synonyms: Record<string, string[]>;
    llmModel: string;
    chunkSize: number;
    chunkOverlap: number;
    /** AI curation master switch (design D9). Gates description generation
     *  commands and topic-grouped MOC. Phase 8 will flip the default to false
     *  and add an Onboarding modal; dogfood phase keeps it true so existing
     *  flows stay reachable from the command palette without manual toggling. */
    enableAICuration: boolean;
}

export const DEFAULT_SETTINGS: VaultSearchSettings = {
    embeddingProvider: "wasm",
    maxIndexableChars: 60000,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "qwen3-embedding:0.6b",
    apiFormat: "ollama" as ApiFormat,
    apiKey: "",
    topResults: 10,
    minScore: 0.5,
    maxEmbedChars: 2000,
    hotDays: 90,
    searchScope: "hot",
    excludePatterns: ["_templates/", "templates/", ".trash/", "3_wiki/"],
    autoIndex: true,
    synonyms: {},
    llmModel: "qwen3:1.7b",
    chunkSize: 2000,
    chunkOverlap: 100,
    enableAICuration: true,
};

export interface NoteEntry {
    title: string;
    tags: string[];
    tier: "hot" | "cold";
    mtime: number;
    embedding: number[];
    chunks?: number[][];
}

export interface IndexMeta {
    model: string;
    dim: number;
    indexedAt: string;
    count: number;
}

export interface VaultSearchIndex {
    meta: IndexMeta;
    notes: Record<string, NoteEntry>;
}

/** data.json stores settings only (v0.3.0+). Index is in index.json. */
export interface VaultSearchData {
    settings: VaultSearchSettings;
}

/** Legacy format (v0.2.0): data.json stored both settings and index. */
export interface VaultSearchDataLegacy {
    settings: VaultSearchSettings;
    index: VaultSearchIndex | null;
}

export interface SearchResult {
    path: string;
    title: string;
    tags: string[];
    score: number;
    tier: "hot" | "cold";
}

// ============================================================
// MOC 2.0 (v0.4.0) — topic-grouped Map of Content
// ============================================================

export type MocSizeTier = "ok" | "warn" | "block";

export interface Cluster {
    /** -1 = noise; 0+ = cluster index */
    label: number;
    /** Indices into the source results array (SearchResult[]) */
    noteIndices: number[];
}

export interface NamedCluster extends Cluster {
    title: string;
    intro: string;
    /** true = LLM naming failed, using fallback title/intro */
    isFallback: boolean;
}

export interface MocGroupedResult {
    clusters: NamedCluster[];
    /** Collected noise points; null when HDBSCAN produced none */
    miscellaneous: NamedCluster | null;
    totalNotes: number;
    query: string;
}
