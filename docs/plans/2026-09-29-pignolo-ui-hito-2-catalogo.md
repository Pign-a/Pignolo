# pignolo-ui v1 — Hito 2 (2a y 2b): catálogo verificado, checker (`ui-check`), SEO estático, `files` y `report-check`. Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, worktrees creadas a mano, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo-ui tenga su checker determinista `ui-check`: el catálogo completo de las reglas con checker de la v1, cada una trazada a su fuente, con un fixture sintético en verde y otro en rojo, el alcance "solo bloquea lo nuevo en lo tocado", los rechazos traducidos como piso y la salida `ui-check.json` con códigos 0/1/2. Antes, los arreglos que el hito 1 dejó para el comienzo de este hito.

**Arquitectura:** `catalog/rules.json` es la fuente única (spec §5.1). Unos lectores sin dependencias (`strip-comments`, `route`, `markup`, `css-walk`, `utility-classes`) convierten cada archivo en estructuras. Un runner (`lib/ui-check.mjs`) arma el contexto (archivo, DOM o proyecto), llama a los módulos de reglas de `lib/rules/*.mjs` con un contrato fijo, calcula severidad, alcance e `intentional`, y escribe `<run>/ui-check.json`. `scripts/ui-check.mjs` es una CLI fina. Cada grupo de reglas vive en su propio módulo y en su propia carpeta de fixtures, así los grupos se construyen en paralelo sin tocar los mismos archivos.

**Stack:** Node ≥ 22 para pignolo-ui (spec A-12), ESM `.mjs`, `node:test` + `node:assert/strict`, sin dependencias npm.

**Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md`: §1 (principios 1 y 5), §3.3 (aprobados como mockup), §4.1 (piso), §4.3 (`intentional`, `rejections`, `cssVars`), §4.5 (pares de contraste, `cssVars`), §5.1–§5.6, §16.1 y §17, hito 2.

**Prerrequisito:** el hito 1 de pignolo-ui está en `main` (`2f4894a` y siguientes): existen `lib/{yaml-subset,color,token-sources,design-doc,design-patch,design-extract,official-lint,run-folder,leak-check,approved}.mjs`, `scripts/design-md.mjs` y `catalog/rules.json` semilla (26 reglas).

## Alcance y partición del hito 2

§17 asigna al hito 2: `rules.json` completo, `route`, `strip-comments`, `ui-check` (25 reglas, alcance y SEO), `files` y `report-check`. Es demasiado para un plan con olas de archivos disjuntos y una sola revisión final, así que se parte en dos (decisión técnica, registrada en Rulings):

- **Hito 2a (este plan, completo):** arreglos diferidos del hito 1, lectores, catálogo completo menos SEO, runner y CLI de `ui-check`, las 25 reglas con checker de §5.4, alcance (`--base`, multiconjunto) y rechazos (§5.6).
- **Hito 2b (plan completo al final de este archivo, escrito con 2a unido):** los 7 ids de SEO estático (§5.4), `scripts/files.mjs` (`save | verify | restore` y delta de §9) y `scripts/report-check.mjs` (§12).

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

## Decisiones que necesita el autor (hito 2a)

1. **Datos de terceros dentro del plugin** (THEME-01 y THEME-02 necesitan valores por defecto de frameworks: shadcn/ui, Tailwind CSS, Bootstrap, plantilla de Vite; todos con licencia MIT). Es un tema legal y de dependencias de contenido.
   - (a) Guardar los valores en `catalog/*.json` con fuente y versión, y copiar en `CREDITS.md` el aviso de copyright MIT de cada proyecto.
   - (b) Guardar los valores con fuente y versión y solo un crédito en `CREDITS.md`, sin el aviso completo (unos pocos valores de color probablemente no son "una porción sustancial", pero no es seguro).
   - (c) No guardar valores de terceros: THEME-01 y THEME-02 se degradan a `agent` (guía del auditor) y la v1 queda con 23 reglas con checker.
   - **Recomendación: (a).** Cuesta unas líneas en CREDITS y elimina la duda; (c) pierde dos reglas que la app real mostró útiles (THEME-02 coincidía con slate).
   - **Decidido por el autor (2026-09-29): (a).**
Es la única decisión del autor de este plan. El método de ejecución y su costo ya los aprobó el autor para el hito 2 del núcleo y se registran en Rulings.

**Pregunta para el plan del hito 4 (no de este):** cuándo y cómo escribir las ~125 reglas de guía del auditor (§5.1). Su fuente hoy es investigación local sin revisar para publicar y parte viene de guías con copyright (Apple HIG, Fluent 2, Material 3); la propuesta a evaluar allí es texto propio con enlace fechado a la fuente y sin citas textuales, junto con `ui-auditor`.

No se decide ahora: cómo arma el núcleo la compuerta `ui-check --gate` (hito 5, es un contrato entre los dos plugins) y axe en v1.1 (A-13; el spike recomienda medir otra app antes).

## Contradicciones y huecos del spec encontrados (hito 2a)

1. **C-01 frente a Next.js App Router:** tal como está escrito (§5.2), A11Y-02 y A11Y-05 bloquearían todo `layout.tsx`, que tiene `<html>` pero no `<title>` ni `<main>`. Ruling: en JSX dan `unverified`.
2. **COLOR-04** pide contraste de "borde funcional, focus-ring", pero §4.5 solo define pares de texto. Ruling con los pares no textuales.
3. **COLOR-03 "3:1 si es grande"** no se puede saber sobre pares de tokens sin tipografía. Ruling: 4,5:1 salvo componentes con tipografía grande o pares de prosa marcados.
4. **Rechazos** (§5.6) son piso (§4.1), pero §17 no los asigna a ningún hito. Entran en 2a.
5. **"Fuente con versión"** (§5.1): el catálogo semilla del hito 1 tiene fuentes sin versión ("pignolo-ui research"). La Task 3 lo corrige.
6. **COLOR-12** dice que el contraste de las paradas "se reporta como COLOR-03", pero no dice contra qué fondo. Ruling: `background`, o `surface` si no hay.

---

## Hito 2b: SEO estático, `files` y `report-check` (plan completo)

> **Para quien ejecute:** mismo método que el 2a (olas en paralelo, worktrees creadas a mano, sin revisión por tarea, una revisión final opus). Valen las **Global Constraints** del 2a (arriba) más las de esta sección. Los pasos usan casillas (`- [ ]`).

**Objetivo:** cerrar el hito 2 de §17. `ui-check` suma los 7 ids de SEO estático (§5.4, A-06), que solo corren si `DESIGN.md` declara `web.public: true` y **nunca bloquean**; `scripts/files.mjs` (`save | verify | restore`) aplica un lote sin romper (§9); `scripts/report-check.mjs` cruza cada afirmación del informe con su evidencia y exige la cita del aprobado (§12).

**Arquitectura:**
- **SEO.** Dos módulos de reglas de proyecto (`checkProject`): `lib/rules/seo-site.mjs` (SEO-01 `robots.txt`, SEO-05 sitemap) y `lib/rules/seo-page.mjs` (SEO-02, 04, 06, 09, 18). Leen las páginas de una sola vez: los documentos de las entradas (`ctx.isDocument`, nunca mockups) y, con `--url`, las páginas que devuelve el servidor de desarrollo **local** (`lib/site-fetch.mjs`). Lo compartido va en `lib/rules/seo-common.mjs` (compuerta `web.public`, lista de páginas, lector de literales de `export const metadata` de Next.js), `lib/robots.mjs` (RFC 9309), `lib/site-files.mjs` (`robots.txt`/`sitemap.xml` en la raíz, `public/` o `static/`) y `lib/xml-check.mjs`. El runner solo cambia en tres cosas: `pctx` gana `ctxs` y `site`, cada `ctx` gana `origin`, y `runCheck` acepta `urls`.
- **`files`.** `lib/batch-files.mjs` + CLI fina. Copias byte a byte en `<run>/<lote>/copies/`, registro `files.json`, delta de `git status --porcelain=v1 -z --untracked-files=all` contra el estado inicial (con sha256 de cada entrada sucia, así un cambio del agente sobre un archivo que ya estaba sucio también se ve). Solo lee git.
- **`report-check`.** `lib/report-check.mjs` + CLI fina. Lee `<run>/report.json`, verifica cada afirmación contra `ui-check.json`/`browser.json` (citados por sha256), una captura o un archivo editado, y la cita del aprobado contra `DESIGN.md` (`registeredManifestSha`, que sale de `lib/approved.mjs` sin cambiar su comportamiento). Escribe `<run>/report-check.json`.

**Spec:** §0 (nada remoto), §3.2–§3.3, §5.2–§5.5, §5.8, §9, §12, §16.1 ("Delta de §9", "`report-check`"), §17 hito 2.

**Prerrequisito:** hito 2a unido a `main` (`30657ab` y siguientes, con la pasada de arreglos de su revisión final). Lo que 2b consume de 2a, con su firma real:
- `runCheck({ project, files, design, base, dom, inject })` → `{ entries, inputs, exitCode }` (`lib/ui-check.mjs`); `ctx` por archivo `{ file, text, syntax, route, mockup, isDocument, markup, css, classLists, design, tokens, catalog }`; `pctx` `{ project, design, tokens, catalog, files }`; `design` = `{ data, aliases, rel, status }` (`data` es `null` si el frontmatter o el YAML no se pudieron leer).
- `pass(key, extra)`, `fail(key, extra)`, `unverified(reason, extra)` (`lib/rules/api.mjs`); un hallazgo de `checkProject` lleva su `file` y el runner lo respeta.
- `parseMarkup(text, { syntax })` → `{ elements, hasHtmlRoot, styles, exportsText }`; `staticText(markup, el)`; atributos JSX literales (`{'x'}`, `{-1}`, `{true}`) son estáticos; `aria-*` sin valor vale `'true'` (`lib/markup.mjs`).
- `stripComments(text, syntax)`, `loadCatalog()`, `checkCatalog()`, `renderCatalogMarkdown()`, `ensureRunRoot()`, `isInsideRunRoot()`, `findDesignFile()`, `APPROVED_PATH`, `verifyApproved()`.
- Arnés `tests/rules-fixtures.test.mjs`: `pass-*` exige un `pass` emitido por la regla (no el sintético del runner), `fail-*` al menos un `fail`, `unverified-*` al menos un `unverified` y ningún `fail`; `expect.json` con `status`, `severity`, `count`, `lines`, `reason`, `measure`, `allowUnverified`, `absent`, `exitCode`.

### Alcance del 2b

- **Adentro:** SEO-01, 02, 04, 05, 06, 09, 18 con fixtures por el arnés; `--url` en `ui-check`; `files.mjs`; `report-check.mjs`; `registeredManifestSha`; pruebas transversales; versión 0.3.0.
- **Afuera:**
  - B1–B4, `browser.mjs` y la producción de `browser.json` (hito 3). `report-check` ya lee `browser.json` con el contrato de abajo.
  - Correr `typecheck`/`build`/`lint` del paso 5 de §9 y armar el informe: lo hace la skill (hito 4) con estos scripts.
  - SEO de v1.1 (hreflang, datos estructurados, sitemap completo, Core Web Vitals), GEO, `llms.txt`, crawlers de IA (§18).
  - **Las ~125 reglas de guía del auditor:** su pregunta (cuándo y cómo escribirlas, con fuentes con copyright) es del plan del hito 4, no de este.

### Global Constraints (además de las del 2a)

- **Nada remoto en tiempo de ejecución** (§0): `--url` acepta solo `localhost`, `*.localhost`, `127.0.0.0/8` y `[::1]`, por `http`/`https`, sin usuario ni clave, un solo origen y como mucho 20. Las redirecciones se siguen a mano, hasta 5 y dentro del mismo origen. Un `Sitemap:` con dominio de producción se pide **por su ruta** en el origen de desarrollo o se busca como archivo del proyecto; nunca se pide la URL de producción.
- **Tests sin red:** el servidor de prueba es `serveRoutes` (`tests/helpers.mjs`, en `127.0.0.1` con puerto aleatorio). Un test que corre una CLI contra un servidor del mismo proceso usa `spawn` asíncrono: `spawnSync` bloquea el event loop y el servidor no contesta.
- **Git solo se lee** en `files.mjs` (`status`, `rev-parse`, `diff --numstat`). Nunca `checkout`, `reset`, `clean`, `stash` ni `restore`.
- **Borrar solo con prueba:** `files.mjs restore` borra un archivo únicamente si su sha256 actual es el que `verify` registró como escrito por el lote; si no, `BLOCKED` y no toca nada.
- **U+FEFF:** la herramienta de escritura convierte el escape `\uFEFF` en el carácter literal. Después de escribir cualquier archivo, correr desde la raíz de la worktree:

  ```bash
  node -e "const fs=require('fs');const B=String.fromCharCode(0xfeff),E=String.fromCharCode(92)+'uFEFF';for(const f of process.argv.slice(1)){const s=fs.readFileSync(f,'utf8');if(s.includes(B)){fs.writeFileSync(f,s.split(B).join(E));console.log('escape en',f);}}" <archivos escritos>
  ```

- **Costo lineal:** nada de recorrer ancestros por cada elemento ni `slice` dentro de un bucle sobre el texto; cada lector nuevo tiene un test de tiempo holgado (miles de elementos anidados, < 3–5 s).

## Método de ejecución (2b)

- **Rama base:** `ui/hito-2b`, desde `main`. Al terminar cada ola se une a `ui/hito-2b` y `npm run test:quiet` corre **una vez**.
- **Olas** (sin archivos compartidos dentro de una ola; tabla de archivos en cada tarea):
  - **Ola 0:** Task B1 (opus) ∥ Task B2 (opus) ∥ Task B3 (sonnet).
  - **Ola 1:** Task B4 ∥ Task B5 (sonnet). Parten del commit de unión de la ola 0.
  - **Ola 2:** Task B6 (sonnet), unión, docs, revisión final opus de `main..ui/hito-2b`, una pasada de arreglos y una confirmación acotada.
- **Por qué opus en B1 y B2:** la Task B1 cambia el contrato del runner y abre la red local (plazos, redirecciones, tope de bytes); la Task B2 borra archivos del usuario. En las otras, las tarjetas traen código y casos literales.
- **Worktrees:** `git worktree add -b task/ui-2b/<NN> <scratchpad>/wt-2b-<NN> ui/hito-2b`. Primer paso de cada implementador: `git merge-base --is-ancestor <sha de la ola anterior> HEAD`; si falla, `BLOCKED`. Si el contrato no alcanza, `BLOCKED` con la propuesta, sin cambiarlo.
- **Tests:** cada implementador corre solo sus archivos (`node --test --test-reporter=dot <archivo>`; para el arnés, `--test-name-pattern "rule (SEO-01|SEO-05) "`). En el informe va el resumen del reporter `dot`.

## Review Focus (2b)

1. **Falsos positivos en patrones comunes.** Un `layout.tsx` de Next.js con `metadataBase`, `title.template`, `alternates.canonical: '/'`, `openGraph`, `robots` según `process.env` y `{preview && <meta name="robots" content="noindex" />}` no da **ningún** `fail` de SEO (Task B6, caso realista). Un `index.html` sin canonical ni Open Graph da SEO-04 (`medio`) y SEO-18 (`detalle`), nunca algo que bloquee. Nada de SEO cambia el código de salida.
2. **`files.mjs` nunca borra ni pisa sin prueba.** Los tres casos de §16.1, un archivo ya sucio que el agente tocó, rutas con espacios, `ñ` y renombres, CRLF y BOM restaurados byte a byte.
3. **`report-check` no deja pasar teatro:** afirmación sin referencia, con estado o medida distintos, con `ui-check.json` sin citar por hash o cambiado después, captura fuera del run o que no es PNG, implementación sin cita del aprobado o con otro sha256.
4. **Red local acotada:** URL remota o de dos orígenes rechazada antes de correr; redirección a otro origen, respuesta enorme o servidor colgado → `unverified` con motivo, nunca `pass`.
5. **Costo lineal:** XML de 50 000 URLs y 20 000 niveles, patrones de `robots.txt` con miles de `*`, 2000 elementos anidados con enlaces.

## Rulings del plan 2b (técnicos, registrados)

- **Método y costo:** el mismo que el 2a, aprobado por el autor. 6 tareas en 3 olas; opus solo en las Tasks B1 y B2 (ver Método).
- **Compuerta `web.public`** (A-06): sin `DESIGN.md` o con `web.public` distinto de `true`, cada id de SEO devuelve **un** `pass` con `reason` que dice por qué no aplica (`no DESIGN.md: …` o `web.public is not true: …`), como THEME-02 sin shadcn. Con un `DESIGN.md` que no se pudo leer (`design.data === null`), un `unverified`.
- **SEO como reglas de proyecto.** Las 7 quedan `level: document` en el catálogo (§5.2), pero se implementan con `checkProject`: comparan entre rutas (SEO-06), leen archivos de sitio (SEO-01, 05) y así un componente que no es documento no genera 7 entradas `unverified (not a document)`. Sin ninguna página entre las entradas: una entrada `unverified (no page among the inputs …)` por id de página.
- **Páginas de SEO:** documentos de las entradas que no son mockup (`design/approved/**` y `.pignolo-ui/runs/**` nunca cuentan) y páginas de `--url`. Una página de `--url` que no se puede revisar da `unverified` con el motivo: error de red o plazo, estado HTTP distinto de 200, respuesta que no es HTML, ruta final distinta de la pedida (sin contar la barra final: `redirected to <ruta> (may require a session)`, §11.2) o un `input[type=password]` (`requires a session (password field)`).
- **`--dom`** cuenta como página renderizada: su `ctx.origin` es `'dom'` y SEO-02 lo trata como la URL de desarrollo (`detalle`).
- **Severidad de SEO-02:** `alto` en el código fuente (`origin: 'file'`); `detalle` en la URL de desarrollo o en `--dom`, incluido `X-Robots-Tag`. Con `web.indexable: false`, `pass` (el `noindex` es declarado).
- **Condicionales y valores de entorno en JSX:** un elemento dentro de una expresión `{…}` hija (`{preview && <meta …/>}`, `{items.map(…)}`) lleva `inExpression: true` (cambio chico en `lib/markup.mjs`). Un `meta robots` o `link canonical` condicional da `unverified`. En `export const metadata`, solo cuentan valores literales: una clave cuyo valor tiene identificadores, llamadas, spreads o plantillas con `${}` es `dynamic` → `unverified`. `generateMetadata` → `unverified (metadata is generated at run time)`.
- **SEO-01:** sin `robots.txt` (ni archivo ni 404 del servidor) → `pass` "everything is allowed", y SEO-05 queda `unverified (no sitemap referenced)`: el "referencia un sitemap" de §5.4 se exige solo cuando `robots.txt` existe. Rutas públicas = `/` + la ruta de cada `--url`. *Assets* de render = `link[rel~=stylesheet][href]` y `script[src]` con ruta del mismo origen (empiezan con `/`, no `//`) de las páginas revisadas; sin ninguno, no se evalúa esa parte (así `Disallow: /assets/` no falla en un proyecto que no los usa). Solo se evalúa el grupo `User-agent: *` (RFC 9309: gana la regla más larga; en empate, `Allow`). Next.js `app/robots.ts` → `unverified (generated)`. Con `--url`, el `robots.txt` servido manda: un proyecto sin el archivo no agrega una segunda entrada.
- **SEO-05:** el sitemap declarado se busca **por su ruta** (archivo en raíz/`public/`/`static/`, o pedido al origen de desarrollo). XML bien formado según el subconjunto de `lib/xml-check.mjs` (sin subconjunto interno de DTD), raíz `urlset` o `sitemapindex` con cualquier prefijo y un `loc` no vacío por ítem. Más de 10 MB → `unverified`. `app/sitemap.ts` → `unverified (generated)`.
- **SEO-04:** en HTML, `--url` y `--dom`, 0 o ≥ 2 `link[rel=canonical]` o `href` relativo → `fail`. En JSX: un `link` en el archivo se evalúa igual; si no hay, `metadata.alternates.canonical` literal absoluto → `pass`; relativo con `metadataBase` en el mismo objeto → `pass`; relativo sin él o ausente → `unverified` (el `metadataBase` o el canonical pueden estar en otro layout).
- **SEO-06:** título vacío → `fail`; sin `<title>` en HTML → `fail` (se superpone con A11Y-02 a propósito: otra severidad y otro motivo); duplicados (sin distinguir mayúsculas, espacios normalizados) **solo** entre HTML, `--dom` y `--url`: cada página del grupo da `fail` con `measure.count`. Los títulos de JSX se leen (`title`, `title.absolute`, `title.default`) pero nunca se comparan, porque un layout da valores por defecto.
- **SEO-09:** `a` sin `href` con `onclick`, `role` o `tabindex` → `fail`; `href` que empieza con `javascript:` → `fail`; `href` dinámico o spread → `unverified`; `a` sin `href` y sin nada de eso es un marcador de posición válido → sin hallazgo. Los componentes (`<Link>`) no se miran.
- **SEO-18:** en HTML/`--url`/`--dom`, faltan `og:title`, `og:type`, `og:image` u `og:url` (por `property` o `name`) → `fail` `detalle` con `measure.missing`. En JSX, sin `meta og:*`: `metadata.openGraph` con `title`, `type`, `url` e `images` → `pass`; con claves faltantes o sin `openGraph` → `unverified` (pueden venir de otro layout o de `opengraph-image`).
- **`acceptsIntentional`:** sí en SEO-01, 04, 05, 06 y 18; no en SEO-02 (para eso está `web.indexable: false`) ni en SEO-09 (un enlace no rastreable no es una elección de estilo). Ninguna es piso ni `bloquea`.
- **Fuentes del catálogo:** RFC 9309, RFC 6596, sitemaps.org 0.9, HTML Living Standard, Open Graph protocol y Google Search Central, cada una con `(consulted AAAA-MM-DD)` reemplazado por el día en que el implementador la abre. Si no puede abrirla, lo dice en su informe y no inventa la fecha; el cierre (Task B6) lo resuelve. Solo enlaces en `CREDITS.md`, sin copiar texto.
- **`ui-check.json`:** `inputs` suma `{ url, sha256 }` por cada recurso bajado con éxito (páginas, `robots.txt`, sitemaps), con la URL final. Es aditivo; `catalogVersion` pasa a `0.3.0`.
- **Invocación:** se suma `[--url <URL de desarrollo>]…` a la de §5.8; `--url` necesita `--design`. La compuerta del núcleo (hito 5) no la usa: no cambia ningún contrato que consuma el núcleo.
- **Alcance de SEO con `--base`:** `sourceFilesOf` suma `robots.txt` y `sitemap.xml` de la raíz, `public/` o `static/`, así la base ve los mismos archivos de sitio. Los hallazgos de `--url` no existen en la base: siempre `new` (nunca bloquean).
- **`files.mjs`:**
  - `save` exige la raíz del repo como `--project`, `--batch` dentro de `.pignolo-ui/`, una lista `[{ path, exists, change: tokens|structure }]` de 1 a 5 archivos, y rechaza (exit 1, sin escribir nada): ruta fuera del proyecto o bajo `.git/`/`.pignolo-ui/`, repetida (sin distinguir mayúsculas), `exists` que no coincide con el disco, un archivo esperado con cambios sin commitear (paso 2 de §9) y un lote que ya tiene `files.json`.
  - `verify` registra en `files.json` (`after`) el sha256 de cada archivo esperado y de cada cambio inesperado; exit 1 si hay cambios fuera de la lista. Informa las líneas cambiadas (`git diff --numstat` contra el `HEAD` de `save` + líneas de los archivos nuevos) y `overLineLimit` (> 200): informativo, el tope de líneas lo planifica el agente (§9 paso 1).
  - `restore` exige `verify` previo. Restaura los esperados que existían desde la copia y comprueba el sha256; borra los creados (esperados o inesperados sin seguimiento) solo si el sha256 coincide con `after`; **un cambio inesperado sobre un archivo con seguimiento o que ya estaba sucio queda `BLOCKED`** (no hay copia y git no se escribe): se le pregunta al usuario. Las carpetas vacías que quedan no se borran (git no las ve).
  - Archivos ignorados por git no aparecen en `git status`: un cambio del agente en uno de ellos no se detecta (declarado en el README).
- **`report.json`** (contrato nuevo, interno de pignolo-ui; lo escribe la skill en el hito 4):

  ```json
  {
    "version": 1,
    "implemented": true,
    "implements": { "path": "design/approved/checkout", "manifestSha256": "<64 hex>" },
    "evidence": { "ui-check.json": "<sha256>", "browser.json": "<sha256>" },
    "claims": [
      { "id": "c1", "text": "…", "rule": "A11Y-04", "status": "pass", "measure": { "ratio": 4.8 },
        "ref": { "source": "ui-check", "fingerprint": "A11Y-04|src/Save.tsx|button …", "line": 3 } },
      { "id": "c2", "text": "…", "ref": { "source": "capture", "path": "captures/home-1440.png", "sha256": "<64 hex>" } },
      { "id": "c3", "text": "…", "ref": { "source": "file", "path": "src/app/page.tsx", "sha256": "<64 hex>" } }
    ]
  }
  ```

  `implemented` es obligatorio; con `true`, `implements` también. `measure` se compara por igualdad exacta con el valor guardado (el crudo que dejó la regla). Una afirmación inválida (sin `text`, id repetido) se retira; un `report.json` que no es un objeto, sin `claims` o sin `implemented` booleano es error (exit 2).
- **`browser.json`** (contrato que hereda el hito 3): un objeto con `entries` de la misma forma que las de `ui-check.json` (`id`, `status`, `fingerprint`, `line?`, `measure?`). Hasta el hito 3, una afirmación que cita `browser` se retira con `browser.json not in the run`.
- **Versión:** `plugin.json` y CHANGELOG `0.3.0` (interfaces nuevas: `files`, `report-check`, `--url`; el catálogo suma 7 reglas).

---

## Ola 0 del 2b (en paralelo: Tasks B1, B2 y B3)

### Task B1 (opus): base del SEO en `ui-check` (runner, `--url`, sitio, catálogo)

**Files:**
- Create: `plugins/pignolo-ui/lib/site-fetch.mjs`, `lib/robots.mjs`, `lib/site-files.mjs`, `lib/rules/seo-common.mjs`
- Create (stubs, los reemplazan las Tasks B4 y B5): `lib/rules/seo-site.mjs`, `lib/rules/seo-page.mjs`
- Modify: `lib/ui-check.mjs`, `scripts/ui-check.mjs`, `lib/markup.mjs`, `catalog/rules.json`, `README.md` (solo el bloque entre `<!-- catalog:start -->` y `<!-- catalog:end -->`)
- Test: create `tests/robots.test.mjs`, `tests/site-fetch.test.mjs`, `tests/seo-common.test.mjs`; modify `tests/helpers.mjs`, `tests/markup.test.mjs`, `tests/ui-check-runner.test.mjs`, `tests/ui-check-cli.test.mjs`, `tests/catalog.test.mjs`

**Consumes:** `runCheck`, `parseMarkup`, `stripComments`, `pass`/`unverified`, `loadCatalog`, `renderCatalogMarkdown` (2a).

**Produces (contrato de la ola 1):**
- `runCheck({ …, urls = [], inject: { …, fetchOptions } })`; `pctx = { project, design, tokens, catalog, files, ctxs, site }` con `site` = resultado de `fetchSite` o `null` (siempre `null` en la corrida de la base); `ctx.origin` = `'file' | 'dom'`; `inputs` con `{ url, sha256 }`.
- `fetchSite({ urls, timeoutMs = 5000, maxBytes = 2 MiB, fetchImpl })` → `{ origin, pages, robots, sitemaps }` (ver el código); `isLoopbackUrl(u)`.
- `parseRobots(text)`, `isAllowed(robots, path)`, `matchPattern(pattern, path)`.
- `findSiteFile(project, urlPath)`, `generatedBy(project, name)`, `siteFiles(project)`.
- `seoGate(pctx)`, `seoPages(pctx)`, `indexable(pctx)`, `staticAttr(el, name)`, `metadataObject(ctx)`, `prop(objText, key)`, `webOf(design)`.
- `elements[i].inExpression` en `parseMarkup` (JSX; siempre `false` en HTML).
- `serveRoutes(routes)` → `{ base, close }` en `tests/helpers.mjs`.
- Catálogo `0.3.0` con los 7 ids de SEO (abajo) y el bloque del README regenerado.

- [ ] **Paso 1: tests primero.** Crear y modificar los tests así (código completo):

`tests/helpers.mjs` (agregado):

```diff
diff --git a/plugins/pignolo-ui/tests/helpers.mjs b/plugins/pignolo-ui/tests/helpers.mjs
--- a/plugins/pignolo-ui/tests/helpers.mjs
+++ b/plugins/pignolo-ui/tests/helpers.mjs
@@ -3,6 +3,7 @@ import os from 'node:os';
 import path from 'node:path';
 import { fileURLToPath } from 'node:url';
 import { spawnSync } from 'node:child_process';
+import http from 'node:http';
 
 export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
 export const PLUGIN_ROOT = path.join(TESTS_DIR, '..');
@@ -45,3 +46,20 @@ export function runScript(script, args, opts = {}) {
   try { json = JSON.parse(res.stdout); } catch { /* not JSON */ }
   return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
 }
+
+// Serves routes on 127.0.0.1 (random port) for the tests of the development URL; never the
+// network. routes = { '/path': { status, headers, body } | (req, res) => void }; others 404.
+export async function serveRoutes(routes) {
+  const server = http.createServer((req, res) => {
+    const r = routes[req.url];
+    if (typeof r === 'function') return r(req, res);
+    if (!r) { res.writeHead(404); res.end(); return undefined; }
+    res.writeHead(r.status ?? 200, r.headers ?? {});
+    res.end(r.body ?? '');
+    return undefined;
+  });
+  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
+  const base = `http://127.0.0.1:${server.address().port}`;
+  const close = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
+  return { base, close };
+}
```

`tests/robots.test.mjs`:

```js
// robots.txt reader (lib/robots.mjs, RFC 9309).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed, matchPattern } from '../lib/robots.mjs';

const ROBOTS = [
  'User-agent: *',
  'Disallow: /admin',
  'Allow: /admin/public$',
  'Disallow: /*.pdf$',
  'Sitemap: https://www.example.com/sitemap.xml',
  '',
  'User-agent: Googlebot',
  'Disallow: /',
  '',
].join('\n');

test('parseRobots: groups, rules with line numbers and sitemaps', () => {
  const r = parseRobots(ROBOTS);
  assert.equal(r.groups.length, 2);
  assert.deepEqual(r.groups[0].agents, ['*']);
  assert.deepEqual(r.groups[0].rules.map((x) => [x.allow, x.pattern, x.line]), [[false, '/admin', 2], [true, '/admin/public$', 3], [false, '/*.pdf$', 4]]);
  assert.deepEqual(r.sitemaps, [{ url: 'https://www.example.com/sitemap.xml', line: 5 }]);
});

test('isAllowed evaluates the * group: longest match wins, allow wins a tie', async (t) => {
  const r = parseRobots(ROBOTS);
  const CASES = [['/', true], ['/admin', false], ['/admin/x', false], ['/admin/public', true], ['/admin/public/x', false],
    ['/a.pdf', false], ['/a.pdf?x=1', true], ['/robots.txt', true]];
  for (const [p, allowed] of CASES) await t.test(p, () => assert.equal(isAllowed(r, p).allowed, allowed));
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /x\nAllow: /x'), '/x').allowed, true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), '/').allowed, true); // empty disallow is no rule
  assert.equal(isAllowed(parseRobots('User-agent: a\nUser-agent: *\nDisallow: /p'), '/p').allowed, false); // shared group
  assert.equal(isAllowed(parseRobots('User-agent: Googlebot\nDisallow: /'), '/').allowed, true); // no * group
  assert.equal(isAllowed(parseRobots('\uFEFFUser-agent: *\r\nDisallow: / # all\r\n'), '/x').rule.line, 2);
});

test('matchPattern: * and $ without regex, linear on long inputs', () => {
  assert.equal(matchPattern('/a*b$', '/axxb'), true);
  assert.equal(matchPattern('/a*b$', '/axxbc'), false);
  assert.equal(matchPattern('/a*b', '/axxbc'), true);
  assert.equal(matchPattern('/*.css$', '/x/y.css'), true);
  const start = Date.now();
  assert.equal(matchPattern(`/${'*a'.repeat(2000)}b$`, `/${'a'.repeat(5000)}`), false);
  assert.ok(Date.now() - start < 2000, 'pattern matching must stay linear-ish');
});
```

`tests/site-fetch.test.mjs`:

```js
// Fetch of the development URL (lib/site-fetch.mjs): loopback only, same-origin redirects,
// byte cap and timeouts. The server runs on 127.0.0.1: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveRoutes } from './helpers.mjs';
import { isLoopbackUrl, fetchSite } from '../lib/site-fetch.mjs';

test('isLoopbackUrl accepts only local http(s) addresses', async (t) => {
  const CASES = [
    ['http://localhost:3000/', true], ['http://127.0.0.1/', true], ['http://[::1]:5173/x', true], ['http://app.localhost/', true],
    ['http://127.1.2.3/', true], ['http://2130706433/', true], // WHATWG URL normalizes to 127.0.0.1
    ['https://example.com/', false], ['http://10.0.0.1/', false], ['http://192.168.0.10:3000/', false],
    ['http://127.0.0.1.example.com/', false], ['file:///c:/x.html', false], ['http://u:p@localhost/', false], ['nope', false],
  ];
  for (const [u, ok] of CASES) await t.test(u, () => assert.equal(isLoopbackUrl(u), ok));
});

test('fetchSite: pages, robots.txt, sitemaps by path, redirects, caps and timeouts', async () => {
  const html = (body, headers = {}) => ({ headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body });
  const srv = await serveRoutes({
    '/': html('<!doctype html><html lang="es"><head><title>Inicio</title></head><body>ñ</body></html>', { 'x-robots-tag': 'noindex' }),
    '/same': { status: 301, headers: { location: '/' } },
    '/away': { status: 302, headers: { location: 'https://www.example.com/login' } },
    '/big': { body: 'x'.repeat(3 * 1024 * 1024) },
    '/hang': () => {},
    '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nSitemap: https://www.example.com/sitemap.xml\n' },
    '/sitemap.xml': { headers: { 'content-type': 'application/xml' }, body: '<urlset></urlset>' },
  });
  try {
    const u = (p) => `${srv.base}${p}`;
    const site = await fetchSite({ urls: [u('/'), u('/same'), u('/away'), u('/big'), u('/hang'), u('/missing')], timeoutMs: 400 });
    const [root, same, away, big, hang, missing] = site.pages;
    assert.equal(root.status, 200);
    assert.equal(root.headers['x-robots-tag'], 'noindex');
    assert.match(root.text, /ñ/);
    assert.match(root.sha256, /^[0-9a-f]{64}$/);
    assert.equal(new URL(same.finalUrl).pathname, '/');
    assert.equal(same.path, '/same');
    assert.equal(away.error, 'redirected outside the development origin');
    assert.match(big.error, /larger than/);
    assert.match(hang.error, /no response in 400 ms/);
    assert.equal(missing.status, 404);
    assert.equal(site.robots.status, 200);
    // the production URL in robots.txt is never requested: its path is fetched on the dev origin
    assert.deepEqual(site.sitemaps.map((s) => [s.path, s.status, s.declared]), [['/sitemap.xml', 200, 'https://www.example.com/sitemap.xml']]);
  } finally {
    await srv.close();
  }
});

test('fetchSite refuses a non-loopback URL and URLs of two origins', async () => {
  await assert.rejects(fetchSite({ urls: ['https://example.com/'] }), /not a loopback URL/);
  await assert.rejects(fetchSite({ urls: ['http://127.0.0.1:1/', 'http://localhost:2/'] }), /one origin/);
  assert.equal(await fetchSite({ urls: [] }), null);
});
```

`tests/seo-common.test.mjs`:

```js
// Shared pieces of the SEO rules (lib/site-files.mjs, lib/rules/seo-common.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { findSiteFile, generatedBy, siteFiles } from '../lib/site-files.mjs';
import { seoGate, seoPages, prop, metadataObject } from '../lib/rules/seo-common.mjs';
import { parseMarkup } from '../lib/markup.mjs';

test('site files: root, public/ and static/; generated route handlers are not files', () => {
  const p = writeTree(makeTempDir(), { 'public/robots.txt': 'x', 'static/sitemap.xml': 'x', 'app/robots.ts': 'x', 'src/app/sitemap.ts': 'x' });
  assert.equal(findSiteFile(p, '/robots.txt'), 'public/robots.txt');
  assert.equal(findSiteFile(p, 'sitemap.xml'), 'static/sitemap.xml');
  assert.equal(findSiteFile(p, '/nope.xml'), null);
  assert.equal(findSiteFile(p, '/../x'), null);
  assert.equal(generatedBy(p, 'robots'), 'app/robots.ts');
  assert.equal(generatedBy(p, 'sitemap'), 'src/app/sitemap.ts');
  assert.deepEqual(siteFiles(p), ['public/robots.txt', 'static/sitemap.xml']);
});

const design = (web) => ({ data: { pignolo: { schema: 1, ...(web ? { web } : {}) } } });

test('seoGate: runs only when DESIGN.md declares web.public: true', () => {
  assert.match(seoGate({ design: null })[0].reason, /no DESIGN\.md/);
  assert.equal(seoGate({ design: null })[0].status, 'pass');
  assert.equal(seoGate({ design: { data: null } })[0].status, 'unverified');
  assert.match(seoGate({ design: design({ public: false }) })[0].reason, /web\.public is not true/);
  assert.match(seoGate({ design: design(null) })[0].reason, /web\.public is not true/);
  assert.equal(seoGate({ design: design({ public: true }) }), null);
});

const ctx = (file, text, extra = {}) => {
  const syntax = file.endsWith('.tsx') ? 'jsx' : 'html';
  const markup = parseMarkup(text, { syntax });
  return { file, text, syntax, markup, isDocument: markup.hasHtmlRoot, mockup: false, origin: 'file', ...extra };
};

test('seoPages: documents among the inputs, never mockups or fragments; fetched pages with skip reasons', () => {
  const doc = '<!doctype html><html><head><title>A</title></head><body></body></html>';
  const page = (p, extra = {}) => ({ url: `http://127.0.0.1:1${p}`, path: p, finalUrl: `http://127.0.0.1:1${p}`, status: 200, headers: { 'content-type': 'text/html' }, text: doc, ...extra });
  const pages = seoPages({
    ctxs: [ctx('index.html', doc), ctx('Card.tsx', 'export const C = () => <div/>;'), ctx('design/approved/x/home.html', doc, { mockup: true })],
    site: { pages: [
      page('/'), page('/a/', { finalUrl: 'http://127.0.0.1:1/a' }), page('/cuenta', { finalUrl: 'http://127.0.0.1:1/login' }),
      page('/b', { status: 500 }), page('/c', { headers: { 'content-type': 'application/json' } }),
      page('/d', { text: '<html><body><form><input type="password"></form></body></html>' }), { url: 'http://127.0.0.1:1/e', path: '/e', error: 'no response in 5000 ms' },
    ] },
  });
  assert.deepEqual(pages.map((p) => [p.file.replace('http://127.0.0.1:1', ''), p.origin, p.skip]), [
    ['index.html', 'file', null], ['/', 'url', null], ['/a/', 'url', null],
    ['/cuenta', 'url', 'redirected to /login (may require a session)'], ['/b', 'url', 'HTTP 500'], ['/c', 'url', 'not an HTML response'],
    ['/d', 'url', 'requires a session (password field)'], ['/e', 'url', 'no response in 5000 ms'],
  ]);
});

test('prop reads first-level literals of a metadata object and marks the rest dynamic', () => {
  const src = "{ title: { template: '%s | T', default: 'T' }, robots: { index: false, googleBot: { index: true } }, alternates: { canonical: '/' }, metadataBase: new URL('https://x.com'), description: `a${b}`, n: 2, openGraph: { title: 'T', images: ['/og.png'] } }";
  assert.deepEqual(prop(src, 'title'), { kind: 'object', text: "{ template: '%s | T', default: 'T' }" });
  assert.deepEqual(prop(prop(src, 'title').text, 'default'), { kind: 'string', value: 'T' });
  assert.equal(prop(src, 'robots').kind, 'object');
  assert.deepEqual(prop(src, 'metadataBase'), { kind: 'dynamic' });
  assert.deepEqual(prop(src, 'description'), { kind: 'dynamic' });
  assert.deepEqual(prop(src, 'n'), { kind: 'literal', value: '2' });
  assert.equal(prop(src, 'canonical'), null); // not at the first level
  assert.deepEqual(prop(prop(src, 'alternates').text, 'canonical'), { kind: 'string', value: '/' });
  assert.equal(prop("{ robots: process.env.X ? { index: false } : undefined }", 'robots').kind, 'dynamic');
  assert.equal(prop("{ robots: { index: isPreview } }", 'robots').kind, 'dynamic');
  assert.equal(prop("{ other: 'title: x' }", 'title'), null); // inside a string
});

test('metadataObject: Next.js export const metadata, typed or not; generateMetadata is dynamic', () => {
  const m = (text) => metadataObject(ctx('app/layout.tsx', text));
  assert.equal(m("export const metadata: Metadata = { title: 'A' };\nexport default function L() { return <html></html>; }").text, "{ title: 'A' }");
  assert.equal(m("export const metadata = { title: 'A' };").text, "{ title: 'A' }");
  assert.deepEqual(m('export async function generateMetadata() { return {}; }'), { dynamic: true });
  assert.equal(m('export default function L() { return <html></html>; }'), null);
  assert.equal(metadataObject(ctx('index.html', '<html></html>')), null);
});
```

`tests/markup.test.mjs`, `tests/ui-check-runner.test.mjs`, `tests/ui-check-cli.test.mjs` y `tests/catalog.test.mjs`:

```diff
diff --git a/plugins/pignolo-ui/tests/catalog.test.mjs b/plugins/pignolo-ui/tests/catalog.test.mjs
--- a/plugins/pignolo-ui/tests/catalog.test.mjs
+++ b/plugins/pignolo-ui/tests/catalog.test.mjs
@@ -7,20 +7,21 @@ const SPEC_5_4 = ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-05', 'A11Y-16', 'A11Y-2
   'STATE-04', 'MOTION-03', 'MOTION-04', 'COLOR-02', 'DEPTH-01', 'LAYOUT-04', 'DRIFT-01', 'THEME-01', 'THEME-02', 'COLOR-11',
   'COLOR-12', 'ICON-01', 'CONTENT-01', 'COPY-01', 'META-01'];
 const BROWSER = ['NAV-01', 'LAYOUT-10', 'LAYOUT-11', 'MOTION-07'];
+const SEO = ['SEO-01', 'SEO-02', 'SEO-04', 'SEO-05', 'SEO-06', 'SEO-09', 'SEO-18'];
 
-test('catalog ids cover the 25 rules of spec 5.4, THEME-03 and the 4 browser checks', () => {
+test('catalog ids cover the 25 rules of spec 5.4, THEME-03, the 4 browser checks and the 7 SEO ids', () => {
   const ids = catalog.rules.map((r) => r.id);
-  assert.deepEqual([...ids].sort(), [...SPEC_5_4, 'THEME-03', ...BROWSER].sort());
-  assert.equal(catalog.catalogVersion, '0.2.0');
+  assert.deepEqual([...ids].sort(), [...SPEC_5_4, 'THEME-03', ...BROWSER, ...SEO].sort());
+  assert.equal(catalog.catalogVersion, '0.3.0');
 });
 
 test('the real catalog has no problems', () => {
   assert.deepEqual(checkCatalog(catalog), []);
 });
 
-test('checkers: 25 ui-check, THEME-03 design-md, browser rules browser; COLOR-12 related to COLOR-03', () => {
+test('checkers: 25 + 7 SEO ui-check, THEME-03 design-md, browser rules browser; COLOR-12 related to COLOR-03', () => {
   const by = (c) => catalog.rules.filter((r) => r.checker === c).map((r) => r.id).sort();
-  assert.deepEqual(by('ui-check'), [...SPEC_5_4].sort());
+  assert.deepEqual(by('ui-check'), [...SPEC_5_4, ...SEO].sort());
   assert.deepEqual(by('design-md'), ['THEME-03']);
   assert.deepEqual(by('browser'), [...BROWSER].sort());
   for (const id of BROWSER) assert.equal(catalog.rules.find((r) => r.id === id).class, 'browser', id);
@@ -65,3 +66,15 @@ test('checkCatalog: conflicting rules on disjoint platforms can coexist', () =>
   const rules = [base({ platform: 'D', conflicts: ['X-02'] }), base({ id: 'X-02', platform: 'M' })];
   assert.deepEqual(checkCatalog({ catalogVersion: '0.2.0', rules }), []);
 });
+
+test('SEO never blocks: document level, no floor, no bloquea; SEO-02 and SEO-09 refuse intentional', () => {
+  for (const id of SEO) {
+    const r = catalog.rules.find((x) => x.id === id);
+    assert.equal(r.level, 'document', id);
+    assert.equal(r.floor, false, id);
+    assert.notEqual(r.severity, 'bloquea', id);
+    assert.equal(r.acceptsIntentional, !['SEO-02', 'SEO-09'].includes(id), id);
+  }
+  assert.equal(catalog.rules.find((x) => x.id === 'SEO-02').severity, 'alto');
+  assert.equal(catalog.rules.find((x) => x.id === 'SEO-18').severity, 'detalle');
+});
diff --git a/plugins/pignolo-ui/tests/markup.test.mjs b/plugins/pignolo-ui/tests/markup.test.mjs
--- a/plugins/pignolo-ui/tests/markup.test.mjs
+++ b/plugins/pignolo-ui/tests/markup.test.mjs
@@ -190,3 +190,21 @@ test('markup jsx literal expressions are static; bare aria-* is "true"', () => {
     assert.deepEqual([a.value, a.dynamic], [value, dynamic], src);
   }
 });
+
+test('JSX elements inside a {…} child expression are marked inExpression, with their subtree', () => {
+  const src = [
+    'export default function L({ children, preview, items }) {',
+    '  return (',
+    '    <html lang="es">',
+    '      <head><meta name="description" content="x" />{preview && <meta name="robots" content="noindex" />}</head>',
+    '      <body><main>{children}{items.map((i) => <a key={i} href={i}><span>x</span></a>)}</main></body>',
+    '    </html>',
+    '  );',
+    '}',
+  ].join('\n');
+  const m = parseMarkup(src, { syntax: 'jsx' });
+  assert.deepEqual(m.elements.map((e) => [e.tag, e.inExpression]), [
+    ['html', false], ['head', false], ['meta', false], ['meta', true], ['body', false], ['main', false], ['a', true], ['span', true],
+  ]);
+  assert.equal(parseMarkup('<p><b>x</b></p>', { syntax: 'html' }).elements.every((e) => e.inExpression === false), true);
+});
diff --git a/plugins/pignolo-ui/tests/ui-check-cli.test.mjs b/plugins/pignolo-ui/tests/ui-check-cli.test.mjs
--- a/plugins/pignolo-ui/tests/ui-check-cli.test.mjs
+++ b/plugins/pignolo-ui/tests/ui-check-cli.test.mjs
@@ -4,8 +4,9 @@ import assert from 'node:assert/strict';
 import fs from 'node:fs';
 import path from 'node:path';
 import crypto from 'node:crypto';
-import { execFileSync } from 'node:child_process';
-import { makeTempDir, writeTree, runScript } from './helpers.mjs';
+import { execFileSync, spawn } from 'node:child_process';
+import { makeTempDir, writeTree, runScript, serveRoutes, PLUGIN_ROOT } from './helpers.mjs';
+import { loadCatalog } from '../lib/catalog.mjs';
 
 const CSS = '.a { display: block; }\n';
 const DESIGN = '---\npignolo:\n  schema: 1\n---\n';
@@ -58,7 +59,7 @@ test('a healthy run writes ui-check.json inside an ignored run folder', () => {
   assert.deepEqual(Object.keys(r.json.counts).sort(), ['blockingNew', 'fail', 'pass', 'unverified']);
   const report = JSON.parse(fs.readFileSync(out, 'utf8'));
   assert.deepEqual(Object.keys(report).sort(), ['base', 'catalogVersion', 'entries', 'inputs']);
-  assert.equal(report.catalogVersion, '0.2.0');
+  assert.equal(report.catalogVersion, loadCatalog().catalogVersion);
   assert.equal(report.base, null);
   assert.deepEqual(report.inputs[0], { file: 'src/a.css', sha256: crypto.createHash('sha256').update(CSS).digest('hex') });
   assert.ok(report.entries.length > 0);
@@ -137,3 +138,38 @@ test('an invalid --base is a usage error checked before any rule runs', async ()
   assert.equal(checked, 0, 'runCheck must not run with an invalid --base');
   assert.deepEqual(errors, ['ui-check: --base no es una ref válida: nope\n']);
 });
+
+test('--url: loopback only, one origin, at most 20, needs --design; fetched pages go to inputs', async (t) => {
+  const repo = makeRepo();
+  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
+  const base = ['--project', repo, '--run', run, '--design', 'DESIGN.md'];
+  const many = Array.from({ length: 21 }, (_, i) => ['--url', `http://127.0.0.1:1/${i}`]).flat();
+  const CASES = [
+    ['remote URL', [...base, '--url', 'https://example.com/'], /--url solo acepta direcciones locales/],
+    ['two origins', [...base, '--url', 'http://127.0.0.1:1/', '--url', 'http://localhost:2/'], /mismo origen/],
+    ['more than 20', [...base, ...many], /como mucho 20/],
+    ['without --design', ['--project', repo, '--run', run, '--url', 'http://127.0.0.1:1/'], /--url necesita --design/],
+  ];
+  for (const [name, args, message] of CASES) {
+    await t.test(name, () => {
+      const r = runScript('ui-check.mjs', args, { cwd: repo });
+      assert.equal(r.status, 2, r.stderr);
+      assert.match(r.stderr, message);
+      assert.doesNotMatch(r.stderr, /\n\s+at /);
+    });
+  }
+  const srv = await serveRoutes({ '/': { headers: { 'content-type': 'text/html' }, body: '<!doctype html><html lang="es"><head><title>A</title></head><body></body></html>' } });
+  try {
+    const r = await new Promise((resolve) => {
+      const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'ui-check.mjs'), ...base, '--url', `${srv.base}/`], { cwd: repo });
+      let out = '';
+      child.stdout.on('data', (d) => { out += d; });
+      child.on('close', (status) => resolve({ status, out }));
+    });
+    assert.equal(r.status, 0, r.out);
+    const report = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
+    assert.ok(report.inputs.some((i) => i.url === `${srv.base}/` && /^[0-9a-f]{64}$/.test(i.sha256)), JSON.stringify(report.inputs));
+  } finally {
+    await srv.close();
+  }
+});
diff --git a/plugins/pignolo-ui/tests/ui-check-runner.test.mjs b/plugins/pignolo-ui/tests/ui-check-runner.test.mjs
--- a/plugins/pignolo-ui/tests/ui-check-runner.test.mjs
+++ b/plugins/pignolo-ui/tests/ui-check-runner.test.mjs
@@ -186,3 +186,13 @@ test('mockup: design/approved and .pignolo-ui/runs files, not src', async () =>
     { inject: { rules: [spy] } });
   assert.deepEqual(mock, { 'design/approved/home/index.html': true, '.pignolo-ui/runs/r1/option-a/home.html': true, 'src/home.html': false });
 });
+
+test('project rules receive the file contexts and the fetched site; each ctx says its origin', async () => {
+  let seen = null;
+  const spy = { id: 'SEO-06', checkProject: (pctx) => { seen = pctx; return [pass('k')]; } };
+  const r = await run({ 'index.html': '<html><head><title>A</title></head></html>\n', 'dom.html': '<html></html>\n' },
+    { files: ['index.html'], dom: ['dom.html'], inject: { rules: [spy] } });
+  assert.equal(r.exitCode, 0);
+  assert.deepEqual(seen.ctxs.map((c) => [c.file, c.origin, c.isDocument]), [['index.html', 'file', true], ['dom.html', 'dom', true]]);
+  assert.equal(seen.site, null);
+});
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/robots.test.mjs plugins/pignolo-ui/tests/site-fetch.test.mjs plugins/pignolo-ui/tests/seo-common.test.mjs plugins/pignolo-ui/tests/markup.test.mjs plugins/pignolo-ui/tests/ui-check-runner.test.mjs plugins/pignolo-ui/tests/ui-check-cli.test.mjs plugins/pignolo-ui/tests/catalog.test.mjs` → fallan los tres archivos nuevos (módulos ausentes), el caso `inExpression`, el de `pctx.ctxs`, el de `--url` y los tres del catálogo; anotar el resumen.
- [ ] **Paso 3: implementar.**

`lib/robots.mjs`:

```js
// robots.txt reader (RFC 9309, 2022-09): groups, allow/disallow with `*` and `$`, sitemaps.
// Only the group(s) for `*` are evaluated (declared: specific crawlers are not modeled).
//
// parseRobots(text) -> { groups: [{ agents, rules: [{ allow, pattern, line }] }], sitemaps: [{ url, line }] }
// isAllowed(robots, path) -> { allowed, rule }   rule = the deciding rule or null
// matchPattern(pattern, path) -> boolean          `*` = any run of characters, final `$` = end
//
// Never uses RegExp built from the file: a long pattern with many `*` stays O(n*m).

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) return;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      return;
    }
    lastWasAgent = false;
    if (key === 'sitemap') { if (value) sitemaps.push({ url: value, line: i + 1 }); return; }
    if ((key === 'allow' || key === 'disallow') && current) {
      if (value === '') return; // an empty disallow is no rule
      current.rules.push({ allow: key === 'allow', pattern: value, line: i + 1 });
    }
  });
  return { groups, sitemaps };
}

// Iterative wildcard match with backtracking to the last `*` only: O(len(path) * len(pattern)).
export function matchPattern(pattern, path) {
  let p = pattern;
  let anchored = false;
  if (p.endsWith('$')) { anchored = true; p = p.slice(0, -1); }
  if (!anchored) p += '*';
  let i = 0; // path
  let j = 0; // pattern
  let star = -1;
  let mark = 0;
  while (i < path.length) {
    if (j < p.length && p[j] !== '*' && p[j] === path[i]) { i++; j++; }
    else if (j < p.length && p[j] === '*') { star = j++; mark = i; }
    else if (star >= 0) { j = star + 1; i = ++mark; }
    else return false;
  }
  while (j < p.length && p[j] === '*') j++;
  return j === p.length;
}

export function isAllowed(robots, path) {
  if (path === '/robots.txt') return { allowed: true, rule: null };
  const rules = robots.groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!matchPattern(r.pattern, path)) continue;
    const len = r.pattern.length;
    if (!best || len > best.pattern.length || (len === best.pattern.length && r.allow && !best.allow)) best = r;
  }
  return { allowed: best ? best.allow : true, rule: best };
}
```

`lib/site-fetch.mjs`:

```js
// Fetch of the development URL for the static SEO checks (spec §5.4, A-06). Local only: the
// plugin never reaches anything remote at run time (spec §0), so every URL must be loopback.
//
// isLoopbackUrl(u) -> boolean      http(s) on localhost, *.localhost, 127.0.0.0/8 or [::1]
// fetchSite({ urls, timeoutMs = 5000, maxBytes = 2 MiB, fetchImpl = fetch })
//   -> { origin, pages: [resource], robots: resource, sitemaps: [resource & { declared }] } or null without urls
//   page/resource = { url, path, finalUrl, status, headers: { 'content-type', 'x-robots-tag' },
//                     text, sha256 } | { url, path, error }
// Redirects are followed by hand, up to 5 hops, and only inside the same origin; a hop to
// another origin stops with error 'redirected outside the development origin'. Never throws
// for network problems: they become `error` (the rules turn it into unverified).
import crypto from 'node:crypto';
import { parseRobots } from './robots.mjs';

const MAX_HOPS = 5;
const MAX_SITEMAPS = 5;

export function isLoopbackUrl(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '[::1]') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return Boolean(m) && Number(m[1]) === 127 && m.slice(2).every((x) => Number(x) <= 255);
}

async function readCapped(res, maxBytes) {
  if (!res.body) return { buf: Buffer.alloc(0), tooLarge: false };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => {}); return { buf: null, tooLarge: true }; }
    chunks.push(value);
  }
  return { buf: Buffer.concat(chunks.map((c) => Buffer.from(c))), tooLarge: false };
}

async function fetchOne(url, { origin, timeoutMs, maxBytes, fetchImpl }) {
  const path = new URL(url).pathname;
  let current = url;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const res = await fetchImpl(current, { redirect: 'manual', signal, headers: { accept: 'text/html,application/xml,text/plain;q=0.9,*/*;q=0.5' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), current);
        await res.body?.cancel().catch(() => {});
        if (next.origin !== origin) return { url, path, error: 'redirected outside the development origin' };
        current = next.href;
        continue;
      }
      const body = await readCapped(res, maxBytes);
      if (body.tooLarge) return { url, path, error: `response larger than ${maxBytes} bytes` };
      return {
        url,
        path,
        finalUrl: current,
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') ?? '', 'x-robots-tag': res.headers.get('x-robots-tag') ?? '' },
        text: body.buf.toString('utf8'),
        sha256: crypto.createHash('sha256').update(body.buf).digest('hex'),
      };
    }
    return { url, path, error: 'too many redirects' };
  } catch (e) {
    const why = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? `no response in ${timeoutMs} ms` : `request failed (${e && e.cause && e.cause.code ? e.cause.code : e && e.message})`;
    return { url, path, error: why };
  }
}

export async function fetchSite({ urls, timeoutMs = 5000, maxBytes = 2 * 1024 * 1024, fetchImpl = globalThis.fetch } = {}) {
  if (!Array.isArray(urls) || urls.length === 0) return null;
  for (const u of urls) if (!isLoopbackUrl(u)) throw new Error(`not a loopback URL: ${u}`);
  const origin = new URL(urls[0]).origin;
  for (const u of urls) if (new URL(u).origin !== origin) throw new Error(`all --url must share one origin: ${u}`);
  const opts = { origin, timeoutMs, maxBytes, fetchImpl };
  const pages = [];
  for (const u of urls) pages.push(await fetchOne(u, opts));
  const robots = await fetchOne(new URL('/robots.txt', origin).href, opts);
  // sitemaps referenced by robots.txt, fetched by their path on the development origin
  // (a production URL in robots.txt is never requested: nothing remote at run time)
  const sitemaps = [];
  if (!robots.error && robots.status === 200) {
    for (const s of parseRobots(robots.text).sitemaps.slice(0, MAX_SITEMAPS)) {
      let p;
      try { p = new URL(s.url, origin).pathname; } catch { continue; }
      sitemaps.push({ ...(await fetchOne(new URL(p, origin).href, opts)), declared: s.url });
    }
  }
  return { origin, pages, robots, sitemaps };
}
```

`lib/site-files.mjs`:

```js
// Where a web project keeps the files served at the site root (robots.txt, sitemap.xml...):
// the project root, public/ (Next.js, Vite, CRA) and static/ (SvelteKit). Framework route
// handlers that generate them (Next.js app/robots.ts, app/sitemap.ts) are not files: they
// are reported as generated, never read.
//
// findSiteFile(project, urlPath) -> project-relative posix path or null
// generatedBy(project, name)     -> project-relative path of app/<name>.(ts|js|tsx|jsx) or null
// siteFiles(project)             -> the robots.txt and sitemap.xml that exist (for the scope's
//                                   single source list)
import fs from 'node:fs';
import path from 'node:path';

export const SITE_ROOTS = ['', 'public/', 'static/'];
const APP_DIRS = ['app/', 'src/app/'];
const EXTS = ['ts', 'js', 'tsx', 'jsx', 'mjs'];

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

export function findSiteFile(project, urlPath) {
  const rel = String(urlPath).replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return null;
  for (const root of SITE_ROOTS) {
    const candidate = `${root}${rel}`;
    if (isFile(path.join(project, ...candidate.split('/')))) return candidate;
  }
  return null;
}

export function generatedBy(project, name) {
  for (const dir of APP_DIRS) {
    for (const ext of EXTS) {
      const candidate = `${dir}${name}.${ext}`;
      if (isFile(path.join(project, ...candidate.split('/')))) return candidate;
    }
  }
  return null;
}

export function siteFiles(project) {
  return ['robots.txt', 'sitemap.xml'].map((n) => findSiteFile(project, n)).filter(Boolean);
}
```

`lib/rules/seo-common.mjs`:

```js
// Shared pieces of the static SEO rules (spec §5.4, A-06): the web.public gate, the pages to
// check (documents among the inputs and pages fetched from the development URL) and a reader
// of literal values in a Next.js `export const metadata = { ... }` object.
//
// seoGate(pctx) -> null when the rules run, else the one finding each SEO rule returns
// seoPages(pctx) -> [{ file, origin: 'file'|'dom'|'url', syntax, markup, text, headers, skip }]
//   skip = reason (string) when the page cannot be checked; mockups never count (spec §3.3).
// metadataObject(ctx) -> { dynamic: true } | { text } | null   (JSX files only)
// prop(objText, key) -> { kind: 'string'|'literal'|'object'|'array'|'dynamic', value?, text? } | null
//   Only keys at the first level of objText (which starts with `{`) are found.
// staticAttr(el, name) -> string | null (null when absent, dynamic or boolean)
import { pass, unverified } from './api.mjs';
import { parseMarkup } from '../markup.mjs';
import { stripComments } from '../strip-comments.mjs';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function webOf(design) {
  const pig = design && isMap(design.data) && isMap(design.data.pignolo) ? design.data.pignolo : null;
  return pig && isMap(pig.web) ? pig.web : null;
}

export function seoGate(pctx) {
  if (!pctx.design) return [pass('not public', { reason: 'no DESIGN.md: the site is not declared public (static SEO does not apply)' })];
  if (!isMap(pctx.design.data)) return [unverified('DESIGN.md not validated: cannot tell whether the site is public')];
  const web = webOf(pctx.design);
  if (!web || web.public !== true) return [pass('not public', { reason: 'web.public is not true: static SEO does not apply' })];
  return null;
}

export const indexable = (pctx) => webOf(pctx.design)?.indexable !== false;

export function staticAttr(el, name) {
  const a = el.attrs.get(name);
  return a && !a.dynamic && typeof a.value === 'string' ? a.value : null;
}

const samePath = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

export function seoPages(pctx) {
  const out = [];
  for (const ctx of pctx.ctxs ?? []) {
    if (!ctx.isDocument || ctx.mockup || !ctx.markup) continue;
    out.push({ file: ctx.file, origin: ctx.origin ?? 'file', syntax: ctx.syntax, markup: ctx.markup, text: ctx.text, headers: null, skip: null });
  }
  for (const page of pctx.site?.pages ?? []) {
    const doc = { file: page.url, origin: 'url', syntax: 'html', markup: null, text: '', headers: page.headers ?? null, skip: null };
    if (page.error) doc.skip = page.error;
    else if (page.status !== 200) doc.skip = `HTTP ${page.status}`;
    else if (!/\bhtml\b/i.test(page.headers?.['content-type'] ?? '')) doc.skip = 'not an HTML response';
    else if (!samePath(new URL(page.finalUrl).pathname, page.path)) doc.skip = `redirected to ${new URL(page.finalUrl).pathname} (may require a session)`;
    else {
      doc.text = stripComments(page.text, 'html');
      doc.markup = parseMarkup(doc.text, { syntax: 'html' });
      if (!doc.markup.hasHtmlRoot) doc.skip = 'not a document';
      else if (doc.markup.elements.some((e) => e.tag === 'input' && (staticAttr(e, 'type') ?? '').toLowerCase() === 'password')) doc.skip = 'requires a session (password field)';
    }
    out.push(doc);
  }
  return out;
}

// Same length as src; the content of string literals becomes spaces (quotes stay).
function maskStrings(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += c + ' '.repeat(Math.max(0, Math.min(j, src.length) - i - 1)) + (j < src.length ? c : '');
      i = j + 1;
    } else { out += c; i++; }
  }
  return out.slice(0, src.length);
}

const OPEN = { '{': '}', '[': ']', '(': ')' };
function closeOf(masked, at) {
  let depth = 0;
  for (let i = at; i < masked.length; i++) {
    if (masked[i] in OPEN) depth++;
    else if (masked[i] === '}' || masked[i] === ']' || masked[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const IDENT = /[A-Za-z_$][\w$]*/g;
const LITERALS = new Set(['true', 'false', 'null', 'undefined']);
// true when every identifier is a key (followed by `:`) or a literal: no variables, calls, spreads.
function isStaticValue(masked) {
  if (masked.includes('...') || masked.includes('${')) return false;
  const colon = /\s*:/y;
  for (const m of masked.matchAll(IDENT)) {
    colon.lastIndex = m.index + m[0].length;
    if (colon.test(masked) || LITERALS.has(m[0])) continue;
    return false;
  }
  return true;
}

export function prop(objText, key) {
  const masked = maskStrings(objText);
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c in OPEN) { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (depth !== 1 || !masked.startsWith(key, i)) continue;
    if (/[\w$]/.test(masked[i - 1] ?? '') || /[\w$]/.test(masked[i + key.length] ?? '')) continue;
    const m = /^\s*:\s*/.exec(masked.slice(i + key.length));
    if (!m) continue;
    const v = i + key.length + m[0].length;
    const ch = masked[v];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = masked.indexOf(ch, v + 1);
      const raw = objText.slice(v + 1, end < 0 ? objText.length : end);
      if (ch === '`' && raw.includes('${')) return { kind: 'dynamic' };
      return { kind: 'string', value: raw };
    }
    if (ch === '{' || ch === '[') {
      const end = closeOf(masked, v);
      if (end < 0) return { kind: 'dynamic' };
      const text = objText.slice(v, end + 1);
      return isStaticValue(masked.slice(v, end + 1)) ? { kind: ch === '{' ? 'object' : 'array', text } : { kind: 'dynamic' };
    }
    const lit = /^(-?\d+(?:\.\d+)?|true|false|null)\b/.exec(masked.slice(v));
    if (lit) return { kind: 'literal', value: lit[1] };
    return { kind: 'dynamic' };
  }
  return null;
}

const GENERATE = /export\s+(?:async\s+)?function\s+generateMetadata\b|export\s+const\s+generateMetadata\b/;
export function metadataObject(ctx) {
  if (ctx.syntax !== 'jsx') return null;
  if (GENERATE.test(ctx.text)) return { dynamic: true };
  const src = ctx.markup?.exportsText;
  if (!src) return null;
  const m = /export\s+const\s+metadata\b[^=]*=\s*/.exec(src);
  if (!m) return null;
  const at = m.index + m[0].length;
  if (src[at] !== '{') return { dynamic: true };
  const end = closeOf(maskStrings(src), at);
  return end < 0 ? { dynamic: true } : { text: src.slice(at, end + 1) };
}
```

Stubs (`lib/rules/seo-site.mjs` con `['SEO-01', 'SEO-05']`, `lib/rules/seo-page.mjs` con `['SEO-02', 'SEO-04', 'SEO-06', 'SEO-09', 'SEO-18']`):

```js
// Stub (hito 2b, Task B1): Task B4 replaces it (Task B5 for seo-page.mjs).
import { unverified } from './api.mjs';

export const RULES = ['SEO-01', 'SEO-05'].map((id) => ({ id, checkProject: () => [unverified('not implemented')] }));
```

Cambios en `lib/markup.mjs`, `lib/ui-check.mjs` y `scripts/ui-check.mjs`:

```diff
diff --git a/plugins/pignolo-ui/lib/markup.mjs b/plugins/pignolo-ui/lib/markup.mjs
--- a/plugins/pignolo-ui/lib/markup.mjs
+++ b/plugins/pignolo-ui/lib/markup.mjs
@@ -41,7 +41,7 @@ function createBuilder(src) {
   const elements = [];
   const styles = [];
   const el = (tag, component, offset, parent) => {
-    const e = { index: elements.length, tag, component, attrs: new Map(), spread: false, line: lineAt(offset), parent: parent ? parent.index : null, children: [], textParts: [], selfClosing: false };
+    const e = { index: elements.length, tag, component, attrs: new Map(), spread: false, line: lineAt(offset), parent: parent ? parent.index : null, children: [], textParts: [], selfClosing: false, inExpression: false };
     hidden(e, 'offset', offset);
     elements.push(e);
     if (parent) parent.children.push(e.index);
@@ -186,6 +186,7 @@ function normalizeJsxAttr(name) {
 function parseJsx(src, b) {
   const n = src.length;
   let i = 0;
+  let exprDepth = 0; // > 0 while parsing a {…} child expression: its elements are conditional
 
   function skipQuote() {
     const q = src[i++];
@@ -284,6 +285,7 @@ function parseJsx(src, b) {
     const name = src.slice(ns, i);
     const component = /^[A-Z]/.test(name) || name.includes('.');
     const e = b.el(component ? name : name.toLowerCase(), component, start, parent);
+    e.inExpression = exprDepth > 0;
     while (i < n) {
       while (i < n && /\s/.test(src[i])) i++;
       const c = src[i];
@@ -342,7 +344,10 @@ function parseJsx(src, b) {
       }
       if (c === '{') {
         i++;
-        const { expr, start } = expression(parent);
+        exprDepth++;
+        let expr;
+        let start;
+        try { ({ expr, start } = expression(parent)); } finally { exprDepth--; }
         const lead = expr.length - expr.trimStart().length;
         if (!expr.trim() || !parent) continue;
         const cls = classifyExpr(expr);
diff --git a/plugins/pignolo-ui/lib/ui-check.mjs b/plugins/pignolo-ui/lib/ui-check.mjs
--- a/plugins/pignolo-ui/lib/ui-check.mjs
+++ b/plugins/pignolo-ui/lib/ui-check.mjs
@@ -33,8 +33,12 @@ import { RULES as CONTRAST } from './rules/contrast.mjs';
 import { RULES as DEFAULTS } from './rules/defaults.mjs';
 import { RULES as REJECTIONS, applyRejections as diskApplyRejections } from './rules/rejections.mjs';
 import { scopeRun as diskScopeRun, classifyScope as diskClassifyScope } from './scope.mjs';
+import { RULES as SEO_SITE } from './rules/seo-site.mjs';
+import { RULES as SEO_PAGE } from './rules/seo-page.mjs';
+import { fetchSite } from './site-fetch.mjs';
+import { siteFiles } from './site-files.mjs';
 
-const DISK_RULES = [...DOCUMENT, ...A11Y_ELEMENT, ...CONTENT, ...STYLE, ...CONTRAST, ...DEFAULTS, ...REJECTIONS];
+const DISK_RULES = [...DOCUMENT, ...A11Y_ELEMENT, ...CONTENT, ...STYLE, ...CONTRAST, ...DEFAULTS, ...SEO_SITE, ...SEO_PAGE, ...REJECTIONS];
 const SYNTAX = { html: 'html', htm: 'html', jsx: 'jsx', tsx: 'jsx', css: 'css', vue: 'vue', svelte: 'svelte' };
 const TAILWIND_CONFIGS = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
 const STATUSES = new Set(['pass', 'fail', 'unverified']);
@@ -94,6 +98,7 @@ function buildCtx({ dir, rel, isDom, design, tokens, catalog }) {
   else if (route.utilities === 'sfc') classLists = extractClassListsFromSfc(text);
   return {
     file: rel,
+    origin: isDom ? 'dom' : 'file',
     text,
     syntax,
     route,
@@ -154,7 +159,7 @@ function withRuleResults(findings, found, ruleId, catRule, file) {
 
 // Steps 1-3 over `dir` (the project or a materialized base), plus the base severity and the
 // fingerprint, so both runs are compared the same way. Files missing in `dir` are skipped.
-function evaluateDir({ dir, relFiles, domFiles = [], designRel, rules, catalog, applyRejections }) {
+function evaluateDir({ dir, relFiles, domFiles = [], designRel, rules, catalog, applyRejections, site = null }) {
   const byId = new Map(catalog.rules.map((r) => [r.id, r]));
   const tokens = readTokenSources(dir);
   const designFile = designRel ? path.join(dir, designRel) : null;
@@ -179,7 +184,7 @@ function evaluateDir({ dir, relFiles, domFiles = [], designRel, rules, catalog,
       withRuleResults(findings, callRule(rule.checkFile, ctx, rule.id), rule.id, catRule, ctx.file);
     }
   }
-  const pctx = { project: dir, design, tokens, catalog, files: ctxs.map((c) => c.file) };
+  const pctx = { project: dir, design, tokens, catalog, files: ctxs.map((c) => c.file), ctxs, site };
   for (const rule of rules) {
     if (typeof rule.checkProject !== 'function') continue;
     withRuleResults(findings, callRule(rule.checkProject, pctx, rule.id), rule.id, byId.get(rule.id), undefined);
@@ -261,13 +266,14 @@ function sourceFilesOf(project, relFiles, designRel) {
   if (designRel) list.push(designRel);
   const tokens = readTokenSources(project);
   for (const s of [...tokens.sources, ...tokens.unverified]) if (s.file && s.file !== '.') list.push(s.file);
+  list.push(...siteFiles(project));
   for (const name of ['components.json', 'package.json', ...TAILWIND_CONFIGS]) {
     if (fs.existsSync(path.join(project, name))) list.push(name);
   }
   return [...new Set(list)];
 }
 
-export async function runCheck({ project, files = [], design = null, base = null, dom = [], inject = {} } = {}) {
+export async function runCheck({ project, files = [], design = null, base = null, dom = [], urls = [], inject = {} } = {}) {
   const root = path.resolve(project);
   const rules = inject.rules ?? DISK_RULES;
   const catalog = inject.catalog ?? loadCatalog();
@@ -281,7 +287,8 @@ export async function runCheck({ project, files = [], design = null, base = null
   const designRel = design ? relTo(root, design) : null;
   const evaluate = (dir, rels) => evaluateDir({ dir, relFiles: rels, designRel, rules, catalog, applyRejections });
 
-  const current = evaluateDir({ dir: root, relFiles, domFiles, designRel, rules, catalog, applyRejections });
+  const site = urls.length ? await fetchSite({ urls, ...(inject.fetchOptions ?? {}) }) : null;
+  const current = evaluateDir({ dir: root, relFiles, domFiles, designRel, rules, catalog, applyRejections, site });
   // (4) scope
   const baseFindings = base
     ? await scopeRun({ project: root, base, relFiles, sourceFiles: sourceFilesOf(root, relFiles, designRel), designRel, evaluate })
@@ -294,6 +301,9 @@ export async function runCheck({ project, files = [], design = null, base = null
 
   const inputs = [...relFiles, ...domFiles, ...(designRel ? [designRel] : [])]
     .map((rel) => ({ file: rel, sha256: sha256(path.join(root, rel)) }));
+  if (site) {
+    for (const r of [...site.pages, site.robots, ...site.sitemaps]) if (r.sha256) inputs.push({ url: r.finalUrl, sha256: r.sha256 });
+  }
   const exitCode = entries.some((e) => e.status === 'fail' && e.severity === 'bloquea' && e.scope === 'new') ? 1 : 0;
   return { entries, inputs, exitCode };
 }
diff --git a/plugins/pignolo-ui/scripts/ui-check.mjs b/plugins/pignolo-ui/scripts/ui-check.mjs
--- a/plugins/pignolo-ui/scripts/ui-check.mjs
+++ b/plugins/pignolo-ui/scripts/ui-check.mjs
@@ -2,7 +2,10 @@
 //
 // node <root>/scripts/ui-check.mjs [--project <repo root>] --run <folder in .pignolo-ui/>
 //   (--files <path>)... [--files-from <list.json>] [--design <DESIGN.md>] [--base <ref>]
-//   [--dom <file>]... [--gate]
+//   [--dom <file>]... [--url <development URL>]... [--gate]
+//
+// --url (at most 20, one origin, loopback only: nothing remote at run time) feeds the static
+// SEO rules with what the development server returns; it needs --design (spec §5.4, A-06).
 //
 // --project defaults to `git rev-parse --show-toplevel` from the cwd, or the cwd without git.
 // Writes <run>/ui-check.json ({ catalogVersion, inputs, base, entries }) and prints
@@ -17,15 +20,17 @@ import { runCheck } from '../lib/ui-check.mjs';
 import { loadCatalog } from '../lib/catalog.mjs';
 import { BaseRefError, assertRef } from '../lib/scope.mjs';
 import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
+import { isLoopbackUrl } from '../lib/site-fetch.mjs';
 
 class UsageError extends Error {}
 
-const VALUE_OPTS = new Set(['project', 'run', 'files', 'files-from', 'design', 'base', 'dom']);
-const REPEATED = new Set(['files', 'dom']);
+const VALUE_OPTS = new Set(['project', 'run', 'files', 'files-from', 'design', 'base', 'dom', 'url']);
+const REPEATED = new Set(['files', 'dom', 'url']);
+const MAX_URLS = 20;
 const FLAGS = new Set(['gate']);
 
 function parseArgs(argv) {
-  const opts = { files: [], dom: [] };
+  const opts = { files: [], dom: [], url: [] };
   for (let i = 0; i < argv.length; i++) {
     const a = argv[i];
     if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
@@ -98,6 +103,16 @@ function readFilesFrom(file) {
   return list;
 }
 
+function checkUrls(urls, design) {
+  if (!urls.length) return [];
+  if (!design) throw new UsageError('--url necesita --design: el SEO estático solo corre si DESIGN.md declara web.public');
+  if (urls.length > MAX_URLS) throw new UsageError(`--url admite como mucho ${MAX_URLS} direcciones`);
+  for (const u of urls) if (!isLoopbackUrl(u)) throw new UsageError(`--url solo acepta direcciones locales (localhost, 127.0.0.1, ::1): ${u}`);
+  const origin = new URL(urls[0]).origin;
+  for (const u of urls) if (new URL(u).origin !== origin) throw new UsageError(`todas las --url deben tener el mismo origen (${origin}): ${u}`);
+  return urls;
+}
+
 export async function main(argv, { cwd = process.cwd(), check = runCheck } = {}) {
   try {
     const opts = parseArgs(argv);
@@ -115,11 +130,12 @@ export async function main(argv, { cwd = process.cwd(), check = runCheck } = {})
     const files = listed.map((f) => inputFile(project, path.resolve(cwd, f), '--files'));
     const dom = opts.dom.map((f) => inputFile(project, path.resolve(cwd, f), '--dom'));
     const design = opts.design !== undefined ? inputFile(project, path.resolve(cwd, opts.design), '--design') : null;
+    const urls = checkUrls(opts.url, design);
     if (!files.length && !dom.length && !design) throw new UsageError('falta --files, --dom o --design: no hay nada que chequear');
 
     const base = opts.base ?? null;
     if (base !== null) assertRef(project, base); // an invalid ref is a usage error, before any rule runs
-    const result = await check({ project, files, design, base, dom });
+    const result = await check({ project, files, design, base, dom, urls });
 
     ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
     fs.mkdirSync(runDir, { recursive: true });
```

`catalog/rules.json`: `catalogVersion` → `"0.3.0"` y estas 7 reglas al final. `AAAA-MM-DD` se reemplaza por el día en que se abre cada fuente (ver Rulings); con el marcador, `checkCatalog` falla a propósito ("source has no version or date"):

```json
[
  {
    "id": "SEO-01",
    "criterion": "robots.txt exists or answers 404 (everything allowed), does not block the public routes or the render assets of the checked pages, and references a sitemap",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "medio",
    "floor": false,
    "acceptsIntentional": true,
    "source": "RFC 9309 Robots Exclusion Protocol (consulted AAAA-MM-DD)",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  },
  {
    "id": "SEO-02",
    "criterion": "No accidental noindex: meta robots/googlebot, Next.js metadata.robots or X-Robots-Tag; in the source of a public page alto, seen only on the development URL detalle",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "alto",
    "floor": false,
    "acceptsIntentional": false,
    "source": "Google Search Central, robots meta tag and X-Robots-Tag (consulted AAAA-MM-DD)",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  },
  {
    "id": "SEO-04",
    "criterion": "Exactly one link rel=canonical, with an absolute URL",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "medio",
    "floor": false,
    "acceptsIntentional": true,
    "source": "RFC 6596 The Canonical Link Relation (consulted AAAA-MM-DD)",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  },
  {
    "id": "SEO-05",
    "criterion": "The sitemap referenced by robots.txt exists and is well-formed XML with the sitemaps.org shape",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "medio",
    "floor": false,
    "acceptsIntentional": true,
    "source": "sitemaps.org protocol 0.9",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  },
  {
    "id": "SEO-06",
    "criterion": "Title present, not empty and not repeated across the checked pages",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "medio",
    "floor": false,
    "acceptsIntentional": true,
    "source": "HTML Living Standard, the title element (consulted AAAA-MM-DD)",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  },
  {
    "id": "SEO-09",
    "criterion": "No a without href used as a link; no href=\"javascript:...\"",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "medio",
    "floor": false,
    "acceptsIntentional": false,
    "source": "Google Search Central, crawlable links (consulted AAAA-MM-DD)",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  },
  {
    "id": "SEO-18",
    "criterion": "og:title, og:type, og:image and og:url present",
    "class": "script",
    "level": "document",
    "platform": "D+M",
    "severity": "detalle",
    "floor": false,
    "acceptsIntentional": true,
    "source": "The Open Graph protocol, ogp.me (consulted AAAA-MM-DD)",
    "checker": "ui-check",
    "related": [],
    "conflicts": []
  }
]
```

README: regenerar el bloque del catálogo con `renderCatalogMarkdown(loadCatalog())` (el test de aceptación del 2a lo compara byte a byte), sin tocar el resto del archivo:

```bash
node -e "import('./plugins/pignolo-ui/lib/catalog.mjs').then(({loadCatalog,renderCatalogMarkdown})=>{const fs=require('fs');const f='plugins/pignolo-ui/README.md';const t=fs.readFileSync(f,'utf8');const n=t.replace(/(<!-- catalog:start -->\n)[\s\S]*?(\n<!-- catalog:end -->)/,(_,a,b)=>a+renderCatalogMarkdown(loadCatalog()).replace(/\n$/,'')+b);if(n===t)throw new Error('bloque sin cambios');fs.writeFileSync(f,n);})"
```

- [ ] **Paso 4: verde.** Los archivos del paso 2 más `tests/ui-check-acceptance.test.mjs`, `tests/lint-plugin.test.mjs` y `tests/approve.test.mjs`. El arnés queda en rojo solo en `rule SEO-xx has fixtures` (7 casos): es lo esperado y lo cierra la ola 1. Buscar U+FEFF literal (Global Constraints).
- [ ] **Paso 5: commit.** `feat(ui): base del SEO estático en ui-check (--url local, páginas, robots y catálogo 0.3.0)`.

### Task B2 (opus): `scripts/files.mjs` (aplicar sin romper, §9)

**Files:**
- Create: `plugins/pignolo-ui/lib/batch-files.mjs`, `scripts/files.mjs`
- Test: `tests/batch-files.test.mjs` (en proceso), `tests/files-cli.test.mjs` (subproceso)

**Consumes:** `ensureRunRoot`, `isInsideRunRoot`, `RUN_ROOT` (`lib/run-folder.mjs`); `makeTempDir`, `writeTree`, `runScript` (`tests/helpers.mjs`, sin cambios).

**Produces:** `saveBatch`, `verifyBatch`, `restoreBatch`, `parsePorcelainZ`, `cleanRel`, `BatchError`, `MAX_FILES = 5`, `MAX_LINES = 200`; la CLI `files.mjs save|verify|restore` con salida JSON y códigos 0/1/2; el formato de `<batch>/files.json` (`{ version: 1, head, files: [{ path, existed, change, sha256, copy }], initial: [{ code, path, from?, sha256 }], after: null | { files: { <path>: sha256|null }, unexpected: [{ path, code, sha256, wasDirty }] } }`).

- [ ] **Paso 1: tests primero.**

`tests/batch-files.test.mjs`:

```js
// Apply without breaking (lib/batch-files.mjs, spec §9), in process, in temporary git repos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree } from './helpers.mjs';
import { saveBatch, verifyBatch, restoreBatch, parsePorcelainZ, cleanRel, BatchError } from '../lib/batch-files.mjs';

function repo(extra = {}) {
  const dir = writeTree(makeTempDir(), { 'src/page.tsx': 'a\nb\n', 'src/other.tsx': 'o\n', '.pignolo-ui/.gitignore': '*\n', ...extra });
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const write = (dir, rel, text) => writeTree(dir, { [rel]: text });
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const batchOf = (dir) => path.join(dir, '.pignolo-ui', 'runs', 'r1', 'batch-1');
const PAGE = { path: 'src/page.tsx', exists: true, change: 'structure' };
const NEW = { path: 'src/New.tsx', exists: false, change: 'structure' };

test('parsePorcelainZ keeps spaces, accents and renames', () => {
  const out = ' M a b.txt\0R  new name.txt\0old.txt\0?? dir/ñ.txt\0';
  assert.deepEqual(parsePorcelainZ(out), [
    { code: ' M', path: 'a b.txt' }, { code: 'R ', path: 'new name.txt', from: 'old.txt' }, { code: '??', path: 'dir/ñ.txt' },
  ]);
});

test('cleanRel refuses paths outside the project and reserved folders', () => {
  assert.equal(cleanRel('src\\a.tsx'), 'src/a.tsx');
  assert.equal(cleanRel('./src/../src/a.tsx'), 'src/a.tsx');
  for (const bad of ['../x', '/etc/x', 'C:/x', '.git/config', '.pignolo-ui/runs/x', '', '.']) assert.equal(cleanRel(bad), null, bad);
});

test('§16.1: a dirty tree with changes outside the list is not reverted', () => {
  const dir = repo();
  write(dir, 'src/other.tsx', 'user wip\n');
  write(dir, 'notes.txt', 'mine\n');
  const s = saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE, NEW] });
  assert.equal(s.ok, true, JSON.stringify(s.problems));
  write(dir, 'src/page.tsx', 'a\nb\nc\n');
  write(dir, 'src/New.tsx', 'n\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, true, JSON.stringify(v.unexpected));
  assert.deepEqual(v.files.map((f) => [f.path, f.existed, f.changed]), [['src/page.tsx', true, true], ['src/New.tsx', false, true]]);
  assert.equal(v.lines, 2); // +1 in page.tsx, 1 line in New.tsx
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual([r.ok, r.restored, r.deleted, r.blocked], [true, ['src/page.tsx'], ['src/New.tsx'], []]);
  assert.equal(read(dir, 'src/page.tsx'), 'a\nb\n');
  assert.equal(read(dir, 'src/other.tsx'), 'user wip\n'); // the user's changes stay
  assert.equal(read(dir, 'notes.txt'), 'mine\n');
});

test('§16.1: an unexpected new file is reported and removed by restore', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/page.tsx', 'z\n');
  write(dir, 'src/stray/Extra.tsx', 'x\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, false);
  assert.deepEqual(v.unexpected.map((u) => [u.path, u.code, u.wasDirty]), [['src/stray/Extra.tsx', '??', false]]);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, true, JSON.stringify(r.blocked));
  assert.equal(exists(dir, 'src/stray/Extra.tsx'), false);
  assert.equal(read(dir, 'src/page.tsx'), 'a\nb\n');
});

test('§16.1: a created file edited by hand afterwards is BLOCKED and never deleted', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [NEW] });
  write(dir, 'src/New.tsx', 'n\n');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  write(dir, 'src/New.tsx', 'n edited by hand\n');
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.blocked, [{ path: 'src/New.tsx', problem: 'changed-after-the-batch' }]);
  assert.equal(read(dir, 'src/New.tsx'), 'n edited by hand\n');
});

test('unexpected changes to tracked or previously dirty files are BLOCKED, not touched', () => {
  const dir = repo();
  write(dir, 'notes.txt', 'mine\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/other.tsx', 'agent touched\n');
  write(dir, 'notes.txt', 'agent touched my wip\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(v.unexpected.map((u) => [u.path, u.wasDirty]).sort(), [['notes.txt', true], ['src/other.tsx', false]]);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.blocked.map((b) => b.path).sort(), ['notes.txt', 'src/other.tsx']);
  assert.equal(read(dir, 'src/other.tsx'), 'agent touched\n');
});

test('save refuses what §9 forbids, and writes nothing', async (t) => {
  const dir = repo();
  write(dir, 'src/page.tsx', 'dirty\n');
  const CASES = [
    ['uncommitted expected file', [PAGE], 'uncommitted-changes'],
    ['path outside', [{ path: '../x', exists: false, change: 'tokens' }], 'bad-path'],
    ['git folder', [{ path: '.git/config', exists: true, change: 'tokens' }], 'bad-path'],
    ['declared new but exists', [{ path: 'src/other.tsx', exists: false, change: 'tokens' }], 'declared-new-but-exists'],
    ['declared existing but missing', [{ path: 'src/nope.tsx', exists: true, change: 'tokens' }], 'declared-existing-but-missing'],
    ['bad change', [{ path: 'src/x.tsx', exists: false, change: 'both' }], 'bad-change'],
    ['duplicate', [NEW, { ...NEW, path: 'src/new.tsx' }], 'duplicate'],
    ['more than 5 files', Array.from({ length: 6 }, (_, i) => ({ path: `src/n${i}.tsx`, exists: false, change: 'tokens' })), 'too-many-files'],
    ['empty list', [], 'empty-list'],
  ];
  for (const [name, expected, problem] of CASES) {
    await t.test(name, () => {
      const batch = path.join(dir, '.pignolo-ui', 'runs', 'r1', name.replace(/\s+/g, '-'));
      const s = saveBatch({ project: dir, batch, expected });
      assert.equal(s.ok, false);
      assert.ok(s.problems.some((p) => p.problem === problem), JSON.stringify(s.problems));
      assert.equal(fs.existsSync(path.join(batch, 'files.json')), false);
    });
  }
});

test('a second save on the same batch is refused; restore needs verify first', () => {
  const dir = repo();
  assert.equal(saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] }).ok, true);
  const again = saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  assert.ok(again.problems.some((p) => p.problem === 'batch-exists'));
  assert.throws(() => restoreBatch({ project: dir, batch: batchOf(dir) }), BatchError);
});

test('copies are byte exact: CRLF and a BOM come back unchanged', () => {
  const original = '\uFEFFa\r\nb\r\n';
  const dir = repo({ 'src/crlf.css': original });
  saveBatch({ project: dir, batch: batchOf(dir), expected: [{ path: 'src/crlf.css', exists: true, change: 'tokens' }] });
  write(dir, 'src/crlf.css', 'changed\n');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(restoreBatch({ project: dir, batch: batchOf(dir) }).ok, true);
  assert.equal(read(dir, 'src/crlf.css'), original);
});

test('more than 200 changed lines is reported, not refused', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [NEW] });
  write(dir, 'src/New.tsx', 'x\n'.repeat(201));
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, true);
  assert.equal(v.overLineLimit, true);
});
```

`tests/files-cli.test.mjs`:

```js
// files CLI (scripts/files.mjs) in a subprocess: exit codes 0/1/2 and the run folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

function repo() {
  const dir = writeTree(makeTempDir(), { 'src/a.css': '.a {}\n' });
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const porcelain = (dir) => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' });

test('save, verify and restore with exit codes 0 and 1; the run folder never shows in git status', () => {
  const dir = repo();
  const batch = '.pignolo-ui/runs/r1/batch-1';
  writeTree(path.join(dir, '.pignolo-ui', 'runs', 'r1'), { 'expected.json': JSON.stringify([{ path: 'src/a.css', exists: true, change: 'tokens' }]) });
  const save = runScript('files.mjs', ['save', '--project', dir, '--batch', batch, '--expected', '.pignolo-ui/runs/r1/expected.json'], { cwd: dir });
  assert.equal(save.status, 0, save.stderr);
  assert.equal(save.json.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  assert.equal(porcelain(dir), '');
  writeTree(dir, { 'src/a.css': '.a { color: red; }\n', 'src/x.js': 'x\n' });
  const verify = runScript('files.mjs', ['verify', '--project', dir, '--batch', batch], { cwd: dir });
  assert.equal(verify.status, 1);
  assert.deepEqual(verify.json.unexpected.map((u) => u.path), ['src/x.js']);
  const restore = runScript('files.mjs', ['restore', '--project', dir, '--batch', batch], { cwd: dir });
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(restore.json.status, 'restored');
  assert.equal(porcelain(dir), '');
});

test('usage errors exit 2 with a Spanish message and no stack', async (t) => {
  const dir = repo();
  const sub = path.join(dir, 'src');
  const CASES = [
    ['no subcommand', [], /subcomando desconocido/],
    ['unknown option', ['verify', '--project', dir, '--batch', '.pignolo-ui/runs/r1/b', '--force'], /opción desconocida --force/],
    ['missing option', ['verify', '--project', dir], /faltan --batch/],
    ['batch outside .pignolo-ui', ['verify', '--project', dir, '--batch', 'tmp/b'], /--batch debe estar dentro de \.pignolo-ui/],
    ['project not the repo root', ['verify', '--project', sub, '--batch', path.join(dir, '.pignolo-ui/runs/r1/b')], /raíz de un repo git/],
    ['verify without save', ['verify', '--project', dir, '--batch', '.pignolo-ui/runs/r1/b'], /corré save primero/],
    ['unreadable expected list', ['save', '--project', dir, '--batch', '.pignolo-ui/runs/r1/b', '--expected', 'nope.json'], /no se pudo leer --expected/],
  ];
  for (const [name, args, message] of CASES) {
    await t.test(name, () => {
      const r = runScript('files.mjs', args, { cwd: dir });
      assert.equal(r.status, 2, r.stdout);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /error interno|\n\s+at /);
    });
  }
});
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/batch-files.test.mjs plugins/pignolo-ui/tests/files-cli.test.mjs` → los dos archivos fallan (módulo y script ausentes). Después del verde, demostrar una vez el rojo de lo que protege la regla de borrado: cambiar en `restoreBatch` la condición `wrote && now === wrote` por `wrote !== undefined` → el caso "created file edited by hand" tiene que fallar (borra un archivo editado a mano); restaurar con el editor.
- [ ] **Paso 3: implementar.**

`lib/batch-files.mjs`:

```js
// Apply without breaking (spec §9): copies before editing, delta of `git status` against the
// initial state after editing, and a restore that never deletes what it cannot prove it wrote.
// No destructive git: git is only read (status, rev-parse, diff --numstat).
//
// saveBatch({ project, batch, expected })  -> { ok, problems, record }
//   expected = [{ path, exists, change: 'tokens'|'structure' }] (at most 5). Refuses (ok false)
//   a bad or repeated path, a path under .git/ or .pignolo-ui/, a declared state that does not
//   match the disk, an expected file with uncommitted changes, more than 5 files, or a batch
//   folder that already has files.json. Copies each existing file to <batch>/copies/<n>.
// verifyBatch({ project, batch })          -> { ok, unexpected, files, lines, overLineLimit }
//   Delta of the current status against the initial one: every new or changed entry outside
//   the expected list is `unexpected`. Records what the batch left (sha256 of each file) in
//   files.json (`after`), which restore needs.
// restoreBatch({ project, batch })         -> { ok, restored, deleted, blocked }
//   Expected files that existed: rewritten from the copy and checked by sha256. Created files
//   (expected new or unexpected untracked): deleted only if their sha256 is the one verify
//   recorded; otherwise BLOCKED and left alone. Anything else unexpected: BLOCKED.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const MAX_FILES = 5;
export const MAX_LINES = 200;
const RECORD = 'files.json';

export class BatchError extends Error {}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const git = (project, args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

function fileSha(project, rel) {
  try {
    const abs = path.join(project, ...rel.split('/'));
    return fs.statSync(abs).isFile() ? sha256(fs.readFileSync(abs)) : null;
  } catch {
    return null;
  }
}

// `git status --porcelain=v1 -z --untracked-files=all` -> [{ code, path, from? }]
export function parsePorcelainZ(out) {
  const parts = out.split('\0');
  const entries = [];
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p.length < 4) continue;
    const code = p.slice(0, 2);
    const entry = { code, path: p.slice(3) };
    if (code[0] === 'R' || code[0] === 'C') entry.from = parts[++k];
    entries.push(entry);
  }
  return entries;
}

function statusOf(project) {
  return parsePorcelainZ(git(project, ['status', '--porcelain=v1', '-z', '--untracked-files=all']))
    .map((e) => ({ ...e, sha256: fileSha(project, e.path) }));
}

// Normalized project-relative posix path, or null when it leaves the project or is reserved.
export function cleanRel(p) {
  if (typeof p !== 'string' || p.trim() === '' || path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) return null;
  const rel = path.posix.normalize(p.replace(/\\/g, '/'));
  if (rel === '.' || rel.startsWith('../') || rel === '..') return null;
  const top = rel.split('/')[0].toLowerCase();
  if (top === '.git' || top === '.pignolo-ui') return null;
  return rel;
}

const readRecord = (batch) => {
  const file = path.join(batch, RECORD);
  if (!fs.existsSync(file)) throw new BatchError(`no hay ${RECORD} en el lote: corré save primero`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const writeRecord = (batch, record) => fs.writeFileSync(path.join(batch, RECORD), `${JSON.stringify(record, null, 2)}\n`);

export function saveBatch({ project, batch, expected }) {
  const problems = [];
  if (!Array.isArray(expected) || expected.length === 0) problems.push({ problem: 'empty-list' });
  else if (expected.length > MAX_FILES) problems.push({ problem: 'too-many-files', max: MAX_FILES, count: expected.length });
  if (fs.existsSync(path.join(batch, RECORD))) problems.push({ problem: 'batch-exists' });
  const initial = statusOf(project);
  const dirty = new Set(initial.flatMap((e) => (e.from ? [e.path, e.from] : [e.path])));
  const seen = new Set();
  const files = [];
  for (const [i, item] of (Array.isArray(expected) ? expected : []).entries()) {
    const rel = cleanRel(item && item.path);
    if (!rel) { problems.push({ path: item && item.path, problem: 'bad-path' }); continue; }
    if (seen.has(rel.toLowerCase())) { problems.push({ path: rel, problem: 'duplicate' }); continue; }
    seen.add(rel.toLowerCase());
    if (typeof item.exists !== 'boolean') { problems.push({ path: rel, problem: 'exists-not-boolean' }); continue; }
    if (item.change !== 'tokens' && item.change !== 'structure') { problems.push({ path: rel, problem: 'bad-change' }); continue; }
    const abs = path.join(project, ...rel.split('/'));
    const onDisk = fs.existsSync(abs);
    if (onDisk !== item.exists) { problems.push({ path: rel, problem: item.exists ? 'declared-existing-but-missing' : 'declared-new-but-exists' }); continue; }
    if (onDisk && !fs.statSync(abs).isFile()) { problems.push({ path: rel, problem: 'not-a-file' }); continue; }
    if (dirty.has(rel)) { problems.push({ path: rel, problem: 'uncommitted-changes' }); continue; }
    files.push({ path: rel, existed: onDisk, change: item.change, index: i });
  }
  if (problems.length) return { ok: false, problems };

  fs.mkdirSync(path.join(batch, 'copies'), { recursive: true });
  const recorded = files.map((f, n) => {
    if (!f.existed) return { path: f.path, existed: false, change: f.change, sha256: null, copy: null };
    const buf = fs.readFileSync(path.join(project, ...f.path.split('/')));
    const copy = `copies/${n}`;
    fs.writeFileSync(path.join(batch, copy), buf, { flag: 'wx' });
    return { path: f.path, existed: true, change: f.change, sha256: sha256(buf), copy };
  });
  let head = null;
  try { head = git(project, ['rev-parse', '--verify', '--quiet', 'HEAD']).trim() || null; } catch { head = null; }
  const record = { version: 1, head, files: recorded, initial, after: null };
  fs.writeFileSync(path.join(batch, RECORD), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { ok: true, problems: [], record };
}

function changedLines(project, head, files) {
  let lines = 0;
  const tracked = files.filter((f) => f.existed).map((f) => f.path);
  if (head && tracked.length) {
    for (const row of git(project, ['diff', '--numstat', head, '--', ...tracked]).split('\n')) {
      const m = /^(\d+)\t(\d+)\t/.exec(row);
      if (m) lines += Number(m[1]) + Number(m[2]);
    }
  }
  for (const f of files.filter((x) => !x.existed)) {
    let text;
    try { text = fs.readFileSync(path.join(project, ...f.path.split('/')), 'utf8'); } catch { continue; } // not created
    if (text) lines += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  }
  return lines;
}

export function verifyBatch({ project, batch }) {
  const record = readRecord(batch);
  const expected = new Set(record.files.map((f) => f.path));
  const before = new Map(record.initial.map((e) => [e.path, e]));
  const current = statusOf(project);
  const unexpected = [];
  const nowPaths = new Set();
  for (const e of current) {
    for (const p of e.from ? [e.path, e.from] : [e.path]) {
      nowPaths.add(p);
      if (expected.has(p)) continue;
      const b = before.get(p);
      if (b && b.code === e.code && b.sha256 === fileSha(project, p)) continue; // untouched prior change
      unexpected.push({ path: p, code: e.code, sha256: fileSha(project, p), wasDirty: Boolean(b) });
    }
  }
  for (const b of record.initial) {
    if (!nowPaths.has(b.path) && !expected.has(b.path)) unexpected.push({ path: b.path, code: 'clean-now', sha256: fileSha(project, b.path), wasDirty: true });
  }
  const files = record.files.map((f) => {
    const now = fileSha(project, f.path);
    return { path: f.path, existed: f.existed, exists: now !== null, changed: now !== f.sha256, sha256: now };
  });
  const lines = changedLines(project, record.head, record.files);
  record.after = { files: Object.fromEntries(files.map((f) => [f.path, f.sha256])), unexpected };
  writeRecord(batch, record);
  return { ok: unexpected.length === 0, unexpected, files, lines, overLineLimit: lines > MAX_LINES };
}

export function restoreBatch({ project, batch }) {
  const record = readRecord(batch);
  if (!record.after) throw new BatchError('el lote no tiene verificación: corré verify antes de restore');
  const restored = [];
  const deleted = [];
  const blocked = [];
  const abs = (rel) => path.join(project, ...rel.split('/'));
  const deleteIfOurs = (rel, wrote) => {
    const now = fileSha(project, rel);
    if (now === null) return; // already gone
    if (wrote && now === wrote) {
      fs.rmSync(abs(rel), { force: false });
      if (fs.existsSync(abs(rel))) blocked.push({ path: rel, problem: 'delete-failed' });
      else deleted.push(rel);
    } else blocked.push({ path: rel, problem: 'changed-after-the-batch' });
  };
  for (const f of record.files) {
    if (f.existed) {
      const buf = fs.readFileSync(path.join(batch, f.copy));
      fs.mkdirSync(path.dirname(abs(f.path)), { recursive: true });
      fs.writeFileSync(abs(f.path), buf);
      if (fileSha(project, f.path) === f.sha256) restored.push(f.path);
      else blocked.push({ path: f.path, problem: 'restore-mismatch' });
    } else {
      deleteIfOurs(f.path, record.after.files[f.path]);
    }
  }
  for (const u of record.after.unexpected) {
    if (u.code === '??' && !u.wasDirty) deleteIfOurs(u.path, u.sha256);
    else blocked.push({ path: u.path, problem: 'unexpected-change-not-restorable' });
  }
  return { ok: blocked.length === 0, restored, deleted, blocked };
}
```

`scripts/files.mjs`:

```js
// files.mjs: save | verify | restore of one batch of edits (spec §9).
//   save    --project <repo> --batch <folder in .pignolo-ui/> --expected <list.json>
//           list = [{ "path", "exists": true|false, "change": "tokens"|"structure" }], at most 5
//           0 saved, 1 refused (see problems), 2 own error
//   verify  --project <repo> --batch <folder>
//           0 the delta is inside the expected list, 1 unexpected changes, 2 own error
//   restore --project <repo> --batch <folder>
//           0 everything restored, 1 BLOCKED (something left alone, nothing deleted without
//           proof), 2 own error
// Prints one JSON object on stdout. Never runs destructive git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { saveBatch, verifyBatch, restoreBatch, BatchError } from '../lib/batch-files.mjs';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';

class UsageError extends Error {}

const ALLOWED = { save: ['project', 'batch', 'expected'], verify: ['project', 'batch'], restore: ['project', 'batch'] };

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!ALLOWED[cmd]) throw new UsageError(`subcomando desconocido ${cmd ?? '(ninguno)'}; usá save, verify o restore`);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!ALLOWED[cmd].includes(key)) throw new UsageError(`opción desconocida ${a} para ${cmd}; opciones válidas: ${ALLOWED[cmd].map((k) => `--${k}`).join(', ')}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  const missing = ALLOWED[cmd].filter((k) => opts[k] === undefined);
  if (missing.length) throw new UsageError(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
  return { cmd, opts };
}

function toplevel(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const real = (p) => fs.realpathSync.native(p);

export function main(argv, { cwd = process.cwd() } = {}) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const projectArg = path.resolve(cwd, opts.project);
    if (!fs.existsSync(projectArg) || !fs.statSync(projectArg).isDirectory()) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
    const top = toplevel(projectArg);
    if (!top || real(top) !== real(projectArg)) throw new UsageError('--project tiene que ser la raíz de un repo git');
    const project = real(projectArg);
    const batch = path.resolve(cwd, opts.batch);
    if (!isInsideRunRoot(project, batch)) throw new UsageError(`--batch debe estar dentro de ${RUN_ROOT}/ del proyecto`);
    let result;
    if (cmd === 'save') {
      let expected;
      try { expected = JSON.parse(fs.readFileSync(path.resolve(cwd, opts.expected), 'utf8')); } catch (e) { throw new UsageError(`no se pudo leer --expected (${e.code || e.message})`); }
      ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
      fs.mkdirSync(batch, { recursive: true });
      const r = saveBatch({ project, batch, expected });
      result = { ok: r.ok, problems: r.problems, files: r.ok ? r.record.files.map(({ path: p, existed, change }) => ({ path: p, existed, change })) : [] };
    } else if (cmd === 'verify') {
      result = verifyBatch({ project, batch });
    } else {
      result = restoreBatch({ project, batch });
      result.status = result.ok ? 'restored' : 'BLOCKED';
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  } catch (e) {
    const known = e instanceof UsageError || e instanceof BatchError;
    process.stderr.write(`files: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
```

- [ ] **Paso 4: verde** en los dos archivos y en `tests/lint-plugin.test.mjs`. Buscar U+FEFF literal (el test de CRLF y BOM lo usa como escape).
- [ ] **Paso 5: commit.** `feat(ui): files.mjs aplica un lote sin romper (save, verify, restore)`.

### Task B3 (sonnet): `scripts/report-check.mjs` (§12)

**Files:**
- Create: `plugins/pignolo-ui/lib/report-check.mjs`, `scripts/report-check.mjs`
- Modify: `lib/approved.mjs` (extrae `registeredManifestSha`; `verifyApproved` la usa, sin cambio de comportamiento)
- Test: `tests/report-check.test.mjs`, `tests/report-check-cli.test.mjs`

**Consumes:** `findDesignFile`, `APPROVED_PATH` (`lib/approved.mjs`); `isInsideRunRoot`, `RUN_ROOT`.

**Produces:** `checkReport({ project, run, report })` → `{ kept, retired, implements, exitCode }`, `ReportError`, `registeredManifestSha(designText, approvedPath)`; la CLI `report-check.mjs --project --run` que escribe `<run>/report-check.json` (`{ reportSha256, kept, retired, implements, exitCode }`) y sale con 0/1/2; los contratos `report.json` y `browser.json` de los Rulings.

- [ ] **Paso 1: tests primero.**

`tests/report-check.test.mjs`:

```js
// Claim <-> evidence cross-check (lib/report-check.mjs, spec §12), in process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeTempDir, writeTree } from './helpers.mjs';
import { checkReport, ReportError } from '../lib/report-check.mjs';
import { registeredManifestSha } from '../lib/approved.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const MANIFEST = 'a'.repeat(64);
const UI = JSON.stringify({ catalogVersion: '0.3.0', entries: [
  { id: 'A11Y-04', status: 'pass', severity: 'bloquea', scope: 'new', file: 'src/Save.tsx', line: 3, fingerprint: 'A11Y-04|src/Save.tsx|button' },
  { id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'COLOR-03||on-surface/surface/light', measure: { ratio: 3.45, required: 4.5 } },
] });

function setup() {
  const project = writeTree(makeTempDir(), {
    'DESIGN.md': `---\nversion: alpha\nname: X\n---\n\n## Decisions\n\n- 2026-09-29 — approved \`design/approved/checkout/\` (manifest sha256 \`${MANIFEST}\`): "B"\n`,
    'src/Save.tsx': 'export const S = () => <button>Guardar</button>;\n',
    '.pignolo-ui/runs/r1/ui-check.json': UI,
  });
  const run = path.join(project, '.pignolo-ui', 'runs', 'r1');
  fs.mkdirSync(path.join(run, 'captures'));
  fs.writeFileSync(path.join(run, 'captures', 'home.png'), PNG);
  return { project, run };
}
const uiRef = (fingerprint, extra = {}) => ({ source: 'ui-check', fingerprint, ...extra });
const report = (claims, extra = {}) => ({ version: 1, implemented: false, evidence: { 'ui-check.json': sha(UI) }, claims, ...extra });

test('claims stay only when the cited evidence exists and says the same', async (t) => {
  const { project, run } = setup();
  const fileSha = sha(fs.readFileSync(path.join(project, 'src/Save.tsx')));
  const CASES = [
    ['ui-check pass', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') }, null],
    ['ui-check with line', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button', { line: 3 }) }, null],
    ['same measure', { rule: 'COLOR-03', status: 'fail', measure: { ratio: 3.45 }, ref: uiRef('COLOR-03||on-surface/surface/light') }, null],
    ['capture', { ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }, null],
    ['edited file', { ref: { source: 'file', path: 'src/Save.tsx', sha256: fileSha } }, null],
    ['no reference', {}, /no evidence reference/],
    ['contradicting status', { rule: 'COLOR-03', status: 'pass', ref: uiRef('COLOR-03||on-surface/surface/light') }, /evidence says COLOR-03 fail/],
    ['other rule', { rule: 'A11Y-16', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') }, /evidence says A11Y-04 pass/],
    ['other measure', { rule: 'COLOR-03', status: 'fail', measure: { ratio: 4.5 }, ref: uiRef('COLOR-03||on-surface/surface/light') }, /another measure/],
    ['wrong line', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button', { line: 9 }) }, /no ui-check\.json entry/],
    ['unknown fingerprint', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|x|y') }, /no ui-check\.json entry/],
    ['browser.json absent', { rule: 'COLOR-03', status: 'pass', ref: { source: 'browser', fingerprint: 'x' } }, /browser\.json not in the run/],
    ['capture outside the run', { ref: { source: 'capture', path: '../../../DESIGN.md', sha256: sha(PNG) } }, /outside the run/],
    ['capture with another hash', { ref: { source: 'capture', path: 'captures/home.png', sha256: 'b'.repeat(64) } }, /sha256 does not match/],
    ['file without hash', { ref: { source: 'file', path: 'src/Save.tsx' } }, /without sha256/],
    ['unknown source', { ref: { source: 'memory' } }, /unknown evidence source/],
  ];
  for (const [name, claim, retired] of CASES) {
    await t.test(name, () => {
      const r = checkReport({ project, run, report: report([{ id: 'c1', text: 'afirmación', ...claim }]) });
      if (retired) {
        assert.equal(r.exitCode, 1);
        assert.match(r.retired[0].reason, retired);
      } else {
        assert.deepEqual([r.exitCode, r.kept, r.retired], [0, ['c1'], []]);
      }
    });
  }
});

test('ui-check.json must be cited by its current sha256', () => {
  const { project, run } = setup();
  const claim = { id: 'c1', text: 'x', rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') };
  assert.match(checkReport({ project, run, report: report([claim], { evidence: {} }) }).retired[0].reason, /not cited by sha256/);
  fs.appendFileSync(path.join(run, 'ui-check.json'), '\n');
  assert.match(checkReport({ project, run, report: report([claim]) }).retired[0].reason, /changed since the report was written/);
});

test('§16.1: an implementation must cite the approved with the sha256 DESIGN.md registers', () => {
  const { project, run } = setup();
  const imp = (manifestSha256) => report([], { implemented: true, implements: { path: 'design/approved/checkout', manifestSha256 } });
  assert.deepEqual([checkReport({ project, run, report: imp(MANIFEST) }).exitCode, checkReport({ project, run, report: imp(MANIFEST) }).implements.status], [0, 'ok']);
  const other = checkReport({ project, run, report: imp('b'.repeat(64)) });
  assert.deepEqual([other.exitCode, other.implements.status], [1, 'mismatch']);
  const missing = checkReport({ project, run, report: report([], { implemented: true }) });
  assert.deepEqual([missing.exitCode, missing.implements.status], [1, 'missing']);
  assert.equal(checkReport({ project, run, report: report([]) }).implements.status, 'not-required');
});

test('§16.1: one claim without evidence and one contradicted: both retired, exit 1', () => {
  const { project, run } = setup();
  const r = checkReport({ project, run, report: report([
    { id: 'c1', text: 'Todo en orden' },
    { id: 'c2', text: 'El contraste pasa', rule: 'COLOR-03', status: 'pass', ref: uiRef('COLOR-03||on-surface/surface/light') },
    { id: 'c3', text: 'Guardar tiene nombre', rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') },
  ]) });
  assert.deepEqual([r.exitCode, r.kept, r.retired.map((x) => x.id)], [1, ['c3'], ['c1', 'c2']]);
});

test('malformed reports throw ReportError; bad claims are retired, not fatal', () => {
  const { project, run } = setup();
  assert.throws(() => checkReport({ project, run, report: [] }), ReportError);
  assert.throws(() => checkReport({ project, run, report: { implemented: false } }), ReportError);
  assert.throws(() => checkReport({ project, run, report: { claims: [] } }), ReportError);
  const r = checkReport({ project, run, report: report([null, { id: 'c1', text: '' }, { id: 'c2', text: 'x', ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }, { id: 'c2', text: 'y', ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }]) });
  assert.deepEqual(r.retired, [{ id: '#1', reason: 'invalid claim' }, { id: 'c1', reason: 'invalid claim' }, { id: 'c2', reason: 'duplicate claim id' }]);
});

test('registeredManifestSha reads the last entry of a path and nothing else', () => {
  const text = [`- approved \`design/approved/a/\` (manifest sha256 \`${'1'.repeat(64)}\`)`, `- approved \`design/approved/ab/\` (manifest sha256 \`${'2'.repeat(64)}\`)`, `- approved \`design/approved/a/\` (manifest sha256 \`${'3'.repeat(64)}\`)`].join('\n');
  assert.equal(registeredManifestSha(text, 'design/approved/a'), '3'.repeat(64));
  assert.equal(registeredManifestSha(text, 'design/approved/ab'), '2'.repeat(64));
  assert.equal(registeredManifestSha(text, 'design/approved/b'), null);
});
```

`tests/report-check-cli.test.mjs`:

```js
// report-check CLI (scripts/report-check.mjs) in a subprocess: 0/1/2 and report-check.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

const RUN = '.pignolo-ui/runs/r1';

test('exit 0 with nothing retired, 1 with a retired claim; report-check.json is written', () => {
  const project = writeTree(makeTempDir(), { [`${RUN}/report.json`]: JSON.stringify({ implemented: false, claims: [] }) });
  const ok = runScript('report-check.mjs', ['--project', project, '--run', path.join(project, RUN)]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual([ok.json.kept, ok.json.retired, ok.json.implements], [0, [], 'not-required']);
  const written = JSON.parse(fs.readFileSync(path.join(project, RUN, 'report-check.json'), 'utf8'));
  assert.match(written.reportSha256, /^[0-9a-f]{64}$/);
  writeTree(project, { [`${RUN}/report.json`]: JSON.stringify({ implemented: false, claims: [{ id: 'c1', text: 'Todo en orden' }] }) });
  const bad = runScript('report-check.mjs', ['--project', project, '--run', path.join(project, RUN)]);
  assert.equal(bad.status, 1);
  assert.deepEqual(bad.json.retired, [{ id: 'c1', reason: 'no evidence reference' }]);
});

test('errors exit 2 (not verified) with a Spanish message and no stack', async (t) => {
  const project = writeTree(makeTempDir(), { [`${RUN}/x`]: '' });
  const CASES = [
    ['no --run', ['--project', project], /falta --run/],
    ['run outside .pignolo-ui', ['--project', project, '--run', project], /--run debe estar dentro de \.pignolo-ui/],
    ['no report.json', ['--project', project, '--run', path.join(project, RUN)], /no existe/],
    ['unknown option', ['--project', project, '--run', path.join(project, RUN), '--all'], /opción desconocida --all/],
  ];
  for (const [name, args, message] of CASES) {
    await t.test(name, () => {
      const r = runScript('report-check.mjs', args);
      assert.equal(r.status, 2);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /error interno|\n\s+at /);
    });
  }
  writeTree(project, { [`${RUN}/report.json`]: '{' });
  const r = runScript('report-check.mjs', ['--project', project, '--run', path.join(project, RUN)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no es JSON válido/);
});
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/report-check.test.mjs plugins/pignolo-ui/tests/report-check-cli.test.mjs` → fallan (módulos ausentes y `registeredManifestSha` sin exportar). `tests/approve.test.mjs` sigue verde antes y después del cambio en `approved.mjs`.
- [ ] **Paso 3: implementar.**

`lib/approved.mjs`:

```diff
diff --git a/plugins/pignolo-ui/lib/approved.mjs b/plugins/pignolo-ui/lib/approved.mjs
--- a/plugins/pignolo-ui/lib/approved.mjs
+++ b/plugins/pignolo-ui/lib/approved.mjs
@@ -97,6 +97,13 @@ export function manifestSha(projectRoot, approvedPath) {
 
 export const APPROVED_PATH = /^design\/approved\/[a-z0-9][a-z0-9-]{0,63}$/;
 
+// sha256 of the manifest that DESIGN.md registers for approvedPath (the last entry wins), or null.
+export function registeredManifestSha(designText, approvedPath) {
+  const escaped = approvedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
+  const entries = [...String(designText).matchAll(new RegExp(`\`${escaped}/\`[^\\n]*?sha256 \`([0-9a-f]{64})\``, 'g'))];
+  return entries.length ? entries[entries.length - 1][1] : null;
+}
+
 export function verifyApproved({ projectRoot, approvedPath }) {
   const problems = [];
   const blocked = () => ({ status: 'BLOCKED', problems });
@@ -109,14 +116,11 @@ export function verifyApproved({ projectRoot, approvedPath }) {
     problems.push({ problem: 'no-design-md' });
     return blocked();
   }
-  const text = fs.readFileSync(designFile, 'utf8');
-  const escaped = approvedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
-  const entries = [...text.matchAll(new RegExp(`\`${escaped}/\`[^\\n]*?sha256 \`([0-9a-f]{64})\``, 'g'))];
-  if (!entries.length) {
+  const expected = registeredManifestSha(fs.readFileSync(designFile, 'utf8'), approvedPath);
+  if (!expected) {
     problems.push({ problem: 'no-entry' });
     return blocked();
   }
-  const expected = entries[entries.length - 1][1];
   const dir = path.join(projectRoot, ...approvedPath.split('/'));
   let manifest;
   try {
```

`lib/report-check.mjs`:

```js
// Claim <-> evidence cross-check of the final report (spec §12, PROC-02). Deterministic: a claim
// stays only if the evidence it cites exists and says the same thing.
//
// checkReport({ project, run, report }) -> { kept, retired, implements, exitCode }
//   report  parsed <run>/report.json (see REPORT_SHAPE in the plan / README)
//   kept    [claim id]    retired [{ id, reason }]
//   implements { status: 'ok'|'not-required'|'missing'|'mismatch'|'no-design-md', cited?, registered? }
//   exitCode 0 nothing retired and implements ok or not required; 1 otherwise.
// A malformed report (not an object, claims not a list, implemented not boolean) throws
// ReportError, which the CLI turns into exit 2.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { findDesignFile, registeredManifestSha, APPROVED_PATH } from './approved.mjs';

export class ReportError extends Error {}

const SOURCES = { 'ui-check': 'ui-check.json', browser: 'browser.json' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEX64 = /^[0-9a-f]{64}$/;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Path of `rel` inside `root`, or null when it leaves it.
function inside(root, rel) {
  if (typeof rel !== 'string' || rel === '' || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? abs : null;
}

function loadSources(run, report) {
  const out = {};
  for (const [source, name] of Object.entries(SOURCES)) {
    const file = path.join(run, name);
    if (!fs.existsSync(file)) { out[source] = { error: `${name} not in the run` }; continue; }
    const buf = fs.readFileSync(file);
    const cited = isMap(report.evidence) ? report.evidence[name] : undefined;
    if (typeof cited !== 'string') { out[source] = { error: `${name} is not cited by sha256 in evidence` }; continue; }
    if (cited !== sha256(buf)) { out[source] = { error: `${name} changed since the report was written` }; continue; }
    let json;
    try { json = JSON.parse(buf.toString('utf8')); } catch { out[source] = { error: `${name} is not valid JSON` }; continue; }
    out[source] = { entries: Array.isArray(json.entries) ? json.entries : [] };
  }
  return out;
}

function checkClaim(claim, { project, run, sources }) {
  const ref = claim.ref;
  if (!isMap(ref)) return 'no evidence reference';
  if (ref.source in SOURCES) {
    const src = sources[ref.source];
    if (src.error) return src.error;
    if (typeof claim.rule !== 'string' || !['pass', 'fail', 'unverified'].includes(claim.status)) return 'claim without rule and status';
    const found = src.entries.filter((e) => e.fingerprint === ref.fingerprint && (ref.line === undefined || e.line === ref.line));
    if (!found.length) return `no ${SOURCES[ref.source]} entry with that fingerprint`;
    const same = found.filter((e) => e.id === claim.rule && e.status === claim.status);
    if (!same.length) return `evidence says ${found[0].id} ${found[0].status}`;
    if (claim.measure !== undefined) {
      if (!isMap(claim.measure)) return 'measure must be an object';
      const ok = same.some((e) => isMap(e.measure) && Object.entries(claim.measure).every(([k, v]) => isDeepStrictEqual(e.measure[k], v)));
      if (!ok) return 'evidence has another measure';
    }
    return null;
  }
  if (ref.source === 'capture' || ref.source === 'file') {
    const root = ref.source === 'capture' ? run : project;
    const abs = inside(root, ref.path);
    if (!abs) return `${ref.source} path outside the ${ref.source === 'capture' ? 'run' : 'project'}`;
    if (typeof ref.sha256 !== 'string' || !HEX64.test(ref.sha256)) return `${ref.source} without sha256`;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return `${ref.source} does not exist`;
    const buf = fs.readFileSync(abs);
    if (sha256(buf) !== ref.sha256) return `${ref.source} sha256 does not match`;
    if (ref.source === 'capture' && !buf.subarray(0, 8).equals(PNG)) return 'capture is not a PNG';
    return null;
  }
  return `unknown evidence source ${JSON.stringify(ref.source)}`;
}

function checkImplements(project, report) {
  if (report.implemented !== true) return { status: 'not-required' };
  const imp = report.implements;
  if (!isMap(imp) || typeof imp.path !== 'string' || !APPROVED_PATH.test(imp.path) || typeof imp.manifestSha256 !== 'string') return { status: 'missing' };
  const designFile = findDesignFile(project);
  if (!designFile) return { status: 'no-design-md', cited: imp.manifestSha256 };
  const registered = registeredManifestSha(fs.readFileSync(designFile, 'utf8'), imp.path);
  if (registered !== imp.manifestSha256) return { status: 'mismatch', cited: imp.manifestSha256, registered };
  return { status: 'ok', cited: imp.manifestSha256, registered };
}

export function checkReport({ project, run, report }) {
  if (!isMap(report)) throw new ReportError('report.json no es un objeto JSON');
  if (!Array.isArray(report.claims)) throw new ReportError('report.json no tiene la lista claims');
  if (typeof report.implemented !== 'boolean') throw new ReportError('report.json debe decir implemented: true o false');
  const sources = loadSources(run, report);
  const kept = [];
  const retired = [];
  const seen = new Set();
  report.claims.forEach((claim, i) => {
    const id = isMap(claim) && typeof claim.id === 'string' && claim.id ? claim.id : `#${i + 1}`;
    let reason = null;
    if (!isMap(claim) || typeof claim.text !== 'string' || claim.text.trim() === '') reason = 'invalid claim';
    else if (seen.has(id)) reason = 'duplicate claim id';
    else reason = checkClaim(claim, { project, run, sources });
    seen.add(id);
    if (reason) retired.push({ id, reason });
    else kept.push(id);
  });
  const implementsResult = checkImplements(project, report);
  const implOk = implementsResult.status === 'ok' || implementsResult.status === 'not-required';
  return { kept, retired, implements: implementsResult, exitCode: retired.length === 0 && implOk ? 0 : 1 };
}
```

`scripts/report-check.mjs`:

```js
// report-check.mjs: cross-check of the final report against its evidence (spec §12).
//   node <root>/scripts/report-check.mjs --project <repo> --run <folder in .pignolo-ui/runs/>
// Reads <run>/report.json, writes <run>/report-check.json ({ reportSha256, kept, retired,
// implements, exitCode }) and prints { out, kept, retired, implements, exitCode } on stdout.
// Exit codes: 0 no claim retired and the approved is cited when something was implemented;
// 1 at least one claim retired or the approved citation is missing or wrong; 2 own error
// (counts as not verified).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkReport, ReportError } from '../lib/report-check.mjs';
import { isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';

class UsageError extends Error {}
const ALLOWED = ['project', 'run'];

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!ALLOWED.includes(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: --project, --run`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    opts[key] = next;
    i++;
  }
  for (const k of ALLOWED) if (opts[k] === undefined) throw new UsageError(`falta --${k}`);
  return opts;
}

export function main(argv, { cwd = process.cwd() } = {}) {
  try {
    const opts = parseArgs(argv);
    const project = path.resolve(cwd, opts.project);
    if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
    const run = path.resolve(cwd, opts.run);
    if (!isInsideRunRoot(project, run)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/ del proyecto`);
    const file = path.join(run, 'report.json');
    if (!fs.existsSync(file)) throw new UsageError(`no existe ${path.join(opts.run, 'report.json')}`);
    const buf = fs.readFileSync(file);
    let report;
    try { report = JSON.parse(buf.toString('utf8')); } catch { throw new ReportError('report.json no es JSON válido'); }
    const result = checkReport({ project, run, report });
    const out = path.join(run, 'report-check.json');
    const body = { reportSha256: crypto.createHash('sha256').update(buf).digest('hex'), ...result };
    fs.writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ out, kept: result.kept.length, retired: result.retired, implements: result.implements.status, exitCode: result.exitCode }, null, 2)}\n`);
    return result.exitCode;
  } catch (e) {
    const known = e instanceof UsageError || e instanceof ReportError;
    process.stderr.write(`report-check: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
```

- [ ] **Paso 4: verde** en los dos archivos, `tests/approve.test.mjs` y `tests/lint-plugin.test.mjs`.
- [ ] **Paso 5: commit.** `feat(ui): report-check cruza cada afirmación con su evidencia y la cita del aprobado`.

### Unión de la ola 0 del 2b

- [ ] Unir las Tasks B1, B2 y B3 a `ui/hito-2b` (archivos disjuntos; un conflicto es un error del plan y se registra). `npm run test:quiet` una vez: todo verde salvo `rule SEO-xx has fixtures` (7).

---

## Ola 1 del 2b (en paralelo: Tasks B4 y B5)

**Tarjeta común (fixtures de SEO).** Cada caso es `tests/fixtures/rules/<ID>/<caso>/` con los archivos literales de las tablas; cada archivo termina en `\n`; `expect.json` exactamente como en la tabla. Bloques base:

`DMW` (`DESIGN.md`; algunos casos agregan líneas bajo `web:` antes del `---` de cierre):

```markdown
---
version: alpha
name: Fixture
pignolo:
  schema: 1
  web:
    public: true
---

## Overview

Fixture.
```

`PAGE` (`index.html`; líneas: 5 `<title>`, 6 canonical, 7–10 `og:*`, 11 hoja de estilos, 13 `<body>`):

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Pedidos</title>
<link rel="canonical" href="https://www.example.com/">
<meta property="og:title" content="Pedidos">
<meta property="og:type" content="website">
<meta property="og:image" content="https://www.example.com/og.png">
<meta property="og:url" content="https://www.example.com/">
<link rel="stylesheet" href="/assets/app.css">
</head>
<body><main><h1>Pedidos</h1><a href="/ayuda">Ayuda</a></main><script type="module" src="/assets/app.js"></script></body>
</html>
```

`L(META, HEAD)` (`app/layout.tsx`; `{{META}}` son líneas de `export` que terminan en una línea vacía, `{{HEAD}}` va dentro de `<head>`; sin `{{META}}`, `<head>` queda en la línea 4 y `<body>` en la 5):

```tsx
{{META}}export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>{{HEAD}}</head>
      <body>{children}</body>
    </html>
  );
}
```

`SM` = la línea `Sitemap: https://www.example.com/sitemap.xml`. `SMX` (`sitemap.xml` válido):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.example.com/</loc></url>
  <url><loc>https://www.example.com/ayuda</loc></url>
</urlset>
```

En las tablas, ` / ` separa líneas de un archivo y "A → B" es un reemplazo sobre el bloque base. Todos los casos llevan `DESIGN.md` = `DMW` salvo que la tabla diga otra cosa.

Pasos de la tarjeta: (1) fixtures y tests del grupo; (2) rojo contra el stub (`node --test --test-reporter=dot --test-name-pattern "rule (<ids>) " plugins/pignolo-ui/tests/rules-fixtures.test.mjs` y el archivo del grupo: los `pass-*`, `fail-*` y los `unverified-*` con `reason` fallan contra `unverified('not implemented')`); (3) implementar; (4) verde, `tests/lint-plugin.test.mjs` y búsqueda de U+FEFF literal; (5) commit.

### Task B4 (sonnet): SEO de sitio (SEO-01, SEO-05) y `xml-check`

**Files:** create `lib/xml-check.mjs`; replace `lib/rules/seo-site.mjs`; create `tests/xml-check.test.mjs`, `tests/rules-seo-site.test.mjs`, `tests/fixtures/rules/{SEO-01,SEO-05}/`.

**Consumes:** `seoGate`, `seoPages`, `indexable`, `staticAttr` (`seo-common`), `parseRobots`, `isAllowed`, `findSiteFile`, `generatedBy`, `pctx.site` (Task B1). **Produces:** `checkXml(text)`, `checkSitemap(text)`, `parseXml(text, handlers)`; `RULES` de SEO-01 y SEO-05.

| id | caso | archivos | `expect.json` |
|---|---|---|---|
| SEO-01 | `pass-robots` | `index.html` = `PAGE`; `robots.txt` = `User-agent: *` / `Disallow: /admin/` / `SM` | — |
| SEO-01 | `pass-no-robots` | `index.html` = `PAGE` | `{ "reason": "no robots.txt" }` |
| SEO-01 | `pass-not-public` | `DESIGN.md` = `DMW` con `public: false`; `index.html` = `PAGE`; `robots.txt` = `User-agent: *` / `Disallow: /` | `{ "reason": "web.public is not true" }` |
| SEO-01 | `pass-not-indexable` | `DESIGN.md` = `DMW` + `    indexable: false`; `index.html` = `PAGE`; `robots.txt` = `User-agent: *` / `Disallow: /` | `{ "reason": "indexable is false" }` |
| SEO-01 | `fail-blocks-root` | `index.html` = `PAGE`; `robots.txt` = `User-agent: *` / `Disallow: /` / `SM` | `{ "count": 3, "lines": [2, 2, 2], "reason": "public route /", "severity": "medio" }` (la ruta `/` y los dos *assets*) |
| SEO-01 | `fail-blocks-assets` | `index.html` = `PAGE`; `public/robots.txt` = `User-agent: *` / `Disallow: /assets/` / `SM` | `{ "count": 2, "reason": "render asset /assets/app\\.(css\|js)" }` |
| SEO-01 | `fail-no-sitemap` | `index.html` = `PAGE`; `robots.txt` = `User-agent: *` / `Allow: /` | `{ "count": 1, "reason": "references no sitemap" }` |
| SEO-01 | `unverified-generated` | `app/robots.ts` = `export default function robots() {` / `  return { rules: { userAgent: '*', allow: '/' } };` / `}` | `{ "reason": "generated by app/robots.ts" }` |
| SEO-05 | `pass-sitemap` | `robots.txt` = `User-agent: *` / `Allow: /` / `SM`; `public/sitemap.xml` = `SMX` | `{ "measure": { "kind": "urlset", "count": 2 } }` |
| SEO-05 | `pass-index` | `robots.txt` = `User-agent: *` / `Allow: /` / `Sitemap: /sitemap-index.xml`; `sitemap-index.xml` = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.example.com/sitemap-1.xml</loc></sitemap></sitemapindex>` | `{ "measure": { "kind": "sitemapindex", "count": 1 } }` |
| SEO-05 | `fail-missing` | `robots.txt` = `User-agent: *` / `Allow: /` / `SM` | `{ "lines": [3], "reason": "not in the project" }` |
| SEO-05 | `fail-unclosed` | `robots.txt` como `fail-missing`; `sitemap.xml` = `<urlset>` / `  <url><loc>https://www.example.com/</loc></url>` | `{ "reason": "unclosed element <urlset>" }` |
| SEO-05 | `fail-entity` | `robots.txt` como `fail-missing`; `sitemap.xml` = `<urlset>` / `  <url><loc>https://www.example.com/?a=1&b=2</loc></url>` / `</urlset>` | `{ "lines": [2], "reason": "invalid entity reference" }` |
| SEO-05 | `fail-shape` | `robots.txt` como `fail-missing`; `sitemap.xml` = `<rss version="2.0"><channel><title>x</title></channel></rss>` | `{ "reason": "not urlset or sitemapindex" }` |
| SEO-05 | `unverified-no-reference` | `robots.txt` = `User-agent: *` / `Allow: /` | `{ "reason": "no sitemap referenced" }` |
| SEO-05 | `unverified-generated` | `robots.txt` como `fail-missing`; `app/sitemap.ts` = `export default function sitemap() {` / `  return [{ url: 'https://www.example.com/' }];` / `}` | `{ "reason": "generated by app/sitemap.ts" }` |

(En la celda de `fail-blocks-assets`, `\|` es la barra de la regex escapada para la tabla: el `expect.json` lleva `"render asset /assets/app\\.(css|js)"`.)

- [ ] **Paso 1: fixtures de la tabla y tests.**

`tests/xml-check.test.mjs`:

```js
// XML well-formedness and sitemap shape (lib/xml-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkXml, checkSitemap } from '../lib/xml-check.mjs';

const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://www.example.com/?a=1&amp;b=2</loc><lastmod>2026-09-01</lastmod></url>\n</urlset>\n';

test('checkXml: well-formed documents pass', async (t) => {
  const CASES = [
    ['declaration and namespace', SITEMAP],
    ['BOM', '\uFEFF<?xml version="1.0"?><a/>'],
    ['comments and PI', '<!-- c --><?pi x?><a><!-- d --><b x="1" y=\'2\'/></a>'],
    ['CDATA', '<a><![CDATA[<not a tag> & raw]]></a>'],
    ['numeric references', '<a>&#233;&#xE9;&lt;&gt;&quot;&apos;</a>'],
    ['DOCTYPE without subset', '<!DOCTYPE a><a/>'],
  ];
  for (const [name, xml] of CASES) await t.test(name, () => assert.deepEqual(checkXml(xml).ok, true, JSON.stringify(checkXml(xml))));
});

test('checkXml: errors with their line', async (t) => {
  const CASES = [
    ['unclosed root', '<a>\n<b></b>\n', /unclosed element <a>/, 3],
    ['crossed tags', '<a><b></a></b>', /closing <\/a> does not match <b>/, 1],
    ['two roots', '<a/>\n<b/>', /more than one root/, 2],
    ['text outside', 'hola<a/>', /text outside the root/, 1],
    ['raw ampersand', '<a>\nx & y</a>', /invalid entity reference/, 2],
    ['raw <', '<a>1 < 2</a>', /invalid tag|raw </, 1],
    ['duplicate attribute', '<a x="1" x="2"/>', /duplicate attribute x/, 1],
    ['unquoted attribute', '<a x=1/>', /unquoted attribute x/, 1],
    ['empty', '', /no root element/, 1],
    ['internal subset', '<!DOCTYPE a [<!ENTITY e "x">]><a/>', /internal subset not supported/, 1],
    ['html', '<!doctype html><html></html>', /invalid tag/, 1],
  ];
  for (const [name, xml, error, line] of CASES) {
    await t.test(name, () => {
      const r = checkXml(xml);
      assert.equal(r.ok, false);
      assert.match(r.error, error);
      assert.equal(r.line, line);
    });
  }
});

test('checkSitemap: urlset or sitemapindex, each item with a loc', () => {
  assert.deepEqual(checkSitemap(SITEMAP), { ok: true, kind: 'urlset', count: 1 });
  assert.deepEqual(checkSitemap('<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap></sitemapindex>'), { ok: true, kind: 'sitemapindex', count: 1 });
  assert.deepEqual(checkSitemap('<s:urlset xmlns:s="x"><s:url><s:loc>u</s:loc></s:url></s:urlset>'), { ok: true, kind: 'urlset', count: 1 });
  assert.deepEqual(checkSitemap('<urlset><url><loc><![CDATA[https://e.com/]]></loc></url></urlset>'), { ok: true, kind: 'urlset', count: 1 });
  assert.match(checkSitemap('<urlset><url><lastmod>x</lastmod></url></urlset>').error, /<url> without <loc>/);
  assert.match(checkSitemap('<urlset><url><loc>  </loc></url></urlset>').error, /<url> without <loc>/);
  assert.match(checkSitemap('<rss><channel/></rss>').error, /not urlset or sitemapindex/);
});

test('linear cost: 50 000 urls and 20 000 nested elements stay fast', () => {
  const big = `<urlset>${'<url><loc>https://example.com/p</loc></url>'.repeat(50000)}</urlset>`;
  const deep = `${'<a>'.repeat(20000)}${'</a>'.repeat(20000)}`;
  const start = Date.now();
  assert.equal(checkSitemap(big).count, 50000);
  assert.equal(checkXml(deep).ok, true);
  assert.ok(Date.now() - start < 3000, `took ${Date.now() - start} ms`);
});
```

`tests/rules-seo-site.test.mjs`:

```js
// SEO-01 and SEO-05 on the development URL (server on 127.0.0.1) and extra cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree, serveRoutes } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

const DMW = '---\nversion: alpha\nname: Fixture\npignolo:\n  schema: 1\n  web:\n    public: true\n---\n\n## Overview\n\nFixture.\n';
const PAGE = '<!doctype html><html lang="es"><head><title>Inicio</title><link rel="stylesheet" href="/_next/static/css/app.css"></head><body><main>x</main><script src="/_next/static/chunks/main.js"></script></body></html>';
const html = (body) => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });
const text = (body, type = 'text/plain') => ({ headers: { 'content-type': type }, body });
const of = (entries, id) => entries.filter((e) => e.id === id).map((e) => ({ ...e, file: (e.file ?? '').replace(/^http:\/\/127\.0\.0\.1:\d+/, '') }));

async function withSite(routes, files = {}, urls = ['/']) {
  const srv = await serveRoutes(routes);
  try {
    const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, ...files });
    return await runCheck({ project, files: [], design: 'DESIGN.md', urls: urls.map((u) => `${srv.base}${u}`), inject: { fetchOptions: { timeoutMs: 1000 } } });
  } finally {
    await srv.close();
  }
}

test('SEO-01 on the dev URL: render assets under /_next/ blocked, sitemap path fetched on the dev origin', async () => {
  const r = await withSite({
    '/': html(PAGE),
    '/robots.txt': text('User-agent: *\nDisallow: /_next/\nSitemap: https://www.example.com/sitemap.xml\n'),
    '/sitemap.xml': text('<urlset><url><loc>https://www.example.com/</loc></url></urlset>', 'application/xml'),
  });
  const seo01 = of(r.entries, 'SEO-01');
  assert.deepEqual(seo01.filter((e) => e.status === 'fail').map((e) => [e.file, e.line, e.reason]), [
    ['/robots.txt', 2, 'robots.txt blocks the render asset /_next/static/chunks/main.js (/_next/)'],
    ['/robots.txt', 2, 'robots.txt blocks the render asset /_next/static/css/app.css (/_next/)'],
  ]);
  assert.equal(seo01.some((e) => e.file === 'robots.txt'), false, 'with --url a project without robots.txt adds nothing');
  assert.deepEqual(of(r.entries, 'SEO-05').map((e) => [e.status, e.file]), [['pass', '/sitemap.xml']]);
  assert.equal(r.exitCode, 0); // SEO never blocks
});

test('SEO-01/SEO-05 on the dev URL: 404 robots passes, broken sitemap fails, errors are unverified', async () => {
  const noRobots = await withSite({ '/': html(PAGE) });
  assert.deepEqual(of(noRobots.entries, 'SEO-01').map((e) => [e.status, e.reason]), [['pass', 'no robots.txt: everything is allowed']]);
  const broken = await withSite({ '/': html(PAGE), '/robots.txt': text('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n'), '/sitemap.xml': text('<urlset>', 'application/xml') });
  assert.match(of(broken.entries, 'SEO-05')[0].reason, /unclosed element <urlset>/);
  const missing = await withSite({ '/': html(PAGE), '/robots.txt': text('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n') });
  assert.deepEqual(of(missing.entries, 'SEO-05').map((e) => [e.status, e.reason]), [['fail', 'sitemap /sitemap.xml referenced by robots.txt answers 404']]);
  const failing = await withSite({ '/': html(PAGE), '/robots.txt': { status: 500 } });
  assert.deepEqual(of(failing.entries, 'SEO-01').map((e) => [e.status, e.reason]), [['unverified', 'HTTP 500']]);
});

test('SEO-01: the public routes are / and each --url path', async () => {
  const r = await withSite({ '/': html(PAGE), '/precios': html(PAGE.replace('Inicio', 'Precios')), '/robots.txt': text('User-agent: *\nDisallow: /precios\nSitemap: /s.xml\n') }, {}, ['/', '/precios']);
  assert.deepEqual(of(r.entries, 'SEO-01').filter((e) => e.status === 'fail').map((e) => e.reason), ['robots.txt blocks the public route /precios (/precios)']);
});

test('SEO-01 and SEO-05 read the project files too: public/ and static/', () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'static/robots.txt': 'User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n', 'static/sitemap.xml': '<urlset><url><loc>https://e.com/</loc></url></urlset>\n' });
  return runCheck({ project, files: [], design: 'DESIGN.md' }).then((r) => {
    assert.deepEqual(of(r.entries, 'SEO-01').map((e) => [e.status, e.file]), [['pass', 'static/robots.txt']]);
    assert.deepEqual(of(r.entries, 'SEO-05').map((e) => [e.status, e.file]), [['pass', 'static/sitemap.xml']]);
  });
});
```

- [ ] **Paso 2: rojo** (tarjeta común; `--test-name-pattern "rule (SEO-01|SEO-05) "`, más los dos archivos nuevos).
- [ ] **Paso 3: implementar.**

`lib/xml-check.mjs`:

```js
// Minimal XML well-formedness checker (XML 1.0 fifth edition, the subset a sitemap uses) and
// the sitemap shape of sitemaps.org 0.9. Linear in the size of the text; never throws.
//
// checkXml(text) -> { ok: true, root } | { ok: false, error, line }
//   Accepts: XML declaration, comments, processing instructions, a DOCTYPE without internal
//   subset, CDATA, elements with quoted attributes, the five predefined entities and numeric
//   references. Refuses: unbalanced or crossed tags, a second root, text outside the root,
//   a raw `<` or an unknown `&name;` in text or attributes, duplicate attributes.
// checkSitemap(text) -> { ok: true, kind: 'urlset'|'sitemapindex', count } | { ok: false, error, line }
//   Well-formed, root urlset or sitemapindex (any prefix), and every url/sitemap child has a
//   non-empty loc.

const NAME = /^[A-Za-z_:À-￯][-A-Za-z0-9_:.·À-￯]*/;
const REF = /&(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/y;

function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// Checks `&` and `<` in character data between from and to; returns the bad index or -1.
function badChars(text, from, to) {
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '<') return i;
    if (c === '&') {
      REF.lastIndex = i;
      if (!REF.test(text)) return i;
      i = REF.lastIndex - 1;
    }
  }
  return -1;
}

export function parseXml(text, { onOpen, onClose, onText } = {}) {
  const src = String(text ?? '');
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack = [];
  let root = null;
  let rootClosed = false;
  const err = (message, at) => ({ ok: false, error: message, line: lineAt(src, at) });

  while (i < n) {
    const lt = src.indexOf('<', i);
    const end = lt < 0 ? n : lt;
    if (end > i) {
      const chunk = src.slice(i, end);
      if (!stack.length) {
        if (chunk.trim() !== '') return err('text outside the root element', i);
      } else {
        const bad = badChars(src, i, end);
        if (bad >= 0) return err(src[bad] === '&' ? 'invalid entity reference' : 'raw < in text', bad);
        if (onText) onText(chunk, stack.length);
      }
    }
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      if (close < 0) return err('unclosed comment', i);
      i = close + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      if (!stack.length) return err('CDATA outside the root element', i);
      const close = src.indexOf(']]>', i + 9);
      if (close < 0) return err('unclosed CDATA section', i);
      if (onText) onText(src.slice(i + 9, close), stack.length);
      i = close + 3;
    } else if (src.startsWith('<?', i)) {
      const close = src.indexOf('?>', i + 2);
      if (close < 0) return err('unclosed processing instruction', i);
      if (src.startsWith('<?xml', i) && /\s/.test(src[i + 5] ?? '') && i !== (src.charCodeAt(0) === 0xfeff ? 1 : 0)) {
        return err('XML declaration not at the start', i);
      }
      i = close + 2;
    } else if (src.startsWith('<!DOCTYPE', i)) {
      if (root) return err('DOCTYPE after the root element', i);
      const close = src.indexOf('>', i);
      if (close < 0) return err('unclosed DOCTYPE', i);
      if (src.slice(i, close).includes('[')) return err('DOCTYPE internal subset not supported', i);
      i = close + 1;
    } else if (src[i + 1] === '/') {
      const m = NAME.exec(src.slice(i + 2, i + 2 + 256));
      if (!m) return err('invalid closing tag', i);
      const name = m[0];
      let j = i + 2 + name.length;
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] !== '>') return err('invalid closing tag', i);
      const open = stack.pop();
      if (open !== name) return err(open ? `closing </${name}> does not match <${open}>` : `closing </${name}> without an open tag`, i);
      if (onClose) onClose(name, stack.length);
      if (!stack.length) rootClosed = true;
      i = j + 1;
    } else {
      const m = NAME.exec(src.slice(i + 1, i + 1 + 256));
      if (!m) return err('invalid tag', i);
      const name = m[0];
      if (!stack.length) {
        if (rootClosed || root) return err('more than one root element', i);
        root = name;
      }
      let j = i + 1 + name.length;
      const seen = new Set();
      let selfClosing = false;
      for (;;) {
        const ws = j;
        while (j < n && /\s/.test(src[j])) j++;
        if (j >= n) return err(`unclosed tag <${name}>`, i);
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { j += 2; selfClosing = true; break; }
        if (j === ws) return err(`missing space between attributes in <${name}>`, j);
        const a = NAME.exec(src.slice(j, j + 256));
        if (!a) return err(`invalid attribute in <${name}>`, j);
        if (seen.has(a[0])) return err(`duplicate attribute ${a[0]} in <${name}>`, j);
        seen.add(a[0]);
        j += a[0].length;
        while (j < n && /\s/.test(src[j])) j++;
        if (src[j] !== '=') return err(`attribute ${a[0]} without value`, j);
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q !== '"' && q !== "'") return err(`unquoted attribute ${a[0]}`, j);
        const close = src.indexOf(q, j + 1);
        if (close < 0) return err(`unclosed attribute ${a[0]}`, j);
        const bad = badChars(src, j + 1, close);
        if (bad >= 0) return err(`invalid character in attribute ${a[0]}`, bad);
        j = close + 1;
      }
      if (onOpen) onOpen(name, stack.length);
      if (selfClosing) {
        if (onClose) onClose(name, stack.length);
        if (!stack.length) rootClosed = true;
      } else stack.push(name);
      i = j;
    }
  }
  if (stack.length) return err(`unclosed element <${stack[stack.length - 1]}>`, n);
  if (!root) return err('no root element', 0);
  return { ok: true, root };
}

export function checkXml(text) {
  return parseXml(text);
}

const local = (name) => name.slice(name.lastIndexOf(':') + 1);

export function checkSitemap(text) {
  let kind = null;
  let count = 0;
  let inItem = false;
  let locText = null;
  let problem = null;
  const res = parseXml(text, {
    onOpen(name, depth) {
      const l = local(name);
      if (depth === 0) kind = l;
      else if (depth === 1 && (l === 'url' || l === 'sitemap')) { inItem = true; locText = null; count++; }
      else if (depth === 2 && inItem && l === 'loc') locText = '';
    },
    onText(chunk, depth) {
      if (depth === 3 && locText !== null) locText += chunk;
    },
    onClose(name, depth) {
      const l = local(name);
      if (depth === 1 && (l === 'url' || l === 'sitemap')) {
        if (!problem && (locText === null || locText.trim() === '')) problem = `a <${l}> without <loc>`;
        inItem = false;
      }
    },
  });
  if (!res.ok) return res;
  if (kind !== 'urlset' && kind !== 'sitemapindex') return { ok: false, error: `root <${res.root}> is not urlset or sitemapindex`, line: 1 };
  if (problem) return { ok: false, error: problem, line: 1 };
  return { ok: true, kind, count };
}
```

`lib/rules/seo-site.mjs`:

```js
// Static SEO of the site files (spec §5.4, A-06): SEO-01 robots.txt, SEO-05 sitemap.
// Sources: the robots.txt of the project (root, public/ or static/) and, with --url, the
// one served by the development URL. Each source gives its own findings.
import fs from 'node:fs';
import path from 'node:path';
import { pass, fail, unverified } from './api.mjs';
import { parseRobots, isAllowed } from '../robots.mjs';
import { checkSitemap } from '../xml-check.mjs';
import { findSiteFile, generatedBy } from '../site-files.mjs';
import { seoGate, seoPages, indexable, staticAttr } from './seo-common.mjs';

const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;

// One source per robots.txt: { file, origin, text } when there is a text to read, else
// { file, origin, none } (none = why it cannot be read, or null for "absent: everything allowed").
// With --url the served robots.txt is the truth: a project without the file adds nothing.
function robotsSources(pctx) {
  const out = [];
  const rel = findSiteFile(pctx.project, 'robots.txt');
  const gen = rel ? null : generatedBy(pctx.project, 'robots');
  if (rel) out.push({ file: rel, origin: 'file', text: fs.readFileSync(path.join(pctx.project, ...rel.split('/')), 'utf8') });
  else if (gen) out.push({ file: gen, origin: 'file', none: `robots.txt is generated by ${gen}` });
  else if (!pctx.site) out.push({ file: 'robots.txt', origin: 'file', none: null });
  const r = pctx.site?.robots;
  if (r) {
    if (r.error) out.push({ file: r.url, origin: 'url', none: r.error });
    else if (r.status === 404) out.push({ file: r.url, origin: 'url', none: null });
    else if (r.status !== 200) out.push({ file: r.url, origin: 'url', none: `HTTP ${r.status}` });
    else out.push({ file: r.url, origin: 'url', text: r.text });
  }
  return out;
}

// Same-origin paths of the stylesheets and scripts the checked pages load.
function renderAssets(pctx) {
  const paths = new Set();
  for (const page of seoPages(pctx)) {
    if (page.skip) continue;
    for (const el of page.markup.elements) {
      if (el.component) continue;
      let ref = null;
      if (el.tag === 'script') ref = staticAttr(el, 'src');
      else if (el.tag === 'link' && (staticAttr(el, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) ref = staticAttr(el, 'href');
      if (ref && ref.startsWith('/') && !ref.startsWith('//')) paths.add(ref.split(/[?#]/)[0]);
    }
  }
  return [...paths].sort();
}

function publicRoutes(pctx) {
  const routes = new Set(['/']);
  for (const p of pctx.site?.pages ?? []) if (!p.error) routes.add(p.path);
  return [...routes].sort();
}

function seo01(pctx) {
  const gate = seoGate(pctx);
  if (gate) return gate;
  const out = [];
  for (const src of robotsSources(pctx)) {
    const where = { file: src.file };
    if (src.text === undefined) {
      if (src.none) out.push(unverified(src.none, where));
      else out.push(pass('no robots.txt', { ...where, reason: 'no robots.txt: everything is allowed' }));
      continue;
    }
    if (!indexable(pctx)) { out.push(pass('not indexable', { ...where, reason: 'web.indexable is false: blocking crawlers is declared' })); continue; }
    const robots = parseRobots(src.text);
    const found = [];
    for (const route of publicRoutes(pctx)) {
      const r = isAllowed(robots, route);
      if (!r.allowed) found.push(fail(`blocks ${route}`, { ...where, line: r.rule.line, reason: `robots.txt blocks the public route ${route} (${r.rule.pattern})` }));
    }
    for (const asset of renderAssets(pctx)) {
      const r = isAllowed(robots, asset);
      if (!r.allowed) found.push(fail(`blocks ${asset}`, { ...where, line: r.rule.line, reason: `robots.txt blocks the render asset ${asset} (${r.rule.pattern})` }));
    }
    if (!robots.sitemaps.length) found.push(fail('no sitemap', { ...where, reason: 'robots.txt references no sitemap' }));
    out.push(...(found.length ? found : [pass('robots', where)]));
  }
  return out;
}

function sitemapPath(declared) {
  try { return new URL(declared, 'http://x.invalid').pathname; } catch { return null; }
}

function seo05(pctx) {
  const gate = seoGate(pctx);
  if (gate) return gate;
  const out = [];
  for (const src of robotsSources(pctx)) {
    if (src.text === undefined) continue;
    const declared = parseRobots(src.text).sitemaps;
    if (!declared.length) { out.push(unverified('no sitemap referenced (see SEO-01)', { file: src.file })); continue; }
    for (const s of declared) {
      const p = sitemapPath(s.url);
      if (!p) { out.push(fail(`sitemap ${s.url}`, { file: src.file, line: s.line, reason: `invalid sitemap URL ${s.url}` })); continue; }
      if (src.origin === 'url') {
        const got = (pctx.site.sitemaps ?? []).find((x) => x.declared === s.url);
        if (!got) out.push(unverified(`sitemap ${p} not fetched`, { file: src.file }));
        else if (got.error) out.push(unverified(got.error, { file: got.url }));
        else if (got.status === 404) out.push(fail(`sitemap ${p} missing`, { file: got.url, reason: `sitemap ${p} referenced by robots.txt answers 404` }));
        else if (got.status !== 200) out.push(unverified(`HTTP ${got.status}`, { file: got.url }));
        else out.push(verdict(checkSitemap(got.text), got.url, p));
        continue;
      }
      const rel = findSiteFile(pctx.project, p);
      if (!rel) {
        const gen = generatedBy(pctx.project, 'sitemap');
        out.push(gen ? unverified(`sitemap is generated by ${gen}`, { file: gen })
          : fail(`sitemap ${p} missing`, { file: src.file, line: s.line, reason: `sitemap ${p} referenced by robots.txt is not in the project` }));
        continue;
      }
      const abs = path.join(pctx.project, ...rel.split('/'));
      if (fs.statSync(abs).size > MAX_SITEMAP_BYTES) { out.push(unverified('sitemap larger than 10 MB', { file: rel })); continue; }
      out.push(verdict(checkSitemap(fs.readFileSync(abs, 'utf8')), rel, p));
    }
  }
  if (!out.length) out.push(unverified('no robots.txt, so no sitemap is referenced', {}));
  return out;
}

function verdict(res, file, p) {
  return res.ok
    ? pass(`sitemap ${p}`, { file, measure: { kind: res.kind, count: res.count } })
    : fail(`sitemap ${p} invalid`, { file, line: res.line, reason: `sitemap ${p} is not valid: ${res.error}` });
}

export const RULES = [
  { id: 'SEO-01', checkProject: seo01 },
  { id: 'SEO-05', checkProject: seo05 },
];
```

- [ ] **Pasos 4–5.** Commit: `feat(ui): SEO de sitio en ui-check (SEO-01 robots.txt, SEO-05 sitemap)`.

### Task B5 (sonnet): SEO de página (SEO-02, SEO-04, SEO-06, SEO-09, SEO-18)

**Files:** replace `lib/rules/seo-page.mjs`; create `tests/rules-seo-page.test.mjs`, `tests/fixtures/rules/{SEO-02,SEO-04,SEO-06,SEO-09,SEO-18}/`.

**Consumes:** `seoGate`, `seoPages`, `indexable`, `staticAttr`, `metadataObject`, `prop` (`seo-common`), `staticText` (`markup`), `el.inExpression` (Task B1). **Produces:** `RULES` de los cinco ids.

| id | caso | archivos | `expect.json` |
|---|---|---|---|
| SEO-02 | `pass-html` | `index.html` = `PAGE` | — |
| SEO-02 | `pass-index-follow` | `PAGE` con `<title>` → `<meta name="robots" content="index, follow">` / `<title>` | — |
| SEO-02 | `pass-not-indexable` | `DESIGN.md` = `DMW` + `    indexable: false`; `PAGE` con `<title>` → `<meta name="robots" content="noindex">` / `<title>` | `{ "reason": "indexable is false" }` |
| SEO-02 | `fail-meta` | `PAGE` con `<title>` → `<meta name="robots" content="noindex, nofollow">` / `<title>` | `{ "severity": "alto", "lines": [5], "exitCode": 0 }` |
| SEO-02 | `fail-googlebot` | `PAGE` con `<title>` → `<meta name="googlebot" content="none">` / `<title>` | — |
| SEO-02 | `fail-next-metadata` | `app/layout.tsx` = `L` con `{{META}}` = `export const metadata = { title: 'Pedidos', robots: { index: false, follow: true } };` / (vacía) | `{ "severity": "alto", "reason": "index: false" }` |
| SEO-02 | `unverified-conditional` | `app/layout.tsx` = `L` sin `{{META}}`, `{ children }` → `{ children, preview }` y `{{HEAD}}` = `{preview && <meta name="robots" content="noindex" />}` | `{ "reason": "conditional", "lines": [4] }` |
| SEO-02 | `unverified-env-metadata` | `app/layout.tsx` = `L` con `{{META}}` = `export const metadata = {` / `  title: 'Pedidos',` / `  robots: process.env.VERCEL_ENV === 'preview' ? { index: false } : undefined,` / `};` / (vacía) | `{ "reason": "dynamic robots metadata" }` |
| SEO-04 | `pass-html` | `index.html` = `PAGE` | — |
| SEO-04 | `fail-missing` | `PAGE` sin la línea 6 | `{ "severity": "medio", "reason": "no link rel=canonical" }` |
| SEO-04 | `fail-relative` | `PAGE` con `href="https://www.example.com/">` (línea 6) → `href="/">` | `{ "lines": [6], "reason": "not absolute" }` |
| SEO-04 | `fail-two` | `PAGE` con `<link rel="canonical" href="https://www.example.com/pedidos">` insertada antes de `og:title` | `{ "count": 1, "lines": [7], "measure": { "count": 2 } }` |
| SEO-04 | `pass-next-metadata-base` | `L` con `{{META}}` = `export const metadata = {` / `  metadataBase: new URL('https://www.example.com'),` / `  alternates: { canonical: '/' },` / `};` / (vacía) | — |
| SEO-04 | `pass-next-absolute` | `L` con `{{META}}` = `export const metadata = { alternates: { canonical: 'https://www.example.com/' } };` / (vacía) | — |
| SEO-04 | `unverified-next-relative` | `L` con `{{META}}` = `export const metadata = { alternates: { canonical: '/' } };` / (vacía) | `{ "reason": "metadataBase" }` |
| SEO-04 | `unverified-next-none` | `L` con `{{META}}` = `export const metadata = { title: 'Pedidos' };` / (vacía) | `{ "reason": "framework metadata" }` |
| SEO-06 | `pass-two-pages` | `index.html` = `PAGE`; `ayuda.html` = `PAGE` con `<title>Pedidos</title>` → `<title>Ayuda</title>` | `{ "count": 2 }` |
| SEO-06 | `pass-next-template` | `L` con `{{META}}` = `export const metadata = { title: { template: '%s \| Tienda', default: 'Tienda' } };` / (vacía) | — |
| SEO-06 | `pass-jsx-not-compared` | `index.html` = `PAGE`; `app/layout.tsx` = `L` con `{{META}}` = `export const metadata = { title: 'Pedidos' };` / (vacía) | `{ "count": 2 }` |
| SEO-06 | `fail-duplicate` | `index.html` = `PAGE`; `ayuda.html` = `PAGE` | `{ "count": 2, "reason": "repeated in 2 pages", "measure": { "count": 2 } }` |
| SEO-06 | `fail-empty` | `PAGE` con `<title>Pedidos</title>` → `<title>   </title>` | `{ "lines": [5], "reason": "empty title" }` |
| SEO-06 | `fail-missing` | `PAGE` sin la línea 5 | `{ "reason": "no <title>" }` |
| SEO-06 | `unverified-next-none` | `L` sin `{{META}}` | `{ "reason": "framework metadata" }` |
| SEO-06 | `unverified-generate` | `L` con `{{META}}` = `export async function generateMetadata({ params }) {` / `  return { title: params.slug };` / `}` / (vacía) | `{ "reason": "generated at run time" }` |
| SEO-09 | `pass-links` | `PAGE` con `<a href="/ayuda">Ayuda</a>` → `<a href="/ayuda">Ayuda</a><a>Sin destino</a>` | — |
| SEO-09 | `pass-jsx-literal` | `L` sin `{{META}}` con `<body>{children}</body>` → `<body><nav><a href={'/productos'}>Productos</a><Link href="/x">X</Link></nav>{children}</body>` | — |
| SEO-09 | `fail-javascript` | `PAGE` con `<a href="/ayuda">` → `<a href="javascript:void(0)">` | `{ "lines": [13], "reason": "javascript:" }` |
| SEO-09 | `fail-onclick` | `PAGE` con `<a href="/ayuda">` → `<a onclick="abrir()">` | `{ "reason": "without href" }` |
| SEO-09 | `fail-jsx-onclick` | `L` sin `{{META}}` con `<body>{children}</body>` → `<body><a onClick={open}>Abrir</a>{children}</body>` | `{ "lines": [5] }` |
| SEO-09 | `unverified-dynamic` | `L` sin `{{META}}` con `<body>{children}</body>` → `<body>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}{children}</body>` | `{ "reason": "dynamic href" }` |
| SEO-18 | `pass-html` | `index.html` = `PAGE` | — |
| SEO-18 | `fail-missing` | `PAGE` sin las líneas 7–10 | `{ "severity": "detalle", "measure": { "missing": ["og:title", "og:type", "og:image", "og:url"] } }` |
| SEO-18 | `fail-no-image` | `PAGE` sin la línea 9 | `{ "measure": { "missing": ["og:image"] } }` |
| SEO-18 | `pass-next-opengraph` | `L` con `{{META}}` = `export const metadata = {` / `  openGraph: { title: 'Tienda', type: 'website', url: 'https://www.example.com/', images: ['/og.png'] },` / `};` / (vacía) | — |
| SEO-18 | `unverified-next-partial` | `L` con `{{META}}` = `export const metadata = { openGraph: { title: 'Tienda', type: 'website' } };` / (vacía) | `{ "reason": "openGraph without og:image, og:url" }` |
| SEO-18 | `unverified-next-none` | `L` con `{{META}}` = `export const metadata = { title: 'Pedidos' };` / (vacía) | `{ "reason": "framework metadata" }` |

(En `pass-next-template`, `\|` es la barra literal `|` escapada para la tabla.)

- [ ] **Paso 1: fixtures de la tabla y tests.**

`tests/rules-seo-page.test.mjs`:

```js
// SEO-02, SEO-04, SEO-06, SEO-09 and SEO-18 on the development URL (server on 127.0.0.1),
// on --dom documents, and the cost on deep trees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree, serveRoutes } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

const DMW = '---\nversion: alpha\nname: Fixture\npignolo:\n  schema: 1\n  web:\n    public: true\n---\n\n## Overview\n\nFixture.\n';
const page = (title, head = '') => `<!doctype html><html lang="es"><head><title>${title}</title><link rel="canonical" href="https://www.example.com/">${head}</head><body><main><a href="/x">x</a></main></body></html>`;
const html = (body, headers = {}) => ({ headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body });
const strip = (e) => ({ ...e, file: (e.file ?? '').replace(/^http:\/\/127\.0\.0\.1:\d+/, '') });
const of = (entries, id) => entries.filter((e) => e.id === id).map(strip);

async function withSite(routes, urls) {
  const srv = await serveRoutes(routes);
  try {
    const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW });
    return await runCheck({ project, files: [], design: 'DESIGN.md', urls: urls.map((u) => `${srv.base}${u}`), inject: { fetchOptions: { timeoutMs: 1000 } } });
  } finally {
    await srv.close();
  }
}

test('dev URL: noindex seen only there is detalle; titles repeated across routes fail; redirects to login are unverified', async () => {
  const r = await withSite({
    '/': html(page('Inicio'), { 'x-robots-tag': 'noindex' }),
    '/productos': html(page('Inicio', '<meta name="robots" content="noindex">')),
    '/cuenta': { status: 307, headers: { location: '/login' } },
    '/login': html(page('Entrar')),
  }, ['/', '/productos', '/cuenta']);
  assert.deepEqual(of(r.entries, 'SEO-02').map((e) => [e.file, e.status, e.severity]), [
    ['/', 'fail', 'detalle'], ['/cuenta', 'unverified', 'alto'], ['/productos', 'fail', 'detalle'],
  ]);
  assert.deepEqual(of(r.entries, 'SEO-06').filter((e) => e.status === 'fail').map((e) => e.file), ['/', '/productos']);
  assert.match(of(r.entries, 'SEO-04').find((e) => e.file === '/cuenta').reason, /redirected to \/login/);
  assert.equal(r.exitCode, 0);
});

test('a --dom document is checked like a page of the dev URL (noindex -> detalle)', async () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, '.pignolo-ui/runs/r1/dom-1440.html': page('A', '<meta name="robots" content="noindex">') });
  const r = await runCheck({ project, files: [], dom: ['.pignolo-ui/runs/r1/dom-1440.html'], design: 'DESIGN.md' });
  assert.deepEqual(of(r.entries, 'SEO-02').map((e) => [e.status, e.severity]), [['fail', 'detalle']]);
});

test('without web.public every SEO id is one pass that says why', async () => {
  const project = writeTree(makeTempDir(), { 'index.html': page('A', '<meta name="robots" content="noindex">') });
  const r = await runCheck({ project, files: ['index.html'] });
  for (const id of ['SEO-02', 'SEO-04', 'SEO-06', 'SEO-09', 'SEO-18']) {
    assert.deepEqual(of(r.entries, id).map((e) => [e.status, e.reason]), [['pass', 'no DESIGN.md: the site is not declared public (static SEO does not apply)']], id);
  }
});

test('only fragments among the inputs: one unverified per id, never a fail', async () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'Card.tsx': 'export const C = () => <a onClick={go}>x</a>;\n' });
  const r = await runCheck({ project, files: ['Card.tsx'], design: 'DESIGN.md' });
  for (const id of ['SEO-02', 'SEO-04', 'SEO-06', 'SEO-09', 'SEO-18']) {
    assert.deepEqual(of(r.entries, id).map((e) => e.status), ['unverified'], id);
  }
});

test('intentional on SEO-18 turns its fail into pass; SEO-02 and SEO-09 refuse intentional', async () => {
  const design = DMW.replace('    public: true\n', '    public: true\n  intentional:\n    - id: SEO-18\n      why: sin vista previa social\n');
  const project = writeTree(makeTempDir(), { 'DESIGN.md': design, 'index.html': page('A') });
  const r = await runCheck({ project, files: ['index.html'], design: 'DESIGN.md' });
  assert.deepEqual(of(r.entries, 'SEO-18').map((e) => [e.status, e.reason]), [['pass', 'intentional: sin vista previa social']]);
});

test('linear cost: 2000 nested elements with links and metas stay fast', async () => {
  const deep = `<!doctype html><html lang="es"><head><title>A</title></head><body>${'<div><a href="/x">x</a>'.repeat(2000)}${'</div>'.repeat(2000)}</body></html>`;
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'index.html': deep });
  const start = Date.now();
  await runCheck({ project, files: ['index.html'], design: 'DESIGN.md' });
  assert.ok(Date.now() - start < 5000, `took ${Date.now() - start} ms`);
});
```

- [ ] **Paso 2: rojo** (tarjeta común; `--test-name-pattern "rule (SEO-02|SEO-04|SEO-06|SEO-09|SEO-18) "`, más `tests/rules-seo-page.test.mjs`).
- [ ] **Paso 3: implementar.**

`lib/rules/seo-page.mjs`:

```js
// Static SEO on pages (spec §5.4, A-06): SEO-02 noindex, SEO-04 canonical, SEO-06 title,
// SEO-09 crawlable links, SEO-18 Open Graph. Project rules: they read every page at once
// (documents among the inputs and pages fetched from the development URL). Never floor.
import { pass, fail, unverified } from './api.mjs';
import { staticText } from '../markup.mjs';
import { seoGate, seoPages, indexable, staticAttr, metadataObject, prop } from './seo-common.mjs';

const isTag = (el, tag) => el.tag === tag && !el.component;
const inSvg = (markup, el) => {
  for (let p = el.parent; p !== null && p !== undefined; p = markup.elements[p].parent) if (markup.elements[p].tag === 'svg') return true;
  return false;
};
const at = (page, extra = {}) => ({ file: page.file, ...extra });
const NOINDEX = /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i;

// Runs fn over each page; a skipped page gives one unverified; no page gives one unverified.
function perPage(pctx, fn) {
  const gate = seoGate(pctx);
  if (gate) return gate;
  const pages = seoPages(pctx);
  if (!pages.length) return [unverified('no page among the inputs (static SEO checks documents and the development URL)')];
  return pages.flatMap((page) => (page.skip ? [unverified(page.skip, at(page))] : fn(page, pctx)));
}

// ---- SEO-02: accidental noindex ------------------------------------------------------------
function seo02(page, pctx) {
  const sev = page.origin === 'file' ? {} : { severity: 'detalle' }; // seen only on the dev URL
  if (!indexable(pctx)) return [pass('indexable false', at(page, { reason: 'web.indexable is false: noindex is declared' }))];
  const out = [];
  for (const el of page.markup.elements) {
    if (!isTag(el, 'meta')) continue;
    const name = (staticAttr(el, 'name') ?? '').toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;
    const c = el.attrs.get('content');
    if (!c || c.dynamic) { out.push(unverified('dynamic robots meta', at(page, { line: el.line }))); continue; }
    if (!NOINDEX.test(c.value ?? '')) continue;
    if (el.inExpression) { out.push(unverified('conditional robots meta', at(page, { line: el.line }))); continue; }
    out.push(fail(`noindex meta ${name}`, at(page, { line: el.line, selector: `meta[name=${name}]`, reason: `meta ${name} "${c.value}" keeps a public page out of search`, ...sev })));
  }
  const header = page.headers?.['x-robots-tag'] ?? '';
  if (NOINDEX.test(header)) out.push(fail('noindex header', at(page, { reason: `X-Robots-Tag "${header}" on the development URL`, severity: 'detalle' })));
  const meta = metadataObject(page);
  if (meta && meta.dynamic) out.push(unverified('metadata is generated at run time', at(page)));
  else if (meta) {
    const robots = prop(meta.text, 'robots');
    if (robots && robots.kind === 'dynamic') out.push(unverified('dynamic robots metadata', at(page)));
    else if (robots && robots.kind === 'string' && NOINDEX.test(robots.value)) out.push(fail('noindex metadata', at(page, { reason: `metadata.robots "${robots.value}"` })));
    else if (robots && robots.kind === 'object' && /\bindex\s*:\s*false\b/.test(robots.text)) out.push(fail('noindex metadata', at(page, { reason: 'metadata.robots has index: false' })));
  }
  return out.length ? out : [pass('no noindex', at(page))];
}

// ---- SEO-04: one absolute canonical -------------------------------------------------------
const ABSOLUTE = /^https?:\/\/[^/\s]+/i;
function seo04(page) {
  const links = page.markup.elements.filter((e) => isTag(e, 'link') && (staticAttr(e, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  if (links.some((e) => e.inExpression)) return [unverified('conditional canonical link', at(page, { line: links[0].line }))];
  if (links.length > 1) return [fail(`canonical x${links.length}`, at(page, { line: links[1].line, reason: `${links.length} canonical links (one expected)`, measure: { count: links.length } }))];
  if (links.length === 1) {
    const el = links[0];
    const href = el.attrs.get('href');
    if (!href || href.dynamic) return [unverified('dynamic canonical href', at(page, { line: el.line }))];
    if (!ABSOLUTE.test((href.value ?? '').trim())) return [fail('canonical relative', at(page, { line: el.line, selector: 'link[rel=canonical]', reason: `canonical "${href.value}" is not absolute` }))];
    return [pass('canonical', at(page, { line: el.line }))];
  }
  if (page.syntax !== 'jsx') return [fail('canonical missing', at(page, { reason: 'no link rel=canonical' }))];
  const meta = metadataObject(page);
  if (!meta) return [unverified('canonical may come from framework metadata in another file', at(page))];
  if (meta.dynamic) return [unverified('metadata is generated at run time', at(page))];
  const alt = prop(meta.text, 'alternates');
  const canonical = alt && alt.kind === 'object' ? prop(alt.text, 'canonical') : alt;
  if (!alt || !canonical) return [unverified('canonical may come from framework metadata in another file', at(page))];
  if (canonical.kind !== 'string') return [unverified('dynamic canonical metadata', at(page))];
  if (ABSOLUTE.test(canonical.value.trim())) return [pass('canonical metadata', at(page))];
  if (prop(meta.text, 'metadataBase')) return [pass('canonical metadata with metadataBase', at(page))];
  return [unverified('relative canonical: metadataBase may be set in another layout', at(page))];
}

// ---- SEO-06: title present, not empty, not duplicated ----------------------------------------
function titleOf(page) {
  const el = page.markup.elements.find((e) => isTag(e, 'title') && !inSvg(page.markup, e));
  if (el) {
    const t = staticText(page.markup, el);
    return t.dynamic ? { dynamic: true, line: el.line } : { text: t.text.replace(/\s+/g, ' ').trim(), line: el.line };
  }
  if (page.syntax !== 'jsx') return { missing: true };
  const meta = metadataObject(page);
  if (!meta) return { framework: true };
  if (meta.dynamic) return { generated: true };
  const t = prop(meta.text, 'title');
  if (!t) return { framework: true };
  if (t.kind === 'string') return { text: t.value.trim() };
  if (t.kind === 'object') {
    const d = prop(t.text, 'absolute') ?? prop(t.text, 'default');
    if (d && d.kind === 'string') return { text: d.value.trim() };
  }
  return { dynamic: true };
}

function seo06All(pctx) {
  const gate = seoGate(pctx);
  if (gate) return gate;
  const pages = seoPages(pctx);
  if (!pages.length) return [unverified('no page among the inputs (static SEO checks documents and the development URL)')];
  const out = [];
  const byTitle = new Map();
  for (const page of pages) {
    if (page.skip) { out.push(unverified(page.skip, at(page))); continue; }
    const t = titleOf(page);
    if (t.missing) out.push(fail('title missing', at(page, { reason: 'no <title>' })));
    else if (t.framework) out.push(unverified('title may come from framework metadata in another file', at(page)));
    else if (t.generated) out.push(unverified('metadata is generated at run time', at(page)));
    else if (t.dynamic) out.push(unverified('dynamic title', at(page, { line: t.line })));
    else if (t.text === '') out.push(fail('title empty', at(page, { line: t.line, reason: 'empty title' })));
    else if (page.syntax === 'jsx') out.push(pass('title', at(page, { line: t.line }))); // layouts give defaults: never compared
    else {
      const k = t.text.toLowerCase();
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push({ page, t });
    }
  }
  for (const group of byTitle.values()) {
    for (const { page, t } of group) {
      if (group.length === 1) out.push(pass('title', at(page, { line: t.line })));
      else out.push(fail(`title duplicate ${t.text.slice(0, 40)}`, at(page, { line: t.line, reason: `title "${t.text}" repeated in ${group.length} pages`, measure: { count: group.length } })));
    }
  }
  return out;
}

// ---- SEO-09: crawlable links --------------------------------------------------------------
function seo09(page) {
  const out = [];
  for (const el of page.markup.elements) {
    if (!isTag(el, 'a')) continue;
    if (el.spread) { out.push(unverified('spread attributes on a link', at(page, { line: el.line }))); continue; }
    const href = el.attrs.get('href');
    if (!href) {
      const used = ['onclick', 'role', 'tabindex'].some((n) => el.attrs.has(n));
      if (used) out.push(fail('a without href', at(page, { line: el.line, selector: 'a', reason: 'a without href used as a link (not crawlable)' })));
      continue;
    }
    if (href.dynamic) { out.push(unverified('dynamic href', at(page, { line: el.line }))); continue; }
    if (/^\s*javascript:/i.test(href.value ?? '')) out.push(fail('a href javascript', at(page, { line: el.line, selector: 'a', reason: 'href="javascript:..." is not a crawlable link' })));
  }
  return out.some((f) => f.status === 'fail') ? out : [...out, pass('links', at(page))];
}

// ---- SEO-18: Open Graph -------------------------------------------------------------------
const OG = ['og:title', 'og:type', 'og:image', 'og:url'];
const OG_KEYS = { 'og:title': 'title', 'og:type': 'type', 'og:image': 'images', 'og:url': 'url' };
function seo18(page) {
  const found = new Map();
  for (const el of page.markup.elements) {
    if (!isTag(el, 'meta')) continue;
    const p = (staticAttr(el, 'property') ?? staticAttr(el, 'name') ?? '').toLowerCase();
    if (!OG.includes(p)) continue;
    const c = el.attrs.get('content');
    found.set(p, !c || c.dynamic || el.inExpression ? 'dynamic' : (c.value ?? '').trim() ? 'ok' : 'empty');
  }
  if (page.syntax === 'jsx' && found.size === 0) {
    const meta = metadataObject(page);
    if (!meta) return [unverified('Open Graph may come from framework metadata in another file', at(page))];
    if (meta.dynamic) return [unverified('metadata is generated at run time', at(page))];
    const og = prop(meta.text, 'openGraph');
    if (!og) return [unverified('Open Graph may come from framework metadata in another file', at(page))];
    if (og.kind !== 'object') return [unverified('dynamic openGraph metadata', at(page))];
    const missing = OG.filter((k) => !prop(og.text, OG_KEYS[k]));
    return missing.length
      ? [unverified(`openGraph without ${missing.join(', ')} (may come from other layouts or file conventions)`, at(page))]
      : [pass('openGraph metadata', at(page))];
  }
  if ([...found.values()].includes('dynamic')) return [unverified('dynamic or conditional Open Graph meta', at(page))];
  const missing = OG.filter((k) => found.get(k) !== 'ok');
  return missing.length
    ? [fail('og missing', at(page, { reason: `missing ${missing.join(', ')}`, measure: { missing } }))]
    : [pass('og', at(page))];
}

export const RULES = [
  { id: 'SEO-02', checkProject: (pctx) => perPage(pctx, seo02) },
  { id: 'SEO-04', checkProject: (pctx) => perPage(pctx, seo04) },
  { id: 'SEO-06', checkProject: seo06All },
  { id: 'SEO-09', checkProject: (pctx) => perPage(pctx, seo09) },
  { id: 'SEO-18', checkProject: (pctx) => perPage(pctx, seo18) },
];
```

- [ ] **Pasos 4–5.** Commit: `feat(ui): SEO de página en ui-check (SEO-02, SEO-04, SEO-06, SEO-09, SEO-18)`.

---

## Ola 2 del 2b

### Unión de la ola 1 del 2b

- [ ] Unir las Tasks B4 y B5 a `ui/hito-2b`. `npm run test:quiet` una vez: verde completo, incluido el arnés para los 32 ids con checker `ui-check`.

### Task B6 (sonnet): pruebas transversales, documentación y cierre

**Files:**
- Create: `plugins/pignolo-ui/tests/hito-2b-acceptance.test.mjs`
- Modify: `README.md` (secciones, sin tocar el bloque del catálogo), `CHANGELOG.md`, `CREDITS.md`, `.claude-plugin/plugin.json`, `docs/specs/2026-09-28-pignolo-ui-v1-design.md` (§5.9 nueva y una línea en §9 y §12), `docs/STATE.md`

- [ ] **Paso 1: tests transversales** (por las CLIs, en repos temporales).

`tests/hito-2b-acceptance.test.mjs`:

```js
// Cross tests of hito 2b through the CLIs, in temporary git repos: a realistic public Next.js
// site (SEO never blocks, no false fail on common patterns) and one batch of §9 + §12 end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { makeTempDir, writeTree, runScript, serveRoutes, PLUGIN_ROOT } from './helpers.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function repo(tree) {
  const dir = writeTree(makeTempDir(), tree);
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const porcelain = (dir) => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' });

// Async subprocess: the dev server of the test lives in this process.
function runAsync(script, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', script), ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const DESIGN = '---\nversion: alpha\nname: Tienda\npignolo:\n  schema: 1\n  web:\n    public: true\n---\n\n## Overview\n\nTienda.\n';
const LAYOUT = `import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.example.com'),
  title: { template: '%s | Tienda', default: 'Tienda' },
  alternates: { canonical: '/' },
  openGraph: { title: 'Tienda', type: 'website', url: '/', images: ['/og.png'] },
  robots: process.env.VERCEL_ENV === 'preview' ? { index: false } : undefined,
};

export default function RootLayout({ children, preview }: { children: React.ReactNode; preview: boolean }) {
  return (
    <html lang="es">
      <head>{preview && <meta name="robots" content="noindex" />}</head>
      <body>
        <nav><a href="/">Inicio</a><a href={'/productos'}>Productos</a><Link href="/ayuda">Ayuda</Link></nav>
        <main>{children}</main>
        <footer>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</footer>
      </body>
    </html>
  );
}
`;

test('realistic public Next.js site: no SEO fail from common patterns; the dev URL adds detalle only', async () => {
  const dir = repo({
    'DESIGN.md': DESIGN, 'app/layout.tsx': LAYOUT, 'app/page.tsx': 'export default function Page() { return <section><h1>Hola</h1></section>; }\n',
    'public/robots.txt': 'User-agent: *\nDisallow: /api/\n\nSitemap: https://www.example.com/sitemap.xml\n',
    'public/sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.com/</loc></url></urlset>\n',
  });
  const run = path.join(dir, '.pignolo-ui', 'runs', 'r1');
  const files = runScript('ui-check.mjs', ['--project', dir, '--run', run, '--design', 'DESIGN.md', '--files', 'app/layout.tsx', '--files', 'app/page.tsx'], { cwd: dir });
  assert.equal(files.status, 0, files.stderr);
  const seo = (report) => report.entries.filter((e) => e.id.startsWith('SEO-'));
  const report = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
  assert.deepEqual(seo(report).filter((e) => e.status === 'fail'), [], JSON.stringify(seo(report), null, 1));
  assert.ok(seo(report).some((e) => e.id === 'SEO-02' && e.status === 'unverified'), 'conditional/env robots are unverified');

  const page = '<!doctype html><html lang="es"><head><title>Tienda</title><link rel="canonical" href="https://www.example.com/"></head><body><main>x</main></body></html>';
  const srv = await serveRoutes({ '/': { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' }, body: page } });
  try {
    const r = await runAsync('ui-check.mjs', ['--project', dir, '--run', run, '--design', 'DESIGN.md', '--url', `${srv.base}/`], dir);
    assert.equal(r.status, 0, r.stderr);
    const withUrl = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
    const noindex = seo(withUrl).filter((e) => e.id === 'SEO-02' && e.status === 'fail');
    assert.deepEqual(noindex.map((e) => e.severity), ['detalle']);
  } finally {
    await srv.close();
  }
  assert.equal(porcelain(dir), '');
});

test('one batch end to end: save, edit, verify, ui-check, report-check (0, then 1), restore', () => {
  const dir = repo({ 'DESIGN.md': DESIGN, 'src/Save.tsx': 'export const S = () => <button><svg /></button>;\n' });
  const run = path.join(dir, '.pignolo-ui', 'runs', 'r1');
  writeTree(run, { 'expected.json': JSON.stringify([{ path: 'src/Save.tsx', exists: true, change: 'structure' }]) });
  const batch = path.join(run, 'batch-1');
  assert.equal(runScript('files.mjs', ['save', '--project', dir, '--batch', batch, '--expected', path.join(run, 'expected.json')]).status, 0);
  writeTree(dir, { 'src/Save.tsx': 'export const S = () => <button aria-label="Guardar"><svg /></button>;\n' });
  assert.equal(runScript('files.mjs', ['verify', '--project', dir, '--batch', batch]).status, 0);
  const check = runScript('ui-check.mjs', ['--project', dir, '--run', run, '--design', 'DESIGN.md', '--files', 'src/Save.tsx'], { cwd: dir });
  assert.equal(check.status, 0, check.stderr);
  const uiBuf = fs.readFileSync(path.join(run, 'ui-check.json'));
  const entry = JSON.parse(uiBuf).entries.find((e) => e.id === 'A11Y-04' && e.status === 'pass');
  const claim = { id: 'c1', text: 'El botón Guardar tiene nombre accesible', rule: 'A11Y-04', status: 'pass', ref: { source: 'ui-check', fingerprint: entry.fingerprint } };
  const edited = { id: 'c2', text: 'Se editó Save.tsx', ref: { source: 'file', path: 'src/Save.tsx', sha256: sha(fs.readFileSync(path.join(dir, 'src/Save.tsx'))) } };
  writeTree(run, { 'report.json': JSON.stringify({ version: 1, implemented: false, evidence: { 'ui-check.json': sha(uiBuf) }, claims: [claim, edited] }) });
  const ok = runScript('report-check.mjs', ['--project', dir, '--run', run]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  writeTree(run, { 'report.json': JSON.stringify({ version: 1, implemented: false, evidence: { 'ui-check.json': sha(uiBuf) }, claims: [{ ...claim, status: 'fail' }] }) });
  assert.equal(runScript('report-check.mjs', ['--project', dir, '--run', run]).status, 1);
  assert.equal(runScript('files.mjs', ['restore', '--project', dir, '--batch', batch]).status, 0);
  assert.equal(porcelain(dir), '');
});
```

- [ ] **Paso 2: correr.** Estos tests describen el comportamiento que las Tasks B1–B5 ya construyeron: su rojo se demuestra una vez rompiendo lo que protegen y restaurando con el editor: (a) en `seo-page.mjs`, quitar el `if (el.inExpression)` de SEO-02 → el caso realista falla con un `fail` de SEO-02; (b) en `restoreBatch`, saltear la restauración de los esperados → el caso de punta a punta falla en `git status`. Un hueco real se arregla en la tarea dueña, en esta ola, con un commit `fix(ui): …` que nombra el test.
- [ ] **Paso 3: docs y versión.**
  - `plugin.json` → `0.3.0`. CHANGELOG, entrada nueva arriba de 0.2.0:
    - "Hito 2b: SEO estático en `ui-check` (SEO-01, 02, 04, 05, 06, 09, 18; solo con `web.public: true`, nunca bloquean; `--url` para la URL de desarrollo local), `files.mjs` (`save | verify | restore`, §9) y `report-check.mjs` (§12)."
    - "Motivo de subir a 0.3.0: interfaces nuevas (`files`, `report-check`, `--url`, `report.json`) y 7 reglas más en el catálogo (`catalogVersion` 0.3.0)."
    - Los rulings que cambian lo que ve el usuario: SEO-01 sin `robots.txt` pasa; un cambio inesperado en un archivo con seguimiento queda `BLOCKED` en lugar de revertirse; archivos ignorados por git no se vigilan.
  - README:
    - en "Checker (`ui-check`)": `--url` (solo local, un origen, hasta 20, necesita `--design`), qué hace `web.public`/`web.indexable` y que el SEO nunca bloquea;
    - sección nueva "Aplicar sin romper (`files`)": los tres subcomandos con un ejemplo de `expected.json`, los códigos 0/1/2, qué se restaura, qué queda `BLOCKED` y por qué, y que los archivos ignorados no se vigilan;
    - sección nueva "Informe verificado (`report-check`)": el formato de `report.json` (el bloque de los Rulings), las cuatro fuentes de evidencia, los códigos y qué significa "retirada";
  - CREDITS: las fuentes de SEO (RFC 9309, RFC 6596, sitemaps.org 0.9, HTML Living Standard, Open Graph protocol, Google Search Central) como enlaces con su fecha de consulta, sin texto copiado; completar la fecha que alguna tarea no pudo verificar (misma fecha en `rules.json`, y regenerar el bloque del README con el comando de la Task B1 si cambió).
  - Spec: §5.9 "Aclaraciones técnicas del hito 2b" con los rulings de compuerta, SEO como reglas de proyecto, páginas y `--url` local, SEO-01/04/06/18 en JSX, `ui-check.json` con URLs, `files.json` y `BLOCKED` para cambios inesperados con seguimiento, `report.json` y `browser.json`; en §9 y §12, una línea que remite a §5.9. Sin tocar ninguna decisión del autor.
- [ ] **Paso 4: suite y revisión final.** `npm run test:quiet` completo y `claude plugin validate plugins/pignolo-ui`. Después, **una revisión final opus** de `main..ui/hito-2b` (con el Review Focus del 2b), una pasada de arreglos y una confirmación acotada; lo que quede se clasifica.
- [ ] **Paso 5: estado.** `docs/STATE.md`: hito 2b terminado, hito 2 de pignolo-ui cerrado, qué quedó para el hito 3 (`browser.json` con el contrato de `report-check`) y el 4 (skills que escriben `report.json` y corren `files`; las ~125 reglas de guía).
- [ ] **Paso 6: unión y push** a `main` solo con el OK del autor.

## Decisiones que necesita el autor (hito 2b)

**Ninguna nueva.** Revisado contra lo reservado: sin dependencias ni binarios; sin costo nuevo (el método ya aprobado para el 2a, con opus solo en 2 de 6 tareas); sin datos ni texto de terceros (las fuentes de SEO van como enlaces fechados, sin copiar texto); ningún contrato que consuma el núcleo cambia (`--url` es opcional y aditivo, y la compuerta del hito 5 sigue con la invocación de §5.5; `report.json` y `browser.json` son internos de pignolo-ui). Dos rulings acotan al spec a favor de la seguridad y quedan anotados abajo para que el autor los vea en la revisión: `--url` solo local y `BLOCKED` en lugar de revertir cambios inesperados con seguimiento.

**Fuera de este plan:** la pregunta de las ~125 reglas de guía del auditor es del plan del hito 4.

## Contradicciones y huecos del spec encontrados (hito 2b)

1. **§5.2 dice que todas las SEO son de documento**, pero SEO-01 y SEO-05 leen archivos de sitio y SEO-06 compara rutas. Ruling: `level: document` en el catálogo, implementadas como reglas de proyecto sobre las páginas.
2. **SEO-01 "(o da 404, que equivale a todo permitido) … y referencia un sitemap"** no dice si la falta de `robots.txt` falla por no referenciar un sitemap. Ruling: no falla; SEO-05 queda `unverified`.
3. **§5.4 "sobre lo que devuelve `fetch`" frente a §0 "nada remoto".** Ruling: solo direcciones de loopback; el sitemap de producción se busca por su ruta.
4. **§9 "si no, se revierte"** no se puede cumplir sin git destructivo para un archivo con seguimiento que el lote no copió. Ruling: se revierte lo que tiene prueba (copias y archivos creados con sha256 registrado); lo demás, `BLOCKED` al usuario.
5. **§12 no define `report.json`** ni la forma de `browser.json`. Ruling: los contratos de arriba; el hito 3 hereda el de `browser.json`.
6. **§9 paso 5** (correr `typecheck`/`build`/`lint`) no es de `files.mjs`: lo hace la skill del hito 4.
7. **Mockups y SEO:** §3.3 dice que `design/approved/**` nunca entra al alcance de una implementación; el SEO tampoco los mira (títulos repetidos entre pantallas de un flujo no son un problema del sitio).
