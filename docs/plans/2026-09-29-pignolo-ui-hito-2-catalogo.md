# pignolo-ui v1 — Hito 2a: catálogo verificado y checker (`ui-check`). Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, worktrees creadas a mano, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo-ui tenga su checker determinista `ui-check`: el catálogo completo de las reglas con checker de la v1, cada una trazada a su fuente, con un fixture sintético en verde y otro en rojo, el alcance "solo bloquea lo nuevo en lo tocado", los rechazos traducidos como piso y la salida `ui-check.json` con códigos 0/1/2. Antes, los arreglos que el hito 1 dejó para el comienzo de este hito.

**Arquitectura:** `catalog/rules.json` es la fuente única (spec §5.1). Unos lectores sin dependencias (`strip-comments`, `route`, `markup`, `css-walk`, `utility-classes`) convierten cada archivo en estructuras. Un runner (`lib/ui-check.mjs`) arma el contexto (archivo, DOM o proyecto), llama a los módulos de reglas de `lib/rules/*.mjs` con un contrato fijo, calcula severidad, alcance e `intentional`, y escribe `<run>/ui-check.json`. `scripts/ui-check.mjs` es una CLI fina. Cada grupo de reglas vive en su propio módulo y en su propia carpeta de fixtures, así los grupos se construyen en paralelo sin tocar los mismos archivos.

**Stack:** Node ≥ 22 para pignolo-ui (spec A-12), ESM `.mjs`, `node:test` + `node:assert/strict`, sin dependencias npm.

**Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md`: §1 (principios 1 y 5), §3.3 (aprobados como mockup), §4.1 (piso), §4.3 (`intentional`, `rejections`, `cssVars`), §4.5 (pares de contraste, `cssVars`), §5.1–§5.6, §16.1 y §17, hito 2.

**Prerrequisito:** el hito 1 de pignolo-ui está en `main` (`2f4894a` y siguientes): existen `lib/{yaml-subset,color,token-sources,design-doc,design-patch,design-extract,official-lint,run-folder,leak-check,approved}.mjs`, `scripts/design-md.mjs` y `catalog/rules.json` semilla (26 reglas).

## Alcance y partición del hito 2

§17 asigna al hito 2: `rules.json` completo, `route`, `strip-comments`, `ui-check` (25 reglas, alcance y SEO), `files` y `report-check`. Es demasiado para un plan con olas de archivos disjuntos y una sola revisión final, así que se parte en dos (decisión técnica, registrada en Rulings):

- **Hito 2a (este plan, completo):** arreglos diferidos del hito 1, lectores, catálogo completo menos SEO, runner y CLI de `ui-check`, las 25 reglas con checker de §5.4, alcance (`--base`, multiconjunto) y rechazos (§5.6).
- **Hito 2b (esbozo al final; se escribe completo cuando 2a esté unido):** los 7 ids de SEO estático (§5.4), `scripts/files.mjs` (`save | verify | restore` y delta de §9) y `scripts/report-check.mjs` (§12).

Quedan fuera de 2a y de 2b: B1–B4 y `--measures` (hito 3), las ~125 reglas de guía (pregunta para el plan del hito 4), las líneas del diff multi-op y el frontmatter de skills (antes del hito 4) y `!important` al escribir tokens (antes de §9, hito 4).

## Global Constraints

- **Sin dependencias npm, sin hooks, sin binarios y sin nada remoto en tiempo de ejecución** (spec §0). Imports solo `node:` o relativos con extensión; los `.json` se leen con `fs` (sin `import ... with`). El linter del plugin (`tests/lint-plugin.test.mjs`) lo hace cumplir.
- **Node ≥ 22 para pignolo-ui** (A-12). Ningún `spawn` con shell: git se llama con `execFileSync('git', [...], { cwd, timeout })` y los scripts con `process.execPath`.
- **Nunca "no corrió" = "pasó"** (principio 1): cada regla aplicable a cada archivo deja al menos una entrada `pass | fail | unverified` con motivo. Un valor sin resolver (JSX dinámico, componente propio, spread, clase armada con variables, color no soportado) es `unverified`, nunca `pass` ni `fail`.
- **Salida** (§5.5): `<run>/ui-check.json` con `catalogVersion`, `inputs` (`{ file, sha256 }`), `base` (ref o `null`) y `entries`; cada entrada `{ id, status, reason?, severity, scope, file?, line?, selector?, fingerprint, measure? }`. La huella nunca lleva número de línea.
- **Códigos de salida** (§5.3): `0` ningún `fail` con `severity: bloquea` y `scope: new`; `1` al menos uno; `2` error propio, que cuenta como "no verificado". Los `unverified` no cambian el código: se listan como pendientes.
- **Idioma:** ids, claves, `reason` y comentarios del código en inglés; lo que sale por stderr para la persona, en español y sin stack (salvo "error interno"). Commits en español, Conventional Commits.
- **Archivos nuevos en LF y sin BOM.** Nunca el carácter U+FEFF literal en el código: siempre su escape; después de escribir un archivo, buscar U+FEFF y reemplazarlo. Los archivos que se leen conservan su fin de línea: los números de línea se cuentan igual con CRLF que con LF y con BOM que sin él.
- **Fixtures sintéticos**, sin datos de ningún proyecto real, personas ni credenciales (el repo es público). Las cifras de la app real del spec (§4.3, §5.5, §16.2) solo inspiran casos: 177 `rounded-[Npx]`, 6 `transition-all`, 8 `outline-none`, pares oscuros de 4,25:1 y 3,36:1, combobox sin nombre.
- **Tests** siempre con `npm test`, `npm run test:quiet` o `npm run test:ui`; nunca `node --test tests/`. Un implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>` y, para el arnés de fixtures, `--test-name-pattern "rule (ID1|ID2) "`. Sin red.
- **Commits:** mensaje escrito con la herramienta de escritura en un archivo y `git commit -F <archivo>` (nunca texto con backticks o `$(...)` entre comillas dobles de la shell), con los trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01CW6KRFJq1CGFSLLNq2N6Vb`.
- **Plan en tarjetas, no en código final.** Los bloques y firmas son hipótesis hasta ejecutarlos; lo que fija el plan son interfaces, casos de test y valores literales. Todo test nuevo se ve en rojo una vez (contra el código ausente o el stub); romper el código para volver a verlo solo hace falta en un test agregado después del código.

## Método de ejecución y economía de tests

Igual que en el hito 2 del núcleo (`docs/plans/2026-09-29-hito-2-agentes-perfiles-setup.md`), que el autor aprobó; registrado en Rulings:

- **Rama base:** `ui/hito-2a`, desde `main`. Al terminar cada ola se une a `ui/hito-2a` y la suite completa (`npm run test:quiet`) corre **una vez**.
- **Olas:**
  - **Ola 0:** Task 1 ∥ Task 2 (archivos disjuntos).
  - **Ola 1:** Task 3, serial: produce el contrato de reglas, el runner, la CLI y los stubs.
  - **Ola 2:** Tasks 4 a 11 en paralelo (8 tareas, archivos disjuntos). Si el tope de subagentes simultáneos es menor, en dos tandas: 4–7 y 8–11.
  - **Ola 3:** Task 12, unión, pruebas transversales, docs y revisión final.
- **Worktrees creadas a mano** (las de `isolation: worktree` nacen de la rama por defecto y no tendrían el commit de la ola anterior): `git worktree add -b task/ui-2a/<NN> <scratchpad>/wt-<NN> ui/hito-2a`. El implementador edita con rutas absolutas dentro de su worktree y corre cada comando como `cd <ruta> && <comando>`. Su primer paso es `git merge-base --is-ancestor <sha de la ola anterior> HEAD`; si falla, responde `BLOCKED`.
- **Despacho:** subagentes en background, cada uno con su brief en un archivo y su informe en otro, para que los informes no inflen el contexto del orquestador.
- **Modelos:** implementadores en sonnet (las tarjetas traen interfaces y casos literales). **Sin revisión por tarea.** Una sola revisión final opus de `main..ui/hito-2a`, una pasada de arreglos y una confirmación acotada; lo que quede se clasifica (tope del hito 1).
- **Tests que valen lo que cuestan:**
  - Cada test protege un comportamiento del spec o un ruling de este plan; nada de snapshots de texto libre.
  - Tests de tabla: un subtest por regla y caso (`rule <ID> <caso>`), así cada tarea verifica solo lo suyo con `--test-name-pattern`.
  - Las reglas se prueban **en proceso** con `runCheck` del runner; por la CLI (subproceso) corren solo los tests de la Task 3 y los transversales de la Task 12.
  - En el informe se pega el resumen del reporter `dot`, nunca la salida TAP.

## Review Focus

1. **Falsos `bloquea` en código real.** Un `layout.tsx` de Next.js App Router tiene `<html lang>` pero el `<title>` sale de `export const metadata` y el `<main>` está en otra página: A11Y-02 y A11Y-05 dan `unverified`, nunca `fail` (Task 4). `<Button>` y `className={cn("…", className)}` de shadcn dan `unverified` donde el resultado depende de lo dinámico (Tasks 5 y 7). Lo prueba además el caso realista de la Task 12.
2. **`unverified` nunca se confunde con `pass` ni desaparece.** El arnés de fixtures exige al menos un `pass` y ningún `fail` en los casos `pass-*`, y un `unverified` los hace fallar salvo que su motivo esté permitido de forma explícita en `expect.json` (`allowUnverified`), y la Task 3 verifica que cada regla aplicable deja una entrada por archivo.
3. **Alcance.** Una línea movida sigue siendo deuda; un par duplicado cuenta como multiconjunto; un archivo en CRLF en la base y en LF ahora no genera "nuevos"; lo que el usuario commiteó antes de `<base>` no es nuevo (Task 10).
4. **Comentarios y cadenas.** `outline: none` dentro de un comentario CSS, JS, HTML o `{/* */}` no da hallazgos; `content: "outline: none"` tampoco; `https://…` dentro del texto JSX no se trata como comentario (Task 2 y Task 12).
5. **Números de línea** con CRLF, con BOM y en bloques `<style>` dentro de HTML/JSX: la línea de la entrada es la del archivo, no la del bloque (Task 2).

## Rulings del plan (técnicos, registrados)

- **Método de ejecución y costo: aplicado** (el autor ya lo aprobó para el hito 2 del núcleo): implementadores sonnet en paralelo, sin revisión por tarea, una sola revisión final opus con una pasada de arreglos y una confirmación. La ola 2 despacha las 8 tareas a la vez; si el tope de subagentes simultáneos de la sesión es menor, corre en dos tandas (4–7 y 8–11) sin cambiar nada más. Motivo: las tarjetas traen casos literales y el arnés verifica cada regla en rojo y en verde; las tandas solo cambian el tiempo, no el costo.
- **Partición 2a/2b** (ver arriba). Motivo: 2a ya son 12 tareas y 25 reglas; SEO, `files` y `report-check` no dependen de las reglas de 2a más allá del runner. Costo si está mal: una unión más.
- **Arreglos diferidos del hito 1** (ledger, "Final: parked"): los tres casos que imprimen stack (`extract --out` sin valor; `extract --out .pignolo-ui/.gitignore` en un proyecto sin carpeta de corridas; `patch --project <inexistente>`) y el caso shadcn sin `--card`. Los otros "minor" del ledger siguen donde el ledger los dejó.
- **Invocación** (§5.5, ampliada): `node <root>/scripts/ui-check.mjs --project <raíz del repo> --run <carpeta> (--files <ruta>)… [--files-from <lista.json>] [--design <DESIGN.md>] [--base <ref>] [--dom <archivo>]… [--gate]`. `--files` se repite (una ruta por vez: las rutas pueden tener comas). `--project` es **opcional** para no cambiar la invocación de §5.5 que consume la compuerta del hito 5: por defecto es `git rev-parse --show-toplevel` desde el cwd (plazo 5 s) o, sin git, el cwd; la skill igual lo pasa explícito (§2). Sin ningún `--files` ni `--dom`, la corrida es válida solo con `--design` (corren las reglas de proyecto); si tampoco hay `--design`, error de uso (exit 2). `--measures` llega con el hito 3.
- **`--gate`** en 2a: la misma corrida, sin JSON en stdout y con una línea de resumen en stderr; mismos códigos. Cómo arma el núcleo la compuerta (qué `--base` usa) es del hito 5 (convivencia).
- **`--dom`** en 2a: cada archivo se evalúa como documento HTML y su alcance es siempre `new`; el "antes" del DOM lo define el hito 3.
- **Mockup** = archivo bajo `design/approved/` o dentro de `.pignolo-ui/runs/` (las opciones de §7). El runner pasa `mockup: true` en el contexto; la única regla que cambia por eso es CONTENT-01 (marcadores → `detalle`).
- **Documento en JSX** (C-01 frente a Next.js): un `.jsx`/`.tsx` con `<html>` es documento, pero como el framework puede poner el `<title>`, el `<main>` y el viewport fuera del archivo, en JSX: sin `<title>` → A11Y-02 `unverified (title may come from framework metadata)`; sin `main` → A11Y-05 `unverified`; dos o más `main` → `fail`. A11Y-28 lee además `export const viewport = { … }` (Next.js) con `maximumScale` < 2 o `userScalable: false`; un JSX sin `meta[name=viewport]` ni `export const viewport` da `pass` (el framework pone uno por defecto y la regla solo falla por valores que impiden el zoom). En `.html` y en `--dom`, la ausencia de `<title>` o de `main` es `fail`.
- **BCP 47** (A11Y-01): se valida la forma (gramática de RFC 5646 sin extensiones privadas raras: idioma 2–3 u 5–8 letras, script 4 letras, región 2 letras o 3 dígitos, variantes), no el registro IANA. `en_US` falla.
- **Nombre accesible estático** (A11Y-04): texto estático del contenido (sin descendientes `aria-hidden="true"`), `aria-label` o `aria-labelledby` no vacíos, `title`, `alt` no vacío de un `img` hijo, `value` o tipo `submit`/`reset` en `input`, o `label[for]`/`label` que lo envuelve. Roles que no toman nombre del contenido: `combobox`, `listbox`, `textbox`, `searchbox`, `slider`, `spinbutton`, `tree`, `grid`, `menu`, `menubar`, `radiogroup`, `tablist`, `progressbar`, `meter`, `scrollbar`, `separator` enfocable: exigen `aria-label`, `aria-labelledby` o `label` asociado (WAI-ARIA 1.2, "Roles Supporting Name from Content" no los incluye).
- **Contraste de tokens** (COLOR-03): pares `on-X` sobre `X` (con alias, §4.2), `textColor` sobre `backgroundColor` de cada componente y `{colors.a} sobre|on|over {colors.b}` en la prosa. Umbral 4,5:1 siempre, salvo: un componente cuya `typography` tiene `fontSize` ≥ 24px, o ≥ 18,66px con `fontWeight` ≥ 700 (1rem = 16px), y un par de prosa que termina en `(texto grande)` o `(large text)`: 3:1. El 3:1 del texto grande real lo mide B1 (hito 3). En tema oscuro, cada token usa su valor de `pignolo.themes.dark` y, si no lo tiene, el claro. Segunda medición: los mismos pares con los valores del CSS, a través de `pignolo.cssVars` y las fuentes de tokens (`:root` claro, `.dark`/`[data-theme=dark]`/`prefers-color-scheme: dark` oscuro); sin `cssVars`, esa segunda medición es una entrada `unverified (no cssVars)`.
- **Contraste no textual** (COLOR-04; §4.5 solo define pares de texto): `pignolo.focus.color` sobre `surface` y sobre `background`; `outline` sobre `surface`; `pignolo.borders.strong` sobre `surface`; 3:1, en los dos temas. Un par cuyo token no existe no se mide (sin entrada), salvo el foco: sin `pignolo.focus` (contenido obligatorio de §4.2) es una entrada `unverified (no pignolo.focus)`; no se adivina con `primary`. `outline-variant` y `pignolo.borders.subtle` son decorativos y no se miden.
- **Degradé con `background-clip: text`** (COLOR-12): la presencia es COLOR-12 `medio`; cada parada de color se mide contra `background` (o `surface` si no hay `background`), en el tema claro y, si hay tema oscuro declarado o detectado, también contra el valor oscuro de ese fondo; si alguna no llega a 4,5:1, es un COLOR-03 en esa línea. Sin fondo conocido o con paradas de la paleta de Tailwind (`from-violet-600`), el contraste es COLOR-03 `unverified`.
- **Familias de tokens** (COLOR-02, DEPTH-01, LAYOUT-04): la familia de `var(--x)` sale, en orden, de (1) `pignolo.cssVars` (clave `colors.*` → color, `rounded.*` → radio, `spacing.*` → espaciado, `pignolo.elevation.*` → elevación); (2) el nombre: `--color-*`, nombres MD3 o alias → color; `--radius*`/`--rounded*` → radio; `--space*`/`--spacing*` → espaciado; `--shadow*`/`--elevation*` → elevación; (3) el valor en las fuentes de tokens (un color que `parseColor` entiende → color). Sin familia conocida: el chequeo de familia es `unverified`; el de literal sigue igual.
- **Literales exentos:** color: `transparent`, `currentcolor`, `inherit`, `initial`, `unset`, `revert`; radio: `0` y `50%`; sombra: `none`. Las declaraciones dentro de un bloque de tokens (`:root`, `.dark`, `[data-theme]`, `@theme`) no son "fuera de la fuente".
- **Clases de Tailwind armadas** (`cn(...)`, `clsx(...)`, plantillas): las cadenas literales de adentro se leen; la lista queda marcada `dynamic`. Las reglas de presencia (`rounded-[6px]`, `transition-all`, `text-[#333]`) fallan igual; las de ausencia en el mismo elemento (STATE-04: `outline-none` sin `focus-visible:`) dan `unverified` si la lista es dinámica.
- **`.js`/`.ts` con JSX** siguen "extensión no soportada" (§5.5 nombra solo `.jsx`/`.tsx`).
- **Entradas `unverified` agregadas:** una por (regla, archivo, motivo), con `measure: { count }`, para que un archivo con 40 `<Button>` no produzca 40 entradas.
- **Huella:** `<id>|<archivo>|<clave estable>` sin línea. Clave: marcado → etiqueta + atributos estáticos ordenados (sin `class`) + los primeros 40 caracteres del texto normalizado; CSS → selector + propiedad + valor normalizados; tokens → par y tema (`on-surface/surface/dark`), sin los valores. Consecuencia declarada: cambiar el valor de un par que ya fallaba sigue siendo deuda.
- **Alcance de lo que no es un archivo tocado** (tokens, proyecto): el runner calcula **una sola vez**, desde el proyecto actual, la lista de archivos fuente: los `--files`, `DESIGN.md` y los archivos de las fuentes de tokens que devuelve `readTokenSources(project)` (cada CSS listado, `components.json`, `tailwind.config.*`, `package.json`). Materializa la base en una carpeta temporal con `git show <base>:<ruta>` de **exactamente esa lista** y corre lo mismo sobre las dos, así las dos corridas ven el mismo conjunto de fuentes y un CSS de tokens que no se tocó no aparece como "nuevo". Un archivo que existía en la base y ya no existe no entra (declarado). Las huellas usan la ruta relativa al proyecto, nunca la de la carpeta temporal. Sin `--base`, todo es `new`.
- **`intentional`**: una regla con `acceptsIntentional: true` listada en `pignolo.intentional` da `pass` con `reason: "intentional: <why>"`. Si el validador rechaza el `DESIGN.md` (`validateDesign(...).reject === true`, por ejemplo con `intentional` sobre el piso; un `status: 'invalid'` por contenido faltante **no** cuenta), el runner ignora toda la lista `intentional` y lo dice en una entrada `DESIGN-INVALID` `unverified`.
- **Rechazos** (§5.6; §17 no los asigna a ningún hito): entran en 2a porque son piso (§4.1). `rule: X` → cada `fail` de X pasa a piso (`bloquea` si es nuevo, `alto` si es deuda) con `reason` `rejected R-nnn`. `pattern` → hallazgo con `id` = `R-nnn`; `value` es el fuente de una regex de JavaScript, se evalúa con las banderas `iu` y con un tope de 200 caracteres; una regex inválida o más larga es `unverified`.
- **Heurísticas de CONTENT-01** (siempre `medio`): `lorem ipsum`; `John Doe`/`Jane Doe`; `\bAcme\b`; avatares de relleno por host (`pravatar.cc`, `randomuser.me`, `ui-avatars.com`, `placehold.co`, `via.placeholder.com`, `placekitten.com`, `picsum.photos`); cifras redondas con "+" (`10.000+`, `10,000+`, `50k+`, `1M+`). "Cifras redondas sin fuente" en general no tiene checker determinista: solo la forma con "+"; el resto queda para el auditor.
- **COPY-01 sin `lang`** (fragmentos): se buscan las listas es y en; con un `lang` que no empieza con `es` ni `en` → `unverified`.
- **THEME-01 "sin declararlos":** declarado = el token existe en `DESIGN.md` y no está en `pignolo.extracted`. Los valores por defecto viven en `catalog/framework-defaults.json`, cada uno con fuente y versión.
- **THEME-02 sin shadcn** (sin `components.json` con `tailwind.css`): `pass` con `reason: "not a shadcn project"`: la regla corrió y no aplica.
- **Catálogo:** se agregan los campos `checker` (`ui-check | design-md | browser`), `related` y `conflicts` (listas de ids); `source` lleva versión o fecha de consulta; se suman las 4 reglas de navegador (NAV-01, LAYOUT-10, LAYOUT-11, MOTION-07) con `class: browser`, sin fixtures hasta el hito 3. Los "snippets del catálogo que se ejecutan en una página de prueba" (§5.1) son los fixtures de `tests/fixtures/rules/`.

---

## Ola 0 (en paralelo: Tasks 1 y 2)

### Task 1: arreglos diferidos del hito 1

**Files:**
- Modify: `plugins/pignolo-ui/scripts/design-md.mjs`
- Create: `plugins/pignolo-ui/tests/design-md-cli.test.mjs`
- Create: `plugins/pignolo-ui/tests/fixtures/extract/shadcn-no-card/components.json` (copia literal del fixture `shadcn/`)
- Create: `plugins/pignolo-ui/tests/fixtures/extract/shadcn-no-card/app/globals.css` (el de `shadcn/` sin las dos líneas `--card`)
- Modify: `plugins/pignolo-ui/tests/design-extract.test.mjs` (un test más)

**Qué corrige:**
- `parseArgs` marca con `true` una opción sin valor, y `cmdExtract` lo pasa a `path.basename` → `TypeError` con stack. Las opciones que llevan valor (`file`, `ops`, `project`, `out`, `date`, `catalog`) exigen una cadena: si no, `UsageError` `--<opción> necesita un valor`. Las banderas (`official`, `write`) siguen siendo booleanas.
- `extract --out <proyecto>/.pignolo-ui/.gitignore` en un proyecto sin carpeta de corridas: `existsSync` da falso, `ensureRunRoot` crea el `.gitignore` y la escritura con `wx` explota (`EEXIST`). `--out` no puede ser `<proyecto>/.pignolo-ui/.gitignore` (comparación con `path.resolve`, sin distinguir mayúsculas en Windows): `UsageError`.
- `patch --project <inexistente>`: `readTokenSources` lanza `ENOENT` con stack. `cmdPatch` llama a `requireProjectDir` como `cmdValidate`.

- [ ] **Paso 1: tests primero.** `tests/design-md-cli.test.mjs`, de tabla, por subproceso (`runScript`). Cada caso verifica: código 2, stderr que empieza con `design-md: `, que no contiene `error interno` ni una línea que empiece con `    at `, y que no se escribió ningún archivo:
  - `extract --project <tmp> --out` → stderr contiene `--out necesita un valor`;
  - `extract --project <tmp con un .css de :root> --out <tmp>/.pignolo-ui/.gitignore` → stderr nombra `.gitignore`; `<tmp>/.pignolo-ui/` no existe después;
  - `patch --file <copia de fixtures/design/valid.md> --ops <ops.json con [{"op":"set","path":["name"],"value":"X"}]> --project <tmp>/nope` → stderr contiene `--project no es una carpeta existente`; el archivo queda byte a byte igual;
  - `validate --file` (sin valor) → `--file necesita un valor`.
- [ ] **Paso 2: test shadcn sin card** en `tests/design-extract.test.mjs`: `extractDesign(fixture('shadcn-no-card'))` → `mode: 'config'`; `renamed` = `[{ from: 'foreground', to: 'on-surface' }, { from: 'primary-foreground', to: 'on-primary' }]` (sin `card`); `data.colors.background` existe y `data.colors.surface` no; `validateDesign(r.text)` trae un hallazgo `DESIGN-CONTENT` en `colors.surface`, `alto`, con el mensaje `semantic color surface is missing` (medido sobre el código actual).
- [ ] **Paso 3: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/design-md-cli.test.mjs` → los 4 casos fallan. El test del paso 2 describe el comportamiento que ya existe: demostrar su rojo quitando temporalmente `surface` de los semánticos exigidos en `lib/design-doc.mjs` y restaurar con el editor.
- [ ] **Paso 4: implementar** los tres arreglos. Verde en los dos archivos.
- [ ] **Paso 5: commit.** `fix(ui): errores de uso sin stack en design-md y caso shadcn sin card`.

### Task 2: lectores (`strip-comments`, `route`, `markup`, `css-walk`, `utility-classes`)

**Files:**
- Create: `plugins/pignolo-ui/lib/strip-comments.mjs`, `lib/route.mjs`, `lib/markup.mjs`, `lib/css-walk.mjs`, `lib/utility-classes.mjs`
- Modify: `plugins/pignolo-ui/lib/token-sources.mjs` (solo `export` de `isTokenBlock` y de `lineIndex`; sin cambios de comportamiento)
- Test: `plugins/pignolo-ui/tests/{strip-comments,route,markup,css-walk,utility-classes}.test.mjs`

**Interfaces que produce (contrato para la ola 2):**
- `stripComments(text, syntax)` con `syntax` ∈ `css | js | html | jsx | vue | svelte`. Devuelve un texto **del mismo largo**: los comentarios pasan a espacios y los fines de línea se conservan; las cadenas quedan intactas. `css`: `/* */`. `html`: `<!-- -->` (y `/* */` dentro de `<style>`). `jsx`: `/* */` y `//` solo en contexto de JavaScript (fuera de cadenas, plantillas y texto JSX), y `{/* */}`. `vue`/`svelte`: `<!-- -->` en la plantilla y `/* */` en `<style>`. Reutiliza `blankComments` de `token-sources`.
- `routeFile(relPath)` → `{ ext, markup: 'html'|'jsx'|null, utilities: 'markup'|'sfc'|null, style: 'css'|'embedded'|null, unsupported: string|null }` según la tabla de §5.5: `.html`/`.htm` → html; `.jsx`/`.tsx` → jsx; `.css` → css; `.vue`/`.svelte` → `markup: null`, `utilities: 'sfc'`, `style: 'embedded'`, `unsupported: null`, y el runner marca las reglas de marcado como `unverified (unsupported extension .vue)`; otra → `unsupported: 'unsupported extension .<ext>'`.
- `parseMarkup(text, { syntax: 'html'|'jsx' })` → `{ elements, hasHtmlRoot, styles, exportsText }`. Nunca lanza: lo que no entiende queda como texto.
  - `elements[i] = { index, tag, component, attrs, spread, line, parent, children, textParts, selfClosing }`. `tag` en minúsculas para HTML; en JSX, una etiqueta con mayúscula inicial o con punto es `component: true`. `attrs` es un `Map` de nombre normalizado (`className` → `class`, `htmlFor` → `for`, el resto en minúsculas) a `{ value: string|null, dynamic: boolean, line }`; `value: null` es un atributo booleano; `{'texto'}` y `{"texto"}` cuentan como estáticos. `spread: true` si hay `{...x}`. `textParts` = `[{ text, dynamic, line }]` del contenido directo.
  - Helpers exportados: `staticText(markup, el, { skipAriaHidden })` → `{ text, dynamic }` (texto normalizado de todo el subárbol; `dynamic: true` si algún tramo o hijo componente no se resuelve); `ancestors(markup, el)`, `descendants(markup, el)`.
  - `styles` = `[{ text, line }]` con el contenido de cada `<style>` (en JSX, también `<style>{`…`}</style>` sin `${}`); `line` es la línea del archivo donde empieza el contenido.
  - `exportsText` (solo JSX) = el texto de `export const metadata = …` y `export const viewport = …` hasta su `;` o fin de objeto, o `null`.
  - Elementos vacíos de HTML (`img`, `input`, `meta`, `link`, `br`…) no esperan cierre; `<script>` y `<style>` guardan su contenido crudo.
- `walkCss(text, { lineOffset = 0 })` → `{ rules, decls, keyframes }`:
  - `decls[i] = { selector, atRules, property, value, important, line, inTokenBlock }`: `property` en minúsculas, `value` con espacios normalizados y sin `!important`, `atRules` = lista de preludios de at-rules que la contienen (`@media (prefers-reduced-motion: reduce)`), `inTokenBlock` según `isTokenBlock` de `token-sources`, `line` = línea en el archivo (`lineOffset` suma la del bloque `<style>`).
  - `rules[i] = { selector, atRules, line, decls }`; `keyframes[i] = { name, line, text }`.
  - Llaves y `;` dentro de cadenas, comentarios y `url(…)` no abren bloques ni cortan declaraciones (el mismo cuidado que `scanCss`).
- `extractClassLists(markup)` → `[{ element, line, classes, dynamic }]` desde el atributo `class`; `classes[i] = { raw, variants, base, arbitrary, line }` (`focus-visible:ring-2` → `variants: ['focus-visible'], base: 'ring-2'`; `rounded-[6px]` → `base: 'rounded', arbitrary: '6px'`; `shadow-[0_4px_12px_rgba(0,0,0,0.2)]` → `arbitrary` con `_` pasado a espacio). Con `class={cn("a b", cond && "c", className)}` lee `a`, `b`, `c` y marca `dynamic: true`. `extractClassListsFromSfc(text)` hace lo mismo con los `class="…"` y `:class`/`class:` (estos, dinámicos) de `.vue`/`.svelte`.

- [ ] **Paso 1: tests primero, de tabla.** Casos literales:
  - **strip-comments:** `".a { color: red } /* .b { outline: none } */"` (css) → mismo largo y sin `outline`; `"a { content: \"/* no */\"; }"` → intacto; `"<!-- <button></button> -->\n<p>x</p>"` (html) → sin `button`, la segunda línea sigue en la línea 2; `"const u = 'https://x'; // nota\n<a>https://y.com</a>"` (jsx) → conserva `https://x` y `https://y.com`, quita `nota`; `"<div>{/* <button/> */}</div>"` (jsx) → sin `button`; un texto con CRLF conserva los `\r\n`.
  - **route:** `a.html` → html; `app/page.tsx` → jsx; `x.css` → css; `C.vue` → sfc sin marcado; `p.astro` → `unsupported extension .astro`; `x.js` → unsupported.
  - **markup:** `<button aria-label="Cerrar"><svg aria-hidden="true"></svg></button>` → 2 elementos, el `svg` hijo del `button`; `<img src="a.png">\n<p>Hola</p>` (html) → `img` vacío y `p` en la línea 2; `<Button onClick={go}>{label}</Button>` (jsx) → `component: true`, texto dinámico; `<input {...props} />` → `spread: true`; `<label htmlFor="e">E</label>` → atributo `for`; `<p>{'Hola'}</p>` → texto estático `Hola`; `<html lang="es"><head><title>T</title></head></html>` → `hasHtmlRoot: true`; `export const metadata = { title: 'Pedidos' };` → `exportsText` lo contiene; un BOM al inicio no corre las líneas; `<p>a < b</p>` no rompe.
  - **css-walk:** `".btn { outline: none; }\n.btn:focus-visible { outline: 2px solid red; }"` → 2 decls en líneas 1 y 2; `"@media (prefers-reduced-motion: reduce) {\n  .a { transition: none; }\n}"` → `atRules` con el preludio; `":root { --x: #fff; }"` → `inTokenBlock: true`; `".a { background: url(data:image/svg+xml;utf8,<svg>{}</svg>); color: red }"` → 2 decls; `"a { color: red !important }"` → `important: true`, `value: 'red'`; `lineOffset: 10` suma 10.
  - **utility-classes:** los ejemplos de la interfaz, más `className="rounded-[6px] rounded-[6px]"` → 2 clases (no se deduplican: cada aparición cuenta).
- [ ] **Paso 2: rojo.** Correr los cinco archivos; anotar el resumen.
- [ ] **Paso 3: implementar** hasta el verde. Correr también `tests/token-sources.test.mjs` (el `export` nuevo no cambia nada).
- [ ] **Paso 4: commit.** `feat(ui): lectores de comentarios, ruteo, marcado, CSS y clases utilitarias`.

---

## Ola 1 (serial)

### Task 3: catálogo completo, contrato de reglas, runner y CLI `ui-check`

**Files:**
- Modify: `plugins/pignolo-ui/catalog/rules.json`, `plugins/pignolo-ui/tests/catalog.test.mjs`
- Create: `plugins/pignolo-ui/lib/catalog.mjs`, `lib/rules/api.mjs`, `lib/ui-check.mjs`, `scripts/ui-check.mjs`
- Create (stubs, uno por grupo, cada uno exporta `RULES` con sus ids y un `check` que devuelve `unverified('not implemented')`): `lib/rules/document.mjs`, `lib/rules/a11y-element.mjs`, `lib/rules/content.mjs`, `lib/rules/style.mjs`, `lib/rules/contrast.mjs`, `lib/rules/defaults.mjs`. Además `lib/rules/rejections.mjs` (exporta `RULES = []` y `applyRejections(entries, design, fileCtxs)` que devuelve `entries` sin cambios) y `lib/scope.mjs` (exporta `classifyScope` que marca todo `new` y `scopeRun({ project, base, relFiles, sourceFiles, designRel, evaluate })` que devuelve `null`). El runner ya los llama: las Tasks 10 y 11 solo reemplazan su contenido.
- Test: `plugins/pignolo-ui/tests/ui-check-cli.test.mjs`, `tests/ui-check-runner.test.mjs`, `tests/rules-fixtures.test.mjs`

**Catálogo (`rules.json`, `catalogVersion: "0.2.0"`):** las 26 reglas actuales más NAV-01, LAYOUT-10, LAYOUT-11 y MOTION-07 (`class: browser`, `checker: browser`); cada regla suma `checker`, `related` y `conflicts`. `THEME-03` lleva `checker: design-md`; COLOR-12 lleva `related: ["COLOR-03"]`. Fuentes (se cambian las que no tienen versión):

| id | source |
|---|---|
| A11Y-01 | WCAG 2.2 SC 3.1.1 (A); BCP 47 (RFC 5646) |
| A11Y-02 | WCAG 2.2 SC 2.4.2 (A) |
| A11Y-04 | WCAG 2.2 SC 4.1.2 (A); WAI-ARIA 1.2 (name from content) |
| A11Y-05 | WAI-ARIA 1.2 main landmark (good practice, not WCAG) |
| A11Y-16 | WCAG 2.2 SC 1.3.1 / 4.1.2 (A) |
| A11Y-26 | WCAG 2.2 SC 1.1.1 (A) |
| A11Y-28 | WCAG 2.2 SC 1.4.4 (AA) |
| A11Y-39 | WCAG 2.2 SC 4.1.2 (A); WAI-ARIA 1.2 aria-hidden |
| COLOR-03 | WCAG 2.2 SC 1.4.3 (AA) |
| COLOR-04 | WCAG 2.2 SC 1.4.11 (AA) |
| STATE-04 | WCAG 2.2 SC 2.4.7 (AA) |
| MOTION-03 | WCAG 2.2 SC 2.3.3 (AAA); Media Queries Level 5 prefers-reduced-motion |
| MOTION-04 | CSS Transitions Level 1 transition-property; pignolo-ui spec 2026-09-28 §5.4 |
| COLOR-02 | Material Design 3 color roles (consulted 2026-09-28); pignolo-ui spec 2026-09-28 §4.5 |
| DEPTH-01 | Fluent 2 elevation (consulted 2026-09-28) |
| LAYOUT-04 | Material Design 3 shape scale (consulted 2026-09-28) |
| DRIFT-01 | pignolo-ui spec 2026-09-28 §4.5 |
| THEME-01 | pignolo-ui spec 2026-09-28 §5.4; values in catalog/framework-defaults.json |
| THEME-02 | shadcn/ui base colors (consulted 2026-09-29; version pinned in catalog/shadcn-base-colors.json) |
| THEME-03 | pignolo-ui spec 2026-09-28 §4.3 (A-16) |
| COLOR-11 | Prompting Claude Opus 5.5, Frontend design defaults (consulted 2026-09-28); pignolo-ui spec 2026-09-28 §7.4 |
| COLOR-12 | WCAG 2.2 SC 1.4.3 (AA), contrast part only |
| ICON-01 | pignolo-ui spec 2026-09-28 §5.4 (heuristic) |
| CONTENT-01 | pignolo-ui spec 2026-09-28 §7.1 |
| COPY-01 | pignolo-ui spec 2026-09-28 §5.4 (heuristic) |
| META-01 | pignolo-ui spec 2026-09-28 §5.4 (heuristic) |
| NAV-01 | WCAG 2.2 SC 2.1.1 (A), keyboard part; floor |
| LAYOUT-11 | WCAG 2.2 SC 1.4.10 (AA); floor |
| LAYOUT-10 | pignolo-ui spec 2026-09-28 §5.4 (16 px side margin) |
| MOTION-07 | pignolo-ui spec 2026-09-28 §5.4 (B4) |

**`lib/catalog.mjs`:** `loadCatalog(file?)` y `checkCatalog(catalog)` → lista de problemas (cadenas): id duplicado; campo de §5.1 ausente o inválido; `checker` fuera de `ui-check|design-md|browser`; `class: script` con `checker: browser` o al revés; un id de `related`/`conflicts` que no existe; dos reglas en conflicto presentes a la vez; `floor` con `acceptsIntentional`; `source` sin versión ni fecha (`/\b(\d+\.\d+|\d{4}-\d{2}-\d{2})\b/`).

**Contrato de reglas (`lib/rules/api.mjs`):**
- Un módulo de reglas exporta `RULES`: `[{ id, checkFile?(ctx), checkProject?(pctx) }]`. Cada función devuelve `RawFinding[]` y nunca lanza (el runner convierte una excepción en `unverified (rule error: <mensaje>)`, sin detener lo demás).
- `RawFinding = { id?, status: 'pass'|'fail'|'unverified', reason?, line?, selector?, key, measure?, severity?, floor? }`. `key` es la clave estable de la huella; `severity` solo cuando la regla la fija (heurísticas de CONTENT-01, CONTENT-01 en mockup, COLOR-03 desde COLOR-12); `floor: true` la pone la Task 11.
- **Ids fuera del catálogo** (`R-nnn` de los rechazos, `DESIGN-INVALID`): el hallazgo **tiene que** traer `severity` (y `floor` si es piso); si no la trae, el runner lo convierte en `unverified (finding without catalog rule or severity)`. Así nunca se busca en el catálogo un id que no está.
- Helpers: `pass(key, extra)`, `fail(key, extra)`, `unverified(reason, extra)`.
- `ctx` (por archivo) = `{ file, text, syntax, route, mockup, isDocument, markup, css, classLists, design, tokens, catalog }`: `text` ya sin comentarios; `markup` de `parseMarkup` (o `null`); `css` = `walkCss` del `.css` o de cada `<style>`, con las líneas del archivo; `classLists` de `extractClassLists`/`extractClassListsFromSfc`; `design` = `{ data, aliases, rel, status }` o `null`; `tokens` = `readTokenSources(project)`.
- `pctx` (proyecto) = `{ project, design, tokens, catalog, files }`; corre una vez por invocación.
- Las reglas `level: document` reciben `ctx` solo si `isDocument` (un archivo con `<html>` o un `--dom`); si no, el runner escribe `unverified (not a document)` por él.

**Runner (`lib/ui-check.mjs`):**
- `runCheck({ project, files, design, base, dom, inject? })` → `{ entries, inputs, exitCode }`, sin escribir nada. `inject = { rules, catalog, applyRejections, classifyScope, scopeRun }` (cada clave opcional; por defecto, los módulos del disco) es lo único que los tests reemplazan. `files: []` es válido: solo corren las reglas de proyecto (`checkProject`), que necesitan `design` o fuentes de tokens.
- Internamente, `evaluate(dir, relFiles)` corre todas las reglas (las mismas `rules` y el mismo `catalog`) sobre la carpeta `dir` y devuelve hallazgos con `file` relativo al proyecto. Se usa para la corrida actual (`dir = project`) y se pasa como cierre a `scopeRun` para la base, así la base se evalúa con las reglas inyectadas y no con las del disco.
- Por cada archivo: lo rutea, lo lee (sin BOM), quita comentarios, arma `ctx` y llama a cada regla aplicable según `level` y `route`; lo que no aplica por la extensión o por no ser documento queda `unverified` con el motivo. Si una regla aplicable no devolvió nada para un archivo, el runner agrega un `pass` (así "nada se omite").
- **Orden fijo:** (1) reglas (`checkFile` y `checkProject`) → (2) `applyRejections(entries, design, fileCtxs)` → (3) `intentional` → (4) `scopeRun`/`classifyScope` (alcance) → (5) severidad efectiva → (6) agregado de `unverified` y orden. `fileCtxs` son los `ctx` por archivo ya armados (texto sin comentarios, `markup`, `css`), para que la Task 11 busque los `pattern` sin tocar `lib/ui-check.mjs`. **`intentional` nunca convierte en `pass` un hallazgo con piso**, venga del catálogo (`floor: true`) o de un rechazo que reaparece (`floor: true` puesto por `applyRejections`): el piso no lo baja ningún nivel (spec §4.1). Por eso el paso 3 corre después del 2 y solo mira hallazgos sin `floor`. Los pasos 2–5 se aplican a la corrida actual y a la de la base por igual antes de comparar.
- Severidad efectiva: la de la regla si la fija; si no, la del catálogo. El piso (`floor` del catálogo o `floor: true` del hallazgo) actúa **solo** sobre los `fail` cuya severidad sería `bloquea`: si son deuda, pasan a `alto`; los demás conservan su severidad (una heurística `medio` de CONTENT-01 sigue `medio` en deuda, y nunca sube). Un `fail` con `floor: true` que traía severidad menor (un rechazo por `rule` sobre MOTION-04) pasa a `bloquea` si es nuevo y a `alto` si es deuda. `unverified` y `pass` llevan la severidad del catálogo, pero no cuentan para el código.
- Alcance: `scopeRun(...)` devuelve los hallazgos de la base o `null`; `classifyScope(current, base)` marca `scope`; el stub devuelve todo `new`.
- Agrega los `unverified` por (regla, archivo, motivo) y ordena las entradas por archivo, línea e id.

**CLI (`scripts/ui-check.mjs`):** opciones del ruling de invocación; cualquier otra es error de uso (exit 2, stderr en español, sin stack). `--run` tiene que caer dentro de `<project>/.pignolo-ui/`; antes de escribir llama a `ensureRunRoot`. Escribe `<run>/ui-check.json` (`catalogVersion`, `inputs` con sha256, `base`, `entries`) y por stdout un resumen `{ out, counts: { pass, fail, unverified, blockingNew }, exitCode }`; con `--gate`, solo la línea en stderr.

- [ ] **Paso 1: catálogo.** Actualizar `catalog.test.mjs`: ids = los 25 de §5.4 + THEME-03 + los 4 de navegador; `checkCatalog(catalog)` = `[]`; el piso pasa a ser los 11 actuales + NAV-01 + LAYOUT-11. Tabla de catálogos sintéticos rotos, uno por problema de `checkCatalog`, cada uno con su mensaje.
- [ ] **Paso 2: tests del runner** (`ui-check-runner.test.mjs`, en proceso, con reglas inyectadas):
  - una regla falsa que falla en cada `outline: none` del `ctx.text`: sobre `.a { outline: none }` da 1 `fail`; sobre `/* .a { outline: none } */` da `pass`;
  - una regla `level: document` sobre `Card.tsx` sin `<html>` → `unverified (not a document)`; sobre `index.html` con `<html>` corre;
  - `C.vue` → las reglas `element` dan `unverified (unsupported extension .vue)`, las `style` corren; `p.astro` → todas `unverified (unsupported extension .astro)`;
  - una regla que lanza → `unverified (rule error: …)` y las demás corren;
  - floor `fail` nuevo → `exitCode: 1`; solo `unverified` → `0`;
  - piso y severidad: con un `classifyScope` inyectado que marca todo `debt`, un `fail` de piso `bloquea` pasa a `alto`, y un `fail` CONTENT-01 con `severity: 'medio'` sigue `medio`;
  - ids fuera del catálogo: un `applyRejections` inyectado que agrega `{ id: 'R-001', status: 'fail', severity: 'bloquea', floor: true, key: 'k' }` → la entrada sale con `id: R-001`, `bloquea`, `exitCode: 1`; el mismo hallazgo sin `severity` → `unverified`;
  - piso contra `intentional`: `DESIGN.md` con `pignolo.rejections: [{ id: R-001, date: 2026-09-20, rule: MOTION-04, note: rechazado }]` y `pignolo.intentional: [{ id: MOTION-04, why: decidido }]`, una regla falsa MOTION-04 que falla y un `applyRejections` inyectado que marca `floor: true` en los `fail` de MOTION-04 → la entrada sigue `fail` `bloquea` y `exitCode: 1` (no `pass` por `intentional`);
  - `fileCtxs`: el `applyRejections` inyectado recibe un `ctx` por archivo con `markup` y `css`;
  - orden: un `applyRejections` inyectado ve los hallazgos de las reglas y la severidad final se calcula después (el `floor: true` que agrega sube un MOTION-04 `medio` a `bloquea`);
  - `evaluate` y la base: un `scopeRun` inyectado que llama a `evaluate` recibe los hallazgos de las **reglas inyectadas** (no las del disco) y con `file` relativo al proyecto;
  - `files: []` con `design` → corren solo las reglas de proyecto; sin `design` ni fuentes → ninguna entrada de archivo y ningún error;
  - `intentional`: `DESIGN.md` con `pignolo.intentional: [{ id: MOTION-04, why: "microinteracción decidida" }]` y una regla falsa MOTION-04 que falla → `pass` con `reason: "intentional: microinteracción decidida"`, aunque el `DESIGN.md` tenga `status: 'invalid'` por contenido faltante; con `intentional` sobre A11Y-04 (`reject === true`) → la lista se ignora y aparece `DESIGN-INVALID` `unverified`;
  - 40 hallazgos `unverified` iguales en un archivo → 1 entrada con `measure: { count: 40 }`;
  - `design/approved/home/index.html` y `.pignolo-ui/runs/r1/option-a/home.html` → `ctx.mockup: true`; `src/home.html` → `false`.
- [ ] **Paso 3: tests de la CLI** (`ui-check-cli.test.mjs`, subproceso, en un repo git temporal): sin `--run` → 2; `--run` fuera de `.pignolo-ui/` → 2; opción desconocida → 2; archivo inexistente → 2; sin `--files`, `--dom` ni `--design` → 2; en todos, stderr en español y sin `    at `. Corrida sana → `ui-check.json` con la forma de arriba, `inputs[0].sha256` correcto, `.pignolo-ui/.gitignore` = `*\n` creado antes, y `git status --porcelain` vacío después. Sin `--project`, corriendo con `cwd` en una subcarpeta del repo → el proyecto es el toplevel (las rutas de `inputs` son relativas a él); en una carpeta sin git → el cwd. Solo `--design` sin `--files` → exit 0 o 1 según las reglas de proyecto. `--gate` → stdout vacío, una línea en stderr.
- [ ] **Paso 4: arnés de fixtures** (`rules-fixtures.test.mjs`). Por cada regla con `checker: ui-check`:
  - subtest `rule <ID> has fixtures`: existe `tests/fixtures/rules/<ID>/` con al menos un caso `pass-*` y uno `fail-*`;
  - un subtest `rule <ID> <caso>` por carpeta de caso. El caso es un mini proyecto: se pasan como `--files` todos sus archivos salvo `expect.json`, `DESIGN.md`, `components.json`, `package.json` y `tailwind.config.*`; `DESIGN.md`, si está, va como `--design`. Se corre `runCheck` y se filtran las entradas del id (o del id que diga `expect.json`).
  - Esperado por prefijo, para el id de la carpeta: `pass-*` → al menos un `pass`, ningún `fail` y ningún `unverified`, salvo los `unverified` cuyo `reason` coincide con `allowUnverified` (regex) de `expect.json`; `fail-*` → al menos un `fail`; `unverified-*` → al menos un `unverified` y ningún `fail`.
  - `expect.json` (opcional) es un objeto o una **lista** de objetos, uno por id, que afinan: `{ "id" (por defecto el de la carpeta), "status", "severity", "count", "lines", "reason" (regex sobre alguna entrada con ese `status`), "measure" (subconjunto), "allowUnverified" (regex), "absent" (lista de `status` que ese id no puede tener, p. ej. `["fail"]`), "exitCode" }`. Un caso vacío (solo `DESIGN.md`) es válido: `runCheck` con `files: []`.
- [ ] **Paso 5: rojo.** Los tres archivos nuevos y `catalog.test.mjs`. El arnés queda en rojo en `rule <ID> has fixtures` para las 25 reglas: es lo esperado y lo cierra la ola 2.
- [ ] **Paso 6: implementar** hasta el verde de todo menos el arnés. `tests/lint-plugin.test.mjs` en verde (imports y carpetas).
- [ ] **Paso 7: commit.** `feat(ui): catálogo completo, contrato de reglas y ui-check (runner y CLI)`.

---

## Ola 2 (en paralelo: Tasks 4 a 11, cada una en su worktree)

Todas parten del commit de la Task 3. Ninguna toca `rules.json`, `lib/ui-check.mjs`, `lib/rules/api.mjs`, los lectores ni el arnés; si el contrato no alcanza, responden `BLOCKED` con la propuesta, sin cambiarlo. Cada tarea reemplaza **solo** su stub y crea **solo** sus carpetas `tests/fixtures/rules/<ID>/` y su archivo de tests del grupo.

**Tarjeta común:**
- Los fixtures de cada regla van en `tests/fixtures/rules/<ID>/<caso>/<ruta>`. El contenido de cada archivo es **literal** como aparece abajo; cada archivo termina en `\n`. Un `expect.json` se escribe **siempre** que la tarjeta da severidad, conteo, línea, medida, un `reason` (los `/…/` de las tablas: `/dynamic/`, `/framework metadata/`, `/placeholder/`, `/family/`…), otro id que debe estar o faltar ("sin COLOR-03 fail" → `{ "id": "COLOR-03", "absent": ["fail"] }`) o un `unverified` permitido en un `pass-*` (`allowUnverified`). Así cada afirmación de la tabla la verifica el arnés.
- Paso 1: escribir los fixtures y los casos extra del grupo. Paso 2: rojo contra el stub (`node --test --test-reporter=dot --test-name-pattern "rule (<ids>) " plugins/pignolo-ui/tests/rules-fixtures.test.mjs` y el archivo del grupo). Paso 3: implementar hasta el verde. Paso 4: commit.

### Task 4: reglas de documento (A11Y-01, A11Y-02, A11Y-05, A11Y-28, META-01)

**Files:** `lib/rules/document.mjs`; `tests/fixtures/rules/{A11Y-01,A11Y-02,A11Y-05,A11Y-28,META-01}/`; `tests/rules-document.test.mjs`.

Documento base (`DOC`), usado abajo con reemplazos:

```html
<!doctype html>
<html lang="es-AR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pedidos</title><link rel="icon" href="/favicon.svg"></head>
<body><main><h1>Pedidos</h1></main></body>
</html>
```

| id | Qué chequea el script | Casos (archivo: contenido → esperado) |
|---|---|---|
| A11Y-01 | `<html>` con `lang` estático no vacío y bien formado (ruling BCP 47); dinámico → `unverified` | `pass-html/index.html`: `DOC` → pass · `fail-missing/index.html`: `DOC` con `<html>` en la línea 2 → fail `bloquea`, línea 2 · `fail-invalid/index.html`: `DOC` con `<html lang="español">` → fail · `unverified-dynamic/app/layout.tsx`: bloque A → `unverified`, reason `/dynamic/` · `unverified-fragment/Card.tsx`: `export function Card() { return <section><h2>Resumen</h2></section>; }` → `unverified`, reason `/not a document/` |
| A11Y-02 | `<title>` con texto estático no vacío; en JSX sin `<title>` → `unverified` (ruling) | `pass-html`: `DOC` · `fail-empty`: `DOC` con `<title>  </title>` → fail `bloquea` · `fail-missing`: `DOC` sin `<title>Pedidos</title>` · `unverified-next-layout/app/layout.tsx`: bloque B → reason `/framework metadata/` |
| A11Y-05 | Exactamente un `main` (`<main>` o `role="main"`); en JSX con 0 → `unverified` | `pass-html`: `DOC` · `fail-two`: `DOC` con `<body><main>a</main><main>b</main></body>` → fail `alto`, count 1 · `fail-none`: `DOC` con `<body><h1>Pedidos</h1></body>` → fail · `unverified-jsx-none/app/layout.tsx`: bloque B |
| A11Y-28 | `meta[name=viewport]` sin `user-scalable=no\|0` ni `maximum-scale` < 2; en JSX también `export const viewport` | `pass-html`: `DOC` · `pass-max5`: `DOC` con `…, initial-scale=1, maximum-scale=5` · `fail-user-scalable`: `DOC` con `…, initial-scale=1, user-scalable=no` → fail `bloquea` · `fail-max1`: `…, maximum-scale=1` · `fail-next-viewport/app/layout.tsx`: bloque C → fail · `pass-jsx-no-viewport/app/layout.tsx`: bloque B (sin viewport) → pass |
| META-01 | Título de plantilla, favicon por defecto o atribución de un generador (listas del ruling de la tarjeta) | `pass-html`: `DOC` · `fail-title`: `DOC` con `<title>Vite + React + TS</title>` → fail `medio` · `fail-favicon`: `DOC` con `<link rel="icon" type="image/svg+xml" href="/vite.svg">` · `fail-generator`: `DOC` con `<meta name="generator" content="v0.dev">` agregado al `<head>` |

Bloque A (`layout.tsx` con `lang` dinámico):

```tsx
export default function RootLayout({ children, locale }) {
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
```

Bloque B (Next.js App Router, título por metadata):

```tsx
export const metadata = { title: 'Pedidos' };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

Bloque C: el bloque B con la línea `export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false };` agregada después de `metadata`.

**Listas de META-01** (en el módulo, con comentario de fuente): títulos `Create Next App`, `React App`, `Vite App`, `Vite + React`, `Vite + React + TS`, `Vite + Vue`, `Vite + Vue + TS`, `Vite + Svelte`, `Vite + Svelte + TS`, `SvelteKit app`, `Document`, `Untitled` (comparación exacta, sin distinguir mayúsculas); favicons `vite.svg`, `next.svg`; generadores: `meta[name=generator]` con cualquier valor, y texto `/(made|built|generated) (with|by) (v0|lovable|bolt|framer|webflow|wix)/i`.

**Casos extra** (`rules-document.test.mjs`, de tabla sobre la función de forma de BCP 47): pasan `en`, `es-419`, `zh-Hant-TW`, `sr-Latn-RS`, `de-CH-1996`; fallan `en_US`, `e`, `español`, `123` y la cadena vacía.

- [ ] Pasos 1–4 de la tarjeta común. Commit: `feat(ui): reglas de documento (A11Y-01, A11Y-02, A11Y-05, A11Y-28, META-01)`.

### Task 5: reglas de elemento de accesibilidad (A11Y-04, A11Y-16, A11Y-26, A11Y-39)

**Files:** `lib/rules/a11y-element.mjs`; `tests/fixtures/rules/{A11Y-04,A11Y-16,A11Y-26,A11Y-39}/`; `tests/rules-a11y-element.test.mjs`.

| id | Qué chequea el script | Casos → esperado |
|---|---|---|
| A11Y-04 | `button`, `a[href]`, `input[type=button\|submit\|reset\|image]`, `[role=button]` con nombre accesible estático (ruling); roles sin nombre de contenido exigen `aria-label`, `aria-labelledby` o `label`; componente propio o texto dinámico → `unverified` | `pass-names/names.html`: bloque D → pass · `fail-icon-only/icon.html`: `<button><svg viewBox="0 0 24 24"><path d="M6 6l12 12"/></svg></button>` → fail `bloquea`, línea 1 · `fail-combobox/select.html`: `<button type="button" role="combobox" aria-expanded="false">Elegí un estado</button>` → fail (caso de la app real, §16.2) · `fail-empty-link/link.html`: `<a href="/perfil"><img src="/a.png" alt=""></a>` → fail · `unverified-dynamic/Save.tsx`: `export function Save({ label }) { return <button>{label}</button>; }` → reason `/dynamic/` · `unverified-component/Close.tsx`: `export const Close = () => <Button variant="ghost"><X /></Button>;` → reason `/component/` |
| A11Y-16 | `input` (salvo `hidden`, `submit`, `button`, `reset`, `image`), `select`, `textarea`, sin `aria-hidden="true"`, con `label[for]` del mismo archivo, `label` que lo envuelve, `aria-label`, `aria-labelledby` o `title`; solo `placeholder` → fail | `pass-labels/form.html`: bloque E → pass · `fail-placeholder/search.html`: `<input type="search" placeholder="Buscar pedidos">` → fail `bloquea`, reason `/placeholder/` · `fail-select/country.html`: `<select><option>AR</option></select>` → fail · `unverified-dynamic-id/Field.tsx`: `export const Field = ({ id }) => (<><label htmlFor={id}>Email</label><input id={id} /></>);` → `unverified` |
| A11Y-26 | `img` con atributo `alt` (vacío vale); `svg[role=img]` con `aria-label`, `aria-labelledby` o `<title>` hijo; spread → `unverified` | `pass-images/img.html`: `<img src="/logo.svg" alt="Pignolo">`, `<img src="/deco.png" alt="">`, `<svg role="img" aria-label="Gráfico de ventas"></svg>`, `<svg role="img"><title>Ventas</title></svg>` (una por línea) → pass · `fail-img/photo.html`: `<img src="/foto.jpg">` → fail `bloquea` · `fail-svg/chart.html`: `<svg role="img" viewBox="0 0 10 10"><circle r="4"/></svg>` → fail · `unverified-spread/Avatar.tsx`: `export const Avatar = (props) => <img {...props} />;` |
| A11Y-39 | Ningún enfocable (`a[href]`, `button`, `input`, `select`, `textarea`, `[tabindex]` ≥ 0, `[contenteditable]`, sin `disabled` ni `tabindex="-1"`) con `aria-hidden="true"` propio o de un ancestro; nunca `aria-hidden` en `body` | `pass-hidden/deco.html`: `<div aria-hidden="true"><span>★</span></div>` y `<div aria-hidden="true"><button tabindex="-1">x</button></div>` → pass · `fail-link/menu.html`: `<div aria-hidden="true">`, `  <a href="/ayuda">Ayuda</a>`, `</div>` (tres líneas) → fail `bloquea`, línea 2 · `fail-body/index.html`: `<!doctype html>`, `<html lang="es"><head><title>T</title></head>`, `<body aria-hidden="true"><main>Hola</main></body></html>` → fail, línea 3 · `fail-self/btn.html`: `<button aria-hidden="true">Menú</button>` → fail |

Bloque D (`names.html`):

```html
<button>Guardar</button>
<button aria-label="Cerrar"><svg aria-hidden="true"></svg></button>
<a href="/pedidos">Pedidos</a>
<input type="submit">
<div role="button" tabindex="0">Abrir</div>
<label for="estado">Estado</label>
<button id="estado" type="button" role="combobox">Pendiente</button>
```

Bloque E (`form.html`):

```html
<label for="email">Email</label>
<input id="email" type="email">
<label>Nota <textarea></textarea></label>
<select aria-label="País"><option>AR</option></select>
<input type="hidden" name="t">
<input type="text" aria-hidden="true" tabindex="-1">
```

**Casos extra** (`rules-a11y-element.test.mjs`): `aria-labelledby=""` no nombra; un `button` con solo un hijo `<span aria-hidden="true">×</span>` falla; `<button disabled><svg/></button>` sigue fallando A11Y-04 (el nombre no depende de estar habilitado); el mismo marcado en `.tsx` con `className` en vez de `class` da los mismos resultados.

- [ ] Pasos 1–4. Commit: `feat(ui): reglas de accesibilidad de elemento (A11Y-04, A11Y-16, A11Y-26, A11Y-39)`.

### Task 6: contenido, copy e íconos (CONTENT-01, COPY-01, ICON-01)

**Files:** `lib/rules/content.mjs`; `tests/fixtures/rules/{CONTENT-01,COPY-01,ICON-01}/`; `tests/rules-content.test.mjs`.

| id | Qué chequea el script | Casos → esperado |
|---|---|---|
| CONTENT-01 | Marcadores: atributo `data-sample` o texto/atributo con `‹…›` → `bloquea` en código, `detalle` en mockup (un hallazgo por elemento). Heurísticas del ruling → `medio`, un hallazgo por señal | `pass-real/Orders.tsx`: `export const Orders = () => (<section><h2>Pedidos de hoy</h2><img src="/equipo.jpg" alt="Equipo" /></section>);` → pass · `fail-marker/src/Hero.tsx`: `export function Hero() { return <p data-sample>‹Cifra real›</p>; }` → fail `bloquea`, count 1, `exitCode: 1` · `fail-mockup/design/approved/checkout/home.html`: `<p data-sample>‹Cifra real›</p>` → fail `detalle`, `exitCode: 0` · `fail-lorem/about.html`: `<p>Lorem ipsum dolor sit amet.</p>` → fail `medio` · `fail-names/quote.html`: `<p>Testimonio de John Doe, de Acme Inc.</p>` → fail `medio`, count 2 · `fail-avatar/team.html`: `<img src="https://i.pravatar.cc/150?img=3" alt="">` → fail `medio` · `fail-round/stats.html`: `<p>Más de 10.000+ clientes</p>` → fail `medio` |
| COPY-01 | Frases de relleno de marketing de las listas es/en (en el módulo) en texto estático; `lang` de `<html>` si hay; sin `lang`, las dos listas; otro idioma → `unverified` | `pass-plain/index.html`: `<!doctype html>`, `<html lang="es"><head><title>Pedidos</title></head>`, `<body><main><h1>Pedidos</h1><p>Revisá los pedidos de hoy.</p></main></body></html>` → pass · `fail-en/Hero.tsx`: `export const Hero = () => <h1>Unlock the power of seamless payments</h1>;` → fail `detalle` · `fail-es/cta.html`: `<p>Llevá tu negocio al siguiente nivel</p>` → fail `detalle` · `unverified-lang/index.html`: el `pass-plain` con `lang="pt-BR"` y `<h1>Desbloqueie o poder</h1>` → `unverified` |
| ICON-01 | Texto que empieza con un emoji (`\p{Extended_Pictographic}`, ignorando espacios y `U+FE0F`) en `button`, `a` con ancestro `nav`, `h1`–`h6` o `li` | `pass-no-emoji/ui.html`: `<button>Empezar</button>`, `<p>🚀 Lanzamiento</p>`, `<nav><a href="/">Inicio</a></nav>` → pass (el `p` no está en la lista) · `fail-button/cta.html`: `<button>🚀 Empezar</button>` → fail `medio` · `fail-heading/news.html`: `<h2>✨ Novedades</h2>` · `fail-nav/nav.html`: `<nav><a href="/">🏠 Inicio</a></nav>` · `fail-li/list.html`: `<ul><li>✅ Envío gratis</li></ul>` |

**Listas de COPY-01** (en inglés y en español, en el módulo; comparación sin mayúsculas ni tildes): en `seamless`, `unlock the power`, `revolutionize`, `game-changer`, `game changer`, `cutting-edge`, `next-level`, `to the next level`, `supercharge`, `elevate your`, `effortless`, `in today's fast-paced`, `world-class`, `best-in-class`; es `sin fisuras`, `revoluciona`, `al siguiente nivel`, `de vanguardia`, `potencia tu`, `desbloquea`, `sin esfuerzo`, `de clase mundial`, `en el mundo acelerado de hoy`.

**Casos extra:** `‹` dentro de un atributo (`<img alt="‹Foto del producto›">`) cuenta como marcador; `lorem` dentro de un comentario HTML no cuenta; `2024` o `1.500` sin `+` no son "cifra redonda".

- [ ] Pasos 1–4. Commit: `feat(ui): reglas de contenido, copy e íconos (CONTENT-01, COPY-01, ICON-01)`.

### Task 7: reglas de estilo (STATE-04, MOTION-03, MOTION-04, COLOR-02, DEPTH-01, LAYOUT-04) y clases utilitarias

**Files:** `lib/rules/style.mjs`; `tests/fixtures/rules/{STATE-04,MOTION-03,MOTION-04,COLOR-02,DEPTH-01,LAYOUT-04}/`; `tests/rules-style.test.mjs`.

**Clases de Tailwind → mismo id que en CSS** (§5.5): `rounded-[…]` → LAYOUT-04; `text-[<color>]`, `bg-[<color>]`, `border-[<color>]` → COLOR-02; `shadow-[…]` → DEPTH-01; `transition-all` → MOTION-04; `outline-none` o `focus:outline-none` sin ninguna clase con variante `focus-visible:` que dibuje (`ring*`, `outline*` salvo `outline-none`, `border*`, `shadow*`) en el mismo elemento → STATE-04; `animate-*` (salvo `animate-none`) o `transition-transform` sin `motion-safe:`/`motion-reduce:` en el mismo elemento → MOTION-03.

| id | Qué chequea el script | Casos → esperado |
|---|---|---|
| STATE-04 | Regla con `outline: none\|0` (o `outline-style: none`) sin una regla del mismo selector base con `:focus-visible` que dibuje (`outline` distinto de `none`/`0`, `box-shadow` o `border`); clases del mapeo | `pass-css/app.css`: `.btn { outline: none; }` / `.btn:focus-visible { outline: 2px solid var(--focus); }` (dos líneas) → pass · `fail-css/app.css`: `.btn { outline: none; }` → fail `bloquea`, línea 1 · `fail-zero/links.css`: `a:focus { outline: 0; }` → fail · `pass-utility/Button.tsx`: `export const B = () => <button className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">Guardar</button>;` → pass · `fail-utility/Button.tsx`: igual sin las dos clases `focus-visible:` → fail · `unverified-cn/Button.tsx`: `export const B = ({ className }) => <button className={cn("outline-none", className)}>Guardar</button>;` → `unverified`, reason `/dynamic/` |
| MOTION-03 | En el archivo hay `animation`/`animation-name`, `@keyframes` con `transform`, o `transition` cuya lista incluye `transform` o `all`, y ningún `@media (prefers-reduced-motion: reduce)`; clases del mapeo | `pass-media/panel.css`: bloque F → pass · `fail-transition/panel.css`: la primera línea de F sola → fail `medio` · `fail-keyframes/toast.css`: `@keyframes pop { from { transform: scale(.9); } to { transform: scale(1); } }` / `.toast { animation: pop 300ms; }` → fail · `pass-opacity/fade.css`: `.fade { transition: opacity 200ms; }` → pass · `fail-utility/Badge.tsx`: `export const N = () => <div className="animate-bounce">¡Nuevo!</div>;` → fail · `pass-utility/Badge.tsx`: con `motion-safe:animate-bounce` → pass |
| MOTION-04 | `transition: all …` o `transition-property: all`; `transition-all` | `pass-list/card.css`: `.card { transition: box-shadow 150ms ease, transform 150ms ease; }` → pass · `fail-all/card.css`: `.card { transition: all 0.2s; }` → fail `medio` · `fail-utility/Link.tsx`: `export const L = () => <a href="/x" className="transition-all hover:underline">Ver</a>;` → fail |
| COLOR-02 | Literal de color (hex, funciones de color, nombres salvo los exentos) en una propiedad de color (`color`, `background`, `background-color`, `border*-color`, `border` abreviado, `outline-color`, `fill`, `stroke`, `text-decoration-color`, `caret-color`, `accent-color`) fuera de un bloque de tokens; o `var()` de otra familia; clases arbitrarias | `pass-tokens/styles.css`: `:root {` / `  --color-primary: #0b6bcb;` / `}` / `.btn { color: var(--color-primary); background: transparent; }` → pass · `fail-literal/btn.css`: `.btn { color: #0b6bcb; }` → fail `medio` · `fail-family/btn.css`: `:root { --radius-md: 8px; }` / `.btn { color: var(--radius-md); }` → fail, reason `/family/` · `fail-utility/P.tsx`: `export const P = () => <p className="text-[#333]">Hola</p>;` → fail · `pass-utility/P.tsx`: con `text-primary` → pass |
| DEPTH-01 | `box-shadow` literal (salvo `none`) fuera de tokens, o `var()` que no es de elevación; `shadow-[…]` | `pass-tokens/card.css`: `:root { --shadow-1: 0 1px 2px rgb(0 0 0 / 0.14); }` / `.card { box-shadow: var(--shadow-1); }` / `.flat { box-shadow: none; }` → pass · `fail-literal/card.css`: `.card { box-shadow: 0 4px 12px rgba(0,0,0,.2); }` → fail `medio` · `fail-family/card.css`: `:root { --color-primary: #0b6bcb; }` / `.card { box-shadow: var(--color-primary); }` → fail (§16.1) · `fail-utility/Card.tsx`: `export const C = () => <div className="shadow-[0_4px_12px_rgba(0,0,0,0.2)]">x</div>;` → fail |
| LAYOUT-04 | `border-radius` y `border-*-radius` literal (salvo `0` y `50%`) fuera de tokens, o `var()` que no es de radio; `rounded-[…]` | `pass-tokens/card.css`: `:root { --radius-md: 8px; }` / `.card { border-radius: var(--radius-md); }` / `.avatar { border-radius: 50%; }` / `.flat { border-radius: 0; }` → pass · `fail-literal/card.css`: `.card { border-radius: 12px; }` → fail `medio` · `fail-family/card.css`: `:root { --space-2: 8px; }` / `.card { border-radius: var(--space-2); }` → fail (§16.1) · `fail-utility/Tile.tsx`: `export const T = () => <div className="rounded-[6px] p-4">x</div>;` → fail |

(En la tabla, ` / ` separa líneas del archivo.)

Bloque F (`panel.css`):

```css
.panel { transition: transform 200ms ease; }
@media (prefers-reduced-motion: reduce) {
  .panel { transition: none; }
}
```

**Casos extra** (`rules-style.test.mjs`): tres `rounded-[6px]` en tres elementos de un `.tsx` → 3 `fail` LAYOUT-04 (cada aparición cuenta, como las 177 de la app real); `<style>` dentro de un `.html` con `.a { outline: none }` en la línea 3 del archivo → STATE-04 en la línea 3; `C.vue` con `<template><button class="outline-none rounded-[6px]">x</button></template>` → STATE-04 y LAYOUT-04, los mismos ids que en CSS; `.a { color: red !important }` → COLOR-02 igual.

- [ ] Pasos 1–4. Commit: `feat(ui): reglas de estilo y clases utilitarias (STATE-04, MOTION-03, MOTION-04, COLOR-02, DEPTH-01, LAYOUT-04)`.

### Task 8: contraste y deriva (COLOR-03, COLOR-04, COLOR-12, DRIFT-01)

**Files:** `lib/rules/contrast.mjs`; `tests/fixtures/rules/{COLOR-03,COLOR-04,COLOR-12,DRIFT-01}/`; `tests/rules-contrast.test.mjs`.

COLOR-03, COLOR-04 y DRIFT-01 son de proyecto (`checkProject`) y necesitan `--design`; sin él dan una entrada `unverified (no DESIGN.md)`. COLOR-12 es por archivo. Todas las razones de contraste llevan `measure: { ratio, required, fg, bg, theme }` con `ratio` redondeado a 2 decimales. Los valores de abajo se midieron con `lib/color.mjs` del hito 1.

Frontmatter base (`DM`): `DESIGN.md` con este contenido, que los casos modifican:

```markdown
---
version: alpha
name: Fixture
colors:
  primary: "#0B6BCB"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  on-surface: "#1A1A1A"
  outline: "#767676"
---

## Overview

Fixture.
```

| id | Qué chequea el script | Casos → esperado |
|---|---|---|
| COLOR-03 | Pares del ruling, 4,5:1 (3:1 grande), alfa compuesto, los dos temas; segunda medición por `cssVars` | `pass-light/`: `DM` + `expect.json` `{ "allowUnverified": "no cssVars" }` → pass (5,28 y 17,40; la segunda medición queda `unverified (no cssVars)`) · `fail-light/`: `DM` con `on-surface: "#8A8A8A"` → fail `bloquea`, `measure.ratio` 3.45 · `fail-dark/`: `DM` + bloque G → fail, `measure.theme` `dark`, ratio 4.12 (como el 4,25:1 de la app real) · `fail-alpha/`: `DM` con `surface: "#3F3F46"` y `on-surface: "rgb(255 255 255 / 0.4)"` → fail, ratio 3.11 · `pass-alpha/`: igual con `/ 0.6` y el mismo `allowUnverified` → pass (4,95) · `fail-css-side/`: `DM` + `pignolo:` / `  schema: 1` / `  cssVars:` / `    colors.surface: "--surface"` / `    colors.on-surface: "--on-surface"` y `app.css` = `:root { --surface: #ffffff; --on-surface: #8a8a8a; }` → fail con `file` `app.css`, ratio 3.45 · `unverified-no-design/app.css`: `.a { color: red; }` sin `DESIGN.md` → reason `/no DESIGN.md/` |
| COLOR-04 | Pares no textuales del ruling, 3:1, los dos temas | `pass/`: `DM` + `pignolo:` / `  schema: 1` / `  focus:` / `    color: "{colors.primary}"` / `    widthPx: 2` / `    offsetPx: 2` → pass (outline 4,54; foco 5,28) · `unverified-no-focus/`: `DM` solo → la entrada del foco es `unverified`, reason `/no pignolo.focus/` (el par `outline` pasa) · `fail-outline/`: el `pass/` con `outline: "#C4C4C4"` → fail `bloquea`, ratio 1.74 · `fail-focus/`: `DM` con `focus-ring: "#E4E4E7"` en `colors` y `pignolo:` / `  schema: 1` / `  focus:` / `    color: "{colors.focus-ring}"` / `    widthPx: 2` / `    offsetPx: 2` → fail, ratio 1.27 |
| COLOR-12 | Regla con `background-clip: text` (o `-webkit-`) y un degradé en `background`/`background-image` → `medio`; cada parada contra `background`/`surface` → COLOR-03 si < 4,5:1; `bg-clip-text` con `bg-gradient-*`/`bg-linear-*` | `pass-plain/`: `DM` + `title.css` = `.title { color: var(--on-surface); }` → pass · `fail-presence/`: `DM` + bloque H → COLOR-12 fail `medio`, sin COLOR-03 fail (5,70 y 5,17) · `fail-contrast/`: `DM` + bloque H con `#c4b5fd, #93c5fd` → COLOR-12 `medio` y, con `expect.json` `{ "id": "COLOR-03", "status": "fail", "severity": "bloquea", "lines": [2] }`, COLOR-03 (1,85 y 1,80) · `fail-utility/Hero.tsx`: `export const H = () => <h1 className="bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">Hola</h1>;` → COLOR-12 fail y COLOR-03 `unverified` (paleta sin resolver) |
| DRIFT-01 | Por cada entrada de `pignolo.cssVars`, valor de `DESIGN.md` = valor del CSS en los dos temas (colores comparados después de `parseColor`, dimensiones con 1rem = 16px); variable ausente → fail | `pass-equal/`: `DM` + `pignolo:` / `  schema: 1` / `  cssVars:` / `    colors.primary: "--color-primary"` y `app.css` = `:root { --color-primary: rgb(11 107 203); }` → pass · `pass-dimension/`: `DM` con `rounded:` / `  md: 8px`, `cssVars` `rounded.md: "--radius-md"` y `:root { --radius-md: 0.5rem; }` → pass · `fail-value/`: como `pass-equal` con `#0a5fb4` → fail `alto`, `measure` con los dos valores · `fail-missing/`: `cssVars` a `--brand` que no existe → fail · `unverified-no-map/`: `DM` + `app.css` con `:root { --color-primary: #0b6bcb; }` y sin `cssVars` → reason `/no cssVars/` |

Bloque G (se agrega a `DM`, antes del `---` de cierre):

```yaml
pignolo:
  schema: 1
  themes:
    dark:
      primary: "rgb(96 165 250)"
      on-primary: "rgb(9 9 11)"
      surface: "rgb(9 9 11)"
      on-surface: "rgb(113 113 122)"
```

Bloque H (`hero.css`):

```css
.hero-title {
  background: linear-gradient(90deg, #7c3aed, #2563eb);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

**Casos extra** (`rules-contrast.test.mjs`): un componente `button-large` con `typography: "{typography.label-xl}"` (`fontSize: 24px`) sobre `#949494` con texto `#FFFFFF` (3,03) → pass por texto grande; el mismo par en un componente de 16px → fail; `{colors.on-surface} sobre {colors.surface}` en la prosa se mide; con `(texto grande)` al final usa 3:1; el alias `text` sobre `bg` (§4.2) se mide como `on-surface` sobre `background` y la razón nombra el alias.

- [ ] Pasos 1–4. Commit: `feat(ui): contraste de tokens, contraste no textual, texto con degradé y deriva (COLOR-03, COLOR-04, COLOR-12, DRIFT-01)`.

### Task 9: look de fábrica (THEME-01, THEME-02, COLOR-11)

**Files:** `lib/rules/defaults.mjs`; `CREDITS.md` (sección de avisos MIT); `catalog/framework-defaults.json`; `catalog/shadcn-base-colors.json`; `tests/fixtures/rules/{THEME-01,THEME-02,COLOR-11}/`; `tests/rules-defaults.test.mjs`.

**Datos** (decisión del autor del 2026-09-29, opción (a): los valores de terceros van en `catalog/*.json` con fuente y versión, y el aviso de copyright MIT de cada proyecto se copia en `CREDITS.md`; esta tarea crea esa sección de `CREDITS.md` con los avisos de shadcn/ui, Tailwind CSS, Bootstrap y Vite, y es la única de la ola 2 que toca ese archivo):
- `framework-defaults.json`: `[{ framework, version, source, primary?, surface?, radius?, font? }]`. Valores mínimos: Bootstrap 5.3 primary `#0d6efd`, radius `0.375rem`; Tailwind CSS 3.4 blue-500 `#3b82f6`; Tailwind CSS 4.x blue-500 `oklch(62.3% 0.214 259.815)`; shadcn/ui (Tailwind v3) radius `0.5rem`; shadcn/ui (Tailwind v4) radius `0.625rem`; plantilla de Vite primary `#646cff`. Cada valor se verifica contra la fuente fijada al implementarlo; un valor que no se pueda verificar se quita, no se adivina.
- `shadcn-base-colors.json`: `{ source, version, sets: { "<baseColor>-<v3|v4>": { "<var>": "<valor>" } } }`. Mínimo: `slate-v3` con `background: 0 0% 100%`, `foreground: 222.2 84% 4.9%`, `primary: 222.2 47.4% 11.2%`, `primary-foreground: 210 40% 98%`, `card: 0 0% 100%` (los del fixture `shadcn` del hito 1, que son los de slate).

| id | Qué chequea el script | Casos → esperado |
|---|---|---|
| THEME-01 | Primario, superficie, radio o fuente (desde las fuentes de tokens, con alias) igual a un valor por defecto y no declarado (ruling) | `fail-bootstrap/app.css`: `:root { --primary: #0d6efd; }` → fail `medio`, `measure.framework` `Bootstrap` · `fail-tailwind/app.css`: `:root { --color-primary: #3b82f6; }` → fail · `pass-declared/`: `app.css` del primer caso + `DESIGN.md` con `colors:` / `  primary: "#0D6EFD"` → pass · `fail-extracted/`: igual con `pignolo:` / `  schema: 1` / `  extracted: [primary]` → fail · `pass-custom/app.css`: `:root { --primary: #0b6bcb; }` → pass |
| THEME-02 | Proyecto shadcn: ≥ 80 % de las variables de color de `:root` coinciden con un set de `shadcn-base-colors.json` | `fail-slate/`: copia literal del fixture `extract/shadcn/` del hito 1 → fail `medio`, `measure` `{ baseColor: 'slate-v3', matched: 5, total: 5 }` · `pass-custom/`: la misma copia con `--primary: 262 83% 58%;`, `--primary-foreground: 0 0% 100%;` y `--card: 40 20% 97%;` (2 de 5, 40 %) → pass · `pass-not-shadcn/app.css`: `:root { --background: 0 0% 100%; }` sin `components.json` → pass, reason `not a shadcn project` |
| COLOR-11 | Primario con H OKLCH en [265°, 310°] y C ≥ 0,12; o un degradé cuya primera parada tiene H en [200°, 265°) y una posterior en [265°, 310°], las dos con C ≥ 0,12; clases `from-(blue\|sky\|indigo)-*` con `to-(violet\|purple\|fuchsia)-*` | `fail-primary/`: `DESIGN.md` con `primary: "#7C3AED"` (H 293, C 0,247) → fail `medio` · `fail-indigo/app.css`: `:root { --primary: #6366f1; }` (H 277) → fail · `pass-blue/`: `DESIGN.md` con `primary: "#0B6BCB"` (H 254,7) → pass · `pass-low-chroma/`: `primary: "oklch(0.55 0.08 280)"` → pass · `fail-gradient/hero.css`: `.hero { background: linear-gradient(135deg, #3b82f6, #8b5cf6); }` (H 259,8 → 292,7) → fail · `fail-gradient-utility/Hero.tsx`: `export const H = () => <div className="bg-gradient-to-r from-blue-500 to-violet-500">x</div>;` → fail · `pass-gradient/hero.css`: `.hero { background: linear-gradient(#16a34a, #0b6bcb); }` → pass |

**Casos extra:** `intentional` sobre COLOR-11 en `DESIGN.md` → `pass` con la razón (lo aplica el runner; este test confirma que la regla devuelve `fail` y el runner la convierte); un `--primary` en HSL desnudo de shadcn se lee igual que en hex.

- [ ] Pasos 1–4. Commit: `feat(ui): reglas de look de fábrica (THEME-01, THEME-02, COLOR-11) y sus datos`.

### Task 10: alcance (`--base`, multiconjunto)

**Files:** `lib/scope.mjs` (reemplaza el stub); `tests/scope.test.mjs`.

**Interfaces:**
- `materializeBase({ project, ref, relPaths })` → `{ dir, missing }`: crea una carpeta temporal con la versión de `<ref>` de cada ruta (`git show <ref>:<ruta>` con `execFileSync`, sin shell, plazo 10 s); una ruta que no existe en la base va a `missing`. Una ref inválida lanza un `Error` que la CLI convierte en exit 2 con `--base no es una ref válida: <ref>`. La carpeta se borra al terminar la corrida.
- `classifyScope(current, base)` → `current` con `scope`: para cada clave `(id, file, fingerprint)` con n apariciones en la base y m ahora, las primeras min(n, m) (por línea) son `debt` y las demás `new`. Solo se clasifican los `fail`; `pass` y `unverified` llevan `scope: new`.
- El runner (Task 3) ya llama a `classifyScope`; esta tarea agrega en `runCheck` la corrida sobre la base materializada **solo** a través de `lib/scope.mjs` (`scopeRun({ project, base, relFiles, sourceFiles, designRel, evaluate })`, que el runner importa y que el stub de la Task 3 ya exporta devolviendo `null`). `scopeRun` materializa `sourceFiles` (la lista única del ruling de alcance) y llama a `evaluate(dir, relFiles)`, el cierre del runner con las mismas reglas y el mismo catálogo; nunca vuelve a cargar reglas del disco. Las huellas de la base salen con la ruta relativa al proyecto.

- [ ] **Paso 1: tests primero** (`scope.test.mjs`, de tabla, cada caso en un repo git temporal con `user.name`/`user.email` locales y `core.autocrlf=false`). Esta tarea corre en paralelo con las de reglas, así que usa **reglas inyectadas** en `runCheck`: una de archivo con id `STATE-04` que falla en cada `outline: none` (clave = selector) y una de proyecto con id `COLOR-03` que falla si `on-surface` sobre `surface` da < 4,5:1 (clave = par y tema). La Task 12 repite los casos 1 y 9 con las reglas reales.
  1. base: `app.css` = `.a { outline: none; }`; ahora: se agrega `.b { outline: none; }` → `.a` `debt`/`alto`, `.b` `new`/`bloquea`, exit 1;
  2. línea movida: ahora hay 10 líneas nuevas antes de `.a` → sigue `debt`, exit 0;
  3. multiconjunto: base con una `.a { outline: none; }`, ahora con dos iguales → 1 `debt` y 1 `new`, exit 1;
  4. lo commiteado antes de fijar la base: el defecto está en el commit de `--base HEAD` → `debt`, exit 0;
  5. archivo que no existe en la base → todo `new`;
  6. `--base nope` → exit 2, stderr en español, sin `ui-check.json`;
  7. sin `--base` → todo `new`;
  8. base en CRLF y ahora en LF con el mismo contenido → ningún `new`;
  9. tokens: `DESIGN.md` con `on-surface: "#8A8A8A"` en la base y `"#949494"` ahora → COLOR-03 `debt` (ruling de la huella); el mismo par sano en la base y roto ahora → `new`;
  10. fuentes no tocadas: `globals.css` con un par de tokens que falla, commiteado en la base y **no** incluido en `--files`; ahora solo cambia `page.tsx` → el hallazgo de proyecto sale `debt` (las dos corridas ven la misma lista de fuentes);
  11. reglas inyectadas en la base: el `evaluate` que recibe `scopeRun` produce en la base los hallazgos de las reglas inyectadas (con los stubs del disco todo saldría `new`), y la huella de la base usa la ruta relativa al proyecto, no la de la carpeta temporal.
- [ ] **Paso 2: rojo** contra el stub; **Paso 3: implementar**; **Paso 4:** commit `feat(ui): alcance de ui-check (solo bloquea lo nuevo en lo tocado)`.

### Task 11: rechazos traducidos (§5.6)

**Files:** `lib/rules/rejections.mjs` (reemplaza el stub); `tests/fixtures/rules-rejections/`; `tests/rules-rejections.test.mjs`. (No usa el arnés por id: los ids de patrón son `R-nnn`, que no están en el catálogo.)

**Qué hace:** `checkProject` lee `pignolo.rejections` del `DESIGN.md`. Con `rule`, marca `floor: true` y `reason: "rejected R-nnn"` en los `fail` de esa regla (el runner le pide al módulo, después de las demás reglas, `applyRejections(entries, design, fileCtxs)`, que el stub de la Task 3 ya exporta como identidad). Con `pattern`, busca en cada `ctx` de `fileCtxs`: `selector` sobre los selectores de `walkCss`, `property` sobre `propiedad: valor`, `text` sobre el texto estático del marcado; cada coincidencia es un `fail` con `id: R-nnn`, `floor: true`.

`DESIGN.md` de los casos (se ajusta por caso):

```markdown
---
version: alpha
name: Fixture
pignolo:
  schema: 1
  rejections:
    - id: R-001
      date: 2026-09-20
      rule: MOTION-04
      note: El usuario rechazó transition all
    - id: R-002
      date: 2026-09-20
      pattern:
        kind: text
        value: "descubr[ií] m[aá]s"
      note: CTA genérico rechazado
    - id: R-003
      date: 2026-09-20
      pattern:
        kind: property
        value: "border-radius:\\s*9999px"
      note: Botones píldora rechazados
---
```

- [ ] **Paso 1: tests primero** (en paralelo con la Task 7, así que MOTION-04 es una regla inyectada que falla en cada `transition: all`, `medio`; la Task 12 repite el primer caso con la regla real):
  - `card.css` = `.card { transition: all .2s; }` → MOTION-04 `fail`, `bloquea` (piso), `reason` `rejected R-001`, exit 1; sin el rechazo → `medio`, exit 0;
  - `cta.html` = `<a href="/x">Descubrí más</a>` → `R-002` `fail` `bloquea`; `<a href="/x">Ver pedidos</a>` → sin `R-002`;
  - `btn.css` = `.btn { border-radius: 9999px; }` → `R-003` `fail`, `bloquea`;
  - un `value` con regex inválida (`"(["`) → entrada `R-00n` `unverified`, reason `/invalid pattern/`;
  - un `value` de más de 200 caracteres → `unverified`;
  - deuda: el mismo `cta.html` en la base (con `--base`) → `R-002` `alto`, exit 0 (requiere la Task 10: este caso se marca `todo` si la Task 10 no está unida y se completa en la Task 12);
  - una opción de mockup (`.pignolo-ui/runs/r1/option-a/home.html`; `design/approved/**` nunca entra al alcance de una implementación, §3.3) con `Descubrí más` → `bloquea` igual (un rechazo que reaparece en algo nuevo bloquea, §5.6).
- [ ] **Pasos 2–4:** rojo contra el stub, implementar, commit `feat(ui): rechazos traducidos como piso en ui-check`.

---

## Ola 3

### Unión de las olas

- [ ] Unir las Tasks 4 a 11 a `ui/hito-2a`. Los archivos son disjuntos; un conflicto es un error del plan y se registra.
- [ ] `npm run test:quiet` una sola vez: verde completo, incluido el arnés (`rule <ID> has fixtures` para las 25 reglas) y `tests/lint-plugin.test.mjs`.

### Task 12: pruebas transversales, documentación y cierre

**Files:**
- Create: `plugins/pignolo-ui/tests/ui-check-acceptance.test.mjs`, `tests/fixtures/acceptance/<caso>/…`
- Modify: `lib/catalog.mjs` (agrega `renderCatalogMarkdown`), `README.md`, `CHANGELOG.md`, `CREDITS.md`, `.claude-plugin/plugin.json`, `docs/specs/2026-09-28-pignolo-ui-v1-design.md` (solo los rulings), `docs/STATE.md`

- [ ] **Paso 1: tests transversales** (por la CLI, en repos temporales), los de §16.1 que cruzan grupos:
  - **Nivel de documento (C-01):** `src/components/Card.tsx` nuevo sin `<html>` → 0 `bloquea` por A11Y-01/02/05 y exit 0; el mismo marcado dentro de `<!doctype html><html><head></head><body>…</body></html>` en `.html` → A11Y-01 y A11Y-02 `fail`.
  - **Clases de Tailwind:** `C.tsx` y `C.vue` con `rounded-[6px]`, `text-[#333]`, `transition-all`, `outline-none` sin `focus-visible:` y otro con `focus-visible:ring-2` → los mismos ids y conteos que el `C.css` equivalente (`border-radius: 6px`, `color: #333`, `transition: all`, `outline: none`), salvo que en `.vue` las reglas de marcado quedan `unverified`.
  - **Comentarios:** cada defecto anterior envuelto en el comentario de su sintaxis (`/* */`, `//`, `<!-- -->`, `{/* */}`) → 0 `fail`.
  - **Extensión no soportada:** `Page.astro` → solo entradas `unverified`, exit 0.
  - **Aprobados:** `design/approved/checkout/home.html` con marcadores → CONTENT-01 `detalle`, exit 0; el mismo archivo en `src/` → `bloquea`, exit 1.
  - **Caso realista** (sintético, inspirado en las mediciones de §16.2; `fixtures/acceptance/next-shadcn/`): `components.json` (slate), `app/globals.css` con `:root`/`.dark` de slate y `--muted-foreground` oscuro que da 4,12:1, `app/layout.tsx` (bloque B de la Task 4), `app/page.tsx` con tres `rounded-[6px]`, un `transition-all`, un `outline-none` sin reposición y un `<button role="combobox">Estado</button>`, y un `DESIGN.md` con `cssVars` a esas variables. Esperado: THEME-02 `medio`; COLOR-03 `fail` en tema `dark`; LAYOUT-04 ×3; MOTION-04 ×1; STATE-04 ×1; A11Y-04 ×1 (combobox); A11Y-02 y A11Y-05 `unverified` en `layout.tsx` (nunca `fail`); exit 1.
  - **Catálogo en el README:** el bloque entre `<!-- catalog:start -->` y `<!-- catalog:end -->` es exactamente `renderCatalogMarkdown(catalog)` (tabla id, qué chequea, nivel, piso, severidad, `intentional`, fuente, checker), así los conteos y la documentación salen del catálogo (§5.1).
  - **Con las reglas reales:** los casos 1 y 9 de la Task 10 (STATE-04 y COLOR-03) y el primero de la Task 11 (MOTION-04 rechazado → `bloquea`); si la Task 11 dejó el caso de deuda como `todo`, completarlo acá.
- [ ] **Paso 2: rojo** (el README todavía no tiene el bloque; el caso realista puede mostrar huecos reales: se arreglan en la tarea dueña del grupo, en esta misma ola, con un commit `fix(ui): …` que nombra el test).
- [ ] **Paso 3: docs y versión:**
  - `plugin.json` → `0.2.0`; `CHANGELOG` con la entrada del hito 2a y su motivo;
  - README: sección "Checker (`ui-check`)" con la invocación, los códigos 0/1/2, qué es `unverified` y por qué no bloquea, el umbral de texto grande en tokens (ruling) y el bloque del catálogo generado;
  - CREDITS: WCAG 2.2, WAI-ARIA 1.2, RFC 5646, CSS Transitions, Media Queries 5, Material Design 3, Fluent 2, sin tocar la sección de avisos MIT que agregó la Task 9 (decisión (a) del autor): se verifica que cada proyecto citado en `framework-defaults.json` y `shadcn-base-colors.json` tiene su aviso;
  - spec: registrar como aclaraciones técnicas los rulings de documento en JSX, pares de COLOR-04, texto grande en tokens, rechazos en el hito 2 y la invocación ampliada (sin tocar A-12 ni ninguna decisión del autor).
- [ ] **Paso 4: suite y revisión final:** `npm run test:quiet` completo y `claude plugin validate plugins/pignolo-ui`. Después, **una revisión final opus** de `main..ui/hito-2a`, una pasada de arreglos y una confirmación acotada.
- [ ] **Paso 5: estado:** actualizar `docs/STATE.md` (hito 2a terminado, qué quedó para 2b, decisiones pendientes).
- [ ] **Paso 6: unión y push:** unir a `main` y pushear solo con el OK del autor.

---

## Esbozo del hito 2b (se escribe completo al unir 2a)

- **Task A — SEO estático (7 ids, §5.4):** SEO-01, 02, 04, 05, 06, 09, 18 en `lib/rules/seo.mjs`, `level: document`, solo con `web.public: true`; sobre archivos y, con URL de desarrollo, sobre lo que devuelve `fetch` (el test levanta un servidor en 127.0.0.1; sin red). Nunca bloquean. Fixtures por el mismo arnés.
- **Task B — `scripts/files.mjs` (`save | verify | restore`, §9):** copias con sha256, "no existía", delta de `git status --porcelain --untracked-files=all` contra el estado inicial; borrar un archivo creado solo si su sha256 es el que escribió el lote, si no `BLOCKED`. Tests de §16.1 "Delta de §9".
- **Task C — `scripts/report-check.mjs` (§12):** `report.json` con afirmaciones que citan una entrada de `ui-check.json`/`browser.json` o una captura con sha256; cita del aprobado (`implements: { path, manifestSha256 }`) contra `DESIGN.md`; salidas 0/1/2. Tests de §16.1 "`report-check`".
- Olas: las tres en paralelo desde `main` con 2a unido; un cierre con revisión final opus.

---

## Decisiones que necesita el autor

1. **Datos de terceros dentro del plugin** (THEME-01 y THEME-02 necesitan valores por defecto de frameworks: shadcn/ui, Tailwind CSS, Bootstrap, plantilla de Vite; todos con licencia MIT). Es un tema legal y de dependencias de contenido.
   - (a) Guardar los valores en `catalog/*.json` con fuente y versión, y copiar en `CREDITS.md` el aviso de copyright MIT de cada proyecto.
   - (b) Guardar los valores con fuente y versión y solo un crédito en `CREDITS.md`, sin el aviso completo (unos pocos valores de color probablemente no son "una porción sustancial", pero no es seguro).
   - (c) No guardar valores de terceros: THEME-01 y THEME-02 se degradan a `agent` (guía del auditor) y la v1 queda con 23 reglas con checker.
   - **Recomendación: (a).** Cuesta unas líneas en CREDITS y elimina la duda; (c) pierde dos reglas que la app real mostró útiles (THEME-02 coincidía con slate).
   - **Decidido por el autor (2026-09-29): (a).**
Es la única decisión del autor de este plan. El método de ejecución y su costo ya los aprobó el autor para el hito 2 del núcleo y se registran en Rulings.

**Pregunta para el plan del hito 4 (no de este):** cuándo y cómo escribir las ~125 reglas de guía del auditor (§5.1). Su fuente hoy es investigación local sin revisar para publicar y parte viene de guías con copyright (Apple HIG, Fluent 2, Material 3); la propuesta a evaluar allí es texto propio con enlace fechado a la fuente y sin citas textuales, junto con `ui-auditor`.

No se decide ahora: cómo arma el núcleo la compuerta `ui-check --gate` (hito 5, es un contrato entre los dos plugins) y axe en v1.1 (A-13; el spike recomienda medir otra app antes).

## Contradicciones y huecos del spec encontrados

1. **C-01 frente a Next.js App Router:** tal como está escrito (§5.2), A11Y-02 y A11Y-05 bloquearían todo `layout.tsx`, que tiene `<html>` pero no `<title>` ni `<main>`. Ruling: en JSX dan `unverified`.
2. **COLOR-04** pide contraste de "borde funcional, focus-ring", pero §4.5 solo define pares de texto. Ruling con los pares no textuales.
3. **COLOR-03 "3:1 si es grande"** no se puede saber sobre pares de tokens sin tipografía. Ruling: 4,5:1 salvo componentes con tipografía grande o pares de prosa marcados.
4. **Rechazos** (§5.6) son piso (§4.1), pero §17 no los asigna a ningún hito. Entran en 2a.
5. **"Fuente con versión"** (§5.1): el catálogo semilla del hito 1 tiene fuentes sin versión ("pignolo-ui research"). La Task 3 lo corrige.
6. **COLOR-12** dice que el contraste de las paradas "se reporta como COLOR-03", pero no dice contra qué fondo. Ruling: `background`, o `surface` si no hay.
