# Activation: confirm when the skill started by itself

Loaded by step 0 of `new`, `improve`, `audit` and `define`. This file gets no substitutions.

## When it applies

- The user typed the command (the turn carries a `<command-name>` tag for this skill): they already chose it. Do not ask; go to step 1.
- The skill started because a normal sentence matched its description (no such tag): ask once, before step 1, and do nothing else first. Never run `env`, read a file of the project or create a run before the answer.
- If the harness does not tell which of the two it was, treat it as started by itself and ask.

## How to ask

One question with the AskUserQuestion tool (never plain text in the chat), two options, the recommended one first and with "(Recomendado)" in its label. Each option's description says what it costs or what it changes, taken from the lines below. The user may write their own answer.

- First option: "Usar pignolo-ui (Recomendado)". Go on with step 1.
- Second option: "Hacerlo directo". End this skill: do not run any step of it, and carry on with what the user asked as in a normal session, without pignolo-ui. Say in one line that you are doing it directly.
- A written answer that asks for something else: do that instead; if it is not clear, ask again once.

Question text in the user's language, short: what you are about to start ("Esto arma pantallas con pignolo-ui. ¿Lo uso o lo hago directo?").

## Option descriptions

Figures are measured ones: `pignolo-ui:ui-option` 0,06 a 0,09 USD per option, `pignolo-ui:ui-auditor` 0,27 a 0,31 USD (docs/benchmarks.md), the judgment reading about 0,3 USD (`costLine` of `run.mjs`). Say "≈" and never add a figure that is not here.

### new

- "Usar pignolo-ui (Recomendado)": "Opciones en el lienzo del proyecto para elegir, ≈ 0,06 a 0,09 USD cada una (3 por defecto), y verificación al final".
- "Hacerlo directo": "Una sola versión, sin opciones ni revisión".

### improve

- "Usar pignolo-ui (Recomendado)": "Versiones mejoradas en el lienzo, ≈ 0,06 a 0,09 USD cada una, y medidas de antes y después; con criterios de juicio suma una lectura del auditor ≈ 0,3 USD".
- "Hacerlo directo": "Cambio la pantalla sin versiones para elegir ni medidas de antes y después".

### audit

- "Usar pignolo-ui (Recomendado)": "Reglas, medidas del navegador y un auditor independiente, ≈ 0,3 USD; cada hallazgo con su evidencia".
- "Hacerlo directo": "Te doy mi opinión de la pantalla, sin medidas ni auditor independiente".

### define

- "Usar pignolo-ui (Recomendado)": "Preguntas interactivas y un tablero visual de colores, tipografía y estilo; escribe PRODUCT.md y DESIGN.md; sin agentes, sin costo medido".
- "Hacerlo directo": "Sin PRODUCT.md ni DESIGN.md; las otras skills de pignolo-ui los van a pedir después".
