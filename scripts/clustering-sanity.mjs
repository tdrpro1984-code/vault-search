// Clustering sanity check for Task 1.1
// Verifies hdbscan-ts handles 1024-dim vectors (qwen3-embedding dimensions)

import { HDBSCAN } from "hdbscan-ts";

function randomVec(dim, center, spread) {
  const v = new Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = center[i % center.length] + (Math.random() - 0.5) * spread;
  }
  // L2 normalize (embeddings are normalized)
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

function runCase(name, data, minClusterSize, expectedGroups) {
  const start = Date.now();
  const hdbscan = new HDBSCAN({ minClusterSize });
  hdbscan.fit(data);
  const labels = hdbscan.labels_;
  const ms = Date.now() - start;
  const unique = [...new Set(labels)].sort((a, b) => a - b);
  const nonNoise = unique.filter(l => l !== -1);
  const noiseCount = labels.filter(l => l === -1).length;
  const pass = nonNoise.length === expectedGroups;
  console.log(
    `${pass ? "✅" : "❌"} ${name}: ${nonNoise.length} clusters + ${noiseCount} noise (expected ${expectedGroups}), ${ms}ms`
  );
  if (!pass) console.log(`   labels: ${JSON.stringify(labels)}`);
  return pass;
}

// Case 1: 2D sanity (from README)
const d2 = [
  [1.1, 2.1], [2.1, 1.1], [1.1, 1.1], [0.1, 1.1],
  [10.1, 11.1], [11.1, 10.1], [10.1, 10.1],
];
runCase("2D, 2 groups", d2, 2, 2);

// Case 2: 1024-dim, 2 well-separated groups (10 vectors each)
const DIM = 1024;
const centerA = [0.5, 0.3, 0.1];
const centerB = [-0.5, -0.3, -0.1];
const groupA = Array.from({ length: 10 }, () => randomVec(DIM, centerA, 0.05));
const groupB = Array.from({ length: 10 }, () => randomVec(DIM, centerB, 0.05));
runCase("1024-dim, 2 well-separated groups (N=20)", [...groupA, ...groupB], 3, 2);

// Case 3: 1024-dim, 3 groups + noise
const centerC = [0.2, 0.5, -0.3];
const groupC = Array.from({ length: 8 }, () => randomVec(DIM, centerC, 0.05));
const noise = Array.from({ length: 5 }, () => {
  const v = new Array(DIM).fill(0).map(() => (Math.random() - 0.5) * 2);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return v.map(x => x / n);
});
runCase("1024-dim, 3 groups + noise (N=31)", [...groupA, ...groupB, ...groupC, ...noise], 3, 3);

// Case 4: Performance — 50 notes in 5 groups (realistic MOC 2.0 input)
const groups5 = [];
for (let g = 0; g < 5; g++) {
  const center = [Math.cos(g * 1.2), Math.sin(g * 1.2), 0.3 * g];
  for (let i = 0; i < 10; i++) groups5.push(randomVec(DIM, center, 0.04));
}
runCase("1024-dim, 5 groups (N=50, MOC sweet spot)", groups5, 3, 5);

// Case 5: All identical vectors (edge case)
const identical = Array.from({ length: 10 }, () => randomVec(DIM, [0.1], 0));
const ident = identical[0];
const identAll = Array.from({ length: 10 }, () => [...ident]);
runCase("1024-dim, all identical (degenerate → 1 cluster or all noise)", identAll, 2, 1);
