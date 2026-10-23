# Fronts: evidence that enables each one

A front runs only if the repo shows evidence for it. Evidence is cheap to check (a file listing, a grep); a review without a target is the expensive part. Each front maps to the agent `review-<id>`.

## security
Evidence: authentication or session code, authorization checks, forms or public endpoints, secrets handling, personal data, logging. Looks at: authentication, authorization, secrets, personal data in logs. Leans on `/security-review` for the diff. Model `opus` when `security.md` declares sensitive data.

## database
Evidence: `schema.prisma`, a `migrations` folder, `.sql` files, an ORM schema (Drizzle, Alembic, Django models). Looks at: migration reversibility, indexes, queries, performance, per-tenant security (row-level policies, tenant filters).

## code
Evidence: source code changed in the diff, or a dependency manifest (`package.json`, `requirements.txt`). Looks at: unused functions, dead code, duplicates, unused dependencies.

## tests
Evidence: production code changed, or an existing test suite. Looks at: missing tests for changed behavior, tautological tests (assert what they set up, mock the thing under test).

## hygiene
Evidence: Playwright screenshots, traces, `*.log`, temp or backup files, many documents under `docs/`, files nothing references. Looks at: those artifacts and obsolete documents. Only lists, never deletes.

## docs
Evidence: README, `docs/`, API docs or comments describing code that changed. Looks at: documentation that no longer reflects the code.
