A reviewer read an implementation plan (`PLAN.md` in the current directory, applied to the repository in the current directory) and listed assumptions it makes that can only be verified by running something on this machine (Windows, with Git Bash and PowerShell). Your only job is to run one experiment per claim and report which claims are false.

The claims:

```json
{{CLAIMS}}
```

For each claim, in order:

1. Write a small script in the scratch folder `{{SCRATCH}}` with the Write tool (outside the repository; never write in the repository, and do not implement the plan).
2. Run it with Bash: `node <file>` (or a single plain command such as `git ...` inside the scratch folder). A safety guard blocks inline code that launches processes or runs git (`node -e`, `python -c` and similar): always use a script file. If a command is blocked, use the alternative the block message names.
3. Read the real output and decide whether the claim holds on this machine.

Each experiment should take a few seconds. Kill any process your experiment starts. Every claim needs its own experiment: you will not be allowed to finish until you have run at least one per claim.

The reviewer's findings, which you keep as they are:

```json
{{FINDINGS}}
```

End your answer with exactly one fenced `json` block, and nothing after it: the reviewer's findings above, unchanged, plus one finding for each claim your experiment showed to be FALSE, in this shape:

```json
[{ "task": "4", "kind": "short label of the error type", "evidence": "the claim, the command you ran and its real output, and why that makes the plan wrong", "keywords": ["the symbol, path or command involved"] }]
```

Claims the experiment confirmed as true are dropped. `task` is the claim's task. If nothing is left, answer `[]`.
