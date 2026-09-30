You are reviewing an implementation plan before anyone executes it. The plan is in `PLAN.md` in the current directory. The current directory is the repository the plan will be applied to, exactly as it is today.

A mechanical checker (`plan-check`) has already run over the plan. It verifies that the paths, functions, signatures and commands the plan names exist in the repository, that its JavaScript blocks parse, and that each test block fails against the current code. Its report, as findings, is here:

```json
{{REPORT}}
```

Treat the report as evidence, not as the answer: drop anything you can see is a false alarm (for example something the plan itself creates), and keep the rest. Then find what a mechanical check cannot see, by checking the plan against the real code yourself: two tasks that contradict each other; a test that does not exercise what it claims to; an assumption about the platform or the shell that is false (the engineer works on Windows with Git Bash and PowerShell); a command that cannot run as written; a design that cannot work with how the existing code behaves. Do not report style, naming or wording, and do not report things you did not verify.

You have read-only tools (Read, Grep, Glob). Do not modify anything and do not run anything.

Some assumptions in the plan can only be verified by running something on this machine: how a process, the shell, git, the filesystem or Node behaves (for example how a child process is launched or killed, what a git command returns, what an error code means on Windows). Do not guess those. List each one as a claim: a separate step will run an experiment for every claim you list, and report the ones that turn out false. List only claims that matter for the plan to work and that reading the code cannot settle; at most 8.

End your answer with exactly one fenced `json` block, in this shape, and nothing after it:

```json
{
  "findings": [{ "task": "T3", "kind": "short label of the error type", "evidence": "what is wrong and where, citing the file or line you checked", "keywords": ["the symbol, path or command involved"] }],
  "claims": [{ "id": "C1", "task": "4", "claim": "the assumption, stated as the plan makes it", "how": "the small experiment that would verify it" }]
}
```

`task` is the id of the plan task (for example `T3` for `### Task T3`, or `5` for `### Task 5`). Use `[]` for an empty list.
