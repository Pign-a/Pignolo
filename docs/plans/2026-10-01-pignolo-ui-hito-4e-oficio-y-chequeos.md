# pignolo-ui — Hito 4e: oficio y chequeos. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, sin revisión por tarea, una revisión final opus por hito con una pasada de arreglos (CLAUDE.md). Las tarjetas dan archivos, interfaces con nombres y formas exactas y casos de test literales; el código lo escribe el ejecutor. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Origen:** decisión del autor del 2026-10-01 a partir de la investigación `docs/research/2026-10-01-skills-de-diseno.md` (impeccable, skills de Emil Kowalski y una skill de diseño Apple). Las secciones B, C, D, E y F de esa investigación son la especificación de este plan; lo que el autor decidió está marcado **DECIDIDA 2026-10-01**.

**Objetivo:** que pignolo-ui (a) mida lo que hoy solo pide en prosa (objetivos táctiles, escala y renglón de la letra, saltos de títulos, movimiento, campos de 16 px), (b) frene la sobre-severidad del auditor con criterios `J-nn` que dicen cuándo aplican y un tope de hallazgos de juicio, y (c) entienda más palabras de `improve`. Sin dependencias nuevas, sin copiar texto ni código de terceros.

**Stack:** Node ≥ 22 sin dependencias npm, ESM `.mjs`, `node:test` + `node:assert/strict`. **Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md` §4.3, §5.1, §5.3, §5.4, §5.7, §7, §8, §10, §18 (no se edita acá: ver "Cambios de spec").

**Prerrequisitos (Task 0, sin código):**
- `main` con `ui/auditor-juicio` unida (pignolo-ui 0.6.3: un `J-nn` sin medida fallida vale a lo sumo `medio`; validador `judgment-without-measure`; spec §10 con una línea). Este plan se apoya en eso y **no lo repite**. Si todavía no se unió, la rama de este plan sale de `ui/auditor-juicio`, no de `main`.
- `git grep -n "TARGET-01\|TYPE-0\|FORM-01\|A11Y-41\|MOTION-0[5689]"` no encuentra esos ids en el spec ni en `catalog/` (ids provisorios de la investigación; A11Y-40 ya está reservado en spec §18 para la prueba con lector de pantalla, por eso el salto de títulos es **A11Y-41**).
- Nombres que el plan consume, comprobados el 2026-10-01 sobre `main` 51c0024: `lib/browser-checks.mjs` (`runChecks(page)`, `inPage`, `textNodes`, `isDisabled`, `reflowFindings`), `lib/browser-run.mjs` (`BROWSER_RULES`, `measurePage`, `toEntries`), `lib/shot-plan.mjs` (anchos 1440, 375, 768, 320), `lib/ui-check.mjs` (paso 3 `intentional`, `measures` se agregan "como vienen"), `lib/rules/api.mjs` (`fail`, `pass`, `unverified`), `lib/css-walk.mjs` (`decls[i] { selector, atRules, property, value, line }`, `keyframes`), `lib/symptoms.mjs` (`checkSymptoms`, `mergeUserSymptoms`, `buildMenu`, `matchWords`), `lib/norms.mjs` (`judgmentIds` con `^- (J-\d{2}):`), `lib/design-doc.mjs` (el esquema ya trae `pignolo.motion.durationMs`, `pignolo.motion.easing` y `pignolo.targets { minPx, recommendedPx }`), `tests/rules-fixtures.test.mjs` (carpetas `pass-*`, `fail-*`, `unverified-*` con `expect.json`), `tests/evals/ui-cases.mjs` (`head()` y las páginas `clean1..3`, hoy sin exportar).
- Copiar la investigación al repo como `docs/research/2026-10-01-skills-de-diseno.md` (**hecho al escribir este plan**, sin rutas locales). Ver D-4e-2.

## Alcance

- **Adentro (DECIDIDA 2026-10-01: el hito chico completo, ≈ 9 tareas):** TARGET-01 y FORM-01 en el navegador; TYPE-01 y TYPE-02 medidos; salto de niveles de títulos (A11Y-41); chequeos estáticos de movimiento (MOTION-05, 06, 08, 09); carta del auditor con "cuándo aplica" y tope de 3 hallazgos de juicio (impuesto en `auditor-output`); síntomas nuevos de `improve` y la oferta del modo explorar; créditos (impeccable Apache-2.0, skills de Emil MIT); versión y CHANGELOG.
- **Condicional (DECIDIDA 2026-10-01):** las reglas de oficio de `ui-option` (investigación C1) **no se unen** hasta que el autor juzgue un A/B (≈ 8 USD aprobados, junto con E2). Su tarea (T8) depende del veredicto. El texto candidato está en el apéndice y como archivo aparte para correr el A/B ya.
- **Afuera:** movimiento generado en las opciones más allá de transiciones de estado (**DECIDIDA 2026-10-01: el movimiento entra solo como chequeo estático del auditor y de `ui-check`**; sin animaciones de entrada, gestos ni resortes); lista negra de fuentes y fondos crema; notas o calificaciones; personas; los 24 comandos de impeccable; el detector de impeccable como dependencia; texto de la skill Apple sin licencia (se cita la HIG oficial por enlace); el borde lateral de color en tarjetas (la investigación lo proponía como LAYOUT-xx; el autor no lo listó, queda como prosa de Craft 6); movimiento con scripts (JS), `@starting-style` y utilidades de Tailwind (`duration-*`, `ease-in`): no se miden, queda dicho en cada regla.

## Global Constraints

- **`DESIGN.md` y `intentional` ganan.** Una regla nueva de gusto (MOTION-05, 06, 08, 09, TYPE-01, TYPE-02) acepta `intentional`, nunca es `floor`, y calla cuando `DESIGN.md` decide otra cosa (valores declarados en `pignolo.motion.*` y `pignolo.targets`). Ninguna regla nueva prohíbe una fuente, un color de fondo o un estilo.
- **Una regla que un script puede comprobar le gana a la prosa.** Cada límite nuevo del auditor (tope de 3, condición de "cuándo aplica" presente en cada `J-nn`) es un test o un rechazo del validador, no solo texto de la carta.
- **Toda regla nueva tiene fixtures de pasa y de falla** (carpetas `tests/fixtures/rules/<ID>/` para las estáticas; páginas con `BROWSER_SKIP` visible para las de navegador) y su entrada en `catalog/rules.json` con `source` (WCAG con criterio, o enlace a la HIG de Apple, o "pignolo-ui spec", nunca un texto copiado).
- **Presupuesto de falsos positivos:** cada regla nueva muestra **0 hallazgos** sobre los fixtures limpios que ya existen: todas las carpetas `tests/fixtures/rules/*/pass-*`, `tests/fixtures/acceptance/next-shadcn` y las tres páginas `clean1..3` de `tests/evals/ui-cases.mjs`. Lo comprueba un test de aceptación (T7). Si una página limpia dispara una regla, primero se revisa si la regla está mal (excepciones, umbral); solo si la página tiene el defecto de verdad se corrige la página (R-4e-12).
- **Ninguna regla nueva bloquea.** Severidades: `alto`, `medio`, `detalle`; ninguna `floor`. Un test del catálogo lo hace cumplir.
- **Los chequeos de navegador no inundan:** un hallazgo por motivo y página (agregados con cuenta y el peor caso), salvo el `alto` de objetivo menor a 24 px, que es por elemento (R-4e-5).
- **Palabras propias.** Nada de texto ni de valores de impeccable, de las skills de Emil o de la skill Apple sin licencia; los umbrales numéricos son los de WCAG, de la HIG oficial (por enlace) o decisiones del autor. CREDITS.md lo declara.
- Hereda las restricciones del hito 4 (`docs/plans/2026-09-30-pignolo-ui-hito-4-flujos.md`, Global Constraints): sin red, temporales con `makeTempDir()`, fixtures sintéticos sin datos reales (repo público), nombres e ids en inglés, mensajes al usuario en español, commits en español con `git commit -F <archivo>` y los trailers de la sesión, LF sin BOM, un archivo de test por vez con `node --test --test-reporter=dot <archivo>` y la suite completa una vez por tarea cerrada.

## Método de ejecución

- **Rama:** `ui/hito-4e`, desde `main` (con `ui/auditor-juicio` ya unida). Worktree propio; cada tarea termina con su commit.
- **Olas (un ejecutor en serie):**
  1. **Ola 1, auditor (0.6.4):** T1. Después, la eval E2 la corre el controlador (≈ 4,4 USD) y recién ahí se une a `main`: arregla las páginas limpias y no depende de nada de lo demás.
  2. **Ola 2, navegador:** T2 → T3.
  3. **Ola 3, estáticas:** T4 → T5.
  4. **Ola 4, flujo y aceptación:** T6 → T7.
  5. **Ola 5, cierre:** T8 (solo con veredicto del autor) → T9 → revisión opus de lo que cambió desde `main` (T1 incluida, aunque ya esté unida), una pasada de arreglos, unión, versión 0.7.0.
- **Modelos:** sonnet para ejecutar; la revisión final en opus. Auditoría previa de este plan: no hace falta (no toca guardia, borrados ni respaldos); pero la revisión final mira con lupa los dos puntos de riesgo: falsos positivos (Review Focus 1) y que un chequeo nuevo no cambie el veredicto "terminado" de los flujos.
- **Tests:** ≈ 46 nuevos (24 bloques `test()` + 23 fixtures), sin red; los de navegador con `BROWSER_SKIP` (skip visible, nunca verde). Ver "Estimación".

## Review Focus (revisión final)

1. **Falsos positivos.** Cada regla nueva sobre los fixtures limpios y sobre una app real si el autor ya nombró una (D-4-4). Dueñas: T2, T3, T5, T7.
2. **El auditor no queda más ruidoso.** El tope de 3 y el "cuándo aplica" no tapan un defecto sembrado (`defect-j-01` sigue encontrado) ni abren una vía para saltar el validador. Dueña: T1.
3. **`DESIGN.md` y `intentional` mandan.** Calla con valores declarados; `intentional` aplica a las entradas del navegador sin tocar un `floor`. Dueñas: T3, T5.
4. **Nada de afirmar lo que no se midió.** Las reglas de navegador dicen en `measure` qué contaron; lo no medible (excepciones de 2.5.8 como "control equivalente", texto en imágenes) queda declarado, no verde. Dueñas: T2, T3.
5. **Licencias.** CREDITS.md y que nada copiado entre en el repo. Dueña: T9.

## Rulings del plan (técnicos, registrados)

- **R-4e-1: versiones y orden.** La ola 1 sube a **0.6.4** (cambio de contrato del auditor: tope y "cuándo aplica"); el cierre sube a **0.7.0** (catálogo 0.4.0: 9 reglas nuevas y un campo nuevo del diccionario de síntomas). Cada una con su entrada de CHANGELOG (sin eso, `/plugin update` no la toma).
- **R-4e-2: el tope se rechaza, no se recorta.** `validateFindings` suma el problema `judgment-cap` para cada hallazgo `J-nn` a partir del cuarto (por orden en la lista). Cuenta todo `J-nn`, con o sin medida y de cualquier severidad; los hallazgos de regla (`COLOR-03`…) no cuentan. Es coherente con `judgment-without-measure` (se devuelve al auditor, no se arregla en silencio). La carta le pide ordenar por efecto y parar en 3.
- **R-4e-3: lo que sigue siendo prosa.** Que el `why` de un juicio empiece con `Judgment:` cuando no cita una medida, y que cite el número cuando sí, va en la carta pero no se impone con un script (sería otro rechazo que cuesta una corrida de opus). Si las evals muestran deriva, se convierte en `judgment-unlabeled`.
- **R-4e-4: "cuándo aplica" vive en la línea del criterio.** Cada `- J-nn:` de `norms/base.md` termina con `Applies when: <condición>.`; el formato `^- (J-\d{2}):` que usa `judgmentIds` no cambia. Un test exige la frase en los 12. Si la condición no se cumple en la pantalla no hay hallazgo (no va ni a `notVerified`).
- **R-4e-5: TARGET-01.** Umbrales de la decisión D-UX-7: menor a 24 px → `alto` (WCAG 2.5.8 AA); menor a 44 px en ancho de celular (`≤ 480`) → `medio`. **No es `bloquea`** (el spec §5.4 decía que 2.5.8 bloqueaba bajo NAV-01): las excepciones de 2.5.8 solo se miden en parte, así que bloquear descansaría en una medida incompleta. Medidas que sí se aplican: se eximen los enlaces en línea dentro de texto, los deshabilitados y el control cuyo círculo de 24 px (centrado en su caja) no cruza a otro objetivo (excepción de espaciado, estricta: rozar no es cruzar); un checkbox o radio con `label` se mide con la caja unida del control y su etiqueta. No se miden "control equivalente" ni "esencial": límite declarado en el criterio. **Agregado:** el `alto` es un hallazgo por elemento; el `medio` de 44 px es **uno por ancho y tema** (`key: 'phone-targets'`, con cuenta, el menor y hasta 5 selectores), para que 40 enlaces de navegación no sean 40 hallazgos. `DESIGN.md` manda: `pignolo.targets.minPx` sube el mínimo (piso 24, nunca baja) y `recommendedPx` reemplaza los 44.
- **R-4e-6: FORM-01.** `input` (salvo `checkbox`, `radio`, `range`, `color`, `file`, `hidden` y los de botón), `select` y `textarea` visibles y habilitados con letra calculada menor a 16 px en ancho de celular → `medio`, por campo. Solo aplica con ancho ≤ 480: en otros anchos no hay entrada (no aplica, no es "pasó"). No acepta `intentional` (el zoom de iOS es funcional, no de gusto).
- **R-4e-7: TYPE-01 y TYPE-02, definiciones medibles.** Cuerpo = tamaño de letra más frecuente (por caracteres) entre los `p` y `li` visibles. Título = el primer `h1` visible. **TYPE-02:** razón título/cuerpo menor a 1,25 → `medio` (`measure { ratio, titlePx, bodyPx }`); sin `h1` o sin cuerpo → `unverified` con motivo. **TYPE-01**, tres motivos, una entrada por motivo y página: `line-length` (caracteres por renglón, = longitud del texto / cantidad de renglones, mayor a 80, en `p`, `li` y `blockquote` de más de 80 caracteres), `leading` (interlineado menor a 1,3 en `p` y `li` de 2 renglones o más; `normal` cuenta como 1,2) y `tiny-text` (texto visible menor a 12 px). Ambas aceptan `intentional` (son de gusto o de registro).
- **R-4e-8: `intentional` también para el navegador.** Hoy `runCheck` agrega las entradas de `browser.json` "como vienen". Se aplica el mismo paso 3 (reglas con `acceptsIntentional` y sin `floor`, con la lista ya validada) a esas entradas. Es el único cambio de `ui-check.mjs`; es la tarea cortable T3-b.
- **R-4e-9: reglas de movimiento estáticas (CSS y `<style>`).** Sobre `ctx.css.decls`. Se ignoran los valores con `var()` o `calc()`. **MOTION-05** (`medio`): duración de `transition`/`transition-duration` fuera del conjunto de `pignolo.motion.durationMs` cuando `DESIGN.md` lo declara; sin ese bloque, solo la duración mayor a 500 ms en un selector de control (`button`, `a`, `input`, `select`, `textarea`, `summary`, `[role=…]`, clases `btn*`, o con `:hover`, `:focus`, `:active`). **MOTION-06** (`detalle`): `ease-in` a secas en un selector de control, o `cubic-bezier(a,b,c,d)` con `b` o `d` fuera de 0 a 1 (rebote); **calla si `DESIGN.md` declara `pignolo.motion.easing`**. **MOTION-08** (`medio`): `transition`/`transition-property` o pasos de `@keyframes` sobre `width`, `height`, `top`, `left`, `right`, `bottom`, `margin*`, `padding*` (`all` sigue siendo MOTION-04). **MOTION-09** (`detalle`): `transform`, `scale`, `translate` o `rotate` en una regla con `:hover` fuera de `@media (hover: hover)` o `(any-hover: hover)`. Las utilidades de Tailwind no se miden (v4 ya envuelve `hover:`); el criterio del catálogo lo dice.
- **R-4e-10: A11Y-41 solo sobre HTML renderizado o escrito.** El runner ya llama `checkFile` solo en documentos (`ctx.isDocument`). Un salto es un encabezado cuyo nivel es mayor al del anterior más 1 (`h1` → `h3`, y también `h2` → `h4` tras un `h3`); bajar de nivel no es salto; empezar en `h2` sin `h1` no es de esta regla. Se ignoran los de `aria-hidden`. Un archivo JSX con encabezados literales sale `unverified` ("los niveles se componen al renderizar; mirar el DOM"), nunca verde. `medio`, acepta `intentional`: **no** (1.3.1 es de estructura, no de gusto).
- **R-4e-11: síntomas.** 11 síntomas nuevos (tabla en T6). Los de gusto sin regla llevan `rules: []` y un campo nuevo `offer: "explore"` (solo ese valor). **"Sosa / aburrida / le falta onda" ofrece el modo explorar y no genera versiones dentro del sistema de diseño** (**DECIDIDA 2026-10-01**). El modo explorar no tenía texto en ninguna parte (la investigación lo avisa): ver D-4e-1.
- **R-4e-12: páginas limpias de las evals.** Las tres páginas `clean1..3` son "limpias" para el piso, no para los chequeos nuevos: sus `input` miden ≈ 42 px de alto (menos de 44 en celular) y los enlaces de `clean3` son cajas en línea de ≈ 18 px de alto. Eso es un defecto real según TARGET-01, y el auditor lo citaría (toda entrada `fail` es un hallazgo) y rompería el grader `no-false-positive-judgment`. **No se relaja el grader ni la regla:** se corrige el CSS de `head()` en `ui-cases.mjs` (alto mínimo de 44 px en `input` y `button`, enlaces de lista como bloque con relleno). Cambia el SHA de las páginas; queda en RESULTS. Ver D-4e-3 por el costo de repetir las evals.
- **R-4e-13: citas de Apple.** `source` de TARGET-01 enlaza a la HIG oficial (https://developer.apple.com/design/human-interface-guidelines/) para los 44 pt, sin texto copiado; nada de la skill sin licencia entra al repo.
- **R-4e-14: ids.** Nuevos: TARGET-01, FORM-01, TYPE-01, TYPE-02 (clase `browser`, checker `browser`), A11Y-41, MOTION-05, MOTION-06, MOTION-08, MOTION-09 (clase `script`, checker `ui-check`). `catalogVersion` 0.3.0 → 0.4.0. Las reglas estáticas ganan fixtures `tests/fixtures/rules/<ID>/…`; `rules-fixtures.test.mjs` las recorre solo.

## Decisiones del autor

Decididas el 2026-10-01 (vigentes): ver el listado en "Alcance" y los rulings marcados DECIDIDA. Resumen: hito chico completo; TARGET-01 con 24 px `alto` y 44 px celular `medio`; TYPE-01/02, saltos de títulos y FORM-01; movimiento solo como chequeo estático; síntomas nuevos; auditor con "cuándo aplica", `medio` por defecto y tope de 3 por pantalla impuesto en `auditor-output`; reglas de gusto solo `detalle` o `medio`, con `intentional` y calladas si `DESIGN.md` decide (sin listas negras de fuentes); "sosa" ofrece el modo explorar; nada copiado de la skill Apple sin licencia; créditos de impeccable (Apache-2.0) y de Emil Kowalski (MIT); reglas de Craft de `ui-option` solo tras el A/B juzgado por el autor.

Nuevas, **pendientes del autor**:

- **D-4e-1: qué es "el modo explorar".** No existe en el spec ni en las skills. **Recomendación:** definirlo como la ronda de style tiles de `new` (§7 paso 0, "direcciones nuevas solo si el usuario las pide") aplicada al proyecto existente: N direcciones, el usuario elige o combina, los tokens elegidos pasan a `DESIGN.md` como diff (`design-md.mjs patch`) y `improve` vuelve a empezar con el `DESIGN.md` nuevo. Es lo más simple: no agrega flujo ni agente. T6 escribe esa oferta en la skill `improve` en una línea; si el autor prefiere otra cosa, solo cambia ese texto.
- **D-4e-2: la investigación en el repo público.** Copia textual (sin rutas locales) de `docs/research/2026-10-01-skills-de-diseno.md`; incluye varias citas cortas (dos líneas como máximo) de la skill Apple sin licencia (sección A3). Es tema legal. **Recomendación:** reemplazarlas por paráfrasis antes de unir; no cuesta nada y cierra el tema. Mientras no decida, la rama no se une.
- **D-4e-3: costo de las evals.** Aprobados ≈ 8 USD (E1 ≈ 3 a 4 de opciones + E2 ≈ 4,4 del auditor). Si T7 corrige las páginas limpias (probable, R-4e-12), conviene repetir las 3 de las páginas limpias × 5 corridas (≈ 4,4 USD más) para confirmar que el auditor sigue sin hallazgos nuevos con los chequeos nuevos activos. **Recomendación:** aprobar ese extra solo si T7 cambió las páginas; total ≈ 12 a 13 USD.
- **D-4e-4: medir en una app real antes de 0.7.0.** El presupuesto de falsos positivos se prueba con fixtures; una app real puede dar más ruido (TARGET-01 en menús, TYPE-01 en tablas). Sigue pendiente D-4-4 (nombrar una app y su URL). **Recomendación:** correr `measure` con las reglas nuevas sobre esa app antes de publicar 0.7.0 y bajar a `detalle` o cortar lo que dé más de ≈ 10 entradas por pantalla; sin app nombrada, publicar igual con el límite declarado en el CHANGELOG.

## Tarjetas

### Task 0: preparación (sin código)

- [ ] Comprobar los prerrequisitos de arriba (`git grep` de ids; `ui/auditor-juicio` unida; nombres existentes). Crear `ui/hito-4e` y su worktree.
- [ ] Verificar que `docs/research/2026-10-01-skills-de-diseno.md` está (ya copiada) y que no tiene rutas absolutas del usuario (`git grep -n "C:\\\\\|pigna"` sin resultados).
- [ ] Sin commit propio si no cambia nada.

### Task 1 (ola 1): auditor con "cuándo aplica", `medio` por defecto y tope de 3

**Files:**
- Modify: `plugins/pignolo-ui/norms/base.md`, `agents/ui-auditor.md`, `lib/auditor-output.mjs`, `.claude-plugin/plugin.json` (0.6.4), `CHANGELOG.md`
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

- `agents/ui-auditor.md` (sección Rules), líneas nuevas: un `J-nn` solo existe si su "Applies when" se cumple en esta pantalla; como mucho 3 por pantalla, los de más efecto, y el validador rechaza el cuarto; sin medida, el `why` empieza con `Judgment:`; con medida, cita el número. Se conserva la línea de `ui-auditor` ya unida (`medio` o `detalle` por defecto; `alto` solo con entrada `fail`).

**Tests literales:**
- [ ] `norms.test.mjs`: las 12 líneas `- J-nn:` de `norms/base.md` contienen `Applies when:` (rojo: hoy ninguna). Guarda de regresión: `judgmentIds(base)` sigue devolviendo `J-01…J-12` en orden con el formato nuevo.
- [ ] `auditor-output.test.mjs`: tres `J-nn` `medio` con evidencia `file` → sin problemas (guarda del límite). Cuatro `J-nn` → `judgment-cap` solo en el índice 3. Cinco → `judgment-cap` en 3 y 4. Cuatro hallazgos de regla (`COLOR-03` con huella `fail`) más tres `J-nn` → sin `judgment-cap` (los de regla no cuentan). Cuatro `J-nn`, uno `alto` con huella `fail` de `ui-check`, → igual `judgment-cap` en el cuarto (la medida no exime del tope). Rojo: contra el validador sin el tope los cuatro casos de falla pasan.
- [ ] `agents.test.mjs`: la carta de `ui-auditor` contiene `Applies when`, `at most 3` y `Judgment:`, y conserva `No self-grade` y `never `bloquea` without script or browser evidence`.
- [ ] Commit: `feat(pignolo-ui): criterios de juicio con condición de aplicación y tope de 3 hallazgos (0.6.4)`. **Después: E2 (controlador), antes de unir.**

### Task 2 (ola 2): TARGET-01 y FORM-01 en el navegador

**Files:**
- Modify: `lib/browser-checks.mjs`, `lib/browser-run.mjs` (`BROWSER_RULES` suma los 4 ids nuevos de navegador de las tareas 2 y 3), `scripts/browser.mjs` (pasa `targets` leído de `--design`), `catalog/rules.json`, `tests/catalog.test.mjs`
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
- Constantes exportadas: `MIN_TITLE_BODY_RATIO = 1.25`, `MAX_LINE_CHARS = 80`, `MIN_LEADING = 1.3`, `MIN_TEXT_PX = 12`.
- Página: `collectType()` → `{ title: { selector, fontSize } | null, body: { fontSize } | null, blocks: [{ selector, chars, lines, leading, fontSize }], tiny: [{ selector, fontSize }] }` (usa `textNodes()`; `lines` por la altura del bloque sobre el interlineado usado; `leading` = interlineado calculado / `fontSize`, con 1,2 si es `normal`).
- Node: `typeFindings(data, { width }) → raw[]`: TYPE-02 una entrada (`fail`, `unverified` o `pass`); TYPE-01 una entrada por motivo con `key` `line-length`, `leading`, `tiny-text` y `measure { count, worst: { selector, value }, threshold }`.
- Catálogo: TYPE-01 y TYPE-02, clase `browser`, `medio`, `acceptsIntentional: true`, `source: "pignolo-ui (decisión del autor 2026-10-01); WCAG 2.2 SC 1.4.8 (AAA, orientación) para el largo de renglón"`.
- **T3-b (cortable, R-4e-8):** en `runCheck`, el paso 3 de `intentional` se factoriza en una función que se aplica también a `measures.entries` (mismas condiciones: regla con `acceptsIntentional`, sin `floor`, lista validada).

**Tests literales:**
- [ ] `typeFindings` (puro): título 30 px / cuerpo 24 px (1,25) → `pass`; 29,9 / 24 → `fail medio` con `measure.ratio`; sin `h1` → `unverified` con motivo; renglón de 81 caracteres → `line-length`, de 80 → no; interlineado 1,29 en un párrafo de 3 renglones → `leading`, 1,3 → no, 1,2 en uno de 1 renglón → no; 11 px → `tiny-text`, 12 px → no; 7 párrafos largos → **una** entrada `line-length` con `count: 7`.
- [ ] En el navegador (`{ skip }`): una página con un párrafo de 200 caracteres en una sola línea ancha a 1440 → `line-length`; una con `h1` y cuerpo del mismo tamaño → `TYPE-02`.
- [ ] `ui-check-measures` (T3-b): una entrada `TYPE-02 fail` en `browser.json` con `pignolo.intentional: [{ id: TYPE-02, why }]` en `DESIGN.md` → pasa con `reason: 'intentional: …'`; la misma con `TARGET-01 alto` y `intentional` de TARGET-01 → sigue en `fail` (no acepta); sin `DESIGN.md` → sin cambios (guarda de regresión). Rojo: sin T3-b la primera sigue en `fail`.
- [ ] Commit: `feat(pignolo-ui): TYPE-01 y TYPE-02 medidos y intentional para las entradas del navegador`.

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

### Task 6 (ola 4): síntomas nuevos de `improve` y oferta del modo explorar

**Files:**
- Modify: `catalog/symptoms.json`, `lib/symptoms.mjs`, `skills/improve/SKILL.md` (±2 líneas; límite del linter 12 000 caracteres, hoy 5 758)
- Test: `tests/symptoms.test.mjs`, `tests/skill-improve.test.mjs`

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
| `bland` | sosa, aburrida, le falta onda | (ninguna; `offer: explore`) | Not fixable inside the design system: offer the explore mode |

(11 filas: la investigación traía 10 y `flat-type` suma TYPE-02, que sin síntoma no se le ofrece a nadie.)

`skills/improve/SKILL.md`, paso 3: si el usuario elige un síntoma con `offer: explore`, el hilo principal dice que eso no se arregla dentro de `DESIGN.md` y **ofrece** el modo explorar (D-4e-1: la ronda de style tiles de `new` §7 paso 0, a pedido) en lugar de generar versiones para ese síntoma; el resto de lo elegido sigue su camino.

**Tests literales:**
- [ ] `symptoms.test`: el diccionario real pasa `checkSymptoms` con el catálogo real y `judgmentIds` (todas las reglas existen: exige T2 a T5 hechas); `checkSymptoms` rechaza `offer: 'other'` y un síntoma con `rules: []` sin `offer`; `mergeUserSymptoms` conserva `offer`.
- [ ] `matchWords("me cuesta tocar los botones")` → `['hard-to-tap']`; `matchWords("queda marcado despues de tocar")` (sin tilde) → `['sticky-hover']`; `buildMenu` marca `hard-to-tap` pre-tildado con `failedIds: ['TARGET-01']` y `bland` con `offer: 'explore'` sin pretildar. Rojo: sin `offer` en `buildMenu` el último falla.
- [ ] `skill-improve.test`: el texto del paso 3 contiene `explore` y `style tile` y dice que no se generan versiones para ese síntoma.
- [ ] Commit: `feat(pignolo-ui): síntomas nuevos de improve y oferta del modo explorar`.

### Task 7 (ola 4): aceptación y presupuesto de falsos positivos

**Files:**
- Modify: `tests/evals/ui-cases.mjs` (exporta `PAGES`; corrige el CSS de `head()` si la sonda lo pide, R-4e-12)
- Create: `tests/hito-4e-acceptance.test.mjs`

**Pasos:**
- [ ] **Sonda primero (sin cambiar nada):** correr `measure` real (con navegador) sobre `clean1..3` y mirar qué entradas nuevas dan. Esperado: TARGET-01 `phone-targets` en las tres (inputs de ≈ 42 px) y `alto` en los enlaces de `clean3`. Si la sonda no puede correr (sin navegador), se declara "no verificado" y T7 deja el test con skip visible; **no** se corrige a ciegas.
- [ ] Si la sonda da hallazgos: revisar primero si es la regla (excepción, umbral) y solo si el defecto es real corregir `head()` (alto mínimo de 44 px en `input` y `button`; `ul li a{display:inline-block;padding:10px 0}`), volver a sondar hasta 0 y anotar el SHA nuevo.

**Tests literales:**
- [ ] Presupuesto estático: `runCheck` sobre cada carpeta `tests/fixtures/rules/*/pass-*` y sobre `tests/fixtures/acceptance/next-shadcn` → ninguna entrada `fail` de A11Y-41, MOTION-05, 06, 08, 09 (un caso por carpeta; si una falla, se revisa la regla antes que el fixture).
- [ ] Presupuesto de navegador (`{ skip }`): `measure` sobre `clean1..3` a 320, 375 y 1440 → ninguna entrada `fail` de TARGET-01, FORM-01, TYPE-01, TYPE-02. Rojo: con el CSS viejo de `head()` falla (guarda de que el presupuesto muerde).
- [ ] Catálogo: ninguna de las 9 reglas nuevas es `bloquea` ni `floor`, y las 6 de gusto (MOTION-05, 06, 08, 09, TYPE-01, TYPE-02) aceptan `intentional`. De punta a punta (`{ skip }`): `browser.mjs measure` sobre una página con un botón de 20×20 pegado a otro + `ui-check --measures` → `ui-check.json` con TARGET-01 `alto` y **exit 0** (no bloquea).
- [ ] Commit: `test(pignolo-ui): aceptación del hito 4e y presupuesto de falsos positivos`.

### Task 8 (ola 5, condicional): reglas de Craft de `ui-option`

**Solo si el autor juzga el A/B a favor** (E1: carta de hoy contra carta candidata, mismo brief que `tests/evals/RESULTS-lienzo.md`, a ciegas). Criterio de adopción de la investigación: la candidata gana en al menos 2 de 3 tandas, no sube las fallas de script y no sube el costo más de 10 %. El veredicto puede ser total, parcial (solo algunas reglas) o negativo.

**Files:** Modify `agents/ui-option.md` (sección `# Craft`, las reglas 9 a 13 del apéndice, o las que el autor deje), `tests/option-craft.test.mjs`; documentar el A/B en `docs/benchmarks.md` (sección nueva, **sea cual sea el veredicto**).

**Tests literales:**
- [ ] `option-craft.test.mjs`: la lista de frases obligatorias suma `visible rest, focus and pressed`, `above a heading`, `1.25 times`, `one place` y `prefers-reduced-motion`, `hover: hover`; el límite `<= 20` líneas de la sección sigue; las reglas duras (`tools: Write`, `data-primary="true"`, `Datos de ejemplo`) sobreviven. Rojo: contra la carta de hoy las frases nuevas faltan.
- [ ] Con veredicto negativo no hay tests ni cambio de carta; solo la fila de `docs/benchmarks.md` ("no adoptada") y una línea en el CHANGELOG.
- [ ] Commit: `feat(pignolo-ui): reglas de oficio de ui-option tras el A/B del autor` (o `docs(benchmarks): A/B de la carta de ui-option, sin adoptar`).

### Task 9 (ola 5): créditos, versión, CHANGELOG

**Files:** Modify `CREDITS.md`, `.claude-plugin/plugin.json` (0.7.0), `CHANGELOG.md`; Create `tests/credits.test.mjs`.

**Contenido:**
- `CREDITS.md`, en la lista de fuentes de ideas, con palabras propias y la aclaración "no se copió código ni texto": **impeccable** (Paul Bakaus, https://github.com/pbakaus/impeccable, Apache-2.0, consultado el 2026-10-01, commit `4adabaf`): ideas para los chequeos de tipografía y de objetivos y para limitar los hallazgos de juicio; **skills de Emil Kowalski** (https://github.com/emilkowalski/skills, MIT, consultado el 2026-10-01, commit `d16ebe6`): ideas para los chequeos de movimiento y de campos de 16 px; **Apple Human Interface Guidelines** (https://developer.apple.com/design/human-interface-guidelines/): solo el enlace, para el objetivo táctil de 44 pt; **WCAG 2.2** SC 2.5.8 y 1.3.1. La skill Apple sin licencia no se nombra ni se copia nada.
- `CHANGELOG.md`: entrada **0.7.0** (reglas nuevas con sus ids, catálogo 0.4.0, `offer` del diccionario, `intentional` para el navegador, límites declarados: sin medir excepciones "equivalente" y "esencial" de 2.5.8, sin utilidades de Tailwind, sin movimiento por scripts) y, si no estaba, la **0.6.4** de la ola 1.

**Tests literales:**
- [ ] `credits.test.mjs`: `CREDITS.md` contiene `impeccable`, `Apache-2.0`, `emilkowalski/skills`, `MIT`, `developer.apple.com/design/human-interface-guidelines` y `no se copió`, y no contiene el nombre del repo de la skill sin licencia (`dickwu`).
- [ ] `manifest.test.mjs` (existente, sin cambios): la versión sigue siendo semver; el test de versión del plugin pasa con 0.7.0.
- [ ] Commit: `docs(pignolo-ui): créditos, CHANGELOG y versión 0.7.0 del hito 4e`.

## Cambios de spec que necesita el plan (a aprobar y editar al cerrar el hito; este plan no edita el spec)

1. **§5.4, nota bajo la tabla de navegador** (línea "NAV-01 bloquea solo en su parte de teclado… y de objetivo de 24 px"): el objetivo de 24 px pasa a **TARGET-01**, `alto` (no `bloquea`), con las excepciones medidas y las no medidas declaradas; NAV-01 queda solo con teclado.
2. **§5.4, tabla de navegador:** "4 chequeos propios" pasa a **6**: B5 (objetivos y campos: TARGET-01, FORM-01) y B6 (tipografía: TYPE-01, TYPE-02), con severidad `alto`/`medio` y el agregado por ancho.
3. **§5.4, tabla de `ui-check`:** cinco filas nuevas (A11Y-41, MOTION-05, 06, 08, 09). Los conteos pasan de "25 reglas con checker" a 30 más 8 de navegador (4 + 4); §5.1 y `catalogVersion` 0.4.0.
4. **§4.3:** una frase: `pignolo.motion.durationMs`, `pignolo.motion.easing` y `pignolo.targets` los consumen MOTION-05, MOTION-06 y TARGET-01 (hasta hoy nadie los leía).
5. **§5.7 y §8 paso 3:** el diccionario suma el campo `offer: "explore"`; de 11 a 22 síntomas; el modo explorar queda definido (D-4e-1).
6. **§5.5:** `intentional` también se aplica a las entradas de `browser.json` (R-4e-8).
7. **§10:** "como mucho 3 hallazgos de juicio por pantalla (`judgment-cap`); cada criterio `J-nn` dice cuándo aplica (`norms/base.md`)".
8. **§7.4 (Carta de oficio):** solo si el A/B da el visto bueno, las reglas 9 a 13.
9. **§18:** sacar "objetivo de 24 px con checker (NAV-01, 2.5.8)" de los candidatos a v1.1 (queda hecho como TARGET-01); agregar a "fuera de alcance" el movimiento por scripts y las utilidades de Tailwind.

## Estimación

| Tarea | Tests |
|---|---|
| T1 auditor | 4 bloques (≈ 8 casos) |
| T2 TARGET-01 y FORM-01 | 3 bloques (≈ 16 casos) |
| T3 TYPE y `intentional` de navegador | 3 bloques (el tercero es T3-b) |
| T4 A11Y-41 | 2 + 6 fixtures |
| T5 movimiento | 1 + 17 fixtures |
| T6 síntomas | 4 |
| T7 aceptación | 4 |
| T8 carta (condicional) | 1 |
| T9 créditos | 1 |

Cuenta de casos de test (cada fixture y cada fila de tabla cuenta): **≈ 46 contando cada fixture como un test** (24 bloques + 23 carpetas de fixtures; la investigación estimaba ≈ 35; la diferencia son el presupuesto de falsos positivos, `intentional` en navegador y las funciones puras, que además llevan muchos casos por bloque). Código: ≈ 600 líneas de lib, ≈ 700 de test. Una ejecución sonnet en serie ≈ 1,5 a 2 horas de pared.

## Impacto en las evals y costo

- **E2 (auditor), tras la ola 1:** `ui-auditor-clean-2`, `ui-auditor-clean-3` y `ui-auditor-defect-j-01`, 5 corridas cada una, con `--tag auditor` filtrado por caso. Pasa si las páginas limpias llegan a 4 de 5 sin hallazgos `alto` y `defect-j-01` sigue hallando el defecto sembrado (que el tope no tape lo real). ≈ 15 × 0,29 = **4,4 USD** (dato de `RESULTS-ui-hito-4.md`: 0,28 a 0,31 USD por corrida del auditor). Se mide con los graders de hoy, sin tocarlos. Va a `docs/benchmarks.md` con costo, velocidad y calidad.
- **E1 (opciones), en paralelo, ya:** carta de hoy contra `ui-option-candidate.md`, mismo `MOCKUP_BRIEF`, sonnet y opus, 3 corridas por brazo, orden a ciegas por el autor. ≈ **3 a 4 USD** (estimación, no medición: opus sin dato en USD). Condiciona T8.
- **Tras T7 (D-4e-3):** si las páginas limpias cambiaron, repetir `clean-1..3` × 5 (≈ 4,4 USD) para confirmar 4 de 5 con los chequeos activos. Los casos con defecto sembrado no cambian de grader; sus páginas no se tocan.
- **Tests de agentes que se ven afectados:** `eval-ui-cases.test.mjs` (el SHA de las páginas, si cambian) y `agents.test.mjs`.
- **Total aprobado ≈ 8 USD; con D-4e-3 ≈ 12 a 13 USD.**

## Qué se corta primero (en este orden, si hay que recortar)

1. T8 (condicional; si el autor no juzga el A/B, no entra).
2. MOTION-09 y MOTION-06 (`detalle`, de gusto, el menor valor de la investigación).
3. T3-b (`intentional` para el navegador): TYPE-01 y TYPE-02 pasan a `acceptsIntentional: false` y T3 pierde 3 tests.
4. FORM-01.
5. TYPE-01 (se queda TYPE-02, que le da medida a J-02).
6. MOTION-05 y MOTION-08.
7. A11Y-41.

**No se corta nunca:** T1 (auditor), TARGET-01 y T6 (síntomas) con T7 y T9: son lo de mayor valor según la investigación (≈ 3 tareas, ≈ 11 tests, más E2). El resto es cortable sin romper contratos: cada regla es un elemento del catálogo con su checker y su fixture.

## Apéndice: carta candidata de `ui-option` (reglas de oficio a agregar, investigación C1, palabras propias)

La carta completa (la de `main` más estas cinco reglas) está en el archivo de trabajo `ui-option-candidate.md` del controlador (no versionado) para correr E1 ya. Las reglas se suman a la sección `# Craft` después de la 8:

9. Show states: every interactive control has a visible rest, focus and pressed style; when the screen has a list or a form, also draw the empty or error state the brief describes, as a visible sample block.
10. Keep a spacing rhythm: tight inside a group, generous between groups, and more space above a heading than below it.
11. Make the type scale visible: each level at least 1.25 times the previous one, running text in lines of 45 to 75 characters, and hierarchy carried by weight as well as size.
12. Spend emphasis in one place: the accent color goes to the main action and to state; everything else stays neutral.
13. Move only to show state: hover, focus and pressed transitions on a named property (never `all`), 100 to 200 ms, switched off under `@media (prefers-reduced-motion: reduce)`, and hover effects only inside `@media (hover: hover)`. No entrance animations.

`DESIGN.md` y sus `intentional` siguen ganando (ya lo dice la sección "Patterns to avoid"). La sección `# Craft` queda en 13 líneas, dentro del límite de 20 que verifica `option-craft.test.mjs`. Cada regla se gana el lugar en la medición: la carta mejorada anterior no cambió la preferencia del autor (`tests/evals/RESULTS-lienzo.md`).
