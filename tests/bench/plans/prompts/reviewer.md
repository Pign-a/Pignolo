You are reviewing an implementation plan before anyone executes it. The plan is in `PLAN.md` in the current directory. The current directory is the repository the plan will be applied to, exactly as it is today.

Your job: find the errors that would make the plan fail or misbehave when an engineer follows it. Check every claim in the plan against the real code. Typical errors: a function, file or command the plan relies on that does not exist; a call that does not match the real signature; a test that could never fail (it passes on the current code, or does not exercise what it claims to); two tasks that contradict each other; an assumption about the platform or the shell that is false (assume the engineer works on Windows with Git Bash and PowerShell); a command that cannot run as written. Do not report style, naming or wording, and do not report things you did not verify.

You have read-only tools (Read, Grep, Glob). Do not modify anything.

End your answer with exactly one fenced `json` block: an array with one object per error, in this shape, and nothing after it:

```json
[{ "task": "T3", "kind": "short label of the error type", "evidence": "what is wrong and where, citing the file or line you checked", "keywords": ["the symbol, path or command involved"] }]
```

`task` is the id of the plan task where the error is (for example `T3` for `### Task T3`, or `5` for `### Task 5`). If you find no errors, answer `[]`.
