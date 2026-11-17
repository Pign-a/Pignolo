---
name: check-agent-design
description: "Use whenever an architecture or behavior decision about agent or LLM infrastructure is taken, proposed or changed (Azure AI Foundry or another platform; which model, prompt or rubric; where something is validated; what data travels to a model; authentication, network, tracing, retention), in Spanish or English: 'decidamos dónde validamos esto', 'cambiemos el modelo', 'check this agent design', 'is this agent architecture sound'. Searches the web for what documented practice says, looking for evidence against the decision as hard as for it, and verifies the key claims. Proposes, never decides or changes anything. Not for typos, failing tests, renames, or decisions that are not about agent or LLM infrastructure."
---

# check-agent-design: is this decision well founded, or is there a better way

For authors who are not specialists in the platform they build agents on and want to know whether a decision holds before accepting it. It runs when the decision is made, not at a milestone (`validate` does that). It proposes; the author decides. Nothing blocks.

## 1. Frame the decision

Write it in three lines without the preferred conclusion: what is decided, which data it touches, which alternatives exist. The decision as made is one alternative among equals; add the best alternative you know, even if the author did not mention it. Read the project's `CLAUDE.md` and `security.md`: they say which folders agents must not open and what the project must protect.

If the registry already holds the same decision, with sources under 30 days old and unchanged status (GA, preview, retired), reuse the finding and say so. In doubt, run it.

## 2. Choose the agents by evidence

Default: **one** research agent. A single agent is enough to find facts, and every extra agent multiplies cost. Add only with evidence:

- **One agent per alternative** (at most 4), only when there are two or more real alternatives and the decision is big (hard to reverse, or it touches security, data or cost). The decision as made is one more of them, with the same brief, so nobody is assigned to defend or attack. Model choices fit here: one agent per candidate model.
- **A blind second opinion**, only when `security.md` declares sensitive data or the decision is about security, or when the first answer backs a point that has no official guidance. It sees the three-line frame and nothing from the first report. It is a second batch: warn first.
- **A red team that runs tests**, only when the repo has code or fixtures the decision touches. It runs locally, never against a deployed service.

Before launching, say in one or two sentences, in Spanish, which agents and the rough cost (a batch has cost about 300,000 tokens per agent), then continue unless the author objects. Dispatch as `general-purpose` with `model: "sonnet"`, all in one message, all read-only. The brief, the method and the answer format are in `references/brief.md`; give files and context, never your conclusion.

## 3. Verify the key claims yourself

What an agent brings is a claim until you reopen it: the source page, the file, a test you run. Mark each `[abierto por mí]`, `[ejecuté]` or `[agente]` (not reopened). Source status and dates are not trusted without reopening the page today. In a past batch, two of about eleven reopened points came back overstated.

## 4. Register

One row per finding in the project's registry (format and metrics: `references/registry.md`), with status `confirmado`, `refutado`, `riesgo aceptado (<author>, <date>)`, `corregido` or `sin verificar`. A refuted or accepted finding is not raised again unless its source changes.

## 5. Propose an automatic rule

If a finding can be detected by code, propose a test that fails when the anti-pattern returns. Create it only with the author's yes, unless the task in hand is already building tests.

## 6. Report

In Spanish, in this order: the decision and what the sources say for and against; what is our own criterion for lack of official guidance; what you verified and what not; what you propose to change, by priority; what the author has to decide. When several agents ran, compare them on the same points and show where they disagree.

## Limits

- Proposes, does not decide. Nothing is built or deployed because this ran, and it authorizes no change to cloud resources, production or hubs: each keeps asking for its own explicit yes.
- A documented bad practice is not always bad here: check the reason behind the design before proposing to change it.
- Keep three voices apart: "the platform vendor recommends", "another source recommends", "our own criterion". Neutral framing and paired searches are our criterion, not a vendor recommendation.
- If there is no official guidance, say "no encontré guía oficial"; do not invent one.
