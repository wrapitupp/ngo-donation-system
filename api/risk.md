# RISK API

Base URL

/api/admin/risk

Administrator only throughout. Risk scores name donors and describe suspicion about them, so nothing on this surface is ever public.

Scoring is advisory. A donation that has been paid for is a completed fact and stays in the ledger regardless of its score (docs/BUSINESS_RULES.md: Donation Rules). The model flags donations for human review; it never blocks, holds, or reverses one.

Disabled unless `RISK_SCORING_ENABLED=true`. When disabled no assessments are written and these endpoints return empty results.

---

# The model

Model version 2.0.0. A hybrid of nine hand-specified statistical signals and one machine learning model. Every signal returns a severity in [0, 1] and a plain-language reason, and the combined score carries those reasons through to the administrator.

| Signal | Weight | Fires when |
| --- | --- | --- |
| personal_amount_anomaly | 25 | Amount is a robust outlier against the donor's own history |
| velocity | 20 | Several donations from one donor inside an hour |
| self_dealing | 20 | The donor owns the campaign they gave to |
| ml_anomaly | 20 | The Isolation Forest ranks the donation as unusual |
| new_account_large_amount | 15 | A very new account moves an atypically large amount |
| population_amount_anomaly | 10 | Amount is extreme against the platform as a whole |
| failed_attempt_burst | 10 | Repeated failed or cancelled checkouts in 24h |
| threshold_structuring | 10 | Amount parked just below the approval threshold |
| campaign_concentration | 10 | One donor dominates a campaign's total |
| off_hours | 5 | Placed between midnight and 05:00 local |

The combined score is the weighted mean, so it reads as how much of the total possible suspicion is present. Signals that did not fire still count toward the denominator, which is what stops one noisy signal from dominating.

## The machine learning half

`ml_anomaly` is an Isolation Forest (Liu, Ting and Zhou, 2008), fitted on the platform's own donation history. Anomalies are few and different, so a tree splitting on random features at random values isolates them in fewer splits than it needs for an ordinary point. Averaging that path length over 100 trees gives the anomaly score.

It is unsupervised, so it needs no labelled fraud examples, and it sees every feature jointly. That is what it adds over the rules: it catches a donation whose amount, hour, account age and campaign share are each individually unremarkable but whose combination never occurs in the platform's history. No hand-written rule anticipates that.

Feature vector, in order:

| Feature | Transform |
| --- | --- |
| log_amount | log1p, heavy tailed |
| hour_of_day | raw, 0 to 23 |
| log_account_age_hours | log1p, heavy tailed |
| prior_donation_count | raw |
| campaign_share | raw, 0 to 1 |

Training and scoring derive this vector through one shared helper, because a mismatch between them would silently score against a different feature space than the model learned.

The model is fitted over the most recent 2,000 donations, cached in memory, and refitted hourly. It is seeded, so the same training data always produces the same model and the same scores. Below 50 donations it declines to fit at all and the rule signals carry the assessment alone.

## Why not a supervised classifier

There is no labelled fraud history to train one on, so a classifier would be fitted to invented labels. The Isolation Forest is genuine machine learning that works without them. Review outcomes are recorded rather than discarded, which accumulates the labelled examples a supervised model would later need.

## Why the two halves stay together

The forest can say a donation is unusual but not why. The rules can say exactly why but only see what someone thought to encode. An administrator needs both: a score they can act on, and a reason they can defend.

## Why a modified z-score

A donor's giving history is small and skewed. The ordinary mean and standard deviation are both dragged by the very outlier being tested, so a single large donation can hide itself. The median and median absolute deviation are not, following Iglewicz and Hoaglin, who treat a modified z-score above 3.5 as an outlier.

## Bands

| Band | Score | Meaning |
| --- | --- | --- |
| low | 0 to 13 | No action |
| medium | 14 to 34 | Recorded, not queued |
| high | 35 to 54 | Queued for review |
| critical | 55 to 100 | Queued for review, administrators notified |

No single signal can reach critical alone. Every band above medium requires corroboration.

Boundaries were recalibrated at version 2.0.0. Adding the Isolation Forest raised the total weight from 125 to 145, lowering every score by roughly a seventh, so the thresholds moved with it rather than silently becoming stricter.

---

# Review Queue

GET /

Authentication Required (admin)

Query parameters

| Name | Values | Default |
| --- | --- | --- |
| reviewStatus | pending, cleared, confirmed | all |
| band | low, medium, high, critical | all |
| page | positive integer | 1 |
| pageSize | 1 to 100 | 20 |

Response

```
{
  "items": [
    {
      "id": 12,
      "donationId": 481,
      "score": 64,
      "band": "critical",
      "reasons": [
        "Donor owns the campaign they contributed to",
        "Amount is 8.3x this donor's usual TZS 480,000",
        "This donor accounts for 95% of the campaign total"
      ],
      "reviewStatus": "pending",
      "donorName": "...",
      "campaignTitle": "...",
      "amount": 4000000,
      "receiptNumber": "RCP-...",
      "createdAt": "..."
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

---

# Overview

GET /overview

Authentication Required (admin)

Band and review-status counts for the dashboard.

```
{
  "byBand": { "low": 240, "medium": 18, "high": 4, "critical": 1 },
  "pendingReview": 3,
  "confirmed": 2,
  "assessed": 263
}
```

---

# Record a Review Decision

POST /:id/review

Authentication Required (admin)

Request

```
{ "decision": "cleared" | "confirmed", "note": "optional, max 500 chars" }
```

Guarded on the assessment still being pending, so two administrators reviewing the same item concurrently cannot both record a decision. The loser receives 409.

Writes a `risk.reviewed` entry to the audit log.

Errors

| Status | Reason |
| --- | --- |
| 400 | Invalid id or decision |
| 409 | Already reviewed by another administrator |

---

# Donation Forecast

GET /forecast

Authentication Required (admin)

Ordinary least squares trend over the last 12 months of platform totals.

Query parameters

| Name | Values | Default |
| --- | --- | --- |
| monthsAhead | 1 to 12 | 3 |

Response

```
{
  "direction": "rising" | "flat" | "falling" | "insufficient_data",
  "monthlyChange": 200000,
  "confidence": 0.94,
  "weakFit": false,
  "history": [{ "month": "2026-01", "total": 1000000 }],
  "projected": [{ "month": "2026-05", "total": 1800000 }]
}
```

`confidence` is the coefficient of determination. `weakFit` is true below 0.3, meaning the trend is too noisy to act on. A slope smaller than 2% of the average month reports as `flat` rather than inventing a direction from noise.

---

# Campaign Prediction

GET /campaigns/:id/prediction

Authentication Required (admin)

Run-rate projection of whether a campaign meets its goal by its deadline.

```
{
  "campaignId": 7,
  "raised": 500000,
  "goal": 1000000,
  "dailyRate": 50000,
  "projectedFinalAmount": 1000000,
  "projectedGoalRatio": 1.0,
  "projectedGoalDate": "...",
  "outlook": "on_track"
}
```

| Outlook | Projected share of goal |
| --- | --- |
| likely | 1.2 and above |
| on_track | 1.0 to 1.2 |
| at_risk | 0.6 to 1.0 |
| unlikely | below 0.6 |
| insufficient_data | less than a day elapsed |

Deliberately linear. A campaign's giving pattern is driven by promotion and deadline effects that a curve fitted to a few weeks of data would model badly, so a run rate an administrator can verify by hand is the more useful and more honest answer.
