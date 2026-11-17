---
name: check-decision
description: "Use whenever an architecture or behavior decision is taken, proposed or changed in a project that builds agent or LLM infrastructure (Azure AI Foundry, model choice, prompts, rubrics, where something is validated, what data travels to a model, authentication, network, tracing, retention), in Spanish or English: 'decidamos si el Hub valida esto', 'cambiemos el modelo', 'dónde validamos', 'check this decision', 'is this architecture sound'. Checks the decision against documented good practice, runs a red team and verifies the claims. Proposes, never decides or changes anything. Not for typos, failing tests or renames."
---

# check-decision: is this decision well founded, or is there a better way

For authors who are not specialists in the platform they build on and want to know whether a decision holds before accepting it. It runs when a decision is made, not at a milestone (`validate` does that). It proposes; the author decides. Nothing blocks.

## 1. Frame the decision

Write it in three lines, without the preferred conclusion: what is decided, which alternatives exist, which data it touches. Read the project's `CLAUDE.md` and `security.md` first: they say which folders agents must not open (a `docs/` with historical secrets, for example), where the registry lives if it is not the default, and what the project must protect.

If the same decision is already in the registry, its sources are under 30 days old and their status (GA, preview, retired) has not changed, reuse the finding and say so. In doubt, run it.

## 2. Launch, in one batch

Say in one or two sentences, in Spanish, which agents you launch and the rough cost (a batch of three has cost about 300,000 tokens per agent), then continue unless the author objects. Warn before a second batch for the same decision.

Dispatch with the Agent tool as `general-purpose` with `model: "sonnet"`, all in the same message, all read-only. The brief for each, the rules they follow and the three roles (validator, red team, models and uses) are in `references/brief.md`. Give them files and context, never your conclusion.

## 3. Verify what matters yourself

What the agents bring is a claim until you reopen it. Reopen the central ones (source page, file, a test you run) and mark each `[abierto por mí]`, `[ejecuté]` or `[agente]` (not reopened). Agents have overstated roughly one point in five: that is why this step exists. Source status and dates are not trusted without reopening the page today.

## 4. Register

One row per finding in the project's registry (format and metrics: `references/registry.md`), with status `confirmado`, `refutado`, `riesgo aceptado (<author>, <date>)`, `corregido` or `sin verificar`. A refuted or accepted finding is not raised again unless its source changes.

## 5. Propose an automatic rule

If a finding can be detected by code, propose a test that fails when the anti-pattern comes back. Propose it; create it only with the author's yes, unless the task in hand is already building tests.

## 6. Report

In Spanish, in this order: the decision and what the sources say for and against; what is our own criterion for lack of official guidance; what you verified and what not; what you propose to change, by priority; what the author has to decide.

## Limits

- Proposes, does not decide. Nothing is built or deployed because this ran, and it authorizes no change to cloud resources, production or hubs: each keeps asking for its own explicit yes.
- A documented bad practice is not always bad here: check the reason behind the design before proposing to change it.
- Keep three voices apart: "the platform vendor recommends", "another source recommends", "our own criterion".
- If there is no official guidance, say "no encontré guía oficial"; do not invent one.
