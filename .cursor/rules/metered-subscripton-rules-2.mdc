---
alwaysApply: true
---
### Code Boundaries
src/
├── app/                     # Next.js app router (API routes, pages)
├── lib/                     # Shared logic & clients (scaffolded core)
│   ├── scaffold/            # Global utility clients (Stripe, Stigg, Redis, etc.)
│   ├── db/                  # Prisma client, migrations, repository functions
│   ├── services/            # Core domain logic per story/use-case
│   ├── jobs/                # Background jobs (cron or API-triggered)
│   ├── webhooks/            # Signature verification + queue intake
│   ├── billing/             # Stripe + Stigg orchestration logic
│   ├── quota/               # Real-time usage & quota enforcement
│   ├── entitlements/        # Read API + computation of plan allowances
│   ├── api/                 # Shared API request/response schema (Zod)
│   ├── test/                # Reusable test helpers & mocks
│   └── utils/               # Pure utility functions (no side effects)
├── prisma/                  # Schema + migrations
├── tests/                   # Story-level Jest tests (integration)
│   ├── unit/                # unit testing
│   ├── integration/         # integration testing
│   ├── e2e/                 # e2e testing
└── types/                   # Global TS interfaces & enums
