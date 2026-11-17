# Brief for the agents of check-agent-design

Give each agent: the three-line frame, the files to read (paths), the folders it must not open (from the project's `CLAUDE.md` or `security.md`), its role and the answer format below. Do not give your conclusion or the answer you expect. The reason: an agent told what you hope to find searches for that.

## Method (research agent, and each per-alternative agent)

1. **Before searching**, write two lists: what evidence would show the option is wrong, and what would show it is right. Add the alternatives you know.
2. **Search wide, then narrow.** Start with short, broad queries, see what exists, then refine. Run queries in pairs: "<option> recommendations" with "<option> problems, limitations, deprecated, retired"; and "<option> vs <alternative>". A one-sided search finds one-sided evidence.
3. **Prefer primary sources**: the platform vendor's documentation, standards, specifications, official repositories. Where there are none, use OWASP Top 10 for LLM applications, NIST AI RMF and its generative-AI profile, MITRE ATLAS, and say which kind each source is. Treat SEO-style blogs as leads, not as sources.
4. **Read whole pages** (`microsoft_docs_fetch` or `WebFetch`); search snippets are not a source.
5. **Per finding**: exact URL, last-updated date, status (GA, preview, retired), what it says in your words, and a mark: DATO (the source or file states it), INFERENCIA or SUPUESTO.
6. **Keep competing hypotheses** until the evidence separates them, and note your confidence in each conclusion.
7. **Report everything you find**, not only the serious items; the main thread ranks and discards. An agent asked only for the serious ones under-reports.
8. **Stop when you have enough.** If an official source does not exist after a reasonable search, write "no encontré guía oficial" and stop looking.
9. **End with a verdict**, one of: `bien fundada`, `hay una mejor`, `mal fundada`, `sin guía oficial`. Give the strongest case for and the strongest case against, even when you conclude one way. State what you did not look at.

## Roles

- **Research agent (default).** The method above, on the decision as made and its alternatives.
- **Per-alternative agent.** The same method, restricted to the one option it is assigned, using the same answer format as the others. Do not argue for or against it: report what the evidence says.
- **Blind second opinion.** The same method from the frame alone. It does not see any other report.
- **Red team** (only with code or fixtures to attack). Read the documents and the code, run tests where you can (feed the validator hostile text, follow the real code path) and look for leaks, evasions, fragile controls and what is missing. Local code and fixtures only.

## Limits (with their reason)

- Read-only, because the output is advice and a change here would skip the author's decision.
- Open nothing outside the files given and never the folders marked off-limits, because they can hold secrets.
- Touch no cloud resource, hub or production: use of a live system needs the author's own yes.
- Write the full report to a file in the session's scratchpad and return a short summary with its path.
