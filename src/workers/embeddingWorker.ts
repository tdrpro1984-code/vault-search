/**
 * Embedding Worker — full transformers.js integration.
 *
 * Boot sequence:
 *   1. Main thread posts `{type:'init', modelId, dtype, wasmBinary}`.
 *   2. Worker configures @huggingface/transformers env (browser cache + ort wasm
 *      binary supplied by main thread) and loads the feature-extraction pipeline.
 *   3. Worker posts `{type:'ready', dimension}` on success or
 *      `{type:'init-error', message, stack}` on failure.
 *   4. During download/load, transformers' progress events are forwarded as
 *      `{type:'progress', loaded, total, phase}`.
 *
 * Embed protocol:
 *   - Main posts `{type:'embed', id, texts}`.
 *   - Worker replies `{type:'result', id, vectors}` (vectors are Float32Array[]).
 *
 * Dispose:
 *   - Main can post `{type:'dispose'}` to release the model.
 *
 * Workarounds for Electron — see esbuild.config.mjs banner (process.release.name
 * patch must run BEFORE this file's first import of @huggingface/transformers).
 */

// `self` typing avoided to keep tsconfig out of WebWorker lib (which conflicts
// with the DOM lib used by the main bundle).
const ctx = self as unknown as {
    postMessage: (data: unknown, transfer?: Transferable[]) => void;
    onmessage: ((event: MessageEvent) => void) | null;
};

type InitMsg = {
    type: 'init';
    modelId: string;
    dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';
    /** Pass-through option to transformers.js env if main thread wants to
     *  override the default HF Hub URL. */
    remoteUrl?: string;
};
type EmbedMsg = { type: 'embed'; id: number; texts: string[] };
type DisposeMsg = { type: 'dispose' };
type IncomingMsg = InitMsg | EmbedMsg | DisposeMsg;

type Extractor = (
    text: string | string[],
    options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractor: Extractor | null = null;
let modelDimension: number | null = null;

ctx.onmessage = async (event: MessageEvent<IncomingMsg>) => {
    const msg = event.data;
    try {
        if (msg.type === 'init') {
            await handleInit(msg);
        } else if (msg.type === 'embed') {
            await handleEmbed(msg);
        } else if (msg.type === 'dispose') {
            extractor = null;
            modelDimension = null;
        }
    } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        if (msg.type === 'embed') {
            ctx.postMessage({ type: 'result', id: msg.id, vectors: null, error: m });
        } else {
            ctx.postMessage({ type: 'init-error', message: m, stack });
        }
    }
};

async function handleInit(msg: InitMsg): Promise<void> {
    // Dynamic import so the bundle only loads transformers when init runs.
    // esbuild's alias in worker stage maps this to transformers.web.js.
    const tfm = await import('@huggingface/transformers');
    if (msg.remoteUrl) {
        // Optional override; default points at huggingface.co
        (tfm.env as unknown as { remoteHost: string }).remoteHost = msg.remoteUrl;
    }
    // Caching: transformers.js default uses browser cache (IndexedDB via Cache API
    // wrapper). In Electron renderer this works out of the box.
    const pipeline = tfm.pipeline;
    const dtype = msg.dtype ?? 'q8';

    const built = await pipeline('feature-extraction', msg.modelId, {
        dtype,
        progress_callback: (p: unknown) => {
            const pe = p as { status?: string; loaded?: number; total?: number; file?: string };
            if (pe && pe.status && typeof pe.loaded === 'number' && typeof pe.total === 'number') {
                ctx.postMessage({
                    type: 'progress',
                    loaded: pe.loaded,
                    total: pe.total,
                    phase: `${pe.status}${pe.file ? ` ${pe.file}` : ''}`,
                });
            }
        },
    } as unknown as Parameters<typeof pipeline>[2]);
    extractor = built as unknown as Extractor;

    // Probe with a tiny input to discover dimension.
    const probe = await extractor('_', { pooling: 'mean', normalize: true });
    modelDimension = probe.dims[probe.dims.length - 1];

    ctx.postMessage({ type: 'ready', dimension: modelDimension });
}

async function handleEmbed(msg: EmbedMsg): Promise<void> {
    if (!extractor) throw new Error('worker not initialised (call init first)');
    const vectors: Float32Array[] = [];
    for (const text of msg.texts) {
        const out = await extractor(text, { pooling: 'mean', normalize: true });
        // out.data is a typed array view; copy into a standalone Float32Array
        // so transferring back to main thread isn't aliased.
        const copy = new Float32Array(out.data.length);
        copy.set(out.data);
        vectors.push(copy);
    }
    // Transfer the underlying buffers to avoid a structured-clone copy.
    const transfers = vectors.map((v) => v.buffer);
    ctx.postMessage({ type: 'result', id: msg.id, vectors }, transfers);
}

export {};
