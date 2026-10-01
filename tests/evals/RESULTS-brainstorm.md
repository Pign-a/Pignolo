# Resultados: el paso de brainstorm de hoy contra el borrador de la skill `brainstorm`

Fecha: 2026-10-01. Windows 11, Claude Code 2.1.285. A/B aprobado por el autor (tope 10 USD). Banco: `tests/bench/brainstorm/` (`run.js`, `ask.js`, `grade.js`, `truth.json`, `manual.json`, `summary.json` con las métricas y todas las preguntas y respuestas).

## Caso

Un pedido real con verdad conocida: el del lienzo "Design" de pignolo-ui, reconstruido como se dijo la primera vez (`request.txt`): pantallas de UI como artifacts tipo Figma; colores y fuentes en HTML. La verdad son 10 decisiones que el autor tomó **después** (`docs/STATE.md`, bloque del 2026-10-01, y la sección "Decisiones del autor" del plan del hito 4c, rama `plan/ui-hito-4c`); ninguna está en el repo del commit de partida (`d0213e8`, el anterior a ese plan), que todavía trae el diseño viejo (consentimiento por proyecto, Design System en v1.1, alto fijo).

| # | Decisión posterior del autor |
|---|---|
| T1 | Un solo lienzo por proyecto, que crece (una página por corrida) |
| T2 | Sin pregunta de consentimiento: un aviso de una línea cada vez que publica |
| T3 | Se elige en el chat y, además, se puede pedir que lea los comentarios del lienzo |
| T4 | Un comentario nunca decide ni se aplica solo; el usuario confirma en el chat |
| T5 | `DESIGN.md` se publica además como "Design System" |
| T6 | El Design System se republica solo cuando cambia `DESIGN.md` |
| T7 | Se mide el alto real de cada pantalla |
| T8 | Lienzo siempre que la cuenta tenga el tipo "Design"; `compare.html` local si no |
| T9 | Si la prueba real falla, se consulta al autor con el resultado; sin plan B decidido |
| T10 | Se vuelven a correr las evals de `ui-option`, tope 3 USD |

## Brazos

- **A:** el texto de hoy de la skill `plan`: el párrafo inicial, las dos reglas sobre el humano y el paso 2 (`prompts/arm-a.md`).
- **B:** el borrador de `tests/bench/brainstorm/draft/SKILL.md` (55 líneas, solo texto, sin scripts).

Cada corrida es un `claude -p` con opus sobre una copia limpia del repo (`git archive` de `d0213e8`), con `--plugin-dir` de la propia copia, `--setting-sources project,local`, `acceptEdits`, Bash permitido solo para `node ask.js`, sin skills ni subagentes, 60 turnos como máximo; termina con el spec escrito. El texto del brazo va en el prompt (`prompts/common.md` es igual para los dos).

**Autor simulado.** `ask.js` corre `claude -p` con sonnet y las 10 decisiones como único conocimiento (`oracle.md`): contesta solo lo que se le pregunta, "No sé, decidí vos" a lo demás, y "Ok." a un mensaje sin pregunta. Anota cada mensaje y respuesta.

Tres corridas por brazo. La sonda (B1) fue válida y no se cambió nada después, así que cuenta como la primera corrida de B.

## Resultados

| Corrida | Mensajes al autor | Preguntas | Devueltas por el autor ("no sé", "es técnico") | Con respuesta en el repo | Palabras del autor | Decisiones cubiertas (a mano) | Contrarias sin marcar | USD | Minutos | Tokens de salida |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 4 | 4 | 1 | 0 | 85 | 4 (T2 T5 T6 T8) | 0 | 1,08 | 3,5 | 16,5 mil |
| A2 | 6 | 6 | 1 | 0 | 116 | 6 (T2 T4 T5 T6 T8 T10) | 1 (T7) | 0,96 | 3,7 | 15,1 mil |
| A3 | 3 | 3 | 0 | 0 | 62 | 5 (T2 T4 T5 T8; T6 como propuesta sin aprobar) | 0 | 0,81 | 2,2 | 11,6 mil |
| B1 | 2 | 1 | 0 | 0 | 15 | 1 (T4) | 3 (T2 T5 T8) | 1,27 | 4,0 | 21,2 mil |
| B2 | 5 | 4 | 1 | 0 | 112 | 3 (T2 T7 T8) | 1 (T5) | 1,33 | 4,0 | 19,7 mil |
| B3 | 4 | 3 | 0 | 0 | 89 | 6 (T2 T4 T5 T6 T8 T9) | 1 (T10) | 1,25 | 3,6 | 18,1 mil |

| Brazo | Preguntas | Palabras del autor | Decisiones cubiertas de 10 | Contrarias sin marcar | USD por corrida | Minutos |
|---|---|---|---|---|---|---|
| A (paso 2 de hoy) | 4,3 | 88 | **5,0** (4 a 6) | 0,3 | **0,95** | 3,1 |
| B (borrador `brainstorm`) | 2,7 | 72 | 3,3 (1 a 6) | 1,7 | 1,28 | 3,9 |

Gasto total: **6,74 USD** (6 corridas: 6,71, de los que 0,44 son del autor simulado; 0,04 de dos llamadas de prueba al autor simulado). Los tokens de entrada son casi todos de caché (0,5 a 0,75 millones por corrida).

**Cómo se contó.** "Cubierta" = el spec dice lo que el autor decidió, o lo deja a la vista como supuesto, propuesta sin aprobar o pregunta pendiente. Se validó a mano, spec por spec (`manual.json`). El script por palabras clave (`grade.js`, límites de palabra) dio A 4, 6, 3 y B 2, 4, 5: acierta el orden pero se equivoca en las dos direcciones (contó como cubierta "Design System" cuando el spec lo dejaba fuera, y no vio T8 dicho con otras palabras). Las cifras de la tabla son las de la validación a mano (gap G11).

## Qué dicen los datos

1. **B no gana.** Por la regla fijada antes de correr (gana B si cubre más decisiones conocidas sin duplicar las palabras del autor): B cubrió menos (3,3 contra 5,0), con más dispersión, y costó ≈ 35 % más. No duplicó las palabras del autor (72 contra 88), pero eso solo no alcanza.
2. **Ningún brazo preguntó algo que el repo ya contestaba** (0 de 21 preguntas). La regla "si está en el repo no se pregunta" no hizo diferencia en este caso.
3. **El mensaje de "lo que entendí" de B es su punto débil.** En B1 y B2 el autor contestó "Ok." a ese resumen, que suponía el consentimiento por proyecto del diseño viejo. B1 lo dio por confirmado: lo escribió como decisión del autor con la cita "Ok." y cerró con una sola pregunta. B2 se salvó porque volvió a poner el mismo supuesto en el lote, y ahí el autor lo corrigió. Un "ok" a un resumen no es una decisión; el borrador no lo dice.
4. **El lote de supuestos de bajo riesgo fue lo que más rindió en B.** En B2 un solo mensaje destapó tres decisiones (T2, T7, T8) y en B3 una (T6). T7 (alto real) y T9 (sin plan B) solo aparecieron en B.
5. **B trató las decisiones viejas del repo como hechos.** El borrador dice que una decisión anterior es evidencia y no respuesta, pero B solo preguntó por R10; el consentimiento y el Design System en v1.1 quedaron como "ya decidido". A, sin esa clasificación, los puso como opciones de una pregunta y el autor los corrigió.
6. **La recomendada primera se cumplió** en todas las preguntas de B, y la recomendación fue contraria a lo que el autor quería en la pregunta sobre R10 (B2 y B3 recomendaron dejarlo para v1.x).
7. **Nadie llegó a T1 (un lienzo por proyecto) ni a T3 (leer comentarios a pedido)** en ninguna de las seis corridas: son decisiones que el autor tomó al ver el primer diseño, no al contestar preguntas.
8. **B dejó lo que promete:** el árbol y el archivo de decisiones en 3 de 3 corridas, y las secciones fijas del spec. A no deja nada de eso.

## Veredicto

Por la regla del diseño: **se queda el paso de hoy y se le suman las reglas baratas**. Con estos datos el borrador de `brainstorm` no se construye tal cual. Lo que el experimento sugiere probar antes de volver a medir (decisión del autor):

- Un "ok" al resumen no confirma supuestos: lo que el resumen supone y toca algo reservado va en el lote o en una pregunta.
- Toda decisión anterior del repo que el pedido roza entra al lote de supuestos, no a "hechos".
- Conservar el lote de supuestos y la recomendada primera.

## Límites

- Un solo pedido y tres corridas por brazo: orden de magnitud. La dispersión de B (1 a 6) es mayor que la diferencia entre brazos.
- El autor simulado no es el autor. Contesta "Ok." a un resumen sin pregunta (regla del banco); un autor real podría corregirlo, y en B3 el simulado sí lo corrigió. Eso solo perjudica a B, que es el único brazo que manda ese resumen.
- El autor simulado contradijo el pedido en A1 y A3 (dijo que colores y fuentes iban al "Design System" en vez de HTML local) y en A2 eligió una lectura que el pedido no dice: no tenía entre sus decisiones qué significa esa frase. No cambia el conteo de T1 a T10, pero esos tres specs de A tratan mal una frase del pedido, y la respuesta le regaló T5 a A1 y A3.
- No se midió lo que venía después (hallazgos del `spec-reviewer`, `A<n>`, auditoría del plan): no entraba en el tope. "Menos defectos posteriores" queda sin dato; "contrarias sin marcar" es lo más cercano.
- Las skills y los scripts no corrieron: el texto de cada brazo fue en el prompt y los pasos con scripts se saltearon. El árbol de B no lo validó ningún script.
- Las decisiones T1 a T10 las eligió quien armó el banco a partir del plan del hito 4c; otra lista daría otros números.
