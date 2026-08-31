/**
 * Isolation Forest, an unsupervised machine learning model for anomaly detection.
 *
 * Liu, Ting and Zhou (2008). The idea is that anomalies are few and different,
 * so a tree that splits on random features at random values isolates them in
 * fewer splits than it needs for a normal point. Averaging that path length
 * over an ensemble of such trees gives an anomaly score.
 *
 * It is used here because it learns from the data the platform already has:
 * it needs no labelled fraud examples, which the platform has none of, and it
 * sees all features jointly, so it catches combinations that no hand-written
 * rule anticipated. The rule signals stay alongside it because the forest can
 * say a donation is unusual but not why, and an administrator needs both.
 *
 * Pure and deterministic: the ensemble is built from a seeded generator, so the
 * same training data always produces the same model and the same scores.
 */

/** Euler-Mascheroni constant, for the harmonic number approximation. */
const EULER_MASCHERONI = 0.5772156649

/** Trees in the ensemble. The original paper shows path lengths converge well before 100. */
const DEFAULT_TREES = 100

/** Rows sampled per tree. 256 is the paper's recommended default. */
const DEFAULT_SUBSAMPLE = 256

/** Below this many rows there is not enough signal to isolate anything. */
export const MIN_TRAINING_ROWS = 50

type Node =
  | { kind: 'leaf'; size: number }
  | { kind: 'split'; feature: number; threshold: number; left: Node; right: Node }

/** Deterministic PRNG (mulberry32) so a given seed always yields the same forest. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Average path length of an unsuccessful search in a binary search tree.
 * Used to normalise path lengths against the subsample size.
 */
function averagePathLength(n: number): number {
  if (n <= 1) return 0
  if (n === 2) return 1
  return 2 * (Math.log(n - 1) + EULER_MASCHERONI) - (2 * (n - 1)) / n
}

function buildTree(
  rows: number[][],
  depth: number,
  heightLimit: number,
  random: () => number,
): Node {
  if (depth >= heightLimit || rows.length <= 1) {
    return { kind: 'leaf', size: rows.length }
  }

  const featureCount = rows[0].length
  const feature = Math.floor(random() * featureCount)

  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    if (row[feature] < min) min = row[feature]
    if (row[feature] > max) max = row[feature]
  }

  // Every value identical on this feature: no split is possible.
  if (min === max) return { kind: 'leaf', size: rows.length }

  const threshold = min + random() * (max - min)
  const left: number[][] = []
  const right: number[][] = []
  for (const row of rows) {
    if (row[feature] < threshold) left.push(row)
    else right.push(row)
  }

  return {
    kind: 'split',
    feature,
    threshold,
    left: buildTree(left, depth + 1, heightLimit, random),
    right: buildTree(right, depth + 1, heightLimit, random),
  }
}

/** Path length for one point, plus a correction for the unsplit remainder at a leaf. */
function pathLength(node: Node, point: number[], depth = 0): number {
  if (node.kind === 'leaf') return depth + averagePathLength(node.size)
  const branch = point[node.feature] < node.threshold ? node.left : node.right
  return pathLength(branch, point, depth + 1)
}

export interface IsolationForestOptions {
  trees?: number
  subsampleSize?: number
  seed?: number
}

export class IsolationForest {
  private readonly trees: Node[]
  private readonly normaliser: number

  private constructor(trees: Node[], normaliser: number) {
    this.trees = trees
    this.normaliser = normaliser
  }

  /** Number of trees in the ensemble. */
  get size(): number {
    return this.trees.length
  }

  /**
   * Fits a forest to the training rows.
   *
   * Returns null when there is too little data to learn anything, so callers
   * fall back to the rule signals rather than trusting a model fitted to noise.
   */
  static fit(rows: number[][], options: IsolationForestOptions = {}): IsolationForest | null {
    if (rows.length < MIN_TRAINING_ROWS) return null

    const treeCount = options.trees ?? DEFAULT_TREES
    const subsampleSize = Math.min(options.subsampleSize ?? DEFAULT_SUBSAMPLE, rows.length)
    const random = createRandom(options.seed ?? 42)
    const heightLimit = Math.ceil(Math.log2(Math.max(2, subsampleSize)))

    const trees = Array.from({ length: treeCount }, () => {
      const sample: number[][] = []
      for (let i = 0; i < subsampleSize; i++) {
        sample.push(rows[Math.floor(random() * rows.length)])
      }
      return buildTree(sample, 0, heightLimit, random)
    })

    return new IsolationForest(trees, averagePathLength(subsampleSize))
  }

  /**
   * Anomaly score in [0, 1].
   *
   * Values well above 0.5 are anomalous, values near or below 0.5 are ordinary.
   * The paper treats scores above roughly 0.6 as worth attention and scores
   * approaching 1 as definite anomalies.
   */
  score(point: number[]): number {
    if (this.trees.length === 0 || this.normaliser === 0) return 0

    const meanPath =
      this.trees.reduce((sum, tree) => sum + pathLength(tree, point), 0) / this.trees.length

    return 2 ** (-meanPath / this.normaliser)
  }
}
