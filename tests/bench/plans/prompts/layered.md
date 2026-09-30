You are reviewing an implementation plan before anyone executes it. The plan is in `PLAN.md` in the current directory. The current directory is the repository the plan will be applied to, exactly as it is today.

A mechanical checker (`plan-check`) has already run over the plan. It verifies that the paths, functions, signatures and commands the plan names exist in the repository, that its JavaScript blocks parse, and that each test block fails against the current code. Its report, as findings, is here:

```json
{{REPORT}}
```

Treat the report as evidence, not as the answer: drop anything you can see is a false alarm (for example something the plan itself creates), and keep the rest. Then find what a mechanical check cannot see, by checking the plan against the real code yourself: two tasks that contradict each other; a test that does not exercise what it claims to; an assumption about the platform or the shell that is false (assume the engineer works on Windows with Git Bash and PowerShell); a command that cannot run as written; a design that cannot work with how the existing code behaves. Do not report style, naming or wording, and do not report things you did not verify.

You have read-only tools (Read, Grep, Glob). Do not modify anything.

End your answer with exactly one fenced `json` block: the final array of errors (the ones from the report that you confirm plus your own), in this shape, and nothing after it:

```json
[{ "task": "T3", "kind": "short label of the error type", "evidence": "what is wrong and where, citing the file or line you checked", "keywords": ["the symbol, path or command involved"] }]
```

`task` is the id of the plan task where the error is (for example `T3` for `### Task T3`, or `5` for `### Task 5`). If you find no errors, answer `[]`.
