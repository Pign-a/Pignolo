# Hito 2 del núcleo: agentes, perfiles, setup y hook de Agent. Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo tenga sus 19 agentes con herramientas y effort fijos, los perfiles de modelo, `/pignolo:setup` y un hook sobre `Agent` que aplique la allowlist A-11 y respalde antes de cada despacho.

**Arquitectura:** una tabla de roles en `lib/roles.js` es la fuente única. De ella salen el frontmatter esperado de cada agente (test `agents-tools`), la resolución de modelo por perfil (`lib/profiles.js`) y lo que muestra `setup`. El hook `agent-gate` sigue el contrato de los handlers del hito 1: `run(input, ctx) → { exit, stdout?, stderr? }` detrás del launcher. `setup` es una skill que solo el humano invoca y que orquesta `scripts/setup.js`, que no tiene dependencias.

**Stack:** Node ≥ 20 sin dependencias npm, `node:test`, hooks de Claude Code y `claude plugin eval`.

**Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md`: §6 (agentes y A-11), §6.1 (cartas), §7 (perfiles), §8.1 (permisos), §8.3 (hook de `Agent`), §11.6 (respaldo antes de despacho), §14 (setup), §15 (`agents-tools`, `agent-allowlist`, `agents`) y §18, hito 2.

## Global Constraints

- Node ≥ 20, **sin dependencias npm**. Tests con `node:test`; la suite completa corre con `npm test`, nunca con `node --test tests/`.
- Nombres de elementos en inglés. El texto interno de agentes y skills va en inglés; los mensajes al humano, commits y docs, en español. Commits en Conventional Commits, escritos con `git commit -F <archivo>`.
- Cada agente lleva `tools` explícito, **sin `Agent`** y **sin `memory:`**, y un `effort:` fijo según la tabla de §7 (valores válidos: `low`, `medium`, `high`, `xhigh`, `max`; doc oficial sub-agents). Ningún agente usa `xhigh` ni `max`.
- Campos del frontmatter de un agente de plugin: `name`, `description`, `tools`, `model` y `effort`. Claude Code ignora `hooks`, `mcpServers` y `permissionMode` en los plugins (doc oficial), así que no se usan. El nombre de invocación es `pignolo:<rol>`, y `name` no lleva `:`.
- Hook sobre `Agent`: el matcher es `Agent`. El campo es `tool_input.subagent_type`, que llega exactamente como lo pidió el modelo (payload real capturado en el spike de pignolo-ui; `tool_input = {description, prompt, subagent_type, run_in_background}`). La comparación es por **igualdad exacta**.
- Los hooks **callan en el éxito**: sin `additionalContext` ni `systemMessage` si todo sale bien. Cada bloqueo nombra una alternativa que funciona.
- `/pignolo:off` apaga la allowlist, pero no los respaldos. `PIGNOLO_DISABLED=1` apaga también los respaldos. Con el canario activo (`PIGNOLO_CANARY=1`) no se toman respaldos.
- Nada de datos del proyecto del autor, personas ni credenciales en lo versionado. El repo es público.
- Rutas protegidas del hito 1: `~/.claude/settings*.json` y `~/.pignolo/**` no se escriben con Edit/Write. `setup` las escribe solo desde `scripts/setup.js`, y solo tras la confirmación del humano en la conversación.

## Método de ejecución y economía de tests

Decisión técnica (2026-09-29, pedido del autor: "lo más rápido, en paralelo, sin gastar tokens de más"):

- **Olas.** Ola 0 es serial: Task 1, que produce el contrato. La ola 1 corre **5 tareas en paralelo**, cada una en su worktree y con archivos disjuntos. La ola 2 tiene las evals y el cierre. Al terminar cada ola se une a `core/hito-2` y la suite completa corre **una vez**.
- **Modelos.** Los implementadores van en sonnet, porque las tarjetas traen interfaces y casos literales. **No hay revisión por tarea.** Hay una sola revisión final opus de toda la rama, una pasada de arreglos y una confirmación acotada; después se clasifica (el tope es el del hito 1).
- **Tests que valen lo que cuestan:**
  - Cada test protege un comportamiento del spec: nada de tests sobre el texto libre de las cartas, snapshots de prompts ni getters.
  - Los tests de la tarjeta se escriben **primero** desde el spec. El rojo es la primera corrida contra el código ausente y se muestra **una vez**. Romper el código para volver a ver rojo solo hace falta en un test agregado después del código.
  - Los handlers se prueban **en proceso** (`require(handler).run(input, ctx)`). Por el launcher (un subproceso) corre **un solo** test de humo por hook nuevo.
  - Los tests son **de tabla**: un test genera un subtest por rol o por caso, así una tarea verifica solo lo suyo con `--test-name-pattern`.
  - Los implementadores corren **solo sus archivos** con `node --test --test-reporter=dot <archivo>` y en el informe pegan el resumen, nunca la salida TAP. La suite completa (hoy ~60 s) corre al unir cada ola y al final, no por tarea.
  - Las evals de agentes solo usan graders deterministas (`regex`, `tool_used`, `file_exists`: no cuestan tokens de juez), con `--ablation none` (sin corrida base, la mitad del costo) y un tope de gasto por corrida.

## Review Focus

1. **Un proyecto sin pignolo configurado no se rompe.** Con el plugin instalado a nivel usuario y sin `.pignolo/project.md`, despachar `Explore` o `general-purpose` debe pasar: el uso normal de Claude Code sigue igual. Lo prueba la Task 4.
2. **Cientos de despachos por sesión.** El respaldo de refs antes de cada despacho no puede crear un juego nuevo si las refs no cambiaron. Lo prueba la Task 4.
3. **Payload raro en un proyecto activo.** Un `subagent_type` ausente, que no es texto o vacío se niega, con la alternativa de usar `pignolo:<rol>`, porque falla cerrado. Lo prueba la Task 4.
4. **`setup` sobre un settings real.** Un JSON con reglas propias del usuario conserva todas sus reglas y su orden. Solo se agregan las que faltan, y antes se escribe un respaldo. Un JSON inválido aborta sin escribir. Lo prueba la Task 5.
5. **Las dos formas de apagar.** Con `/pignolo:off`, la allowlist se apaga y el respaldo sigue. Con `PIGNOLO_DISABLED=1`, se apagan los dos. Lo prueba la Task 4.

## Rulings del plan (técnicos, registrados)

- **"pignolo activo en el proyecto"** (§6: la allowlist rige "mientras pignolo está activo en el proyecto") = existe `.pignolo/project.md` en la raíz del repo (`git rev-parse --show-toplevel`, con plazo; sin repo, el `cwd`) y el proyecto no está apagado. Motivo: sin esto, instalar pignolo a nivel usuario negaría `Explore` en todos los proyectos. Costo si está mal: la allowlist no rige hasta que `/pignolo:init` (hito 8) cree `project.md`. Mientras tanto se crea a mano.
- **El canario no suma la familia `Agent`**: §8.4 enumera cinco familias, y la allowlist depende del proyecto activo, así que el canario daría falsas alarmas en proyectos sin `project.md`.
- **El respaldo de refs deduplica**: `backupRefs` no crea un juego si el último `refs/pignolo/backup/*` tiene exactamente las mismas refs y shas. La razón es que antes de cada despacho se respalda.
- **`setup` solo agrega permisos**: nunca quita ni reordena reglas del usuario, y respalda el archivo antes de escribir. Un agente que lo corra sin confirmación solo puede endurecer permisos, nunca aflojarlos.
- **Engram**: `setup` escribe `engram: false` y avisa que llega en el hito 6, que es cuando se verifica contra su documentación (§10.5).
- **Conflictos de reglas** (§1.7): los detecta el modelo dentro de la skill `setup`, que lee `~/.claude/CLAUDE.md`, el `CLAUDE.md` y `.claude/rules/` del proyecto y los compara con `rules/core.md`, y los lista para que el humano confirme cómo se resuelven. No hay script para esto, porque comparar texto libre por regex daría ruido.
- **Plan en tarjetas, no en código final** (§5.2). Los bloques de código son hipótesis hasta ejecutarlos. Lo que sí fija el plan son las interfaces, los casos de test y los valores literales.

---

## Ola 0 (serial)

### Task 1: tabla de roles, perfiles, config y el test `agents-tools`

**Files:**
- Create: `plugins/pignolo/lib/roles.js`, `plugins/pignolo/lib/profiles.js`
- Create: `tests/profiles.test.js`, `tests/agents-tools.test.js`
- Modify: `package.json` (script `test:quiet`)

**Interfaces que produce:**
- `roles.js` exporta `ROLES`: un objeto congelado `{ [rol]: { tools: string[], effort: 'low'|'medium'|'high', models: { max, balanced, economy }, vocabulary: 'writer'|'reviewer'|'researcher'|'reader' } }`, con los 19 roles de §6: `explorer`, `researcher`, `spec-reviewer`, `plan-auditor`, `test-writer`, `implementer`, `review-risk`, `review-resilience`, `review-readability`, `review-reliability`, `review-testability`, `refuter`, `judge-a`, `judge-b`, `fixer`, `validator`, `integrator`, `learning-validator` y `debugger`. Las herramientas son las de la tabla de §6, al pie de la letra; los effort y modelos, los de la tabla de §7. Los lentes, el refuter, los jueces y el validator están en la fila "lentes, refuter, jueces, validator".
- `vocabulary` (§6.1): `writer` (`DONE`/`BLOCKED`/`NEEDS_CONTEXT`) para implementer, fixer, test-writer, integrator y debugger. `reviewer` (`APPROVE`/`REQUEST_CHANGES`/`ESCALATE`) para spec-reviewer, plan-auditor, los lentes, review-testability, los jueces y validator. `researcher` (`CONFIRMED`/`REFUTED`/`INCONCLUSIVE`) para researcher y refuter. `reader` (`DONE`/`BLOCKED`/`NEEDS_CONTEXT`) para explorer y learning-validator.
- `roles.js` exporta además `VOCABULARY = { writer: [...], reviewer: [...], researcher: [...], reader: [...] }` y `PROFILE_PARAMS`, con la segunda tabla de §7: `{ max: { parallel: 3, refutersHighRisk: 3, judgmentDay: 'high-risk+plan-close', lensesHighRisk: ['risk','resilience','readability','reliability','testability'] }, balanced: {...}, economy: {...} }`.
- `profiles.js` exporta:
  - `configPath(env)`: devuelve `<pignoloHome(env)>/config.json`.
  - `readConfig({ env })`: devuelve `{ profile, models, presentation, engram, language }` con estos defaults: `profile: 'balanced'`, `models: {}`, `presentation: 'ask'` (`'text'` si el perfil es `economy`), `engram: false` y `language: null`. Si el archivo no existe, devuelve los defaults. Si el JSON es inválido, lanza un `Error` con el mensaje `config inválida: <ruta>`.
  - `writeConfig({ env }, partial)`: valida (perfil ∈ `max|balanced|economy`; `presentation` ∈ `ask|artifact|text`; cada clave de `models` es un rol de `ROLES` y cada valor, `opus|sonnet`), mezcla con lo existente y escribe con LF y 2 espacios. Devuelve la config final. Si algo no valida, lanza el error y no escribe.
  - `resolveModel(role, { profile, models })`: gana `models[role]`; si no está, `ROLES[role].models[profile]`. Un rol desconocido lanza un error.

- [ ] **Paso 1: tests primero.** `tests/profiles.test.js` es de tabla, con estos casos literales:
  - `resolveModel('explorer', {profile:'max'})` → `'sonnet'`.
  - `resolveModel('implementer', {profile:'max'})` → `'opus'`, y con `balanced` → `'sonnet'`.
  - `resolveModel('review-risk', {profile:'economy'})` → `'opus'`: los revisores van en opus en todos los perfiles (§7).
  - `resolveModel('researcher', {profile:'economy'})` → `'sonnet'`.
  - Una sobrescritura `models:{implementer:'opus'}` con `balanced` → `'opus'`.
  - Un rol desconocido lanza un error.
  - `readConfig` sin archivo devuelve los defaults. Con `economy` y sin `presentation` → `'text'`.
  - `writeConfig` con `profile:'turbo'` lanza un error y el archivo no se crea.
  - `writeConfig` con `profile:'max'` y después `{language:'es'}` conserva `max`.
  - Un JSON inválido en disco hace que `readConfig` lance `config inválida`.
  - Todo en un `HOME`/`PIGNOLO_HOME` temporal, que se borra al terminar.
- [ ] **Paso 2: `tests/agents-tools.test.js`.** Genera **un subtest por rol**, con el nombre `agent <rol>`. Cada uno lee `plugins/pignolo/agents/<rol>.md` y verifica:
  - que el frontmatter se parsea (el parser YAML-lite mínimo va en el mismo test: `clave: valor` más listas separadas por coma);
  - que `name === <rol>` y que `description` no está vacía;
  - que el conjunto de `tools` es igual a `ROLES[rol].tools`, y que ahí no aparece `Agent`;
  - que no están `memory`, `hooks`, `mcpServers` ni `permissionMode`;
  - que `effort === ROLES[rol].effort` y que `model === ROLES[rol].models.balanced`;
  - que el cuerpo contiene las tres palabras de su `VOCABULARY`;
  - que el archivo está en LF y sin BOM.

  Hay además un subtest `no stray agents`: todo `.md` de `agents/` es un rol de `ROLES`. Con esto, cada tarea de la ola 1 verifica lo suyo con `--test-name-pattern "agent (implementer|fixer|...)"`.
- [ ] **Paso 3: rojo.** `node --test --test-reporter=dot tests/profiles.test.js tests/agents-tools.test.js`. Falla porque todavía no existen los módulos ni los agentes. Se anota el resumen.
- [ ] **Paso 4: implementar `roles.js` y `profiles.js`.** `profiles.test.js` en verde. `agents-tools` sigue en rojo por los agentes que faltan; eso es lo esperado y lo cierra la ola 1.
- [ ] **Paso 5: script `test:quiet`.** Agregar a `package.json` un `"test:quiet"` que corre lo mismo que `test` con `--test-reporter=dot`.
- [ ] **Paso 6: commit.** `feat(profiles): tabla de roles, perfiles de modelo y config de usuario`.

---

## Ola 1 (en paralelo: Tasks 2, 3, 4, 5 y 6, cada una en su worktree)

Todas parten del commit de la Task 1. Ninguna toca `lib/roles.js` ni `tests/agents-tools.test.js`. Si la tabla les parece mal, responden `BLOCKED`, sin cambiarla.

**Carta común para las Tasks 2, 3 y 4** (§6.1): cada agente es un `.md` con este frontmatter:

    ---
    name: <rol>
    description: <cuándo lo despacha el orquestador, una o dos frases>
    tools: <lista de ROLES[rol].tools separada por comas>
    model: <ROLES[rol].models.balanced>
    effort: <ROLES[rol].effort>
    ---

El cuerpo va en inglés, en segunda persona, y conviene que sea breve (≤ ~60 líneas). Tiene estas secciones:
1. **Role**: qué hace y qué no, según las tablas de §6.
2. **Inputs**: qué recibe en el brief.
3. **Method**: los pasos.
4. **Output**: el formato fijo, que termina con una de las palabras de su vocabulario.
5. **Rules**: lo específico del rol.

Las 6 reglas de `rules/core.md` **no se copian**: se inyectan en el hito 6 (§6.1).

### Task 2: agentes que escriben y operan

**Files:** crear en `plugins/pignolo/agents/` los archivos `implementer.md`, `fixer.md`, `test-writer.md`, `integrator.md` y `debugger.md`.

- Las cartas de implementer, fixer y test-writer llevan **todo** lo de §6.1 "Cartas de rol":
  - rojo demostrado rompiendo lo que el test protege;
  - no tocar tests existentes: un test viejo en rojo lleva a `BLOCKED`, asumiendo primero que el diagnóstico propio está mal;
  - correr todos los gates y dejar que el gate verifique;
  - tocar solo los archivos propios, también por shell, con staging explícito;
  - N1 a N5;
  - y los tres bloques de §6.1: **Cierre de turno**, **No agregar** y **Verificación**, con su contenido completo.
- `implementer`: no edita `test-paths` ni `protected-test-config`. Entrega evidencia RED/GREEN. Si la task-card trae un aprobado visual (§4.6), verifica los sha256 del manifest antes de implementar (algo de más, de menos o distinto lleva a `BLOCKED`) y lo toma como fuente de verdad.
- `test-writer`: escribe solo en `test-paths` y desde el requisito, sin ver la implementación. El esperado sale literal del requisito; si sale de correr el código, se rotula `characterization`. Cada test lleva la cabecera `Protects: <id> · Breaks if: <qué>`. También convierte un `repro-spec` en test.
- `fixer`: trabaja solo sobre hallazgos confirmados y no toca `test-paths` sin autorización.
- `integrator`: solo corre `node <plugin>/scripts/queue` y resuelve solo conflictos triviales. El script llega en el hito 7; la carta lo dice.
- `debugger`: busca la causa raíz con evidencia, sin hacer el fix.
- [ ] **Paso 1:** escribir los 5 archivos.
- [ ] **Paso 2:** correr `node --test --test-reporter=dot --test-name-pattern "agent (implementer|fixer|test-writer|integrator|debugger)$" tests/agents-tools.test.js` hasta que dé verde.
- [ ] **Paso 3:** commit `feat(agents): implementer, fixer, test-writer, integrator y debugger`.

### Task 3: agentes revisores

**Files:** crear en `plugins/pignolo/agents/` los archivos `review-risk.md`, `review-resilience.md`, `review-readability.md`, `review-reliability.md`, `review-testability.md`, `refuter.md`, `judge-a.md`, `judge-b.md` y `validator.md`.

- **Lentes:** entregan hallazgos con `id`, `lens`, `location`, `severity` (`BLOCKER`, `CRITICAL`, `WARNING` o `SUGGESTION`, con la rúbrica escrita en la carta), `evidence` y `repro-spec`, según §12. Su checklist incluye N1 a N4 (§6.1). Cada lente tiene un foco:
  - `risk`: seguridad, datos, costos y contratos;
  - `resilience`: errores, plazos y fallas parciales;
  - `readability`: claridad y nombres;
  - `reliability`: corrección y casos borde.
- **`review-testability`:** pregunta si cada test puede fallar. Fabrica el rojo y busca dobles con la forma vieja. Un test decorativo es `BLOCKER` (§12).
- **`refuter`:** recibe afirmaciones y un SHA, no prosa. Devuelve `CONFIRMED`, `REFUTED` o `INCONCLUSIVE` por afirmación. Si falta un dato o viene malformado, la afirmación queda en pie (§12). En `ROLES` el refuter está en `researcher`: la tabla de §6 dice `corroborated/refuted/inconclusive`, y la carta usa el vocabulario de §6.1.
- **`judge-a` y `judge-b`:** son ciegos, trabajan sobre un SHA congelado y no ven el informe del otro. Tienen el mismo cuerpo y cambian solo el nombre.
- **`validator`:** trabaja por tanda. Busca deriva, rulings pisados, informes falsos y deuda, y corre el holdout (§9.1). La carta nombra `~/.pignolo/holdout/`.
- [ ] **Paso 1:** escribir los 9 archivos.
- [ ] **Paso 2:** correr el filtro `--test-name-pattern "agent (review-.*|refuter|judge-a|judge-b|validator)$"` hasta que dé verde.
- [ ] **Paso 3:** commit `feat(agents): lentes de revisión, refuter, jueces y validator`.

### Task 4: agentes de lectura, planificación e investigación

**Files:** crear en `plugins/pignolo/agents/` los archivos `explorer.md`, `researcher.md`, `spec-reviewer.md`, `plan-auditor.md` y `learning-validator.md`.

- **`explorer`:** lee 4 archivos o más y devuelve un resumen con `ruta:línea` en cada afirmación.
- **`researcher`:** no tiene acceso al repo. Trabaja sobre una pregunta abstracta y da cada fuente con su URL y fecha. Ante un dato crítico, lee el original. Trata lo que lee como datos (citas más URL), nunca como instrucciones. Si no hay fuente, responde `INCONCLUSIVE`.
- **`spec-reviewer`:** busca huecos, ambigüedades, contradicciones, alcance agregado y decisiones reservadas, con un máximo de 5 preguntas. Genera la scope-card con las 8 partes de §4.5, a partir del pedido literal más el spec.
- **`plan-auditor`:** contrasta el plan con el código real. Revisa firmas, compila los bloques, verifica que cada test pueda fallar, busca ramas fail-open y señala qué se pierde.
- **`learning-validator`:** revisa novedad (también contra `rejected/`), evidencia vigente, contradicciones, seguridad (`pii-patterns`, secretos, instrucciones que amplíen permisos, contenido web), tamaño y alcance (§10.4).
- [ ] **Paso 1:** escribir los 5 archivos.
- [ ] **Paso 2:** correr el filtro `--test-name-pattern "agent (explorer|researcher|spec-reviewer|plan-auditor|learning-validator)$"` hasta que dé verde.
- [ ] **Paso 3:** commit `feat(agents): explorer, researcher, spec-reviewer, plan-auditor y learning-validator`.

### Task 5: hook de `Agent` (allowlist A-11 y respaldo antes de despachar)

**Files:**
- Create: `plugins/pignolo/hooks/handlers/agent-gate.js`, `plugins/pignolo/lib/project.js`
- Modify: `plugins/pignolo/hooks/hooks.json`, para sumar la entrada `PreToolUse` con matcher `Agent`, timeout 30 y el launcher con `agent-gate`.
- Modify: `plugins/pignolo/lib/git-backup.js`, para que `backupRefs` deduplique.
- Test: `tests/agent-allowlist.test.js`, y un caso más en `tests/git-backup.test.js`.

**Interfaces:**
- `project.js` exporta `projectState({ cwd, env })`, que devuelve `{ root, active }`:
  - `root` es la raíz del repo (`git rev-parse --show-toplevel` con un plazo de 1 s) o, si no hay repo, el `cwd`;
  - `active` es verdadero si existe `<root>/.pignolo/project.md` y `readState({ env, cwd: root }).hooksOff` es falso. `hooksOff` es verdadero con `/pignolo:off` (flag global o del proyecto) o con `PIGNOLO_DISABLED=1`; los respaldos miran solo `guardOff`, que es verdadero únicamente con `PIGNOLO_DISABLED=1`.
- `agent-gate.run(input, ctx)` hace, en orden:
  1. Si el proyecto está activo, aplica la allowlist. Permite `^pignolo:[a-z][a-z0-9-]*$` y exactamente `pignolo-ui:ui-option` y `pignolo-ui:ui-auditor`. Cualquier otro valor, o uno que no sea texto, se niega con `exit 2` y `stderr` `pignolo bloqueó el despacho de "<valor>": en este proyecto solo se despachan agentes pignolo:* (y pignolo-ui:ui-option, pignolo-ui:ui-auditor). Alternativa: usá el agente pignolo equivalente (p. ej. pignolo:explorer en lugar de Explore).`
  2. Si el despacho se permite y los respaldos están prendidos (`guardOff` falso y `PIGNOLO_CANARY` distinto de `1`), respalda:
     - toma la instantánea WIP (`snapshotWip`, motivo `antes-de-despacho`, plazo de 2 s);
     - y respalda las refs (`backupRefs({ outside: false })`).

     Los fallos se comportan como en la guardia: el despacho pasa y se avisa con `systemMessage`. Los dos respaldos se inyectan por `ctx`, así los tests no dependen de git.
  3. Si el despacho se permite y todo sale bien, devuelve `{ exit: 0 }`, sin salida.
- `backupRefs`: antes de crear el juego, lee el último `refs/pignolo/backup/<ts>/*`. Si el conjunto `{ref → sha}` es idéntico, no crea nada y devuelve `{ base: null, count: 0, reused: <base> }`.

- [ ] **Paso 1: tests primero, en proceso y de tabla.** `tests/agent-allowlist.test.js`, con proyecto activo (repo temporal con `.pignolo/project.md`):
  - se permiten `pignolo:implementer`, `pignolo:review-risk`, `pignolo-ui:ui-option` y `pignolo-ui:ui-auditor`;
  - se niegan `general-purpose`, `Explore`, `Plan`, `ui-option`, `pignolo-ui-x:ui-option`, `pignolo-ui:other`, `pignolo:`, `PIGNOLO:implementer`, `other:implementer`, `''`, un valor ausente y `42`.
  - Cada negación trae `Alternativa:` en el `stderr`.
- [ ] **Paso 2: tests del Review Focus**, en el mismo archivo:
  - sin `project.md`, `Explore` y `general-purpose` pasan, sin salida;
  - con `.pignolo/.disabled`, `Explore` pasa y el respaldo inyectado **sí** se llama;
  - con `PIGNOLO_DISABLED=1`, el respaldo **no** se llama;
  - si el respaldo inyectado lanza un error, el despacho permitido pasa con `systemMessage`;
  - un despacho permitido y sano no escribe nada en `stdout`.
- [ ] **Paso 3: un solo test de humo por el launcher.** `runLauncher('agent-gate', { tool_name:'Agent', tool_input:{ subagent_type:'Explore' }, cwd:<repo activo> })` da `exit 2`.
- [ ] **Paso 4: test de deduplicación.** En `tests/git-backup.test.js`, dos `backupRefs` seguidos sin cambios dejan un solo juego. Si después se hace un commit, el siguiente `backupRefs` crea uno nuevo.
- [ ] **Paso 5: rojo.** Se corren solo los dos archivos y se anota el resumen.
- [ ] **Paso 6: implementar.** Verde en esos dos archivos, más `tests/hooks-json.test.js` (que valida la forma de `hooks.json`).
- [ ] **Paso 7: commit.** `feat(hooks): allowlist de agentes (A-11) y respaldo antes de cada despacho`.

### Task 6: `/pignolo:setup`

**Files:**
- Create: `plugins/pignolo/skills/setup/SKILL.md`, `plugins/pignolo/scripts/setup.js`
- Test: `tests/setup.test.js`

**`scripts/setup.js`** (CLI; salida JSON por stdout; exit 0, o 1 con el mensaje en stderr):
- `check`:
  - devuelve `{ node, git: { version, hooksOk, mergeTree }, gh, powershell, superpowers, agentTeams, config }`:
    - `hooksOk` = git ≥ 2.31;
    - `mergeTree` = `git merge-tree --write-tree` responde. Se prueba contra un repo temporal y queda como hipótesis de §14 a verificar en el hito 7;
    - `gh` y `powershell` = arrancan (`--version` / `-NoProfile -Command $PSVersionTable.PSVersion`, con plazo);
    - `superpowers` = existe un directorio `superpowers` bajo `<claudeDir>/plugins/cache/*/`;
    - `agentTeams` = `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1'` en el entorno, o `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1'` en `~/.claude/settings.json`, `<cwd>/.claude/settings.json` o `<cwd>/.claude/settings.local.json` (doc oficial agent-teams);
    - `config` = `readConfig`.
  - Todos los ejecutables se inyectan por `env` o por argumento para los tests: `PIGNOLO_SETUP_BIN_<NAME>`.
- `permissions --target user|project [--apply]`:
  - lee `templates/permissions.json` y el settings de destino (`~/.claude/settings.json` o `<cwd>/.claude/settings.json`);
  - calcula `{ add: { deny: [...], ask: [...] }, already: n }`, con las reglas del template que faltan (comparación exacta);
  - sin `--apply`, solo lo imprime;
  - con `--apply`, copia el archivo a `<archivo>.pignolo-bak-<ts>`, agrega al final de cada lista lo que falta, conserva todo lo demás (claves, orden e indentación de 2 espacios) y escribe;
  - si el JSON de destino es inválido, sale con exit 1 y `settings inválido: <ruta>`, sin escribir nada;
  - si el archivo no existe, lo crea solo con `permissions`.
- `config --profile <p> [--presentation <x>] [--language <l>]`: llama a `writeConfig` y devuelve la config final.

**`skills/setup/SKILL.md`** (en inglés; frontmatter con `disable-model-invocation: true` y `description`). Lleva estos pasos:
1. Correr `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" check` y mostrar el resultado al humano, en su idioma, como checklist:
   - git menor a 2.31 → sin respaldos (§11.6);
   - sin `powershell.exe` → PowerShell queda no verificable;
   - superpowers presente → se superpone y se recomienda desinstalarlo después de probar;
   - agent teams → no soportado.
2. Perfil: explicar `max`, `balanced` y `economy` según la tabla de §7, con el aviso de que los revisores van en opus también en `economy` (§7, decisión del autor). Preguntar y escribir con `config`.
3. Permisos: correr `permissions` sin `--apply`, mostrar la lista que se agregaría y preguntar user/project/ninguno. Solo con un sí explícito del humano, en su turno, correr `--apply`.
4. Conflictos de reglas: leer `~/.claude/CLAUDE.md`, el `CLAUDE.md` del proyecto y `.claude/rules/*.md`, compararlos con `${CLAUDE_PLUGIN_ROOT}/rules/core.md` y listar cada conflicto con la cita de las dos partes y la precedencia de §1.7 (en seguridad gana el humano; en proceso, pignolo). El humano confirma. No se edita ninguna regla del usuario.
5. Engram: avisar que llega en el hito 6.
6. Recordar el modelo de amenaza (§1.9): para `auto`/`bypassPermissions` con riesgo de prompt injection, se recomienda WSL2 con `/sandbox` o un devcontainer.
7. Terminar con un resumen de lo que se escribió y dónde.

- [ ] **Paso 1: tests primero** (`tests/setup.test.js`; `HOME` y `PIGNOLO_HOME` temporales; ejecutables falsos por `PIGNOLO_SETUP_BIN_*` con scripts node mínimos):
  - `check` con un git falso que responde `git version 2.30.1` → `hooksOk:false`; con `2.45.0` → `true`;
  - un `powershell` que no existe → `powershell:false`;
  - con `~/.claude/plugins/cache/x/superpowers/` → `superpowers:true`;
  - un settings con `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` → `agentTeams:true`;
  - `permissions --target user` sobre un settings con 2 reglas propias y 1 del template → `add` no incluye esa, y `already: 1`;
  - con `--apply`: las 2 reglas propias quedan primeras y en su orden, el respaldo existe con el contenido original y las claves ajenas a `permissions` quedan intactas;
  - un settings inválido → exit 1, `settings inválido` y el archivo sin cambios (se compara byte a byte);
  - un settings ausente → se crea;
  - `config --profile economy` → `presentation:'text'`;
  - `config --profile turbo` → exit 1, sin escribir.
- [ ] **Paso 2: rojo.** Solo este archivo; se anota el resumen.
- [ ] **Paso 3: implementar** `setup.js` y `SKILL.md`, hasta el verde.
- [ ] **Paso 4: test de la skill.** En `tests/setup.test.js`, verificar que `SKILL.md` tiene `disable-model-invocation: true` y nombra `scripts/setup.js`. Es solo forma, sin probar el texto libre.
- [ ] **Paso 5: commit.** `feat(setup): /pignolo:setup con chequeo de entorno, perfil, permisos y conflictos de reglas`.

---

## Ola 2

### Unión de la ola 1

- [ ] Unir las Tasks 2 a 6 a `core/hito-2`. Los archivos son disjuntos; si aparece un conflicto, es un error del plan y se registra.
- [ ] Correr `npm run test:quiet` una sola vez. Tiene que dar verde completo, incluido `agents-tools` con los 19 roles.

### Task 7: evals de `explorer` y `researcher` (§15 `agents`)

**Files:** `tests/evals/agents/explorer-*/` y `tests/evals/agents/researcher-*/`, con `prompt.md` y `graders/*.md` según la doc oficial de plugin-evals.

Cada eval se corre así: `claude plugin eval plugins/pignolo --eval-dir tests/evals/agents --ablation none --runs 5 --max-cost-usd <tope>`, desde Windows nativo. Estos agentes no tienen shell y la doc solo exige WSL2 para suites con shell; es una hipótesis y se verifica en la primera corrida.

- **`explorer-cites-lines`:** el prompt pide despachar `pignolo:explorer` para responder dónde se valida X en un repo fixture de 6 archivos (va en `context` de la eval, sin datos reales). Graders deterministas:
  - `tool_used: Agent`;
  - `regex` sobre la respuesta: al menos 2 citas `\S+\.\w+:\d+`.
- **`researcher-no-repo`:** el prompt pide despachar `pignolo:researcher` con una pregunta sobre el comportamiento documentado de `git merge-tree --write-tree` (qué versión lo introdujo). Graders:
  - `regex`: la respuesta contiene una URL `https?://` y una de `CONFIRMED|REFUTED|INCONCLUSIVE`;
  - `tool_used` negativo sobre `Read|Grep|Glob`, si la doc lo permite. Si no lo permite, se omite y se declara en el informe.
- **Umbral:** según §0d (el que fija el spec, ≥ 80 %), pasa si 4 de 5 corridas pasan por caso.
- **Informe:** el modelo resuelto, el effort y el costo reportado, en `tests/evals/RESULTS.md`.
- **Costo:** 2 casos × 5 corridas = 10 corridas de agente, sin juez ni corrida base. Se pide el OK del autor para el tope antes de correr, porque es una decisión de costo.
- [ ] **Paso 1:** escribir los casos. Validarlos con `claude plugin eval ... --runs 1 --case <x>` (una corrida por caso) antes de la corrida completa.
- [ ] **Paso 2:** corrida completa y resultados en `tests/evals/RESULTS.md`.
- [ ] **Paso 3:** commit `test(evals): explorer y researcher (§15 agents)`.

### Task 8: cierre del hito

- [ ] **Spec:** en §6/§8.3, la definición de "activo en el proyecto" (ruling). En §11.6, la deduplicación del respaldo de refs. En §14, lo que hace `setup` sobre permisos (solo agrega y respalda).
- [ ] **Versión y docs:**
  - `plugin.json` sube a `0.2.0`;
  - una entrada en el `CHANGELOG` con el motivo;
  - en el README, una sección "Agentes y setup" con cómo correr `/pignolo:setup` y cómo activar pignolo en un proyecto (crear `.pignolo/project.md` hasta que exista `/pignolo:init`).
- [ ] **Checklist manual:** `tests/manual/hito-2.md`:
  - `/pignolo:setup` en una sesión real;
  - un despacho `Explore` negado en un proyecto activo y permitido en uno sin `project.md`;
  - `pignolo:explorer` despachado con el modelo del perfil;
  - `agent_type` de `SubagentStart` = `pignolo:explorer` (afirmación a verificar: la doc lo implica, pero no lo dice textual).
- [ ] **Suite y revisión final:** `npm run test:quiet` completo. Después, **una revisión final opus** de `main..core/hito-2`, una pasada de arreglos y una confirmación acotada.
- [ ] **Estado:** actualizar `docs/STATE.md`.
- [ ] **Unión y push:** unir a `main` y hacer push, solo con el OK del autor.
