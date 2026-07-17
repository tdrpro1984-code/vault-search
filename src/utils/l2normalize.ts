/**
 * l2normalize — scale a vector to unit L2 norm.
 *
 * Why this exists (007 D4 apply-stage finding): `meanPool` averages the
 * per-chunk vectors WITHOUT re-normalizing, so multi-chunk notes store a
 * `body_vec` with norm < 1. Rankers (`discoverSqlite.cosineNormalized`)
 * compute raw dot products assuming unit vectors — long notes (dialogue
 * files) were systematically under-scored. Offline simulation on the
 * dogfood vault: fixing this moved the target dialogue from rank #10 to
 * rank #1 (evidence/after-phase2-sim, alpha=0 group).
 *
 * Applied at the SQLiteStore read boundary so every consumer (Find Similar,
 * Discover, MOC clustering, graph canvas) sees unit vectors. Phase 2's
 * composeNoteVec builds on this same util.
 */
export function l2normalize(v: Float32Array): Float32Array {
    let sq = 0;
    for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
    if (sq === 0) return v; // zero vector: nothing sensible to scale
    const inv = 1 / Math.sqrt(sq);
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
    return out;
}
