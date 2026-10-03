# pignolo-ui — Hito 4h: definición inicial antes de todo lo demás. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, una revisión final opus con una pasada de arreglos (CLAUDE.md). Las tarjetas dan archivos, textos obligatorios y casos de test literales; la prosa la escribe el ejecutor. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Origen:** uso real del autor (2026-10-02, G49 de `docs/gaps.md`): en un proyecto nuevo el agente escribió una v1 de las pantallas, `/pignolo-ui:audit` corrió y devolvió mejoras sin `DESIGN.md` ni `PRODUCT.md`, y la ronda de colores, estilo y fuentes nunca apareció porque `new` solo la da con el proyecto vacío.

## Cambios al ejecutar (2026-10-02)

El autor pidió avanzar ya, con pocos scripts, poco testing y el tablero en un artifact. Lo ejecutó el hilo principal en la rama `ui/hito-4h`, **sin commitear**, sin esperar la etapa 2 del lienzo. Diferencias con las tarjetas de abajo:

- **Versión 0.7.6** (no 0.8.1): sale de `main` en 0.7.5. Al unir `exp/lienzo2-x` (0.8.0) hay que reconciliar a mano las tres skills y `present-and-choose.md`, y renumerar.
- **El tablero de direcciones va a un artifact privado** (decisión del autor, reemplaza "colores y fuentes en HTML local" de D-4c para este caso): `define` arma una página propia (`<run>/board/index.html`) con la misma muestra por dirección, la pasa por `leak-check.mjs` y la publica con Artifact después de `publish-gate`. No usa el lienzo "Design" ni `canvas-index.mjs`; el test de contrato tiene una excepción explícita para `define`.
- **La compuerta es una sección propia** (`## Foundation gate`, antes de `## Steps`) en vez de un paso numerado, para no renumerar los pasos que otros textos citan.
- **"Lo que ya hay" no pasa por `approve.mjs save`:** solo las direcciones generadas quedan en `design/approved/direction`.
- **`prepare-run.md`** dejó de proponer un `DESIGN.md` extraído por su cuenta.
- **Tests:** `tests/skill-define.test.mjs` (4 bloques) y ajustes en los tests de `new`, `audit`, contrato, `ui4-fixes` (I-5 ahora mira `define`) y los tres que fijan la versión. Sin demostración de rojo caso por caso. Probado a mano: un `DESIGN.md` con la marca "extraídos, no decididos" en el cuerpo sigue validando; `run.mjs init --command new --slug define` crea la corrida.
- **Revisión opus hecha (2026-10-02):** sin críticos, 4 importantes, los 4 arreglados; sus tests quedaron en `tests/hito-4h-review.test.mjs` (solo se les cambió la ruta del plugin y el helper de carpetas temporales). Arreglos: `design-extract` escribe la marca "extraídos, no decididos" en el cuerpo y `design-patch` la quita al vaciar `pignolo.extracted` (dos cambios chicos de `lib/`, los únicos de script); `define` registra la ruta que imprime `save`, vuelve a pasar `publish-gate` con la corrida antes de Artifact y atiende "no publiques"; el tablero no usa fuentes ni recursos remotos y el aviso dice lo que viaja.
- **Decididas por el autor tras la revisión (2026-10-02):** (D-1) en `new` e `improve`, sin un `DESIGN.md` decidido **no hay salteo**: mandan a `define` y terminan; el salteo queda para `audit` y para cuando solo falta `PRODUCT.md`. (D-3) el pendiente en `CLAUDE.md` queda compartido, con una sola pregunta en las corridas siguientes.
- **Menores sin arreglar (a `docs/gaps.md` si molestan):** `sin definición inicial` no tiene clave en `facts.json`; `product-md.mjs create` acepta `Audience` en `undecided`; textos viejos sobre "un solo camino a Artifact" en `options.md` y `present-and-choose.md`; `define` quedó a 41 caracteres del tope de 12 000.
- **Falta:** cambios de spec, checklist manual (`plugins/pignolo-ui/tests/manual/hito-4h.md`) y la suite completa antes de unir.

**Objetivo:** que ninguna skill de pignolo-ui trabaje sobre una UI cuyo producto y diseño no están definidos. (1) Una skill nueva, `/pignolo-ui:define`, que deja `PRODUCT.md` y `DESIGN.md` decididos con preguntas interactivas y, para lo visual, opciones mostradas en el lienzo. (2) Una compuerta escrita en el texto de `new`, `improve` y `audit` que manda a `define` antes de seguir. (3) Una salida solo por pedido explícito del usuario, que queda anotada como pendiente en el `CLAUDE.md` del proyecto.

**Stack:** Node ≥ 22 sin dependencias npm, ESM `.mjs`, `node:test`. Este hito es casi todo texto de skills: **no agrega scripts ni subcomandos**.

**Prerrequisitos (Task 0, sin código):**
- `main` con la etapa 2 del lienzo unida (pignolo-ui **0.8.0**, rama `exp/lienzo2-x`): toca las mismas tres skills y `present-and-choose.md`. Si todavía no se unió, este hito espera.
- Volver a comprobar sobre el `main` vigente los nombres que el plan consume: `reference/options.md` (`--kind direction`), `reference/present-and-choose.md`, `reference/context.md`, `approve.mjs save --flow direction`, `design-md.mjs` (`validate`, `extract`, `patch --out`), `product-md.mjs create`, `templates/DESIGN.md`, la marca "extraídos, no decididos".
- `git grep -n "foundation.md\|pignolo-ui:define\|sin-definir" plugins/pignolo-ui` no encuentra nada.

## Alcance

- **Adentro (≈ 4 tareas):** la skill `define`; `reference/foundation.md` (la compuerta y la salida); la compuerta en las tres skills; `PRODUCT.md` obligatorio; la ronda de direcciones fuera de `new`; versión, CHANGELOG, README, checklist manual.
- **Afuera:** cualquier script nuevo (la compuerta es prosa, decisión del autor); cambios al auditor, a `ui-option` o a los validadores; evals pagas (ver "Medición").

## Decisiones del autor (2026-10-02)

- **D-4h-1:** la compuerta vive en el texto de las skills, **no en un script**.
- **D-4h-2:** la definición es un paso propio: producto en texto, después direcciones de color, estilo y fuentes, y al elegir se escribe `DESIGN.md`. La ronda de direcciones se da también cuando ya hay una v1 escrita y no existe `DESIGN.md`.
- **D-4h-3:** bloqueo "casi duro": la skill insiste; solo si el usuario pide **explícitamente** no hacer la definición, se sigue sin ella y queda como pendiente en el `CLAUDE.md` del proyecto.
- **D-4h-4:** skill nueva `/pignolo-ui:define`.
- **D-4h-5:** `PRODUCT.md` es obligatorio.
- **D-4h-6:** cada archivo se arma con varias preguntas interactivas cuando hace falta, y con un artifact cuando la decisión es visual.

**Contratos que cambian con estas decisiones** (se dicen primero en el CHANGELOG): `audit` deja de ser "no bloquea nunca" y puede escribir una línea en `CLAUDE.md`; `PRODUCT.md` deja de ser opcional (R-4f-2 y R-4f-4 del hito 4f); `new` ya no hace la ronda de direcciones ni ofrece crear `PRODUCT.md`.

**Pendiente del autor (no frena el plan):** D-4c dice "colores y fuentes en HTML local"; D-4h-6 pide artifact para lo visual. El plan no reescribe esa regla: `define` muestra las fichas por `present-and-choose.md`, que es quien decide lienzo o local. Si el autor quiere las fichas siempre en el lienzo, es un cambio de una línea en ese archivo.

## Global Constraints

- **Nada se escribe sin un diff confirmado:** `PRODUCT.md`, `DESIGN.md` y la línea de `CLAUDE.md`. Nunca se sobrescribe un archivo existente.
- **Un "Ok", un silencio o "seguí" no son un pedido explícito de saltear** (regla del brainstorming del núcleo: un "Ok" no confirma supuestos).
- **Los estilos que dejó un agente no son una decisión:** un `DESIGN.md` con tokens "extraídos, no decididos" no pasa la compuerta.
- **No preguntar lo que ya está en el repo:** README, `package.json`, `CLAUDE.md` y las pantallas existentes se leen antes de preguntar; lo leído se presenta como supuesto a confirmar.
- **4h solo agrega o mueve frases; no rompe las cadenas que fijan los tests de las etapas del lienzo ni de 4f**, salvo las tres que este plan nombra en T3.
- Las skills siguen bajo 12 000 caracteres; `reference/foundation.md` bajo 5 000 y sin variables.
- Hereda las restricciones del hito 4 (sin red, fixtures sintéticos, nombres en inglés, mensajes al usuario en español, commits en español, LF sin BOM, un archivo de test por vez).

## Método de ejecución

- **Rama:** `ui/hito-4h`, desde `main` con el prerrequisito. Un commit por tarea.
- **Orden:** T1 → T2 → T3 → T4 → revisión opus de `main..ui/hito-4h` (puede agruparse con otro hito chico de pignolo-ui) → una pasada de arreglos → suite completa → unión → **0.8.1**.
- **Auditoría previa:** no hace falta (no toca guardia, borrados ni respaldos).
- **Autochequeo del ejecutor (con evidencia):** (1) ninguna de las cuatro skills pasa de 12 000 caracteres; (2) cada lector de "sin PRODUCT.md: se sigue…" quedó con la forma nueva (`git grep`); (3) las cadenas de los tests del lienzo y de 4f siguen en pie; (4) el linter del plugin en verde con la skill nueva; (5) cada afirmación del informe marcada "probado" o "no probado".

## Rulings del plan (técnicos, registrados)

- **R-4h-1: qué es "definido".** `PRODUCT.md` existe en la raíz, con `## Audience` y `## First look` con cuerpo que no sea `undecided` (las otras tres secciones pueden quedar `undecided`). `DESIGN.md` existe en la raíz y no contiene la marca "extraídos, no decididos". La skill lo comprueba leyendo los dos archivos; no hay script.
- **R-4h-2: la compuerta, en cada skill.** Paso propio, justo después de "Environment" y antes de crear el run: dos o tres líneas en el `SKILL.md` (la condición y a dónde manda) y el detalle en `reference/foundation.md`. `define` no lleva compuerta.
- **R-4h-3: cómo insiste.** Si falta algo: decir en una línea qué falta y por qué importa, y preguntar con AskUserQuestion, la recomendada primero: "Definir ahora (recomendado)" / "Seguir sin definir". Si elige seguir sin definir, **una** segunda pregunta que dice qué se pierde (los hallazgos de juicio y las opciones salen sin criterio de producto ni sistema de diseño) y pide confirmarlo. Solo con ese segundo sí se sigue. Sin AskUserQuestion, las mismas dos preguntas en el chat, cada una en un turno del usuario.
- **R-4h-4: el pendiente en `CLAUDE.md`.** Al saltear: agregar a `<repo>/CLAUDE.md` la sección `## pignolo-ui: pendientes` (crearla si no está; crear el archivo solo con esa sección si no existe) con una línea por archivo faltante: `- Falta definir <PRODUCT.md|DESIGN.md> (salteado el <fecha>): correr /pignolo-ui:define`. Se muestra como diff y se escribe con Edit o Write tras la confirmación. Si la línea ya está, no se duplica. `define` la borra al terminar (y la sección, si queda vacía), también con diff.
- **R-4h-5: corridas siguientes con el pendiente anotado.** La compuerta vuelve a decir la línea y hace **una** pregunta (sin la segunda): el usuario ya lo decidió una vez, pero no se deja de recordar.
- **R-4h-6: informe de una corrida sin definir.** La primera línea suma `sin definición inicial`; en `audit`, todo hallazgo `J-nn` se lista aparte bajo "juicio sin contexto de producto ni sistema de diseño".
- **R-4h-7: `define`, parte producto.** Leer el repo; preguntar solo lo que falta, en tandas de hasta 4 preguntas con AskUserQuestion (quién la usa y en qué situación; qué quiere saber primero; tono; qué no se quiere; qué no se toca), con opciones concretas sacadas del repo y "Other" libre. Tope: 2 tandas. Borrador a `<run>/product-draft.md`, diff, y `product-md.mjs create` (el script que ya existe). Si `PRODUCT.md` ya está y le faltan `Audience` o `First look`: completar con diff.
- **R-4h-8: `define`, parte diseño.** Primero lo que se contesta con palabras, en una tanda: registro (`product` o `brand`), temas (claro, oscuro, los dos), densidad. Después lo visual: `<N>` fichas de estilo por `reference/options.md` (`--kind direction`), cada una con paleta, tipografías y una muestra de componentes, mostradas por `reference/present-and-choose.md`; una ronda más, a lo sumo, una de ajuste. Guardado en el orden que hoy tiene `new`: `approve.mjs save --flow direction`, `design-md.mjs patch` sobre la plantilla con diff, `--out <repo>/DESIGN.md`, `approve.mjs record`.
- **R-4h-9: proyecto que ya tiene pantallas.** Una de las `<N>` fichas es "lo que ya hay": se arma con los tokens de `design-md.mjs extract` y se rotula así. Las demás se generan ciegas a esos estilos. Si el usuario elige "lo que ya hay", los tokens dejan de estar "extraídos, no decididos" (se escriben sin la marca). Si `DESIGN.md` ya existe con la marca: se ofrece confirmar lo extraído o ver direcciones.
- **R-4h-10: `new` adelgaza.** Su paso 2 queda en: compuerta, y validar `DESIGN.md`. Se van de `new` la rama "proyecto vacío → fichas" y la oferta de `PRODUCT.md` del paso 3; el límite "One round of directions" pasa a `define`.
- **R-4h-11: versión.** **0.8.1** sobre la 0.8.0 de la etapa 2; si el orden cambia, solo cambia el número. Las etapas 3 y 4 conservan 0.9.0 y 0.10.0.

## Tarjetas

### T1 — `reference/foundation.md` y su test

- [ ] **Archivos:** `plugins/pignolo-ui/reference/foundation.md` (nuevo), `plugins/pignolo-ui/tests/skills-contract.test.mjs`.
- [ ] **Contenido:** R-4h-1, R-4h-3, R-4h-4, R-4h-5 y R-4h-6, con marcadores `<repo>` y `<run>`, sin variables.
- [ ] **Casos de test (un `test()` nuevo, "reference/foundation.md: the gate, the insistence and the pending note (hito 4h)"):**
  - `assertNoVariables(text)` y `text.length < 5000`.
  - incluye cada literal: `PRODUCT.md`, `DESIGN.md`, `extraídos, no decididos`, `/pignolo-ui:define`, `## pignolo-ui: pendientes`, `Definir ahora (recomendado)`, `Seguir sin definir`, `sin definición inicial`.
  - `/an "Ok" .* is not/i` (un "Ok" no es saltear) y `/only with a diff the user confirms/`.
  - `/second question/i` aparece antes de `## pignolo-ui: pendientes`.
  - no nombra ningún script: `scriptCalls(text).length === 0`.
- [ ] **Rojo:** borrar la frase del "Ok" y la del diff; cada una rompe su aserción.

### T2 — skill `define`

- [ ] **Archivos:** `plugins/pignolo-ui/skills/define/SKILL.md` (nuevo), `plugins/pignolo-ui/tests/skill-define.test.mjs` (nuevo), `tests/skills-contract.test.mjs` (`SKILLS` suma `'define'`).
- [ ] **Forma:** frontmatter como las otras (`name: define`, `description` entre comillas, `disable-model-invocation: true`), bloque `## Values` igual al de `new`, `## Steps`: 1 Environment (con `publish-gate` antes de Artifact, mismo texto que `new`); 2 Qué falta (R-4h-1; si no falta nada, decirlo y terminar); 3 Producto (R-4h-7); 4 Diseño en palabras; 5 Direcciones (R-4h-8, R-4h-9); 6 Guardar `DESIGN.md`; 7 Cerrar (borrar el pendiente de `CLAUDE.md`, R-4h-4; decir qué archivos quedaron y qué sigue). `## Limits`: 2 tandas de preguntas de producto, una de diseño, una ronda de direcciones más una de ajuste.
- [ ] **Casos de test:**
  - "define: frontmatter, size, scripts and referenced files exist, Values block first": igual al primer test de `skill-audit.test.mjs` con `'define'`; `referencedFiles` incluye `options.md` y `present-and-choose.md`.
  - "define: product before design, questions before tiles, nothing written without a confirmed diff": `indexOrder(text, ['run.mjs" env', 'publish-gate', 'AskUserQuestion', 'product-md.mjs" create', '--kind direction', 'approve.mjs" save', 'design-md.mjs" patch', '--out <repo>/DESIGN.md', 'approve.mjs" record'])`; incluye `lo que ya hay`, `## pignolo-ui: pendientes`, `never overwrites`; `publish-gate` va antes de `scope: "types"`; no incluye `ui-auditor`.
  - el linter del plugin sigue en `[]`.
- [ ] **Rojo:** invertir producto y diseño en el texto; quitar `publish-gate`.

### T3 — la compuerta en `new`, `improve` y `audit`

- [ ] **Archivos:** los tres `SKILL.md`, `reference/context.md`, `tests/skill-new.test.mjs`, `tests/skill-improve.test.mjs`, `tests/skill-audit.test.mjs`, `tests/skills-contract.test.mjs`.
- [ ] **Texto:** paso nuevo "Foundation" después de "Environment" en las tres (R-4h-2), que carga `reference/foundation.md`. `audit`: la frase de "Limits" pasa a "does not block on findings and does not approve anything… never edits the project, except the pending note of `foundation.md`"; quitar "sin PRODUCT.md: se sigue sin contexto de producto" como ejemplo. `improve`: quitar el mismo ejemplo. `new`: R-4h-10. `context.md`: la parte 1 deja de decir "never stops the flow" para el archivo faltante (inválido sigue avisando y siguiendo) y la parte 3 pasa a "`PRODUCT.md` is created by `/pignolo-ui:define`"; **se conserva** el literal "`improve` and `audit` never create it" y "only with a diff the user confirms".
- [ ] **Cadenas que cambian a propósito (y sus tests):** `'sin PRODUCT.md'` en el test de 4f de `audit` → `'foundation.md'`; la aserción `/does not block|no bloquea/` → `/does not block on findings/`; los tests de `new` que fijan `--kind direction` o la oferta de `PRODUCT.md` pasan a `skill-define.test.mjs`.
- [ ] **Casos de test nuevos:**
  - en cada una de las tres: `indexOrder(text, ['run.mjs" env', 'foundation.md', 'prepare-run.md'])` e incluye `/pignolo-ui:define`.
  - `audit` e `improve`: no incluyen `product-md.mjs` (guarda de regresión).
  - `new`: no incluye `--kind direction` ni `product-md.mjs`.
  - contrato: `define` es la única skill con `--kind direction`.
- [ ] **Rojo:** mover `foundation.md` detrás de `prepare-run.md` en una skill; devolver `--kind direction` a `new`.

### T4 — versión, documentos y checklist manual

- [ ] **Archivos:** `plugins/pignolo-ui/.claude-plugin/plugin.json` (0.8.1), `plugins/pignolo-ui/CHANGELOG.md` (los contratos que cambian, primero), `plugins/pignolo-ui/README.md` (la skill nueva y el orden: `define` primero), `plugins/pignolo-ui/tests/manual/hito-4h.md`, `docs/gaps.md` (G49 a "hecho"), `docs/STATE.md`.
- [ ] **Checklist manual (para la revisión de la v1 por el autor):** proyecto vacío → `audit` manda a `define`; proyecto con v1 sin `DESIGN.md` → aparece la ficha "lo que ya hay" junto a las nuevas; contestar "ok" a la compuerta no saltea; saltear dos veces deja la línea en `CLAUDE.md` y el informe dice `sin definición inicial`; `define` completo borra la línea; segunda corrida con todo definido no pregunta nada.
- [ ] **Test:** el que ya compara la versión de `plugin.json` con el CHANGELOG (guarda de regresión).

## Review Focus (revisión final)

1. **La compuerta no se puede pasar por descuido:** un "Ok" no saltea; las tres skills la tienen antes de crear el run.
2. **Nada escrito sin diff:** `PRODUCT.md`, `DESIGN.md` y `CLAUDE.md`; ninguna sobrescritura.
3. **`CLAUDE.md` del usuario:** la sección no se duplica, no pisa contenido y se limpia al definir.
4. **No se perdió nada de `new`:** el orden `save → patch → --out → record` de las direcciones quedó entero en `define`.
5. **Cadenas del lienzo y de 4f en pie**, salvo las tres de T3.

## Medición

La compuerta es prosa: que el modelo la respete solo se ve corriéndola. No se propone una eval paga (costo: decide el autor); queda el checklist manual de T4 para la revisión de la v1. Si el autor quiere medirlo antes, ficha según `docs/protocolo-de-pruebas.md`: tres casos (vacío, con v1, usuario que contesta "ok"), control = 0.8.0, métrica = corridas que llegan al auditor sin definición.

## Cambios de spec (los aplica el controlador al unir)

`docs/specs/2026-09-28-pignolo-ui-v1-design.md`: la lista de flujos suma `define`; `audit` "no bloquea por hallazgos, sí espera la definición inicial"; `PRODUCT.md` obligatorio; la ronda de direcciones sale de `new`.
