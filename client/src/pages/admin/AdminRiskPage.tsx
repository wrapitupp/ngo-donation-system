import { useCallback, useState } from 'react'
import { AlertTriangle, ShieldCheck, ShieldAlert, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatCard } from '@/components/shared/StatCard'
import { RiskQueueRow } from '@/components/admin/RiskQueueRow'
import { useFetch } from '@/hooks/useFetch'
import {
  getRiskOverview,
  getRiskQueue,
  reviewRiskAssessment,
  type RiskReviewStatus,
} from '@/services/risk'

const FILTERS: { label: string; value: RiskReviewStatus | 'all' }[] = [
  { label: 'Awaiting review', value: 'pending' },
  { label: 'Cleared', value: 'cleared' },
  { label: 'Confirmed fraud', value: 'confirmed' },
  { label: 'All', value: 'all' },
]

/**
 * The fraud review queue.
 *
 * Scoring is advisory: a flagged donation has already been paid and stays in
 * the ledger either way. What an administrator decides here is whether it was
 * legitimate, which is also what accumulates labelled examples for the model.
 */
export function AdminRiskPage() {
  const [filter, setFilter] = useState<RiskReviewStatus | 'all'>('pending')

  const queueFetcher = useCallback(
    () => getRiskQueue({ reviewStatus: filter === 'all' ? undefined : filter, pageSize: 50 }),
    [filter],
  )
  const { data, error, loading, retry } = useFetch(queueFetcher)

  const overviewFetcher = useCallback(() => getRiskOverview(), [])
  const { data: overview, retry: retryOverview } = useFetch(overviewFetcher)

  const handleReview = useCallback(
    async (id: number, decision: 'cleared' | 'confirmed') => {
      await reviewRiskAssessment(id, decision)
      retry()
      retryOverview()
    },
    [retry, retryOverview],
  )

  return (
    <div>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Risk review</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Donations scored by the anomaly detection model. Every score lists the signals behind it.
      </p>

      {overview && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Activity} label="Donations assessed" value={String(overview.assessed)} />
          <StatCard
            icon={AlertTriangle}
            label="Awaiting review"
            value={String(overview.pendingReview)}
          />
          <StatCard
            icon={ShieldAlert}
            label="Critical band"
            value={String(overview.byBand.critical ?? 0)}
          />
          <StatCard
            icon={ShieldCheck}
            label="Confirmed fraud"
            value={String(overview.confirmed)}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by review status">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? 'primary' : 'secondary'}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {loading && <Skeleton className="mt-6 h-96 w-full" />}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">Could not load the risk queue.</p>
          <Button variant="secondary" className="mt-4" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="mt-6 overflow-x-auto">
          {data.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nothing flagged. Donations appear here when the model scores them high or critical.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Score</TableHead>
                  <TableHead>Donor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Why it was flagged</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <RiskQueueRow key={item.id} item={item} onReview={handleReview} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
