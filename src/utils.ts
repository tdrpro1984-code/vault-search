import { App, requestUrl, TFile } from "obsidian";
import type { ApiFormat } from "./types";

export interface OllamaModel {
    name: string;
    sizeGB: number;
    isEmbedding: boolean;
}

export async function fetchOllamaModels(url: string, format: ApiFormat = "ollama"): Promise<OllamaModel[]> {
    try {
        validateServerUrl(url);

        if (format === "openai") {
            const resp = await requestUrl({ url: `${url}/v1/models`, throw: false });
            if (resp.status !== 200) return [];
            const data = resp.json;
            return (data.data ?? []).map((m: { id: string }) => ({
                name: m.id,
                sizeGB: 0,
                isEmbedding: /embed/i.test(m.id),
            }));
        }

        const resp = await requestUrl({ url: `${url}/api/tags`, throw: false });
        if (resp.status !== 200) return [];
        const data = resp.json;
        return (data.models ?? []).map((m: { name: string; size: number }) => ({
            name: m.name,
            sizeGB: m.size / 1e9,
            isEmbedding: /embed/i.test(m.name),
        }));
    } catch {
        return [];
    }
}

export async function checkOllama(url: string): Promise<boolean> {
    try {
        validateServerUrl(url);
        const resp = await requestUrl({ url, throw: false });
        return resp.status === 200;
    } catch {
        return false;
    }
}

export function cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

export function stripFrontmatter(content: string): string {
    if (!content.startsWith("---")) return content;
    const end = content.indexOf("---", 3);
    if (end === -1) return content;
    return content.slice(end + 3).trim();
}

function buildHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    return headers;
}

function truncateError(text: string, max = 200): string {
    return text.length > max ? text.slice(0, max) + "..." : text;
}

export function validateServerUrl(url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only http/https server URLs are supported");
    }
}

export async function embedText(
    text: string,
    url: string,
    model: string,
    format: ApiFormat,
    apiKey?: string,
): Promise<number[]> {
    const results = await embedTexts([text], url, model, format, apiKey);
    return results[0] ?? [];
}

const EMBED_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timeout (${ms / 1000}s)`)), ms);
        }),
    ]);
}

export async function embedTexts(
    texts: string[],
    url: string,
    model: string,
    format: ApiFormat,
    apiKey?: string,
): Promise<number[][]> {
    if (texts.length === 0) return [];
    validateServerUrl(url);

    if (format === "openai") {
        const resp = await withTimeout(requestUrl({
            url: `${url}/v1/embeddings`,
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify({ model, input: texts }),
            throw: false,
        }), EMBED_TIMEOUT_MS, "Embedding");
        if (resp.status !== 200) throw new Error(`API ${resp.status}: ${truncateError(resp.text)}`);
        const data = resp.json;
        // OpenAI returns {data: [{embedding: [...]}, ...]} sorted by index
        return (data.data ?? [])
            .sort((a: {index: number}, b: {index: number}) => a.index - b.index)
            .map((d: {embedding: number[]}) => d.embedding ?? []);
    }

    // Ollama format — supports input as string[]
    const resp = await withTimeout(requestUrl({
        url: `${url}/api/embed`,
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({ model, input: texts }),
        throw: false,
    }), EMBED_TIMEOUT_MS, "Embedding");
    if (resp.status !== 200) throw new Error(`Ollama ${resp.status}: ${truncateError(resp.text)}`);
    const data = resp.json;
    return data.embeddings ?? [];
}

const LLM_TIMEOUT_MS = 60000;

/**
 * Unified LLM JSON request with Ollama and OpenAI-compatible support.
 * The caller supplies a `parse` function that converts the raw content
 * string to T — it may throw on invalid payloads.
 */
export async function requestLlmJson<T>(
    settings: {
        ollamaUrl: string;
        llmModel: string;
        apiFormat: ApiFormat;
        apiKey?: string;
    },
    prompt: string,
    parse: (raw: string) => T,
    opts: { timeoutMs?: number } = {},
): Promise<T> {
    validateServerUrl(settings.ollamaUrl);
    const isOpenAI = settings.apiFormat === "openai";
    const endpoint = isOpenAI
        ? `${settings.ollamaUrl}/v1/chat/completions`
        : `${settings.ollamaUrl}/api/chat`;

    const body = isOpenAI
        ? JSON.stringify({
            model: settings.llmModel,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        })
        : JSON.stringify({
            model: settings.llmModel,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            format: "json",
            think: false,
        });

    const resp = await withTimeout(
        requestUrl({
            url: endpoint,
            method: "POST",
            headers: buildHeaders(settings.apiKey),
            body,
            throw: false,
        }),
        opts.timeoutMs ?? LLM_TIMEOUT_MS,
        "LLM",
    );

    if (resp.status !== 200) {
        throw new Error(`LLM ${resp.status}: ${truncateError(resp.text)}`);
    }

    const data = resp.json;
    const raw = isOpenAI
        ? (data.choices?.[0]?.message?.content ?? "")
        : (data.message?.content ?? "");
    return parse(raw);
}

/**
 * Build an Obsidian wikilink from a note path + display title.
 * Strips `.md` extension, escapes `|` in title to `｜` (fullwidth)
 * so the display alias does not terminate early. Title `[`/`]` are
 * left as-is to preserve v0.3.x byte-for-byte output.
 */
export function toWikilink(path: string, title: string): string {
    const target = path.replace(/\.md$/, "");
    const safeTitle = title.replace(/\|/g, "\uff5c");
    return `[[${target}|${safeTitle}]]`;
}

/**
 * @deprecated Phase 4 (004 rebrand) — superseded by `src/indexer/chunker.ts`.
 * Kept only because searcher.ts / search-view.ts still depend on the v0.3.x
 * `embedText` helper; remove together when Phase 5 rewires those callers to
 * the EmbeddingProvider abstraction.
 */
export function splitChunks(text: string, size: number, overlap: number): string[] {
    if (text.length <= size) return [text];
    if (overlap >= size) overlap = 0;
    const step = size - overlap;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += step) {
        chunks.push(text.slice(i, i + size));
        if (i + size >= text.length) break;
    }
    return chunks;
}

export function computeTitleBoost(query: string, title: string): number {
    const q = query.toLowerCase().trim();
    const t = title.toLowerCase().trim();
    if (!q || !t) return 0;

    // Exact match
    if (q === t) return 0.25;

    // One contains the other (partial title match)
    if (t.includes(q) || q.includes(t)) return 0.15;

    // Word overlap — handles both CJK (single-word titles) and multi-word Latin titles
    const qWords = q.split(/\s+/).filter(Boolean);
    const tWords = t.split(/\s+/).filter(Boolean);
    if (qWords.length > 0 && tWords.length > 0) {
        const matched = qWords.filter(w =>
            tWords.some(tw => tw.includes(w) || w.includes(tw))
        ).length;
        if (matched > 0) return 0.08 * (matched / qWords.length);
    }

    return 0;
}

export function renderResultItem(
    container: HTMLElement,
    result: import("./types").SearchResult,
    app: import("obsidian").App,
) {
    if (result.tier === "cold") container.addClass("is-cold");

    const titleRow = container.createDiv({ cls: "vault-search-title-row" });
    titleRow.createSpan({
        text: result.tier === "cold" ? "\u2744\ufe0f" : "\ud83d\udd25",
        cls: `vault-search-tier vault-search-tier-${result.tier}`,
    });
    titleRow.createSpan({ text: result.title, cls: "vault-search-title" });
    titleRow.createSpan({ text: result.score.toFixed(3), cls: "vault-search-score" });

    const file = app.vault.getAbstractFileByPath(result.path);
    if (file instanceof TFile) {
        void getContentPreview(app, file).then(preview => {
            if (preview && container.isConnected) {
                container.createDiv({ text: preview, cls: "vault-search-desc" });
            }
        });
    }

    const metaRow = container.createDiv({ cls: "vault-search-meta" });
    if (result.tags.length > 0) {
        metaRow.createSpan({ text: result.tags.join(", "), cls: "vault-search-tags" });
    }
    const folder = result.path.substring(0, result.path.lastIndexOf("/"));
    if (folder) {
        metaRow.createSpan({ text: folder, cls: "vault-search-folder" });
    }
}

/** Format a Date as `YYYY-MM-DD HH:MM+TZ:TZ` with the local timezone offset. */
export function formatLocalDateTime(d: Date): string {
    const tzOffset = -d.getTimezoneOffset();
    const sign = tzOffset >= 0 ? "+" : "-";
    const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${date} ${time}${sign}${tzH}:${tzM}`;
}

export async function getContentPreview(app: App, file: TFile, maxChars = 100): Promise<string> {
    const cache = app.metadataCache.getFileCache(file);
    const desc = cache?.frontmatter?.description;
    if (desc) return desc;

    const raw = await app.vault.cachedRead(file);
    let body = stripFrontmatter(raw);
    body = body.replace(/^#+\s+.*\n?/, "").trim();
    if (body.length > maxChars) body = body.slice(0, maxChars) + "…";
    return body;
}
