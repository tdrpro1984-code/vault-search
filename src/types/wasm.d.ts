/**
 * Ambient type for `.wasm` imports.
 *
 * esbuild's `loader: { '.wasm': 'binary' }` (configured in esbuild.config.mjs)
 * resolves `.wasm` imports to a Uint8Array containing the file bytes.
 * TypeScript needs this declaration to allow the import statement.
 */
declare module '*.wasm' {
    const content: Uint8Array;
    export default content;
}
