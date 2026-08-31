import { findTrainingMatrix } from '../../repositories/riskAssessment.repository'
import { logger } from '../../utils/logger'
import { IsolationForest } from './isolationForest'

/**
 * Holds the trained Isolation Forest in memory and refreshes it periodically.
 *
 * Refitting on every donation would be wasteful: the model describes the shape
 * of the platform's donation history, which does not meaningfully change from
 * one donation to the next. Refitting on a schedule keeps scoring cheap while
 * letting the model track genuine drift in giving behaviour.
 */

/** Donations the model is fitted over. */
const TRAINING_ROWS = 2_000

/** How long a fitted model is reused before being refitted. */
const MODEL_TTL_MS = 60 * 60 * 1000

/** Fixed so a given training set always produces the same model and the same scores. */
const MODEL_SEED = 20260812

interface CachedModel {
  forest: IsolationForest | null
  trainedAt: number
  rowsSeen: number
}

let cache: CachedModel | null = null
let inFlight: Promise<CachedModel> | null = null

async function fit(): Promise<CachedModel> {
  const rows = await findTrainingMatrix(TRAINING_ROWS)
  const forest = IsolationForest.fit(rows, { seed: MODEL_SEED })

  if (forest) {
    logger.info(`Isolation Forest fitted on ${rows.length} donations (${forest.size} trees)`)
  } else {
    logger.info(`Isolation Forest not fitted: only ${rows.length} donations available`)
  }

  return { forest, trainedAt: Date.now(), rowsSeen: rows.length }
}

/**
 * The current model, fitting one if the cache is cold or stale.
 *
 * Concurrent callers share a single fit rather than each starting their own,
 * which matters because scoring runs on every completed donation.
 */
export async function getForest(): Promise<IsolationForest | null> {
  if (cache && Date.now() - cache.trainedAt < MODEL_TTL_MS) return cache.forest

  inFlight ??= fit()
    .then((fitted) => {
      cache = fitted
      return fitted
    })
    .finally(() => {
      inFlight = null
    })

  return (await inFlight).forest
}

/** Drops the cached model so the next scoring refits. Used by tests and after a retrain. */
export function invalidateForest(): void {
  cache = null
}

export function getModelStatus(): { trained: boolean; trainedAt: string | null; rows: number } {
  return {
    trained: cache?.forest != null,
    trainedAt: cache ? new Date(cache.trainedAt).toISOString() : null,
    rows: cache?.rowsSeen ?? 0,
  }
}
