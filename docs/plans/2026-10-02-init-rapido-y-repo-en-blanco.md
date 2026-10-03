# Plan: `init` y `setup` rápidos, y el repositorio en blanco (núcleo 0.15.0)

Decisión del autor, 2026-10-02. Método liviano: tarjetas, un ejecutor en serie, el rojo de cada test nuevo se demuestra rompiendo lo que protege. Rama `core/init-rapido`; sin push ni merge.

## Decisiones del autor (no se reabren)

- **D-1, repo en blanco:** avisar y dejar. `init` detecta que no hay nada que configurar, lo dice en dos o tres líneas, crea solo el esqueleto de carpetas y lo que no depende de la detección (`ignores`, `gitattributes`, `reflog`), no escribe `type` ni compuertas, no recorre los otros pasos y pide volver a correr `/pignolo:init` cuando haya código. El esqueleto se crea tras una sola pregunta sí/no. No instala nada.
- **D-2, proyecto existente en una pantalla:** `init` detecta todo, muestra un resumen corto en lenguaje llano con lo que recomienda y ofrece tres opciones: aplicar lo recomendado, revisar punto por punto (el recorrido de hoy) o cancelar. Solo pregunta lo que no puede detectar (repo público, datos sensibles, contacto de seguridad). Igual en `setup`.
- **D-3, detalle a pedido:** por defecto solo la parte llana; el detalle técnico (claves internas, `sources`, comandos) solo si el humano lo pide o algo falla.
- **D-4, preguntas con opciones:** donde la respuesta es un conjunto cerrado, la skill indica `AskUserQuestion` (recomendada primero y marcada, hasta 4 preguntas por llamada) y cae a texto solo si la herramienta no está. Texto libre solo para lo que no tiene opciones.
- No cambia: `apply` exige el sí explícito del humano en su turno (una opción elegida en el selector cuenta como ese sí solo para el plan exacto mostrado); `init` nunca lee el contenido de la auto-memoria ni de las reglas de dominio; vista previa antes de aplicar, `stale-preview` y commit solo con un sí.

## Tarea 1: detección de proyecto en blanco (`lib/init-blank.js`, `init.js detect`)

Archivos: `plugins/pignolo/lib/init-blank.js` (nuevo), `plugins/pignolo/scripts/init.js` (campos en `detect`), `tests/init-blank.test.js` (nuevo).

Interfaz: `blankProject({ root, fs? }) -> { blank, reason, firstFile }`. `reason` es `empty` (sin nada fuera de lo oculto), `only-plain-docs` o `has-files`; `firstFile` es la primera ruta que impide el blanco. `detect` suma `blank`, `blankReason`, `blankFirstFile`.

Definición (conservadora, sin leer contenido): es blanco si todo lo que hay en el disco es una de estas cosas, y nada más. (a) Cualquier cosa cuyo nombre empiece con `.` (carpetas y archivos ocultos: `.git`, `.claude`, `.gitignore`, `.pignolo`). (b) En la raíz, `README`, `LICENSE`, `LICENCE`, `COPYING`, `NOTICE` o `AUTHORS`, con o sin `.md/.markdown/.txt/.rst`, sin distinguir mayúsculas. (c) Los README del esqueleto de `init` (`docs/specs/README.md`, `docs/plans/`, `docs/research/`, `docs/references/`, `design/`, `local/`), para que volver a correr `init` sobre un repo en blanco siga viéndolo en blanco. Todo lo demás, incluido un `docs/` con otros markdown, un manifiesto, un enlace o una junction, o una carpeta desconocida, hace que NO sea blanco. No usa `git ls-files` (cuenta lo ignorado y lo sin commits). Si no puede leer la raíz, `detect` falla (`blank-unknown`) y no adivina.

Tests literales (tabla): repo recién `git init` -> blanco `empty`; solo `README.md` + `.gitignore` + `.claude/settings.local.json` -> blanco `only-plain-docs`; un `.js` -> no; un `package.json` (también uno ilegible) -> no; `docs/` solo con markdown de usuario -> no; sin commits pero con archivos de código -> no; carpeta `src/` vacía -> no; `readme.MD` y `License` con otra capitalización -> blanco; README con bytes no UTF-8 -> blanco (no se lee); un archivo `ñ.txt` -> no; un enlace/junction en la raíz -> no; esqueleto de `init` solo -> blanco; esqueleto más `docs/specs/idea.md` -> no. Y por CLI: `detect` en un `git init` trae `blank: true`.

## Tarea 2: el camino en blanco en `init.js`

Archivos: `plugins/pignolo/scripts/init.js`, `tests/init-blank-cli.test.js` (nuevo).

Interfaz: `BLANK_STEPS = ['ignores', 'gitattributes', 'reflog', 'skeleton']`. En `preview` y `apply`, si el repo es blanco y `approved` trae un paso fuera de `BLANK_STEPS`, falla cerrado: `kind: blank-project`, exit 1, con `Alternativa:`. Un blanco no escribe `project.md` (ni `type` ni compuertas). Al aplicar sin fallos deja la marca `.pignolo/tmp/init-blank.json` (la carpeta `tmp/` ya la ignora `.pignolo/.gitignore`; si ese ignore no está, no la escribe). `verify` suma `blank`.

Tests literales: en un blanco, `preview` con `ALL` falla con `blank-project` y no escribe; con `BLANK_STEPS` devuelve solo esos cuatro pasos; `apply` crea los README del esqueleto y no crea `.pignolo/project.md`; `apply` con `ALL` también falla (`blank-project`) y el árbol queda igual; tras `apply` el repo sigue en blanco; después de sumar un `package.json` con vitest, `detect` ya no es blanco, `preview` con todo propone `type` y compuertas, `apply` escribe `project.md` y conserva los README que había creado el blanco.

## Tarea 3: aviso en `next` y en SessionStart

Archivos: `plugins/pignolo/lib/next.js`, `tests/next-blank.test.js` (nuevo).

Interfaz: `deriveNext` devuelve `kind: 'init-blank-ready'` con una sola línea cuando existe la marca de la Tarea 2, no existe `.pignolo/project.md` y el repo ya no es blanco. Prioridad la más baja (después de plan, flujo y cola). Solo lectura.

Tests literales: con marca y un manifiesto nuevo -> `init-blank-ready`; con marca y sigue en blanco -> `nothing`; con marca, manifiesto y `project.md` -> `nothing`; sin marca y con manifiesto -> `nothing`; con un plan abierto gana el plan; `next.js --text` imprime la línea; el handler `session-start` la lleva al contexto.

## Tarea 4: `summary` en `detect`

Archivos: `plugins/pignolo/lib/init-summary.js` (nuevo), `plugins/pignolo/scripts/init.js`, `tests/init-summary.test.js` (nuevo).

Interfaz: `detect.summary = { mode: 'blank'|'existing', recommended: [<ids de paso>], recommendedPlaces: { <tipo>: { decision: 'adopt', from } }, proposal: {...}, ask: [{ id, kind }], optional: [<ids>], attention: [<códigos>] }`. `recommended` en blanco es `BLANK_STEPS`; en un proyecto existente suma `project-md` y `adapt` (solo si hay carpetas candidatas; siempre adoptar, nunca mover), y `security-md` si no hay SECURITY.md. `ask`: `public` y `piiPatterns` siempre, `channel` solo si falta el SECURITY.md; en blanco solo `create-skeleton`. `optional`: `auto-memory-off` si hay memoria. `attention`: `no-type`, `untested`, `test-placeholder`, `unrecognized-runner`, `mutation-config`, `runner-excludes`, `several-stacks`, `existing-project-md`, `places-candidates`.

Tests literales: forma exacta para un repo node con vitest, uno sin manifiesto, uno en blanco, uno con `project.md` previo, uno con SECURITY.md y carpetas candidatas; `proposal` no trae `mutation`; el resumen no contiene rutas absolutas.

## Tarea 5: las dos skills reescritas

Archivos: `plugins/pignolo/skills/init/SKILL.md`, `plugins/pignolo/skills/setup/SKILL.md`, `tests/skill-init.test.js`, `tests/skill-forms.js` (si hace falta), `tests/skill-setup.test.js` (nuevo).

`init`: primero el camino en blanco (`detect` -> `summary.mode`); luego el flujo rápido (preguntas con `AskUserQuestion`, `preview` con el plan recomendado, una pantalla con el plan exacto y tres opciones: aplicar lo recomendado, revisar punto por punto, cancelar); el recorrido de catorce pasos queda como la segunda opción; detalle a pedido. `setup`: la misma idea (`check`, una pantalla con la recomendación, tres opciones; perfil y permisos con opciones). Mismas o menos líneas que hoy.

Tests literales: la skill nombra `blank`, `summary.mode`, `AskUserQuestion`, el respaldo en texto, las tres opciones, `explicit yes` y que el detalle técnico es a pedido; todo verbo, campo y script nombrado existe; los pasos 1 a 14 siguen en orden; sin rutas de usuario; `setup` nombra `AskUserQuestion` y las tres opciones.

## Tarea 6: documentos y versión

Archivos: spec (nota "decisión del autor, 2026-10-02"), `README.md`, `tests/manual/hito-8.md` (casillas nuevas), `CHANGELOG.md`, `plugins/pignolo/.claude-plugin/plugin.json` (0.15.0), `docs/STATE.md` si cita la versión. Test: la versión de `plugin.json` es 0.15.0 y el CHANGELOG tiene su entrada.
