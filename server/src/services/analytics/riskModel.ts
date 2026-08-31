import { evaluateSignals, type RiskContext, type RiskSignal } from './riskSignals'

/**
 * Combines the individual risk signals into a single score and band.
 *
 * The model is a hybrid: nine hand-specified statistical signals plus an
 * Isolation Forest fitted on the platform's own donation history. The two halves
 * cover each other's weakness. The rules state precisely why a donation was
 * flagged but only see the patterns someone thought to encode; the forest learns
 * the joint shape of the data and catches combinations nobody anticipated, but
 * can only say that a donation is unusual, not why.
 *
 * It is not a supervised classifier. The platform has no labelled fraud history
 * to train one on, so a classifier would be fitted to invented labels. Confirmed
 * and cleared reviews are recorded rather than discarded, which accumulates the
 * labelled examples a supervised model would need later.
 */

export const RISK_MODEL_VERSION = '2.0.0'

export type RiskBand = 'low' | 'medium' | 'high' | 'critical'

/**
 * Band boundaries on the 0 to 100 scale.
 *
 * Calibrated against the combinations the signal set can actually produce:
 *
 * | Scenario                                            | Score | Band     |
 * | --------------------------------------------------- | ----- | -------- |
 * | Ordinary donation                                    |     0 | low      |
 * | Off-hours only                                       |     3 | low      |
 * | Card testing (velocity plus failed attempts)         |    21 | medium   |
 * | Wash campaign (self-dealing, concentration, outlier) |    45 | high     |
 * | The above plus a new account and velocity            |    61 | critical |
 *
 * A single signal can never reach `critical` on its own. That is intentional:
 * every band above medium requires corroboration, which keeps false positives
 * off the administrator's queue.
 *
 * Recalibrated at model version 2.0.0. Adding the Isolation Forest raised the
 * total weight from 125 to 145, which lowers every score by roughly a seventh,
 * so the boundaries moved with it rather than silently getting stricter.
 */
const BAND_THRESHOLDS: { band: RiskBand; min: number }[] = [
  { band: 'critical', min: 55 },
  { band: 'high', min: 35 },
  { band: 'medium', min: 14 },
  { band: 'low', min: 0 },
]

/** Bands at or above this warrant an administrator's attention. */
export const REVIEW_BAND_MINIMUM: RiskBand = 'high'

export interface RiskAssessment {
  /** Combined score in [0, 100]. */
  score: number
  band: RiskBand
  /** Only the signals that fired, strongest first. */
  triggered: RiskSignal[]
  /** Plain-language reasons, ready to show an administrator. */
  reasons: string[]
  modelVersion: string
}

export function bandFor(score: number): RiskBand {
  return BAND_THRESHOLDS.find((entry) => score >= entry.min)?.band ?? 'low'
}

export function requiresReview(band: RiskBand): boolean {
  return band === 'high' || band === 'critical'
}

/**
 * Scores a donation.
 *
 * The combined score is the weighted mean of every signal's severity, so it
 * reads as "how much of the total possible suspicion is present". Signals that
 * did not fire contribute zero and still count toward the denominator, which is
 * what stops one noisy signal from dominating the result.
 */
export function assessRisk(context: RiskContext): RiskAssessment {
  const signals = evaluateSignals(context)

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const weighted = signals.reduce((sum, signal) => sum + signal.score * signal.weight, 0)
  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100)

  const triggered = signals
    .filter((signal) => signal.score > 0 && signal.reason !== null)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)

  return {
    score,
    band: bandFor(score),
    triggered,
    reasons: triggered.map((signal) => signal.reason as string),
    modelVersion: RISK_MODEL_VERSION,
  }
}
