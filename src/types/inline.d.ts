// Build-time virtual modules supplied by esbuild plugins
// (inlineOrtWasmPlugin / inlineWorkerSourcePlugin in esbuild.config.mjs).

declare module '@inline/ort-wasm' {
    const bytes: Uint8Array;
    export default bytes;
}

declare module '@inline/worker' {
    const source: string;
    export default source;
}
