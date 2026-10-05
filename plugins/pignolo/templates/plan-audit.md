<!--
pignolo plan-audit template: the part of step 6 of the plan skill that comes after the audit starts.
Plain internal text, in English. `<P>`, `<main>` and `<plan>` are the skill's placeholders.
-->
# Plan audit: rounds, re-audit and what follows the verdict

The gate never changes: `plan.js advance --to audited` needs `APPROVE` tied to the sha256 of the current plan file. Nothing below skips it.

## Verdicts

- `APPROVE`: `advance --to audited --plan-file "<path>"`.
- `REQUEST_CHANGES` (round 1 only): fix the plan (step 5), then run `begin-review` once more: that is round 2, the bounded re-audit.
- `ESCALATE`: it goes to the human, never to another round by itself.
- `minors` never block and are not written into the plan file: that changes its sha256 and the `APPROVE` goes stale. They stay in `plan.json` (`audit.minors`); say so in one line.
- After a cut: `plan-audit.js end --plan <plan>`.

## Blocking findings carry an id

`finish` gives each blocking finding an id (`R1-1`, `R2-1`, `R2x1-1`), in `findings[].id` of its output.

## Bounded re-audit (round 2)

`begin-review` prints `reaudit: true`, the `diff` against the previous round's plan, the `findings` file (the previous blocking findings, with their ids) and `carried` (the ids of unverified claims carried over). Dispatch `pignolo:plan-auditor` in mode `review` with `model: sonnet` and this brief: the diff, the findings file and the plan as context.

- Confirm each previous finding is closed and that the change broke nothing else; do not re-audit what did not change.
- The final `json` block adds `"closed": [ids]`: every previous id you confirm closed. A previous id missing from `closed`, or listed there and also returned as a finding, counts as blocking.
- A finding that is still open goes in `findings` with its previous id in `id`.
- Claims carried over from the previous round are added by the script and verified in step 4: do not repeat them. One that stays unverified makes the verdict `ESCALATE`.
- The fixed probes run as usual; `verify` also covers the carried claims.
