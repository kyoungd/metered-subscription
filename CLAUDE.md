# Claude Coding Rules

## Workflow
1. **Plan**: Read codebase → Write checkable todo list in `tasks/todo.md` → **GET APPROVAL**
2. **Check**: Search for existing code (reuse>create) → Check for side effects → **DISCUSS IF FOUND**
3. **Code**: Work through todos → Mark complete → Keep changes minimal
4. **Update**: High-level summary only (what/why, not how)
5. **Review**: Add summary section to todo.md

## Rules of Engagement
1. **Acceptance before code** - State pass/fail criteria in bullets
2. **No provider I/O in render** - Server actions only; mocks in tests
3. **Basic-only gating** - Advanced never blocks
4. **Always ask for confirmation before coding** - Summarize request and get approval
5. **Fixing a problem?** - Discover the source first; add logging if unknown

## Before ANY Change
- Exists already? → Search & reuse
- Affects other code? → Check & discuss
- Simpler way? → Always simplify
- Updated todo? → Keep current

## Communication
**YES**: High-level changes, decisions, risks, questions
**NO**: Line-by-line details, obvious info, assumptions

## Core Rule
**Make every change as simple as possible. Impact minimal code.**
*When uncertain → Ask, don't assume*

## What Exists (Reuse Everything)
- `/lib/scaffold/` - config, logging, DI, envelope, clients (Stripe, HTTP), db
- Prisma models - Organization, User, Subscription, UsageCounter, UsageRecord
- Standard envelope: `wrapSuccess(data)` / `wrapError(err)`

## Structure for New Features
```
/lib/<feature>/handler.js       # Business logic
/app/api/<route>/route.js       # API endpoint
/tests/<feature>/               # Tests
```

## Patterns
**Route handler:**
```javascript
export async function POST(request) {
  const env = getEnv()
  const container = createContainer(env)
  const { logger, call_state, clients } = container.createRequestContext(request.headers)
  // Business logic
  return NextResponse.json(wrapSuccess(data, undefined, call_state.correlationId))
}
```

**Auth:** `const { userId } = await auth()` (Clerk)

**DB:** `db.organization.create()` or `withTx(async (tx) => { ... })`

**Stripe:** `clients.stripe.customers.createOrAttach()` / `clients.stripe.subscriptions.create()`

## Technology
Next.js + javascript + tailwind.css + shadcn/ui + clerk.dev + Prisma + Postgresql + Stripe Payments + Redis + node 22.13.1 + Axiom
