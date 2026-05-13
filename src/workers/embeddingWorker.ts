// Embedding Worker — Phase 1 minimal stub
// Will be expanded in Task 1.3 (Phase 1 dogfood) and Task 3.3 (full transformers.js integration).
// For now: confirms the worker boots, posts back a 'ready' event, and echoes any message.

// In worker context, `self` is DedicatedWorkerGlobalScope. We avoid the type
// to keep tsconfig.json out of WebWorker lib (which conflicts with DOM lib).
const ctx = self as unknown as {
    postMessage: (data: unknown) => void;
    onmessage: ((event: MessageEvent) => void) | null;
};

ctx.postMessage({ type: "ready", phase: "stub" });

ctx.onmessage = (event: MessageEvent) => {
    ctx.postMessage({ type: "echo", received: event.data });
};

export {};
