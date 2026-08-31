import { linearRegression } from './statistics'

/**
 * Predictive analytics over donation history.
 *
 * Two questions are answered here: where platform donation volume is heading,
 * and whether a given campaign is on course to meet its goal. Both use ordinary
 * least squares or a run-rate projection rather than anything opaque, and both
 * report the confidence in their own output so a weak trend is not presented as
 * a firm prediction.
 */

/** Below this many months of history a trend line is not worth reporting. */
const MIN_MONTHS_FOR_TREND = 3

/** R-squared below this means the fit explains too little to rely on. */
const WEAK_FIT_R2 = 0.3

export interface MonthlyTotal {
  /** Month label in YYYY-MM form. */
  month: string
  total: number
}

export type TrendDirection = 'rising' | 'flat' | 'falling' | 'insufficient_data'

export interface DonationForecast {
  direction: TrendDirection
  /** Average change in monthly total, in TZS per month. */
  monthlyChange: number
  /** Goodness of fit in [0, 1]. Low values mean the trend is noisy. */
  confidence: number
  /** True when the fit is too weak to act on. */
  weakFit: boolean
  projected: MonthlyTotal[]
}

function nextMonthLabel(label: string, offset: number): string {
  const [year, month] = label.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Fits a trend to monthly donation totals and projects it forward.
 *
 * Projections are floored at zero: the line can slope downward, but a negative
 * month is not a meaningful forecast.
 */
export function forecastDonations(history: MonthlyTotal[], monthsAhead = 3): DonationForecast {
  if (history.length < MIN_MONTHS_FOR_TREND) {
    return {
      direction: 'insufficient_data',
      monthlyChange: 0,
      confidence: 0,
      weakFit: true,
      projected: [],
    }
  }

  const points = history.map((entry, index) => ({ x: index, y: entry.total }))
  const { slope, intercept, r2 } = linearRegression(points)

  const meanTotal = history.reduce((sum, entry) => sum + entry.total, 0) / history.length
  // A slope smaller than 2% of the average month is noise, not a trend.
  const flatBand = Math.abs(meanTotal) * 0.02
  const direction: TrendDirection =
    Math.abs(slope) <= flatBand ? 'flat' : slope > 0 ? 'rising' : 'falling'

  const lastLabel = history[history.length - 1].month
  const projected = Array.from({ length: monthsAhead }, (_, step) => ({
    month: nextMonthLabel(lastLabel, step + 1),
    total: Math.max(0, Math.round(slope * (history.length + step) + intercept)),
  }))

  return {
    direction,
    monthlyChange: Math.round(slope),
    confidence: Number(r2.toFixed(3)),
    weakFit: r2 < WEAK_FIT_R2,
    projected,
  }
}

export type CampaignOutlook = 'likely' | 'on_track' | 'at_risk' | 'unlikely' | 'insufficient_data'

export interface CampaignPrediction {
  outlook: CampaignOutlook
  /** Amount the campaign reaches by its deadline at the current rate. */
  projectedFinalAmount: number
  /** Projected share of the goal met by the deadline, where 1 is exactly on target. */
  projectedGoalRatio: number
  /** Date the goal is reached at the current rate, or null if not before the deadline. */
  projectedGoalDate: string | null
  dailyRate: number
}

export interface CampaignProgress {
  raised: number
  goal: number
  startedAt: Date
  endsAt: Date
  now: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Projects a campaign forward at its observed run rate.
 *
 * Deliberately linear. A campaign's giving pattern is driven by promotion and
 * deadline effects that a curve fitted to a few weeks of data would model
 * badly, so a run rate that an administrator can verify by hand is the more
 * useful and more honest answer.
 */
export function predictCampaignOutcome(progress: CampaignProgress): CampaignPrediction {
  const { raised, goal, startedAt, endsAt, now } = progress
  const elapsedDays = (now.getTime() - startedAt.getTime()) / DAY_MS
  const remainingDays = Math.max(0, (endsAt.getTime() - now.getTime()) / DAY_MS)

  if (elapsedDays < 1 || goal <= 0) {
    return {
      outlook: 'insufficient_data',
      projectedFinalAmount: raised,
      projectedGoalRatio: goal > 0 ? raised / goal : 0,
      projectedGoalDate: null,
      dailyRate: 0,
    }
  }

  const dailyRate = raised / elapsedDays
  const projectedFinalAmount = Math.round(raised + dailyRate * remainingDays)
  const projectedGoalRatio = projectedFinalAmount / goal

  const shortfall = goal - raised
  const daysToGoal = dailyRate > 0 ? shortfall / dailyRate : Infinity
  const reachesGoalInTime = shortfall <= 0 || daysToGoal <= remainingDays
  const projectedGoalDate = reachesGoalInTime
    ? new Date(now.getTime() + Math.max(0, daysToGoal) * DAY_MS).toISOString()
    : null

  return {
    outlook: outlookFor(projectedGoalRatio),
    projectedFinalAmount,
    projectedGoalRatio: Number(projectedGoalRatio.toFixed(3)),
    projectedGoalDate,
    dailyRate: Math.round(dailyRate),
  }
}

function outlookFor(ratio: number): CampaignOutlook {
  if (ratio >= 1.2) return 'likely'
  if (ratio >= 1) return 'on_track'
  if (ratio >= 0.6) return 'at_risk'
  return 'unlikely'
}
