# Activation: confirm when the skill started by itself

Loaded by step 0 of `close-session`, `init` and `setup`. `status` only reads and never asks.

## When it applies

- The user typed the command (the turn carries a `<command-name>` tag for this skill): they already chose it. Do not ask; go to step 1.
- The skill started because a normal sentence matched its description (no such tag): ask once, before step 1, and run nothing before the answer.
- If the harness does not tell which of the two it was, treat it as started by itself and ask.

## How to ask

One question with the AskUserQuestion tool (never plain text in the chat), two options, the recommended one first with "(Recomendado)" in its label. Each option's description says what it does. The user may write their own answer.

- First option: the one below with "(Recomendado)". Go on with step 1.
- Second option: "No ahora". End this skill: run no step of it and go back to what the user was doing. Say in one line that nothing was changed.

## Options

Pignolo's own scripts only: no agent is dispatched, so there is no cost to state.

### close-session

- "Cerrar la sesión ahora (Recomendado)": "Junta la evidencia, registra el estado en .pignolo/state, te pregunto cada aprendizaje y hace un commit del estado; sin agentes".
- "No ahora": "Seguimos trabajando; no cambio nada".

### init

- "Activar pignolo en este proyecto (Recomendado)": "Deduzco los ajustes de los archivos y te confirmo paso a paso; solo escribo lo que apruebes; sin agentes".
- "No ahora": "No activo nada; no cambio nada".

### setup

- "Configurar pignolo ahora (Recomendado)": "Reviso el entorno, elegís el perfil de modelos y los permisos, paso a paso; solo escribo con tu sí; sin agentes".
- "No ahora": "No configuro nada; no cambio nada".
