/**
 * The feature vector the Isolation Forest is trained and scored on.
 *
 * Training and scoring MUST derive features the same way. Defining the vector
 * once, here, is what prevents train/serve skew: if the SQL that builds the
 * training matrix and the code that scores a live donation ever disagree, the
 * model silently scores garbage. The SQL in riskAssessment.repository.ts is
 * written to mirror FEATURE_NAMES below, column for column, in order.
 */

/** Ordered feature names. The order is the vector's contract. */
export const FEATURE_NAMES = [
  'log_amount',
  'hour_of_day',
  'log_account_age_hours',
  'prior_donation_count',
  'campaign_share',
] as const

export interface FeatureInput {
  amount: number
  /** Local hour, 0 to 23. */
  hourOfDay: number
  accountAgeHours: number
  /** How many donations this donor had already made. */
  priorDonationCount: number
  /** This donation's share of the campaign total, in [0, 1]. */
  campaignShare: number
}

/**
 * Heavy-tailed quantities are log-compressed.
 *
 * Amount and account age span several orders of magnitude. Left raw, the
 * random split range of every tree would be dominated by the largest value and
 * the model would learn almost nothing about the bulk of the data.
 */
export function toFeatureVector(input: FeatureInput): number[] {
  return [
    Math.log1p(Math.max(0, input.amount)),
    input.hourOfDay,
    Math.log1p(Math.max(0, input.accountAgeHours)),
    input.priorDonationCount,
    Number.isFinite(input.campaignShare) ? input.campaignShare : 0,
  ]
}
