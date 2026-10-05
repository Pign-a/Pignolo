# Preguntas interactivas y tope a la auditoría del plan (núcleo 0.24.0)

Origen: uso real del autor (2026-10-05). Al armar un plan, pignolo hizo hasta 6 preguntas en texto largo dentro del chat (hay que buscarlas y contestarlas a mano; pedir que las repita gasta tokens), y la auditoría del plan se repitió entera, en opus, cada vez que encontró algo.

## Decisiones del autor (2026-10-05)

- **D-1.** Las preguntas son interactivas (`AskUserQuestion`) en todas las skills del núcleo que preguntan: `plan`, `daily`, `review`, `trivial`, `present`, `close-session`, `entry`. Cita: "Interactivas en todo".
- **D-2.** La auditoría del plan tiene tope: una auditoría completa, una pasada de arreglos y **una** re-auditoría acotada a lo que cambió, en sonnet. Si quedan hallazgos críticos o importantes, van al autor. Los menores no frenan. Cita: "Una re-auditoría acotada".

## Rulings técnicos

- R-1. Presupuesto de preguntas de `plan`: 2 (pedido chico), 4 (mediano), 6 (grande) en vez de 3, 6 y 10. Las preguntas independientes van juntas en una sola llamada (hasta 4).
- R-2. La categoría de cada pregunta sigue siendo obligatoria (spec §4.4): va en el `header` de la pregunta (nombre en el idioma del humano, 12 caracteres como mucho) y en el registro (`plan.js decision add`, `panel.js ask`), no en un bloque de texto.
- R-3. El "detalle técnico" no se escribe por defecto: una línea de contexto antes de la llamada, y el detalle completo solo si el humano lo pide. La `description` de cada opción dice qué pasa, el costo y si se puede deshacer, en una línea.
- R-4. Sin `AskUserQuestion` (`claude -p`, un subagente): se usa la plantilla de texto, corta. La regla ya existe en `templates/activation-confirm.md`; mismo criterio.
- R-5. La compuerta no se afloja: `plan.js advance --to audited` sigue pidiendo `APPROVE` contra el sha256 del plan. Lo único nuevo es que los menores no generan `REQUEST_CHANGES` y que la segunda vuelta con hallazgos da `ESCALATE` en vez de otra vuelta.
- R-6. Un hallazgo sin `severity`, o con un valor desconocido, cuenta como importante (falla cerrado). Los hallazgos de las sondas fijas y los `experiment-false` cuentan siempre como importantes.

## Fuera de alcance

Las skills de pignolo-ui (ya usan `AskUserQuestion` donde preguntan). Cambiar qué mira el auditor. Cambiar el modelo de la primera auditoría.

## Tarjetas

### T1. Plantilla y regla de preguntas

- Archivos: `plugins/pignolo/templates/question.md`; `plugins/pignolo/skills/{plan,daily,review,trivial,present,close-session,entry}/SKILL.md` (solo la regla de cómo preguntar y la línea del panel); `docs/specs/2026-09-26-pignolo-v1-design.md` §4.4 y §4.6 (una nota fechada "decisión del autor, 2026-10-05", sin borrar el texto anterior).
- Interfaz: la plantilla pasa a describir una llamada a `AskUserQuestion` (hasta 4 preguntas; `header` = categoría; primera opción la recomendada, con "(Recomendado)" en el `label`; de 2 a 4 opciones; `description` de una línea con efecto, costo y si se deshace) y el respaldo en texto corto. Una pregunta por mensaje deja de ser regla: las independientes van juntas; una que depende de la respuesta de otra va en la llamada siguiente. La parte del panel (`panel.js ask` / `answer`) queda igual.
- En `plan`: presupuesto 2/4/6 (R-1); el lote de supuestos de bajo riesgo es una sola pregunta con opciones "Van así" y "Cambio alguno"; `question <n> of at most <budget>` pasa al texto de la pregunta o se quita si entorpece; la opción `suficiente` queda como opción de la llamada.
- Tests (literales, en `tests/templates.test.js` y `tests/plan-brainstorm-rules.test.js`, adaptando los que hoy fijan "one per message" y 3/6/10):
  - la plantilla nombra `AskUserQuestion`, "(Recomendado)" y el respaldo en texto;
  - cada una de las siete skills nombra `AskUserQuestion` y ninguna dice "one per message" ni "one question per message";
  - `plan` dice 2, 4 y 6 y ya no 3, 6 y 10;
  - la plantilla sigue listando las 14 categorías cerradas.

### T2. Gravedad en el veredicto de la auditoría

- Archivos: `plugins/pignolo/lib/plan-audit.js` (`buildAudit`), `plugins/pignolo/agents/plan-auditor.md` (la carta dice los tres valores: `CRITICAL`, `IMPORTANT`, `MINOR`, y cuándo usar `MINOR`: no afecta la corrección, los datos ni los requisitos).
- Interfaz: `buildAudit` devuelve además `minors` (los hallazgos `MINOR`); `findings` conserva solo los que frenan. Con solo menores el veredicto sigue la regla de siempre para las afirmaciones (`APPROVE` o `ESCALATE`). R-6 para lo desconocido.
- Tests (`tests/plan-audit*.test.js`, el archivo que ya prueba `buildAudit`):
  - solo `MINOR` y sin afirmaciones abiertas → `APPROVE`, `minors.length === 1`, `findings.length === 0`;
  - un `MINOR` y un `IMPORTANT` → `REQUEST_CHANGES` con un solo finding;
  - `severity` ausente, `"minor "` mal escrito con otro valor (`"LOW"`) → frena;
  - un `experiment-false` frena aunque el revisor no haya dado hallazgos.

### T3. Tope de vueltas

- Archivos: `plugins/pignolo/lib/plan-audit.js`, `plugins/pignolo/scripts/plan-audit.js`, `plugins/pignolo/skills/plan/SKILL.md` (paso 6), `plugins/pignolo/agents/plan-auditor.md` (modo `review` con el encargo de re-auditoría).
- Interfaz:
  - `finish` guarda en el directorio de la auditoría la vuelta (`round`, 1 o 2), el veredicto, los hallazgos que frenaron y una copia del plan auditado.
  - `begin-review` después de un `REQUEST_CHANGES` de la vuelta 1 abre la vuelta 2 e imprime `reaudit: true`, la ruta de un diff del plan (copia de la vuelta 1 contra el archivo actual) y la ruta de los hallazgos de la vuelta 1. Si el plan no cambió (mismo sha256), se niega con un mensaje claro.
  - En la vuelta 2 el veredicto con hallazgos que frenan es `ESCALATE` con `reason: 'reaudit-findings'`, nunca `REQUEST_CHANGES`.
  - Un tercer `begin-review` sin `end` se niega: "la auditoría ya tuvo su re-auditoría; decide el humano". `plan-audit.js end` reinicia (ya existe).
  - La skill: en la vuelta 2 despacha `pignolo:plan-auditor` con `model: sonnet` y el encargo acotado (el diff, los hallazgos de la vuelta 1, el plan como contexto): confirmar que cada hallazgo quedó cerrado y que el cambio no rompió otra cosa; no re-auditar lo que no cambió. Las sondas fijas corren igual. El modo `verify` de la vuelta 2 corre solo sobre afirmaciones nuevas del revisor. Con `ESCALATE` por `reaudit-findings`, la skill muestra los hallazgos al humano con `AskUserQuestion`: "Arreglar y auditar de nuevo" (hace `end` y empieza de cero, con su costo), "Seguir con estos hallazgos anotados" no existe (la compuerta no se salta), "Dejar el plan acá".
  - Los menores se anotan en el plan (sección al final) y se dicen en una línea; no abren vuelta.
- Tests (por los scripts, con directorio temporal de `tests/helpers.js`):
  - vuelta 1 con un importante → `REQUEST_CHANGES`; `begin-review` con el plan cambiado → `reaudit: true` y el diff existe y contiene la línea cambiada;
  - `begin-review` con el plan sin cambiar → se niega;
  - vuelta 2 con un importante → `ESCALATE`, `reaudit-findings`;
  - vuelta 2 limpia → `APPROVE` y `plan.js advance --to audited` pasa con el sha256 del plan nuevo;
  - tercer `begin-review` → se niega; tras `end`, vuelve a vuelta 1;
  - un estado de auditoría viejo, sin `round` → se lee como vuelta 1 (no tira);
  - la skill `plan` nombra `reaudit`, `sonnet` y `reaudit-findings`.

### T4. Cierre

- `plugins/pignolo/.claude-plugin/plugin.json` a `0.24.0`, entrada en `CHANGELOG.md`, los tests que fijan la versión (`tests/changelog-versions.test.js`, `tests/panel-trust.test.js` si corresponde), un caso en `tests/manual/` para que el autor vea las preguntas interactivas de `plan` en una sesión real.

## Autochequeo del ejecutor (cada uno con evidencia)

1. ¿Algún camino deja avanzar a `audited` sin `APPROVE` contra el sha256 del plan actual?
2. ¿Un estado de auditoría viejo, a medias o con JSON roto hace tirar a algún comando, o falla cerrado con un mensaje?
3. ¿Quedó alguna skill, plantilla o test con la forma vieja ("one per message", 3/6/10, tres bloques de texto)?
4. ¿Un informe del auditor que no es UTF-8 o trae `severity` rara frena?
5. Cada afirmación del informe marcada "probado" o "no probado".
