# CHAPTER SEVEN: SYSTEM IMPLEMENTATION, TESTING AND RESULTS {-}

```{=latex}
\startchapter{7}
```

## 7.1 Introduction {-}

<!-- Brief. Built in stages, currently deployed and publicly reachable. -->

## 7.2 Development Environment {-}

<!-- Windows, VS Code, Git with main and develop branches, local and cloud
     development. Source: docs/PROJECT_STRUCTURE.md, docs/GITHUB_WORKFLOW.md. -->

## 7.3 Software Tools Used {-}

<!-- Source: docs/TECH_STACK.md. Node, TypeScript, Vite, Hardhat, Drizzle
     Kit, ESLint. -->

## 7.4 Implementation of Modules {-}

<!-- Eight modules: Authentication, Campaigns, Donations and Payments,
     Blockchain, Administration, Fundraisers, Rewards, Reporting.
     Map each back to the FR range it fulfils, the template asks for this
     explicitly.
     Worth calling out two hard problems solved: idempotent payment
     callbacks, and never blocking the donor on the chain write. -->

## 7.5 Testing Strategy {-}

<!-- Unit: Hardhat contract test suite.
     Integration: automated API end-to-end runs.
     System: real-browser checks across the full journey.
     User Acceptance: acceptance walkthrough against
     testing/acceptance-tests.md on the live deployment.

     Be accurate about what is automated and what is manual. Server-side unit
     testing is thin, and 7.8 should say so rather than imply coverage that
     does not exist. -->

## 7.6 Test Cases {-}

<!-- Five columns exactly as the template shows: Test ID, Description, Input,
     Expected Result, Status. Real IDs, real results.
     Pass counts live in PRESENTATION_BLUEPRINT.md section 7. Reference that,
     do not restate the numbers here. -->

## 7.7 Results {-}

## 7.8 Discussion of Results {-}

<!-- Be honest about the two known non-passes and about thin unit coverage.
     The template's own academic tip says examiners reward critical
     reflection over a perfect-sounding result. -->

## 7.9 System Screenshots {-}

<!-- Four to six screenshots covering one user journey end to end:
     login, campaign detail, donation, receipt with proof, dashboard.
     Capture from the live deployment. -->
