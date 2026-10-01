# Auditoría independiente de buenas prácticas: pignolo (núcleo 0.8.1 en `main`, pignolo-ui 0.4.1)

Fecha: 2026-10-01. Alcance: `CLAUDE.md`, `docs/STATE.md`, spec v1 (§0–§3, §6–§11, §15, §18), spec de pignolo-ui (parcial), `docs/gaps.md`, `docs/benchmarks.md`, `docs/research/*`, planes de los hitos 5, 6, 7 (más la propuesta multiplan), 8, el banco "pignolo vs base" y pignolo-ui 4, y el código bajo `plugins/pignolo` (`hooks/`, `lib/`, `scripts/`, `agents/`, `skills/`, `rules/`). Solo lectura; sin commits, sin subagentes, sin corridas pagas.

Marcas: **[V]** verificado en la fuente (archivo:línea o URL leída hoy) · **[M]** medido por pignolo y citado de sus docs · **[NV]** no verificado por mí (hipótesis o dato que no pude reproducir).

Un dato de campo que salió solo durante esta auditoría: la versión instalada en la máquina del autor (pignolo 0.2.1) **negó un `grep -n "Worker|FAIL_OPEN" plugins/pignolo/hooks/launcher.js`**, un comando de solo lectura, porque el texto nombraba `launcher.js` ("el launcher de pignolo solo lo invocan los hooks"). Es exactamente el tipo de falso positivo que §15 fija en cero para "`grep`/`rg` de texto". No sé si 0.8.1 lo repite [NV]; lo anoto porque ilustra el hallazgo 1 (nadie corrió pignolo en una sesión real desde el hito 1).

---

## 1. Malas prácticas o cosas que ya se demostró que no funcionan

Ordenadas por severidad. "Camino mejor" es siempre la opción más simple que conserva la garantía.

### 1.1 Se construyeron ocho hitos sin usar el plugin en una sesión real (severidad: ALTA)

**Evidencia en pignolo [V]:** `docs/STATE.md` repite "Checklists manuales `tests/manual/hito-2.md`, `hito-3a.md`, `hito-3b.md`, `hito-5.md` sin correr en una sesión real" y "la versión instalada en la máquina del autor es vieja (0.2.1)". El spec deja como "hipótesis a verificar" en checklist cosas de las que dependen compuertas enteras: que `agent_type` llegue en el `PreToolUse` de un subagente (§8.3, `protect-paths`: "sin `agent_type` la regla no aplica"), la forma de `tool_input` de `SubagentHandback` y de `Artifact` (R-9), que `SubagentStart` entregue `additionalContext` al subagente (plan hito 6, R-5 "No verificado"), que `entry` se dispare sola (§5.1, D-3b-2 "riesgo residual: que Claude no la invoque; se mide en el checklist manual"). El plan del hito 7 (R-3) y el del 8 (R-9) siguen apilando "a verificar" sobre esas mismas hipótesis.

**Evidencia externa:** Anthropic, sistema multiagente (2025-06-13, https://www.anthropic.com/engineering/multi-agent-research-system): "People testing agents find edge cases that evals miss". Anthropic, evals de agentes (2026-01-09, https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): "You won't know if your graders are working well unless you read the transcripts and grades from many trials"; y la trampa "estado vs mensaje" (el agente dice "booked" y la base no tiene la reserva). MAST (Cemri et al., 2025, https://arxiv.org/html/2503.13657v3): 23,5 % de las fallas multiagente son de verificación (sin verificación 8,2 %, verificación incorrecta 9,1 %, terminación prematura 6,2 %), y "sole reliance on final-stage, low-level checks is inadequate".

**Camino mejor:** antes del hito 6, instalar 0.8.1 en la máquina del autor, crear `.pignolo/project.md` a mano en el propio repo de pignolo y correr los checklists de los hitos 2 a 5 una sola vez, registrando cada hipótesis como confirmada o falsa. Lo que salga falso cambia los planes 6/7/8 antes de gastarlos. Costo: una tarde del autor; cero USD de agentes.

### 1.2 La guardia de texto es una carrera armamentista contra una denylist, y la propia investigación de pignolo dice que eso no funciona (severidad: ALTA en costo, MEDIA en riesgo)

**Evidencia en pignolo [V]:** `lib/git-guard.js` 1.707 líneas + `lib/shell-parse.js` 385 + `lib/ps-ast.js` 168 (2.260 líneas solo de análisis de comandos); tres rondas de auditoría adversarial (`docs/audits/`), corpus de 119 + 186 comandos, 5.981 comandos reales medidos, un registro de riesgo residual (`tests/guard/residual-risk.md`), canario por familia en cada `SessionStart` (~0,9 s), parseo de PowerShell lanzando `powershell.exe` por comando (~0,35 s, §11.6), y las reglas siguen creciendo en cada hito (`pignolo-run`, `pignolo-holdout`, `pignolo-plan`, `sabotage-lock`, `pignolo-queue` y `pignolo-worktree-tools` en el hito 7, `pignolo-init` en el 8). `docs/research/2026-09-27-seguridad-agentes-ciego.md` y `-contexto.md` concluyen que ninguna guardia de texto resiste y que "la red real es la recuperación fuera del repo".

**Evidencia externa:** Cursor deprecó su denylist en 1.3 tras evasiones (`"e"cho`, subshells, base64) y Gemini CLI tuvo que reemplazar la allowlist por prefijo por un policy engine (citado con fuentes en el propio `docs/research/2026-09-27-seguridad-agentes-contexto.md`). CVE-2025-66032 (`$IFS` y flags cortos; https://github.com/advisories/GHSA-xq4m-mc3c-vvg3) y el caso de deny rules ignoradas con más de 50 subcomandos (https://adversa.ai/blog/critical-claude-code-vulnerability-deny-rules-silently-bypassed-because-security-checks-cost-too-many-tokens/). Un desarrollador que evadió su propia deny-list de 8 formas (2026-09-11, https://dev.to/glitchbound/i-bypassed-my-own-claude-code-deny-list-in-eight-ways-only-an-allow-list-held-lp8): "Anything unknown fails closed... whack-a-mole with shell grammar"; solo sostuvo "referencing a protected path is denied unless every verb in the command is on a short read-only allow-list". Doc oficial de Claude Code: las reglas de Bash "isn't a security boundary around the program" y el sandbox nativo "Native Windows is not supported... run inside WSL2" (citado en `docs/research/...-contexto.md` §3).

**Camino mejor:** congelar la guardia en lo que ya existe (conjunto catastrófico + fail-closed estructural ante lo dinámico + reglas de git no recuperables) y **no agregar más reglas por texto** en los hitos 6–8: cada regla nueva (`pignolo-queue`, `pignolo-init`) protege un script que un `node -e "require(...)"` saltea igual (el plan 7 lo admite en R-13 y el 8 en A8-09). Reemplazar las reglas "quién ejecuta este script" por una verificación en el propio script (`process.env.CLAUDE_AGENT_ID` o un token que escribe el hilo principal) y por la capa 2 (sellos). Recomendar WSL2 + `/sandbox` como entorno para `auto`/`bypass` (ya aprobado el 2026-09-27, punto 6) y dejar de invertir en PowerShell nativo.

### 1.3 El hito 7 construye ejecución de planes en paralelo cuando los datos de pignolo y la literatura dicen que la serie gana (severidad: ALTA en costo)

**Evidencia en pignolo [V]:** `docs/benchmarks.md` §2b: paralelo ≈ 15 % más rápido, ≈ 2× tokens, misma calidad; G16: 780 mil tokens contra 145 mil. CLAUDE.md fija "un solo ejecutor en serie por defecto". Aun así, el plan del hito 7 suma la función multiplan D-7-8 (R-15 a R-20: cola de planes derivada, tope `activePlans`, solapamiento de archivos, `plan-busy`/`plan-overlap`, `queue.js update`, regla `int-behind` en `scope-gate`, `run.json` con `plans[]`), **~285 subtests en 19 archivos** solo en 7a, más informes por tarea con tres compuertas. La propuesta de spec (`docs/plans/2026-10-01-hito-7-spec-multiplan-propuesta.md`) agrega una sección §11.7 entera.

**Evidencia externa:** Anthropic (2025-06-13): "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time"; "domains that require all agents to share the same context or involve many dependencies between agents are not a good fit". Cognition, "Don't Build Multi-Agents" (2025-06-12, https://cognition.com/blog/dont-build-multi-agents): "Actions carry implicit decisions, and conflicting decisions carry bad results"; recomienda un agente de un solo hilo. MAST: 32 % de las fallas son desalineación entre agentes. Doc oficial de agent teams (https://code.claude.com/docs/en/agent-teams): "For sequential tasks, same-file edits, or work with many dependencies, a single session or subagents are more effective".

**Camino mejor:** un plan activo por proyecto, en serie, con `int/<plan>` y merge a `main` de a uno (ya lo da `scope-gate`). Quitar Tasks 16 a 19 del hito 7 y la §11.7. Si el autor quiere escribir y auditar varios planes a la vez, el registro del 5a ya lo soporta (R-15 lo confirma): basta `plan.js list` y `next` que muestre todos. Eso es ~una tarea, no cuatro.

### 1.4 Latencia de hooks: hasta cinco procesos `node` por cada `Bash`, con instantánea de git adentro de la ruta crítica (severidad: MEDIA)

**Evidencia en pignolo [V]:** `hooks/hooks.json`: sobre `Bash|PowerShell` corren en `PreToolUse` `guard`, `private-reads`, `scope-gate` y `plan-audit-gate` (cuatro entradas, cada una un `node launcher.js` con `worker_thread`, `hooks/launcher.js:92`), más `plan-audit-gate` en `PostToolUse` y `PostToolUseFailure`; `private-reads` corre además sobre **todo** `Read|Grep|Glob`. La instantánea WIP se toma dentro de `guard` antes de cada comando (`handlers/guard.js:42`, plazo 2 s de los 3) y antes de cada despacho (`agent-gate.js:54`). Medido por pignolo: guard 0,25–0,35 s con sombra, PowerShell 0,35 s, canario 0,9 s al arrancar. **No medido el total por comando con los cuatro hooks [NV].** El hito 6 agrega `egress` sobre `WebSearch|WebFetch|mcp__.*` y `SubagentStart`; el 7 y el 8, más reglas en `guard`.

**Evidencia externa:** guía comunitaria de producción: PreToolUse en la ruta crítica, "A PreToolUse hook that takes two seconds adds two seconds to every matching tool call, and in an agentic run that is thousands of calls"; mantenerlos por debajo de 100–500 ms (https://www.totalum.app/blog/claude-code-hooks-totalum; https://dev.to/yurukusa/5-claude-code-hook-mistakes-that-silently-break-your-safety-net-58l3, 2025). Anthropic, context engineering (2025-09-29): el presupuesto es la atención del modelo; un hook que niega por plazo bajo carga provoca reintentos, que la propia guardia después penaliza (regla 6 de `core.md`). pignolo ya lo sufrió: "el hook de `Agent` superaba el plazo de 3 s con muchas refs y negaba despachos permitidos" (STATE, hito 2) y tuvo que abrir un atajo para el hilo principal en `private-reads`.

**Camino mejor (técnico):** una sola entrada por evento (`launcher.js all`) que corra los handlers en proceso y en orden, con los atajos de `lib/hook-fastpath.js` al principio; sacar la instantánea WIP de `PreToolUse` a un proceso en segundo plano lanzado por `SessionStart` que la tome al detectar cambios (o al menos a `PostToolUse`, que no bloquea); eliminar `private-reads` (ver 4.3). Medir p50/p99 por comando antes y después y fijar un presupuesto (< 300 ms sin PowerShell).

### 1.5 El "informe por tarea" lo escribe el mismo agente que escribió el código, y se le ponen tres compuertas de formato (severidad: MEDIA)

**Evidencia en pignolo [V]:** plan hito 7 R-18: plantilla `task-report.md`, validada por `handback-gate`, por `queue.js precheck` (`report-missing|invalid|stale`) y por `plan.js close`/`scope-gate`; el propio ruling (g) admite: "el informe lo escribe el mismo agente que el código; el formato ... prueba que lo declaró ..., no que sea cierto".

**Evidencia externa:** Anthropic, harness para desarrollo largo (2026-03-24, https://www.anthropic.com/engineering/harness-design-long-running-apps): "When asked to evaluate work they've produced, agents tend to respond by confidently praising the work"; "tuning a standalone evaluator to be skeptical turns out to be far more tractable". Anthropic, evals (2026-01-09): "grade what the agent produced, not the path it took".

**Camino mejor:** generar el informe por script (`report.js build` a partir del diff, el sello, los resultados de `sabotage.js` y los tests agregados) y dejarle al agente solo la sección `Doubts` libre. Eso elimina `report-invalid` y `report-stale` por construcción y deja una compuerta (la del cierre). La revisión final sigue leyendo el `bundle`.

### 1.6 Las evals de agentes están saturadas y miden contrato, no aporte (severidad: MEDIA)

**Evidencia en pignolo [V]:** `docs/benchmarks.md` §3: 60/60, 58/60, 35/35, 20/20 sobre "defectos plantados en diffs chicos y sintéticos"; §7 del spec: "Límite: fixtures chicos y sintéticos; con diffs grandes la diferencia de calidad no está medida"; la decisión de pasar `economy` a sonnet se tomó con esa suite. "Comparabilidad: mide si los agentes cumplen su contrato, no si pignolo mejora a Claude Code". La suite `agents` propia no usa el baseline con/sin plugin de `claude plugin eval`.

**Evidencia externa:** Anthropic (2026-01-09): saturación ("Once agents reach 100% pass rates, capability evals provide no improvement signal"); "20-50 simple tasks drawn from real failures is a great start"; balancear casos positivos y negativos; `pass^k` para fiabilidad. Doc de `claude plugin eval` (https://code.claude.com/docs/en/plugin-evals): "If a case scores 1.0 both with and without the plugin, the plugin isn't what made it pass"; graders deterministas donde se pueda. Sesgos del LLM-juez (posición, verbosidad, autopreferencia): https://arxiv.org/pdf/2410.21819, https://arxiv.org/pdf/2412.05579.

**Camino mejor:** reemplazar los fixtures sintéticos por los defectos reales que ya encontraron las revisiones finales (1 crítico + 4 importantes del 4a, 8 formas de `scope-gate` del 5a, los 21 hallazgos del plan 7, etc.) y escribir 10–20 casos de punta a punta con Δ contra "sin plugin" (¿`entry` se dispara?, ¿un test decorativo plantado llega a `int/`?). Reportar `pass^k`. Dejar de correr las suites que dan 100 %.

### 1.7 `docs/STATE.md` como primer archivo de cada sesión pesa más que el límite de lectura (severidad: MEDIA)

**Evidencia en pignolo [V]:** CLAUDE.md: "Al retomar, leer primero `docs/STATE.md`"; el archivo tiene 152 líneas pero ~25.300 tokens (mi `Read` falló por superar 25.000), con la historia completa de los hitos 1 a 5 en párrafos de cientos de palabras. Los planes son del mismo estilo: hito 1, 10.291 líneas; hito 7, 656 líneas con rulings de 300 palabras.

**Evidencia externa:** Anthropic, context engineering (2025-09-29): "the smallest possible set of high-signal tokens"; best practices (https://code.claude.com/docs/en/best-practices): "LLM performance degrades as context fills", CLAUDE.md "under 200 lines", "If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long".

**Camino mejor:** `STATE.md` ≤ 120 líneas con solo el bloque "ESTADO AL <fecha>" y la lista de decisiones abiertas; mover la historia a `docs/history/<fecha>.md` que no se lee al retomar. Mismo criterio para los rulings de los planes: una línea por ruling y el detalle en un apéndice.

### 1.8 Revisión de riesgo alto: 4 lentes + refutadores + reproducción + 2 jueces ciegos, sin medir que valga más que un revisor (severidad: MEDIA)

**Evidencia en pignolo [V]:** spec §7 y §12; `skills/review/SKILL.md` (11.572 caracteres) y `skills/judgment/SKILL.md`; `agents/review-{risk,resilience,readability,reliability}.md` son cuatro archivos de 44–46 líneas casi iguales y `judge-a.md`/`judge-b.md` idénticos. La única medición es sobre fixtures sintéticos (1.6). El spec exige "acuerdo entre jueces > 95 %" como alarma (§16) sin dato que lo sostenga.

**Evidencia externa:** best practices de Claude Code: "A reviewer prompted to find gaps will usually report some, even when the work is sound... Chasing every finding leads to over-engineering"; recomienda **un** revisor en contexto fresco con criterios acotados. Anthropic (2025-12-19, https://www.anthropic.com/research/building-effective-agents): el patrón evaluador-optimizador sirve "when we have clear evaluation criteria, and when iterative refinement provides measurable value". Superpowers, el antecedente directo, recibe como crítica principal el costo de ceremonia (HN 2026, https://news.ycombinator.com/item?id=47623101; https://mcp.directory/blog/superpowers-skill-worth-it-2026: "full loop on small tasks burns your window on ceremony").

**Camino mejor:** riesgo alto por defecto = `review-reliability` + `review-testability` + 1 refutador; las cuatro lentes y Judgment Day solo en `max` o a pedido, hasta que un A/B sobre diffs reales muestre hallazgos adicionales por USD. Fusionar las cuatro lentes en un agente con la lente como parámetro del brief (un archivo, no cuatro).

### 1.9 Migrar la auto-memoria de Claude a un almacén propio versionado (hito 8, Task 5) reinventa una función de la plataforma y crea un riesgo de fuga (severidad: MEDIA)

**Evidencia en pignolo [V]:** plan hito 8, R-14 y R-16: leer `<config>/projects/<slug>/memory/`, copiar a `learnings/proposed/` (en git), apagar `autoMemoryEnabled`; el propio plan lo marca "RIESGOSO" y pide auditoría previa. Hito 6b: `learning-validator` con evals pagas (tope 8 USD) para filtrar aprendizajes.

**Evidencia externa:** doc de subagentes (https://code.claude.com/docs/en/sub-agents): `memory: project|user|local` nativo para subagentes; la auto-memoria del proyecto es por usuario y no se versiona, así que no tiene el problema de PII en un repo público que el plan intenta mitigar con `scanLearning`. Anthropic (2025-09-29): "structured note-taking" sí, pero como notas que el agente escribe fuera del contexto, no un pipeline de validación con otro agente.

**Camino mejor:** dejar la auto-memoria nativa encendida, no migrarla, y reducir `.pignolo/state/` a `decisions/` e `issues/` (lo que sí es juicio del proyecto y conviene versionar). Quitar `learning-validator`, sus evals y la Task 5 del hito 8.

### 1.10 El handback-gate reintenta hasta 8 veces un cierre que el orquestador ya limita a 2 (severidad: BAJA-MEDIA)

**Evidencia en pignolo [V]:** §8.3 "contador propio de 8" en `~/.pignolo/handback/`; `skills/daily/SKILL.md:12` "Continue at most twice"; G9: "un agente en segundo plano repite su informe en bucle (~40 informes iguales)".

**Evidencia externa:** MAST: repetición de pasos 15,7 % (la falla individual más frecuente); Anthropic (2025-06-13): agentes "distracting each other with excessive updates".

**Camino mejor:** tope del hook en 3; con el tercero, `blocked` y salir. El orquestador ya decide.

### 1.11 Sabotaje por parche unificado escrito a mano por el orquestador (severidad: BAJA-MEDIA, fragilidad)

**Evidencia en pignolo [V]:** `skills/daily/SKILL.md` paso 12 (líneas 38–45): el hilo principal escribe un diff unificado con líneas de contexto "copiadas exactamente", seis ramas de salida distintas (exit 0/1/2/3, `timedOut`, `greenBefore`, `refused: patch`), dos corridas de la suite por sabotaje. G7 nació de que un exit 2 se leyó mal.

**Evidencia externa:** la práctica reconocida es mutación con herramienta (Stryker/mutmut) o "immutable tests" (Kent Beck, 2025-06-11, https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent). Anthropic best practices: "Give Claude a check it can run... a script that diffs output against a fixture".

**Camino mejor (técnico):** `sabotage.js --file <ruta> --line <n> --replace <texto>` (o `--delete-line`) que genere el parche él mismo; la skill pasa tres argumentos en vez de un diff. Mismo candado y recuperación. Menos ramas: rojo / no rojo / no veredicto.

### 1.12 Presentación visual, lienzo "Design", aprobados con sha256 y `APPROVALS.md` dentro de un plugin de metodología (severidad: BAJA en riesgo, MEDIA en costo)

**Evidencia en pignolo [V]:** §4.6 (plantillas que el autor aprueba una por una, `present-gate` sobre `Artifact`, `approved.js` con manifest inmutable, consentimiento por proyecto), `skills/present`, `lib/present.js`, `scripts/approved*.js`; el formato del lienzo está "No verificado" en pignolo-ui R-7. Ningún antecedente (superpowers, gentle-ai, docs oficiales) lo incluye en el flujo de desarrollo.

**Camino mejor:** texto por defecto en todos los perfiles; `present` y lo visual a v1.x, salvo que una medición muestre que la decisión del humano mejora.

### 1.13 Agentes y skills cargados en toda sesión del usuario, también fuera de pignolo (severidad: BAJA)

**Evidencia en pignolo [V]:** 19 agentes, cada uno con la frase fija "Dispatched only by pignolo skills with a task-card; never use directly." repetida 19 veces en las descripciones; 12 skills. Al instalarse a nivel usuario, todas las descripciones entran al contexto de cada sesión del autor (incluido su proyecto `personal-hub-apps`).

**Evidencia externa:** doc de subagentes: "Those descriptions take up context, so keep them short" (aviso a los 15.000 tokens); doc de skills: el listado se recorta a 1.536 caracteres por skill y "the budget scales at 1% of the model's context window".

**Camino mejor:** una descripción de ≤ 60 caracteres por agente (la frase "never use directly" en el cuerpo, no en la descripción); fusionar `judge-a`/`judge-b` y las cuatro lentes (ver 1.8) → de 19 a ~11 agentes.

---

## 2. Lo que pignolo hace bien (con fuente)

- **Verificación determinista fuera del agente** (`scripts/gate.js`, sello con `tree-hash`, `handback-gate` que no acepta `DONE` sin sello, "A report is not proof" en `skills/daily/SKILL.md:11`). Coincide con la guía oficial: "Give Claude a check it can run... As a deterministic gate: a Stop hook runs your check as a script" y "Have Claude show evidence rather than asserting success" (https://code.claude.com/docs/en/best-practices). Y con el harness de Anthropic (2026-03-24): evaluador separado del generador.
- **Integridad de tests por diff** (`lib/test-integrity.js`: `skip`/`only`/reintentos/snapshots/aserciones quitadas → `INTEGRITY`; `protect-paths` por rol). Es la respuesta mecánica al problema que Kent Beck describe (los agentes borran tests para que pasen; tests "inmutables", 2025-06-11) y a la instrucción de Anthropic en el harness largo (2025-11-26, https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): "It is unacceptable to remove or edit tests".
- **Rojo demostrado y test-writer que no ve la implementación** (§9.1; D-4-1). El problema de los tests escritos junto al código que "pasan esté bien o mal el código" está documentado (https://specstory.com/learning/verification/test-tampering); el sesgo a dobles de los agentes también (36 % de los commits de agentes agregan mocks contra 26 % humanos; https://arxiv.org/abs/2602.00409, 2026-01-30), y §9.1 fija "real > fake > mock".
- **Serie por defecto, decidida con un A/B propio** (`tests/evals/RESULTS-ejecucion.md`; G16). Es lo que recomiendan Cognition (2025-06-12) y Anthropic (2025-06-13) para código.
- **Recuperación fuera del repo** (repo sombra `~/.pignolo/shadow`, instantáneas WIP, respaldo de refs, reflog sin vencimiento; §11.6) en lugar de confiar en la guardia. Todos los post-mortems citados en `docs/research/2026-09-27-*` convergen ahí, y la doc oficial dice que los checkpoints "do not track files modified by Bash commands".
- **Modelo de amenaza escrito y guardia declarada best-effort** (§1.9), fail-closed ante lo dinámico, conjunto catastrófico innegociable: es la forma madura de cc-safety-net y dcg, y lo que la doc de Claude Code dice de sus propias reglas.
- **"Mecanismos, no texto" y hooks callados en el éxito** (§6.1, §8.3): lo mismo que la guía oficial ("If Claude already does something correctly without the instruction, delete it or convert it to a hook"; "hooks are deterministic... CLAUDE.md instructions ... are advisory").
- **`disable-model-invocation: true` en lo que tiene efectos** (`setup`, `on`, `off`, `init`): tal cual la doc de skills.
- **Medir antes de decidir y publicar lo que sale** (`docs/benchmarks.md`, `docs/gaps.md`, A/B del plan-auditor, política de repetición pre-merge con 600 merges simulados, calibración de graders a mano, G10/G11). Coincide con "Demystifying evals" (2026-01-09): empezar chico con fallas reales, leer transcripciones, desconfiar del calificador antes que del agente.
- **Graders estrictos donde una máquina parsea y tolerantes con la redacción** (regla del 2026-09-30): es literalmente la recomendación de la doc de `claude plugin eval` ("A small judge model can mark a correct answer wrong because it's formatted differently").
- **Auditoría de planes con experimentos forzados** (hito 5): la medición propia (38–46 % contra 21–33 % solo leyendo) justifica el costo; coincide con la idea de "spike del riesgo más alto" de `docs/research/2026-09-30-validar-planes-sin-implementar-dos-veces.md`.
- **Autonomía acotada con lista cerrada de decisiones reservadas y preguntas con categoría** (§4): es el "right altitude" de Anthropic (2025-09-29) aplicado a cuándo frenar.

---

## 3. Por desarrollar: riesgos y camino más óptimo

### Hito 6 (continuidad)

- **Riesgo 1:** `SubagentStart` → `additionalContext` no verificado (R-5). Si no llega, `rules/core.md` nunca se inyecta y todo §6.1 queda en texto muerto. **Camino:** verificarlo en una sesión real (hallazgo 1.1) antes de la Task 8; si no llega, poner `core.md` en el cuerpo de cada agente (1.316 caracteres, costo despreciable) y borrar el hook.
- **Riesgo 2:** nivel caliente de hasta 8.000 caracteres en cada `SessionStart` (startup, resume, clear, compact, fork). Es contexto fijo en cada arranque, contra "smallest set of high-signal tokens" (Anthropic, 2025-09-29). **Camino:** tope 2.500 caracteres; solo `next` + trabajo en curso + contadores; el resto a demanda con `INDEX.md`.
- **Riesgo 3:** `gc` con heurística y poda de la sombra (R-6) es el único código del hito que puede perder datos, y el propio plan admite que "no protegen nada, solo recuperan disco antes". **Camino:** no construirlo en v1; dejar `gc --auto` y la regla de 14 días que ya existe. Disco es barato; una copia perdida no.
- **Riesgo 4:** `egress` agrega otro hook sobre `WebSearch|WebFetch|mcp__.*` para todo subagente durante un flujo. **Camino:** los agentes de pignolo ya no tienen `WebSearch`/`WebFetch` ni MCP en `tools` (§6), que es el mecanismo nativo; el hook solo cubre subagentes ajenos durante un flujo, que `agent-gate` ya niega. Es redundante: quitar la Task 4 o reducirla al filtro de la consulta del `researcher`.
- **Riesgo 5:** `learning-validator` + `close-session` + evals (6b): ver 1.9. **Camino:** `close-session` = archivar lo vencido, regenerar `INDEX.md`, commit. Sin agente.

### Hito 7 (ramas y paralelismo)

- **Riesgo 1 (el mayor):** multiplan (1.3). **Camino:** quitar Tasks 16–19 y la §11.7; `plan.js list` + `next` con todos los planes; un plan activo.
- **Riesgo 2:** mecanismo A (`WorktreeCreate` reemplazando la creación nativa) pierde los controles de aislamiento nativos (R-1 b, "no está medido"). **Camino:** B como principal (ya funcionó en los hitos 2–5), A fuera del plan; ahorra la Task 13 y el checklist.
- **Riesgo 3:** cola con rama `queue/<plan>`, `merge-tree` como previsión (exige git ≥ 2.38 y su exit no distingue conflicto de error, R-5), lock sin latido, CAS sobre `int/`. Mucha mecánica para un solo autor en serie. **Camino:** merge directo en una worktree de `int/<plan>` con `pre-merge` sellado y `--ff-only` por CAS; sin `queue/` ni `merge-tree`. Conserva el Focus 1 (nada entra a `int/` sin sello) con la mitad del código.
- **Riesgo 4:** informes por tarea (1.5). **Camino:** `report.js build` por script.
- **Lo que sí vale:** la política de repetición D-7-3 (medida, 600 merges), `cleanup` conservador (D-7-5/D-7-7, con el ataque T5b real), `run.json` v2 aditivo, el ejecutor inyectable de git (A7-18 medido).

### Hito 8 (`init`, adopción, medición)

- **Riesgo 1:** es el hito que vuelve usable el plugin y está último en el orden ("5b → UI4 → 6 → 7 → UI5 → 8"). Todo lo anterior se construye sin usuario. **Camino:** adelantar 8a (`init.js detect|preview|apply` con `project-md`, `reflog`, `ignores`) **antes** del 6 y usarlo en el propio repo de pignolo. Es la forma más barata de cerrar 1.1.
- **Riesgo 2:** Task 5 (auto-memoria): 1.9. Quitar.
- **Riesgo 3:** `SECURITY.md` y la línea base de seguridad (§14) no son metodología de desarrollo con agentes; amplían el producto. **Camino:** fuera de v1 (ya está en v1.1 la línea base; mover también el `SECURITY.md`).
- **Riesgo 4:** `{seed}` con tabla `SEED_ARGS` verificada por runner (R-7): correcto y chico. Mantener.
- **Riesgo 5:** `package.json` en `protected-test-config` (R-10) bloqueará al `implementer` en cualquier tarea que toque scripts o dependencias. Es coherente con "dependencias las decide el humano", pero el costo en `BLOCKED` no está medido. **Camino:** proteger solo la clave `scripts.test` (comparar el JSON parseado, no el archivo) o aceptar la fricción y medirla en el checklist.

### pignolo-ui 4 y 5

- **Riesgo 1:** es un segundo producto (catálogo de 37 reglas, navegador por CDP, lienzo "Design", síntomas, `compare`, 15 rulings) con su propio spec de 963 líneas, mientras el núcleo todavía no se usó. **Camino (del autor):** congelar pignolo-ui después de 4a (lo determinista) y no planificar UI5 hasta que el núcleo esté adoptado. Si UI4b se hace, que sea texto + HTML local; el lienzo "Design" depende de un formato "No verificado" (R-7).
- **Riesgo 2:** `ui-option` con solo `Write` no puede sobrescribir lo que no leyó (C-02), lo que obligó al mecanismo `discard`. Correcto, pero señal de que la aislación por `tools` choca con el flujo. Mantener; está medido.
- **Lo que sí vale:** "no corrió no es pasó" (Global Constraints), veredicto `terminado` por función de `lib` y no por el modelo (Focus 1), auditor sin Bash con evidencia obligatoria.

### Banco final (pignolo vs base, ~200 USD)

- **Riesgo 1:** n = 3 por brazo y tarea no distingue nada (el plan lo declara). Con 4 brazos × 7 tareas × 3 reps la mayor parte del gasto va a comparaciones sin potencia. **Camino:** opción A (~54 USD) primero: solo `seeded` con 5 reps en `base` y `pignolo-balanced`, reportando `pass^k` y dispersión (Anthropic, 2026-01-09). Ampliar solo si la diferencia supera la dispersión.
- **Riesgo 2:** las hipótesis de aislamiento H1–H4 (plugins de usuario cargados en el brazo `base`, `CLAUDE_CONFIG_DIR`) pueden contaminar todo. **Camino:** la "prueba de aislamiento" del plan debe ser la etapa 0 completa y abortar si falla; está bien diseñada, solo hay que no saltearla.
- **Riesgo 3:** sesgo de percepción. METR (2025-07, https://x.com/METR_Evals/status/1943360399220388093): desarrolladores 19 % más lentos con IA creyendo ser 20 % más rápidos; METR hoy lo marca como histórico. **Camino:** medir tiempo de pared e intervenciones con reloj, nunca por impresión; ya está en las métricas del plan. Mantener la calificación manual del 25 % (G10/G11).
- **Riesgo 4:** comparar contra superpowers con "su flujo por defecto" sin fijar versión ni prompt es justo, pero su costo (brazo ≈ 1,0 USD por tarea) se va en ceremonia, como pignolo. Publicar costo por defecto evitado, no solo defectos.

---

## 4. Costo y complejidad: dónde pignolo está sobredimensionado y qué cortar

| Qué | Dónde | Por qué sobra | Qué cortar / simplificar |
|---|---|---|---|
| Multiplan y cola de planes | Plan 7, Tasks 16–19, §11.7 | Contradice el A/B propio y la literatura (1.3) | Quitar; un plan activo |
| `queue/` + `merge-tree` + lock | Plan 7, Tasks 5–6, R-4/R-5/R-8 | Un autor, en serie; `merge-tree` exige 2.38 y es ambiguo | Merge directo en worktree de `int/` con sello + CAS |
| Mecanismo A de worktrees | Plan 7, R-1, Task 13 | B ya funciona; A pierde controles nativos | Solo B |
| Informes por tarea con 3 compuertas | Plan 7, R-18 | Autoinforme del mismo agente (1.5) | Informe por script, 1 compuerta |
| Guardia: reglas nuevas por script (`pignolo-queue`, `pignolo-init`, `pignolo-worktree-tools`) | Plan 7 Task 8, plan 8 Task 8 | Cada una la saltea `node -e`; la protección real es el script y el sello | No agregar; verificación dentro del script |
| Parseo de PowerShell con `powershell.exe` por comando | `lib/ps-ast.js`, §11.6 | 0,35 s por comando, 3,3 % de uso; sandbox nativo no existe en Windows | Mantener solo el conjunto catastrófico por texto para PowerShell; o negar PowerShell a subagentes y preguntar en el hilo principal |
| `private-reads` sobre todo `Read|Grep|Glob|Bash` | `hooks.json`, §8.3 | Un hook en cada lectura para proteger un almacén que vive fuera del repo y que solo el `validator` corre; declarado best-effort | Quitar el hook; dejar el almacén fuera del repo y la regla de quién ejecuta `holdout.js` |
| Cuatro entradas de hook por `Bash` | `hooks.json` | Cuatro procesos node por comando (1.4) | Una entrada, handlers en proceso |
| Instantánea WIP en `PreToolUse` | `guard.js:42`, `agent-gate.js:54` | 2 de los 3 s del plazo en la ruta crítica | Proceso en segundo plano desde `SessionStart` |
| 19 agentes, 4 lentes casi idénticas, 2 jueces idénticos | `agents/` | Contexto de descripciones en toda sesión; mantenimiento ×4 | ~11 agentes; lente por parámetro |
| Judgment Day y 4 lentes por defecto en riesgo alto | §7, §12 | Sin medición en diffs reales (1.8) | Solo `max`; medir |
| `learning-validator`, migración de auto-memoria, Engram | Plan 6b, plan 8 Task 5, §10.4–10.5 | Reinventa memoria nativa (1.9) | Quitar; `decisions/` e `issues/` en git |
| Presentación visual, lienzo, `APPROVALS.md`, `present-gate` | §4.6, `skills/present`, `lib/present.js`, `scripts/approved*.js` | Fuera de la metodología; formato no verificado | v1.x; texto por defecto |
| `SECURITY.md` y línea base de seguridad | §14, plan 8 Task 10 | Otro producto | v1.x |
| Canario en cada `SessionStart` | §8.4 | 0,9 s por arranque para detectar que un hook propio se rompió; `/pignolo:status` ya lo puede hacer a pedido | Solo en `/pignolo:status` y en `npm test` |
| `STATE.md` de 25k tokens y planes de 650–10.000 líneas | `docs/` | Context rot al retomar (1.7) | ≤ 120 líneas; historia aparte |
| Suite de 2.275 tests (134 s) creciendo ~200–285 por hito | `tests/` | Buena parte prueba heurísticas de texto de la guardia que se declaran best-effort | Congelar el corpus de la guardia; no sumar reglas |
| Banco de ~200 USD | `plan/bench-unify` | Sin potencia estadística con n = 3 | Opción A (~54) |
| pignolo-ui como producto paralelo | `plugins/pignolo-ui` | Duplica el esfuerzo antes de adoptar el núcleo | Congelar tras 4a |

Lo que **no** conviene cortar aunque parezca pesado: la auditoría de planes en dos pasos (medida, 38–46 % de recall y menos hallazgos en la revisión final), el sello por `tree-hash`, la integridad de tests, el repo sombra y la revisión final opus única por hito.

---

## 5. Top 10 de cambios recomendados, por prioridad

1. **Usar pignolo antes de seguir construyéndolo** — *del autor (alcance)*. Instalar 0.8.1, activar en el propio repo, correr los checklists de los hitos 2–5 una vez y confirmar o refutar las hipótesis de payloads (`agent_type` en subagentes, `SubagentHandback`, `SubagentStart`, `entry` disparándose sola). Adelantar 8a (`init`) para hacerlo. Cero USD; cambia los planes 6/7/8.
2. **Quitar la función multiplan del hito 7** (Tasks 16–19, §11.7, `queue.js update`, `int-behind`) — *del autor (alcance, contrato)*. Un plan activo, en serie, unión a `main` de a uno con el `scope-gate` que ya existe.
3. **Simplificar la cola del hito 7**: sin `queue/<plan>`, sin `merge-tree`, mecanismo B como único — *técnica*. Merge en worktree de `int/` + `pre-merge` sellado + `--ff-only` por CAS.
4. **Congelar la guardia y recomendar WSL2 + `/sandbox` como entorno para modos autónomos** — *del autor (alcance)*. No más reglas por texto ni más PowerShell; cada script nuevo se protege a sí mismo y por el sello.
5. **Una sola invocación de hook por evento, instantánea fuera de la ruta crítica, quitar `private-reads`, canario solo a pedido; medir p50/p99 por comando y fijar presupuesto < 300 ms** — *técnica*.
6. **Evals con fallas reales y Δ contra "sin plugin"**: reemplazar los fixtures sintéticos saturados por los hallazgos reales de las revisiones finales; 10–20 casos de punta a punta con baseline; reportar `pass^k` — *técnica*.
7. **Quitar `learning-validator`, la migración de la auto-memoria y Engram**; `.pignolo/state/` solo con `decisions/` e `issues/`; `close-session` sin agente — *del autor (alcance)*.
8. **Revisión de riesgo alto = reliability + testability + 1 refutador**; lentes completas y Judgment Day solo en `max`; fusionar lentes y jueces en un agente parametrizado (19 → ~11 agentes, descripciones de una línea) — *del autor (costo)* para el perfil, *técnica* para la fusión.
9. **`STATE.md` ≤ 120 líneas y nivel caliente ≤ 2.500 caracteres**; historia a `docs/history/`; rulings de los planes en una línea con apéndice — *técnica*.
10. **Presentación visual, lienzo "Design", `APPROVALS.md`, `SECURITY.md` y pignolo-ui 4b/5 a v1.x; banco final en opción A (~54 USD) con `pass^k` y dispersión publicada** — *del autor (alcance, costo)*.

Cambios técnicos menores que el agente puede hacer sin preguntar: `sabotage.js --file/--line/--replace` en vez de parche unificado (1.11); tope del handback-gate en 3 (1.10); informe por tarea generado por script si el hito 7 lo conserva (1.5); una línea de descripción por agente (1.13).

---

## Lo que no pude verificar

- La latencia total real por comando con los cuatro hooks de `Bash` encadenados (solo hay cifras parciales de pignolo).
- Si el falso positivo sobre `grep ... launcher.js` que observé en 0.2.1 persiste en 0.8.1.
- El contenido exacto de las secciones del spec de pignolo-ui que no leí (§4–§13); mis observaciones sobre pignolo-ui salen del plan UI4 y de STATE.
- Los porcentajes del "2026 Agentic Coding Trends Report" de Anthropic (el PDF no se pudo extraer); no lo cito.
- Que la reducción de 4 lentes a 2 conserve el recall en diffs reales: es una hipótesis que pide el A/B del punto 8.

## Fuentes externas (todas leídas el 2026-10-01)

- Anthropic, Building effective agents (2024-12-19): https://www.anthropic.com/research/building-effective-agents
- Anthropic, How we built our multi-agent research system (2025-06-13): https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic, Effective context engineering for AI agents (2025-09-29): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, Effective harnesses for long-running agents (2025-11-26): https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic, Demystifying evals for AI agents (2026-01-09): https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Anthropic, Harness design for long-running application development (2026-03-24): https://www.anthropic.com/engineering/harness-design-long-running-apps
- Claude Code docs: best practices https://code.claude.com/docs/en/best-practices · hooks https://code.claude.com/docs/en/hooks · subagents https://code.claude.com/docs/en/sub-agents · skills https://code.claude.com/docs/en/skills · plugin evals https://code.claude.com/docs/en/plugin-evals · agent teams https://code.claude.com/docs/en/agent-teams · costs https://code.claude.com/docs/en/costs
- Cognition, Don't Build Multi-Agents (2025-06-12): https://cognition.com/blog/dont-build-multi-agents
- Cemri et al., Why Do Multi-Agent LLM Systems Fail? (MAST, 2025): https://arxiv.org/html/2503.13657v3
- CVE-2025-66032: https://github.com/advisories/GHSA-xq4m-mc3c-vvg3 · deny rules y 50 subcomandos: https://adversa.ai/blog/critical-claude-code-vulnerability-deny-rules-silently-bypassed-because-security-checks-cost-too-many-tokens/
- "I bypassed my own Claude Code deny-list in eight ways" (2026-09-11): https://dev.to/glitchbound/i-bypassed-my-own-claude-code-deny-list-in-eight-ways-only-an-allow-list-held-lp8
- "11 Claude Code gotchas" (2026-09): https://dev.to/sendtoshailesh/11-claude-code-gotchas-that-quietly-skip-your-guardrails-5c8p · "5 hook mistakes" (2025): https://dev.to/yurukusa/5-claude-code-hook-mistakes-that-silently-break-your-safety-net-58l3 · hooks en producción: https://www.totalum.app/blog/claude-code-hooks-totalum
- Kent Beck en Pragmatic Engineer (2025-06-11): https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent · Test tampering: https://specstory.com/learning/verification/test-tampering
- Over-mocked tests by coding agents (2026-01-30): https://arxiv.org/abs/2602.00409
- LLM-as-a-judge: self-preference https://arxiv.org/pdf/2410.21819 · survey https://arxiv.org/pdf/2412.05579
- METR RCT (2025-07): https://x.com/METR_Evals/status/1943360399220388093
- Superpowers: HN (2026) https://news.ycombinator.com/item?id=47623101 · "Still worth it in 2026?" https://mcp.directory/blog/superpowers-skill-worth-it-2026
