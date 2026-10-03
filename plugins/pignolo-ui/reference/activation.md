# Activation: confirm when the skill started by itself

Loaded by step 0 of `new`, `improve`, `audit` and `define`. This file gets no substitutions.

## When it applies

- The user typed the command (the turn carries a `<command-name>` tag for this skill): they already chose it. Do not ask; go to step 1.
- The skill started because a normal sentence matched its description (no such tag): ask once, before step 1, and do nothing else first. Never run `env`, read a file of the project or create a run before the answer.
- If the harness does not tell which of the two it was, treat it as started by itself and ask.
- If the AskUserQuestion tool is not available (`claude -p`, a subagent without it), do not go on by yourself: say in one line that this needs the human's confirmation and end the skill without doing anything else. The exception is when the user typed the command (first bullet).

## How to ask

One question with the AskUserQuestion tool (never plain text in the chat), two options, the recommended one first and with "(Recomendado)" in its label. Each option's description says what it costs or what it changes, taken from the lines below. The user may write their own answer.

- First option: "Usar pignolo-ui (Recomendado)". Go on with step 1.
- Second option: "Hacerlo directo". End this skill: do not run any step of it, and carry on with what the user asked as in a normal session, without pignolo-ui. Say in one line that you are doing it directly: that line is the record of the choice in the conversation, and `pignolo:entry` honors it for that request (it does not send it back to pignolo-ui).
- A written answer that asks for something else: do that instead; if it is not clear, ask again once.

Question text in the user's language, short: what you are about to start ("Esto arma pantallas con pignolo-ui. ¿Lo uso o lo hago directo?").

## Option descriptions

Figures are measured ones: `pignolo-ui:ui-option` 0,06 a 0,09 USD per option, `pignolo-ui:ui-auditor` 0,27 a 0,31 USD (docs/benchmarks.md), the judgment reading about 0,3 USD (`costLine` of `run.mjs`). `new` and `improve` always dispatch `ui-auditor`, so the recommended option states its cost on top of the options. The 0,06 to 0,09 figure is for sonnet; with the `max` profile the options run on opus, which has no USD figure in the repo (only 10 to 17 % more tokens and 2 to 3 times the time, `docs/benchmarks.md` 2e): say so without a number. Say "≈" and never add a figure that is not here.

### new

- "Usar pignolo-ui (Recomendado)": "Opciones en el lienzo del proyecto para elegir, ≈ 0,06 a 0,09 USD cada una (3 por defecto), y un auditor independiente al final ≈ 0,27 a 0,31 USD; con el perfil max las opciones van en opus (10 a 17 % más tokens y 2 a 3 veces más tiempo; sin cifra en USD)".
- "Hacerlo directo": "Una sola versión, sin opciones ni revisión".

### improve

- "Usar pignolo-ui (Recomendado)": "Versiones mejoradas en el lienzo, ≈ 0,06 a 0,09 USD cada una, medidas de antes y después y un auditor independiente ≈ 0,27 a 0,31 USD; con el perfil max las versiones van en opus (10 a 17 % más tokens y 2 a 3 veces más tiempo; sin cifra en USD); con criterios de juicio suma una lectura del auditor ≈ 0,3 USD".
- "Hacerlo directo": "Cambio la pantalla sin versiones para elegir ni medidas de antes y después".

### audit

- "Usar pignolo-ui (Recomendado)": "Reglas, medidas del navegador y un auditor independiente, ≈ 0,3 USD; cada hallazgo con su evidencia".
- "Hacerlo directo": "Te doy mi opinión de la pantalla, sin medidas ni auditor independiente".

### define

- "Usar pignolo-ui (Recomendado)": "Preguntas interactivas y un tablero visual de colores, tipografía y estilo; escribe PRODUCT.md y DESIGN.md; sin agentes, sin costo medido".
- "Hacerlo directo": "Sin PRODUCT.md ni DESIGN.md; las otras skills de pignolo-ui los van a pedir después".
