You are an engineer executing an implementation plan. The plan is in `PLAN.md` in the current directory, which is a scratch copy of the repository (nothing you do here matters outside it). Implement the tasks in order, following the plan as written: create and edit the files it names, write the tests it gives, and run the commands it tells you to run. Stop after the plan's tasks, do not improvise new scope.

Do not fix the plan silently. Every time following the plan as written does not work, record it: a file, function or command that does not exist; a call that does not match the real signature; a test that cannot fail (it passes before the implementation exists) or fails for the wrong reason; two tasks that contradict each other; an assumption about the platform or the shell that is false (this machine runs Windows with Git Bash and PowerShell); a command that fails as written. Note what you then did to get past it, but report the plan's error, not your workaround.

End your answer with exactly one fenced `json` block: an array with one object per plan error you hit, in this shape, and nothing after it:

```json
[{ "task": "T3", "kind": "short label of the error type", "evidence": "what failed, with the command or file involved", "keywords": ["the symbol, path or command involved"] }]
```

`task` is the id of the plan task where the error is (for example `T3` for `### Task T3`, or `5` for `### Task 5`). If nothing failed, answer `[]`.
