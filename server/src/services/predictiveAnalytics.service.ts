import { findCampaignByIdAdmin } from '../repositories/campaign.repository'
import { getPlatformMonthlyTotals } from '../repositories/donation.repository'
import { ApiError } from '../utils/ApiError'
import {
  forecastDonations,
  predictCampaignOutcome,
  type CampaignPrediction,
  type DonationForecast,
} from './analytics/forecasting'

/**
 * Predictive analytics over donation history.
 *
 * Thin seam over the pure forecasting model in services/analytics: this service
 * supplies the data and nothing else, so the maths stays independently testable.
 */

/** How much history the trend line is fitted over. */
const MONTHS_OF_HISTORY = 12

export async function getDonationForecast(monthsAhead = 3): Promise<
  DonationForecast & { history: { month: string; total: number }[] }
> {
  const since = new Date()
  since.setMonth(since.getMonth() - (MONTHS_OF_HISTORY - 1))

  const history = await getPlatformMonthlyTotals(since)
  const forecast = forecastDonations(history, monthsAhead)

  return { ...forecast, history }
}

export async function getCampaignPrediction(campaignId: number): Promise<
  CampaignPrediction & { campaignId: number; raised: number; goal: number }
> {
  const campaign = await findCampaignByIdAdmin(campaignId)
  if (!campaign) throw ApiError.notFound('Campaign not found')

  const prediction = predictCampaignOutcome({
    raised: campaign.raisedAmount,
    goal: campaign.targetAmount,
    startedAt: campaign.startDate,
    endsAt: campaign.endDate,
    now: new Date(),
  })

  return {
    ...prediction,
    campaignId,
    raised: campaign.raisedAmount,
    goal: campaign.targetAmount,
  }
}
