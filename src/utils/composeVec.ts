/**
 * composeNoteVec — weighted blend of description + body embeddings (007 D4/D5).
 *
 *   noteVec = l2norm( alpha * descVec + (1 - alpha) * l2norm(bodyVec) )
 *
 * Both inputs are normalized before blending so `alpha` has clean angular
 * semantics (descVec arrives unit-norm from the provider; bodyVec is a
 * mean-pool with norm < 1 — see utils/l2normalize.ts).
 *
 * Fallback (no description): returns l2norm(bodyVec) — NOT the raw bodyVec.
 * Normalizing only the composed branch would hand every desc-carrying note a
 * unit vector while long desc-less notes keep norm < 1, a systematic bias
 * worse than the bug this change fixes (design D4 apply-stage amendment).
 *
 * Offline alpha-scan on the dogfood vault: alpha=0.5 pushes an unrelated
 * hub dialogue from rank 1 to rank 17 on a person-card query while keeping
 * the true-positive dialogue at rank 1.
 */
import { l2normalize } from './l2normalize';

export function composeNoteVec(
    bodyVec: Float32Array,
    descVec: Float32Array | null,
    alpha: number,
): Float32Array {
    const nb = l2normalize(bodyVec);
    // Non-finite alpha (NaN via tampered settings) must not poison the vector
    // — NaN survives Math.min/max clamps upstream and NaN scores bypass every
    // `score < minScore` filter downstream (red-team finding).
    if (!descVec || descVec.length !== bodyVec.length || !Number.isFinite(alpha) || alpha <= 0) return nb;
    const nd = l2normalize(descVec);
    const out = new Float32Array(nb.length);
    for (let i = 0; i < nb.length; i++) {
        out[i] = alpha * nd[i] + (1 - alpha) * nb[i];
    }
    return l2normalize(out);
}
