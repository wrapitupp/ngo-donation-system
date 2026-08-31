import { and, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import { requireDb } from '../config/database'
import {
  campaigns,
  donations,
  paymentTransactions,
  riskAssessments,
  users,
  type NewRiskAssessmentRow,
  type RiskAssessmentRow,
} from '../database/schema'

/** Cap on the population sample so scoring stays cheap as the platform grows. */
const PLATFORM_SAMPLE_SIZE = 500

/** How far back the donor's own baseline is drawn from. */
const DONOR_HISTORY_SIZE = 50

/**
 * Everything the risk model needs about one donation, gathered in a single
 * round of queries. The model itself stays pure: this is the only place that
 * touches the database on its behalf.
 */
export interface RiskInputs {
  donorHistory: number[]
  donationsInLastHour: number
  platformAmounts: number[]
  accountAgeHours: number
  recentFailedAttempts: number
  campaignRaised: number
  donorCampaignTotal: number
  donorOwnsCampaign: boolean
}

export async function insertRiskAssessment(row: NewRiskAssessmentRow): Promise<void> {
  const client = requireDb()
  // Idempotent: a replayed payment callback cannot create a second assessment.
  await client.insert(riskAssessments).values(row).onConflictDoNothing()
}

/**
 * Collects the donor, campaign and payment context for a donation.
 *
 * The donation being scored is excluded from every baseline it would otherwise
 * pollute, so a large donation is never compared against a history that already
 * contains it.
 */
export async function findRiskInputs(donation: {
  id: number
  donorId: number
  campaignId: number
  createdAt: Date
}): Promise<RiskInputs> {
  const client = requireDb()
  const oneHourAgo = new Date(donation.createdAt.getTime() - 60 * 60 * 1000)
  const oneDayAgo = new Date(donation.createdAt.getTime() - 24 * 60 * 60 * 1000)

  const [history, velocityRow, platform, donor, failedRow, campaign, campaignTotalRow] =
    await Promise.all([
      client
        .select({ amount: donations.amount })
        .from(donations)
        .where(and(eq(donations.donorId, donation.donorId), ne(donations.id, donation.id)))
        .orderBy(desc(donations.createdAt))
        .limit(DONOR_HISTORY_SIZE),

      client
        .select({ total: sql<string>`count(*)` })
        .from(donations)
        .where(
          and(
            eq(donations.donorId, donation.donorId),
            ne(donations.id, donation.id),
            gte(donations.createdAt, oneHourAgo),
            lt(donations.createdAt, donation.createdAt),
          ),
        ),

      client
        .select({ amount: donations.amount })
        .from(donations)
        .where(ne(donations.id, donation.id))
        .orderBy(desc(donations.createdAt))
        .limit(PLATFORM_SAMPLE_SIZE),

      client
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, donation.donorId))
        .limit(1),

      client
        .select({ total: sql<string>`count(*)` })
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.donorId, donation.donorId),
            inArray(paymentTransactions.status, ['failed', 'cancelled', 'expired']),
            gte(paymentTransactions.createdAt, oneDayAgo),
          ),
        ),

      client
        .select({ raisedAmount: campaigns.raisedAmount, ownerId: campaigns.ownerId })
        .from(campaigns)
        .where(eq(campaigns.id, donation.campaignId))
        .limit(1),

      client
        .select({ total: sql<string>`coalesce(sum(${donations.amount}), 0)` })
        .from(donations)
        .where(
          and(
            eq(donations.donorId, donation.donorId),
            eq(donations.campaignId, donation.campaignId),
          ),
        ),
    ])

  const accountCreatedAt = donor[0]?.createdAt ?? donation.createdAt
  const accountAgeHours =
    (donation.createdAt.getTime() - accountCreatedAt.getTime()) / (60 * 60 * 1000)

  return {
    donorHistory: history.map((row) => row.amount),
    donationsInLastHour: Number(velocityRow[0]?.total ?? 0),
    platformAmounts: platform.map((row) => row.amount),
    accountAgeHours: Math.max(0, accountAgeHours),
    recentFailedAttempts: Number(failedRow[0]?.total ?? 0),
    campaignRaised: campaign[0]?.raisedAmount ?? 0,
    donorCampaignTotal: Number(campaignTotalRow[0]?.total ?? 0),
    donorOwnsCampaign: campaign[0]?.ownerId === donation.donorId,
  }
}

/**
 * Builds the Isolation Forest training matrix.
 *
 * The projected columns mirror FEATURE_NAMES in services/analytics/features.ts,
 * in order. If that vector changes, this query changes with it: a mismatch
 * would train the model on one feature space and score against another, and
 * nothing would report an error.
 *
 * `prior_donation_count` is a window over each donor's full history, so it is
 * computed before the LIMIT trims the result to the most recent donations.
 */
export async function findTrainingMatrix(limit: number): Promise<number[][]> {
  const client = requireDb()

  const result = await client.execute(sql`
    SELECT
      ln(1 + d.amount)                     AS log_amount,
      EXTRACT(HOUR FROM d.created_at)      AS hour_of_day,
      ln(1 + GREATEST(0, EXTRACT(EPOCH FROM (d.created_at - u.created_at)) / 3600))
                                           AS log_account_age_hours,
      COUNT(*) OVER (
        PARTITION BY d.donor_id
        ORDER BY d.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      )                                    AS prior_donation_count,
      COALESCE(d.amount::numeric / NULLIF(c.raised_amount, 0), 0)
                                           AS campaign_share
    FROM donations d
    JOIN users u ON u.id = d.donor_id
    JOIN campaigns c ON c.id = d.campaign_id
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `)

  return result.rows.map((row) => [
    Number(row.log_amount),
    Number(row.hour_of_day),
    Number(row.log_account_age_hours),
    Number(row.prior_donation_count),
    Number(row.campaign_share),
  ])
}

export interface RiskQueueRow {
  id: number
  donationId: number
  score: number
  band: string
  reasons: unknown
  reviewStatus: string
  createdAt: Date
  donorName: string
  campaignTitle: string
  amount: number
  receiptNumber: string
}

export interface RiskQueueFilters {
  reviewStatus?: 'pending' | 'cleared' | 'confirmed'
  band?: 'low' | 'medium' | 'high' | 'critical'
  limit: number
  offset: number
}

/** Flagged donations for the administrator review queue, highest score first. */
export async function findRiskQueue(
  filters: RiskQueueFilters,
): Promise<{ rows: RiskQueueRow[]; total: number }> {
  const client = requireDb()
  const conditions = [ne(riskAssessments.reviewStatus, 'not_required')]
  if (filters.reviewStatus) conditions.push(eq(riskAssessments.reviewStatus, filters.reviewStatus))
  if (filters.band) conditions.push(eq(riskAssessments.band, filters.band))
  const where = and(...conditions)

  const [rows, countRow] = await Promise.all([
    client
      .select({
        id: riskAssessments.id,
        donationId: riskAssessments.donationId,
        score: riskAssessments.score,
        band: riskAssessments.band,
        reasons: riskAssessments.reasons,
        reviewStatus: riskAssessments.reviewStatus,
        createdAt: riskAssessments.createdAt,
        donorName: users.fullName,
        campaignTitle: campaigns.title,
        amount: donations.amount,
        receiptNumber: donations.receiptNumber,
      })
      .from(riskAssessments)
      .innerJoin(donations, eq(donations.id, riskAssessments.donationId))
      .innerJoin(users, eq(users.id, donations.donorId))
      .innerJoin(campaigns, eq(campaigns.id, donations.campaignId))
      .where(where)
      .orderBy(desc(riskAssessments.score), desc(riskAssessments.createdAt))
      .limit(filters.limit)
      .offset(filters.offset),

    client
      .select({ total: sql<string>`count(*)` })
      .from(riskAssessments)
      .where(where),
  ])

  return { rows, total: Number(countRow[0]?.total ?? 0) }
}

export async function findRiskAssessmentById(id: number): Promise<RiskAssessmentRow | null> {
  const client = requireDb()
  const [row] = await client.select().from(riskAssessments).where(eq(riskAssessments.id, id)).limit(1)
  return row ?? null
}

/**
 * Records a review decision, guarded on the row still being pending so two
 * administrators acting at once cannot both claim the same item.
 */
export async function reviewRiskAssessmentIfPending(
  id: number,
  decision: 'cleared' | 'confirmed',
  adminId: number,
  note: string | null,
): Promise<RiskAssessmentRow | null> {
  const client = requireDb()
  const [row] = await client
    .update(riskAssessments)
    .set({ reviewStatus: decision, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note })
    .where(and(eq(riskAssessments.id, id), eq(riskAssessments.reviewStatus, 'pending')))
    .returning()
  return row ?? null
}

/** Counts by band and review status, for the analytics dashboard. */
export async function getRiskSummary(): Promise<{ band: string; status: string; count: number }[]> {
  const client = requireDb()
  const rows = await client
    .select({
      band: riskAssessments.band,
      status: riskAssessments.reviewStatus,
      count: sql<string>`count(*)`,
    })
    .from(riskAssessments)
    .groupBy(riskAssessments.band, riskAssessments.reviewStatus)

  return rows.map((row) => ({ band: row.band, status: row.status, count: Number(row.count) }))
}
