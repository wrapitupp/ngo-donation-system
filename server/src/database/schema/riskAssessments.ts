import { bigint, index, integer, jsonb, pgEnum, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { donations } from './donations'
import { users } from './users'

// Severity bands produced by the risk model (services/analytics/riskModel.ts).
export const riskBand = pgEnum('risk_band', ['low', 'medium', 'high', 'critical'])

// Where a flagged donation sits in the administrator review queue. Assessments
// that never reached the review threshold stay 'not_required'.
export const riskReviewStatus = pgEnum('risk_review_status', [
  'not_required',
  'pending',
  'cleared',
  'confirmed',
])

/**
 * One risk assessment per completed donation.
 *
 * Assessments are written after the fact and never alter the donation itself,
 * which stays immutable. The full signal breakdown is stored alongside the
 * score so a decision can be re-examined later even after the model has been
 * retuned, and `model_version` records which weighting produced it.
 *
 * Review outcomes accumulate the labelled examples that a supervised model
 * would need, which is why 'cleared' and 'confirmed' are recorded rather than
 * the row simply being dismissed.
 */
export const riskAssessments = pgTable(
  'risk_assessments',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    donationId: bigint('donation_id', { mode: 'number' })
      .notNull()
      .references(() => donations.id),
    // Combined score in [0, 100].
    score: integer('score').notNull(),
    band: riskBand('band').notNull(),
    // Plain-language reasons shown to administrators.
    reasons: jsonb('reasons').notNull(),
    // Full per-signal breakdown, kept for audit and model review.
    signals: jsonb('signals').notNull(),
    modelVersion: varchar('model_version', { length: 16 }).notNull(),
    reviewStatus: riskReviewStatus('review_status').notNull().default('not_required'),
    reviewedBy: bigint('reviewed_by', { mode: 'number' }).references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Scoring is idempotent: a replayed payment callback cannot create a second
    // assessment for the same donation.
    uniqueIndex('risk_assessments_donation_unique').on(table.donationId),
    index('risk_assessments_band_idx').on(table.band),
    index('risk_assessments_review_status_idx').on(table.reviewStatus),
  ],
)

export type RiskAssessmentRow = typeof riskAssessments.$inferSelect
export type NewRiskAssessmentRow = typeof riskAssessments.$inferInsert
