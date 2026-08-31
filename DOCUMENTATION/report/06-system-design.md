# CHAPTER SIX: SYSTEM DESIGN {-}

```{=latex}
\startchapter{6}
```

## 6.1 Introduction {-}

<!-- Framing: Chapter 5 = WHAT the system must do. Chapter 6 = HOW.
     Name the notations used: DFD, ERD, UML. -->

## 6.2 System Architecture {-}

<!-- Source: docs/SYSTEM_ARCHITECTURE.md, BACKEND_ARCHITECTURE.md,
     FRONTEND_ARCHITECTURE.md. Layered: React/Vite client, Express API
     (routes to controllers to services to repositories), PostgreSQL on Neon,
     side rail for Sepolia and the payment provider. -->

![System architecture, layered view](../diagrams/png/architecture.png){#fig:architecture width=100%}

## 6.3 Data Modeling {-}

### 6.3.1 Context Diagram {-}

![Context diagram, DFD level 0](../diagrams/png/context.png){#fig:context width=100%}

### Data Flow Diagrams {-}

<!-- Present the context diagram first, then drill into Level 1. -->

![Data flow diagram, level 1](../diagrams/png/dfd-level1.png){#fig:dfd1 width=100%}

## 6.4.1 Database Design {-}

<!-- Template has no parent 6.4. Mirrored deliberately, see D2.
     Source: database/DATABASE_SCHEMA.md, server/src/database/schema/*.ts.
     14 tables, 11 applied migrations, Drizzle ORM. -->

![Entity relationship diagram](../diagrams/png/erd.png){#fig:erd width=100%}

<!-- Still to write: database schema listing, data dictionary, table
     structures. Data dictionary: donations table field by field. -->

## 6.5 Process Modeling {-}

### 6.5.1 UML Models {-}

<!-- Use case diagram and descriptions still to be authored. -->

![Class diagram, backend service layering](../diagrams/png/class-backend.png){#fig:class width=100%}

![Sequence diagram, donation and proof recording](../diagrams/png/sequence-donation.png){#fig:sequence width=100%}

![Activity diagram, disbursement dual approval](../diagrams/png/activity-disbursement.png){#fig:activity width=100%}

![Deployment diagram](../diagrams/png/deployment.png){#fig:deployment width=100%}

## 6.7 User Interface Design {-}

<!-- Template skips 6.6. Mirrored deliberately, see D2.
     Source: pages/*.md, docs/DESIGN.md, docs/DESIGN_SYSTEM.md, live site.
     Cover: login screen, dashboard, forms, reports. -->

## 6.9 Machine Learning and Dataset Design {-}

<!-- 6.8 Hardware or Automation Design is omitted: not applicable, and the
     template says omit rather than leave placeholders.

     THIS SECTION IS DESIGN ONLY. Binding rule from SYNC S1: never imply a
     working model exists. Use the exact label "Designed, implementation
     scheduled". Cover dataset source (the platform's own donation and
     disbursement history), candidate features (amount anomaly, velocity,
     new-beneficiary risk, campaign age), model family, train/test split. -->

### 6.9.1 Algorithms of the Working System {-}

<!-- Template reuses 6.9 for this. Renumbered to 6.9.1 so the ToC stays
     valid, the only numbering fix permitted under D2.
     Source: docs/BUSINESS_RULES.md. Proof-hash algorithm as pseudocode,
     dual-approval threshold logic, reward point calculation. -->

## 6.10 Flowcharts of the Working System {-}

<!-- Source: flows/payment-flow.md, disbursement-flow.md, blockchain-flow.md. -->

## 6.11 Security Design {-}

<!-- Source: docs/SECURITY.md. JWT access plus rotating httpOnly refresh,
     bcrypt, RBAC, account lockout, rate limiting, parameterised queries,
     audit log, separation of duties.
     Traceability: reference the Security non-functional requirement from
     5.5 explicitly, the template asks for this. -->
