import { env } from '../config/env'
import { DUAL_APPROVAL_THRESHOLD_TZS } from '../constants/disbursements'
import { ApiError } from '../utils/ApiError'
import { logger } from '../utils/logger'
import {
  findRiskInputs,
  findRiskQueue,
  getRiskSummary,
  insertRiskAssessment,
  reviewRiskAssessmentIfPending,
  type RiskInputs,
  type RiskQueueFilters,
} from '../repositories/riskAssessment.repository'
import { toFeatureVector } from './analytics/features'
import { getForest } from './analytics/modelStore'
import { assessRisk, requiresReview, type RiskAssessment } from './analytics/riskModel'
import type { RiskContext } from './analytics/riskSignals'
import { AUDIT_ACTIONS, recordAudit } from './auditLog.service'
import { notifyAdmins } from './notification.service'

/**
 * Scores completed donations for fraud risk and maintains the administrator
 * review queue.
 *
 * The model lives in services/analytics and is pure. This service is the seam
 * between it and the rest of the platform: it gathers context, persists the
 * verdict, and escalates anything that needs a human. It never blocks or
 * reverses a donation. A donation that has been paid for is a completed fact,
 * and the immutability rule in docs/BUSINESS_RULES.md means the response is to
 * flag it for review, not to undo it.
 */

export interface ScorableDonation {
  id: number
  donorId: number
  campaignId: number
  amount: number
  createdAt: Date
}

/**
 * Fire-and-forget entry point, called after a payment is confirmed.
 *
 * Errors are swallowed by design: a scoring failure must never turn a
 * successful donation into a failed one.
 */
export async function assessDonationRisk(donation: ScorableDonation): Promise<void> {
  if (!env.RISK_SCORING_ENABLED) return

  try {
    const inputs = await findRiskInputs(donation)
    const hourOfDay = donation.createdAt.getHours()

    const context: RiskContext = {
      amount: donation.amount,
      hourOfDay,
      reportingThreshold: DUAL_APPROVAL_THRESHOLD_TZS,
      mlAnomalyScore: await scoreWithModel(donation, hourOfDay, inputs),
      ...inputs,
    }

    const assessment = assessRisk(context)
    const needsReview = requiresReview(assessment.band)

    await insertRiskAssessment({
      donationId: donation.id,
      score: assessment.score,
      band: assessment.band,
      reasons: assessment.reasons,
      signals: assessment.triggered,
      modelVersion: assessment.modelVersion,
      reviewStatus: needsReview ? 'pending' : 'not_required',
    })

    if (needsReview) await escalate(donation, assessment)
  } catch (error) {
    logger.error(`Risk scoring failed for donation ${donation.id}:`, error)
  }
}

/**
 * Runs the donation through the Isolation Forest.
 *
 * Returns null when no model is fitted, which happens on a cold start or when
 * the platform has too few donations to learn from. The rule signals carry the
 * assessment on their own in that case.
 *
 * The feature vector is built through the shared helper so it matches the
 * training matrix exactly. Doing this by hand here would be the easiest way to
 * introduce train/serve skew.
 */
async function scoreWithModel(
  donation: ScorableDonation,
  hourOfDay: number,
  inputs: RiskInputs,
): Promise<number | null> {
  const forest = await getForest()
  if (!forest) return null

  return forest.score(
    toFeatureVector({
      amount: donation.amount,
      hourOfDay,
      accountAgeHours: inputs.accountAgeHours,
      priorDonationCount: inputs.donorHistory.length,
      campaignShare:
        inputs.campaignRaised > 0 ? donation.amount / inputs.campaignRaised : 0,
    }),
  )
}

/**
 * Puts a flagged donation in front of the administrators.
 *
 * No audit-log row is written here. `audit_logs.user_id` is non-nullable
 * because that table records what a person did, and nobody did this. The
 * risk_assessments row is itself the permanent record of the automated flag.
 */
async function escalate(donation: ScorableDonation, assessment: RiskAssessment): Promise<void> {
  logger.warn(
    `Donation ${donation.id} scored ${assessment.score} (${assessment.band}): ${assessment.reasons.join('; ')}`,
  )

  void notifyAdmins(
    `Donation flagged for review (${assessment.band})`,
    `Donation ${donation.id} scored ${assessment.score}/100. ${assessment.reasons[0] ?? ''}`,
    '/admin/risk',
  )
}

export interface RiskQueueQuery {
  reviewStatus?: 'pending' | 'cleared' | 'confirmed'
  band?: 'low' | 'medium' | 'high' | 'critical'
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export async function listRiskQueue(query: RiskQueueQuery) {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE))
  const page = Math.max(1, query.page ?? 1)

  const filters: RiskQueueFilters = {
    reviewStatus: query.reviewStatus,
    band: query.band,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  }

  const { rows, total } = await findRiskQueue(filters)

  return {
    items: rows.map((row) => ({
      id: row.id,
      donationId: row.donationId,
      score: row.score,
      band: row.band,
      reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
      reviewStatus: row.reviewStatus,
      donorName: row.donorName,
      campaignTitle: row.campaignTitle,
      amount: row.amount,
      receiptNumber: row.receiptNumber,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  }
}

/**
 * Records an administrator's verdict on a flagged donation.
 *
 * Guarded on the assessment still being pending so two administrators reviewing
 * the same item concurrently cannot both record a decision.
 */
export async function reviewRiskAssessment(
  adminId: number,
  id: number,
  decision: 'cleared' | 'confirmed',
  note: string | null,
) {
  const row = await reviewRiskAssessmentIfPending(id, decision, adminId, note)
  if (!row) {
    throw new ApiError(409, 'This assessment was already reviewed by another administrator')
  }

  await recordAudit({
    userId: adminId,
    action: AUDIT_ACTIONS.riskReviewed,
    entityType: 'donation',
    entityId: row.donationId,
    details: { decision, score: row.score, band: row.band },
  })

  return { id: row.id, donationId: row.donationId, reviewStatus: row.reviewStatus }
}

/** Band and review-status counts for the analytics dashboard. */
export async function getRiskOverview() {
  const summary = await getRiskSummary()

  const byBand: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  let pendingReview = 0
  let confirmed = 0

  for (const row of summary) {
    byBand[row.band] = (byBand[row.band] ?? 0) + row.count
    if (row.status === 'pending') pendingReview += row.count
    if (row.status === 'confirmed') confirmed += row.count
  }

  return { byBand, pendingReview, confirmed, assessed: summary.reduce((n, r) => n + r.count, 0) }
}
