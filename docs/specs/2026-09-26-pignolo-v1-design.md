# pignolo v1 — spec de diseño

Fecha: 2026-09-26 · Autor: Ignacio Agustín Miste (Pigna) · Estado: borrador para revisión por IA + tarjeta de alcance

## 0. Qué es y para qué

pignolo es un plugin de Claude Code que instala una metodología de desarrollo con agentes, genérica para cualquier proyecto, a nivel de cuenta. Su objetivo es trabajar de forma **inteligentemente autónoma**: resolver solo todo lo que no es decisión del humano, verificar de verdad (no por informe) y escalar al humano solo lo que le corresponde, con la pregunta ya trabajada.

Origen: un fork de `obra/superpowers` (MIT), prácticas de `Gentleman-Programming/gentle-ai` (ODD/RDD, lentes 4R, ledger, refuter, Judgment Day, work-unit commits), la memoria Engram, y las lecciones de un proyecto real (§17). Diseño validado por 13 investigaciones y 4 validaciones ciegas (red team, comunidad, plataforma, modos de falla) del 2026-09-25/26.

**Criterio de éxito de la v1:** en un plan real, (a) ningún test decorativo ni defensa muerta llega a la rama de integración sin ser detectado, (b) ningún comando destructivo de git se ejecuta sin respaldo, (c) el humano solo recibe preguntas de las categorías reservadas y la tarjeta de alcance, y (d) cada compuerta y cada agente atrapa su caso plantado en `tests/`.

## 1. Principios

1. **Verificar, no creer.** Toda evidencia (rojo/verde, compuertas) se re-ejecuta; ningún informe de agente es prueba.
2. **Lo que se ejecuta manda.** Toda regla crítica tiene un mecanismo determinista (hook, script, permiso) o se declara como "solo texto".
3. **Fallar cerrado.** Ante error, timeout o ambigüedad, un control bloquea; "no pude verificar" nunca es "está bien".
4. **Autonomía acotada.** Pignolo decide todo salvo las decisiones reservadas (§4); cada decisión no trivial queda registrada.
5. **Costo proporcional al riesgo.** La profundidad de revisión la fija el riesgo calculado por script, no el modelo.
6. **Contexto acotado.** Lo inyectado depende de lo abierto hoy, nunca del tamaño de la historia.
7. **Las reglas del usuario ganan.** `~/.claude/CLAUDE.md` > `.pignolo/project.md` > plugin, en todo conflicto.

## 2. Forma del plugin

Repo privado `Pign-a/pignolo`, formato plugin + marketplace de Claude Code.

```
.claude-plugin/     plugin.json, marketplace.json
skills/             proceso (inglés): entry, daily, plan, spec, plan-writing, tdd,
                    review, judgment, doubt-ladder, close-session, tests, branches, ...
agents/             un .md por rol (§6)
hooks/              hooks.json + scripts node (guard, gates, session-start, egress)
scripts/            risk, next, sabotage, queue, state-index, derive-branches, budget
commands/           /pignolo:setup, :init, :review, :audit-plan, :judgment, :research,
                    :close-session, :cleanup, :next, :off, :on, :status
templates/          project.md, scope-card, task-card, test-card, review-ledger,
                    decision, issue, learning, permissions (deny/ask)
tests/              escenarios plantados (§15) + evals de agentes (claude plugin eval)
CHANGELOG.md        semver; cada entrada dice qué la motivó
THIRD_PARTY_NOTICES.md
```

- Nombres de todos los elementos en inglés. Texto interno de skills y agentes en inglés. Lo que el humano lee (preguntas, resúmenes, commits, docs del proyecto) en el idioma configurado por proyecto (`language:` en project.md; por defecto el de `~/.claude/CLAUDE.md`).
- Todos los comandos se invocan como `/pignolo:<nombre>` (`/review` e `/init` ya existen en Claude Code).
- Prompts escritos de cero; la inspiración se atribuye en `THIRD_PARTY_NOTICES.md`. No se copia texto de repos propietarios ni sin licencia.
- superpowers upstream se sigue como fuente de lecciones (sus release notes), sin merges.

## 3. Configuración

### 3.1 Usuario: `~/.pignolo/config.json` (escrito por `/pignolo:setup`)
- `profile`: `max` | `balanced` | `economy` (§7).
- `models`: sobrescrituras por rol.
- `budgets`: tokens/tiempo por tarea y por plan (defaults por perfil).
- `engram`: habilitado o no.
- `language`.

### 3.2 Proyecto: `.pignolo/project.md` (creado por `/pignolo:init`, frontmatter YAML + notas)
- `type`: `code-tested` | `code-untested` | `docs` | `script`.
- `gates`: comandos por nivel `on-edit`, `on-done`, `pre-merge`, y opcional `live-check` (verificación contra el sistema real; puede requerir al humano, p. ej. credenciales).
- `high-risk-paths`: globs de la zona de alto riesgo (p. ej. manejo de secretos, dinero, contratos).
- `serial-paths`: archivos que nunca se trabajan en paralelo.
- `contracts`: globs de interfaces de las que dependen otros.
- `protected-test-config`: runner configs, scripts de test y umbrales protegidos por hash (§9.2).
- `domain-rules`: rutas a reglas de dominio del repo (p. ej. `.claude/rules/*.md`).
- `mutation`: habilitada o no, y herramienta.
- `language`, `profile` (sobrescritura opcional).

Sin `project.md`: modo conservador (riesgo medio, sin paralelismo, sin `live-check`) y aviso para correr `/pignolo:init`.

### 3.3 Interruptor
`/pignolo:off` y `/pignolo:on`, más la variable de entorno `PIGNOLO_DISABLED=1`. Todos los hooks la respetan y lo primero que hacen es chequearla. `/pignolo:status` muestra si está activo, perfil, versión y salud de hooks (canario §8.4).

## 4. Autonomía y decisiones reservadas

### 4.1 Decisiones reservadas al humano
Pignolo nunca las toma solo:
1. Identidad del producto (nombre, tono, a quién se dirige, qué problema resuelve).
2. Alcance y features visibles (agregar, quitar, cambiar lo que el usuario final ve o hace).
3. Costos: todo lo que sube o baja un costo recurrente o de infraestructura, y consumo de cómputo/tokens por encima del presupuesto.
4. Dependencias y stack (sumar librería, servicio, proveedor; cambiar tecnología).
5. Acciones irreversibles: borrar datos o archivos, migraciones, push, merge a `main`, publicar, desplegar.
6. Datos personales, seguridad, legal, licencias.
7. Cambios de contrato (interfaces de las que dependen otros).
8. Conflicto entre reglas.

### 4.2 Detección (no depende solo del juicio del modelo)
- **Tripwires deterministas** sobre el diff (`scripts/risk`): cambios en manifiestos y lockfiles (`package.json`, `pubspec.yaml`, `*.lock`, `requirements*.txt`, `go.mod`...), IaC y CI (`*.tf`, `docker-compose*`, `Dockerfile`, `.github/workflows/*`), variables de entorno y configuración de servicios pagos, `contracts` y `high-risk-paths` del proyecto, migraciones, borrados de archivos. Un tripwire marca la decisión como reservada; el modelo solo puede sumar, nunca quitar.
- **Ante la duda, reservada.**

### 4.3 Decisiones autónomas
Todo lo demás (implementación, estructura, tests, nombres, refactors chicos, corrección de hallazgos). Cada decisión no trivial se registra en `.pignolo/state/decisions/` (qué, alternativas, evidencia, reversibilidad, `autonomous: true`). Si la evidencia queda dividida tras la escalera: la opción más reversible, marcada `needs-review`.
- `needs-review` tiene tope (por defecto 10 abiertos por proyecto) y vencimiento (14 días); al tope o antes de un merge a `main`, se presentan en lote al humano.

### 4.4 Cómo se pregunta
Una pregunta al humano lleva: contexto en 2 líneas, opciones completas sin resumir ni reordenar, recomendación con la evidencia de la escalera, costo y reversibilidad de cada opción. Las preguntas se agrupan por plan cuando es posible.
- **Confirmaciones rutinarias vs. de riesgo:** push a una rama de tarea propia con compuertas en verde se agrupa y confirma en lote; push a `main`, force, borrados y migraciones se confirman uno por uno.

### 4.5 Tarjeta de alcance (`scope-card`)
Único artefacto que el humano aprueba en modo `plan`. Una pantalla:
- objetivo en una línea;
- ejemplos de aceptación literales ("dado X, pasa Y"), 3 a 7;
- fuera de alcance;
- **agregado sin pedirlo**: todo lo que el spec incluye que el pedido original no mencionó;
- decisiones reservadas detectadas;
- estimación de costo del plan (tokens/tiempo, según perfil).
Sin tarjeta aprobada, el plan puede ejecutarse en su rama de integración pero no llega a `main`.

## 5. Modos

### 5.1 Entrada (`skills/entry`)
Clasifica cada pedido: (1) ¿autoriza un cambio? Si no, solo lectura; un hallazgo nunca amplía la autorización. (2) `scripts/risk` sobre lo que se va a tocar + `project.md` → carril.

### 5.2 Carriles
- **`trivial`**: cambio de una línea o mecánico ya entendido, sin zona de riesgo ni tripwire. Compuerta `on-done` + commit. Sin revisión.
- **`daily`**: cambio chico y entendido. Explorar (1–3 archivos inline; 4+ → `explorer`), test primero con rojo demostrado, cambio, `on-done`, revisión según riesgo, commit por unidad de trabajo. Sin papeles salvo decisiones o bugs a registrar.
- **`plan`**: trabajo grande. `brainstorm` → spec → **autorrevisión + `spec-reviewer`** (y `researcher` solo para puntos técnicos dudosos, `refuter` solo en riesgo alto) → scope-card → plan (decisiones y task-cards, no código final) → `plan-auditor` → ejecución (§11) → ledger → `validator` por tanda → revisión final → cierre.
- Escalamiento solo hacia arriba (trivial → daily → plan) si aparece alcance, contrato, zona de riesgo o tripwire. Se frena, se avisa y se cambia de carril.

### 5.3 Script `next`
`scripts/next` lee el estado en disco (`.pignolo/state/`, git) y devuelve la única próxima acción válida del plan en curso (y por qué). El orquestador lo consulta al retomar, tras compactar y al terminar cada paso. Un solo dueño del estado del flujo.

## 6. Agentes

Todos: `tools` explícito, **sin `Agent`** (nadie delega salvo el orquestador), sin `memory:` en los de solo lectura, salida con formato fijo, estados `DONE | BLOCKED | NEEDS_CONTEXT` cuando corresponde.

| Agente | Acceso | Qué hace |
|---|---|---|
| `explorer` | Read, Grep, Glob | Lee 4+ archivos y devuelve resumen con rutas/líneas |
| `researcher` | WebSearch, WebFetch (sin acceso al repo) | Una pregunta acotada; fuentes con fecha; marca [original]/[resumen]; lee el original ante dato crítico |
| `spec-reviewer` | Read, Grep, Glob | Huecos, ambigüedad, alcance agregado, decisiones reservadas; máx. 5 preguntas por impacto |
| `plan-auditor` | Read, Grep, Glob, Bash | Plan contra el código real: firmas, compila los bloques, cada test puede fallar, ramas fail-open, qué se pierde |
| `test-writer` | Read, Grep, Glob, Edit/Write solo tests | Test desde el requisito, sin ver la implementación |
| `implementer` | Read, Grep, Glob, Edit, Write, Bash | Una tarea; no edita tests protegidos; evidencia RED/GREEN |
| `review-risk` | Read, Grep, Glob | Seguridad, datos, permisos, secretos |
| `review-resilience` | Read, Grep, Glob | Fail-closed, errores silenciados, bordes |
| `review-readability` | Read, Grep, Glob | Solo lo que oculta un defecto |
| `review-reliability` | Read, Grep, Glob | Corrección, contrato, concurrencia, camino real |
| `review-testability` | Read, Grep, Glob, Bash | ¿Cada test puede fallar? Fabrica el rojo; dobles con forma vieja |
| `refuter` | Read, Grep, Glob, Bash | Recibe afirmaciones (no prosa); intenta refutarlas con contraevidencia; no inventa el bug ni la defensa |
| `judge-a`, `judge-b` | Read, Grep, Glob | Ciegos, en paralelo, sobre un SHA congelado |
| `fixer` | Read, Edit, Write, Bash | Solo hallazgos confirmados, sin refactor extra |
| `validator` | Read, Grep, Glob, Bash | Por tanda: deriva, rulings pisados, informes falsos, deuda creciente |
| `integrator` | Bash (scripts/queue), Read | Opera la cola determinista; resuelve solo conflictos triviales |
| `learning-validator` | Read, Grep, Glob | Filtra y consolida aprendizajes |
| `debugger` | Read, Grep, Glob, Bash | Causa raíz con evidencia, sin fix |

Diferidos a v1.x: `threat-modeler`, `docs-accuracy`.

Un test (`tests/agents-tools`) cruza las herramientas de cada agente con lo que su prompt le pide hacer.

## 7. Perfiles de modelo (`/pignolo:setup`)

El orquestador pasa el modelo explícito en cada despacho (pisa el del archivo). Defaults:

| Rol | `max` | `balanced` | `economy` |
|---|---|---|---|
| explorer | sonnet | haiku | haiku |
| researcher, spec-reviewer, plan-auditor | opus | opus | sonnet |
| test-writer, implementer, fixer | opus | sonnet | sonnet |
| lentes, refuter, jueces, validator, debugger | opus | opus | sonnet |
| integrator | sonnet | sonnet | haiku |
| learning-validator | opus | sonnet | haiku |

| Parámetro | `max` | `balanced` | `economy` |
|---|---|---|---|
| Paralelismo máx. | 3 | 2 | 1 |
| Refuters en riesgo alto | 3 (voto 2 de 3) | 1 | 1 |
| Judgment Day | riesgo alto + cierre de plan | cierre de plan | a pedido |
| Lentes en riesgo alto | 4 + testability | 4 + testability | risk + testability |

Las compuertas deterministas (rojo demostrado, type-check, hashes, guardia de git, decisiones reservadas) son iguales en todos los perfiles; lo que varía es cuánta revisión LLM se suma. Si se agota la cuota, no se baja de modelo en silencio: se pregunta (decisión de costo). `setup` muestra una estimación de uso por perfil.

## 8. Hooks y control

### 8.1 Implementación
Scripts `node` invocados en forma exec (no `shell: powershell`, que requiere `pwsh`). Cada hook: chequea `PIGNOLO_DISABLED`; envuelve todo en try/catch y **ante cualquier error propio sale con 2** (bloquea) con un mensaje que dice qué falló y qué hacer; tiempo acotado (la suite completa nunca corre dentro de un PreToolUse).

### 8.2 Hooks
- `SessionStart` (startup, resume, compact): canario de salud + inyección del nivel caliente (§10.3).
- `PreToolUse` Bash|PowerShell: **guardia de git** (§11.6) y bloqueo de comandos de red para agentes que no son `researcher`.
- `PreToolUse` Edit|Write: tests y `protected-test-config` en solo lectura para `implementer`/`fixer`; `test-writer` solo escribe tests; `INDEX.md` y `accepted/` no editables; agentes de solo lectura sin escritura.
- `PreToolUse` WebSearch|WebFetch: filtro de egreso para `researcher` (bloquea queries con rutas, identificadores o secretos del proyecto según patrones de `project.md` y un detector genérico).
- `SubagentStop` / `TaskCompleted`: exigen `on-done` en verde y hashes intactos antes de aceptar DONE (respetan `stop_hook_active`; tras 8 bloqueos, marcan la tarea BLOCKED en vez de dejar pasar).
- Identidad del agente: solo desde el payload del hook (`agent_type`, con prefijo `pignolo:`), nunca desde variables de entorno ni PIDs.
- Cada bloqueo nombra una alternativa que funciona.

### 8.3 Permisos
El plugin no puede traer permisos: `/pignolo:setup` propone la plantilla deny/ask para el `settings.json` del usuario o del proyecto, mostrando el diff, y la escribe solo con confirmación. Es la capa autoritativa; los hooks son la segunda.

### 8.4 Canario
Al arrancar, `SessionStart` corre un comando plantado que la guardia debe bloquear; si no lo bloquea, avisa en rojo que la guardia está caída.

## 9. Tests

### 9.1 Crear
- `test-writer` escribe desde el requisito sin ver la implementación. Esperado literal del requisito; si sale de correr el código, rotulado `characterization`.
- `test-card` previa: comportamiento, origen del esperado, qué romper para que falle, cómo se ve el rojo, qué otra cosa lo haría pasar, nivel, dobles, camino real, datos.
- Cabecera en el test: `Protects: <id> · Breaks if: <qué>`.
- Árbol de decisión de tipo de test; real > fake > mock (mock solo si la llamada es el comportamiento); dobles tipados contra el contrato (`satisfies`), uniones selladas; datos sintéticos; tests de arquitectura que fallan si escanean cero archivos.
- **Holdout**: en modo `plan`, el `test-writer` produce además tests de aceptación que el `implementer` nunca ve; los corre el `validator` al cerrar la tanda.

### 9.2 Validar
- Rojo demostrado siempre: test-first, o `scripts/sabotage` sobre código commiteado (se niega si hay cambios sin commitear; restaura con `git restore --source=HEAD`; verifica árbol limpio; está en la allowlist de la guardia).
- Hashes de tests y `protected-test-config` guardados fuera del worktree (`~/.pignolo/hashes/<repo>/<rama>`), verificados en `on-done` sin importar quién cambió qué. Un cambio legítimo a un test requiere su entrada en el ledger o autorización.
- Type-check de tests (`tsconfig.test.json` o equivalente del stack) como parte de `on-done`.
- Mutación sobre el diff en `high-risk-paths` si `mutation` está habilitada (StrykerJS / `mutation_test`); sobreviviente → test nuevo, equivalente justificado aprobado por revisor, o deuda. El umbral nunca baja. Agregar la herramienta es decisión del humano.
- Cobertura informativa, no compuerta. Orden aleatorio con semilla en `on-done`.
- `type: code-untested`: `on-done` exige al menos un test nuevo para lo tocado o una razón registrada; nunca verde vacío (estado `NO_TESTS`). `docs`/`script`: compuertas propias declaradas (lint, links, ejecución de ejemplo).

### 9.3 Mantener
- Sin autorización del humano ningún agente: borra/skipea/agrega retry a un test, debilita una aserción, regraba snapshot/golden, ajusta un fixture a la salida nueva. El hook vigila `skip`/`only`/`--update` en el diff.
- Un test cambia solo si cambió el comportamiento.
- Golden rojo = regresión candidata (diff, causa, regrabación autorizada en commit propio).
- Flaky: causa raíz primero; cuarentena con dueño, vencimiento y tope; sigue corriendo sin bloquear; sin retry en unitarios.
- Si un cambio de comportamiento no rompió ningún test, se busca el que debió fallar.
- Poda propuesta por `validator` (huérfanos, redundantes); el borrado lo autoriza el humano.

### 9.4 Niveles de compuerta
`on-edit` (type-check + afectados; nunca cierra tarea) · `on-done` (suite del paquete + type-check código y tests + orden aleatorio + hashes; exigida por hook) · `pre-merge` (+ goldens, mutación en zona de riesgo, repetición; en `queue/`) · `live-check` (contra el sistema real, cuando el proyecto lo declara; puede pedir al humano credenciales o una acción manual; obligatoria antes de `main` si está declarada).

## 10. Continuidad entre sesiones

### 10.1 Qué va dónde
- **Derivado** (nunca escrito): ramas abiertas/mergeadas/abandonadas, ahead/behind, worktrees, PRs, cambios sin commitear, tags. `scripts/derive-branches` con git + `gh` (cruza `gh pr list --state merged` para squash merges; si `gh` no está, lo declara).
- **Juicio**: `.pignolo/state/{work,decisions,issues,learnings/{proposed,accepted,rejected},sessions,archive}/`, un archivo por entrada, frontmatter YAML (`id`, `status`, `evidence`, `source`, `superseded_by`, `created`, `review_after`). IDs `YYYY-MM-DD-<slug>`. Cerrar = cambiar `status`. Archivar con `git mv`.
- **Recuerdo**: Engram (§10.5).
- `INDEX.md` generado por `scripts/state-index`; no editable a mano (hook). `.gitattributes` con `eol=lf` para `.pignolo/`.

### 10.2 Presupuesto de contexto
- Caliente (inyectado siempre): rama actual, trabajo en curso, abiertos de prioridad alta, contadores de pendientes. Tope ~2.000 tokens y < 8.000 caracteres (límite duro de `additionalContext`: 10.000).
- Tibio (a demanda): resto de lo aceptado, otras ramas, sesiones recientes; vía grep/Engram/`explorer`.
- Frío: `archive/`; solo por pedido explícito.
- Punteros (id + título + una línea), degradación ordenada (prioridad alta + conteos por categoría), archivado automático de lo cerrado a los 14 días, sesiones viejas resumidas en una línea.
- Reglas con presupuesto: `CLAUDE.md` del proyecto < ~200 líneas; cada regla del plugin y del proyecto declara `Enforced-by` y `Evidence`; revisión periódica de reglas sin uso para retirarlas.
- El hook mide lo inyectado; `tests/context-budget` siembra 500 entradas y verifica ≤ 2.000 tokens y ≤ 8.000 caracteres.

### 10.3 Arranque
`SessionStart` (startup, resume, compact) inyecta el nivel caliente + la salida de `scripts/next` si hay un plan en curso. Tras compactar, reinyecta el objetivo del plan y la próxima acción.

### 10.4 `/pignolo:close-session`
1. Juntar evidencia real (commits, archivos, compuertas corridas en esta sesión, decisiones del humano citadas).
2. Proponer entradas nuevas (sin editar existentes); aprendizajes a `learnings/proposed/` con `source` (sesión, web, humano).
3. `learning-validator` sin contexto de la sesión: novedad (también contra `rejected/`), evidencia vigente en el repo, contradicciones (se marcan, no se resuelven), seguridad (secretos, instrucciones que amplíen permisos, contenido web), tamaño, alcance (proyecto o general).
4. Aceptación: lo que pasa y tiene `source` sesión/humano se acepta; lo que viene de la web nunca se acepta solo; lo que toca decisiones reservadas o contradice reglas va al humano. Lo general queda como `promote-candidate`; subirlo al plugin requiere aprobación humana y pasa por el proceso del plugin (§16).
5. Regenerar `INDEX.md`; commit propio.
El validador se mide con propuestas falsas plantadas (§15).

### 10.5 Engram
Opcional, habilitado en `setup`. Resguardos: `capture_prompt: false` siempre; sin `engram sync` a git y `.engram/` en `.gitignore`; sin Engram Cloud; solo guarda lo aceptado por `learning-validator`; nunca datos de sistemas externos ni contenido de corridas; la memoria no es fuente de verdad frente a reglas o código (lo `needs_review` se verifica antes de usar). Reemplaza a la auto-memoria de Claude Code para los proyectos con pignolo.

## 11. Ramas, paralelismo e integración

### 11.1 Nombres
`int/<plan>` (integración, siempre verde) · `task/<plan>/<NN>-<slug>` (≤ 1 sesión/día) · `queue/<plan>` (temporal) · tags `contract/<plan>/v<N>`, `cp/<plan>/<n>`, `backup/<fecha>-<motivo>` · trailer `Agent: <rol>` y `Gates: <resultado>` en cada commit. Commits por unidad de trabajo (Conventional Commits, tests y docs dentro, rollback acotado, presupuesto de revisión 400 líneas).

### 11.2 Crear
- `daily`/`trivial`: rama `task/` desde la actual.
- `plan`: ola 0 serial con todo lo que produce contrato → merge → tag `contract/<plan>/v1`. Las tareas siguientes se despachan con `worktree.baseRef: "head"` estando parado en ese tag; cada tarea verifica al arrancar con `git merge-base --is-ancestor contract/<plan>/v<N> HEAD`. Cada worktree instala sus dependencias; no se comparten puertos, contenedores ni datos.

### 11.3 Cola (`scripts/queue`, operada por `integrator`)
`git merge-tree --write-tree` (anticipa conflicto) → merge en `queue/<plan>` → `pre-merge` → solo si verde: `int/<plan>` avanza `--ff-only` + tag `cp/`. Conflicto trivial (imports, líneas vecinas): lo resuelve el integrator; de lógica: vuelve a la tarea (rebase en su rama) y se registra como falla del plan. Regresión detectada tarde en `int/`: revert primero, diagnóstico después.

### 11.4 Olas
Una ola = tareas sin dependencias entre sí, con archivos disjuntos (verificado por script sobre las task-cards), sin contrato. Tope por perfil (3/2/1). No se paraleliza si: toca contrato o `serial-paths`, hay solape, hay menos de ~4 tareas independientes, se trabaja contra un sistema externo real, o la ola anterior tuvo más retrabajo que el modo serial. Antes de cada ola se chequea el presupuesto y la cuota restante.

### 11.5 Mantener
Sin stash (commits WIP; si no queda otra, stash etiquetado aplicado por SHA). `git show ref:path` en vez de `git checkout ref -- path`. Limpieza: `status --porcelain` → backup (`git bundle` o tag `backup/`) → `worktree remove` sin `--force` → `branch -d`. Al arrancar se marcan ramas sin actividad > 7 días y worktrees con cambios sin commitear. `/pignolo:cleanup` propone; el humano borra.

### 11.6 Guardia de git
- Bloquea: `stash`/`pop`/`drop` sin etiqueta, `checkout`/`restore` con ruta (salvo `scripts/sabotage`), `reset --hard`, `clean -f`, `branch -D`, `worktree remove --force`, `--no-verify`, `gc --prune`, `reflog expire`, `push --force`/`--force-with-lease` sobre ramas compartidas; y formas indirectas conocidas (`git -C`, `node -e`/`python -c` que invoquen git, `Invoke-Expression`, `cmd /c`, `bash -c`).
- Pide confirmación (§4.4): push, merge a `main`, borrado de ramas/tags.
- Rechaza lo que no puede parsear.
- Capa que no se esquiva: antes de cualquier operación que la guardia permite y que mueve refs, `scripts/backup-ref` guarda un tag `backup/` automático.
- Cada regla tiene su comando plantado en `tests/guard`.

## 12. Revisión

- **Riesgo** calculado por `scripts/risk` (rutas tocadas vs. `high-risk-paths`/`contracts`, tripwires, tamaño); el modelo solo puede subirlo.
- **Profundidad por riesgo**: bajo → lectura estructural del orquestador; medio → un revisor (`review-reliability` + `review-testability` en un solo despacho si el perfil lo permite); alto → lentes completos según perfil + `refuter`(s) + Judgment Day según perfil.
- **Candidato congelado**: se revisa un SHA; todo cambio posterior invalida la revisión.
- **Ledger** (`review-ledger`): `id`, `lens`, `location`, `severity` (BLOCKER/CRITICAL/WARNING/SUGGESTION según rúbrica escrita), `status`, `evidence`, `repro` (test que reproduce, obligatorio en BLOCKER/CRITICAL). Se persiste aunque quede vacío.
- **Precision gate**: solo defectos defendibles con evidencia.
- **Refutación**: el `refuter` recibe las afirmaciones y el SHA, no la prosa del revisor; veredicto `corroborated | refuted | inconclusive`; faltante o malformado = queda en pie. El orquestador no puede calificar ni descartar hallazgos por su cuenta; los refutados se listan en el resumen.
- **Tests decorativos** detectados por `review-testability` son BLOCKER por definición.
- **Fix**: `fixer` solo sobre confirmados; máx. 2 rondas; la re-revisión ve solo ledger + delta y puede registrar defectos causados por el arreglo; lo abierto tras la ronda 2 se escala.
- **Judgment Day**: dos jueces ciegos en paralelo sobre el mismo SHA; se corrige solo lo que confirman ambos; lo de uno queda `suspect`; contradicciones al humano; resultado `APPROVED | ESCALATED`.
- **Aprobar no autoriza entregar**: commit, push y merge son decisiones aparte.

## 13. Escalera de dudas (`skills/doubt-ladder`)

Para dudas de hecho, no autorizaciones: (1) evidencia del repo; (2) memoria (estado, Engram, ledgers); (3) `researcher` (pregunta abstracta, sin datos del proyecto; filtro de egreso); (4) `refuter`; (5) humano con la pregunta armada. Presupuesto por duda (por defecto: 2 llamadas a `researcher`, 1 a `refuter`); al agotarlo, se toma la opción más reversible y se marca `needs-review`, o se sube al humano si no hay opción reversible.

## 14. Instalación y migración

- `claude plugin marketplace add Pign-a/pignolo` + `claude plugin install pignolo` (repo privado: requiere credenciales git de la máquina, p. ej. `gh auth login` + `gh auth setup-git`).
- `/pignolo:setup`: perfil; verifica `node`, `git` (versión con `merge-tree --write-tree`), `gh`; plantilla de permisos con diff y confirmación; Engram opcional; avisa si superpowers está instalado (se superponen).
- `/pignolo:init` por proyecto: deduce `type` y `gates` de `package.json`/`pubspec.yaml`/etc. y los muestra para confirmar; crea `.pignolo/`, `.gitattributes`; registra hashes iniciales de tests.
- Migración del entorno del autor (cada paso destructivo con confirmación, backup zip de `~/.claude` primero): instalar y probar en un plan real con superpowers aún instalado → desinstalar superpowers → quitar de ECC lo roto (`/orch-*`, `/epic-*`, `/loop-*`) y lo riesgoso (`/santa-loop`, `/multi-*`, `/checkpoint`) → limpiar la allowlist global (`git push origin main`, `prisma migrate reset --force`, `node -e`, `Bash(claude:*)`) y `autoMode.environment` → migrar el proyecto de origen (`docs/sessions/` → `.pignolo/state/`; `.claude/rules/ejecucion-de-planes.md` → núcleo del plugin).

## 15. Pruebas del plugin

`tests/` corre con `claude plugin eval` y scripts node, también en modo interactivo (hay fallas que `-p` no reproduce):
- `guard`: cada comando peligroso (incluidas formas indirectas) debe bloquearse; `PIGNOLO_DISABLED` debe desactivar; error interno del hook debe bloquear (exit 2).
- `gates`: compuerta vacía en `code-untested` no da verde; hash de test alterado bloquea DONE.
- `agents`: cada agente contra su trampa (plan que no compila, test decorativo, hallazgo falso para el refuter, diff limpio donde un revisor no debe inventar hallazgos, aprendizaje inventado y aprendizaje con dato sensible para learning-validator, query con dato del proyecto para el filtro de egreso).
- `agents-tools`: herramientas vs. prompt.
- `context-budget`: 500 entradas ≤ 2.000 tokens / 8.000 caracteres.
- `canary`: la guardia caída se detecta al arrancar.

## 16. Evolución, métricas y alarmas

- Semver; CHANGELOG con motivo; versión fijada por el usuario; al actualizar, `setup` muestra el diff de `hooks/` antes de activar.
- Aprendizajes `promote-candidate` de los proyectos se acumulan; subirlos al núcleo es un cambio al plugin con su propio spec, revisión y tests.
- Métricas por plan en `.pignolo/state/metrics/`: rondas de corrección por tarea, hallazgos escapados a la revisión final o a `live-check`, tests decorativos detectados, conflictos en cola, tokens y tiempo por tarea, preguntas al humano y tasa de coincidencia con la recomendación, decisiones autónomas revertidas.
- Alarmas (en el resumen de cierre): (1) intentos de tocar tests/config protegidos; (2) defectos escapados (holdout o `live-check` que atrapa lo que las compuertas no); (3) calibración de revisores (recall en defectos plantados, falsos positivos en diffs limpios, acuerdo entre jueces > 95 %); (4) calibración de escalamiento (> 90 % de respuestas iguales a la recomendación o > 10 % de decisiones autónomas revertidas); (5) costo, bucles y contexto por encima del presupuesto.

## 17. Lecciones que motivan el diseño (proyecto de origen)

6 de 6 tareas de un plan con defectos que venían del código del plan; tests decorativos (evento emitido a mano, dobles con forma vieja, barridos en el directorio equivocado, tests que pasaban sin el control); Vitest sin type-check dejó vivo un estado borrado; un fix de seguridad que era un log donde la excepción nunca llegaba; `git checkout -- archivo` borró una implementación sin commitear; stash compartido entre worktrees; rama "rota hasta la tarea N"; documentación de sesión que fallaba al editar un archivo grande en el lugar (CRLF, líneas de 1.500 caracteres, copias duplicadas entre archivos y worktrees); revisores despachados en sonnet por olvido; una verificación contra el sistema real encontró 3 bugs que ningún test detectó (cálculo cacheado del servidor, paginación leída como completa, filtro sin efecto).

## 18. Construcción (v1 completa, con hitos internos)

Todo entra en v1 (decisión del autor). El plan de implementación lo divide en hitos, cada uno cerrado con sus tests de §15 en verde antes de empezar el siguiente:
1. Esqueleto del plugin, config, interruptor, hooks base con canario y guardia de git.
2. Agentes, perfiles y `setup`.
3. Carriles `trivial`/`daily`, riesgo por script, revisión, ledger, refuter, Judgment Day.
4. Tests: test-writer, cards, sabotaje, hashes, compuertas, holdout, mutación opcional.
5. Modo `plan`: spec, scope-card, plan-auditor, validator, `next`.
6. Continuidad: estado, índice, arranque, `close-session`, learning-validator, Engram.
7. Ramas y paralelismo: nombres, contrato, cola, olas, cleanup.
8. `init` y migración del entorno del autor, validado en un plan real del proyecto de origen.

## 19. Fuera de alcance de la v1

`threat-modeler` y `docs-accuracy`; soporte a otros clientes de IA (solo Claude Code); CI remoto; publicación pública del plugin; Engram Cloud.
