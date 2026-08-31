import { api } from '@/services/api'

// Contract: api/risk.md (base path /api/admin/risk). Admin only.

export type RiskBand = 'low' | 'medium' | 'high' | 'critical'
export type RiskReviewStatus = 'pending' | 'cleared' | 'confirmed'

export interface RiskQueueItem {
  id: number
  donationId: number
  score: number
  band: RiskBand
  /** Plain-language explanations produced by the signals that fired. */
  reasons: string[]
  reviewStatus: RiskReviewStatus
  donorName: string
  campaignTitle: string
  amount: number
  receiptNumber: string
  createdAt: string
}

export interface RiskQueue {
  items: RiskQueueItem[]
  total: number
  page: number
  pageSize: number
}

export interface RiskOverview {
  byBand: Record<RiskBand, number>
  pendingReview: number
  confirmed: number
  assessed: number
}

export interface RiskQueueParams {
  reviewStatus?: RiskReviewStatus
  band?: RiskBand
  page?: number
  pageSize?: number
}

export async function getRiskQueue(params: RiskQueueParams = {}): Promise<RiskQueue> {
  const { data } = await api.get<RiskQueue>('/admin/risk', { params })
  return data
}

export async function getRiskOverview(): Promise<RiskOverview> {
  const { data } = await api.get<RiskOverview>('/admin/risk/overview')
  return data
}

export async function reviewRiskAssessment(
  id: number,
  decision: 'cleared' | 'confirmed',
  note?: string,
): Promise<void> {
  await api.post(`/admin/risk/${id}/review`, { decision, note })
}

export interface MonthlyTotal {
  month: string
  total: number
}

export interface DonationForecast {
  direction: 'rising' | 'flat' | 'falling' | 'insufficient_data'
  monthlyChange: number
  confidence: number
  weakFit: boolean
  projected: MonthlyTotal[]
  history: MonthlyTotal[]
}

export async function getDonationForecast(monthsAhead?: number): Promise<DonationForecast> {
  const { data } = await api.get<DonationForecast>('/admin/risk/forecast', {
    params: { monthsAhead },
  })
  return data
}
