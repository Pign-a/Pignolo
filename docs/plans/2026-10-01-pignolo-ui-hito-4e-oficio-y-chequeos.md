# pignolo-ui — Hito 4e: oficio y chequeos. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, sin revisión por tarea, una revisión final opus por hito con una pasada de arreglos (CLAUDE.md). Las tarjetas dan archivos, interfaces con nombres y formas exactas y casos de test literales; el código lo escribe el ejecutor. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Origen:** decisión del autor del 2026-10-01 a partir de dos investigaciones: `docs/research/2026-10-01-skills-de-diseno.md` (impeccable, skills de Emil Kowalski y una skill de diseño Apple; sus secciones B, C, D, E y F son la especificación de las tareas T1 a T9) y la segunda pasada sobre impeccable, `docs/research/2026-10-01-impeccable-a-fondo.md` (sus secciones 2, 3, 4 y 6 son la especificación de las tareas T1b y T10 a T14). Lo que el autor decidió está marcado **DECIDIDA 2026-10-01**. La segunda pasada se reparte así: el contexto de producto, el brief guardado y el pase de veredicto van al hito 4f (`docs/plans/2026-10-01-pignolo-ui-hito-4f-contexto-de-producto.md`) y las opciones de un elemento al hito 4g (`docs/plans/2026-10-01-pignolo-ui-hito-4g-opciones-de-un-elemento.md`); lo demás es de este plan.

**Objetivo:** que pignolo-ui (a) mida lo que hoy solo pide en prosa (objetivos táctiles, escala y renglón de la letra con umbral según el registro, saltos de títulos, movimiento, campos de 16 px, controles que faltan en el celular), (b) frene la sobre-severidad del auditor con criterios `J-nn` que dicen cuándo aplican, un tope de hallazgos de juicio y una línea `keep`, (c) pruebe la pantalla con datos feos (prueba de estrés: texto largo, listas vacías, zoom al 200 %) y no audite capturas inválidas, y (d) entienda más palabras de `improve`. Sin dependencias nuevas, sin copiar texto ni código de terceros.

**Stack:** Node ≥ 22 sin dependencias npm, ESM `.mjs`, `node:test` + `node:assert/strict`. **Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md` §4.3, §5.1, §5.3, §5.4, §5.7, §7, §8, §10, §18 (no se edita acá: ver "Cambios de spec").

**Prerrequisitos (Task 0, sin código):**
- `main` con `ui/auditor-juicio` unida (pignolo-ui 0.6.3: un `J-nn` sin medida fallida vale a lo sumo `medio`; validador `judgment-without-measure`; spec §10 con una línea): **ya está** (merge `17371c1`). `main` está en 0.7.2 y el controlador está uniendo la **0.7.3** (carta candidata de `ui-option` y datos de muestra rotulados); este plan sale de `main` con esa 0.7.3 ya unida. Este plan se apoya en eso y **no lo repite**.
- `git grep -n "TARGET-01\|TYPE-0\|FORM-01\|A11Y-41\|MOTION-0[5689]\|RESP-01\|STRESS-0"` no encuentra esos ids en el spec ni en `catalog/` (ids provisorios de las investigaciones; A11Y-40 ya está reservado en spec §18 para la prueba con lector de pantalla, por eso el salto de títulos es **A11Y-41**).
- Nombres que el plan consume, comprobados el 2026-10-01 sobre `main` 51c0024 (T0 los vuelve a comprobar sobre el `main` vigente, 0.7.2 o más): `lib/browser-checks.mjs` (`runChecks(page)`, `inPage`, `textNodes`, `isDisabled`, `reflowFindings`), `lib/browser-run.mjs` (`BROWSER_RULES`, `measurePage`, `toEntries`, `capturePage`, `checkPng` de `lib/png.mjs`), `lib/shot-plan.mjs` (anchos 1440, 375, 768, 320), `lib/ui-check.mjs` (paso 3 `intentional`, `measures` se agregan "como vienen"), `scripts/run.mjs` (`check` arma `--measures <run>/browser.json`; `auditor-check` y la lista `['ui-check.json', 'browser.json']`), `lib/auditor-output.mjs` (`validateFindings`, `readEntries`), `lib/rules/api.mjs` (`fail`, `pass`, `unverified`), `lib/css-walk.mjs` (`decls[i] { selector, atRules, property, value, line }`, `keyframes`), `lib/symptoms.mjs` (`checkSymptoms`, `mergeUserSymptoms`, `buildMenu`, `matchWords`), `lib/norms.mjs` (`judgmentIds` con `^- (J-\d{2}):`), `lib/design-doc.mjs` (el esquema ya trae `pignolo.register`, `pignolo.motion.durationMs`, `pignolo.motion.easing` y `pignolo.targets { minPx, recommendedPx }`), `tests/rules-fixtures.test.mjs` (carpetas `pass-*`, `fail-*`, `unverified-*` con `expect.json`), `tests/evals/ui-cases.mjs` (`head()` y las páginas `clean1..3`, hoy sin exportar). La sesión CDP que ya usa `measurePage` para fijar el ancho de cada medida (`lib/browser-session.mjs`, `lib/cdp-pipe.mjs`) es la que T14 usa para el zoom; T0 anota el nombre exacto de la llamada.
- Las dos investigaciones están en el repo como `docs/research/2026-10-01-skills-de-diseno.md` y `docs/research/2026-10-01-impeccable-a-fondo.md`, **sin rutas locales** (hecho al escribir este plan). Las citas de la skill Apple sin licencia **ya fueron reemplazadas por paráfrasis** (D-4e-2, decidida); T0 solo vuelve a comprobarlo.
- **Orden de ejecución (decidido en `docs/STATE.md`, bloque "orden de ejecución de pignolo-ui"):** la ola 1 de este plan (el auditor: T1 y T1b) va **primero**, mientras el autor hace la puerta manual de la etapa 1 del lienzo; el resto (olas 2 a 5) va **al final**, después de la etapa 4 del lienzo y del hito 4g. Por eso las versiones de abajo son las que corresponden a ese orden (R-4e-1); si el orden cambia, solo cambian los números.

## Alcance

- **Adentro (DECIDIDA 2026-10-01: el hito chico completo, ≈ 9 tareas, más la segunda pasada, ≈ 6 tareas):** TARGET-01 y FORM-01 en el navegador; TYPE-01 y TYPE-02 medidos, con el umbral de TYPE-02 según el registro; salto de niveles de títulos (A11Y-41); chequeos estáticos de movimiento (MOTION-05, 06, 08, 09); carta del auditor con "cuándo aplica", tope de 3 hallazgos de juicio (impuesto en `auditor-output`) y línea `keep`; síntomas nuevos de `improve` y la oferta del modo explorar; créditos (impeccable Apache-2.0, skills de Emil MIT); versión y CHANGELOG. **Segunda pasada (DECIDIDA 2026-10-01, ítems 4 y 5 y la prueba de estrés):** RESP-01 (controles que faltan en el celular) y el registro por pantalla que llega a `measure` (T10, T11); validez de capturas y "la evidencia del usuario reabre" (T12); la prueba de estrés, STRESS-01 a 04 (T13, T14).
- **Adoptadas y ya unidas por el controlador en pignolo-ui 0.7.3 (DECIDIDA 2026-10-01, tras mirar la tercera medición de `tests/evals/RESULTS-lienzo.md`):** (a) la **carta candidata de `ui-option`** (reglas de oficio 9 a 13 del antiguo apéndice): el autor prefirió mucho más ese brazo, así que **ya no es una tarea condicional** y T8 desaparece de este plan; (b) los **datos de muestra rotulados** en vez de marcadores (D-IM-7, DECIDIDA 2026-10-01: sí): las opciones salen con datos de ejemplo realistas, cada valor de muestra con `data-sample` en su elemento y una línea visible chica por pantalla ("Datos de muestra"; nunca personas, correos, empresas ni credenciales reales; lo que el usuario dio se usa tal cual y no se marca). Este plan **no las construye ni las repite**: las referencia como hechas. Lo que sí toca de la segunda: el auditor no debe informar un valor con `data-sample` como contenido inventado (T1, ver R-4e-23), y T7 comprueba que las páginas de las evals y los fixtures de aceptación siguen sin hallazgos nuevos con ese cambio.
- **Afuera:** movimiento generado en las opciones más allá de transiciones de estado (**DECIDIDA 2026-10-01: el movimiento entra solo como chequeo estático del auditor y de `ui-check`**; sin animaciones de entrada, gestos ni resortes); lista negra de fuentes y fondos crema; notas o calificaciones; personas; los 24 comandos de impeccable; el detector de impeccable como dependencia; texto de la skill Apple sin licencia (se cita la HIG oficial por enlace); el borde lateral de color en tarjetas (la investigación lo proponía como LAYOUT-xx; el autor no lo listó, queda como prosa de Craft 6); movimiento con scripts (JS), `@starting-style` y utilidades de Tailwind (`duration-*`, `ease-in`): no se miden, queda dicho en cada regla. **Hooks: no entran en la v1** (DECIDIDA 2026-10-01; la spec §0 los excluye). **v1.x (DECIDIDA 2026-10-01, no se construyen acá):** COPY-02 (rótulo genérico en un botón) y el eje "solo textos" de `improve`; sugerir el token más cercano ("usar token" / "falta token") en los hallazgos de color y espaciado; reusar la última auditoría si los archivos no cambiaron; pantalla de estado vacío; `run.mjs doctor`; sorteo de direcciones con semilla; extraer tokens de la página renderizada; excepciones `intentional` por archivo con motivo y quién decidió; el ancho real del usuario como ancho extra de medida.

## Global Constraints

- **`DESIGN.md` y `intentional` ganan.** Una regla nueva de gusto (MOTION-05, 06, 08, 09, TYPE-01, TYPE-02, RESP-01, STRESS-04) acepta `intentional`, nunca es `floor`, y calla cuando `DESIGN.md` decide otra cosa (valores declarados en `pignolo.motion.*`, `pignolo.targets` y `pignolo.register`). Ninguna regla nueva prohíbe una fuente, un color de fondo o un estilo. **Excepción decidida el 2026-10-01:** STRESS-01, 02 y 03 (desborde, hueco y zoom) y TARGET-01 y FORM-01 **no** aceptan `intentional` (un texto que se corta o una página que se rompe con zoom no es de gusto); STRESS-04 (ancho fijo) sí.
- **Una regla que un script puede comprobar le gana a la prosa.** Cada límite nuevo del auditor (tope de 3, condición de "cuándo aplica" presente en cada `J-nn`) es un test o un rechazo del validador, no solo texto de la carta.
- **Toda regla nueva tiene fixtures de pasa y de falla** (carpetas `tests/fixtures/rules/<ID>/` para las estáticas; páginas con `BROWSER_SKIP` visible para las de navegador) y su entrada en `catalog/rules.json` con `source` (WCAG con criterio, o enlace a la HIG de Apple, o "pignolo-ui spec", nunca un texto copiado).
- **Presupuesto de falsos positivos (DECIDIDA 2026-10-01: cada chequeo nuevo, sin excepción, incluidos RESP-01 y STRESS-01 a 04):** cada regla nueva muestra **0 hallazgos** sobre los fixtures limpios que ya existen: todas las carpetas `tests/fixtures/rules/*/pass-*`, `tests/fixtures/acceptance/next-shadcn` y las tres páginas `clean1..3` de `tests/evals/ui-cases.mjs`. Lo comprueba un test de aceptación (T7). Si una página limpia dispara una regla, primero se revisa si la regla está mal (excepciones, umbral); solo si la página tiene el defecto de verdad se corrige la página (R-4e-12).
- **Ninguna regla nueva bloquea.** Severidades: `alto`, `medio`, `detalle`; ninguna `floor`. Un test del catálogo lo hace cumplir.
- **Los chequeos de navegador no inundan:** un hallazgo por motivo y página (agregados con cuenta y el peor caso), salvo el `alto` de objetivo menor a 24 px, que es por elemento (R-4e-5).
- **La prueba de estrés no deja rastro:** corre solo sobre una carga de página propia del navegador, cambia el DOM en memoria, nunca escribe un archivo del proyecto ni la salida de `measure`, y termina cerrando esa página (R-4e-17). Un test compara el sha256 del archivo y de `browser.json` antes y después.
- **Una captura inválida es "no verificado", nunca un hallazgo** (R-4e-19).
- **Sin hooks:** el linter del plugin sigue verificándolo; nada de este plan agrega un hook.
- **Palabras propias.** Nada de texto ni de valores de impeccable, de las skills de Emil o de la skill Apple sin licencia; los umbrales numéricos son los de WCAG, de la HIG oficial (por enlace) o decisiones del autor. CREDITS.md lo declara.
- Hereda las restricciones del hito 4 (`docs/plans/2026-09-30-pignolo-ui-hito-4-flujos.md`, Global Constraints): sin red, temporales con `makeTempDir()`, fixtures sintéticos sin datos reales (repo público), nombres e ids en inglés, mensajes al usuario en español, commits en español con `git commit -F <archivo>` y los trailers de la sesión, LF sin BOM, un archivo de test por vez con `node --test --test-reporter=dot <archivo>` y la suite completa una vez por tarea cerrada.

## Método de ejecución

- **Dos ramas, porque el hito se parte en dos momentos del orden de ejecución:** `ui/hito-4e-auditor` (ola 1, desde `main`, sale primero y se une apenas pasa la eval E2) y `ui/hito-4e` (olas 2 a 5, desde el `main` posterior a la etapa 4 del lienzo y al hito 4g). Worktree propio cada una; cada tarea termina con su commit.
- **Olas (un ejecutor en serie):**
  1. **Ola 1, auditor (0.7.4):** T1 → T1b. Después, la eval E2 la corre el controlador (≈ 4,4 USD) y recién ahí se une a `main`: arregla las páginas limpias y no depende de nada de lo demás. Puede correr mientras el autor hace la puerta manual de la etapa 1 del lienzo (solo toca el auditor, sus normas y `improve` en el paso 4).
  2. **Ola 2, navegador:** T2 → T3 → T10 → T11.
  3. **Ola 3, estáticas:** T4 → T5 → T13.
  4. **Ola 4, estrés y capturas (navegador):** T12 → T14.
  5. **Ola 5, flujo y aceptación:** T6 → T7.
  6. **Ola 6, cierre:** T9 (T8 ya no existe: la carta candidata se adoptó y se unió en 0.7.3) → revisión opus de lo que cambió desde `main` (T1 y T1b incluidas, aunque ya estén unidas), una pasada de arreglos, unión, versión 0.12.0.
- **Segundo frente permitido:** el resto del hito (olas 2 a 4) toca archivos que el lienzo no toca (`lib/browser-*.mjs`, `lib/rules/`, `catalog/`); es el único trabajo que se puede abrir en paralelo con las etapas 1 y 2 del lienzo (la investigación lo advierte). Las tareas que escriben texto de las skills (T6 y las líneas de T12) chocan con las tarjetas T9b, T9c y T9d del lienzo: si se abre en paralelo, esas dos van **después** de unir la etapa que toque el mismo archivo. El orden por defecto sigue siendo el serie de `docs/STATE.md`.
- **Modelos:** sonnet para ejecutar; la revisión final en opus. **Auditoría previa de este plan: ninguna tarea la necesita** según CLAUDE.md (no toca guardia, borrados ni respaldos; T14 cambia el DOM de una página en memoria y no escribe archivos del proyecto). La revisión final mira con lupa los puntos de riesgo: falsos positivos (Review Focus 1 y 6) y que un chequeo nuevo no cambie el veredicto "terminado" de los flujos.
- **Tests:** ≈ 140 casos en ≈ 54 bloques `test()` (≈ 46 casos de las tareas originales, contando cada fixture, y ≈ 95 de la segunda pasada; ver "Estimación"), sin red; los de navegador con `BROWSER_SKIP` (skip visible, nunca verde).

## Review Focus (revisión final)

1. **Falsos positivos.** Cada regla nueva sobre los fixtures limpios y sobre una app real si el autor ya nombró una (D-4-4). Dueñas: T2, T3, T5, T7.
2. **El auditor no queda más ruidoso.** El tope de 3 y el "cuándo aplica" no tapan un defecto sembrado (`defect-j-01` sigue encontrado) ni abren una vía para saltar el validador. Dueña: T1.
3. **`DESIGN.md` y `intentional` mandan.** Calla con valores declarados; `intentional` aplica a las entradas del navegador sin tocar un `floor`. Dueñas: T3, T5.
4. **Nada de afirmar lo que no se midió.** Las reglas de navegador dicen en `measure` qué contaron; lo no medible (excepciones de 2.5.8 como "control equivalente", texto en imágenes) queda declarado, no verde. Dueñas: T2, T3.
5. **Licencias.** CREDITS.md (una línea por fuente, palabras propias, cero texto copiado) y que nada copiado entre en el repo. Dueña: T9.
6. **La prueba de estrés no miente ni ensucia.** Que STRESS-01 a 03 solo marquen lo que el estrés causó (no lo que la página ya tenía), que no dejen un archivo cambiado ni un navegador abierto, y que una captura inválida o un navegador ausente sea `unverified` y nunca verde ni hallazgo. Dueñas: T12, T14, T7.
7. **El registro cambia solo el umbral.** TYPE-02 por registro no baja un piso ni deja pasar un `h1` igual al cuerpo en un registro `brand`. Dueña: T3, T11.

## Rulings del plan (técnicos, registrados)

- **R-4e-1: versiones y orden.** `main` está en 0.7.2 y la 0.7.3 (carta candidata y datos de muestra) la une el controlador. La ola 1 sube a **0.7.4** (cambio de contrato del auditor: tope, "cuándo aplica", `keep` y datos de muestra que no son contenido inventado); el cierre sube a **0.12.0** (catálogo 0.4.0: 14 reglas nuevas y un campo nuevo del diccionario de síntomas), porque en el orden de `docs/STATE.md` el hito 4f (0.7.5), las etapas del lienzo (0.8.0, 0.9.0, 0.10.0) y el hito 4g (0.11.0) salen antes. Cada una con su entrada de CHANGELOG (sin eso, `/plugin update` no la toma). Propuesta del agente (ruling técnico): si el autor prefiere otros números, solo cambian los números.
- **R-4e-2: el tope se rechaza, no se recorta.** `validateFindings` suma el problema `judgment-cap` para cada hallazgo `J-nn` a partir del cuarto (por orden en la lista). Cuenta todo `J-nn`, con o sin medida y de cualquier severidad; los hallazgos de regla (`COLOR-03`…) no cuentan. Es coherente con `judgment-without-measure` (se devuelve al auditor, no se arregla en silencio). La carta le pide ordenar por efecto y parar en 3.
- **R-4e-3: lo que sigue siendo prosa.** Que el `why` de un juicio empiece con `Judgment:` cuando no cita una medida, y que cite el número cuando sí, va en la carta pero no se impone con un script (sería otro rechazo que cuesta una corrida de opus). Si las evals muestran deriva, se convierte en `judgment-unlabeled`.
- **R-4e-4: "cuándo aplica" vive en la línea del criterio.** Cada `- J-nn:` de `norms/base.md` termina con `Applies when: <condición>.`; el formato `^- (J-\d{2}):` que usa `judgmentIds` no cambia. Un test exige la frase en los 12. Si la condición no se cumple en la pantalla no hay hallazgo (no va ni a `notVerified`).
- **R-4e-5: TARGET-01.** Umbrales de la decisión D-UX-7: menor a 24 px → `alto` (WCAG 2.5.8 AA); menor a 44 px en ancho de celular (`≤ 480`) → `medio`. **No es `bloquea`** (el spec §5.4 decía que 2.5.8 bloqueaba bajo NAV-01): las excepciones de 2.5.8 solo se miden en parte, así que bloquear descansaría en una medida incompleta. Medidas que sí se aplican: se eximen los enlaces en línea dentro de texto, los deshabilitados y el control cuyo círculo de 24 px (centrado en su caja) no cruza a otro objetivo (excepción de espaciado, estricta: rozar no es cruzar); un checkbox o radio con `label` se mide con la caja unida del control y su etiqueta. No se miden "control equivalente" ni "esencial": límite declarado en el criterio. **Agregado:** el `alto` es un hallazgo por elemento; el `medio` de 44 px es **uno por ancho y tema** (`key: 'phone-targets'`, con cuenta, el menor y hasta 5 selectores), para que 40 enlaces de navegación no sean 40 hallazgos. `DESIGN.md` manda: `pignolo.targets.minPx` sube el mínimo (piso 24, nunca baja) y `recommendedPx` reemplaza los 44.
- **R-4e-6: FORM-01.** `input` (salvo `checkbox`, `radio`, `range`, `color`, `file`, `hidden` y los de botón), `select` y `textarea` visibles y habilitados con letra calculada menor a 16 px en ancho de celular → `medio`, por campo. Solo aplica con ancho ≤ 480: en otros anchos no hay entrada (no aplica, no es "pasó"). No acepta `intentional` (el zoom de iOS es funcional, no de gusto).
- **R-4e-7: TYPE-01 y TYPE-02, definiciones medibles.** Cuerpo = tamaño de letra más frecuente (por caracteres) entre los `p` y `li` visibles. Título = el primer `h1` visible. **TYPE-02:** razón título/cuerpo menor al umbral del registro (R-4e-15: `brand` 1,25; `product` o registro sin declarar 1,125) → `medio` (`measure { ratio, titlePx, bodyPx, register, threshold }`); sin `h1` o sin cuerpo → `unverified` con motivo. **TYPE-01**, tres motivos, una entrada por motivo y página: `line-length` (caracteres por renglón, = longitud del texto / cantidad de renglones, mayor a 80, en `p`, `li` y `blockquote` de más de 80 caracteres), `leading` (interlineado menor a 1,3 en `p` y `li` de 2 renglones o más; `normal` cuenta como 1,2) y `tiny-text` (texto visible menor a 12 px). Ambas aceptan `intentional` (son de gusto o de registro).
- **R-4e-8: `intentional` también para el navegador.** Hoy `runCheck` agrega las entradas de `browser.json` "como vienen". Se aplica el mismo paso 3 (reglas con `acceptsIntentional` y sin `floor`, con la lista ya validada) a esas entradas. Es el único cambio de `ui-check.mjs`; es la tarea cortable T3-b.
- **R-4e-9: reglas de movimiento estáticas (CSS y `<style>`).** Sobre `ctx.css.decls`. Se ignoran los valores con `var()` o `calc()`. **MOTION-05** (`medio`): duración de `transition`/`transition-duration` fuera del conjunto de `pignolo.motion.durationMs` cuando `DESIGN.md` lo declara; sin ese bloque, solo la duración mayor a 500 ms en un selector de control (`button`, `a`, `input`, `select`, `textarea`, `summary`, `[role=…]`, clases `btn*`, o con `:hover`, `:focus`, `:active`). **MOTION-06** (`detalle`): `ease-in` a secas en un selector de control, o `cubic-bezier(a,b,c,d)` con `b` o `d` fuera de 0 a 1 (rebote); **calla si `DESIGN.md` declara `pignolo.motion.easing`**. **MOTION-08** (`medio`): `transition`/`transition-property` o pasos de `@keyframes` sobre `width`, `height`, `top`, `left`, `right`, `bottom`, `margin*`, `padding*` (`all` sigue siendo MOTION-04). **MOTION-09** (`detalle`): `transform`, `scale`, `translate` o `rotate` en una regla con `:hover` fuera de `@media (hover: hover)` o `(any-hover: hover)`. Las utilidades de Tailwind no se miden (v4 ya envuelve `hover:`); el criterio del catálogo lo dice.
- **R-4e-10: A11Y-41 solo sobre HTML renderizado o escrito.** El runner ya llama `checkFile` solo en documentos (`ctx.isDocument`). Un salto es un encabezado cuyo nivel es mayor al del anterior más 1 (`h1` → `h3`, y también `h2` → `h4` tras un `h3`); bajar de nivel no es salto; empezar en `h2` sin `h1` no es de esta regla. Se ignoran los de `aria-hidden`. Un archivo JSX con encabezados literales sale `unverified` ("los niveles se componen al renderizar; mirar el DOM"), nunca verde. `medio`, acepta `intentional`: **no** (1.3.1 es de estructura, no de gusto).
- **R-4e-11: síntomas.** 13 síntomas nuevos (tabla en T6; los 11 de la investigación más `breaks-on-real-data` y `missing-on-phone`). Los de gusto sin regla llevan `rules: []` y un campo nuevo `offer: "explore"` (solo ese valor). **"Sosa / aburrida / le falta onda" ofrece el modo explorar y no genera versiones dentro del sistema de diseño** (**DECIDIDA 2026-10-01**). **El modo explorar es el de la etapa 4 del plan del lienzo** (`docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md`: R-20, T7c y T9d; la pregunta única de `improve` con "no" por defecto, exploraciones ciegas rotuladas "fuera del sistema", elegir una exige un parche aprobado de `DESIGN.md`): **DECIDIDA 2026-10-01** (D-4e-1). Este plan no define otro; T6 solo conecta el síntoma con esa pregunta y **requiere la etapa 4 unida**.
- **R-4e-12: páginas limpias de las evals.** Las tres páginas `clean1..3` son "limpias" para el piso, no para los chequeos nuevos: sus `input` miden ≈ 42 px de alto (menos de 44 en celular) y los enlaces de `clean3` son cajas en línea de ≈ 18 px de alto. Eso es un defecto real según TARGET-01, y el auditor lo citaría (toda entrada `fail` es un hallazgo) y rompería el grader `no-false-positive-judgment`. **No se relaja el grader ni la regla:** se corrige el CSS de `head()` en `ui-cases.mjs` (alto mínimo de 44 px en `input` y `button`, enlaces de lista como bloque con relleno). Cambia el SHA de las páginas; queda en RESULTS. Ver D-4e-3 por el costo de repetir las evals.
- **R-4e-13: citas de Apple.** `source` de TARGET-01 enlaza a la HIG oficial (https://developer.apple.com/design/human-interface-guidelines/) para los 44 pt, sin texto copiado; nada de la skill sin licencia entra al repo.
- **R-4e-14: ids.** Nuevos: TARGET-01, FORM-01, TYPE-01, TYPE-02, RESP-01 (clase `browser`, checker `browser`, los mide `browser.mjs measure`), STRESS-01, STRESS-02, STRESS-03 (clase `browser`, checker `browser`, los mide `browser.mjs stress`), A11Y-41, MOTION-05, MOTION-06, MOTION-08, MOTION-09, STRESS-04 (clase `script`, checker `ui-check`). `catalogVersion` 0.3.0 → 0.4.0. Las reglas estáticas ganan fixtures `tests/fixtures/rules/<ID>/…`; `rules-fixtures.test.mjs` las recorre solo.
- **R-4e-15: registro por pantalla y umbral de TYPE-02 (DECIDIDA 2026-10-01, ítem 5).** Hay dos registros, los que ya declara `DESIGN.md` (`pignolo.register`): `brand` = aireado, `product` = denso (pantallas de trabajo, tableros). Constantes: `MIN_TITLE_BODY_RATIO = { brand: 1.25, product: 1.125 }`; **registro sin declarar → 1,125** (el más permisivo: sin saber el registro, la regla no sube el ruido). El registro efectivo de una medida es, en este orden: `--register` de `browser.mjs measure` (lo que declara el brief del flujo, hito 4f), si no `pignolo.register` de `--design`, si no `unset`. `DESIGN.md` sigue siendo el valor por defecto; el brief solo lo cambia para esa pantalla. `measure.register` dice cuál se usó. El umbral de 1,125 sale de la investigación (§2 punto 4: en pantallas de trabajo lo normal es 1,125 a 1,2) y es una decisión del autor ya tomada; no se inventan otros números.
- **R-4e-16: RESP-01, "algo que se puede usar en escritorio falta en el celular" (ítem 5).** Compara los elementos interactivos visibles del ancho más grande medido (≥ 1024) con los del más chico (≤ 480); si el plan no tiene los dos anchos → `unverified` ("hace falta un ancho de escritorio y uno de celular"). Identidad de un elemento: etiqueta o rol + nombre accesible normalizado (minúsculas, sin espacios dobles) + `href` sin el origen; no se miden `aria-hidden`, deshabilitados ni los que no tienen nombre. **Falta** = existe en el ancho grande, no está visible en el chico **y** no hay en el chico un control visible que lo abra: `button`, `summary` o `[role=button]` con `aria-expanded` o `aria-controls` cuyo destino contenga el elemento, o un `details` cerrado que lo contenga. Un elemento que sigue en el DOM y se abre con ese control **no es falta** (el menú colapsado, el riesgo que la investigación nombra). `medio`, **un hallazgo por página** (`key: 'missing-on-phone'`, `measure { count, names (hasta 5), widths }`), acepta `intentional` (una función de escritorio a propósito). `source`: "pignolo-ui (decisión del autor 2026-10-01); WCAG 2.2 SC 1.4.10 (orientación)". No mide qué hace el control al abrirse (límite declarado).
- **R-4e-17: la prueba de estrés es un subcomando propio, `browser.mjs stress` (ítem 2, DECIDIDA 2026-10-01).** No corre dentro de `measure`: así el DOM alterado nunca contamina `browser.json`. Abre la página (misma regla de `--url` solo local), y para cada escenario carga la página de nuevo antes de alterar nada, altera el DOM **en memoria** (nunca escribe un archivo del proyecto), mide y cierra. Escribe `<run>/stress.json` con la forma de `browser.json` (`{ version, browser, url, finalUrl, degraded, cleanup, plan, entries }`; las entradas usan `toEntries` y la misma huella `ID|ruta|ancho|tema|clave`). Sin navegador o con la URL caída: todas las entradas `unverified` con el motivo, exit 0 (nunca verde). `run.mjs check` suma `stress.json` a lo que ya agrega de `browser.json` y `auditor-check` lo cuenta como evidencia (`kind: browser`). Escenarios, en este orden, solo en tema claro y a los anchos 1440 y 375 (el zoom, solo a 1440):
  1. `long-text`: cada elemento hoja visible de texto (sin hijos que sean elementos) de `h1` a `h6`, `button`, `a`, `[role=button]`, `label`, `th`, `td` y `li` pasa a repetir su texto tres veces separado por espacio, con tope de 120 caracteres por elemento (`LONG_FACTOR = 3`, `MAX_STRESS_CHARS = 120`); el +35 % de un idioma más largo queda cubierto por el ×3.
  2. `empty-lists`: se quitan del DOM los hijos de cada `ul`, `ol`, `tbody`, `[role=list]` y `[role=rowgroup]` que tenía al menos 2 hijos.
  3. `zoom-200`: solo a 1440, `Emulation.setDeviceMetricsOverride` con la mitad del ancho (720 px CSS; es lo que hace un zoom del 200 % del navegador) y la mitad del alto. `STRESS_ZOOM = 2`.
  Límite declarado: el estrés no ejecuta el estado vacío real de la app (una app con React no vuelve a dibujar porque se quitaron nodos); mide el hueco que dejarían los datos al faltar y el desborde del texto al crecer.
- **R-4e-18: STRESS-01 a 04 (DECIDIDA 2026-10-01: severidad `alto`, fuera del piso, sin `intentional` para el desborde, con `intentional` para el ancho fijo).** Todas `alto`, ninguna `floor`, ninguna bloquea.
  - **STRESS-01, texto largo que desborda o tapa:** tras `long-text`, un elemento **que no desbordaba antes** (se mide en la misma carga, antes de alterar) y ahora tiene `scrollWidth > clientWidth + 1` con `overflow` distinto de `visible` y sin `text-overflow: ellipsis` más `white-space: nowrap` (texto cortado sin aviso), o su caja visible ahora cruza la de otro objetivo interactivo que antes no cruzaba (tapa), o la página gana desplazamiento horizontal que no tenía. Agregado: **un hallazgo por motivo (`clipped`, `covers`, `page-scroll`) y ancho**, con `measure { count, selectors (hasta 5) }`. Lo que ya desbordaba antes del estrés no se informa acá (es de LAYOUT-11).
  - **STRESS-02, lista vacía con hueco sin mensaje:** tras `empty-lists`, el contenedor sigue midiendo 96 px de alto o más (`HOLE_MIN_PX = 96`) y no tiene texto visible adentro. Un contenedor que se colapsa (alto menor a 96) no es hueco; el texto de un mensaje propio dentro del contenedor lo exime. Agregado: un hallazgo por página y ancho.
  - **STRESS-03, se rompe con zoom al 200 %:** a 720 px CSS (zoom 200 % desde 1440), la página tiene desplazamiento horizontal (`scrollWidth > clientWidth + 1`) que no tenía a 1440, o los elementos `position: fixed` o `sticky` suman más del 40 % del alto de la ventana (`FIXED_MAX_RATIO = 0.4`; `covered`), o aparece un `clipped` como el de STRESS-01. Un hallazgo por motivo.
  - **STRESS-04, ancho fijo en px sobre un control (estático):** `ctx.css.decls` con `width` en px (no `var()` ni `calc()`) mayor a 48 px (`FIXED_WIDTH_MIN_PX = 48`) en un selector de control (la definición de R-4e-9) cuya regla no fija también un `height` igual (un botón cuadrado es un botón de ícono), ni `aspect-ratio`, ni `min-width` o `max-width`. `acceptsIntentional: true`. Las utilidades de Tailwind (`w-[120px]`) no se miden: queda dicho en el criterio.
  `source` de las cuatro: "pignolo-ui (decisión del autor 2026-10-01); WCAG 2.2 SC 1.4.4 y 1.4.10". Riesgo de falsos positivos nombrado: STRESS-02 en apps que dibujan la lista con un mensaje condicional y mantienen un alto mínimo (el hueco existe de verdad cuando falta el mensaje); D-4e-4 lo mide en una app real.
- **R-4e-19: validez de capturas (ítem 4, DECIDIDA 2026-10-01).** Una captura solo es evidencia si es válida. `lib/captures-check.mjs` decide, **por captura**, con `checkPng` ya existente más tres pruebas nuevas: (a) **ancho**: el ancho de la imagen es el ancho pedido por `deviceScaleFactor` (hoy 1, así que igual al ancho del plan); (b) **imagen casi lisa**: se descomprime el PNG con `node:zlib` y se cuentan los valores de píxel distintos en una muestra de 1 píxel de cada 16 en ambos ejes; **un solo valor, o ≥ 99,5 % de la muestra en un valor, es inválida** (`MIN_DISTINCT = 2`, `MAX_DOMINANT = 0.995`); (c) **la página no terminó de cargar o animaba**: `captures.json` guarda por captura `settled { readyState, animations }` leído justo antes de capturar (`document.readyState === 'complete'` y `document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === 1).length === 0` tras un reposo corto); si no, inválida. Una captura inválida **no se borra**: se marca `valid: false` con `reason` y entra a `unverified` como `{ width, theme, reason: 'capture invalid: …' }`; nunca produce un hallazgo ni un "pasó". El auditor no puede citarla (`auditor-output` rechaza evidencia `capture` de una captura con `valid: false`, problema `evidence-invalid-capture`). La línea de captura inválida sale en el informe como "no verificado". Una sola vuelta de recaptura automática antes de marcarla (el reposo largo, 1 s); si sigue inválida, se queda marcada.
- **R-4e-20: línea `keep` (ítem 4, DECIDIDA 2026-10-01).** Campo opcional `keep` del `json` del auditor: **una** línea de texto (≤ 160 caracteres, sin saltos) con una cosa que funciona y no hay que perder. `validateFindings` suma `bad-keep` si no es texto, si pasa de 160 o si trae saltos de línea. No cuenta para el tope de 3 (no es hallazgo), no admite evidencia ni severidad, y no tiene nota. `run.mjs auditor-check` la imprime (`keep`) y `improve` la pega en el brief de las versiones (paso 4), para que ninguna versión diluya lo que funciona. Nunca la usa un script para decidir nada.
- **R-4e-21: "la evidencia del usuario reabre" (ítem 4, DECIDIDA 2026-10-01).** Una línea en las tres skills: si después de dado por terminado el usuario muestra una captura o un dato que lo contradice, no se arregla a mano ni se autoaprueba: se corre una **auditoría nueva** (`/pignolo-ui:audit`) con esa captura como evidencia del usuario (se guarda en `<run>/user-evidence/`, nunca en el repo) y el informe anterior queda como estaba. Es prosa con test de texto; no hay script nuevo.
- **R-4e-22: créditos (DECIDIDA 2026-10-01).** Una línea por fuente en `CREDITS.md`, con palabras propias y **cero texto copiado**: impeccable (Apache-2.0), skills de Emil Kowalski (MIT), la HIG de Apple (solo enlace) y WCAG. El detalle de las ideas que se tomaron de cada una va en la línea, no en párrafos. Si la 0.7.3 ya sumó alguna de esas líneas (la carta candidata se apoya en las mismas fuentes), T9 conserva la que existe y solo agrega la que falte; el test de créditos lo comprueba por presencia.
- **R-4e-23: los datos de muestra no son contenido inventado (D-IM-7, DECIDIDA 2026-10-01; construidos en 0.7.3).** El auditor no informa como contenido inventado un valor que lleva `data-sample` (es muestra rotulada; CONTENT-01 la frena recién al llevar la pantalla a código real, y eso no cambia). Sí informa como hallazgo lo que **no** lleva `data-sample` y es un hecho inventado (precios, clientes, cifras, testimonios, personas). La carta lo dice en una línea (T1) y un test de texto lo fija; no hay script nuevo. **Lo que cambia para este plan y no hay que romper:** `options-check`, el chequeo de fuga y la versión aprobada ya aceptan `data-sample` (T0 anota cómo); el conversor del lienzo lo conserva; STRESS-01 a 04 y RESP-01 miden la **app real**, nunca las opciones, así que no ven muestras.

## Decisiones del autor

Decididas el 2026-10-01 (vigentes): ver el listado en "Alcance" y los rulings marcados DECIDIDA. Resumen: hito chico completo; TARGET-01 con 24 px `alto` y 44 px celular `medio`; TYPE-01/02 (umbral según el registro), saltos de títulos y FORM-01; movimiento solo como chequeo estático; síntomas nuevos; auditor con "cuándo aplica", `medio` por defecto, tope de 3 por pantalla impuesto en `auditor-output` y línea `keep`; reglas de gusto solo `detalle` o `medio`, con `intentional` y calladas si `DESIGN.md` decide (sin listas negras de fuentes); "sosa" ofrece el modo explorar; nada copiado de la skill Apple sin licencia; créditos de impeccable (Apache-2.0) y de Emil Kowalski (MIT). **Segunda pasada (2026-10-01):** RESP-01 y registro por pantalla; validez de capturas, `keep` y "la evidencia del usuario reabre"; prueba de estrés STRESS-01 a 04; hooks fuera de la v1; COPY-02, sugerencia de tokens, reuso de auditorías, pantalla de estado vacío, `doctor`, sorteo con semilla, extraer del render y excepciones por archivo quedan para la v1.x. **Medición (tercera, 2026-10-01):** carta candidata de `ui-option` y datos de muestra rotulados **adoptados** y unidos en 0.7.3; `PRODUCT.md` confirmado (hito 4f).

Las cuatro decisiones que este plan tenía pendientes, **ya decididas**:

- **D-4e-1: qué es "el modo explorar". DECIDIDA 2026-10-01.** Es el de la **etapa 4 del plan del lienzo** (R-20, T7c, T9d: una sola pregunta por corrida de `improve`, "no" por defecto, exploraciones ciegas rotuladas "fuera del sistema", elegir una exige un parche aprobado de `DESIGN.md`). No se define otro. T6 solo conecta el síntoma `bland` con esa pregunta y requiere la etapa 4 unida.
- **D-4e-2: la investigación en el repo público. DECIDIDA 2026-10-01.** Se quitaron todas las citas textuales de la skill Apple sin licencia de `docs/research/2026-10-01-skills-de-diseno.md` (quedan el enlace a su repo y a la HIG oficial de Apple, sin texto citado) y la segunda investigación entró al repo como `docs/research/2026-10-01-impeccable-a-fondo.md`, sin rutas locales y con citas de dos líneas como máximo (impeccable es Apache-2.0: palabras propias y una línea en `CREDITS.md`, T9). Ya no bloquea la unión de la rama.
- **D-4e-3: costo de las evals. DECIDIDA 2026-10-01.** El eval extra del auditor, **≈ 4,4 USD, está aprobado** (se corre si T7 cambia las páginas limpias, lo más probable por R-4e-12); E1 (la carta de `ui-option`) ya se midió y se adoptó, así que no cuesta nada más. Total de este plan: E2 ≈ 4,4 + extra ≈ 4,4 = **≈ 8,8 USD**. Las demás mediciones de la segunda pasada (hitos 4f y 4g) van por el tope aparte de 14 USD (ver "Impacto en las evals").
- **D-4e-4: medir en una app real antes de la versión de cierre. Sigue pendiente del autor (D-4-4: nombrar una app y su URL; todavía no la nombró).** El presupuesto de falsos positivos se prueba con fixtures; una app real puede dar más ruido (TARGET-01 en menús, TYPE-01 en tablas, STRESS-02 en listas con alto mínimo). **Recomendación:** correr `measure` y `stress` con las reglas nuevas sobre esa app antes de publicar la 0.12.0 y bajar a `detalle` o cortar lo que dé más de ≈ 10 entradas por pantalla; sin app nombrada, publicar igual con el límite declarado en el CHANGELOG.

## Tarjetas

### Task 0: preparación (sin código)

- [ ] Comprobar los prerrequisitos de arriba (`git grep` de ids; `ui/auditor-juicio` unida; la 0.7.3 unida; nombres existentes). Crear la rama que toque (`ui/hito-4e-auditor` para la ola 1, `ui/hito-4e` para el resto) y su worktree.
- [ ] Anotar qué trajo la 0.7.3 que este plan consume: el texto vigente de `agents/ui-option.md` (sección `# Craft`, que ya trae las reglas 9 a 13), cómo `options-check` y `leak-check` tratan `data-sample` y la línea "Datos de muestra" (R-4e-23), y si la carta de `ui-auditor` ya dice algo de `data-sample` (si lo dijo, T1 no lo repite). También el nombre exacto de la llamada CDP que fija el tamaño de ventana en `measurePage` (T14), y dónde `run.mjs check` arma `--measures` y dónde `auditor-check` lee `ui-check.json` y `browser.json` (T14).
- [ ] Verificar que las dos investigaciones están en `docs/research/` y que no tienen rutas absolutas del usuario (`git grep -nF -e "C:\\" -e "/Users/" docs/research/2026-10-01-skills-de-diseno.md docs/research/2026-10-01-impeccable-a-fondo.md` sin resultados) ni citas textuales de la skill Apple sin licencia (`git grep -n "dickwu" docs/research/2026-10-01-skills-de-diseno.md` solo da enlaces y atribuciones de ideas, sin comillas con texto de ella).
- [ ] Sin commit propio si no cambia nada.

### Task 1 (ola 1): auditor con "cuándo aplica", `medio` por defecto, tope de 3 y datos de muestra

**Files:**
- Modify: `plugins/pignolo-ui/norms/base.md`, `agents/ui-auditor.md`, `lib/auditor-output.mjs`, `.claude-plugin/plugin.json` (0.7.4), `CHANGELOG.md`
- Test: `tests/auditor-output.test.mjs`, `tests/norms.test.mjs`, `tests/agents.test.mjs`

**Interfaces:**
- `lib/auditor-output.mjs`: nueva constante exportada `MAX_JUDGMENT_FINDINGS = 3`; nuevo problema `'judgment-cap'` en `validateFindings` (un `{ index, problem }` por cada `J-nn` a partir del cuarto en orden de la lista). Firma sin cambios.
- `norms/base.md`: las 12 líneas `- J-nn:` terminan con `Applies when: <condición>.` y se afilan con palabras propias (R-4e-4). Condiciones (texto mínimo, el ejecutor redacta):

| Criterio | Aplica cuando |
|---|---|
| J-01 una acción primaria, la más prominente | la pantalla es para completar una tarea (formulario, decisión, compra); no en una lista o página de lectura |
| J-02 jerarquía de texto visible de un vistazo (con el detalle borroso se distingue primero la acción y después los grupos) | hay más de un nivel de texto |
| J-03 el orden del marcado coincide con el visual | el diseño usa columnas, áreas de grilla, `order` o posición absoluta |
| J-04 la primera vista responde dónde estoy, a dónde puedo ir, qué hay acá y cómo salgo | la pantalla es una página de un flujo, no un diálogo ni un fragmento |
| J-05 proximidad agrupa y separa | hay dos o más grupos de contenido |
| J-06 el estado del sistema es visible | una acción tarda, guarda o cambia datos |
| J-07 el rótulo de cada control nombra lo que pasa y la acción conserva su nombre en todo el flujo | hay botones, enlaces o campos con texto |
| J-08 deshacer o salir sin perder trabajo; lo destructivo e irreversible pide confirmación con Cancelar | hay un formulario, una edición o una acción destructiva |
| J-09 un color significa una sola cosa; lo mismo se ve y se llama igual | el color marca estado o hay elementos repetidos |
| J-10 los errores dicen qué pasó y cómo arreglarlo | hay un estado de error alcanzable (validación, pedido que puede fallar) |
| J-11 las decisiones que importan son explícitas | el run muestra valores por defecto del framework (THEME-01/02) o `DESIGN.md` marca tokens como `extracted` |
| J-12 densidad y espacios acordes al registro | `DESIGN.md` declara `register` |

- `agents/ui-auditor.md` (sección Rules), líneas nuevas: un `J-nn` solo existe si su "Applies when" se cumple en esta pantalla; como mucho 3 por pantalla, los de más efecto, y el validador rechaza el cuarto; sin medida, el `why` empieza con `Judgment:`; con medida, cita el número. Se conserva la línea de `ui-auditor` ya unida (`medio` o `detalle` por defecto; `alto` solo con entrada `fail`). **Datos de muestra (R-4e-23):** una línea más: un valor con `data-sample` es muestra rotulada, no contenido inventado, y no se informa como tal; lo que no lleva `data-sample` y es un hecho inventado sí (omitir si la 0.7.3 ya lo dice, T0).

**Tests literales:**
- [ ] `norms.test.mjs`: las 12 líneas `- J-nn:` de `norms/base.md` contienen `Applies when:` (rojo: hoy ninguna). Guarda de regresión: `judgmentIds(base)` sigue devolviendo `J-01…J-12` en orden con el formato nuevo.
- [ ] `auditor-output.test.mjs`: tres `J-nn` `medio` con evidencia `file` → sin problemas (guarda del límite). Cuatro `J-nn` → `judgment-cap` solo en el índice 3. Cinco → `judgment-cap` en 3 y 4. Cuatro hallazgos de regla (`COLOR-03` con huella `fail`) más tres `J-nn` → sin `judgment-cap` (los de regla no cuentan). Cuatro `J-nn`, uno `alto` con huella `fail` de `ui-check`, → igual `judgment-cap` en el cuarto (la medida no exime del tope). Rojo: contra el validador sin el tope los cuatro casos de falla pasan.
- [ ] `agents.test.mjs`: la carta de `ui-auditor` contiene `Applies when`, `at most 3` y `Judgment:`, y conserva `No self-grade` y `never `bloquea` without script or browser evidence`; contiene `data-sample` y dice que no se informa como contenido inventado (rojo: contra la carta de 0.7.2 falta).
- [ ] Commit: `feat(pignolo-ui): criterios de juicio con condición de aplicación y tope de 3 hallazgos (0.7.4)`. **Después: T1b, y recién ahí E2 (controlador), antes de unir.**

### Task 1b (ola 1): línea `keep` del auditor

**Files:**
- Modify: `plugins/pignolo-ui/lib/auditor-output.mjs`, `agents/ui-auditor.md`, `scripts/run.mjs` (`auditor-check`), `reference/options.md` (viñeta de `improve`), `skills/improve/SKILL.md` (paso 4, una frase), `CHANGELOG.md` (misma entrada 0.7.4)
- Test: `tests/auditor-output.test.mjs`, `tests/agents.test.mjs`, `tests/run-cli.test.mjs`, `tests/skill-improve.test.mjs`

**Interfaces:**
- `lib/auditor-output.mjs`: constante exportada `KEEP_MAX_CHARS = 160`; `validateFindings` suma el problema `'bad-keep'` (`index: -1`) cuando `output.keep` existe y no es un texto no vacío, de una sola línea y de 160 caracteres como máximo. Ausente es válido. Firma sin cambios.
- `run.mjs auditor-check` imprime `keep` (el texto si el `json` es válido y lo trae; `null` si no).
- `agents/ui-auditor.md`: en `# Output`, un campo opcional `"keep": "<one line>"` y una regla: name one thing that already works and must not be diluted by the fixes; one line; not a finding, no severity, no evidence.
- `skills/improve/SKILL.md` paso 4 y `reference/options.md` (viñeta de `improve`): el brief de cada versión lleva, además de los hallazgos elegidos y el resumen en texto de la captura "antes", la línea `keep` del auditor.

**Tests literales:**
- [ ] `auditor-output.test.mjs`: un `json` con `keep` de 40 caracteres → sin problemas; sin `keep` → sin problemas (guarda de regresión); `keep: 42` → `bad-keep`; `keep` de 161 caracteres → `bad-keep` (160 → sin problema); `keep` con un salto de línea → `bad-keep`; `keep: ''` → `bad-keep`; tres `J-nn` más un `keep` → sin `judgment-cap` (no cuenta para el tope). Rojo: contra el validador sin el chequeo los cuatro casos de falla pasan.
- [ ] `agents.test.mjs`: la carta de `ui-auditor` contiene `keep`, `one line` y `already works`, y no pide nota ni severidad para él.
- [ ] `run-cli.test.mjs`: `auditor-check` con un `auditor.json` válido que trae `keep` imprime ese texto en `keep`; sin `keep` imprime `null`; con un `keep` inválido sale 1 con `bad-keep` y `keep: null`.
- [ ] `skill-improve.test.mjs` y el test de `options.md`: ambos textos contienen `keep` en la frase del brief de las versiones y ninguno la ofrece como nota.
- [ ] Commit: `feat(pignolo-ui): línea keep del auditor, lo que funciona y no hay que diluir (0.7.4)`. **Después: E2 (controlador), antes de unir** (E2 cubre T1 y T1b juntas).

### Task 2 (ola 2): TARGET-01 y FORM-01 en el navegador

**Files:**
- Modify: `lib/browser-checks.mjs`, `lib/browser-run.mjs` (`BROWSER_RULES` suma los 5 ids nuevos de `measure`: TARGET-01, FORM-01, TYPE-01, TYPE-02 y, en T10, RESP-01), `scripts/browser.mjs` (pasa `targets` leído de `--design`), `catalog/rules.json`, `tests/catalog.test.mjs`
- Test: `tests/browser-checks.test.mjs`

**Interfaces:**
- Constantes exportadas: `PHONE_MAX_WIDTH = 480`, `MIN_TARGET_PX = 24`, `RECOMMENDED_TARGET_PX = 44`, `MIN_FIELD_FONT_PX = 16`.
- Función de página `collectTargets()` → `[{ selector, left, top, width, height, inline }]` de `a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=tab], [role=menuitem]` visibles y no deshabilitados (`isDisabled`); `inline` = `display: inline` con texto propio alrededor en el mismo bloque; checkbox y radio con `label` usan la caja unida.
- Función de página `collectFields()` → `[{ selector, fontSize }]` (R-4e-6).
- Lado Node: `targetFindings(items, { width, minPx = 24, recommendedPx = 44 }) → raw[]` y `fieldFindings(items, { width }) → raw[]`, con la forma de los demás (`{ id, status, key, selector?, severity?, measure }`). `minPx` efectivo = `Math.max(24, minPx)`.
- `runChecks(page, { targets } = {})`: segundo argumento opcional (`targets = { minPx?, recommendedPx? }` de `pignolo.targets`); retrocompatible.
- Catálogo: TARGET-01 (`class: browser`, `checker: browser`, `severity: alto`, `floor: false`, `acceptsIntentional: false`, `source: "WCAG 2.2 SC 2.5.8 (AA); Apple HIG, tamaño de objetivo táctil (https://developer.apple.com/design/human-interface-guidelines/)"`), FORM-01 (`medio`, `source: "pignolo-ui: iOS amplía la página cuando el campo tiene letra menor a 16 px"`). `catalogVersion` pasa a `0.4.0`; `catalog.test.mjs` suma las listas nuevas sin tocar las viejas.

**Tests literales:**
- [ ] `targetFindings` (puro): 20×20 con otro objetivo a 10 px → `fail alto` (círculos cruzados) a 1440; 20×20 aislado (vecino a 60 px) → sin `alto` a 1440 y, a 375, parte de un único `medio` con `key: 'phone-targets'`; 30×30 → sin `alto` y `medio` agregado a 375 (`measure.count`, `smallestPx`, `selectors` con a lo sumo 5); 44×44 a 375 → `pass` `checked`; `inline: true` de 18 px → exento a todo ancho; con `minPx: 32` de `DESIGN.md`, 30×30 con vecino a 5 px → `alto`; con `minPx: 16` el piso sigue en 24; 40 objetivos de 40 px a 375 → **una sola** entrada `phone-targets` con `count: 40`.
- [ ] `fieldFindings` (puro): `input` de 14 px a 375 → `fail medio`; de 16 px → sin entrada; mismo `input` de 14 px a 1440 → sin entrada (no aplica); `checkbox` excluido.
- [ ] En el navegador (`{ skip }`): una página con un botón de 20×20 pegado a otro, un enlace dentro de un párrafo y un botón deshabilitado de 20×20 → solo el botón pegado en `alto`; un checkbox de 13 px con `label` de 40 px de alto a 375 → solo cuenta en el agregado de 44 px, no en `alto`; `input` de 14 px a 375 → FORM-01.
- [ ] Rojo: quitar la excepción de espaciado hace fallar el caso del 20×20 aislado; quitar la agregación hace fallar el de 40 objetivos.
- [ ] Commit: `feat(pignolo-ui): TARGET-01 y FORM-01, objetivos táctiles y campos de 16 px en el navegador`.

### Task 3 (ola 2): TYPE-01 y TYPE-02, e `intentional` para el navegador

**Files:**
- Modify: `lib/browser-checks.mjs`, `lib/ui-check.mjs` (T3-b), `catalog/rules.json`, `tests/catalog.test.mjs`
- Test: `tests/browser-checks.test.mjs`, `tests/ui-check-measures.test.mjs`

**Interfaces:**
- Constantes exportadas: `MIN_TITLE_BODY_RATIO = { brand: 1.25, product: 1.125 }` con `DEFAULT_RATIO_REGISTER = 'product'` para el registro sin declarar (R-4e-15), `MAX_LINE_CHARS = 80`, `MIN_LEADING = 1.3`, `MIN_TEXT_PX = 12`.
- Página: `collectType()` → `{ title: { selector, fontSize } | null, body: { fontSize } | null, blocks: [{ selector, chars, lines, leading, fontSize }], tiny: [{ selector, fontSize }] }` (usa `textNodes()`; `lines` por la altura del bloque sobre el interlineado usado; `leading` = interlineado calculado / `fontSize`, con 1,2 si es `normal`).
- Node: `typeFindings(data, { width, register = 'unset' }) → raw[]`: TYPE-02 una entrada (`fail`, `unverified` o `pass`); TYPE-01 una entrada por motivo con `key` `line-length`, `leading`, `tiny-text` y `measure { count, worst: { selector, value }, threshold }`.
- Catálogo: TYPE-01 y TYPE-02, clase `browser`, `medio`, `acceptsIntentional: true`, `source: "pignolo-ui (decisión del autor 2026-10-01); WCAG 2.2 SC 1.4.8 (AAA, orientación) para el largo de renglón"`.
- **T3-b (cortable, R-4e-8):** en `runCheck`, el paso 3 de `intentional` se factoriza en una función que se aplica también a `measures.entries` (mismas condiciones: regla con `acceptsIntentional`, sin `floor`, lista validada).

**Tests literales:**
- [ ] `typeFindings` (puro), TYPE-02 por registro (R-4e-15): con `register: 'brand'`, título 30 px / cuerpo 24 px (1,25) → `pass` y 29,9 / 24 → `fail medio` con `measure.ratio`, `measure.register: 'brand'` y `measure.threshold: 1.25`; con `register: 'product'`, 27 / 24 (1,125) → `pass` y 26,9 / 24 → `fail`; con `register: 'unset'` el umbral es 1,125 (27 / 24 → `pass`; `measure.register: 'unset'`); el mismo 28 / 24 (1,167) pasa en `product` y falla en `brand`. Rojo: con un umbral fijo de 1,25 falla el caso `product`. Sin `h1` → `unverified` con motivo; renglón de 81 caracteres → `line-length`, de 80 → no; interlineado 1,29 en un párrafo de 3 renglones → `leading`, 1,3 → no, 1,2 en uno de 1 renglón → no; 11 px → `tiny-text`, 12 px → no; 7 párrafos largos → **una** entrada `line-length` con `count: 7`.
- [ ] En el navegador (`{ skip }`): una página con un párrafo de 200 caracteres en una sola línea ancha a 1440 → `line-length`; una con `h1` y cuerpo del mismo tamaño → `TYPE-02`.
- [ ] `ui-check-measures` (T3-b): una entrada `TYPE-02 fail` en `browser.json` con `pignolo.intentional: [{ id: TYPE-02, why }]` en `DESIGN.md` → pasa con `reason: 'intentional: …'`; la misma con `TARGET-01 alto` y `intentional` de TARGET-01 → sigue en `fail` (no acepta); sin `DESIGN.md` → sin cambios (guarda de regresión). Rojo: sin T3-b la primera sigue en `fail`.
- [ ] Commit: `feat(pignolo-ui): TYPE-01 y TYPE-02 medidos y intentional para las entradas del navegador`.

### Task 10 (ola 2): RESP-01, controles que faltan en el celular

**Files:**
- Modify: `lib/browser-checks.mjs` (`collectInteractive()`, `respFindings`), `lib/browser-run.mjs` (la comparación entre anchos, después del bucle de medidas, solo en tema claro), `catalog/rules.json`, `tests/catalog.test.mjs`
- Test: `tests/browser-checks.test.mjs`, `tests/browser-run.test.mjs`, `tests/ui-check-measures.test.mjs`

**Interfaces:**
- Constantes exportadas: `RESP_WIDE_MIN = 1024`, `RESP_NARROW_MAX = 480`, `RESP_MAX_NAMES = 5`.
- Página: `collectInteractive()` → `{ items: [{ key, name, visible, disclosed }] }` de `a[href], button, [role=button], [role=link], [role=menuitem], [role=tab], summary, input:not([type=hidden])` con nombre accesible, sin `aria-hidden` ni deshabilitados (R-4e-16). `key` = etiqueta o rol + nombre normalizado + `href` sin origen. `disclosed` = el elemento está dentro del destino (`aria-controls` o `id`) de un control de despliegue **visible** (`button`, `summary` o `[role=button]` con `aria-expanded`/`aria-controls`) o dentro de un `<details>` cerrado cuyo `<summary>` es visible.
- Node: `respFindings(byWidth, { wide, narrow }) → raw[]`, con `byWidth` = `{ [width]: { items } }`. Una sola entrada `RESP-01`: `fail` (`key: 'missing-on-phone'`, `severity: medio`, `measure { count, names, wide, narrow }`), `pass` (`checked`) o `unverified` ("hace falta un ancho de escritorio y uno de celular" si no hay uno ≥ 1024 y otro ≤ 480).
- Catálogo: RESP-01, `class: browser`, `checker: browser`, `medio`, `floor: false`, `acceptsIntentional: true`, `source` de R-4e-16.

**Tests literales:**
- [ ] `respFindings` (puro): enlace "Facturación" visible a 1440 y oculto a 375 sin control de despliegue → `fail medio` con `measure.names: ['Facturación']`; el mismo con `disclosed: true` → `pass`; visible en ambos → `pass`; ausente del DOM a 375 → `fail`; solo 1440 y 768 medidos → `unverified` con el motivo; 7 faltantes → **una** entrada con `count: 7` y `names` de 5 como máximo.
- [ ] `collectInteractive` (navegador, `{ skip }`): una página con `.side{display:none}` bajo `@media (max-width:480px)` y sin botón → `RESP-01 fail`; la misma con `<button aria-expanded="false" aria-controls="m">` visible y `#m` con los enlaces oculto → sin entrada `fail` (menú colapsado: el riesgo que la investigación nombra); una página idéntica en todos los anchos → `pass`; un enlace con `aria-hidden="true"` y un botón deshabilitado ocultos en el celular → no cuentan.
- [ ] `ui-check-measures` (con T3-b hecha): una entrada `RESP-01 fail` con `pignolo.intentional: [{ id: RESP-01, why }]` en `DESIGN.md` → pasa con `reason: 'intentional: …'`.
- [ ] Rojo: quitar la excepción `disclosed` rompe el caso del menú colapsado; comparar solo por nombre (sin `href`) hace pasar dos enlaces distintos con el mismo texto y rompe el caso de "faltan 2 de 3 'Ver'".
- [ ] Commit: `feat(pignolo-ui): RESP-01, controles de escritorio que faltan en el celular`.

### Task 11 (ola 2): registro por pantalla en las medidas

**Files:**
- Modify: `scripts/browser.mjs` (`--register brand|product`), `lib/browser-run.mjs` y `lib/browser-checks.mjs` (`runChecks(page, { targets, register })`), `reference/prepare-run.md` (paso 5, una línea)
- Test: `tests/browser-cli.test.mjs`, `tests/browser-checks.test.mjs`

**Interfaces:** `effectiveRegister({ flag, design }) → 'brand' | 'product' | 'unset'` (R-4e-15: la opción `--register`, si no `pignolo.register` de `--design`, si no `unset`); una opción `--register` con otro valor es error de uso (exit 2). El resultado llega a `typeFindings` (T3) y se imprime en `measure.register` de cada entrada TYPE-02. `prepare-run.md`, paso 5: "agregar `--register <valor>` solo cuando el brief del flujo declara `register` (`run.mjs register`, hito 4f); si no, se omite y rige `DESIGN.md`".

**Tests literales:**
- [ ] `effectiveRegister` (puro): flag `brand` con `DESIGN.md` `product` → `brand`; sin flag con `DESIGN.md` `product` → `product`; sin flag y sin `DESIGN.md` → `unset`; flag `airy` → error de uso.
- [ ] `browser.mjs measure --register airy` → exit 2 con el motivo; con `--register brand` y una página con `h1` de 28 px y cuerpo de 24 px (1,167) (`{ skip }`) → `TYPE-02 fail` con `measure.register: 'brand'`; con `--register product` → sin `fail`.
- [ ] `prepare-run.md` contiene `--register` y dice que se omite cuando el brief no lo declara.
- [ ] Rojo: ignorar la opción y leer siempre `DESIGN.md` rompe el caso `--register brand`.
- [ ] Commit: `feat(pignolo-ui): registro por pantalla en measure, umbral de TYPE-02 según el registro`.

### Task 4 (ola 3): A11Y-41, salto de niveles de títulos

**Files:**
- Modify: `lib/rules/document.mjs` (nuevo elemento de `RULES`), `catalog/rules.json`, `tests/catalog.test.mjs`
- Create: `tests/fixtures/rules/A11Y-41/{pass-sequential,pass-decrease,pass-no-headings,fail-skip,fail-skip-after-decrease,unverified-jsx}/` con `expect.json`
- Test: `tests/rules-fixtures.test.mjs` (recorre solo), `tests/rules-document.test.mjs`

**Interfaces:** `{ id: 'A11Y-41', checkFile(ctx) }`; hallazgo `fail` con `key: '<hN>><hM>|<texto normalizado, 40 caracteres>'`, `severity: medio`. Catálogo: `class: script`, `checker: ui-check`, `level: element`, `medio`, `acceptsIntentional: false`, `source: "WCAG 2.2 SC 1.3.1 (A)"`.

**Tests literales:**
- [ ] Fixtures: `h1 h2 h3` → pasa; `h1 h2 h3 h2 h3` → pasa; sin encabezados → pasa; `h1 h3` → falla (`h1>h3`); `h1 h2 h3 h2 h4` → falla solo en `h2>h4`; archivo JSX con `<h1>` y `<h3>` literales → `unverified`.
- [ ] `rules-document`: un encabezado con `aria-hidden="true"` entre `h1` y `h3` no cuenta; empezar en `h2` sin `h1` no es de esta regla (sin hallazgo).
- [ ] Commit: `feat(pignolo-ui): A11Y-41, salto de niveles de títulos`.

### Task 5 (ola 3): movimiento estático (MOTION-05, 06, 08, 09)

**Files:**
- Create: `lib/rules/motion.mjs` (exporta `RULES`), `tests/fixtures/rules/MOTION-0{5,6,8,9}/…`, `tests/rules-motion.test.mjs`
- Modify: `lib/ui-check.mjs` (suma `MOTION` a `DISK_RULES`), `catalog/rules.json`, `tests/catalog.test.mjs`

**Interfaces:** cuatro reglas (R-4e-9); constantes `MAX_CONTROL_MS = 500`, `LAYOUT_PROPS = ['width','height','top','left','right','bottom','margin','padding']` (más las formas `margin-*`, `padding-*`); lee `ctx.design.data.pignolo.motion` y `ctx.css`. `key` = `selector|property|value`. Catálogo: las cuatro `class: script`, `checker: ui-check`, `level: style`, `acceptsIntentional: true`; severidades `medio`, `detalle`, `medio`, `detalle`; `source`: MOTION-05 "pignolo-ui (decisión del autor 2026-10-01)", MOTION-06 igual, MOTION-08 "CSS Transitions Level 1 (propiedades animables)", MOTION-09 "Media Queries Level 4 `hover`".

**Tests literales (fixtures, una carpeta por caso):**
- [ ] MOTION-05: `pass-tokens` (`DESIGN.md` con `durationMs.base: 200` y `transition: opacity 200ms`); `pass-var` (`transition: opacity var(--dur)`); `pass-short` (sin `DESIGN.md`, `button{transition: opacity 150ms}`); `fail-long` (sin `DESIGN.md`, `button:hover{transition: opacity 600ms}`); `fail-not-in-tokens` (con `DESIGN.md` y `transition: opacity 350ms`); `pass-long-non-control` (sin `DESIGN.md`, `.hero{transition: opacity 800ms}` no es control: sin hallazgo).
- [ ] MOTION-06: `pass-ease-out`; `fail-ease-in` (`button{transition: opacity 150ms ease-in}`); `fail-bounce` (`cubic-bezier(.34,1.56,.64,1)`); `pass-design-easing` (con `pignolo.motion.easing` declarado, el mismo `ease-in` calla).
- [ ] MOTION-08: `fail-width` (`transition: width 200ms`); `fail-keyframes-top` (`@keyframes slide{from{top:0}to{top:10px}}`); `pass-opacity-transform`; `pass-all-is-motion-04` (`transition: all` no es de esta regla).
- [ ] MOTION-09: `fail-hover-transform` (`a:hover{transform: scale(1.05)}`); `pass-gated` (dentro de `@media (hover: hover)`); `pass-hover-color` (`:hover` sin transform).
- [ ] Un test de `intentional`: MOTION-08 `fail` con `intentional` de MOTION-08 en `DESIGN.md` → `pass` con `reason: intentional`.
- [ ] Rojo: quitar la guarda de `@media (hover: hover)` rompe `pass-gated`; quitar el silencio por `motion.easing` rompe `pass-design-easing`.
- [ ] Commit: `feat(pignolo-ui): chequeos estáticos de movimiento (MOTION-05, 06, 08, 09)`.

### Task 13 (ola 3): STRESS-04, ancho fijo en un control (estático)

**Files:**
- Create: `lib/rules/stress.mjs` (exporta `RULES`), `lib/rules/controls.mjs` (la definición de selector de control de R-4e-9, que T5 y esta tarjeta comparten; si T5 ya la dejó dentro de `motion.mjs`, se mueve acá sin cambiar su comportamiento), `tests/fixtures/rules/STRESS-04/…`, `tests/rules-stress.test.mjs`
- Modify: `lib/ui-check.mjs` (suma `STRESS` a `DISK_RULES`), `catalog/rules.json`, `tests/catalog.test.mjs`

**Interfaces:** una regla (R-4e-18); constante `FIXED_WIDTH_MIN_PX = 48`; lee `ctx.css.decls`; `key` = `selector|width`. Catálogo: `class: script`, `checker: ui-check`, `level: style`, `alto`, `floor: false`, `acceptsIntentional: true`, `source` de R-4e-18. El criterio dice que las utilidades de Tailwind (`w-[120px]`) no se miden.

**Tests literales (fixtures, una carpeta por caso):**
- [ ] `fail-fixed-120` (`button{width:120px}`); `fail-media` (`@media (min-width:600px){.btn-primary{width:160px}}`).
- [ ] `pass-small` (`.btn{width:48px}`, el límite no falla); `pass-square` (`.icon-btn{width:64px;height:64px}`); `pass-aspect` (`button{width:80px;aspect-ratio:1}`); `pass-min-max` (`button{width:120px;max-width:100%}`); `pass-var` (`button{width:var(--w)}`); `pass-percent` (`button{width:100%}`); `pass-non-control` (`.card{width:300px}`).
- [ ] `intentional`: `fail-fixed-120` con `intentional` de STRESS-04 en `DESIGN.md` → `pass` con `reason: intentional`.
- [ ] Rojo: quitar la excepción del cuadrado rompe `pass-square`; contar `width` en `%` rompe `pass-percent`.
- [ ] Commit: `feat(pignolo-ui): STRESS-04, ancho fijo en px sobre un control`.

### Task 12 (ola 4): validez de capturas y "la evidencia del usuario reabre"

**Files:**
- Create: `lib/captures-check.mjs`, `tests/captures-check.test.mjs`, `tests/support/make-png.mjs` (arma un PNG de prueba con `node:zlib`, sin dependencias)
- Modify: `lib/browser-run.mjs` (`capturePage`: lee `settled` antes de capturar, valida cada captura, una recaptura con reposo de 1 s si es inválida, `valid` y `reason` en `captures.json`), `lib/auditor-output.mjs` (`evidence-invalid-capture`), `skills/new/SKILL.md`, `skills/improve/SKILL.md`, `skills/audit/SKILL.md` (una línea cada una), `reference/prepare-run.md`
- Test: `tests/browser-run.test.mjs`, `tests/auditor-output.test.mjs`, `tests/skill-new.test.mjs`, `tests/skill-improve.test.mjs`, `tests/skill-audit.test.mjs`

**Interfaces (R-4e-19):**
- `checkCapture({ png, width, settled }) → { valid: boolean, reason?: string }`, con `reason` ∈ `bad-png`, `width-mismatch`, `uniform`, `not-loaded`, `animating`. Constantes `MIN_DISTINCT = 2`, `MAX_DOMINANT = 0.995`, `SAMPLE_STEP = 16`. `samplePng(buf) → { distinct, dominantRatio }` (descomprime con `zlib.inflateSync`, deshace los filtros de línea, muestrea 1 píxel de cada 16 en ambos ejes; solo PNG de 8 bits RGB y RGBA, lo demás es `bad-png`).
- `captures.json`: cada captura suma `valid` (booleano), `reason` (si es inválida) y `settled { readyState, runningAnimations }`; una inválida **también** entra a `unverified` como `{ width, theme, reason: 'capture invalid: <reason>' }`. Nunca produce un hallazgo ni un "pasó".
- `validateFindings`: una evidencia `capture` cuya captura figura con `valid: false` en `captures.json` → `evidence-invalid-capture`.
- Texto de las tres skills: una línea de "la evidencia del usuario reabre" (R-4e-21) y otra: una captura inválida se dice como "no verificado", no se audita.

**Tests literales:**
- [ ] `checkCapture` (puro, PNG armado con `make-png`): imagen blanca lisa de 64×64 → `valid: false, reason: 'uniform'`; negra lisa → igual; blanca con un bloque de texto de 10 % del área → válida; 99,6 % blanca → inválida y 98 % → válida (el borde está en 99,5 %); ancho de imagen 1439 con ancho pedido 1440 → `width-mismatch`; un archivo que no es PNG → `bad-png`; `settled.readyState: 'loading'` → `not-loaded`; `runningAnimations: 2` → `animating`; `complete` y 0 → válida.
- [ ] `capturePage` (`{ skip }`): una página vacía de fondo blanco → la captura sale con `valid: false`, aparece en `unverified` y `browser.json` no cambia; una página con una animación de entrada de 300 ms sobre un título → tras el reposo la captura es válida (se cuenta una sola recaptura como máximo).
- [ ] `auditor-output.test.mjs`: un hallazgo con evidencia `capture` de una captura con `valid: false` → `evidence-invalid-capture`; con una válida → sin problema (guarda de regresión).
- [ ] Textos: las tres skills contienen `invalid capture` y `user's evidence` junto a `new audit` y dicen que no se parchea a mano ni se autoaprueba; `prepare-run.md` dice que una captura inválida se informa como "no verificado". Rojo: borrar la línea de una skill → cae su test.
- [ ] Commit: `feat(pignolo-ui): validez de capturas y la evidencia del usuario reabre`.

### Task 14 (ola 4): prueba de estrés del navegador, STRESS-01 a 03

**Files:**
- Create: `lib/browser-stress.mjs` (funciones de página y `stressFindings`), `tests/browser-stress.test.mjs`, `tests/fixtures/stress/{fail-long-title,pass-wraps,fail-hole,pass-message,fail-zoom,pass-zoom}.html`
- Modify: `scripts/browser.mjs` (subcomando `stress`), `lib/browser-run.mjs` (`STRESS_RULES`, reutiliza `toEntries` y el cierre del navegador de `measure`), `scripts/run.mjs` (`check` suma `stress.json` a lo que ya agrega de `browser.json`; `auditor-check` y la lista `['ui-check.json', 'browser.json']`), `lib/auditor-output.mjs` (`readEntries` suma `stress.json`), `catalog/rules.json`, `reference/prepare-run.md` (paso 5), `skills/new/SKILL.md` y `skills/improve/SKILL.md` (el paso de verificar suma `stress`), `tests/catalog.test.mjs`, `tests/browser-cli.test.mjs`, `tests/run-cli.test.mjs`, `tests/auditor-output.test.mjs`

**Interfaces (R-4e-17 y R-4e-18):**
- Constantes exportadas: `LONG_FACTOR = 3`, `MAX_STRESS_CHARS = 120`, `HOLE_MIN_PX = 96`, `STRESS_ZOOM = 2`, `FIXED_MAX_RATIO = 0.4`.
- Páginas (corren dentro del navegador; no tocan archivos): `measureBefore()` → por cada elemento de texto candidato `{ selector, scrollWidth, clientWidth, overflow, ellipsis, rect }`, más las cajas de los objetivos interactivos y las métricas de la página `{ scrollWidth, clientWidth, innerHeight, fixed: [{ height }] }`; `growText()` (aplica R-4e-17 escenario 1); `emptyLists()` (escenario 2; devuelve por contenedor `{ selector, height, textChars }`); el zoom es la llamada CDP del tamaño de ventana con la mitad del ancho y del alto.
- Node: `stressFindings({ scenario, before, after, width }) → raw[]` con `scenario` ∈ `long-text`, `empty-lists`, `zoom-200`: entradas `STRESS-01`, `STRESS-02` y `STRESS-03` (`fail alto` con `key` `long-text|<motivo>`, `empty-lists|hole` o `zoom-200|<motivo>` y `measure { count, selectors }`; o `pass` `checked`).
- `browser.mjs stress --project <repo> --run <run> (--url <local URL> | --file <path>) [--design <DESIGN.md>] [--platform desktop|mobile|both]`: escribe `<run>/stress.json` y lo imprime; exit 0 siempre que corra (los hallazgos son `alto`, no bloquean) y 2 en error de uso; la URL no local se rechaza con el mismo chequeo que `measure`. Cada escenario carga la página de nuevo.
- Catálogo: STRESS-01, STRESS-02, STRESS-03, `class: browser`, `checker: browser`, `alto`, `floor: false`, `acceptsIntentional: false`, `source` de R-4e-18.
- `reference/prepare-run.md`, paso 5: después de `dom`, correr `browser.mjs stress` con los mismos argumentos (sin `--before`); `new` y `improve` lo repiten en su verificación en `<run>/after/` y `run.mjs check --before` lo trata como lo demás (deuda o nuevo).

**Tests literales:**
- [ ] `stressFindings` `long-text` (puro): un elemento sin desborde antes y con `scrollWidth 320 > clientWidth 200`, `overflow: hidden` y sin puntos suspensivos después → `STRESS-01 fail alto` con `key` `long-text|clipped`; el mismo con `ellipsis: true` (puntos suspensivos y `nowrap`) → sin entrada; el mismo que **ya desbordaba antes** → sin entrada (es de LAYOUT-11); un botón cuya caja ahora cruza la de un vecino interactivo que antes no cruzaba → `covers`, y si ya lo cruzaba antes → sin entrada; una página que gana desplazamiento horizontal → `page-scroll`, y si ya lo tenía → sin entrada; 40 celdas que fallan → **una** entrada `clipped` con `count: 40` y `selectors` de 5 como máximo.
- [ ] `stressFindings` `empty-lists` (puro): un contenedor de 200 px sin texto → `STRESS-02 fail`; de 40 px → sin entrada; de 200 px con texto de 12 caracteres adentro → sin entrada; sin listas de 2 hijos o más → sin entrada (no aplica).
- [ ] `stressFindings` `zoom-200` (puro): desplazamiento horizontal a 720 px que no había a 1440 → `STRESS-03 fail` (`overflow-x`); `position: fixed` y `sticky` que suman el 60 % del alto → `covered`; 30 % y sin desplazamiento → `pass`. Sin navegador (`degraded`) → las tres reglas `unverified` con el motivo, nunca `pass`. Rojo: quitar la comparación "ya desbordaba antes" rompe el caso de LAYOUT-11.
- [ ] En el navegador (`{ skip }`): sobre los fixtures `fail-long-title`, `fail-hole` y `fail-zoom` salen `STRESS-01`, `STRESS-02` y `STRESS-03`; sobre `pass-wraps`, `pass-message` y `pass-zoom` ninguna entrada `fail`.
- [ ] **Sin rastro** (`{ skip }`): el sha256 del archivo `--file` y el de `browser.json` (si existe) son iguales antes y después de `stress`; `stress.json` lleva `cleanup` sin perfil que sobre; `--url http://example.com` → exit 2.
- [ ] `run.mjs check` con un `stress.json` que trae un `STRESS-01 fail` → `ui-check.json` lo incluye y el exit es 0 (no bloquea); `auditor-check` acepta un hallazgo `kind: browser` con esa huella y rechaza una huella inexistente (`evidence-missing`).
- [ ] Textos: `prepare-run.md` contiene `browser.mjs" stress` y `improve` y `new` mencionan `stress` en la verificación; `catalog.test.mjs`: las tres reglas son `alto`, sin `floor` y con `acceptsIntentional: false`.
- [ ] Commit: `feat(pignolo-ui): prueba de estrés del navegador, STRESS-01 a 03`.

### Task 6 (ola 5): síntomas nuevos de `improve` y conexión con el modo explorar

**Files:**
- Modify: `catalog/symptoms.json`, `lib/symptoms.mjs`, `skills/improve/SKILL.md` (±3 líneas; límite del linter 12 000 caracteres: T0 anota el tamaño que tenga tras 4f y las etapas del lienzo)
- Test: `tests/symptoms.test.mjs`, `tests/skill-improve.test.mjs`

**Prerrequisito:** la etapa 4 del lienzo unida (D-4e-1). Si no lo está, esta tarea solo hace el diccionario y el código (`offer` queda en `buildMenu`) y deja la frase de la skill para cuando se una.

**Interfaces:** `checkSymptoms` acepta `offer` opcional (solo `"explore"`) y permite `rules: []` únicamente con `offer`; `mergeUserSymptoms` copia `offer`; `buildMenu` devuelve `offer` (`null` por defecto) y `preticked: false` si no hay reglas. Entradas nuevas (ids en kebab, palabras en minúscula; el emparejamiento ya ignora acentos):

| id | Palabras | Reglas | Arreglo (en inglés, una línea) |
|---|---|---|---|
| `slow-feel` | se siente lenta, pesada | MOTION-05, MOTION-06 | Shorten control transitions and use an ease-out curve |
| `janky-motion` | va a los saltos, se traba | MOTION-08 | Animate opacity and transform, not layout properties |
| `hard-to-tap` | cuesta tocar los botones, le erro | TARGET-01 | Raise the hit area of small controls to the recommended size |
| `zoom-on-type` | hace zoom cuando escribo | FORM-01 | Set the font size of form fields to 16 px or more |
| `sticky-hover` | queda marcado después de tocar | MOTION-09 | Wrap hover effects in `@media (hover: hover)` |
| `tiring-text` | cansa leer, mucho texto de corrido | TYPE-01 | Narrow the line length and loosen the leading |
| `flat-type` | todo se ve igual de grande | TYPE-02 | Widen the step between title and body sizes |
| `all-boxes` | todo son cajas, mucha tarjeta | J-05 | Group by spacing and drop equal or nested cards |
| `too-busy` | muy cargada, ruidosa | J-12, J-01 | Reduce accents and density to the register |
| `unclear-button` | no se entiende qué hace el botón | J-07 | Name each button after what it does |
| `breaks-on-real-data` | se rompe con datos reales, nombre largo, lista vacía, zoom | STRESS-01, STRESS-02, STRESS-03, STRESS-04 | Let long text wrap, give empty lists a message and keep the layout intact at 200 % zoom |
| `missing-on-phone` | en el celular falta algo, no está en el celular | RESP-01 | Keep every desktop control reachable on the phone, even behind a menu |
| `bland` | sosa, aburrida, le falta onda | (ninguna; `offer: explore`) | Not fixable inside the design system: offer the explore mode |

(13 filas: la investigación de las skills traía 10, `flat-type` suma TYPE-02 y los dos nuevos de la segunda pasada suman STRESS-01 a 04 y RESP-01, que sin síntoma no se le ofrecen a nadie.)

`skills/improve/SKILL.md`, paso 3: si el usuario elige un síntoma con `offer: explore`, el hilo principal dice que eso no se arregla dentro de `DESIGN.md` y **no genera versiones dentro del sistema para ese síntoma**; la pregunta única de la etapa 4 (R-20, D-4c-20: una sola por corrida, con la línea de costo de `explore.mjs cost` y "no" por defecto) se hace entonces **con ese síntoma como motivo**. No se agrega otra pregunta. Lo demás que eligió sigue su camino.

**Tests literales:**
- [ ] `symptoms.test`: el diccionario real pasa `checkSymptoms` con el catálogo real y `judgmentIds` (todas las reglas existen: exige T2 a T5, T10, T13 y T14 hechas); `checkSymptoms` rechaza `offer: 'other'` y un síntoma con `rules: []` sin `offer`; `mergeUserSymptoms` conserva `offer`.
- [ ] `matchWords("me cuesta tocar los botones")` → `['hard-to-tap']`; `matchWords("queda marcado despues de tocar")` (sin tilde) → `['sticky-hover']`; `matchWords("se rompe con un nombre largo")` → `['breaks-on-real-data']`; `matchWords("en el celular falta el menu")` → `['missing-on-phone']`; `buildMenu` marca `hard-to-tap` pre-tildado con `failedIds: ['TARGET-01']`, `breaks-on-real-data` con `failedIds: ['STRESS-01']` cuando `stress.json` trae ese `fail`, y `bland` con `offer: 'explore'` sin pretildar. Rojo: sin `offer` en `buildMenu` el último falla.
- [ ] `skill-improve.test`: el texto del paso 3 contiene `explore`, `explore.mjs cost` y `fuera del sistema` y dice que no se generan versiones dentro del sistema para ese síntoma; `explore.mjs cost` aparece **una sola vez** en toda la skill (una sola pregunta por corrida). Rojo: sumar una segunda pregunta → cae.
- [ ] Commit: `feat(pignolo-ui): síntomas nuevos de improve y conexión con el modo explorar`.

### Task 7 (ola 5): aceptación y presupuesto de falsos positivos

**Files:**
- Modify: `tests/evals/ui-cases.mjs` (exporta `PAGES`; corrige el CSS de `head()` si la sonda lo pide, R-4e-12)
- Create: `tests/hito-4e-acceptance.test.mjs`

**Pasos:**
- [ ] **Sonda primero (sin cambiar nada):** correr `measure` y `stress` reales (con navegador) sobre `clean1..3` y mirar qué entradas nuevas dan. Esperado: TARGET-01 `phone-targets` en las tres (inputs de ≈ 42 px) y `alto` en los enlaces de `clean3`; ver también si aparece algo de STRESS-01 a 03 o RESP-01. Si la sonda no puede correr (sin navegador), se declara "no verificado" y T7 deja el test con skip visible; **no** se corrige a ciegas.
- [ ] Si la sonda da hallazgos: revisar primero si es la regla (excepción, umbral) y solo si el defecto es real corregir `head()` (alto mínimo de 44 px en `input` y `button`; `ul li a{display:inline-block;padding:10px 0}`), volver a sondar hasta 0 y anotar el SHA nuevo.

**Tests literales:**
- [ ] Presupuesto estático: `runCheck` sobre cada carpeta `tests/fixtures/rules/*/pass-*` y sobre `tests/fixtures/acceptance/next-shadcn` → ninguna entrada `fail` de A11Y-41, MOTION-05, 06, 08, 09 ni STRESS-04 (un caso por carpeta; si una falla, se revisa la regla antes que el fixture).
- [ ] Presupuesto de navegador (`{ skip }`): `measure` y `stress` sobre `clean1..3` a 320, 375 y 1440 → ninguna entrada `fail` de TARGET-01, FORM-01, TYPE-01, TYPE-02, RESP-01, STRESS-01, STRESS-02 ni STRESS-03. Rojo: con el CSS viejo de `head()` falla (guarda de que el presupuesto muerde). **Cada chequeo nuevo muestra 0 hallazgos sobre los fixtures limpios existentes (DECIDIDA 2026-10-01).**
- [ ] Catálogo: ninguna de las 14 reglas nuevas es `bloquea` ni `floor`; las de gusto y registro (MOTION-05, 06, 08, 09, TYPE-01, TYPE-02, RESP-01, STRESS-04) aceptan `intentional`; TARGET-01, FORM-01 y STRESS-01 a 03 no. De punta a punta (`{ skip }`): `browser.mjs measure` sobre una página con un botón de 20×20 pegado a otro + `ui-check --measures` → `ui-check.json` con TARGET-01 `alto` y **exit 0** (no bloquea); lo mismo con `browser.mjs stress` sobre `fail-long-title`.
- [ ] El veredicto no cambia: `run.mjs verdict` sobre un run con solo entradas nuevas de `alto` (de `measure` y `stress`) dice lo mismo que sin ellas (guarda de que "terminado" depende de lo que ya decidía: los hallazgos nuevos no bloquean).
- [ ] Datos de muestra: las páginas y los fixtures de aceptación que ya llevan `data-sample` (T0 las lista) siguen sin hallazgos nuevos y el auditor de las evals no los informa como inventados (lo cubre E2 y el extra de D-4e-3).
- [ ] Commit: `test(pignolo-ui): aceptación del hito 4e y presupuesto de falsos positivos`.

### Task 8: hecha (ya no es tarea de este plan)

La carta candidata de `ui-option` (reglas de oficio 9 a 13) y los datos de muestra rotulados están **adoptados y unidos en pignolo-ui 0.7.3** por el controlador, tras el juicio del autor sobre la tercera medición (`tests/evals/RESULTS-lienzo.md`). Acá no hay nada que construir; T0 solo anota su texto vigente y T9 conserva la línea de créditos si falta.

### Task 9 (ola 6): créditos, versión, CHANGELOG

**Files:** Modify `CREDITS.md`, `.claude-plugin/plugin.json` (0.12.0), `CHANGELOG.md`; Create `tests/credits.test.mjs` (si el hito 4f o la 0.7.3 ya lo crearon, solo se completa).

**Contenido (R-4e-22: una línea por fuente, palabras propias, cero texto copiado):**
- `CREDITS.md`, en la lista de fuentes de ideas, con la aclaración "no se copió código ni texto", **una línea por fuente**: **impeccable** (Paul Bakaus, https://github.com/pbakaus/impeccable, Apache-2.0, consultado el 2026-10-01, commit `4adabaf`): ideas para los chequeos de tipografía, de objetivos y de estrés, la validez de capturas, el contexto de producto y limitar los hallazgos de juicio; **skills de Emil Kowalski** (https://github.com/emilkowalski/skills, MIT, consultado el 2026-10-01, commit `d16ebe6`): ideas para los chequeos de movimiento y de campos de 16 px; **Apple Human Interface Guidelines** (https://developer.apple.com/design/human-interface-guidelines/): solo el enlace, para el objetivo táctil de 44 pt; **WCAG 2.2** SC 2.5.8, 1.3.1, 1.4.4 y 1.4.10. La skill Apple sin licencia no se nombra ni se copia nada. Si la 0.7.3 o el hito 4f ya agregaron la línea de una fuente, se conserva (no se duplica) y se completa la lista de ideas.
- `CHANGELOG.md`: entrada **0.12.0** (14 reglas nuevas con sus ids: TARGET-01, FORM-01, TYPE-01, TYPE-02 por registro, RESP-01, STRESS-01 a 04, A11Y-41, MOTION-05, 06, 08, 09; catálogo 0.4.0; el subcomando `browser.mjs stress` y `stress.json`; `--register`; validez de capturas; `offer` del diccionario y 13 síntomas; `intentional` para el navegador; límites declarados: sin medir las excepciones "equivalente" y "esencial" de 2.5.8, sin utilidades de Tailwind, sin movimiento por scripts, el estrés no ejecuta el estado vacío real de la app) y, si no estaba, la **0.7.4** de la ola 1.

**Tests literales:**
- [ ] `credits.test.mjs`: `CREDITS.md` contiene `impeccable`, `Apache-2.0`, `emilkowalski/skills`, `MIT`, `developer.apple.com/design/human-interface-guidelines` y `no se copió`; tiene **una sola línea** por fuente (cada URL aparece una vez); y no contiene el nombre del repo de la skill sin licencia (`dickwu`).
- [ ] `manifest.test.mjs` (existente, sin cambios): la versión sigue siendo semver; el test de versión del plugin pasa con 0.12.0.
- [ ] Commit: `docs(pignolo-ui): créditos, CHANGELOG y versión 0.12.0 del hito 4e`.

## Cambios de spec que necesita el plan (a aprobar y editar al cerrar el hito; este plan no edita el spec)

1. **§5.4, nota bajo la tabla de navegador** (línea "NAV-01 bloquea solo en su parte de teclado… y de objetivo de 24 px"): el objetivo de 24 px pasa a **TARGET-01**, `alto` (no `bloquea`), con las excepciones medidas y las no medidas declaradas; NAV-01 queda solo con teclado.
2. **§5.4, tabla de navegador:** "4 chequeos propios" pasa a **7 con `measure`** (B5 objetivos y campos: TARGET-01, FORM-01; B6 tipografía: TYPE-01, TYPE-02; B7 controles en el celular: RESP-01) más **3 de la prueba de estrés** (`browser.mjs stress`: STRESS-01, 02, 03), con severidad `alto`/`medio` y el agregado por ancho.
3. **§5.4, tabla de `ui-check`:** seis filas nuevas (A11Y-41, MOTION-05, 06, 08, 09, STRESS-04). Los conteos se regeneran del catálogo (+6 estáticas, +5 de `measure`, +3 de `stress`); §5.1 y `catalogVersion` 0.4.0.
4. **§4.3:** una frase: `pignolo.motion.durationMs`, `pignolo.motion.easing` y `pignolo.targets` los consumen MOTION-05, MOTION-06 y TARGET-01 (hasta hoy nadie los leía); `pignolo.register` fija el umbral de TYPE-02 y el brief del flujo puede cambiarlo para esa pantalla (R-4e-15).
5. **§5.7 y §8 paso 3:** el diccionario suma el campo `offer: "explore"`; de 11 a 24 síntomas; el modo explorar es el de la etapa 4 del lienzo (D-4e-1).
6. **§5.5:** `intentional` también se aplica a las entradas de `browser.json` y de `stress.json` (R-4e-8).
7. **§10:** "como mucho 3 hallazgos de juicio por pantalla (`judgment-cap`); cada criterio `J-nn` dice cuándo aplica (`norms/base.md`); línea opcional `keep` (`bad-keep`); un valor con `data-sample` no es contenido inventado".
8. **§11.3 (capturas):** una captura inválida (casi lisa, ancho que no coincide, página sin terminar o animando) queda `valid: false`, entra a `unverified` y no se puede citar como evidencia.
9. **§7.4 (Carta de oficio) y los datos de muestra:** ya los edita quien une la 0.7.3 (reglas 9 a 13 adoptadas; datos de muestra rotulados, D-IM-7); este plan no los repite.
10. **§18:** sacar "objetivo de 24 px con checker (NAV-01, 2.5.8)" de los candidatos a v1.1 (queda hecho como TARGET-01); agregar a "fuera de alcance" el movimiento por scripts y las utilidades de Tailwind; y **listar la v1.x** de la segunda pasada: COPY-02 y el eje "solo textos", sugerir el token más cercano, reusar la última auditoría, pantalla de estado vacío, `run.mjs doctor`, sorteo con semilla, extraer tokens de la página renderizada, excepciones por archivo y el ancho real del usuario como ancho extra. Hooks: fuera de la v1.

## Estimación

| Tarea | Tests |
|---|---|
| T1 auditor | 4 bloques (≈ 9 casos) |
| T1b `keep` | 4 bloques (≈ 13 casos) |
| T2 TARGET-01 y FORM-01 | 3 bloques (≈ 16 casos) |
| T3 TYPE y `intentional` de navegador | 3 bloques (el tercero es T3-b; ≈ 20 casos con el umbral por registro) |
| T10 RESP-01 | 4 bloques (≈ 11 casos) |
| T11 registro por pantalla | 4 bloques (≈ 8 casos) |
| T4 A11Y-41 | 2 + 6 fixtures |
| T5 movimiento | 1 + 17 fixtures |
| T13 STRESS-04 | 3 bloques + 9 fixtures (≈ 10 casos) |
| T12 capturas y evidencia | 5 bloques (≈ 17 casos) |
| T14 estrés del navegador | 8 bloques (≈ 30 casos, 6 páginas) |
| T6 síntomas | 4 bloques (≈ 14 casos) |
| T7 aceptación | 6 bloques |
| T9 créditos | 2 bloques |
| T8 | ya no existe |

Cuenta de casos de test (cada fixture y cada fila de tabla cuenta): **≈ 140 casos en ≈ 54 bloques `test()`** (las tareas originales sumaban ≈ 46 casos; las seis tareas nuevas de la segunda pasada, T1b y T10 a T14, suman ≈ 89, y los cambios a T3, T6 y T7 ≈ 8 más; la investigación estimaba ≈ 28 bloques para esas seis, y el plan los cuenta mejor porque los de navegador y las funciones puras llevan muchos casos por bloque). Código: ≈ 1 100 líneas de lib, ≈ 1 400 de test. Una ejecución sonnet en serie ≈ 3 a 4 horas de pared (la ola 1 sola, ≈ 20 minutos).

## Impacto en las evals y costo

- **E2 (auditor), tras la ola 1 (T1 y T1b):** `ui-auditor-clean-2`, `ui-auditor-clean-3` y `ui-auditor-defect-j-01`, 5 corridas cada una, con `--tag auditor` filtrado por caso. Pasa si las páginas limpias llegan a 4 de 5 sin hallazgos `alto` (y sin informar como inventado un valor con `data-sample`) y `defect-j-01` sigue hallando el defecto sembrado (que el tope no tape lo real). ≈ 15 × 0,29 = **4,4 USD** (dato de `RESULTS-ui-hito-4.md`: 0,28 a 0,31 USD por corrida del auditor). Se mide con los graders de hoy, sin tocarlos. Va a `docs/benchmarks.md` con costo, velocidad y calidad. **Aprobado.**
- **E1 (carta de `ui-option`): hecha.** La tercera medición ya la corrió y el autor adoptó la carta candidata (0.7.3). No cuesta nada más acá.
- **Tras T7 (D-4e-3, DECIDIDA 2026-10-01: aprobado):** si las páginas limpias cambiaron, repetir `clean-1..3` × 5 (≈ 4,4 USD) para confirmar 4 de 5 con los chequeos activos. Los casos con defecto sembrado no cambian de grader; sus páginas no se tocan. Las seis tareas de la segunda pasada **no suman evals de modelo**: son scripts con fixtures (STRESS, RESP-01, capturas) o texto (`keep`, "la evidencia reabre"), y `keep` sale gratis de las corridas de E2.
- **Tests de agentes que se ven afectados:** `eval-ui-cases.test.mjs` (el SHA de las páginas, si cambian) y `agents.test.mjs`.
- **Total de este plan ≈ 8,8 USD** (E2 + el extra). Las mediciones de los hitos 4f y 4g corren por el tope aparte de 14 USD de las mediciones de la segunda pasada (el controlador las corre como brazos de agentes).

## Qué se corta primero (en este orden, si hay que recortar)

1. MOTION-09 y MOTION-06 (`detalle`, de gusto, el menor valor de la investigación).
2. STRESS-04 (T13): la única regla estática de la prueba de estrés, con la heurística más floja (`alto` por un ancho en CSS sin ver el texto).
3. T3-b (`intentional` para el navegador): TYPE-01, TYPE-02 y RESP-01 pasan a `acceptsIntentional: false` y T3 y T10 pierden un test cada una.
4. FORM-01.
5. TYPE-01 (se queda TYPE-02, que le da medida a J-02).
6. RESP-01 (T10).
7. MOTION-05 y MOTION-08.
8. A11Y-41.
9. T11 (registro por pantalla): TYPE-02 queda con el umbral fijo de 1,125 para todos los registros (el permisivo) y se pierde el `brand` más estricto; la regla sigue.
10. T14 (estrés del navegador): **no se pierde**: pasa a un hito propio enseguida después (así lo dice la investigación); T13 queda atada a él.

**No se corta nunca:** T1 y T1b (auditor), TARGET-01, T12 (validez de capturas: evita auditar y "arreglar" lo que no estaba roto), T6 (síntomas), T7 y T9: son lo de mayor valor según las investigaciones (≈ 6 tareas, ≈ 60 casos, más E2). El resto es cortable sin romper contratos: cada regla es un elemento del catálogo con su checker y su fixture.

## Apéndice: la carta candidata de `ui-option` ya está adoptada

Las cinco reglas de oficio (9 a 13: mostrar estados, ritmo de espacios, escala de letra visible, énfasis en un solo lugar, movimiento solo para mostrar estado) que este plan traía como texto candidato quedaron **adoptadas y unidas en pignolo-ui 0.7.3** por el controlador, junto con los datos de muestra rotulados (el autor prefirió esos brazos en la tercera medición). El texto vigente vive en `plugins/pignolo-ui/agents/ui-option.md`; no se repite acá. `DESIGN.md` y sus `intentional` siguen ganando sobre esa carta.
