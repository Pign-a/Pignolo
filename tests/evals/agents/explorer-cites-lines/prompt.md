---
runs: 5
max_turns: 15
timeout_seconds: 300
plugins: ["../../../../plugins/pignolo"]
tags: [agents, explorer]
allowed_tools: [Agent, Read, Grep, Glob]
---

The current directory holds a small order service. Dispatch the pignolo:explorer agent (subagent_type pignolo:explorer) with this brief: "Read the files under src/ and tests/ and answer where and how an incoming order is validated, and which file calls the validation." Then give me its answer, keeping the path:line references.
