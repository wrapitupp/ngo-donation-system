import { modifiedZScore, percentileRank, ramp, median } from './statistics'

/**
 * The individual risk signals evaluated against a donation.
 *
 * Every signal is a pure function of the context it is given, returns a score
 * in [0, 1], and states in plain language why it fired. Nothing here is opaque:
 * an administrator reviewing a flagged donation sees the same reasons the model
 * used to score it, which is the point. A score with no explanation cannot be
 * acted on and cannot be defended.
 */

/** A donor needs at least this many prior donations before personal baselines mean anything. */
const MIN_HISTORY_FOR_BASELINE = 4

/** Iglewicz and Hoaglin treat a modified z-score above this as an outlier. */
const OUTLIER_Z = 3.5

export interface RiskContext {
  amount: number
  /** Local hour of day, 0 to 23. */
  hourOfDay: number
  /** Amounts of this donor's earlier donations. */
  donorHistory: number[]
  /** Donations by this donor within the last hour, excluding this one. */
  donationsInLastHour: number
  /** Donation amounts across the platform, the population baseline. */
  platformAmounts: number[]
  /** Age of the donor's account in hours at the time of the donation. */
  accountAgeHours: number
  /** Failed or cancelled checkout attempts by this donor in the last 24 hours. */
  recentFailedAttempts: number
  /** Total raised by the campaign, including this donation. */
  campaignRaised: number
  /** This donor's total contribution to the campaign, including this donation. */
  donorCampaignTotal: number
  /** True when the donor also owns the campaign they gave to. */
  donorOwnsCampaign: boolean
  /** Approval threshold in TZS, used to detect amounts placed just underneath it. */
  reportingThreshold: number
  /**
   * Isolation Forest anomaly score in [0, 1], or null when no model is fitted.
   *
   * Supplied by the caller rather than computed here so this module stays pure:
   * the model lives in modelStore and needs the database to fit.
   */
  mlAnomalyScore: number | null
}

export interface RiskSignal {
  key: string
  label: string
  /** Normalised severity in [0, 1]. */
  score: number
  /** Contribution to the combined score relative to the other signals. */
  weight: number
  /** Populated whenever the signal fired; null when it did not. */
  reason: string | null
}

const money = (value: number) => `TZS ${Math.round(value).toLocaleString('en-US')}`

/**
 * The donation is far outside this donor's own giving pattern.
 *
 * Uses a robust z-score so one large donation cannot mask itself by inflating
 * the very statistics used to judge it.
 */
function personalAmountAnomaly(context: RiskContext): RiskSignal {
  const signal = { key: 'personal_amount_anomaly', label: 'Unusual for this donor', weight: 25 }
  if (context.donorHistory.length < MIN_HISTORY_FOR_BASELINE) {
    return { ...signal, score: 0, reason: null }
  }

  const z = modifiedZScore(context.amount, context.donorHistory)
  const score = ramp(z, OUTLIER_Z, 10)
  if (score === 0) return { ...signal, score, reason: null }

  const typical = median(context.donorHistory)
  const multiple = typical > 0 ? (context.amount / typical).toFixed(1) : 'many'
  return {
    ...signal,
    score,
    reason: `Amount is ${multiple}x this donor's usual ${money(typical)}`,
  }
}

/** The donation is extreme against the platform as a whole, not just this donor. */
function populationAmountAnomaly(context: RiskContext): RiskSignal {
  const signal = { key: 'population_amount_anomaly', label: 'Unusual for the platform', weight: 10 }
  if (context.platformAmounts.length < 20) return { ...signal, score: 0, reason: null }

  const percentile = percentileRank(context.amount, context.platformAmounts)
  const score = ramp(percentile, 0.95, 0.999)
  if (score === 0) return { ...signal, score, reason: null }

  const topPercent = Math.max(0.1, (1 - percentile) * 100).toFixed(1)
  return { ...signal, score, reason: `Among the largest ${topPercent}% of all donations` }
}

/** Many donations in quick succession, the classic card-testing pattern. */
function velocity(context: RiskContext): RiskSignal {
  const signal = { key: 'velocity', label: 'Rapid succession', weight: 20 }
  const score = ramp(context.donationsInLastHour, 3, 10)
  if (score === 0) return { ...signal, score, reason: null }

  return {
    ...signal,
    score,
    reason: `${context.donationsInLastHour} further donations from this donor within the hour`,
  }
}

/**
 * A brand new account moving a large amount.
 *
 * Both conditions must hold. A new donor giving a normal amount is ordinary,
 * and an established donor giving a large amount is already covered above. The
 * product of the two scores means this signal only fires on the combination.
 */
function newAccountLargeAmount(context: RiskContext): RiskSignal {
  const signal = { key: 'new_account_large_amount', label: 'New account, large amount', weight: 15 }
  if (context.platformAmounts.length < 20) return { ...signal, score: 0, reason: null }

  const youth = 1 - ramp(context.accountAgeHours, 1, 72)
  const size = ramp(percentileRank(context.amount, context.platformAmounts), 0.9, 0.99)
  const score = youth * size
  if (score === 0) return { ...signal, score, reason: null }

  const age = Math.max(0, Math.round(context.accountAgeHours))
  return { ...signal, score, reason: `Account is ${age}h old and the amount is atypically large` }
}

/** Repeated failed checkouts before a success suggests credential or card testing. */
function failedAttemptBurst(context: RiskContext): RiskSignal {
  const signal = { key: 'failed_attempt_burst', label: 'Repeated failed attempts', weight: 10 }
  const score = ramp(context.recentFailedAttempts, 2, 8)
  if (score === 0) return { ...signal, score, reason: null }

  return {
    ...signal,
    score,
    reason: `${context.recentFailedAttempts} failed or cancelled attempts in the last 24h`,
  }
}

/**
 * An amount deliberately placed just under the approval threshold.
 *
 * Splitting a payout into pieces that each sit below a review limit is
 * structuring. The signal strengthens the closer the amount hugs the line.
 */
function thresholdStructuring(context: RiskContext): RiskSignal {
  const signal = { key: 'threshold_structuring', label: 'Just below threshold', weight: 10 }
  const threshold = context.reportingThreshold
  if (threshold <= 0 || context.amount >= threshold) return { ...signal, score: 0, reason: null }

  const score = ramp(context.amount, threshold * 0.85, threshold * 0.995)
  if (score === 0) return { ...signal, score, reason: null }

  return { ...signal, score, reason: `Sits just below the ${money(threshold)} approval threshold` }
}

/** One donor dominating a campaign, which can precede a payout back to themselves. */
function campaignConcentration(context: RiskContext): RiskSignal {
  const signal = { key: 'campaign_concentration', label: 'Concentrated funding', weight: 10 }
  if (context.campaignRaised <= 0) return { ...signal, score: 0, reason: null }

  const share = context.donorCampaignTotal / context.campaignRaised
  const score = ramp(share, 0.6, 0.95)
  if (score === 0) return { ...signal, score, reason: null }

  return {
    ...signal,
    score,
    reason: `This donor accounts for ${Math.round(share * 100)}% of the campaign total`,
  }
}

/** The donor owns the campaign, so the money has not really left their control. */
function selfDealing(context: RiskContext): RiskSignal {
  const signal = { key: 'self_dealing', label: 'Donation to own campaign', weight: 20 }
  if (!context.donorOwnsCampaign) return { ...signal, score: 0, reason: null }

  return { ...signal, score: 1, reason: 'Donor owns the campaign they contributed to' }
}

/** Weak corroborating signal: activity in the small hours. Never decisive alone. */
function offHours(context: RiskContext): RiskSignal {
  const signal = { key: 'off_hours', label: 'Off-hours activity', weight: 5 }
  if (context.hourOfDay >= 5) return { ...signal, score: 0, reason: null }

  const hour = String(context.hourOfDay).padStart(2, '0')
  return { ...signal, score: 1, reason: `Placed at ${hour}:00 local time` }
}

/**
 * The learned model's verdict.
 *
 * The Isolation Forest sees every feature jointly, so it catches combinations
 * that no rule above anticipates: a donation whose amount, hour, account age
 * and campaign share are each individually unremarkable but never co-occur in
 * the platform's history. It cannot say which of those made it unusual, which
 * is exactly why the rule signals remain alongside it.
 *
 * An Isolation Forest score sits near 0.5 for ordinary points and rises toward
 * 1 for anomalies, so the ramp starts above 0.5 rather than at zero.
 */
function mlAnomaly(context: RiskContext): RiskSignal {
  const signal = { key: 'ml_anomaly', label: 'Learned anomaly model', weight: 20 }
  if (context.mlAnomalyScore === null) return { ...signal, score: 0, reason: null }

  const score = ramp(context.mlAnomalyScore, 0.55, 0.75)
  if (score === 0) return { ...signal, score, reason: null }

  const percent = Math.round(context.mlAnomalyScore * 100)
  return {
    ...signal,
    score,
    reason: `Anomaly model scores this ${percent}/100 against the platform's donation history`,
  }
}

/** Every signal, evaluated in a fixed order so output is stable across runs. */
export const SIGNAL_EVALUATORS = [
  personalAmountAnomaly,
  populationAmountAnomaly,
  velocity,
  newAccountLargeAmount,
  failedAttemptBurst,
  thresholdStructuring,
  campaignConcentration,
  selfDealing,
  offHours,
  mlAnomaly,
] as const

export function evaluateSignals(context: RiskContext): RiskSignal[] {
  return SIGNAL_EVALUATORS.map((evaluate) => evaluate(context))
}
