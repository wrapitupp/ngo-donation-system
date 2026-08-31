import { Router } from 'express'
import {
  campaignPrediction,
  forecast,
  overview,
  queue,
  review,
} from '../controllers/risk.controller'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

// Contract: api/risk.md. Base path: /api/admin/risk. Admin only throughout:
// risk scores name donors and must never reach the public surface.
router.use(requireAuth, requireRole('admin'))

router.get('/', queue)
router.get('/overview', overview)
router.post('/:id/review', review)

// Predictive analytics.
router.get('/forecast', forecast)
router.get('/campaigns/:id/prediction', campaignPrediction)

export default router
