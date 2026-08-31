import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatDate, formatTZS } from '@/utils/format'
import type { RiskBand, RiskQueueItem } from '@/services/risk'

const BAND_TONES: Record<RiskBand, StatusTone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
}

const REVIEW_TONES: Record<string, StatusTone> = {
  pending: 'warning',
  cleared: 'success',
  confirmed: 'danger',
}

interface RiskQueueRowProps {
  item: RiskQueueItem
  onReview: (id: number, decision: 'cleared' | 'confirmed') => Promise<void>
}

/**
 * One flagged donation.
 *
 * The reasons the model gave are shown in full rather than behind a disclosure.
 * An administrator deciding whether money was stolen should not have to click
 * to find out why the system thinks so.
 */
export function RiskQueueRow({ item, onReview }: RiskQueueRowProps) {
  const [submitting, setSubmitting] = useState<'cleared' | 'confirmed' | null>(null)

  async function decide(decision: 'cleared' | 'confirmed') {
    setSubmitting(decision)
    try {
      await onReview(item.id, decision)
    } finally {
      setSubmitting(null)
    }
  }

  const pending = item.reviewStatus === 'pending'

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-semibold tabular-nums">{item.score}</span>
          <StatusBadge label={item.band} tone={BAND_TONES[item.band]} />
        </div>
      </TableCell>

      <TableCell>
        <p className="font-medium">{item.donorName}</p>
        <p className="text-xs text-muted-foreground">{item.campaignTitle}</p>
      </TableCell>

      <TableCell className="tabular-nums">{formatTZS(item.amount)}</TableCell>

      <TableCell className="max-w-xs">
        <ul className="space-y-1">
          {item.reasons.map((reason) => (
            <li key={reason} className="text-xs text-muted-foreground">
              {reason}
            </li>
          ))}
        </ul>
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</TableCell>

      <TableCell>
        {pending ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={submitting !== null}
              onClick={() => decide('cleared')}
            >
              {submitting === 'cleared' ? 'Clearing' : 'Clear'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={submitting !== null}
              onClick={() => decide('confirmed')}
            >
              {submitting === 'confirmed' ? 'Confirming' : 'Confirm fraud'}
            </Button>
          </div>
        ) : (
          <StatusBadge
            label={item.reviewStatus}
            tone={REVIEW_TONES[item.reviewStatus] ?? 'neutral'}
          />
        )}
      </TableCell>
    </TableRow>
  )
}
