# Fronts: thresholds tied to this diff

A front runs only if the repo shows evidence tied to what is being reviewed. Checking is cheap (a file listing, a grep); a review without a target is the expensive part. Each front maps to the agent `review-<id>`. Most projects qualify for zero or one front. Small diff means at most 5 files and 200 changed lines with no evidence of forms, endpoints, authentication, secrets, personal data or junk.

## security
Enters when forms, public endpoints, authentication, secrets, personal data, or logging of user data are present in what is reviewed. Looks at: authentication, authorization, secrets, personal data in logs; leans on `/security-review`. Model `opus` when `security.md` declares sensitive data. Not enough: a diff that only edits copy or styles on a page with no input.

## database
Enters when schema, migrations, SQL or ORM models are present and changed. Evidence files: `schema.prisma`, a `migrations` folder, `.sql`, Drizzle/Alembic/Django models. Looks at: reversibility, indexes, queries, performance, per-tenant security. Not enough: a schema that exists but is untouched by the diff.

## code
Enters when the diff is above the small limit, or a dependency manifest (`package.json`, `requirements.txt`) changed. Looks at: unused functions, dead code, duplicates, unused dependencies. Not enough: a 30-line change to one file with no manifest change.

## tests
Enters when a test runner exists and behavior-bearing source changed. Looks at: missing tests for changed behavior, tautological tests. Not enough: a repo with no runner, or a diff that only touches docs and config.

## hygiene
Enters when junk evidence exists: stray screenshots, traces, `*.log`, backups, orphan files, obsolete documents. Never "always". Only lists, never deletes. Not enough: the mere existence of a `docs/` folder.

## docs
Enters when the diff removes or renames something the docs mention (a command, a file, an option). Looks at: documentation that no longer reflects the code. Not enough: a new feature in a repo whose README does not cover that area.

## Priority when more than 5 qualify
security, database, code, tests, hygiene, docs: keep in that order and drop from the end.

## Worked examples
- Static landing with a contact form plus a stray screenshot: `Frentes: security, hygiene`.
- Small CLI script, nothing else: `Frentes:` (reviewed in the main thread).
- App with ORM schema and migrations, authentication, a test runner, a large change and stray traces: `Frentes: security, database, code, tests, hygiene` (docs dropped by the cap of 5).
