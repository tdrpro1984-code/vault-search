// ============================================================
// MOC 2.0 clustering — HDBSCAN wrapper + size tiering + fallback
// ============================================================

import { HDBSCAN } from "hdbscan-ts";
import type { Cluster, MocSizeTier } from "./types";

/** D6 — result-size tiering rules */
export function classifyMocSize(n: number): MocSizeTier {
    if (n < 5) return "block";
    if (n <= 50) return "ok";
    if (n <= 100) return "warn";
    return "block";
}

/** D2 — minClusterSize grows with N to avoid fragmentation */
export function determineMinClusterSize(n: number): number {
    if (n < 40) return 2;
    if (n < 100) return 3;
    return 4;
}

/**
 * Cluster note embeddings with HDBSCAN. Returns raw clusters including
 * a noise group (label=-1) when HDBSCAN marks outliers. Empty noise
 * groups are omitted from the output.
 *
 * `minSamples` is explicitly set to 2 to prevent hdbscan-ts's default
 * of 5 from over-aggressively flagging coherent small groups as noise
 * when `minClusterSize` is smaller than 5.
 */
export function clusterEmbeddings(embeddings: number[][]): Cluster[] {
    const n = embeddings.length;
    if (n === 0) return [];

    const minClusterSize = determineMinClusterSize(n);
    const hdbscan = new HDBSCAN({ minClusterSize, minSamples: 2 });
    hdbscan.fit(embeddings);
    const labels: number[] = hdbscan.labels_;

    const byLabel = new Map<number, number[]>();
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const bucket = byLabel.get(label);
        if (bucket) bucket.push(i);
        else byLabel.set(label, [i]);
    }

    const clusters: Cluster[] = [];
    for (const [label, noteIndices] of byLabel) {
        if (noteIndices.length === 0) continue;
        clusters.push({ label, noteIndices });
    }

    // Stable order: non-noise by label ascending, noise (-1) last
    clusters.sort((a, b) => {
        if (a.label === -1) return 1;
        if (b.label === -1) return -1;
        return a.label - b.label;
    });

    return clusters;
}

/**
 * D2/D7 — whether the clustering is too degenerate to benefit from
 * MOC 2.0. Callers should fall back to flat v0.3.0 MOC when true.
 *
 * True when:
 *   - Only 1 non-noise cluster exists (nothing to group)
 *   - Zero non-noise clusters (all points are outliers)
 */
export function shouldFallbackToFlat(clusters: Cluster[]): boolean {
    const nonNoise = clusters.filter(c => c.label !== -1);
    return nonNoise.length <= 1;
}
