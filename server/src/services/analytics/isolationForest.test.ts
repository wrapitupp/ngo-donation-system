import { describe, expect, it } from 'vitest'
import { IsolationForest, MIN_TRAINING_ROWS } from './isolationForest'
import { FEATURE_NAMES, toFeatureVector } from './features'

/** Deterministic generator, so the fixtures are reproducible without being degenerate. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * A cluster of ordinary points with genuine continuous spread.
 *
 * A repeating lattice would not do: with only a handful of distinct values the
 * trees hit identical-value leaves almost immediately, so ordinary points
 * isolate about as fast as an outlier and the contrast collapses.
 */
function normalCluster(count: number): number[][] {
  const random = seeded(99)
  return Array.from({ length: count }, () => [
    10 + random() * 2,
    5 + random() * 2,
    2 + random() * 2,
  ])
}

describe('isolation forest', () => {
  it('refuses to fit on too little data rather than learning noise', () => {
    expect(IsolationForest.fit(normalCluster(MIN_TRAINING_ROWS - 1))).to.equal(null)
    expect(IsolationForest.fit(normalCluster(MIN_TRAINING_ROWS))).to.not.equal(null)
  })

  it('is deterministic for a given seed', () => {
    const rows = normalCluster(200)
    const point = [50, 40, 30]

    const a = IsolationForest.fit(rows, { seed: 7 })!.score(point)
    const b = IsolationForest.fit(rows, { seed: 7 })!.score(point)

    expect(a).to.equal(b)
  })

  it('scores a far outlier above the cluster it was trained on', () => {
    const rows = normalCluster(300)
    const forest = IsolationForest.fit(rows, { seed: 1 })!

    const ordinary = forest.score([10.3, 5.2, 2.1])
    const outlier = forest.score([500, 400, 300])

    expect(outlier).to.be.greaterThan(ordinary)
    expect(outlier).to.be.greaterThan(0.6)
    expect(ordinary).to.be.lessThan(0.6)
  })

  it('catches a point that is ordinary on every axis alone but not in combination', () => {
    // Two dense groups: small-and-young, and large-and-old. Nothing in between.
    const rows: number[][] = []
    for (let i = 0; i < 150; i++) rows.push([1 + (i % 5) * 0.1, 1 + (i % 5) * 0.1])
    for (let i = 0; i < 150; i++) rows.push([20 + (i % 5) * 0.1, 20 + (i % 5) * 0.1])
    const forest = IsolationForest.fit(rows, { seed: 3 })!

    // Each coordinate is inside the observed range, but the pairing never occurs.
    const inCombination = forest.score([1, 20])
    const inGroup = forest.score([20.2, 20.2])

    expect(inCombination).to.be.greaterThan(inGroup)
  })

  it('survives a feature that never varies', () => {
    const rows = Array.from({ length: 120 }, (_, i) => [i % 9, 5, 5])
    const forest = IsolationForest.fit(rows, { seed: 2 })!

    expect(Number.isFinite(forest.score([100, 5, 5]))).to.equal(true)
  })

  it('builds the requested number of trees', () => {
    const forest = IsolationForest.fit(normalCluster(200), { trees: 25, seed: 5 })!
    expect(forest.size).to.equal(25)
  })
})

describe('feature vector', () => {
  it('emits one value per declared feature name, in order', () => {
    const vector = toFeatureVector({
      amount: 50_000,
      hourOfDay: 14,
      accountAgeHours: 240,
      priorDonationCount: 6,
      campaignShare: 0.25,
    })

    expect(vector).to.have.length(FEATURE_NAMES.length)
    expect(vector[1]).to.equal(14)
    expect(vector[3]).to.equal(6)
    expect(vector[4]).to.equal(0.25)
  })

  it('log-compresses the heavy-tailed features', () => {
    const small = toFeatureVector({
      amount: 1_000,
      hourOfDay: 0,
      accountAgeHours: 0,
      priorDonationCount: 0,
      campaignShare: 0,
    })
    const large = toFeatureVector({
      amount: 100_000_000,
      hourOfDay: 0,
      accountAgeHours: 0,
      priorDonationCount: 0,
      campaignShare: 0,
    })

    // A 100,000x difference in amount must not become a 100,000x difference in
    // the feature, or it would dominate every random split.
    expect(large[0] / small[0]).to.be.lessThan(3)
  })

  it('never emits a non-finite value', () => {
    const vector = toFeatureVector({
      amount: -5,
      hourOfDay: 3,
      accountAgeHours: -1,
      priorDonationCount: 0,
      campaignShare: Number.NaN,
    })

    expect(vector.every((value) => Number.isFinite(value))).to.equal(true)
  })
})
