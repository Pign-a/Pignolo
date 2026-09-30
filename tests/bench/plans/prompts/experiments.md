You are reviewing an implementation plan before anyone executes it. The plan is in `PLAN.md` in the current directory. The current directory is the repository the plan will be applied to, exactly as it is today.

A mechanical checker (`plan-check`) has already run over the plan. It verifies that the paths, functions, signatures and commands the plan names exist in the repository, that its JavaScript blocks parse, and that each test block fails against the current code. Its report, as findings, is here:

```json
{{REPORT}}
```

Treat the report as evidence, not as the answer: drop anything you can see is a false alarm (for example something the plan itself creates), and keep the rest. Then find what a mechanical check cannot see, by checking the plan against the real code yourself: two tasks that contradict each other; a test that does not exercise what it claims to; an assumption about the platform or the shell that is false (the engineer works on Windows with Git Bash and PowerShell, which is also the machine you are on); a command that cannot run as written; a design that cannot work with how the existing code behaves.

Some claims can only be verified by running something: how a process, a command, git, the filesystem or Node behaves on this machine. For those, and only those, run small targeted experiments with Bash: a few lines of `node -e`, a throwaway git repo, one command. Do them in the scratch folder `{{SCRATCH}}` (outside the repository), never in the repository, and do not implement the plan: one experiment per risky claim, each a few seconds. A safety guard is active: it blocks inline code that launches processes or runs git (`node -e`, `python -c` and similar). Write each experiment as a small script file in the scratch folder with the Write tool and run it with `node <file>`; if a command is blocked, use the alternative the block message names instead of giving up. Try to run at least the experiments for the claims you consider most at risk. Report what the experiment showed as evidence. Do not report style, naming or wording, and do not report things you did not verify.

End your answer with exactly one fenced `json` block: the final array of errors (the ones from the report that you confirm plus your own), in this shape, and nothing after it:

```json
[{ "task": "T3", "kind": "short label of the error type", "evidence": "what is wrong and where, citing the file, line or experiment output", "keywords": ["the symbol, path or command involved"] }]
```

`task` is the id of the plan task where the error is (for example `T3` for `### Task T3`, or `5` for `### Task 5`). If you find no errors, answer `[]`.
