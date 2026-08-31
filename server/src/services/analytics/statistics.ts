/**
 * Pure statistical primitives used by risk scoring and forecasting.
 *
 * Everything here is deterministic and free of I/O so the analytics model can
 * be unit tested in isolation and its behaviour explained precisely. No
 * function in this file reads the database or the clock.
 */

/** Fraction of the normal distribution's IQR used to make MAD a consistent estimator of sigma. */
const MAD_TO_SIGMA = 0.6745

/** Equivalent constant when falling back to the mean absolute deviation. */
const MEAN_AD_TO_SIGMA = 1.253314

/** Clamps a value into the inclusive range [0, 1]. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Linear ramp: 0 at or below `low`, 1 at or above `high`, proportional between.
 *
 * This is the scoring primitive for every risk signal. Using a ramp rather than
 * a step means a donation just past a threshold scores just above zero instead
 * of jumping straight to maximum, which keeps the score readable.
 */
export function ramp(value: number, low: number, high: number): number {
  if (high <= low) return value >= high ? 1 : 0
  return clamp01((value - low) / (high - low))
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Median of absolute deviations from the median. Robust to the outlier being tested. */
export function medianAbsoluteDeviation(values: number[], centre = median(values)): number {
  if (values.length === 0) return 0
  return median(values.map((value) => Math.abs(value - centre)))
}

export function meanAbsoluteDeviation(values: number[], centre = median(values)): number {
  if (values.length === 0) return 0
  const total = values.reduce((sum, value) => sum + Math.abs(value - centre), 0)
  return total / values.length
}

/**
 * Iglewicz and Hoaglin's modified z-score.
 *
 * The ordinary z-score is unusable here: a donor's giving history is small and
 * skewed, and the mean and standard deviation are both dragged by the very
 * outlier we are trying to detect. The median and MAD are not, so a single
 * large donation cannot hide itself. Values above 3.5 are conventionally
 * treated as outliers.
 *
 * When more than half the sample is identical the MAD collapses to zero, so the
 * mean absolute deviation is used instead. If that is also zero the sample has
 * no spread at all and any different value is reported as maximally deviant.
 */
export function modifiedZScore(value: number, sample: number[]): number {
  if (sample.length === 0) return 0

  const centre = median(sample)
  const mad = medianAbsoluteDeviation(sample, centre)
  if (mad > 0) return (MAD_TO_SIGMA * (value - centre)) / mad

  const meanAd = meanAbsoluteDeviation(sample, centre)
  if (meanAd > 0) return (value - centre) / (MEAN_AD_TO_SIGMA * meanAd)

  return value === centre ? 0 : Number.POSITIVE_INFINITY * Math.sign(value - centre)
}

/** Share of `sample` that falls at or below `value`, in [0, 1]. */
export function percentileRank(value: number, sample: number[]): number {
  if (sample.length === 0) return 0
  const atOrBelow = sample.reduce((count, item) => count + (item <= value ? 1 : 0), 0)
  return atOrBelow / sample.length
}

export interface RegressionResult {
  /** Change in y per unit of x. */
  slope: number
  intercept: number
  /** Coefficient of determination in [0, 1]; 0 when y has no variance. */
  r2: number
}

/**
 * Ordinary least squares fit over (x, y) pairs.
 *
 * Used for trend forecasting over monthly donation totals. Returns a zero slope
 * for degenerate input rather than NaN, so callers never have to guard.
 */
export function linearRegression(points: { x: number; y: number }[]): RegressionResult {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0].y : 0, r2: 0 }

  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n

  let covariance = 0
  let varianceX = 0
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY)
    varianceX += (point.x - meanX) ** 2
  }

  const slope = varianceX === 0 ? 0 : covariance / varianceX
  const intercept = meanY - slope * meanX

  let residualSS = 0
  let totalSS = 0
  for (const point of points) {
    residualSS += (point.y - (slope * point.x + intercept)) ** 2
    totalSS += (point.y - meanY) ** 2
  }

  return { slope, intercept, r2: totalSS === 0 ? 0 : clamp01(1 - residualSS / totalSS) }
}
