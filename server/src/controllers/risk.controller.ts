import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import {
  getRiskOverview,
  listRiskQueue,
  reviewRiskAssessment,
} from '../services/fraudDetection.service'
import { getDonationForecast, getCampaignPrediction } from '../services/predictiveAnalytics.service'
import { ApiError } from '../utils/ApiError'

// Contract: api/risk.md. Base path: /api/admin/risk. Admin only.

const queueQuerySchema = z.object({
  reviewStatus: z.enum(['pending', 'cleared', 'confirmed']).optional(),
  band: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
})

export async function queue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = queueQuerySchema.safeParse(req.query)
    if (!query.success) throw ApiError.badRequest('Invalid filters')
    res.json(await listRiskQueue(query.data))
  } catch (error) {
    next(error)
  }
}

export async function overview(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await getRiskOverview())
  } catch (error) {
    next(error)
  }
}

const reviewSchema = z.object({
  decision: z.enum(['cleared', 'confirmed']),
  note: z.string().trim().max(500).optional(),
})

export async function review(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid assessment id')

    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) throw ApiError.badRequest('Invalid review decision')

    const adminId = req.user!.id
    res.json(
      await reviewRiskAssessment(adminId, id, parsed.data.decision, parsed.data.note ?? null),
    )
  } catch (error) {
    next(error)
  }
}

const forecastQuerySchema = z.object({
  monthsAhead: z.coerce.number().int().positive().max(12).optional(),
})

export async function forecast(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = forecastQuerySchema.safeParse(req.query)
    if (!query.success) throw ApiError.badRequest('Invalid forecast window')
    res.json(await getDonationForecast(query.data.monthsAhead))
  } catch (error) {
    next(error)
  }
}

export async function campaignPrediction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid campaign id')
    res.json(await getCampaignPrediction(id))
  } catch (error) {
    next(error)
  }
}
