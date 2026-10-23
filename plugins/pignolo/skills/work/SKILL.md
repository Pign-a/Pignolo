---
name: work
description: Use when the user asks to build, change or fix something in a project, in Spanish or English: 'arreglá este bug', 'agregá esta feature', 'hagamos este cambio', 'implementá esto', 'fix this bug', 'add this feature', 'implement this'. Sizes the effort to the risk and to what cannot be undone, not to the number of lines.
---

# work: ceremony proportional to risk

Every step of process costs the author time and tokens, and each one has to buy something. So the amount of ceremony follows two things: how much can go wrong, and how hard it is to undo. Line count is a poor proxy for either. Decide the level first, say it in one line to the author (in Spanish), and start. Nothing here blocks: if the author disagrees with the level, move to theirs.

## Three levels

**Small** (a bug, a script, a one-sentence change). Do it directly, with no spec and no plan, because the overhead would outweigh the change. Run one real check that exercises the change (the test, the command, the page), not just a syntax check, since "it should work" is the claim that fails most often. Show the evidence in the reply.

**Feature.** Write a short card first (format in `references/card.md`): it makes the scope visible in a minute and gives the review something to compare against. Write the test first only when a relevant executable test exists, because a red test you cannot run proves nothing. Use one executor, since a second one adds coordination cost and rarely speed. Do one review at the end, against the card, not after every step.

**Large or high risk.** Write a short spec and have the author review it before building: a wrong assumption here is the expensive kind. Cut the work into small milestones and re-plan each one with what the previous one taught you, because the plan is the part most likely to be wrong. Each milestone gets an independent review, since problems compound if they are found late.

## The fixed floor

If the change touches migrations, authentication, secrets or data deletion, it is never "small", whatever its size, because these are the places where a one-line mistake is irreversible or leaks something: a migration can lose data, an authentication slip opens access, a committed secret stays in history, a deletion cannot be taken back. At least the feature level applies, with the review looking specifically at that risk. Everything else is your judgment; the floor is the only fixed rule.

## Stay in the main thread

Small things and delegation decisions are resolved in the main thread. Launch a subagent only when you can name the reason:

- a long exploration (more than about 3 reads or 10 thousand tokens), to keep that noise out of the main context;
- parallel writers on different files, because they cannot collide;
- context relief, when the main thread is getting full;
- an independent verifier in high-risk work, because the author of a change is the worst person to check it.

Without one of these, a subagent only adds cost and loses detail in the hand-off.

## Before a large change

Check `git status`. If there is uncommitted work and the change is large, warn the author and suggest a checkpoint commit, saying why: it makes the change easy to undo. Suggest it, never impose it; if the author declines, continue.

## Missing documents

`security.md`, `design.md` and the roadmap are useful when present, and `work` reads them: they tell you what the project protects and how it should look. When they are absent, do not stop and do not demand them. Work from the evidence in the repo, and offer `/pignolo:start` once, at the end, only if it would have changed a decision.

## Closing

Report in Spanish: what changed, which check ran and its result, and anything not verified, stated as "not verified" rather than left out.
