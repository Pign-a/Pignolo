# ui4 report

## T1 síntomas y normas
- Commit: feat(pignolo-ui): síntomas y normas base
- Tests: symptoms.test.mjs (5), norms.test.mjs (5)
- Rojo: buildMenu preticked=true siempre; sin NFD (acentos); USER_BODY_MAX 9000; sin rechazo de clave desconocida pignolo.*.
- Ruling: palabras genéricas ("animaciones", "el modo oscuro") quitadas del diccionario — evitan falsos matches — costo si mal: el usuario no ve pre-tildado un síntoma.

## T2 config, entorno, run, presentación
- Commit: feat(pignolo-ui): configuración del proyecto, entorno, run y presentación; tag contract/ui-4/v1
- Tests: project-config (5), env-check (6), run-init (4), presentation (2, 24 combinaciones)
- Rojo: poda con stat en vez de isSymbolicLink (cae enlace); sin edad (cae 13 días); presentation ignora consent; devUrl sin isLoopbackUrl; reintento cmd.exe ante cualquier error (cae el caso EACCES agregado).
- Rulings: reasons de presentation = solo el motivo decisivo (p. ej. ['no-consent']) — más simple — costo si mal: ninguno visible.

## T3 option-check, leak-values, report-build, auditor-output
- Commit: feat(pignolo-ui): verificación de opciones, fuga, informe, veredicto y salida del auditor
- Tests: option-check (5), leak-values (3), report-build (7), auditor-output (4)
- Rojo: verdict ignora build.ok; skeleton sin ui-check; sin gitBefore; sin unexpected-file; bloquea sin exigir fail; sha de captura no comparado; sin dedupe de valores; sin MIN_VALUE_LENGTH.
- Ruling: reportSkeleton procesa browser.json antes y salta entradas de ui-check.json con mismo id+huella (ui-check con --measures las duplica) — evita afirmaciones dobles — costo si mal: candidatos repetidos.
- Ruling: validateFindings busca la huella en ui-check.json y browser.json juntos (kind no restringe el archivo) y agrega problema bad-scope/bad-shape — costo: ninguno.

## T4 compare
- Commit: feat(pignolo-ui): huella y diferencia de opciones (compare)
- Tests: fingerprint (5), compare-cli (11; 5 con navegador, incl. medición A-18 = 0 de 6 diferencias falsas y limpieza)
- Rojo: umbral <= 0.3; ΔH no circular; compare exit 1 con diferencias; primary siempre "top"; cleanup que no informa profileRemoved (cae el caso del navegador). El rojo "no cerrar el navegador" lo intenté literalmente: deja msedge huérfano y el test cuelga (maté los procesos a mano); lo sustituí por la variante que cierra pero no informa.
- Rulings: watchSignals ya estaba exportado; extraje createOpener en browser.mjs (sin cambio de comportamiento; browser-cli/cleanup siguen verdes). — evita duplicar — costo: toca browser.mjs.
- Ruling: `regenerate` = letra mayor de la pareja coincidente (también en mockup), null en --second-round — simple y determinista — costo: puede regenerar la que no es la peor.
- Ruling: compare usa preflight (5 s) antes de abrir la página; página caída = unverified rápido (el navegador igual se abre y cierra).
- Doubt: quedaron 11 carpetas %TEMP%\pignolo-ui-browser-* de la corrida colgada del rojo; el guard impide borrar con comodín; sin procesos vivos.

## R10: lienzo fuera de v1 (decisión del autor 2026-10-01)
- T5 (lib/canvas.mjs, scripts/to-canvas.mjs, golden) y T5b (D-4-2, lienzo de prueba) NO se construyen. Nada de canvas se había hecho (lo único: un refactor htmlProblems que no llegó a escribirse).
- Commit: refactor(pignolo-ui): lienzo Design fuera de v1 (R10), presentación siempre local
- Ruling: decidePresentation devuelve siempre local con reasons ['canvas-not-in-v1'] salvo `canvasAvailable: true` (la lógica de las 24 combinaciones queda, probada con ese flag) — deja el camino a v1.x sin publicar nada — costo si mal: código muerto en v1.
- Ruling: se mantiene la clave canvasConsent de project.json y el subcomando `run.mjs present` (devuelve local). Las skills dicen que el lienzo no está disponible en v1 y usan compare.html; no piden consentimiento ni invocan Artifact; no hay detección del tipo "Design". Cambios de spec 1 y 8 (dos llamadas a Artifact, nombres con ancho) NO se aplican al spec: pasan a v1.x.
- Rojo: canvasAvailable por defecto true → cae el caso v1.

## T6 compare.html y run.mjs
- Commit: feat(pignolo-ui): run.mjs (entorno, configuración, chequeo, veredicto) y compare.html
- Tests: compare-html (4), run-cli (16): env, init, config, present (v1 local), norms, check (2 anchos + exit 1 propagado, exit 2), leak-values round-trip, options-check (script, bueno, img sin alt → A11Y-26), discard, auditor-check, menu, report-*, verdict, compare-html, usos erróneos.
- Rojo: un solo --dom; options-check sin runCheck; auditor-check sin validateFindings; verdict con exit siempre 0; discard sin las dos guardas (projectOfRun + isInsideRunRoot, redundantes: cada una sola no hace caer el test); compare-html con pantallas ordenadas alfabéticamente.
- Sin to-canvas ni sus tests (R10). El rojo "present ignora --presentation local" ya no aplica (present siempre local).
- Ruling: compare.html usa en src el id tal como está en la carpeta (`option-A/…`), no minúscula como decía el test del plan — en Linux las carpetas distinguen mayúsculas — costo si mal: ninguno.
- Ruling: verdict calcula exitCode de ui-check desde las entradas (ui-check.json no guarda exitCode): blockingNew > 0 → 1.

## T7 prueba transversal, docs, 0.5.0
- Commit: docs(pignolo-ui): hito 4a, versión 0.5.0 (tag local ui4a-end)
- Tests: hito-4a-acceptance (4: recorrido completo con 5 variantes de "terminado honesto", R-13 stale vs after/, compare+discard, navegador con --before). Suite completa: npm run test:ui y npm test verdes (2361 pass, 0 fail, 2 skip); sin navegador los 6 casos salen skip visible.
- Rojo: verdict ignora report-check; report-skeleton apunta al run padre; implements con sha falso.
- Rulings: run.mjs resuelve --files/--design contra el proyecto, no el cwd (bug hallado por la prueba) — las skills pasan rutas del repo — costo si mal: rutas relativas al cwd fallan.
- Rulings: tests de limpieza comparan el perfil informado en cleanup.profile (no el directorio de %TEMP%, que da falsos positivos con tests en paralelo).
- Rulings: spec §5.11 agregada; cambios de spec §13/§13.1 (lienzo, nombres con ancho) NO aplicados (R10). STATE.md: una línea nueva (append) para no chocar con otras ramas.
- NO HECHO (reservado al autor/sin subagentes): T7 paso 5 (D-4-4 parte 1: pedir app y URL al autor, correr compare approved en una app real) y la revisión final opus de 4a con pasada de arreglos.

## T8 cartas
- Commit: feat(pignolo-ui): cartas de ui-option y ui-auditor
- Tests: agents.test.mjs (6): frontmatter exacto, tools, contrato de ui-option, fases y claves del auditor, ejemplo JSON del auditor pasa validateFindings, linter verde.
- Rojo: tools con Read; id COLOR-13; sin omitClaudeMd; ejemplo JSON con severity inválida; auditor con Bash.
- Sin dudas.

## T9 skill audit + prepare-run
- Commit: feat(pignolo-ui): skill audit y preparación del run; tag contract/ui-4/v2
- Tests: skill-audit.test.mjs (4); tests/support/skill-checks.mjs (helpers).
- Rojo: auditor-check renombrado; `${CLAUDE_PLUGIN_ROOT}` en reference; despacho sin prefijo; subcomando inexistente.
- Ruling: `reference/` agregado a TOP_LEVEL/RUNTIME_DIRS del linter (tests/support/lint-plugin.mjs) — el plan pone los textos de apoyo ahí y el linter lo rechazaba — costo si mal: ninguno (el linter sigue verde).
- Ruling: la skill audit usa `$ARGUMENTS` y define `<repo>` en Values (el plan solo pedía `<root>` y `<data>`).

## T10 skill improve + options.md + apply.md
- Commit: feat(pignolo-ui): skill improve, opciones y aplicar sin romper
- Tests: skill-improve.test.mjs (4). El chequeo de referencedFiles de present-and-choose.md sale diagnóstico/skip hasta T11.
- Rojo: variable `${user_config…}` en options.md; sin la frase "B y C son muy parecidas"; --run sin /after en la confirmación; texto del lienzo; "git commit" en apply.md. (Quitar "unexpected" de apply.md no hace caer: la palabra sigue antes de restore en el paso 6; el test fija que se nombre antes.)
- Ruling: la skill improve dice "the canvas Design is not available in v1" y no menciona Artifact (R10); `<presentation>` sigue en Values por compatibilidad futura.
- Ruling: improve escribe `<run>/map.json` ({pantalla: URL|ruta}) para `compare.mjs approved`: el plan no decía de dónde sale el --map.

## T11 skill new + present-and-choose.md
- Commit: feat(pignolo-ui): skill new y presentación
- Tests: skill-new.test.mjs (5): new, present-and-choose, contrato transversal de las 3 skills y los 3 reference, referencias existentes (ya incluye present-and-choose.md).
- Rojo: quitar "literal quote"; `${user_config…}` en reference; `--flow dir` (orden/literal); `check` sin <run>/after tras apply.md; "terminado" sin verdict; despacho del auditor sin prefijo.
- Ruling (R10): present-and-choose.md sin dos llamadas a Artifact, sin consentimiento, sin to-canvas ni detección del tipo "Design": `run.mjs present` → local (canvas-not-in-v1) → compare-html → elección en el turno → leak-check → approve save/record. Las skills dicen "not available in v1" y no mencionan Artifact (test lo exige). Se omitieron los tests de `canvasConsent`/`type_url`/`manifest.json` del plan.
- Ruling: la verificación de `new` en after/ copia run.json y norms.md a `<run>/after/` para que el auditor los encuentre.

## T12 casos de eval
- Commit: test(pignolo-ui): casos de eval de ui-auditor y ui-option
- Archivos: tests/evals/ui-cases.mjs (generador), tests/eval-ui-cases.test.mjs (6 tests), .gitignore (plugins/pignolo-ui/tests/evals/generated/).
- Tests: 8+3+3 casos generados; los 8 fixtures corridos con Git Bash por ruta absoluta (defecto sembrado dispara su regla: COLOR-03, STATE-04, LAYOUT-11, A11Y-16 por script; J-01 solo juicio con 2 acciones primarias; 3 limpias sin fail de piso); graders de recall aceptan/rechazan sobre traces con forma real (reusa tests/evals/traces.js del núcleo, solo lectura); falso positivo; informe de la sesión principal no cuenta; token trampa en fixtures y en ningún archivo de agents/skills/reference/catalog.
- Rojo: regex del recall con otro id; falso positivo sin "alto"; página STATE-04 sin el defecto (cae el fixture); fixture de ui-option sin el token trampa. Rojo de `bash` a secas desde PowerShell: demostrado una vez (WSL, "/bin/bash: …fixture.sh: No such file", exit 127), no queda como test.
- Hallazgo del propio fixture: las páginas limpias con marcadores ‹…› disparan CONTENT-01 (piso) — usé texto de ejemplo sin marcadores.
- Rulings: el grader "diversidad con compare.mjs options" del plan no es un grader regex del runner; la diversidad ya se prueba determinista (compare-cli); ablación = 3 casos (el runner hace con/sin plugin con --ablation).
- NO HECHO (de pago): corrida D-4-1 (`claude plugin eval`, tope 22 USD) y RESULTS.md.

## T13 checklist, docs, 0.6.0
- Commit: docs(pignolo-ui): hito 4b, versión 0.6.0 (tag local ui4b-end)
- Tests: hito-4b-acceptance (5). Suite completa `npm test`: 2400 pass, 1 fail, 2 skip; el fallo es tests/agent-allowlist.test.js:174 (núcleo, "el gate terminó antes del plazo", timing bajo carga), pasa solo en re-corrida: flaky ajeno. Sin procesos de navegador vivos.
- Rojo: default de optionsPerDecision cambiado; CHANGELOG sin entrada 0.6.0; `${…}` en reference/apply.md; subcomando inexistente en una skill.
- Rulings: spec §16.3 reescrita (evals en Windows con Git Bash); checklist en plugins/pignolo-ui/tests/manual/hito-4.md sin filas de lienzo (R10); README con comandos, userConfig, qué se publica (nada en v1) y aviso A-08 con enlaces fechados 2026-10-01.
- NO HECHO (reservado o sin subagentes): T11b (D-4-4: pedir app y URL al autor), T7 paso 5, revisiones finales opus de 4a y 4b con pasada de arreglos, corrida paga D-4-1 (`claude plugin eval`), T5/T5b (R10).
