import { describe, expect, it } from 'vitest'
import { linearRegression, median, medianAbsoluteDeviation, modifiedZScore, ramp } from './statistics'
import { assessRisk, bandFor, requiresReview } from './riskModel'
import type { RiskContext } from './riskSignals'
import { forecastDonations, predictCampaignOutcome } from './forecasting'

/** A donation with nothing unusual about it. Individual tests bend one field at a time. */
function ordinaryContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    amount: 50_000,
    hourOfDay: 14,
    donorHistory: [45_000, 50_000, 55_000, 50_000, 48_000],
    donationsInLastHour: 0,
    platformAmounts: Array.from({ length: 60 }, (_, i) => 20_000 + i * 1_000),
    accountAgeHours: 24 * 200,
    recentFailedAttempts: 0,
    campaignRaised: 5_000_000,
    donorCampaignTotal: 50_000,
    donorOwnsCampaign: false,
    reportingThreshold: 1_000_000,
    // Null by default so these tests exercise the rule signals in isolation;
    // the forest has its own suite in isolationForest.test.ts.
    mlAnomalyScore: null,
    ...overrides,
  }
}

describe('statistics', () => {
  it('takes the median of both odd and even samples', () => {
    expect(median([3, 1, 2])).to.equal(2)
    expect(median([4, 1, 3, 2])).to.equal(2.5)
    expect(median([])).to.equal(0)
  })

  it('measures spread with the median absolute deviation', () => {
    expect(medianAbsoluteDeviation([1, 1, 1])).to.equal(0)
    expect(medianAbsoluteDeviation([10, 20, 30])).to.equal(10)
  })

  it('does not let an outlier mask itself, unlike a plain z-score', () => {
    const sample = [100, 102, 98, 101, 99]
    const outlier = 10_000

    // A textbook z-score computed with the outlier included barely exceeds 2,
    // because the outlier inflates the very standard deviation judging it.
    const withOutlier = [...sample, outlier]
    const mean = withOutlier.reduce((a, b) => a + b, 0) / withOutlier.length
    const sd = Math.sqrt(
      withOutlier.reduce((sum, v) => sum + (v - mean) ** 2, 0) / withOutlier.length,
    )
    expect(Math.abs((outlier - mean) / sd)).to.be.lessThan(2.5)

    // The modified z-score is not fooled.
    expect(modifiedZScore(outlier, sample)).to.be.greaterThan(100)
  })

  it('falls back gracefully when the sample has no spread', () => {
    expect(modifiedZScore(5, [5, 5, 5])).to.equal(0)
    expect(modifiedZScore(99, [5, 5, 5])).to.equal(Number.POSITIVE_INFINITY)
  })

  it('ramps linearly between its bounds', () => {
    expect(ramp(0, 10, 20)).to.equal(0)
    expect(ramp(15, 10, 20)).to.equal(0.5)
    expect(ramp(99, 10, 20)).to.equal(1)
  })

  it('fits a line through exact points', () => {
    const fit = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ])
    expect(fit.slope).to.equal(2)
    expect(fit.intercept).to.equal(1)
    expect(fit.r2).to.equal(1)
  })
})

describe('risk model', () => {
  it('scores an ordinary donation as low risk with nothing to explain', () => {
    const assessment = assessRisk(ordinaryContext())

    expect(assessment.score).to.equal(0)
    expect(assessment.band).to.equal('low')
    expect(assessment.reasons).to.deep.equal([])
    expect(requiresReview(assessment.band)).to.equal(false)
  })

  it('flags a donation far outside the donor own pattern', () => {
    const assessment = assessRisk(ordinaryContext({ amount: 5_000_000 }))

    expect(assessment.score).to.be.greaterThan(0)
    expect(assessment.reasons.join(' ')).to.include("this donor's usual")
  })

  it('ignores an outlier until the donor has enough history to have a pattern', () => {
    const assessment = assessRisk(
      ordinaryContext({ amount: 5_000_000, donorHistory: [1_000, 2_000] }),
    )

    expect(assessment.triggered.map((s) => s.key)).to.not.include('personal_amount_anomaly')
  })

  it('detects card testing from velocity and failed attempts together', () => {
    const assessment = assessRisk(
      ordinaryContext({ donationsInLastHour: 12, recentFailedAttempts: 9 }),
    )

    expect(assessment.band).to.equal('medium')
    expect(assessment.triggered.map((s) => s.key)).to.include.members([
      'velocity',
      'failed_attempt_burst',
    ])
  })

  it('detects an amount parked just under the approval threshold', () => {
    const assessment = assessRisk(ordinaryContext({ amount: 995_000 }))

    expect(assessment.reasons.join(' ')).to.include('just below')
  })

  it('does not fire the structuring signal on an amount above the threshold', () => {
    const assessment = assessRisk(ordinaryContext({ amount: 1_200_000 }))

    expect(assessment.triggered.map((s) => s.key)).to.not.include('threshold_structuring')
  })

  it('escalates a wash campaign to high risk', () => {
    const assessment = assessRisk(
      ordinaryContext({
        amount: 4_000_000,
        donorOwnsCampaign: true,
        campaignRaised: 4_200_000,
        donorCampaignTotal: 4_000_000,
      }),
    )

    expect(assessment.band).to.equal('high')
    expect(requiresReview(assessment.band)).to.equal(true)
    expect(assessment.triggered.map((s) => s.key)).to.include.members([
      'self_dealing',
      'campaign_concentration',
    ])
  })

  it('reaches critical only when a new account compounds the wash pattern', () => {
    const assessment = assessRisk(
      ordinaryContext({
        amount: 4_000_000,
        donorOwnsCampaign: true,
        campaignRaised: 4_200_000,
        donorCampaignTotal: 4_000_000,
        accountAgeHours: 2,
        donationsInLastHour: 6,
      }),
    )

    expect(assessment.band).to.equal('critical')
  })

  it('never lets a single signal reach critical on its own', () => {
    const assessment = assessRisk(ordinaryContext({ donorOwnsCampaign: true }))

    expect(assessment.triggered).to.have.length(1)
    expect(assessment.band).to.not.equal('critical')
  })

  it('orders reasons by how much they contributed', () => {
    const assessment = assessRisk(
      ordinaryContext({ hourOfDay: 2, donorOwnsCampaign: true, donationsInLastHour: 12 }),
    )

    // off_hours carries the least weight, so it must not lead.
    expect(assessment.triggered[assessment.triggered.length - 1].key).to.equal('off_hours')
  })

  it('maps scores onto the documented bands', () => {
    expect(bandFor(0)).to.equal('low')
    expect(bandFor(13)).to.equal('low')
    expect(bandFor(14)).to.equal('medium')
    expect(bandFor(35)).to.equal('high')
    expect(bandFor(55)).to.equal('critical')
  })

  it('escalates when the learned model fires alongside the rules', () => {
    const base = ordinaryContext({ donationsInLastHour: 12, recentFailedAttempts: 9 })

    const withoutModel = assessRisk(base)
    const withModel = assessRisk({ ...base, mlAnomalyScore: 0.8 })

    expect(withModel.score).to.be.greaterThan(withoutModel.score)
    expect(withModel.reasons.join(' ')).to.include('Anomaly model scores this')
  })

  it('ignores the learned model when none is fitted', () => {
    const assessment = assessRisk(ordinaryContext({ mlAnomalyScore: null }))

    expect(assessment.triggered.map((s) => s.key)).to.not.include('ml_anomaly')
  })

  it('treats an ordinary isolation forest score as unremarkable', () => {
    // A forest scores ordinary points near 0.5; only clearly higher values count.
    const assessment = assessRisk(ordinaryContext({ mlAnomalyScore: 0.5 }))

    expect(assessment.triggered.map((s) => s.key)).to.not.include('ml_anomaly')
  })
})

describe('forecasting', () => {
  const history = [
    { month: '2026-01', total: 1_000_000 },
    { month: '2026-02', total: 1_200_000 },
    { month: '2026-03', total: 1_400_000 },
    { month: '2026-04', total: 1_600_000 },
  ]

  it('projects a rising trend forward', () => {
    const forecast = forecastDonations(history, 2)

    expect(forecast.direction).to.equal('rising')
    expect(forecast.monthlyChange).to.equal(200_000)
    expect(forecast.confidence).to.equal(1)
    expect(forecast.weakFit).to.equal(false)
    expect(forecast.projected).to.deep.equal([
      { month: '2026-05', total: 1_800_000 },
      { month: '2026-06', total: 2_000_000 },
    ])
  })

  it('rolls the year over correctly when projecting past December', () => {
    const forecast = forecastDonations(
      [
        { month: '2026-10', total: 100 },
        { month: '2026-11', total: 100 },
        { month: '2026-12', total: 100 },
      ],
      2,
    )

    expect(forecast.projected.map((p) => p.month)).to.deep.equal(['2027-01', '2027-02'])
  })

  it('reports flat rather than inventing a trend from noise', () => {
    const forecast = forecastDonations([
      { month: '2026-01', total: 1_000_000 },
      { month: '2026-02', total: 1_001_000 },
      { month: '2026-03', total: 999_000 },
    ])

    expect(forecast.direction).to.equal('flat')
  })

  it('refuses to forecast from too little history', () => {
    const forecast = forecastDonations([{ month: '2026-01', total: 1_000_000 }])

    expect(forecast.direction).to.equal('insufficient_data')
    expect(forecast.projected).to.deep.equal([])
  })

  it('never projects a negative month', () => {
    const forecast = forecastDonations(
      [
        { month: '2026-01', total: 300 },
        { month: '2026-02', total: 200 },
        { month: '2026-03', total: 100 },
      ],
      4,
    )

    expect(forecast.direction).to.equal('falling')
    expect(forecast.projected.every((p) => p.total >= 0)).to.equal(true)
  })

  it('projects a campaign that is on course to pass its goal', () => {
    const prediction = predictCampaignOutcome({
      raised: 500_000,
      goal: 1_000_000,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-21T00:00:00Z'),
      now: new Date('2026-01-11T00:00:00Z'),
    })

    expect(prediction.dailyRate).to.equal(50_000)
    expect(prediction.projectedFinalAmount).to.equal(1_000_000)
    expect(prediction.outlook).to.equal('on_track')
    expect(prediction.projectedGoalDate).to.not.equal(null)
  })

  it('marks a campaign that will fall short', () => {
    const prediction = predictCampaignOutcome({
      raised: 100_000,
      goal: 1_000_000,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-21T00:00:00Z'),
      now: new Date('2026-01-11T00:00:00Z'),
    })

    expect(prediction.outlook).to.equal('unlikely')
    expect(prediction.projectedGoalDate).to.equal(null)
  })

  it('declines to predict before a full day has elapsed', () => {
    const prediction = predictCampaignOutcome({
      raised: 10_000,
      goal: 1_000_000,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-21T00:00:00Z'),
      now: new Date('2026-01-01T06:00:00Z'),
    })

    expect(prediction.outlook).to.equal('insufficient_data')
  })
})
