// Build-time virtual module supplied by inlineWorkerSourcePlugin in
// esbuild.config.mjs. Worker source is inlined into main.js as a string and
// instantiated via Blob URL at runtime.

declare module '@inline/worker' {
    const source: string;
    export default source;
}
