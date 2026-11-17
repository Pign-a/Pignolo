# Brief for the agents of check-decision

Give each agent: the three-line decision, the files to read (paths), the folders it must not open (from the project's `CLAUDE.md`/`security.md`) and the role below. Do not give your conclusion. Do not tell it which answer you expect.

## Rules for every agent (not negotiable)

- Read whole pages (`microsoft_docs_fetch` or `WebFetch`); search-engine snippets are not a source.
- Per finding: exact URL, last-updated date, status (GA, preview, retired), what it says paraphrased, and a mark: DATO (the source or file states it), INFERENCIA or SUPUESTO.
- If there is no official guidance, write "no encontré guía oficial".
- Read-only. Open nothing outside the files given; never the folders marked off-limits. Touch no cloud resource, hub or production.
- Write the full report to a file in the session's scratchpad and return a short summary with its path.

## Roles

**Validator.** Checks the decision against the platform vendor's documentation (for Azure: Microsoft Learn, Architecture Center, Well-Architected, Foundry, Zero Trust for AI); where the vendor has no guidance, against OWASP Top 10 for LLM applications, NIST AI RMF and its generative-AI profile, and MITRE ATLAS. It must look for the evidence in favor of the decision as hard as for the faults.

**Red team.** Reads the documents and the code, runs tests where it can (feeds the validator hostile text, reads the real code path) and looks for leaks, evasions, fragile controls and what is missing. It runs only against local code and fixtures, never against a deployed service.

**Models and uses** (only if the decision depends on the model). Which models and which usage ideas exist, with sources and their status.
