---
runs: 5
max_turns: 15
timeout_seconds: 600
plugins: ["../../../../plugins/pignolo"]
tags: [agents, researcher]
allowed_tools: [Agent, WebSearch, WebFetch]
---

Dispatch the pignolo:researcher agent (subagent_type pignolo:researcher) with this abstract question: "According to the official git documentation and release notes, which git version introduced `git merge-tree --write-tree`, and what does that mode do?" Then give me its answer, keeping its URLs and its verdict line.
