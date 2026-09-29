# pignolo-ui v1 — Hito 1: esqueleto y formato

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar instalable el plugin opcional `pignolo-ui` en el marketplace del repo, con su linter de empaquetado, el parser YAML propio, colores, fuentes de tokens, `design-md` (`validate` con alias semánticos, `extract`, `patch`), el chequeo de fuga, los aprobados versionados (`approve`) y la plantilla `DESIGN.md` que pasa el linter oficial 0.4.0 con 0 errores y 0 warnings.

**Architecture:** El plugin vive en `plugins/pignolo-ui/` del mismo repo y se registra en el `marketplace.json` de la raíz. Toda la lógica está en módulos ESM puros de `plugins/pignolo-ui/lib/` (testeables sin Claude Code); `scripts/design-md.mjs` y `scripts/approve.mjs` son CLIs finas que reciben todas las rutas como argumentos, imprimen un solo objeto JSON en stdout y salen con 0/1/2. `DESIGN.md` se lee con un parser YAML propio (`yaml-subset`) que declara lo que no soporta en lugar de leerlo mal, se valida contra el esquema `pignolo:` cerrado y se edita solo por líneas (`patch`), nunca re-serializando. Los tests (`node:test`) viven en `plugins/pignolo-ui/tests/` y corren dentro de `npm test` junto con los del núcleo.

**Tech Stack:** Node.js ≥ 22 (A-12; probado con 24.13.1, Node 22 sin probar), `node:test` + `node:assert/strict`, ESM `.mjs`, sin dependencias npm. Solo en desarrollo, y fuera de `package.json`: `@google/design.md@0.4.0` instalado a mano para el test de desarrollo contra el linter oficial.

**Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md`, versión de `baacaee` (§0–§4; §3.2 carpeta del run; §5.1 y §5.4 para el catálogo semilla; §7.4 chequeo de fuga; §16.1; §17 hito 1).

**Prerrequisito:** la Task 1 del plan del núcleo (`docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md`) está aplicada: existen `package.json` y `.claude-plugin/marketplace.json` en la raíz. La Task 1 de este plan los reemplaza por la versión que agrega pignolo-ui.

**Estado de verificación:** todo el código de este plan se transcribió desde una copia de trabajo donde se ejecutó completo, tarea por tarea (un commit por tarea): `npm run test:ui` → 122 tests, 120 en verde y 2 skip visibles sin linter oficial (122/122 con `PIGNOLO_UI_DESIGNMD`); `npm test` → los 561 del núcleo de la copia más los 122 (683); `claude plugin validate plugins/pignolo-ui` y `claude plugin validate .` → `Validation passed`. Un replay mecánico aplicó los bloques de código y las ediciones de este plan en orden sobre la base, comprobó cada conteo de rojo y de verde que declara cada paso y que al cerrar cada tarea los archivos son idénticos byte a byte a los de la copia. Cada rotura de "Demostrar el rojo" se ejecutó y falló exactamente con los tests que se nombran.

## Global Constraints

- **Sin dependencias npm, sin hooks, sin binarios y sin nada remoto en tiempo de ejecución** (spec §0). El linter del plugin (Task 2) lo hace cumplir: imports solo `node:` o relativos con extensión.
- **Requisitos:** Node ≥ 22 para pignolo-ui (A-12: Node 20 sin soporte, y `node --test` con globs lo exige) y Claude Code ≥ 2.1.271, porque `options` de `userConfig` existe desde esa versión (spec §0). Node 22 queda declarado y sin probar (el spike solo tuvo Node 24): va al checklist manual (§16.4).
- **Nombres semánticos** (spec §4.2): lo que **genera** pignolo-ui usa el vocabulario MD3 (`primary`, `on-surface`…); al **leer** un `DESIGN.md` se aceptan alias (`accent` → `primary`, `label`/`text` → `on-surface`…) de `pignolo.aliases` o del mapa por defecto documentado en el README, y el hallazgo dice qué alias tomó.
- **Carpeta del run** (spec §3.2): `<repo>/.pignolo-ui/runs/<run-id>/`, con `.pignolo-ui/.gitignore` = `*` creado antes de la primera escritura; nunca se toca un archivo versionado ni `.git/info/exclude`.
- **Chequeo de fuga** (spec §7.4): antes de guardar una opción como aprobado, ningún archivo lleva el email del usuario, el nombre o el email de git, el usuario o el home del SO (valores que la skill pasa por argumento) ni una ruta absoluta local.
- **`userConfig`** (spec §3.1), verbatim: `optionsPerDecision` `string` con `options` `"1"`, `"3"`, por defecto `"3"`; `presentation` `string` con `options` `"auto"`, `"local"`, por defecto `"auto"`; `language` `string`, por defecto vacío.
- **Formato `DESIGN.md`:** Google Labs **fijado a 0.4.0**. Claves oficiales: `version`, `name`, `description`, `omitted`, `colors`, `typography`, `rounded`, `spacing`, `components`. Las extensiones van solo bajo `pignolo:`, nunca dentro de `typography` ni de `components` (spec §4.2).
- **En `pignolo:`, los valores hoja no llevan hex ni dimensiones con unidad**: números con el sufijo en el nombre (`widthPx`, `durationMs`), colores en OKLCH o `rgb()`, o referencias `{colors.x}` (spec §4.2). El validador los rechaza con las mismas expresiones que `token-like-ignored` de 0.4.0.
- **Esquema `pignolo:` versión 1, cerrado** (spec §4.3): toda clave fuera de la tabla es un error del validador.
- **Parser YAML** (spec §4.4): soporta mapas y listas por bloque; mapas y listas en línea de una sola línea; claves entre comillas; comentarios; escalares con números; hasta 4 niveles. Ante anclas o alias, bloques `|`/`>`, varios documentos o colecciones en línea que ocupan varias líneas: "YAML no soportado: no validado", y ninguna regla de ese archivo se evalúa.
- **Colores que se entienden** (spec §4.5): hex de 3, 4, 6 u 8 dígitos; `rgb`, `hsl`, `hwb`, `oklch`, `oklab`, `lab` y `lch`, con alfa; HSL desnudo; `var()` encadenadas con fallback; `color-mix()` en `srgb` y `oklch`. Cualquier otro formato: "no verificado".
- **Fuentes de tokens** (spec §4.5): variables CSS en `:root`, `.dark`, `[data-theme]`; Tailwind v4 `@theme` / `@theme inline`; shadcn (`components.json` + `:root`/`.dark`, HSL desnudo); Tailwind v3 solo si el tema es un objeto literal (si no, "no verificado"); CSS-in-JS, MUI o Chakra: "no soportado". Nunca se crea una segunda fuente.
- **Escala de severidad** (spec §5.3): `bloquea | alto | medio | detalle`.
- **Aprobados** (spec §3.3): `design/approved/<flujo>/` con un HTML por pantalla y `manifest.json` con el sha256 de cada archivo; inmutables (`<flujo>-v2/`, `-v3`…); `DESIGN.md` registra ruta, sha256 del `manifest.json`, fecha y cita literal.
- **Las rutas llegan como argumentos:** `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` y `userConfig` no llegan al entorno de Bash (spec §2).
- **Idioma:** nombres, claves, ids, comentarios del código y `message` de los hallazgos JSON en inglés (texto técnico que lee el agente; la skill lo presenta llano en el idioma del usuario, A-04). Lo que sale por stderr para la persona, en español. Commits en español, Conventional Commits.
- **Windows:** ningún `spawn` con shell; los scripts se lanzan con `process.execPath`. Los archivos de texto conservan su fin de línea (CRLF o LF) y su BOM.
- **Nunca escribir el carácter U+FEFF literal en el código:** siempre su escape (barra invertida, `u`, `FEFF`). Algunas herramientas de edición convierten el escape en el carácter invisible; después de escribir un archivo, buscar U+FEFF y reemplazarlo.
- **Tests:** siempre con `npm test` (todo el repo) o `npm run test:ui` (solo pignolo-ui); nunca `node --test tests/`. Sin red. El test de desarrollo contra el linter oficial sale como **skip visible** si `PIGNOLO_UI_DESIGNMD` no apunta a un `@google/design.md@0.4.0` instalado a mano; nunca como verde.
- **Demostrar el rojo:** una rotura por vez, `npm run test:ui`, verificar los tests que fallan y restaurar con el editor (nunca con `git checkout`/`git restore`).
- **Commits:** mensaje escrito en un archivo con la herramienta de escritura y `git commit -F <archivo>` (nunca texto con backticks o `$(...)` entre comillas dobles de la shell), con los trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01CW6KRFJq1CGFSLLNq2N6Vb`.

## Review Focus

Las cinco clases de entrada no cubiertas por el spec que más probablemente muerdan, cada una con su test en la tarea dueña:

1. **Fin de línea CRLF** (Windows): el parser lee CRLF igual que LF (Task 3, `CRLF input parses like LF and keeps line numbers`); `setCssVar` inserta con CRLF (Task 6, `a new variable is inserted in the existing block with its indentation and line endings`); `patch` conserva todos los bytes (Task 8, `set on an existing line keeps comments, indentation and every other byte (CRLF + BOM)`).
2. **BOM UTF-8 al inicio** de `DESIGN.md`: el frontmatter se reconoce y los números de línea no cambian (Task 7, `a BOM and CRLF line endings validate the same (Review Focus 2)`); `patch` lo conserva (Task 8, mismo test que el punto 1).
3. **Hex sin comillas** (`primary: #0B6BCB`): en YAML es un comentario y el valor queda vacío. El parser lo lee como `null` igual que la librería `yaml` (Task 3, `an unquoted hex after ": " is a comment, so the value is null (Review Focus 3)`) y el validador lo reporta en su línea, con la causa (Task 7, `an unquoted hex is empty for YAML and is reported on its line (Review Focus 3)`).
4. **CSS con llaves o `;` dentro de strings, comentarios y `url(data:…)`**: no abren bloques fantasma ni cortan declaraciones (Task 5, `braces and semicolons inside strings, comments and url() do not open blocks (Review Focus 4)`).
5. **Tailwind v3 con tema no literal** (spread, función, `require`, template con `${}`, config envuelta en una llamada, spread en la raíz): "no verificado", nunca lectura parcial (Task 5, `Tailwind v3: anything that is not a literal theme is unverified, never partial (Review Focus 5)`); y `extract` no adivina por frecuencia en ese caso (Task 10, `an unreadable config or tokens in JavaScript: no proposal, never a frequency guess`).

---

## File Structure

```
package.json                                     scripts test (núcleo + ui) y test:ui (modificado)
.claude-plugin/marketplace.json                  entrada pignolo-ui (modificado)
plugins/pignolo-ui/.claude-plugin/plugin.json    nombre, versión, userConfig (§3.1)
plugins/pignolo-ui/README.md  CHANGELOG.md  CREDITS.md  LICENSE
plugins/pignolo-ui/lib/yaml-subset.mjs           parser YAML propio (§4.4)
plugins/pignolo-ui/lib/color.mjs                 colores → sRGB, contraste WCAG, formatos (§4.5)
plugins/pignolo-ui/lib/token-sources.mjs         fuentes de tokens: lectura y escritura (§4.5)
plugins/pignolo-ui/lib/design-doc.mjs            frontmatter y validador de DESIGN.md (§4.2, §4.3)
plugins/pignolo-ui/lib/design-patch.mjs          edición por líneas con diff (§4.4 "Escritura")
plugins/pignolo-ui/lib/official-lint.mjs         linter oficial solo si ya está instalado (A-09)
plugins/pignolo-ui/lib/design-extract.mjs        arranque de DESIGN.md desde el código (§4.5, A-18)
plugins/pignolo-ui/lib/run-folder.mjs            raíz de la carpeta del run y su .gitignore (§3.2)
plugins/pignolo-ui/lib/leak-check.mjs            datos del usuario o de la máquina en una salida (§7.4)
plugins/pignolo-ui/lib/approved.mjs              aprobados: guardar, registrar, verificar (§3.3)
plugins/pignolo-ui/scripts/design-md.mjs         CLI validate | patch | extract
plugins/pignolo-ui/scripts/leak-check.mjs        CLI del chequeo de fuga
plugins/pignolo-ui/scripts/approve.mjs           CLI save | record | verify
plugins/pignolo-ui/catalog/rules.json            catálogo semilla: 25 reglas de §5.4 + THEME-03
plugins/pignolo-ui/templates/DESIGN.md           plantilla 0/0 con el linter 0.4.0
plugins/pignolo-ui/tests/helpers.mjs             rutas, temporales, árbol de archivos, scripts como subproceso
plugins/pignolo-ui/tests/support/lint-plugin.mjs linter del plugin (R9)
plugins/pignolo-ui/tests/*.test.mjs
plugins/pignolo-ui/tests/fixtures/design/valid.md
plugins/pignolo-ui/tests/fixtures/extract/<caso>/…
```

Notas sobre el spec:
- §2 lista `lib/yaml-subset.mjs lib/color.mjs lib/token-sources.mjs …`; este plan agrega `lib/design-doc.mjs`, `lib/design-patch.mjs`, `lib/design-extract.mjs`, `lib/official-lint.mjs`, `lib/run-folder.mjs`, `lib/leak-check.mjs` y `lib/approved.mjs` para que `scripts/design-md.mjs` y `scripts/approve.mjs` queden como CLIs finas y la lógica se pruebe sin subprocesos. Decisión técnica.
- `catalog/rules.json` es del hito 2 según §17, pero el validador de este hito necesita saber qué reglas aceptan `intentional`: acá se crea la semilla con las 25 reglas de §5.4 y THEME-03, con los campos de §5.1; el hito 2 la completa.
- Los tests van en `plugins/pignolo-ui/tests/`, como dice §2 (el núcleo los tiene en `tests/` de la raíz); `npm test` corre los dos.
- `scripts/leak-check.mjs` (§2, §7.4) no figura en §17; entra en este hito porque §7.4 lo exige antes de guardar como aprobado, y `approve` es de este hito. Antes de publicar en el lienzo lo usa el hito 4.

## Decisiones técnicas tomadas al construir

Puntos que el spec deja abiertos o ambiguos, resueltos por el agente y probados:

1. **"Hasta 4 niveles"** (§4.4) se cuenta debajo de la raíz: el propio esquema necesita 4 (`pignolo.rejections[].pattern`). Cinco niveles es "no soportado".
2. **Comillas sin cerrar en una clave** (`d: "abierta`): el YAML real las tomaría como un escalar de varias líneas; §4.4 no lo lista entre lo no soportado, así que es un error de esa clave y el resto se sigue evaluando.
3. **`cssVars`**: la clave es la ruta del token (`colors.primary`) y el valor el nombre de la variable (`--primary`).
4. **"Tokens primitivos y semánticos"** (§4.2): semántico = nombre de la familia MD3 (la misma función `colorFamily` del linter oficial); primitivo = cualquier otro nombre. Se exigen `primary`, `on-primary`, `surface`, `on-surface` y al menos un primitivo.
5. **"Estados de cada control"** (§4.2): cada componente de control (`button`, `input`, `select`, `checkbox`, `radio`, `switch`, `link`, `tab`, `chip`, `toggle`, `textarea`) necesita su variante `-hover`; además `pignolo.states` completo y `pignolo.focus`.
6. **"Jerarquía y orden de lectura (en prosa)"**: un encabezado `##`–`######` que nombre jerarquía u orden de lectura (en inglés o en español).
7. **`omitted` oficial** también exime del contenido obligatorio de esa sección (por ejemplo, un diseño sin radios).
8. **`npx --no-install`** (§4.2) se implementa buscando el paquete ya instalado (`PIGNOLO_UI_DESIGNMD` o `<proyecto>/node_modules/@google/design.md`) y corriéndolo con `node`, sin shell: misma semántica (nunca descarga) y sin el problema de `.cmd` con shell en Windows. Sin salida JSON: "no verificado", nunca aprobado.
9. **`patch` rechaza solo lo que introduce**: un hallazgo que rechaza la escritura y que el archivo del usuario ya tenía no bloquea un cambio ajeno a él.
10. **`extract` no adivina** cuando hay configuración que no se puede leer (Tailwind v3 no literal) o tokens en JavaScript (MUI, Chakra, CSS-in-JS): contar frecuencias crearía una segunda fuente. Sin nada que leer ni contar: sin propuesta.
11. **Nombres en `extract` por frecuencia**: `primary` = el color cromático más frecuente (C OKLCH ≥ 0,05), `surface`/`on-surface` = el neutro más claro y el más oscuro; todo queda en `pignolo.extracted`. Son propuestas que el usuario confirma en el diff.
12. **`approve`** se parte en `save` (carpeta + manifest), `record` (entrada de `## Decisions` como diff; escribe solo con `--write`) y `verify`. `save` exige pantallas estáticas autocontenidas: `<meta charset="utf-8">`, sin `<script>` (§7.4), sin recursos remotos (etiquetas que cargan algo o `url()`/`@import` remotos; un `<a href>` externo es un link, no un recurso), links internos relativos que resuelven, nombres en minúsculas y sin subcarpetas.
13. **Colores fuera de gamut** se recortan a sRGB (no el mapeo de gamut de CSS) y se marcan `clipped: true`.
14. **Alias semánticos** (§4.2, §4.3): el mapa por defecto (`DEFAULT_ALIASES`, listado en el README y con un test que los compara) lleva los nombres comunes de shadcn y de apps reales (`accent`, `brand`, `text`, `label`, `foreground`, `bg`, `card`, `border`, `destructive`…). Un alias se toma solo si su nombre MD3 no está definido también y ningún nombre anterior lo tomó. Cada alias tomado es un hallazgo `DESIGN-ALIAS` de severidad `detalle` ("`colors.accent read as primary (default alias)`"); los hallazgos `detalle` no vuelven inválido el archivo ni cambian el código de salida. `pignolo.aliases` acepta como clave cualquier nombre que no sea ya MD3 y como valor solo un nombre semántico MD3.
15. **`extract` genera nombres MD3**: un color que entra por un alias del mapa por defecto se renombra (conserva su lugar, su valor oscuro y en `cssVars` la variable original del proyecto), y la salida lo lista en `renamed`.
16. **Carpeta del run en este hito:** lo único que puede escribir ahí es `extract --out`; si la ruta cae dentro de `<repo>/.pignolo-ui/`, crea antes `.pignolo-ui/.gitignore` = `*` (sin pisar uno existente) y la carpeta. `lib/run-folder.mjs` (`ensureRunRoot`, `isInsideRunRoot`) queda para `run.mjs` del hito 4. `approve` no escribe en la carpeta del run: lee las pantallas de `--from` y escribe en `design/approved/`.
17. **Chequeo de fuga:** los valores se comparan sin distinguir mayúsculas; los de menos de 3 caracteres se ignoran (un usuario de dos letras marcaría cualquier palabra); una ruta absoluta es una unidad de Windows (`C:\`, `D:/`) o `/Users/`, `/home/` que no siguen a una letra, un punto o `~` (así no marcan una URL ni una ruta relativa). La salida nunca repite un valor: da su índice en la lista. `approve save --values-file` lo corre antes de escribir; sin valores, igual busca rutas absolutas.

## Diferido y declarado

Lo que §17 asigna al hito 1 y este plan no entrega completo, con el motivo:

- **Catálogo:** solo la semilla (ver File Structure). El test de pares contradictorios, las referencias entre reglas, los chequeos de navegador, los ids SEO, las ~125 reglas de guía y los snippets en página de prueba son del hito 2.
- **`ui-check` sobre `design/approved/**`** (CONTENT-01 como `detalle`): es del checker, hito 2.
- **COLOR-03 y DRIFT-01** (contraste entre pares de tokens y cruce `cssVars` ↔ CSS): hito 2. Este hito deja `contrastRatio`, `composite` y `cssVars` listos.
- **Linter del plugin (R9):** no chequea de forma estática la salida UTF-8, los bucles de `dirname` que terminan en la raíz de Windows ni la expansión de `${CLAUDE_PLUGIN_ROOT}`; eso queda para la instalación real del checklist manual (hito 5).
- **`norms.md`** (§3.2, con la clave `symptoms`) y la comprobación de `claude --version` (§0): hito 4, junto con las skills.
- **`extract`**: de tipografía solo lee la familia (`fontFamily`); tamaños, pesos e interlineados quedan para completarse como diff. De Tailwind v3 lee `colors`, `borderRadius`, `fontFamily` y `spacing`. La frecuencia cuenta solo archivos `.css` (no `.scss`/`.less` ni `<style>` de HTML).
- **Node 22 sin probar:** todo se probó con Node 24.13.1; `npm test` en Node 22 real entra al checklist manual (§16.4).
- **Catálogo semilla:** los criterios de A11Y-04, A11Y-16, COLOR-02, DEPTH-01 y LAYOUT-04 ya tienen el texto nuevo del spec (roles sin nombre por contenido, placeholder solo, familia de tokens), pero sus checkers son del hito 2, igual que las clases utilitarias de Tailwind y B1–B3.
- **README:** la recomendación de `acceptEdits` por las escrituras de los subagentes (§3.2) y el aviso legal (A-08) van con las skills, en el hito 4. El chequeo de fuga antes de publicar en el lienzo, también (hito 4).
- **Contrato 0/0 de `extract` fuera de los fixtures:** un proyecto real sin ninguna variable de fuente (por ejemplo, shadcn con la fuente puesta por `next/font`) da una propuesta sin `typography`, y el linter oficial avisa `missing-typography` hasta que el flujo complete la tipografía (el validador propio la marca `alto`). El criterio 2 de §0.1 se mide, como dice el spec, sobre la plantilla y los fixtures.
- **Deriva prosa ↔ YAML** (lección de la issue #16 del formato): el validador no compara números de la prosa con los tokens; la plantilla cita tokens y su test lo verifica.

---

### Task 1: Esqueleto de pignolo-ui y su entrada en el marketplace

**Files:**
- Modify: `package.json`, `.claude-plugin/marketplace.json`
- Create: `plugins/pignolo-ui/.claude-plugin/plugin.json`, `plugins/pignolo-ui/README.md`, `plugins/pignolo-ui/CHANGELOG.md`, `plugins/pignolo-ui/CREDITS.md`, `plugins/pignolo-ui/LICENSE` (copia de la `LICENSE` de la raíz)
- Test: `plugins/pignolo-ui/tests/helpers.mjs`, `plugins/pignolo-ui/tests/manifest.test.mjs`

**Interfaces:**
- Consumes: `package.json` y `.claude-plugin/marketplace.json` del núcleo (Task 1 del plan del núcleo).
- Produces:
  - `npm test` (núcleo + ui) y `npm run test:ui` (solo `plugins/pignolo-ui/tests/**/*.test.mjs`).
  - `tests/helpers.mjs`: `TESTS_DIR`, `PLUGIN_ROOT`, `REPO_ROOT`, `FIXTURES` (rutas absolutas); `makeTempDir(prefix = 'pignolo-ui-test-') -> string`; `writeTree(dir, { 'a/b.css': text }) -> dir`; `runScript(script, args, opts = {}) -> { status, stdout, stderr, json }` (lanza `scripts/<script>` con `process.execPath`; `json` es la salida parseada o `null`).

- [ ] **Step 1: Escribir el test que falla (y los scripts de tests)**

`package.json`:
```json
{
  "name": "pignolo-repo",
  "private": true,
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\" \"plugins/pignolo-ui/tests/**/*.test.mjs\"",
    "test:ui": "node --test \"plugins/pignolo-ui/tests/**/*.test.mjs\""
  }
}
```

`plugins/pignolo-ui/tests/helpers.mjs`:
```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.join(TESTS_DIR, '..');
export const REPO_ROOT = path.join(PLUGIN_ROOT, '..', '..');
export const FIXTURES = path.join(TESTS_DIR, 'fixtures');

export function makeTempDir(prefix = 'pignolo-ui-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Writes a tree { 'a/b.css': 'text' } under dir and returns dir.
export function writeTree(dir, tree) {
  for (const [rel, content] of Object.entries(tree)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

// Runs plugins/pignolo-ui/scripts/<script> with node and returns { status, stdout, stderr, json }.
export function runScript(script, args, opts = {}) {
  const res = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', script), ...args], {
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
  });
  let json = null;
  try { json = JSON.parse(res.stdout); } catch { /* not JSON */ }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
}
```

`plugins/pignolo-ui/tests/manifest.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, REPO_ROOT } from './helpers.mjs';

const OPTION_FIELDS = new Set(['type', 'title', 'description', 'required', 'default', 'options', 'multiple', 'sensitive', 'min', 'max']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('marketplace lists pignolo-ui with a relative source', () => {
  const mk = readJson(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
  const entry = mk.plugins.find((p) => p.name === 'pignolo-ui');
  assert.ok(entry, 'pignolo-ui entry missing');
  assert.equal(entry.source, './plugins/pignolo-ui');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, entry.source)), 'source directory missing');
});

test('plugin manifest: name, semver version, license, no hooks', () => {
  const pj = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
  assert.equal(pj.name, 'pignolo-ui');
  assert.match(pj.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pj.license, 'MIT');
  assert.equal(pj.hooks, undefined);
  assert.equal(pj.mcpServers, undefined);
});

test('userConfig declares exactly the three keys of spec 3.1', () => {
  const { userConfig } = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
  assert.deepEqual(Object.keys(userConfig).sort(), ['language', 'optionsPerDecision', 'presentation']);
  assert.deepEqual(userConfig.optionsPerDecision.options, ['1', '3']);
  assert.equal(userConfig.optionsPerDecision.default, '3');
  assert.deepEqual(userConfig.presentation.options, ['auto', 'local']);
  assert.equal(userConfig.presentation.default, 'auto');
  assert.equal(userConfig.language.default, '');
  assert.equal(userConfig.language.options, undefined);
  for (const [key, opt] of Object.entries(userConfig)) {
    assert.equal(opt.type, 'string', key);
    assert.ok(opt.title && opt.description, `${key} needs title and description`);
    for (const field of Object.keys(opt)) assert.ok(OPTION_FIELDS.has(field), `${key}.${field} is not a userConfig field`);
    if (opt.options) assert.ok(opt.options.includes(opt.default), `${key} default must be one of its options`);
  }
});

test('plugin ships README, CHANGELOG, CREDITS and LICENSE', () => {
  for (const f of ['README.md', 'CHANGELOG.md', 'CREDITS.md', 'LICENSE']) {
    assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, f)), `${f} missing`);
  }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — los 4 tests de `manifest.test.mjs` fallan (`pignolo-ui entry missing`, `ENOENT … plugin.json`, `README.md missing`) (`tests 4`, `pass 0`, `fail 4`).

- [ ] **Step 3: Implementación mínima**

`.claude-plugin/marketplace.json`:
```json
{
  "name": "pignolo",
  "description": "Pignolo: metodología de desarrollo con agentes para Claude Code",
  "owner": { "name": "Ignacio Agustín Miste" },
  "plugins": [
    {
      "name": "pignolo",
      "source": "./plugins/pignolo",
      "description": "Autonomía acotada, verificación real y guardia de git para desarrollo con agentes"
    },
    {
      "name": "pignolo-ui",
      "source": "./plugins/pignolo-ui",
      "description": "Interfaces web con decisiones de diseño explícitas y verificadas (opcional, anda sin pignolo)"
    }
  ]
}
```

`plugins/pignolo-ui/.claude-plugin/plugin.json`:
```json
{
  "name": "pignolo-ui",
  "displayName": "Pignolo UI",
  "version": "0.1.0",
  "description": "Crear y mejorar interfaces web con decisiones de diseño explícitas y verificadas: DESIGN.md validado, checker por script y auditor con evidencia",
  "author": { "name": "Ignacio Agustín Miste" },
  "repository": "https://github.com/Pign-a/Pignolo",
  "license": "MIT",
  "keywords": ["ui", "design", "design-md", "accessibility", "web"],
  "userConfig": {
    "optionsPerDecision": {
      "type": "string",
      "title": "Opciones por decisión",
      "description": "Cuántas opciones se generan por decisión visual, cada una con su propio subagente",
      "options": ["1", "3"],
      "default": "3"
    },
    "presentation": {
      "type": "string",
      "title": "Presentación",
      "description": "auto: lienzo Design si está disponible y el proyecto dio consentimiento; local: nunca se publica",
      "options": ["auto", "local"],
      "default": "auto"
    },
    "language": {
      "type": "string",
      "title": "Idioma",
      "description": "Código BCP 47 de los textos para el usuario; vacío = idioma de la conversación",
      "default": ""
    }
  }
}
```

`plugins/pignolo-ui/README.md`:
```markdown
# Pignolo UI

Plugin opcional de Claude Code, hermano de pignolo y en el mismo marketplace, para crear y mejorar interfaces web con **decisiones de diseño explícitas y verificadas**. Anda sin el núcleo. Estado: v0.1 en construcción (hito 1 de 5: esqueleto y formato).

Diseño: `docs/specs/2026-09-28-pignolo-ui-v1-design.md`.

## Requisitos

- Node ≥ 22 para pignolo-ui (A-12), sin dependencias npm.
- Claude Code ≥ 2.1.271 (`userConfig` con `options`).

## Instalar (desarrollo)

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo-ui

## Tests

    npm test          (todo el repo)
    npm run test:ui   (solo pignolo-ui)
```

`plugins/pignolo-ui/CHANGELOG.md`:
```markdown
# Changelog

## 0.1.0 — sin publicar

- Hito 1: esqueleto del plugin, linter del plugin, parser YAML propio, colores, fuentes de tokens, `design-md` (`validate`, `extract`, `patch`), aprobados versionados (`approve`) y la plantilla `DESIGN.md`.
```

`plugins/pignolo-ui/CREDITS.md`:
```markdown
# Credits

Fuentes de las ideas de pignolo-ui. No se copia código de terceros; los fixtures de terceros, si los hay, solo con licencia MIT o Apache-2.0 y listados acá.

- Formato `DESIGN.md` de Google Labs (`google-labs-code/design.md`, Apache-2.0), versión fijada 0.4.0. pignolo-ui lo lee y lo escribe con código propio; el linter oficial solo corre si ya está instalado.
- WCAG 2.2 (W3C): fórmula de luminancia relativa y de contraste.
- CSS Color Module Level 4 y OKLab (Björn Ottosson): conversiones de color.
```

`plugins/pignolo-ui/LICENSE`:
```text
MIT License

Copyright (c) 2026 Ignacio Agustín Miste

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 4`, `pass 4`, `fail 0`).
Run: `npm test`
Expected: PASS, los tests del núcleo más estos 4 (en la copia de trabajo: `tests 565`, `pass 565`).
Run: `claude plugin validate plugins/pignolo-ui` y `claude plugin validate .`
Expected: `✔ Validation passed` en los dos.

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `plugin.json`, cambiar el `default` de `presentation` de `"auto"` a `"local"` | `userConfig declares exactly the three keys of spec 3.1` |
| En `plugin.json`, agregar `"hooks": "./hooks/hooks.json",` después de `"license": "MIT",` | `plugin manifest: name, semver version, license, no hooks` |
| En `marketplace.json`, cambiar `"source": "./plugins/pignolo-ui"` por `"source": "./plugins/ui"` | `marketplace lists pignolo-ui with a relative source` |

- [ ] **Step 6: Commit**

Mensaje (en un archivo, con `git commit -F`):
```text
feat(ui): esqueleto del plugin pignolo-ui y su entrada en el marketplace
```
```bash
git add .claude-plugin package.json plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

### Task 2: Linter del plugin (R9)

**Files:**
- Create: `plugins/pignolo-ui/tests/support/lint-plugin.mjs`
- Test: `plugins/pignolo-ui/tests/lint-plugin.test.mjs`

**Interfaces:**
- Consumes: `tests/helpers.mjs` (`PLUGIN_ROOT`, `makeTempDir`, `writeTree`).
- Produces: `lintPlugin(root) -> [{ rule, file, message }]` con `rule` ∈ `manifest`, `layout`, `no-binaries`, `no-agent-context-files`, `skill-frontmatter`, `skill-size`, `dollar-digit`, `bang-command`, `home-claude-path`, `md-links`, `imports`, `agent-frontmatter`. Las reglas de contenido solo miran lo que se distribuye en tiempo de ejecución (`skills`, `agents`, `scripts`, `lib`, `catalog`, `norms`, `templates`); `tests/` solo pasa por las reglas de archivo (binarios y `CLAUDE.md`/`AGENTS.md`).

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/lint-plugin.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, makeTempDir, writeTree } from './helpers.mjs';
import { lintPlugin } from './support/lint-plugin.mjs';

const SKILL_OK = [
  '---',
  'name: audit',
  'description: "Audits one web screen and reports findings with evidence."',
  'disable-model-invocation: true',
  '---',
  '',
  'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/ui-check.mjs` and read [the criteria](reference/criteria.md).',
  'Escaped argument: \\$1.',
  '',
].join('\n');

const AGENT_OK = [
  '---',
  'name: ui-auditor',
  'description: "Audits one web screen from a prepared run folder."',
  'tools: Read, Grep, Glob',
  'model: opus',
  '---',
  '',
  'Body.',
  '',
].join('\n');

// A minimal plugin that passes every rule; each test adds one defect.
function makePlugin(extra = {}, manifest = {}) {
  const root = path.join(makeTempDir(), 'pignolo-ui');
  writeTree(root, {
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'pignolo-ui', version: '0.1.0', license: 'MIT', ...manifest }),
    'skills/audit/SKILL.md': SKILL_OK,
    'skills/audit/reference/criteria.md': 'Criteria.\n',
    'agents/ui-auditor.md': AGENT_OK,
    'lib/a.mjs': "import fs from 'node:fs';\nimport { b } from './b.mjs';\nexport const a = b + String(fs.sep);\n",
    'lib/b.mjs': 'export const b = 1;\n',
    'README.md': '# x\n',
    'LICENSE': 'MIT\n',
    ...extra,
  });
  return root;
}

function rules(root) {
  return lintPlugin(root).map((f) => f.rule);
}

test('the real plugin has no findings', () => {
  assert.deepEqual(lintPlugin(PLUGIN_ROOT), []);
});

test('a minimal clean plugin has no findings', () => {
  assert.deepEqual(lintPlugin(makePlugin()), []);
});

test('manifest: name must match the folder and be kebab-case, version semver', () => {
  assert.deepEqual(rules(makePlugin({}, { name: 'other' })), ['manifest']);
  assert.deepEqual(rules(makePlugin({}, { version: 'v1' })), ['manifest']);
});

test('layout: no hooks, bin or unknown top-level entries; no hooks or mcpServers keys', () => {
  assert.deepEqual(rules(makePlugin({ 'hooks/hooks.json': '{}' })), ['layout']);
  assert.deepEqual(rules(makePlugin({ 'bin/tool': 'x\n' })), ['layout']);
  assert.deepEqual(rules(makePlugin({ 'notes.txt': 'x\n' })), ['layout']);
  assert.deepEqual(rules(makePlugin({}, { hooks: './h.json' })), ['layout']);
  assert.deepEqual(rules(makePlugin({}, { mcpServers: {} })), ['layout']);
});

test('no-binaries: NUL bytes, invalid UTF-8 and executable extensions', () => {
  const root = makePlugin();
  fs.writeFileSync(path.join(root, 'lib', 'blob.json'), Buffer.from([0x7b, 0x00, 0x7d]));
  assert.deepEqual(rules(root), ['no-binaries']);
  const root2 = makePlugin();
  fs.writeFileSync(path.join(root2, 'lib', 'latin1.json'), Buffer.from([0x22, 0xe9, 0x22]));
  assert.deepEqual(rules(root2), ['no-binaries']);
  assert.deepEqual(rules(makePlugin({ 'scripts/run.ps1': 'Write-Host x\n' })), ['no-binaries']);
});

test('no-agent-context-files: CLAUDE.md or AGENTS.md anywhere, any case', () => {
  assert.deepEqual(rules(makePlugin({ 'templates/claude.md': 'x\n' })), ['no-agent-context-files']);
  assert.deepEqual(rules(makePlugin({ 'tests/fixtures/AGENTS.md': 'x\n' })), ['no-agent-context-files']);
});

test('skill-frontmatter: name, quoted description and disable-model-invocation', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK.replace('name: audit', 'name: Audit') })), ['skill-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK.replace('description: "Audits one web screen and reports findings with evidence."', 'description: Audits one screen') })), ['skill-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK.replace('disable-model-invocation: true\n', '') })), ['skill-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'skills/new/reference.md': 'x\n' })), ['skill-frontmatter']);
});

test('skill-size: a SKILL.md above ~3k tokens', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + 'word '.repeat(2500) })), ['skill-size']);
});

test('dollar-digit and bang-command in skill and agent text', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + 'Use $1 here.\n' })), ['dollar-digit']);
  assert.deepEqual(rules(makePlugin({ 'agents/ui-auditor.md': AGENT_OK + 'Cost: $2.\n' })), ['dollar-digit']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + 'Status: !`git status`\n' })), ['bang-command']);
});

test('home-claude-path: runtime files must not point into the user Claude folder', () => {
  const home = '~/' + '.claude/settings.json';
  assert.deepEqual(rules(makePlugin({ 'skills/audit/reference/criteria.md': `See ${home}\n` })), ['home-claude-path']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': `export const p = '${home}';\n` })), ['home-claude-path']);
});

test('md-links: relative links must exist and stay inside the plugin', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + '[x](reference/missing.md)\n' })), ['md-links']);
  const escaping = makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + '[x](../../../outside.md)\n' });
  fs.writeFileSync(path.join(escaping, '..', 'outside.md'), 'exists, but outside the plugin\n');
  assert.deepEqual(rules(escaping), ['md-links']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + '[x](https://example.com) [y](#top)\n' })), []);
});

test('imports: node builtins or relative with extension and forward slashes', () => {
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import yaml from 'yaml';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import { b } from './b';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import { b } from '.\\\\b.mjs';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "export { b } from 'lodash/b.js';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': 'export const load = (p) => import(p);\n' })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import { pathToFileURL } from 'node:url';\nexport const load = (p) => import(pathToFileURL(p).href);\n" })), []);
});

test('agent-frontmatter: name matches the file and description is quoted', () => {
  assert.deepEqual(rules(makePlugin({ 'agents/ui-auditor.md': AGENT_OK.replace('name: ui-auditor', 'name: auditor') })), ['agent-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'agents/ui-auditor.md': AGENT_OK.replace('description: "Audits one web screen from a prepared run folder."', 'description: Audits') })), ['agent-frontmatter']);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `lint-plugin.test.mjs` no carga: `Cannot find module …/tests/support/lint-plugin.mjs` (`tests 5`, `pass 4`, `fail 1`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/tests/support/lint-plugin.mjs`:
```js
// Plugin linter (spec §2 "Empaquetado", requirement R9). Runs in npm test over the
// real plugin; each rule has a red fixture in tests/lint-plugin.test.mjs.
// Returns [{ rule, file, message }] with plugin-relative posix paths.
import fs from 'node:fs';
import path from 'node:path';

const TOP_LEVEL = new Set(['.claude-plugin', 'skills', 'agents', 'scripts', 'lib', 'catalog', 'norms', 'templates', 'tests',
  'README.md', 'CHANGELOG.md', 'CREDITS.md', 'LICENSE']);
// Folders whose files ship as runtime text (content rules apply). tests/ only gets the file rules.
const RUNTIME_DIRS = new Set(['skills', 'agents', 'scripts', 'lib', 'catalog', 'norms', 'templates']);
const EXECUTABLE_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.node', '.wasm', '.bat', '.cmd', '.ps1', '.sh', '.com', '.msi', '.jar']);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_MAX_CHARS = 12000; // ~3k tokens at ~4 chars per token
const HOME_CLAUDE = /~[\\/]\.claude\b/;

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Top-level "key: value" lines of a --- frontmatter block; raw values, not unquoted.
function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const fm = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

function isQuoted(raw) {
  return /^"([^"\\]|\\.)*"$/.test(raw || '') || /^'([^']|'')*'$/.test(raw || '');
}

function unquote(raw) {
  return raw.slice(1, -1);
}

function isUtf8Text(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function checkSpecifier(spec) {
  if (spec.startsWith('node:')) return null;
  if (!spec.startsWith('./') && !spec.startsWith('../')) return `bare specifier "${spec}" (no npm dependencies)`;
  if (spec.includes('\\')) return `backslash in "${spec}"`;
  if (!/\.(mjs|js|json)$/.test(spec)) return `"${spec}" needs an explicit .mjs/.js/.json extension`;
  return null;
}

export function lintPlugin(root) {
  const findings = [];
  const add = (rule, file, message) => findings.push({ rule, file, message });

  // manifest + layout keys
  const manifestFile = path.join(root, '.claude-plugin', 'plugin.json');
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (e) {
    add('manifest', '.claude-plugin/plugin.json', `unreadable manifest (${e.message})`);
  }
  if (manifest) {
    if (manifest.name !== path.basename(root) || !KEBAB.test(manifest.name || '')) {
      add('manifest', '.claude-plugin/plugin.json', `name "${manifest.name}" must equal the folder name and be kebab-case`);
    }
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) add('manifest', '.claude-plugin/plugin.json', 'version must be semver x.y.z');
    for (const key of ['hooks', 'mcpServers', 'lspServers']) {
      if (manifest[key] !== undefined) add('layout', '.claude-plugin/plugin.json', `"${key}" is not allowed (no hooks, no servers)`);
    }
  }

  for (const ent of fs.readdirSync(root)) {
    if (!TOP_LEVEL.has(ent)) add('layout', ent, 'not part of the standard plugin layout');
  }

  const files = walk(root);
  for (const rel of files) {
    const base = path.posix.basename(rel);
    const top = rel.split('/')[0];
    const buf = fs.readFileSync(path.join(root, rel));
    if (/^(claude|agents)\.md$/i.test(base)) add('no-agent-context-files', rel, 'CLAUDE.md and AGENTS.md are never shipped');
    if (EXECUTABLE_EXT.has(path.posix.extname(base).toLowerCase()) || !isUtf8Text(buf)) {
      add('no-binaries', rel, 'binary or executable file');
      continue;
    }
    if (!RUNTIME_DIRS.has(top)) continue;
    const text = buf.toString('utf8');

    if (HOME_CLAUDE.test(text)) add('home-claude-path', rel, 'points into the user Claude folder; use ${CLAUDE_PLUGIN_ROOT} or arguments');

    if (/\.(mjs|js)$/.test(base)) {
      const re = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1|\bimport\s*(['"])([^'"]+)\3/g;
      for (const m of text.matchAll(re)) {
        const problem = checkSpecifier(m[2] || m[4]);
        if (problem) add('imports', rel, problem);
      }
      for (const m of text.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
        const arg = m[1].trim();
        const lit = /^(['"])([^'"]+)\1$/.exec(arg);
        if (lit) {
          const problem = checkSpecifier(lit[2]);
          if (problem) add('imports', rel, problem);
        } else if (!text.includes('pathToFileURL')) {
          add('imports', rel, 'dynamic import of a path without pathToFileURL (breaks on Windows)');
        }
      }
    }

    if (base.endsWith('.md')) {
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const clean = target.split('#')[0];
        if (/^([\\/~]|[A-Za-z]:)/.test(clean)) {
          add('md-links', rel, `absolute link "${target}"`);
          continue;
        }
        const resolved = path.resolve(root, path.dirname(rel), clean);
        const inside = path.relative(root, resolved);
        if (inside.startsWith('..') || path.isAbsolute(inside)) add('md-links', rel, `link "${target}" leaves the plugin`);
        else if (!fs.existsSync(resolved)) add('md-links', rel, `link "${target}" does not exist`);
      }
    }

    const isSkill = /^skills\/[^/]+\/SKILL\.md$/.test(rel);
    const isAgent = /^agents\/[^/]+\.md$/.test(rel);
    if (isSkill || isAgent) {
      if (/(^|[^\\])\$\d/m.test(text)) add('dollar-digit', rel, 'unescaped $<digit> is replaced by an argument; write \\$');
      if (/!`/.test(text)) add('bang-command', rel, '!`command` runs at load time and aborts the skill if it fails');
      const fm = frontmatter(text);
      const expectedName = isSkill ? rel.split('/')[1] : path.posix.basename(rel, '.md');
      const rule = isSkill ? 'skill-frontmatter' : 'agent-frontmatter';
      if (!fm) {
        add(rule, rel, 'missing --- frontmatter');
      } else {
        if (fm.name !== expectedName || !KEBAB.test(fm.name || '')) add(rule, rel, `name must be "${expectedName}" (kebab-case)`);
        if (!isQuoted(fm.description)) add(rule, rel, 'description must be a quoted YAML string');
        else if (unquote(fm.description).length > 1536) add(rule, rel, 'description longer than 1536 characters is truncated');
        if (isSkill && fm['disable-model-invocation'] !== 'true') add(rule, rel, 'commands need disable-model-invocation: true');
      }
      if (isSkill && text.length > SKILL_MAX_CHARS) add('skill-size', rel, `SKILL.md has ${text.length} characters (limit ~3k tokens)`);
    }
  }

  // every skills/<name>/ folder needs its SKILL.md
  const skillsDir = path.join(root, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const ent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (ent.isDirectory() && !fs.existsSync(path.join(skillsDir, ent.name, 'SKILL.md'))) {
        add('skill-frontmatter', `skills/${ent.name}`, 'skill folder without SKILL.md');
      } else if (!ent.isDirectory()) {
        add('skill-frontmatter', `skills/${ent.name}`, 'skills/ holds one folder per skill');
      }
    }
  }
  return findings;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 17`, `pass 17`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 17).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `TOP_LEVEL`, agregar `'hooks'` después de `'tests'` | `layout: no hooks, bin or unknown top-level entries; no hooks or mcpServers keys` |
| En `isUtf8Text`, borrar la línea `new TextDecoder('utf-8', { fatal: true }).decode(buf);` | `no-binaries: NUL bytes, invalid UTF-8 and executable extensions` |
| Borrar la línea que agrega `dollar-digit` | `dollar-digit and bang-command in skill and agent text` |
| En `checkSpecifier`, borrar la línea del chequeo de extensión (`.mjs/.js/.json`) | `imports: node builtins or relative with extension and forward slashes` |
| En `md-links`, borrar la rama `if (inside.startsWith('..') \|\| path.isAbsolute(inside)) add(…)` y dejar solo el chequeo de existencia | `md-links: relative links must exist and stay inside the plugin` |
| Cambiar `/^(claude\|agents)\.md$/i` por `/^(CLAUDE\|AGENTS)\.md$/` (sin `i`) | `no-agent-context-files: CLAUDE.md or AGENTS.md anywhere, any case` |

- [ ] **Step 6: Commit**

```text
feat(ui): linter del plugin con las reglas de empaquetado R9
```
```bash
git add plugins/pignolo-ui/tests
git commit -F <archivo-del-mensaje>
```


---

### Task 3: Parser YAML propio (`lib/yaml-subset.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/yaml-subset.mjs`
- Test: `plugins/pignolo-ui/tests/yaml-subset.test.mjs`

**Interfaces:**
- Produces:
  - `parseYaml(text) -> { supported, reason, line, value, errors: [{ line, path, message }], index }`. `supported: false` deja `value: null`, `errors: []` y `reason`/`line` del primer constructo no soportado. `path` es una lista de claves e índices.
  - `locate(result, pathArray) -> { line, endLine, indent, style: 'block' | 'flow' | 'scalar' } | null`: línea (1-based, relativa al texto), última línea del nodo, columna de la clave o del guion.
  - `stripComment(content) -> string`: corta `#` al inicio o después de un espacio, fuera de comillas.
  - `MAX_DEPTH = 4`.
- Los escalares siguen el esquema core de YAML 1.2 (como la librería `yaml` que usa el linter oficial): `true/false`, `null`/`~`/vacío, enteros y decimales; una fecha queda como string.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/yaml-subset.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, locate } from '../lib/yaml-subset.mjs';

function ok(text) {
  const r = parseYaml(text);
  assert.equal(r.supported, true, `unsupported: ${r.reason}`);
  assert.deepEqual(r.errors, []);
  return r.value;
}

test('block maps and lists with typed scalars and quoted keys', () => {
  const v = ok([
    'version: alpha',
    'name: "Demo: app"',
    "note: 'it''s ok'",
    'count: 600',
    'ratio: 1.5',
    'neg: -0.02em',
    'on: true',
    'off: false',
    'nothing: null',
    'tilde: ~',
    'empty:',
    'spacing:',
    '  "0": 0px',
    '  "1": 4px',
    'list:',
    '  - a',
    '  - 2',
    '  - "c d"',
    '',
  ].join('\n'));
  assert.deepEqual(v, {
    version: 'alpha', name: 'Demo: app', note: "it's ok", count: 600, ratio: 1.5, neg: '-0.02em',
    on: true, off: false, nothing: null, tilde: null, empty: null,
    spacing: { 0: '0px', 1: '4px' }, list: ['a', 2, 'c d'],
  });
});

test('single-line flow maps and lists, nested inside the same line', () => {
  const v = ok('a: { x: 1, y: "two", z: [1, 2, { k: v }] }\nb: []\nc: {}\nd: [a, b, ]\n');
  assert.deepEqual(v, { a: { x: 1, y: 'two', z: [1, 2, { k: 'v' }] }, b: [], c: {}, d: ['a', 'b'] });
});

test('comments: full line, trailing, inside quotes and without a space before #', () => {
  const v = ok('# head\na: 1 # trailing\nb: "x # not a comment"\nc: a#b\n  # indented comment\nd: 2\n');
  assert.deepEqual(v, { a: 1, b: 'x # not a comment', c: 'a#b', d: 2 });
});

test('an unquoted hex after ": " is a comment, so the value is null (Review Focus 3)', () => {
  const v = ok('colors:\n  primary: #0B6BCB\n  ok: "#0B6BCB"\n');
  assert.deepEqual(v, { colors: { primary: null, ok: '#0B6BCB' } });
});

test('lists of maps, and a compact list at the same indent as its key', () => {
  const v = ok([
    'rejections:',
    '  - id: R-001',
    '    date: 2026-09-28',
    '    pattern:',
    '      kind: selector',
    '      value: ".hero"',
    '  - id: R-002',
    '    note: plain text, with a comma',
    'extracted:',
    '- colors.primary',
    '- rounded.md',
    '',
  ].join('\n'));
  assert.deepEqual(v, {
    rejections: [
      { id: 'R-001', date: '2026-09-28', pattern: { kind: 'selector', value: '.hero' } },
      { id: 'R-002', note: 'plain text, with a comma' },
    ],
    extracted: ['colors.primary', 'rounded.md'],
  });
});

test('CRLF input parses like LF and keeps line numbers', () => {
  const lf = 'a:\n  b: 1\nc: 2\n';
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.deepEqual(parseYaml(crlf).value, parseYaml(lf).value);
  assert.equal(locate(parseYaml(crlf), ['c']).line, 3);
});

test('unsupported constructs make the whole file unsupported', () => {
  const cases = {
    'a: &x 1\nb: 2\n': /anchor/,
    'a: 1\nb: *x\n': /alias/,
    'a: |\n  text\n': /block scalar/,
    'a: >-\n  text\n': /block scalar/,
    'a: 1\n---\nb: 2\n': /document/,
    'a: { x: 1,\n  y: 2 }\n': /flow/,
    'a: [1,\n  2]\n': /flow/,
    'a: !!str 1\n': /tag/,
    'a:\n\tb: 1\n': /tab/,
    'l1:\n  l2:\n    l3:\n      l4:\n        l5:\n          l6: 1\n': /levels/,
    '? complex\n: key\n': /complex/,
  };
  for (const [text, reason] of Object.entries(cases)) {
    const r = parseYaml(text);
    assert.equal(r.supported, false, JSON.stringify(text));
    assert.equal(r.value, null);
    assert.match(r.reason, reason, JSON.stringify(text));
    assert.equal(typeof r.line, 'number');
  }
});

test('four levels of nesting are supported', () => {
  assert.deepEqual(ok('l1:\n  l2:\n    l3:\n      l4:\n        l5: 1\n'), { l1: { l2: { l3: { l4: { l5: 1 } } } } });
  assert.deepEqual(ok('p:\n  r:\n    - pattern: { kind: text }\n'), { p: { r: [{ pattern: { kind: 'text' } }] } });
});

test('an error in one key is reported for that key and the rest is still parsed', () => {
  const r = parseYaml('a: 1\nb: x: y\nc: 3\nd: "open\ne: 5\nc: 4\nf:\n    g: 1\n  h: 2\ni: 6\n');
  assert.equal(r.supported, true);
  assert.deepEqual(r.value, { a: 1, c: 3, e: 5, f: { g: 1 }, i: 6 });
  assert.deepEqual(r.errors.map((e) => [e.line, e.path.join('.')]), [[2, 'b'], [4, 'd'], [6, 'c'], [9, 'f']]);
  for (const e of r.errors) assert.equal(typeof e.message, 'string');
});

test('locate returns the line span and style of each node', () => {
  const r = parseYaml('pignolo:\n  schema: 1\n  states: { hoverOpacity: 0.08 }\n  extracted:\n    - colors.primary\nlast: 1\n');
  assert.deepEqual(locate(r, ['pignolo']), { line: 1, endLine: 5, indent: 0, style: 'block' });
  assert.deepEqual(locate(r, ['pignolo', 'schema']), { line: 2, endLine: 2, indent: 2, style: 'scalar' });
  assert.deepEqual(locate(r, ['pignolo', 'states']), { line: 3, endLine: 3, indent: 2, style: 'flow' });
  assert.deepEqual(locate(r, ['pignolo', 'states', 'hoverOpacity']), { line: 3, endLine: 3, indent: 2, style: 'flow' });
  assert.deepEqual(locate(r, ['pignolo', 'extracted', 0]), { line: 5, endLine: 5, indent: 4, style: 'scalar' });
  assert.equal(locate(r, ['pignolo', 'missing']), null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `yaml-subset.test.mjs` no carga (`Cannot find module …/lib/yaml-subset.mjs`) (`tests 18`, `pass 17`, `fail 1`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/lib/yaml-subset.mjs`:
```js
// Own YAML subset parser (spec §4.4). Supports block maps and lists, single-line flow
// maps and lists, quoted keys, comments, typed scalars and up to 4 nested levels below
// the root. Anchors, aliases, tags, block scalars (| >), several documents, complex keys,
// tab indentation and flow collections spanning several lines make the whole text
// unsupported ("YAML no soportado: no validado"), because reading them wrong in silence
// would give false greens. An error in one key is reported for that key and parsing goes on.
//
// parseYaml(text) -> { supported, reason, line, value, errors: [{ line, path, message }], index }
// locate(result, pathArray) -> { line, endLine, indent, style: 'block'|'flow'|'scalar' } | null

export const MAX_DEPTH = 4;

class Unsupported extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

class KeyError extends Error {}

const keyOf = (path) => JSON.stringify(path);

export function locate(result, path) {
  return (result && result.index && result.index.get(keyOf(path))) || null;
}

// Cuts a trailing comment: '#' at the start or after whitespace, outside quotes.
// A quote only opens a quoted scalar at a token start, so "it's" stays plain.
export function stripComment(content) {
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const prev = i === 0 ? ' ' : content[i - 1];
    if (quote === '"') {
      if (c === '\\') i++;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'" && content[i + 1] === "'") i++;
      else if (c === "'") quote = null;
    } else if ((c === '"' || c === "'") && /[\s[{,:]/.test(prev)) {
      quote = c;
    } else if (c === '#' && /\s/.test(prev)) {
      return content.slice(0, i).trimEnd();
    }
  }
  return content.trimEnd();
}

function resolvePlain(s) {
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?[0-9]+$/.test(s)) return Number.parseInt(s, 10);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  return s;
}

const ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\0', ' ': ' ' };

// Reads a quoted scalar starting at s[i]; returns { value, end } (end = index after the quote).
function readQuoted(s, i) {
  const q = s[i];
  let out = '';
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (q === "'") {
      if (c === "'" && s[j + 1] === "'") { out += "'"; j++; continue; }
      if (c === "'") return { value: out, end: j + 1 };
      out += c;
      continue;
    }
    if (c === '"') return { value: out, end: j + 1 };
    if (c === '\\') {
      const e = s[j + 1];
      if (e === 'u' || e === 'x') {
        const len = e === 'u' ? 4 : 2;
        const hex = s.slice(j + 2, j + 2 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new KeyError(`invalid escape \\${e}${hex}`);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        j += 1 + len;
        continue;
      }
      if (!(e in ESCAPES)) throw new KeyError(`invalid escape \\${e ?? ''}`);
      out += ESCAPES[e];
      j++;
      continue;
    }
    out += c;
  }
  throw new KeyError('unterminated quoted string');
}

function checkDepth(depth, line) {
  if (depth > MAX_DEPTH) throw new Unsupported(`more than ${MAX_DEPTH} levels of nesting`, line);
}

export function parseYaml(text) {
  const raw = String(text).replace(/^\uFEFF/, '').split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const errors = [];
  const index = new Map();
  try {
    const lines = [];
    raw.forEach((s, i) => {
      const no = i + 1;
      if (/^(---|\.\.\.)(\s|$)/.test(s)) throw new Unsupported('several documents in one text', no);
      if (s.startsWith('%')) throw new Unsupported('YAML directive', no);
      const lead = /^[ \t]*/.exec(s)[0];
      const content = stripComment(s.slice(lead.length));
      if (content === '') return;
      if (lead.includes('\t')) throw new Unsupported('tab indentation', no);
      lines.push({ no, indent: lead.length, content });
    });
    const p = new Parser(lines, errors, index);
    const value = lines.length ? p.node(lines[0].indent, [], 0) : {};
    while (p.pos < lines.length) {
      errors.push({ line: lines[p.pos].no, path: [], message: 'unexpected indentation' });
      p.pos++;
    }
    return { supported: true, reason: null, line: null, value, errors, index };
  } catch (e) {
    if (e instanceof Unsupported) {
      return { supported: false, reason: e.reason, line: e.line, value: null, errors: [], index: new Map() };
    }
    throw e;
  }
}

const isItem = (content) => content === '-' || content.startsWith('- ');

class Parser {
  constructor(lines, errors, index) {
    this.lines = lines;
    this.errors = errors;
    this.index = index;
    this.pos = 0;
  }

  error(line, path, message) {
    this.errors.push({ line, path, message });
  }

  // Skips every following line indented more than `indent`.
  skipDeeper(indent) {
    while (this.pos < this.lines.length && this.lines[this.pos].indent > indent) this.pos++;
  }

  lastNo() {
    return this.lines[this.pos - 1].no;
  }

  node(indent, path, depth) {
    return isItem(this.lines[this.pos].content) ? this.list(indent, path, depth) : this.map(indent, path, depth);
  }

  map(indent, path, depth) {
    checkDepth(depth, this.lines[this.pos].no);
    const obj = {};
    let lastKey = null;
    while (this.pos < this.lines.length) {
      const ln = this.lines[this.pos];
      if (ln.indent < indent) break;
      const where = lastKey === null ? path : [...path, lastKey];
      if (ln.indent > indent) {
        this.error(ln.no, where, 'unexpected indentation');
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      if (isItem(ln.content)) {
        this.error(ln.no, where, 'list item where a "key: value" was expected');
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      let key;
      let rest;
      try {
        ({ key, rest } = splitKey(ln.content, ln.no));
      } catch (e) {
        if (!(e instanceof KeyError)) throw e;
        this.error(ln.no, [...path, guessKey(ln.content)], e.message);
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      const childPath = [...path, key];
      this.pos++;
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        this.error(ln.no, childPath, `duplicate key "${key}"`);
        this.skipDeeper(indent);
        continue;
      }
      lastKey = key;
      if (rest === '') {
        const next = this.lines[this.pos];
        if (next && next.indent > indent) {
          obj[key] = this.node(next.indent, childPath, depth + 1);
          this.index.set(keyOf(childPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        } else if (next && next.indent === indent && isItem(next.content)) {
          obj[key] = this.list(indent, childPath, depth + 1);
          this.index.set(keyOf(childPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        } else {
          obj[key] = null;
          this.index.set(keyOf(childPath), { line: ln.no, endLine: ln.no, indent, style: 'scalar' });
        }
        continue;
      }
      try {
        obj[key] = this.inline(rest, ln, indent, childPath, depth + 1);
      } catch (e) {
        if (!(e instanceof KeyError)) throw e;
        delete obj[key];
        this.error(ln.no, childPath, e.message);
        this.skipDeeper(indent);
      }
    }
    return obj;
  }

  list(indent, path, depth) {
    checkDepth(depth, this.lines[this.pos].no);
    const arr = [];
    while (this.pos < this.lines.length) {
      const ln = this.lines[this.pos];
      if (ln.indent < indent) break;
      if (ln.indent > indent) {
        this.error(ln.no, arr.length ? [...path, arr.length - 1] : path, 'unexpected indentation');
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      if (!isItem(ln.content)) break;
      const itemPath = [...path, arr.length];
      const rest = ln.content === '-' ? '' : ln.content.slice(2).trimStart();
      const offset = ln.content.length - rest.length;
      if (rest === '') {
        this.pos++;
        const next = this.lines[this.pos];
        if (next && next.indent > indent) {
          arr.push(this.node(next.indent, itemPath, depth + 1));
          this.index.set(keyOf(itemPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        } else {
          arr.push(null);
          this.index.set(keyOf(itemPath), { line: ln.no, endLine: ln.no, indent, style: 'scalar' });
        }
        continue;
      }
      if (isItem(rest) || looksLikeEntry(rest)) {
        // "- key: v" or "- - x": the rest of the line is the first line of a nested block.
        this.lines[this.pos] = { no: ln.no, indent: indent + offset, content: rest };
        arr.push(this.node(indent + offset, itemPath, depth + 1));
        this.index.set(keyOf(itemPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        continue;
      }
      this.pos++;
      try {
        arr.push(this.inline(rest, ln, indent, itemPath, depth + 1));
      } catch (e) {
        if (!(e instanceof KeyError)) throw e;
        this.error(ln.no, itemPath, e.message);
        this.skipDeeper(indent);
      }
    }
    return arr;
  }

  // Value written on the same line as its key or dash.
  inline(rest, ln, indent, path, depth) {
    const c = rest[0];
    if (c === '&') throw new Unsupported('anchor', ln.no);
    if (c === '*') throw new Unsupported('alias', ln.no);
    if (c === '!') throw new Unsupported('tag', ln.no);
    if ((c === '|' || c === '>') && /^[|>][-+0-9]*$/.test(rest)) throw new Unsupported('block scalar (| or >)', ln.no);
    if (c === '{' || c === '[') {
      const flow = new FlowReader(rest, ln.no, this.index, path, indent);
      const value = flow.value(depth);
      flow.ws();
      if (flow.i !== rest.length) throw new KeyError('unexpected text after a flow collection');
      return value;
    }
    this.index.set(keyOf(path), { line: ln.no, endLine: ln.no, indent, style: 'scalar' });
    if (c === '"' || c === "'") {
      const q = readQuoted(rest, 0);
      if (rest.slice(q.end).trim() !== '') throw new KeyError('unexpected text after a quoted string');
      return q.value;
    }
    if (isItem(rest)) throw new KeyError('a list item is not allowed here');
    if (/^[\]},@`]/.test(rest)) throw new KeyError(`a plain value cannot start with "${c}"`);
    if (/:(\s|$)/.test(rest)) throw new KeyError('a plain value cannot contain ": " (quote it)');
    return resolvePlain(rest);
  }
}

class FlowReader {
  constructor(s, line, index, path, indent) {
    Object.assign(this, { s, line, index, i: 0, basePath: path, indent });
  }

  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  eos() {
    throw new Unsupported('flow collection spanning several lines', this.line);
  }

  mark(path) {
    this.index.set(keyOf(path), { line: this.line, endLine: this.line, indent: this.indent, style: 'flow' });
  }

  value(depth, path = this.basePath) {
    this.ws();
    if (this.i >= this.s.length) this.eos();
    const c = this.s[this.i];
    this.mark(path);
    if (c === '{') return this.map(depth, path);
    if (c === '[') return this.seq(depth, path);
    if (c === '"' || c === "'") {
      const q = readQuoted(this.s, this.i);
      this.i = q.end;
      return q.value;
    }
    if (c === '&') throw new Unsupported('anchor', this.line);
    if (c === '*') throw new Unsupported('alias', this.line);
    if (c === '!') throw new Unsupported('tag', this.line);
    const start = this.i;
    while (this.i < this.s.length && !/[,\]}]/.test(this.s[this.i])) this.i++;
    const plain = this.s.slice(start, this.i).trim();
    if (/:(\s|$)/.test(plain)) throw new KeyError('a plain value cannot contain ": " (quote it)');
    return resolvePlain(plain);
  }

  map(depth, path) {
    checkDepth(depth, this.line);
    this.i++;
    const obj = {};
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === '}') { this.i++; return obj; }
      let key;
      if (this.s[this.i] === '"' || this.s[this.i] === "'") {
        const q = readQuoted(this.s, this.i);
        key = q.value;
        this.i = q.end;
      } else {
        const start = this.i;
        while (this.i < this.s.length && !/[,}]/.test(this.s[this.i]) && !(this.s[this.i] === ':' && /[\s,}]|^$/.test(this.s[this.i + 1] ?? ''))) this.i++;
        key = this.s.slice(start, this.i).trim();
      }
      if (key === '__proto__') throw new KeyError('key "__proto__" is not allowed');
      if (Object.prototype.hasOwnProperty.call(obj, key)) throw new KeyError(`duplicate key "${key}"`);
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ':') {
        this.i++;
        this.ws();
        if (this.i >= this.s.length) this.eos();
        obj[key] = /[,}]/.test(this.s[this.i]) ? null : this.value(depth + 1, [...path, key]);
        if (obj[key] === null) this.mark([...path, key]);
      } else {
        obj[key] = null;
        this.mark([...path, key]);
      }
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === '}') { this.i++; return obj; }
      throw new KeyError(`unexpected "${this.s[this.i]}" in a flow map`);
    }
  }

  seq(depth, path) {
    checkDepth(depth, this.line);
    this.i++;
    const arr = [];
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ']') { this.i++; return arr; }
      arr.push(this.value(depth + 1, [...path, arr.length]));
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === ']') { this.i++; return arr; }
      throw new KeyError(`unexpected "${this.s[this.i]}" in a flow list`);
    }
  }
}

// "key: rest" -> { key, rest }; throws KeyError when the line is not an entry.
function splitKey(content, line) {
  if (content.startsWith('? ') || content === '?') throw new Unsupported('complex key (?)', line);
  const c = content[0];
  if (c === '&') throw new Unsupported('anchor', line);
  if (c === '*') throw new Unsupported('alias', line);
  if (c === '!') throw new Unsupported('tag', line);
  let key;
  let after;
  if (c === '"' || c === "'") {
    const q = readQuoted(content, 0);
    key = q.value;
    after = content.slice(q.end).trimStart();
    if (!after.startsWith(':') || !(after.length === 1 || /\s/.test(after[1]))) throw new KeyError('expected ":" after a quoted key');
    after = after.slice(1);
  } else {
    const m = /:(\s|$)/.exec(content);
    if (!m) throw new KeyError('expected "key: value"');
    key = content.slice(0, m.index).trimEnd();
    if (/^[[\]{},|>%@`]/.test(key)) throw new KeyError(`a key cannot start with "${key[0]}"`);
    after = content.slice(m.index + 1);
  }
  if (key === '__proto__') throw new KeyError('key "__proto__" is not allowed');
  return { key, rest: after.trim() };
}

function looksLikeEntry(rest) {
  try {
    splitKey(rest, 0);
    return true;
  } catch (e) {
    if (e instanceof Unsupported) throw e;
    return false;
  }
}

function guessKey(content) {
  const m = /^\s*("([^"]*)"|'([^']*)'|[^:]+?)\s*:/.exec(content);
  if (!m) return content.trim();
  return m[2] ?? m[3] ?? m[1];
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 27`, `pass 27`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 27).

Comprobación opcional de desarrollo (no es parte de `npm test`): con la librería `yaml` que trae `@google/design.md` instalada a mano, los valores de los textos de este test, de la plantilla (Task 9) y del fixture `valid.md` (Task 7) son idénticos a los de `parseYaml` (hecho en la copia: 9 casos, 0 diferencias).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `stripComment`, cambiar `} else if (c === '#' && /\s/.test(prev)) {` por `} else if (c === '#') {` | `comments: full line, trailing, inside quotes and without a space before #` |
| En `inline`, borrar la línea `if (c === '&') throw new Unsupported('anchor', ln.no);` | `unsupported constructs make the whole file unsupported` |
| En `checkDepth`, cambiar `depth > MAX_DEPTH` por `depth >= MAX_DEPTH` | `four levels of nesting are supported` |
| En `map`, borrar el bloque `if (Object.prototype.hasOwnProperty.call(obj, key)) { … duplicate key … }` | `an error in one key is reported for that key and the rest is still parsed` |
| En `inline`, borrar la línea `if (/:(\s\|$)/.test(rest)) throw new KeyError(…)` | `an error in one key is reported for that key and the rest is still parsed` |
| En `parseYaml`, borrar la línea `if (lead.includes('\t')) throw new Unsupported('tab indentation', no);` | `unsupported constructs make the whole file unsupported` |

- [ ] **Step 6: Commit**

```text
feat(ui): parser YAML propio con subconjunto declarado y errores por clave
```
```bash
git add plugins/pignolo-ui/lib/yaml-subset.mjs plugins/pignolo-ui/tests/yaml-subset.test.mjs
git commit -F <archivo-del-mensaje>
```


---

### Task 4: Colores (`lib/color.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/color.mjs`
- Test: `plugins/pignolo-ui/tests/color.test.mjs`

**Interfaces:**
- Produces:
  - `parseColor(input, { vars } = {}) -> { ok: true, rgba: { r, g, b, a }, format, clipped, viaVar? } | { ok: false, reason }` (canales sRGB 0–1; `vars` = mapa `--nombre → valor`; `var()` se sustituye como texto, como en CSS, así `hsl(var(--primary))` de shadcn funciona).
  - `relativeLuminance(rgba)`, `composite(fg, bg)`, `contrastRatio(fg, bg)` (WCAG 2.2; el frente se compone sobre el fondo; un fondo translúcido, primero sobre blanco).
  - `toOklch(rgba) -> { l, c, h }`, `formatColor(rgba, 'hex' | 'rgb' | 'hsl' | 'hsl-bare' | 'oklch') -> string`, `detectFormat(str) -> string | null`.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/color.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, contrastRatio, composite, toOklch, formatColor, detectFormat } from '../lib/color.mjs';

const RED = [1, 0, 0];

function rgbOf(input, opts) {
  const r = parseColor(input, opts);
  assert.equal(r.ok, true, `${input}: ${r.reason}`);
  return r.rgba;
}

function near(input, [r, g, b], a = 1, tol = 0.006, opts) {
  const c = rgbOf(input, opts);
  for (const [k, want] of [['r', r], ['g', g], ['b', b], ['a', a]]) {
    assert.ok(Math.abs(c[k] - want) <= tol, `${input}: ${k}=${c[k]} want ${want}`);
  }
}

test('hex with 3, 4, 6 and 8 digits', () => {
  near('#fff', [1, 1, 1]);
  near('#FFFF', [1, 1, 1], 1);
  near('#0b6bcb', [11 / 255, 107 / 255, 203 / 255]);
  near('#ffffff80', [1, 1, 1], 128 / 255);
  assert.equal(parseColor('#ggg').ok, false);
  assert.equal(parseColor('#12345').ok, false);
});

test('rgb and hsl in comma and space syntax, with alpha', () => {
  near('rgb(255, 0, 0)', RED);
  near('rgb(255 0 0)', RED);
  near('rgba(255,0,0,0.5)', RED, 0.5);
  near('rgb(100% 0% 0% / 50%)', RED, 0.5);
  near('hsl(0 100% 50%)', RED);
  near('hsl(120deg, 100%, 25%)', [0, 0.502, 0]);
  near('hsla(0.5turn 100% 50% / 0.25)', [0, 1, 1], 0.25);
  near('hwb(0 0% 0%)', RED);
  near('hwb(0 50% 50%)', [0.5, 0.5, 0.5]);
});

test('oklch, oklab, lab and lch (CSS Color 4, D50 for lab/lch)', () => {
  near('oklch(0.628 0.2577 29.23)', RED);
  near('oklch(62.8% 0.2577 29.23)', RED);
  near('oklab(0.628 0.2249 0.1258)', RED);
  near('lab(54.29 80.8 69.89)', RED);
  near('lch(54.29 106.84 40.85)', RED);
  // mid-gamut references (red clips at the gamut edge and would hide a wrong white point)
  near('lab(50 20 -30)', [133 / 255, 108 / 255, 170 / 255], 1, 0.004);
  near('lch(60 40 200)', [0, 163 / 255, 167 / 255], 1, 0.004);
  near('oklch(1 0 0 / 0.12)', [1, 1, 1], 0.12);
  near('oklch(0.5 none none)', [0.389, 0.389, 0.389], 1, 0.01);
});

test('out-of-gamut colors are clipped into sRGB and flagged', () => {
  const r = parseColor('oklch(0.9 0.4 150)');
  assert.equal(r.ok, true);
  assert.equal(r.clipped, true);
  for (const k of ['r', 'g', 'b']) assert.ok(r.rgba[k] >= 0 && r.rgba[k] <= 1);
  assert.equal(parseColor('#0b6bcb').clipped, false);
});

test('bare shadcn HSL and hsl(var(--x))', () => {
  near('0 0% 100%', [1, 1, 1]);
  near('222.2 84% 4.9%', [2 / 255, 8 / 255, 23 / 255], 1, 0.004);
  near('hsl(var(--primary))', [2 / 255, 8 / 255, 23 / 255], 1, 0.004, { vars: { '--primary': '222.2 84% 4.9%' } });
});

test('var() chains with fallback; missing or cyclic vars are unverified', () => {
  const vars = { '--a': 'var(--b)', '--b': '#000', '--loop1': 'var(--loop2)', '--loop2': 'var(--loop1)' };
  near('var(--a)', [0, 0, 0], 1, 0.001, { vars });
  near('var(--nope, #fff)', [1, 1, 1], 1, 0.001, { vars });
  near('var(--nope, var(--b))', [0, 0, 0], 1, 0.001, { vars });
  assert.match(parseColor('var(--nope)', { vars }).reason, /undefined/);
  assert.match(parseColor('var(--loop1)', { vars }).reason, /cycle/);
  assert.equal(parseColor('var(--a)').ok, false);
});

test('color-mix in srgb and oklch; other spaces are unverified', () => {
  near('color-mix(in srgb, #ff0000 50%, #0000ff)', [0.5, 0, 0.5]);
  near('color-mix(in srgb, #000 25%, #fff)', [0.75, 0.75, 0.75]);
  near('color-mix(in srgb, #ff0000 20%, #0000ff 20%)', [0.5, 0, 0.5], 0.4);
  near('color-mix(in oklch, #ff0000, #ff0000)', RED);
  const mid = rgbOf('color-mix(in oklch, #000, #fff)');
  const l = toOklch(mid).l;
  assert.ok(Math.abs(l - 0.5) < 0.01, `L=${l}`);
  assert.match(parseColor('color-mix(in hsl, red, blue)').reason, /not supported/);
});

test('named colors, currentColor, color() and relative syntax are unverified', () => {
  for (const s of ['red', 'transparent', 'currentColor', 'color(display-p3 1 0 0)', 'rgb(from #fff r g b)', 'rgb(1 2)', '', 'linear-gradient(#fff, #000)']) {
    const r = parseColor(s);
    assert.equal(r.ok, false, s);
    assert.equal(typeof r.reason, 'string');
  }
});

test('WCAG contrast ratio, with alpha composited over the background', () => {
  const white = rgbOf('#fff');
  assert.equal(Math.round(contrastRatio(rgbOf('#000'), white) * 100) / 100, 21);
  assert.equal(Math.round(contrastRatio(rgbOf('#777'), white) * 100) / 100, 4.48);
  assert.equal(Math.round(contrastRatio(rgbOf('#0b6bcb'), white) * 100) / 100, 5.28);
  const half = rgbOf('rgb(0 0 0 / 0.5)');
  assert.equal(contrastRatio(half, white), contrastRatio(composite(half, white), white));
  assert.ok(contrastRatio(half, white) < 4.5);
});

test('formatColor writes hex, rgb, hsl, bare hsl and oklch that parse back', () => {
  const c = rgbOf('#0b6bcb');
  assert.equal(formatColor(c, 'hex'), '#0b6bcb');
  assert.equal(formatColor(rgbOf('#ffffff80'), 'hex'), '#ffffff80');
  assert.equal(formatColor(rgbOf('#ffffff'), 'hsl-bare'), '0 0% 100%');
  assert.equal(formatColor(rgbOf('#ff0000'), 'rgb'), 'rgb(255 0 0)');
  assert.match(formatColor(c, 'oklch'), /^oklch\(0\.\d+ 0\.\d+ \d+(\.\d+)?\)$/);
  for (const f of ['hex', 'rgb', 'hsl', 'hsl-bare', 'oklch']) {
    const back = rgbOf(formatColor(c, f));
    for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(back[k] - c[k]) < 0.004, `${f} ${k}`);
  }
});

test('detectFormat names the notation used', () => {
  assert.equal(detectFormat('#fff'), 'hex');
  assert.equal(detectFormat('0 0% 100%'), 'hsl-bare');
  assert.equal(detectFormat('hsl(0 0% 100%)'), 'hsl');
  assert.equal(detectFormat('rgba(0,0,0,.1)'), 'rgb');
  assert.equal(detectFormat('oklch(0.5 0.1 200)'), 'oklch');
  assert.equal(detectFormat('var(--x)'), 'var');
  assert.equal(detectFormat('red'), null);
});
```

Los valores de referencia de `lab(50 20 -30)` y `lch(60 40 200)` salieron de la implementación independiente del linter oficial (Apache-2.0), ejecutada aparte; no se copió código.

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `color.test.mjs` no carga (`Cannot find module …/lib/color.mjs`) (`tests 28`, `pass 27`, `fail 1`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/lib/color.mjs`:
```js
// Colors that pignolo-ui understands (spec §4.5): hex 3/4/6/8; rgb, hsl, hwb, oklch, oklab,
// lab and lch, with alpha; bare shadcn HSL ("222.2 84% 4.9%"); var() chains with fallback;
// color-mix() in srgb and oklch. Anything else is { ok: false, reason } = "no verificado".
// Out-of-gamut results are clipped to sRGB and flagged (clipped: true).
//
// parseColor(input, { vars }) -> { ok: true, rgba: { r, g, b, a }, format, clipped } | { ok: false, reason }
// contrastRatio(fg, bg), composite(fg, bg), relativeLuminance(rgba), toOklch(rgba),
// formatColor(rgba, 'hex'|'rgb'|'hsl'|'hsl-bare'|'oklch'), detectFormat(str)

const fail = (reason) => ({ ok: false, reason });
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const MAX_VAR_DEPTH = 10;
const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
const BARE_HSL = new RegExp(`^(${NUM})(?:deg)?\\s+(${NUM})%\\s+(${NUM})%(?:\\s*/\\s*(${NUM}%?))?$`);

const toLinear = (v) => (Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
const toGamma = (v) => (Math.abs(v) <= 0.0031308 ? 12.92 * v : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055));

function mul(m, [x, y, z]) {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

const D50_TO_D65 = [0.9554734527042182, -0.023098536874261423, 0.0632593086610217,
  -0.028369706963208136, 1.0099954580058226, 0.021041398966943008,
  0.012314001688319899, -0.020507696433477912, 1.3303659366080753];
const XYZ65_TO_LSRGB = [3.2409699419045226, -1.537383177570094, -0.4986107602930034,
  -0.9692436362808796, 1.8759675015077202, 0.04155505740717559,
  0.05563007969699366, -0.20397695888897652, 1.0569715142428786];
const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(toGamma);
}

function srgbToOklab(r, g, b) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function labToSrgb(L, a, b) {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xyz = [
    fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k,
    L > k * e ? fy ** 3 : L / k,
    fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k,
  ].map((v, i) => v * D50_WHITE[i]);
  return mul(XYZ65_TO_LSRGB, mul(D50_TO_D65, xyz)).map(toGamma);
}

function hslToSrgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + hh / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function hwbToSrgb(h, w, bl) {
  if (w + bl >= 1) {
    const gray = w / (w + bl);
    return [gray, gray, gray];
  }
  return hslToSrgb(h, 1, 0.5).map((v) => v * (1 - w - bl) + w);
}

// ---- tokens --------------------------------------------------------------------------

function num(tok) {
  if (tok === 'none') return 0;
  if (!new RegExp(`^${NUM}$`).test(tok)) return NaN;
  return Number(tok);
}

// Number or percentage; pct maps 100% to `scale`.
function numOrPct(tok, scale) {
  if (typeof tok !== 'string') return NaN;
  if (tok.endsWith('%')) return (num(tok.slice(0, -1)) / 100) * scale;
  return num(tok);
}

function hue(tok) {
  const m = new RegExp(`^(${NUM})(deg|grad|rad|turn)?$`).exec(tok);
  if (tok === 'none') return 0;
  if (!m) return NaN;
  const v = Number(m[1]);
  return { deg: v, grad: v * 0.9, rad: (v * 180) / Math.PI, turn: v * 360, undefined: v }[m[2]];
}

function alpha(tok) {
  if (tok === undefined) return 1;
  const v = tok.endsWith('%') ? num(tok.slice(0, -1)) / 100 : num(tok);
  return Number.isNaN(v) ? NaN : clamp01(v);
}

// "a b c / d" or "a, b, c, d" -> [a, b, c, alpha?] or null
function splitArgs(args) {
  const s = args.trim();
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim());
    return parts.length === 3 || parts.length === 4 ? parts : null;
  }
  const [main, a, extra] = s.split('/');
  if (extra !== undefined) return null;
  const parts = main.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  if (a !== undefined) {
    if (!a.trim()) return null;
    parts.push(a.trim());
  }
  return parts;
}

// Splits on top-level commas (outside parentheses).
function topLevelCommas(s) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

// Textual var() substitution, as CSS does; recursive, with fallback and cycle detection.
function substituteVars(s, vars, stack = []) {
  const at = s.search(/var\(/i);
  if (at < 0) return { ok: true, text: s };
  if (stack.length > MAX_VAR_DEPTH) return fail('var() chain too deep');
  let depth = 0;
  let end = -1;
  for (let i = at + 3; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return fail('unbalanced var()');
  const inner = s.slice(at + 4, end);
  const comma = topLevelCommas(inner);
  const name = comma[0];
  const fallback = comma.length > 1 ? inner.slice(inner.indexOf(',') + 1).trim() : null;
  let replacement;
  if (stack.includes(name)) return fail(`var() cycle through ${name}`);
  if (Object.prototype.hasOwnProperty.call(vars, name)) {
    const r = substituteVars(String(vars[name]), vars, [...stack, name]);
    if (!r.ok) return r;
    replacement = r.text;
  } else if (fallback !== null) {
    const r = substituteVars(fallback, vars, stack);
    if (!r.ok) return r;
    replacement = r.text;
  } else {
    return fail(`undefined variable ${name}`);
  }
  return substituteVars(s.slice(0, at) + replacement + s.slice(end + 1), vars, stack);
}

function finish(rgb, a, format) {
  const clipped = rgb.some((v) => v < -1e-6 || v > 1 + 1e-6);
  const [r, g, b] = rgb.map(clamp01);
  return { ok: true, rgba: { r, g, b, a }, format, clipped };
}

function parseMix(args, vars) {
  const parts = topLevelCommas(args);
  if (parts.length !== 3) return fail('color-mix() needs a space and two colors');
  const space = /^in\s+(srgb|oklch)(?:\s+shorter\s+hue)?$/i.exec(parts[0]);
  if (!space) return fail(`color-mix() space "${parts[0]}" not supported`);
  const items = parts.slice(1).map((p) => {
    const m = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(p);
    const lead = /^(\d+(?:\.\d+)?)%\s+(.*)$/.exec(p);
    return lead ? { color: lead[2], pct: Number(lead[1]) } : { color: m[1], pct: m[2] === undefined ? null : Number(m[2]) };
  });
  let [p1, p2] = items.map((it) => it.pct);
  if (p1 === null && p2 === null) { p1 = 50; p2 = 50; } else if (p1 === null) p1 = 100 - p2; else if (p2 === null) p2 = 100 - p1;
  const sum = p1 + p2;
  if (!(sum > 0)) return fail('color-mix() percentages add up to 0');
  const w2 = p2 / sum;
  const alphaMult = sum < 100 ? sum / 100 : 1;
  const [c1, c2] = items.map((it) => parseColor(it.color, { vars }));
  if (!c1.ok) return c1;
  if (!c2.ok) return c2;
  const A = c1.rgba;
  const B = c2.rgba;
  const a = A.a * (1 - w2) + B.a * w2;
  if (space[1].toLowerCase() === 'srgb') {
    const ch = (k) => (a === 0 ? 0 : (A[k] * A.a * (1 - w2) + B[k] * B.a * w2) / a);
    return finish([ch('r'), ch('g'), ch('b')], a * alphaMult, 'color-mix');
  }
  const o1 = toOklch(A);
  const o2 = toOklch(B);
  let h1 = o1.c < 1e-4 ? o2.h : o1.h;
  let h2 = o2.c < 1e-4 ? o1.h : o2.h;
  if (h2 - h1 > 180) h1 += 360; else if (h1 - h2 > 180) h2 += 360;
  const pm = (v1, v2) => (a === 0 ? 0 : (v1 * A.a * (1 - w2) + v2 * B.a * w2) / a);
  const L = pm(o1.l, o2.l);
  const C = pm(o1.c, o2.c);
  const H = ((h1 * (1 - w2) + h2 * w2) * Math.PI) / 180;
  return finish(oklabToSrgb(L, C * Math.cos(H), C * Math.sin(H)), a * alphaMult, 'color-mix');
}

export function parseColor(input, { vars = {} } = {}) {
  if (typeof input !== 'string') return fail('not a string');
  let s = input.trim();
  let viaVar = false;
  if (/var\(/i.test(s)) {
    const r = substituteVars(s, vars);
    if (!r.ok) return r;
    s = r.text.trim();
    viaVar = true;
  }
  const out = parseResolved(s, vars);
  if (out.ok && viaVar) out.viaVar = true;
  return out;
}

function parseResolved(s, vars) {
  if (s === '') return fail('empty value');
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) return fail(`invalid hex color ${s}`);
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const v = full.match(/../g).map((x) => Number.parseInt(x, 16) / 255);
    return finish(v.slice(0, 3), v.length === 4 ? v[3] : 1, 'hex');
  }
  const bare = BARE_HSL.exec(s);
  if (bare) {
    const a = alpha(bare[4]);
    return finish(hslToSrgb(Number(bare[1]), Number(bare[2]) / 100, Number(bare[3]) / 100), a, 'hsl-bare');
  }
  const fn = /^([a-zA-Z-]+)\((.*)\)$/s.exec(s);
  if (!fn) return fail(`unsupported color "${s}"`);
  const name = fn[1].toLowerCase();
  if (name === 'color-mix') return parseMix(fn[2], vars);
  if (/\bfrom\b/.test(fn[2])) return fail('relative color syntax not supported');
  const p = splitArgs(fn[2]);
  if (!p) return fail(`cannot read the arguments of ${name}()`);
  const a = alpha(p[3]);
  let rgb;
  let format = name;
  switch (name) {
    case 'rgb':
    case 'rgba':
      rgb = p.slice(0, 3).map((t) => numOrPct(t, 255) / 255);
      format = 'rgb';
      break;
    case 'hsl':
    case 'hsla':
      rgb = hslToSrgb(hue(p[0]), numOrPct(p[1].endsWith('%') ? p[1] : `${p[1]}%`, 1), numOrPct(p[2].endsWith('%') ? p[2] : `${p[2]}%`, 1));
      format = 'hsl';
      break;
    case 'hwb':
      rgb = hwbToSrgb(hue(p[0]), numOrPct(p[1], 1), numOrPct(p[2], 1));
      break;
    case 'oklab':
      rgb = oklabToSrgb(numOrPct(p[0], 1), numOrPct(p[1], 0.4), numOrPct(p[2], 0.4));
      break;
    case 'oklch': {
      const h = (hue(p[2]) * Math.PI) / 180;
      const c = numOrPct(p[1], 0.4);
      rgb = oklabToSrgb(numOrPct(p[0], 1), c * Math.cos(h), c * Math.sin(h));
      break;
    }
    case 'lab':
      rgb = labToSrgb(numOrPct(p[0], 100), numOrPct(p[1], 125), numOrPct(p[2], 125));
      break;
    case 'lch': {
      const h = (hue(p[2]) * Math.PI) / 180;
      const c = numOrPct(p[1], 150);
      rgb = labToSrgb(numOrPct(p[0], 100), c * Math.cos(h), c * Math.sin(h));
      break;
    }
    default:
      return fail(`color function ${name}() not supported`);
  }
  if (rgb.some((v) => Number.isNaN(v)) || Number.isNaN(a)) return fail(`invalid ${name}() value`);
  return finish(rgb, a, format);
}

export function relativeLuminance({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(toLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

// fg over bg (source-over). bg is treated as opaque.
export function composite(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

// WCAG 2.2 ratio. A translucent background is first composited over white.
export function contrastRatio(fg, bg) {
  const base = bg.a < 1 ? composite(bg, WHITE) : bg;
  const top = composite(fg, base);
  const [l1, l2] = [relativeLuminance(top), relativeLuminance(base)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function toOklch({ r, g, b }) {
  const [L, A, B] = srgbToOklab(r, g, b);
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

function round(v, d) {
  const f = 10 ** d;
  return String(Math.round(v * f) / f);
}

function srgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function formatColor(rgba, format) {
  const a = rgba.a ?? 1;
  const alphaPart = a < 1 ? ` / ${round(a, 3)}` : '';
  switch (format) {
    case 'hex': {
      const parts = [rgba.r, rgba.g, rgba.b, ...(a < 1 ? [a] : [])];
      return `#${parts.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;
    }
    case 'rgb':
      return `rgb(${[rgba.r, rgba.g, rgba.b].map((v) => Math.round(clamp01(v) * 255)).join(' ')}${alphaPart})`;
    case 'hsl':
    case 'hsl-bare': {
      const [h, s, l] = srgbToHsl(rgba);
      const body = `${round(h, 1)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%`;
      return format === 'hsl' ? `hsl(${body}${alphaPart})` : `${body}${alphaPart}`;
    }
    case 'oklch': {
      const { l, c, h } = toOklch(rgba);
      return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)}${alphaPart})`;
    }
    default:
      throw new Error(`unknown color format ${format}`);
  }
}

export function detectFormat(str) {
  const s = String(str).trim();
  if (/var\(/i.test(s)) return 'var';
  if (/^#[0-9a-fA-F]+$/.test(s)) return 'hex';
  if (BARE_HSL.test(s)) return 'hsl-bare';
  const fn = /^([a-zA-Z-]+)\(/.exec(s);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  if (name === 'rgba') return 'rgb';
  if (name === 'hsla') return 'hsl';
  return ['rgb', 'hsl', 'hwb', 'oklch', 'oklab', 'lab', 'lch', 'color-mix'].includes(name) ? name : null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 38`, `pass 38`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 38).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `relativeLuminance`, intercambiar los pesos de G y B (`0.0722 * G + 0.7152 * B`) | `WCAG contrast ratio, with alpha composited over the background` |
| En `labToSrgb`, quitar la adaptación: `mul(XYZ65_TO_LSRGB, xyz)` en lugar de `mul(XYZ65_TO_LSRGB, mul(D50_TO_D65, xyz))` | `oklch, oklab, lab and lch (CSS Color 4, D50 for lab/lch)` |
| En el caso hex, ignorar el alfa: `finish(v.slice(0, 3), 1, 'hex')` | `hex with 3, 4, 6 and 8 digits` y `formatColor writes hex, rgb, hsl, bare hsl and oklch that parse back` |
| En `substituteVars`, borrar la línea `if (stack.includes(name)) return fail(…cycle…)` | `var() chains with fallback; missing or cyclic vars are unverified` |
| En `parseMix`, fijar `const alphaMult = 1;` | `color-mix in srgb and oklch; other spaces are unverified` |
| En `contrastRatio`, usar `const top = fg;` sin componer | `WCAG contrast ratio, with alpha composited over the background` |
| En `finish`, fijar `const clipped = false;` | `out-of-gamut colors are clipped into sRGB and flagged` |

- [ ] **Step 6: Commit**

```text
feat(ui): colores CSS a sRGB, contraste WCAG y formatos de escritura
```
```bash
git add plugins/pignolo-ui/lib/color.mjs plugins/pignolo-ui/tests/color.test.mjs
git commit -F <archivo-del-mensaje>
```


---

### Task 5: Fuentes de tokens: lectura (`lib/token-sources.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/token-sources.mjs`
- Test: `plugins/pignolo-ui/tests/token-sources.test.mjs`

**Interfaces:**
- Consumes: `tests/helpers.mjs` (`makeTempDir`, `writeTree`).
- Produces:
  - `readTokenSources(root, { maxFiles = 2000 } = {}) -> { sources, unsupported, unverified, darkDetected }`.
    - `sources[]`: `{ kind: 'css-vars' | 'shadcn' | 'tailwind-v4', file, blocks, baseColor? }` o `{ kind: 'tailwind-v3', file, theme, leaves }`; `file` relativo, con `/`.
    - `unsupported[]`: `{ kind: 'mui' | 'chakra' | 'css-in-js', file: 'package.json', reason }`. `unverified[]`: `{ kind, file, reason }`.
  - `scanCss(text) -> { blocks: [{ selector, context, theme, line, endLine, open, close, vars: [{ name, value, line, valueStart, valueEnd }] }], dark }`. `theme` es `'light'`, `'dark'` o el nombre de `[data-theme=…]`; `valueStart`/`valueEnd` son offsets en el texto original (los usa la escritura de la Task 6).
  - `parseTailwindConfig(text) -> { ok: true, theme, leaves: [{ path, value, line, start, end, quote }] } | { ok: false, reason }`. Nunca ejecuta el archivo.
- Nunca se leen `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `.nuxt`, `.svelte-kit`, `.output`, `coverage`, `.pignolo-ui`, `.turbo`, `.cache` ni `design/approved`.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/token-sources.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { readTokenSources, scanCss, parseTailwindConfig } from '../lib/token-sources.mjs';

const project = (tree) => writeTree(makeTempDir(), tree);
const varsOf = (block) => Object.fromEntries(block.vars.map((v) => [v.name, v.value]));

test('plain CSS variables in :root and .dark', () => {
  const r = readTokenSources(project({
    'src/styles.css': ':root {\n  --primary: #0b6bcb;\n  --radius: 8px;\n}\n\n.dark {\n  --primary: oklch(0.72 0.14 250);\n}\n.card { color: var(--primary); }\n',
  }));
  assert.deepEqual(r.unsupported, []);
  assert.deepEqual(r.unverified, []);
  assert.equal(r.darkDetected, true);
  assert.equal(r.sources.length, 1);
  const [src] = r.sources;
  assert.equal(src.kind, 'css-vars');
  assert.equal(src.file, 'src/styles.css');
  assert.deepEqual(src.blocks.map((b) => [b.selector, b.theme, b.line, b.endLine]), [[':root', 'light', 1, 4], ['.dark', 'dark', 6, 8]]);
  assert.deepEqual(varsOf(src.blocks[0]), { '--primary': '#0b6bcb', '--radius': '8px' });
  assert.deepEqual(src.blocks[0].vars.map((v) => v.line), [2, 3]);
});

test('Tailwind v4 @theme and @theme inline blocks', () => {
  const r = readTokenSources(project({
    'app.css': '@import "tailwindcss";\n@theme {\n  --color-primary: oklch(0.55 0.2 260);\n  --radius-md: 0.5rem;\n}\n@theme inline {\n  --color-surface: var(--surface);\n}\n',
  }));
  assert.equal(r.darkDetected, false);
  assert.deepEqual(r.sources.map((s) => [s.kind, s.file]), [['tailwind-v4', 'app.css']]);
  assert.deepEqual(r.sources[0].blocks.map((b) => b.selector), ['@theme', '@theme inline']);
  assert.deepEqual(varsOf(r.sources[0].blocks[0]), { '--color-primary': 'oklch(0.55 0.2 260)', '--radius-md': '0.5rem' });
});

test('shadcn: the CSS named by components.json, with bare HSL inside @layer base', () => {
  const r = readTokenSources(project({
    'components.json': JSON.stringify({ style: 'default', tailwind: { config: 'tailwind.config.js', css: 'app/globals.css', baseColor: 'slate', cssVariables: true } }),
    'app/globals.css': '@tailwind base;\n@layer base {\n  :root {\n    --background: 0 0% 100%;\n    --primary: 222.2 47.4% 11.2%;\n    --primary-foreground: 210 40% 98%;\n  }\n  .dark {\n    --background: 222.2 84% 4.9%;\n  }\n}\n',
  }));
  const shadcn = r.sources.find((s) => s.kind === 'shadcn');
  assert.ok(shadcn, JSON.stringify(r.sources.map((s) => s.kind)));
  assert.equal(shadcn.file, 'app/globals.css');
  assert.equal(shadcn.baseColor, 'slate');
  assert.deepEqual(shadcn.blocks.map((b) => [b.selector, b.theme, b.context]), [[':root', 'light', ['@layer base']], ['.dark', 'dark', ['@layer base']]]);
  assert.equal(varsOf(shadcn.blocks[0])['--primary-foreground'], '210 40% 98%');
});

test('prefers-color-scheme: dark and [data-theme] count as a dark theme', () => {
  const media = scanCss('@media (prefers-color-scheme: dark) {\n  :root { --bg: #000; }\n}\n');
  assert.equal(media.dark, true);
  assert.deepEqual(media.blocks.map((b) => [b.selector, b.theme]), [[':root', 'dark']]);
  const attr = scanCss(':root[data-theme="dark"] { --bg: #000 }\n[data-theme=light] { --bg: #fff }\n');
  assert.equal(attr.dark, true);
  assert.deepEqual(attr.blocks.map((b) => b.theme), ['dark', 'light']);
  assert.equal(scanCss('.darker { color: red }\n:root { --x: 1px }\n').dark, false);
});

test('braces and semicolons inside strings, comments and url() do not open blocks (Review Focus 4)', () => {
  const css = [
    '/* :root { --fake: red; } */',
    ':root {',
    '  --icon: url(data:image/svg+xml;utf8,<svg xmlns="x"></svg>);',
    '  --quote: "}";',
    "  --semi: ';';",
    '  /* --commented: blue; */',
    '  --last: #fff',
    '}',
    '.a::after { content: "{"; }',
    '',
  ].join('\n');
  const { blocks } = scanCss(css);
  assert.deepEqual(blocks.map((b) => b.selector), [':root']);
  assert.deepEqual(varsOf(blocks[0]), {
    '--icon': 'url(data:image/svg+xml;utf8,<svg xmlns="x"></svg>)',
    '--quote': '"}"',
    '--semi': "';'",
    '--last': '#fff',
  });
  assert.equal(blocks[0].vars.find((v) => v.name === '--last').line, 7);
});

test('Tailwind v3: a literal theme is read with the line of each value', () => {
  const text = [
    "const plugin = require('tailwindcss-animate');",
    'module.exports = {',
    "  content: ['./src/**/*.tsx'],",
    '  theme: {',
    '    extend: {',
    '      colors: {',
    "        primary: { DEFAULT: '#0b6bcb', foreground: \"#fff\" },",
    '      },',
    "      borderRadius: { lg: '12px' }, // trailing comment",
    '    },',
    '  },',
    '  plugins: [plugin, require("x")({ a: 1 })],',
    '};',
    '',
  ].join('\n');
  const r = parseTailwindConfig(text);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.leaves.map((l) => [l.path.join('.'), l.value, l.line]), [
    ['extend.colors.primary.DEFAULT', '#0b6bcb', 7],
    ['extend.colors.primary.foreground', '#fff', 7],
    ['extend.borderRadius.lg', '12px', 9],
  ]);
  const src = readTokenSources(project({ 'tailwind.config.js': text })).sources;
  assert.deepEqual(src.map((s) => [s.kind, s.file, s.leaves.length]), [['tailwind-v3', 'tailwind.config.js', 3]]);
});

test('Tailwind v3: TypeScript config exported through a const', () => {
  const r = parseTailwindConfig("import type { Config } from 'tailwindcss';\nconst config: Config = {\n  theme: { colors: { primary: '#123456' } },\n};\nexport default config;\n");
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.leaves.map((l) => l.path.join('.')), ['colors.primary']);
});

test('Tailwind v3: anything that is not a literal theme is unverified, never partial (Review Focus 5)', () => {
  const cases = [
    "module.exports = { theme: { extend: { colors: { ...defaultTheme.colors, primary: '#fff' } } } };",
    'module.exports = { theme: ({ theme }) => ({ colors: {} }) };',
    "const colors = require('tailwindcss/colors');\nmodule.exports = { theme: { colors: { blue: colors.blue } } };",
    "module.exports = { theme: { colors: require('./tokens.js') } };",
    'module.exports = { theme: { colors: { primary: `${base}` } } };',
    "module.exports = makeConfig({ theme: { colors: { primary: '#fff' } } });",
    "module.exports = { ...base, theme: { colors: { primary: '#fff' } } };",
    'export default config;',
  ];
  for (const text of cases) {
    const r = parseTailwindConfig(text);
    assert.equal(r.ok, false, text);
    assert.equal(r.leaves, undefined, text);
    assert.equal(typeof r.reason, 'string');
  }
  const out = readTokenSources(project({ 'tailwind.config.ts': cases[0] }));
  assert.deepEqual(out.sources, []);
  assert.deepEqual(out.unverified.map((u) => [u.kind, u.file]), [['tailwind-v3', 'tailwind.config.ts']]);
});

test('CSS-in-JS, MUI and Chakra are declared unsupported', () => {
  const r = readTokenSources(project({
    'package.json': JSON.stringify({ dependencies: { '@mui/material': '^6', react: '^19' }, devDependencies: { 'styled-components': '^6' }, peerDependencies: { '@chakra-ui/react': '^3' } }),
  }));
  assert.deepEqual(r.unsupported.map((u) => u.kind).sort(), ['chakra', 'css-in-js', 'mui']);
  for (const u of r.unsupported) assert.equal(u.file, 'package.json');
});

test('node_modules, build output and approved mockups are never token sources', () => {
  const r = readTokenSources(project({
    'node_modules/lib/x.css': ':root { --x: red; }',
    'dist/app.css': ':root { --x: red; }',
    'design/approved/home/style.css': ':root { --x: red; }',
    'src/app.css': 'body { margin: 0 }',
  }));
  assert.deepEqual(r.sources, []);
  assert.equal(r.darkDetected, false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `token-sources.test.mjs` no carga (`tests 39`, `pass 38`, `fail 1`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/lib/token-sources.mjs`:
```js
// Token sources that already exist in a project (spec §4.5). pignolo-ui reads them and
// never creates a second one. Reading never executes project code:
//   - CSS variables in :root, .dark, [data-theme] (css-vars)
//   - Tailwind v4 @theme / @theme inline blocks (tailwind-v4)
//   - shadcn: the CSS named by components.json, bare HSL included (shadcn)
//   - Tailwind v3 tailwind.config.*: only a literal theme object; otherwise unverified
//   - CSS-in-JS, MUI and Chakra themes: declared unsupported
//
// readTokenSources(root) -> { sources, unsupported, unverified, darkDetected }
// scanCss(text) -> { blocks, dark }        parseTailwindConfig(text) -> { ok, theme, leaves } | { ok: false, reason }
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage', '.pignolo-ui', '.turbo', '.cache']);
const TAILWIND_CONFIGS = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
const UNSUPPORTED_DEPS = {
  '@mui/material': 'mui',
  '@chakra-ui/react': 'chakra',
  'styled-components': 'css-in-js',
  '@emotion/react': 'css-in-js',
  '@emotion/styled': 'css-in-js',
  '@stitches/react': 'css-in-js',
  '@vanilla-extract/css': 'css-in-js',
};
const THEME_AT_RULE = /^@theme(\s+(inline|static|reference))*$/;
const TOKEN_SELECTOR = /^(:root|html|:host|\.dark|\.light|(:root|html)(\.dark|\.light)|(:root|html)?\[data-theme(=(["']?)[\w-]+\6)?\])$/;
const DARK_PRELUDE = /\.dark(?![\w-])|\[data-theme|prefers-color-scheme\s*:\s*dark/;

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Same length as the input: comments become spaces (newlines kept), strings untouched.
function blankComments(text, { js = false } = {}) {
  const out = text.split('');
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || (js && c === '`')) { quote = c; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (let j = i; j < stop; j++) if (out[j] !== '\n' && out[j] !== '\r') out[j] = ' ';
      i = stop - 1;
    } else if (js && c === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < text.length && text[j] !== '\n') out[j++] = ' ';
      i = j - 1;
    }
  }
  return out.join('');
}

function themeOf(selector, context) {
  if (THEME_AT_RULE.test(selector)) return 'light';
  const attr = /\[data-theme=(["']?)([\w-]+)\1\]/.exec(selector);
  if (attr) return attr[2];
  if (/\.dark(?![\w-])/.test(selector)) return 'dark';
  if (context.some((c) => /prefers-color-scheme\s*:\s*dark/.test(c))) return 'dark';
  return 'light';
}

function isTokenBlock(selector) {
  if (THEME_AT_RULE.test(selector)) return true;
  return selector.split(',').every((part) => TOKEN_SELECTOR.test(part.trim()));
}

export function scanCss(text) {
  const src = blankComments(text);
  const lineAt = lineIndex(text);
  const blocks = [];
  const stack = [];
  let dark = false;
  let seg = 0;
  let paren = 0;
  let quote = null;

  const decl = (start, end) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    const raw = src.slice(start, end);
    const m = /^(\s*)(--[A-Za-z0-9_-]+)(\s*:\s*)([\s\S]*?)\s*$/.exec(raw);
    if (!m) return;
    const nameStart = start + m[1].length;
    const valueStart = nameStart + m[2].length + m[3].length;
    const value = m[4].replace(/\s+/g, ' ').trim();
    top.vars.push({ name: m[2], value, line: lineAt(nameStart), valueStart, valueEnd: valueStart + m[4].length });
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(') { paren++; continue; }
    if (c === ')') { if (paren > 0) paren--; continue; }
    if (paren > 0) continue;
    if (c === '{') {
      const rawPrelude = src.slice(seg, i);
      const lead = rawPrelude.length - rawPrelude.trimStart().length;
      const selector = rawPrelude.replace(/\s+/g, ' ').trim();
      if (DARK_PRELUDE.test(selector)) dark = true;
      stack.push({ selector, context: stack.map((b) => b.selector), line: lineAt(seg + lead), open: i, vars: [] });
      seg = i + 1;
    } else if (c === ';') {
      decl(seg, i);
      seg = i + 1;
    } else if (c === '}') {
      decl(seg, i);
      const b = stack.pop();
      if (b && isTokenBlock(b.selector)) {
        blocks.push({ selector: b.selector, context: b.context, theme: themeOf(b.selector, b.context), line: b.line, endLine: lineAt(i), open: b.open, close: i, vars: b.vars });
      }
      seg = i + 1;
    }
  }
  blocks.sort((a, b) => a.open - b.open);
  return { blocks, dark };
}

// ---- Tailwind v3 config: literal object reader, never executes anything -------------------

class NotLiteral extends Error {}

class JsLiteral {
  constructor(src, text) {
    this.src = src;
    this.text = text;
    this.lineAt = lineIndex(text);
    this.leaves = [];
    this.nonLiteral = [];
  }

  ws(i) {
    while (i < this.src.length && /\s/.test(this.src[i])) i++;
    return i;
  }

  // Skips any expression up to a depth-0 , } ] or ).
  skip(i) {
    let depth = 0;
    let quote = null;
    for (; i < this.src.length; i++) {
      const c = this.src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if ('{[('.includes(c)) depth++;
      else if ('}])'.includes(c)) {
        if (depth === 0) return i;
        depth--;
      } else if (c === ',' && depth === 0) return i;
    }
    return i;
  }

  string(i) {
    const q = this.src[i];
    let out = '';
    for (let j = i + 1; j < this.src.length; j++) {
      const c = this.src[j];
      if (c === '\\') { out += this.src[j + 1]; j++; continue; }
      if (q === '`' && c === '$' && this.src[j + 1] === '{') throw new NotLiteral('template with ${}');
      if (c === q) return { value: out, end: j + 1 };
      out += c;
    }
    throw new NotLiteral('unterminated string');
  }

  value(i, p) {
    i = this.ws(i);
    const c = this.src[i];
    if (c === '{') return this.object(i, p);
    if (c === '[') return this.array(i, p);
    try {
      if (c === '"' || c === "'" || c === '`') {
        const s = this.string(i);
        this.leaves.push({ path: p, value: s.value, line: this.lineAt(i), start: i, end: s.end, quote: c });
        return { value: s.value, end: s.end };
      }
    } catch (e) {
      if (!(e instanceof NotLiteral)) throw e;
      this.nonLiteral.push({ path: p, what: e.message });
      return { value: undefined, end: this.skip(i + 1) };
    }
    const num = /^-?(\d+\.?\d*|\.\d+)(?![\w$])/.exec(this.src.slice(i));
    if (num) {
      this.leaves.push({ path: p, value: Number(num[0]), line: this.lineAt(i), start: i, end: i + num[0].length, quote: null });
      return { value: Number(num[0]), end: i + num[0].length };
    }
    const kw = /^(true|false|null)(?![\w$])/.exec(this.src.slice(i));
    if (kw) return { value: JSON.parse(kw[1]), end: i + kw[1].length };
    const end = this.skip(i);
    this.nonLiteral.push({ path: p, what: `expression "${this.src.slice(i, end).trim().slice(0, 40)}"` });
    return { value: undefined, end };
  }

  object(i, p) {
    const obj = {};
    i = this.ws(i + 1);
    while (this.src[i] !== '}') {
      if (i >= this.src.length) throw new NotLiteral('unterminated object');
      if (this.src.startsWith('...', i)) {
        const end = this.skip(i + 3);
        this.nonLiteral.push({ path: p, what: 'spread' });
        i = end;
      } else {
        let key;
        const c = this.src[i];
        if (c === '"' || c === "'") {
          const s = this.string(i);
          key = s.value;
          i = s.end;
        } else {
          const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(this.src.slice(i));
          if (!m) {
            const end = this.skip(i);
            this.nonLiteral.push({ path: p, what: 'computed or unknown key' });
            i = end;
            if (this.src[i] === ',') i = this.ws(i + 1);
            continue;
          }
          key = m[0];
          i += key.length;
        }
        i = this.ws(i);
        if (this.src[i] === ':') {
          const v = this.value(i + 1, [...p, key]);
          if (v.value !== undefined) obj[key] = v.value;
          i = this.ws(v.end);
        } else {
          this.nonLiteral.push({ path: [...p, key], what: 'shorthand or method' });
          i = this.skip(i);
        }
      }
      i = this.ws(i);
      if (this.src[i] === ',') i = this.ws(i + 1);
      else if (this.src[i] !== '}') throw new NotLiteral(`unexpected "${this.src[i]}"`);
    }
    return { value: obj, end: i + 1 };
  }

  array(i, p) {
    const arr = [];
    i = this.ws(i + 1);
    while (this.src[i] !== ']') {
      if (i >= this.src.length) throw new NotLiteral('unterminated array');
      const v = this.value(i, [...p, arr.length]);
      arr.push(v.value);
      i = this.ws(v.end);
      if (this.src[i] === ',') i = this.ws(i + 1);
      else if (this.src[i] !== ']') throw new NotLiteral(`unexpected "${this.src[i]}"`);
    }
    return { value: arr, end: i + 1 };
  }
}

export function parseTailwindConfig(text) {
  const src = blankComments(String(text), { js: true });
  const m = /module\.exports\s*=\s*|export\s+default\s+/.exec(src);
  if (!m) return { ok: false, reason: 'no module.exports or export default' };
  let start = m.index + m[0].length;
  if (src[start] !== '{') {
    const id = /^([A-Za-z_$][\w$]*)\s*(;|$|\n)/.exec(src.slice(start));
    const decl = id && new RegExp(`(?:const|let|var)\\s+${id[1].replace(/\$/g, '\\$')}\\s*(?::\\s*[\\w.<>\\[\\]]+\\s*)?=\\s*\\{`).exec(src);
    if (!decl) return { ok: false, reason: 'the exported config is not an object literal' };
    start = decl.index + decl[0].length - 1;
  }
  const reader = new JsLiteral(src, String(text));
  let root;
  try {
    root = reader.object(start, []).value;
  } catch (e) {
    if (e instanceof NotLiteral) return { ok: false, reason: `config is not a literal (${e.message})` };
    throw e;
  }
  const bad = reader.nonLiteral.find((n) => n.path.length === 0 || n.path[0] === 'theme');
  if (bad) return { ok: false, reason: `theme is not a literal at "${bad.path.join('.') || '(root)'}": ${bad.what}` };
  const leaves = reader.leaves
    .filter((l) => l.path[0] === 'theme' && l.path.length > 1)
    .map((l) => ({ ...l, path: l.path.slice(1) }));
  return { ok: true, theme: root.theme || {}, leaves };
}

// ---- project scan -----------------------------------------------------------------------

function listCss(root, max) {
  const out = [];
  let truncated = false;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= max) { truncated = true; return; }
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || rel === 'design/approved') continue;
        walk(full);
      } else if (ent.name.endsWith('.css')) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return { files: out.sort(), truncated };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function readTokenSources(root, { maxFiles = 2000 } = {}) {
  const sources = [];
  const unsupported = [];
  const unverified = [];
  let darkDetected = false;

  const components = readJson(path.join(root, 'components.json'));
  const shadcnCss = components && components.tailwind && typeof components.tailwind.css === 'string'
    ? path.posix.normalize(components.tailwind.css.replace(/\\/g, '/').replace(/^\.\//, ''))
    : null;

  const { files, truncated } = listCss(root, maxFiles);
  if (truncated) unverified.push({ kind: 'css', file: '.', reason: `more than ${maxFiles} CSS files; scan truncated` });
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
    const scan = scanCss(text);
    darkDetected ||= scan.dark;
    const theme = scan.blocks.filter((b) => THEME_AT_RULE.test(b.selector));
    const vars = scan.blocks.filter((b) => !THEME_AT_RULE.test(b.selector));
    if (vars.length) {
      const src = { kind: file === shadcnCss ? 'shadcn' : 'css-vars', file, blocks: vars };
      if (src.kind === 'shadcn') src.baseColor = components.tailwind.baseColor ?? null;
      sources.push(src);
    }
    if (theme.length) sources.push({ kind: 'tailwind-v4', file, blocks: theme });
  }

  for (const name of TAILWIND_CONFIGS) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    const r = parseTailwindConfig(fs.readFileSync(full, 'utf8'));
    if (r.ok) sources.push({ kind: 'tailwind-v3', file: name, theme: r.theme, leaves: r.leaves });
    else unverified.push({ kind: 'tailwind-v3', file: name, reason: r.reason });
  }

  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const seen = new Set();
    for (const [dep, kind] of Object.entries(UNSUPPORTED_DEPS)) {
      if (deps[dep] === undefined || seen.has(kind)) continue;
      seen.add(kind);
      unsupported.push({ kind, file: 'package.json', reason: `${dep}: tokens that live in JavaScript are not supported` });
    }
  }

  return { sources, unsupported, unverified, darkDetected };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 48`, `pass 48`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 48).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `scanCss`, borrar la línea `if (paren > 0) continue;` | `braces and semicolons inside strings, comments and url() do not open blocks (Review Focus 4)` |
| En `scanCss`, usar `const src = text;` en lugar de `blankComments(text)` | `braces and semicolons inside strings, comments and url() do not open blocks (Review Focus 4)` |
| En `themeOf`, borrar la línea de `prefers-color-scheme` | `prefers-color-scheme: dark and [data-theme] count as a dark theme` |
| En `parseTailwindConfig`, buscar solo `n.path[0] === 'theme'` (sin `n.path.length === 0`) | `Tailwind v3: anything that is not a literal theme is unverified, never partial (Review Focus 5)` |
| En `listCss`, quitar `\|\| rel === 'design/approved'` | `node_modules, build output and approved mockups are never token sources` |
| En `DARK_PRELUDE`, quitar `(?![\w-])` después de `\.dark` | `prefers-color-scheme: dark and [data-theme] count as a dark theme` |

- [ ] **Step 6: Commit**

```text
feat(ui): lectura de las fuentes de tokens del proyecto sin ejecutar código
```
```bash
git add plugins/pignolo-ui/lib/token-sources.mjs plugins/pignolo-ui/tests/token-sources.test.mjs
git commit -F <archivo-del-mensaje>
```


---

### Task 6: Fuentes de tokens: escritura en la fuente existente

**Files:**
- Modify: `plugins/pignolo-ui/lib/token-sources.mjs`
- Test: `plugins/pignolo-ui/tests/token-write.test.mjs`

**Interfaces:**
- Consumes: `scanCss`, `parseTailwindConfig` (Task 5); `detectFormat`, `formatColor` (Task 4).
- Produces:
  - `setCssVar(text, { selector, name, value }) -> { ok: true, text, line, before, after } | { ok: false, reason: 'block-not-found' | 'invalid-value' | 'invalid-name' }`: edita el valor o agrega una línea dentro del primer bloque de tokens con ese selector; nunca crea un bloque.
  - `formatLike(sample, rgba) -> string | null`: el color en la notación del valor existente (HSL desnudo sigue desnudo); `null` si esa notación no es una que pignolo-ui escribe.
  - `replaceTailwindLiteral(text, keyPath, newValue) -> { ok: true, text, line, before, after } | { ok: false, reason: 'not-a-literal-value' | 'unverified: …' }`: reemplaza un valor literal existente con su mismo estilo de comillas; nunca agrega claves.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/token-write.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setCssVar, replaceTailwindLiteral, formatLike, scanCss } from '../lib/token-sources.mjs';
import { parseColor } from '../lib/color.mjs';

const CSS = ':root {\n  --primary: #0b6bcb; /* brand */\n  --radius: 8px;\n}\n\n@layer base {\n  .dark {\n    --primary: oklch(0.72 0.14 250);\n  }\n}\n';

test('replacing an existing variable changes only its value', () => {
  const r = setCssVar(CSS, { selector: ':root', name: '--primary', value: '#095bad' });
  assert.equal(r.ok, true);
  assert.equal(r.text, CSS.replace('#0b6bcb', '#095bad'));
  assert.deepEqual([r.line, r.before, r.after], [2, '#0b6bcb', '#095bad']);
});

test('a new variable is inserted in the existing block with its indentation and line endings', () => {
  const crlf = CSS.replace(/\n/g, '\r\n');
  const r = setCssVar(crlf, { selector: '.dark', name: '--surface', value: 'oklch(0.2 0 0)' });
  assert.equal(r.ok, true);
  assert.equal(r.text, crlf.replace('    --primary: oklch(0.72 0.14 250);\r\n', '    --primary: oklch(0.72 0.14 250);\r\n    --surface: oklch(0.2 0 0);\r\n'));
  assert.equal(r.line, 9);
  const dark = scanCss(r.text).blocks.find((b) => b.selector === '.dark');
  assert.deepEqual(dark.vars.map((v) => v.name), ['--primary', '--surface']);
  const noSemi = setCssVar(':root {\n  --last: #fff\n}\n', { selector: ':root', name: '--b', value: '2px' });
  assert.equal(noSemi.text, ':root {\n  --last: #fff;\n  --b: 2px;\n}\n');
});

test('single-line blocks get the declaration before the closing brace', () => {
  const r = setCssVar(':root { --a: 1px }\n', { selector: ':root', name: '--b', value: '2px' });
  assert.equal(r.text, ':root { --a: 1px; --b: 2px; }\n');
  const r2 = setCssVar(':root {}\n', { selector: ':root', name: '--b', value: '2px' });
  assert.equal(r2.text, ':root { --b: 2px; }\n');
});

test('a missing block is never created: the write is refused', () => {
  const r = setCssVar(CSS, { selector: '[data-theme="dark"]', name: '--primary', value: '#fff' });
  assert.deepEqual(r, { ok: false, reason: 'block-not-found' });
  assert.deepEqual(setCssVar('', { selector: '@theme', name: '--x', value: '1px' }), { ok: false, reason: 'block-not-found' });
});

test('values that could break the block are refused', () => {
  for (const value of ['red; --x: 1', 'a { b', 'a }', 'a\nb', '']) {
    assert.deepEqual(setCssVar(CSS, { selector: ':root', name: '--primary', value }), { ok: false, reason: 'invalid-value' }, value);
  }
  assert.deepEqual(setCssVar(CSS, { selector: ':root', name: 'primary', value: 'red' }), { ok: false, reason: 'invalid-name' });
});

test('formatLike writes a color in the notation of the existing value', () => {
  const white = parseColor('#ffffff').rgba;
  assert.equal(formatLike('210 40% 98%', white), '0 0% 100%');
  assert.equal(formatLike('#0b6bcb', white), '#ffffff');
  assert.equal(formatLike('hsl(0 0% 0%)', white), 'hsl(0 0% 100%)');
  assert.match(formatLike('oklch(0.5 0.1 200)', white), /^oklch\(1 0 0\)$/);
  assert.equal(formatLike('var(--x)', white), null);
  assert.equal(formatLike('lab(50 0 0)', white), null);
});

test('Tailwind v3: only an existing literal value is replaced, with its quote style', () => {
  const text = "module.exports = {\n  theme: {\n    extend: {\n      colors: { primary: '#0b6bcb', 'on-primary': \"#fff\" },\n      borderRadius: { lg: '12px' },\n      zIndex: { top: 50 },\n    },\n  },\n  plugins: [require('x')],\n};\n";
  const r = replaceTailwindLiteral(text, ['extend', 'colors', 'primary'], '#095bad');
  assert.equal(r.ok, true);
  assert.equal(r.text, text.replace("'#0b6bcb'", "'#095bad'"));
  assert.equal(r.line, 4);
  assert.equal(replaceTailwindLiteral(text, ['extend', 'colors', 'on-primary'], "it's").text, text.replace('"#fff"', '"it\'s"'));
  assert.equal(replaceTailwindLiteral(text, ['extend', 'colors', 'primary'], "a'b").text, text.replace("'#0b6bcb'", "'a\\'b'"));
  assert.equal(replaceTailwindLiteral(text, ['extend', 'zIndex', 'top'], 60).text, text.replace('top: 50', 'top: 60'));
  assert.deepEqual(replaceTailwindLiteral(text, ['extend', 'colors', 'secondary'], '#000'), { ok: false, reason: 'not-a-literal-value' });
  const bad = replaceTailwindLiteral('module.exports = { theme: { colors: base } };', ['colors', 'primary'], '#000');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /^unverified: /);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `token-write.test.mjs` no carga (`The requested module '../lib/token-sources.mjs' does not provide an export named 'formatLike'`) (`tests 49`, `pass 48`, `fail 1`).

- [ ] **Step 3: Implementación mínima**

En `plugins/pignolo-ui/lib/token-sources.mjs`, justo después de:
```js
import path from 'node:path';
```
agregar:
```js
import { detectFormat, formatColor } from './color.mjs';
```

En `plugins/pignolo-ui/lib/token-sources.mjs`, justo después de:
```js
// scanCss(text) -> { blocks, dark }        parseTailwindConfig(text) -> { ok, theme, leaves } | { ok: false, reason }
```
agregar:
```js
// Writes (v1): setCssVar edits a variable inside an existing block; replaceTailwindLiteral
// replaces an existing literal value. Neither creates a block, a key or a new source.
```

En `plugins/pignolo-ui/lib/token-sources.mjs`, justo después de:
```js
  return { sources, unsupported, unverified, darkDetected };
}
```
agregar:
```js

// ---- writes ------------------------------------------------------------------------------

// Sets `name: value` inside the first token block whose selector equals `selector`
// (':root', '.dark', '@theme', '@theme inline'...). Only the value span or one new line
// changes; a missing block is refused (never a second source).
export function setCssVar(text, { selector, name, value }) {
  if (!/^--[A-Za-z0-9_-]+$/.test(name || '')) return { ok: false, reason: 'invalid-name' };
  if (typeof value !== 'string' || !value.trim() || /[;{}\r\n]/.test(value)) return { ok: false, reason: 'invalid-value' };
  const want = String(selector).replace(/\s+/g, ' ').trim();
  const block = scanCss(text).blocks.find((b) => b.selector === want);
  if (!block) return { ok: false, reason: 'block-not-found' };
  const lineAt = lineIndex(text);
  const existing = block.vars.find((v) => v.name === name);
  if (existing) {
    const before = text.slice(existing.valueStart, existing.valueEnd);
    return { ok: true, text: text.slice(0, existing.valueStart) + value + text.slice(existing.valueEnd), line: existing.line, before, after: value };
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const closeLineStart = text.lastIndexOf('\n', block.close - 1) + 1;
  const beforeClose = text.slice(closeLineStart, block.close);
  const last = block.vars[block.vars.length - 1];
  if (closeLineStart > block.open && /^[ \t]*$/.test(beforeClose)) {
    let indent = `${beforeClose}  `;
    if (last) {
      const ls = text.lastIndexOf('\n', last.valueStart) + 1;
      indent = /^[ \t]*/.exec(text.slice(ls))[0];
    }
    let out = `${text.slice(0, closeLineStart)}${indent}${name}: ${value};${eol}${text.slice(closeLineStart)}`;
    if (last && !/^\s*;/.test(text.slice(last.valueEnd))) out = `${out.slice(0, last.valueEnd)};${out.slice(last.valueEnd)}`;
    return { ok: true, text: out, line: lineAt(closeLineStart), before: null, after: value };
  }
  const trimmed = text.slice(block.open + 1, block.close).trimEnd();
  const needsSemi = trimmed.trim() !== '' && !trimmed.endsWith(';');
  const at = block.open + 1 + trimmed.length;
  const out = `${text.slice(0, at)}${needsSemi ? ';' : ''} ${name}: ${value}; ${text.slice(block.close)}`;
  return { ok: true, text: out, line: lineAt(block.open), before: null, after: value };
}

const WRITABLE_FORMATS = { hex: 'hex', rgb: 'rgb', hsl: 'hsl', 'hsl-bare': 'hsl-bare', oklch: 'oklch' };

// Writes `rgba` in the notation of `sample` (shadcn bare HSL stays bare HSL). null when
// that notation is not one pignolo-ui writes (var(), color-mix(), lab()...).
export function formatLike(sample, rgba) {
  const f = WRITABLE_FORMATS[detectFormat(sample)];
  return f ? formatColor(rgba, f) : null;
}

function quoteJs(s, q) {
  let body = s.replace(/\\/g, '\\\\').split(q).join(`\\${q}`);
  if (q === '`') body = body.replace(/\$\{/g, '\\${');
  return `${q}${body}${q}`;
}

// Replaces one literal value of a literal Tailwind v3 theme; never adds keys.
export function replaceTailwindLiteral(text, keyPath, newValue) {
  const r = parseTailwindConfig(text);
  if (!r.ok) return { ok: false, reason: `unverified: ${r.reason}` };
  const leaf = r.leaves.find((l) => l.path.length === keyPath.length && l.path.every((p, i) => String(p) === String(keyPath[i])));
  if (!leaf) return { ok: false, reason: 'not-a-literal-value' };
  const lit = typeof newValue === 'number' && !leaf.quote ? String(newValue) : quoteJs(String(newValue), leaf.quote || "'");
  return { ok: true, text: text.slice(0, leaf.start) + lit + text.slice(leaf.end), line: leaf.line, before: leaf.value, after: newValue };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 55`, `pass 55`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 55).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `setCssVar`, cuando no hay bloque, devolver `ok: true` con un bloque nuevo agregado al final del texto en lugar de `block-not-found` | `a missing block is never created: the write is refused` |
| En `setCssVar`, borrar la línea que agrega `;` a la última declaración (`if (last && !/^\s*;/.test(…)) out = …`) | `a new variable is inserted in the existing block with its indentation and line endings` |
| En `setCssVar`, fijar `const eol = '\n';` | `a new variable is inserted in the existing block with its indentation and line endings` |
| En `setCssVar`, aceptar `;` en el valor (`/[{}\r\n]/` en lugar de `/[;{}\r\n]/`) | `values that could break the block are refused` |
| En `replaceTailwindLiteral`, devolver `{ ok: true, text, line: null }` cuando no hay hoja | `Tailwind v3: only an existing literal value is replaced, with its quote style` |
| En `replaceTailwindLiteral`, usar siempre comilla simple (`quoteJs(String(newValue), "'")`) | `Tailwind v3: only an existing literal value is replaced, with its quote style` |

- [ ] **Step 6: Commit**

```text
feat(ui): escritura en la fuente de tokens existente, sin crear otra
```
```bash
git add plugins/pignolo-ui/lib/token-sources.mjs plugins/pignolo-ui/tests/token-write.test.mjs
git commit -F <archivo-del-mensaje>
```


---

### Task 7: Catálogo semilla y validador de `DESIGN.md` con alias semánticos (`design-md validate`)

**Files:**
- Create: `plugins/pignolo-ui/catalog/rules.json`, `plugins/pignolo-ui/lib/design-doc.mjs`, `plugins/pignolo-ui/scripts/design-md.mjs`
- Modify: `plugins/pignolo-ui/README.md` (mapa de alias por defecto)
- Test: `plugins/pignolo-ui/tests/catalog.test.mjs`, `plugins/pignolo-ui/tests/design-validate.test.mjs`, `plugins/pignolo-ui/tests/fixtures/design/valid.md`

**Interfaces:**
- Consumes: `parseYaml`, `locate` (Task 3); `parseColor` (Task 4); `readTokenSources` (Task 5).
- Produces:
  - `catalog/rules.json`: `{ catalogVersion, note, rules: [{ id, criterion, class, level, platform, severity, floor, acceptsIntentional, source }] }`.
  - `splitFrontmatter(text) -> { ok: true, yaml, yamlLine, body, bodyLine, eol } | { ok: false, reason }` (tolera BOM y CRLF).
  - `validateDesign(text, { catalog, darkInCss = false }) -> { status: 'valid' | 'invalid' | 'unverified', reason, reject, findings, data }`; hallazgo `{ id, severity, path, line, message, rejects }` con `id` ∈ `DESIGN-FRONTMATTER`, `DESIGN-YAML`, `DESIGN-FORMAT`, `DESIGN-REF`, `DESIGN-SCHEMA`, `DESIGN-INTENTIONAL`, `DESIGN-TOKEN-LIKE`, `DESIGN-ALIAS`, `DESIGN-CONTENT`, `THEME-03`; `line` es la línea del archivo. `status` es `valid` si todos los hallazgos son `detalle`.
  - `colorFamily(name)`, `isSemanticColor(name)`, `MD3_FAMILIES`, `PIGNOLO_SCHEMA` (incluye `aliases`).
  - `DEFAULT_ALIASES` (mapa nombre del proyecto → nombre MD3, congelado) y `resolveAliases(colors, custom) -> Map<nombre, { as, source: 'default alias' | 'pignolo.aliases' }>`.
  - CLI: `node scripts/design-md.mjs validate --file <DESIGN.md> [--project <raíz>] [--catalog <rules.json>]` → JSON `{ status, reason, reject, findings, darkInCss }`; sale 0 válido, 1 con hallazgos, 2 no verificado (YAML no soportado) o error propio (stderr en español).
- Qué rechaza la escritura (`rejects: true`): sin frontmatter, error de YAML en una clave, esquema `pignolo:` cerrado, `intentional` sobre una regla sin `acceptsIntentional`, valores que dispararían `token-like-ignored`. Qué es `alto` sin rechazar: contenido obligatorio que falta (§4.2), referencias rotas, colores vacíos o que no son string, THEME-03. Qué es `detalle`: cada alias tomado (`DESIGN-ALIAS`). Los nombres leídos por alias cuentan como semánticos para el contenido obligatorio y para THEME-03.

- [ ] **Step 1: Escribir los tests que fallan (y el fixture)**

`plugins/pignolo-ui/tests/fixtures/design/valid.md`:
```markdown
---
version: alpha
name: Fixture
description: Complete DESIGN.md for the validator tests.
colors:
  blue-600: "#0B6BCB"
  primary: "{colors.blue-600}"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  on-surface: "#1A1A1A"
  outline: "#8F8F8F"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: 8px
spacing:
  "4": 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
pignolo:
  schema: 1
  platform: both
  register: product
  elevation:
    level0: "none"
    level1: "0 1px 2px rgb(0 0 0 / 0.14)"
  states:
    hoverOpacity: 0.08
    focusOpacity: 0.12
    pressedOpacity: 0.12
    draggedOpacity: 0.16
    disabledContentOpacity: 0.38
    disabledContainerOpacity: 0.12
  focus:
    color: "{colors.primary}"
    widthPx: 2
    offsetPx: 2
  motion:
    durationMs:
      fast: 120
      base: 200
    easing:
      standard: "cubic-bezier(0.2, 0, 0, 1)"
    reducedMotion: fade-or-none
---

## Overview

Fixture used by the tests.

## Layout

### Hierarchy and reading order

Title, then the primary action, then the list.

## Decisions
```

`plugins/pignolo-ui/tests/catalog.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));
const SPEC_5_4 = ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-05', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04',
  'STATE-04', 'MOTION-03', 'MOTION-04', 'COLOR-02', 'DEPTH-01', 'LAYOUT-04', 'DRIFT-01', 'THEME-01', 'THEME-02', 'COLOR-11',
  'COLOR-12', 'ICON-01', 'CONTENT-01', 'COPY-01', 'META-01'];

test('catalog ids are unique and cover the 25 rules of spec 5.4 plus THEME-03', () => {
  const ids = catalog.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...SPEC_5_4, 'THEME-03'].sort());
  assert.match(catalog.catalogVersion, /^\d+\.\d+\.\d+$/);
});

test('every rule has the fields of spec 5.1 with valid values', () => {
  for (const r of catalog.rules) {
    assert.match(r.id, /^[A-Z0-9]+-\d{2}$/);
    assert.ok(typeof r.criterion === 'string' && r.criterion.length > 0, r.id);
    assert.ok(['script', 'browser', 'agent'].includes(r.class), r.id);
    assert.ok(['document', 'element', 'style'].includes(r.level), r.id);
    assert.ok(['D', 'M', 'D+M'].includes(r.platform), r.id);
    assert.ok(['bloquea', 'alto', 'medio', 'detalle'].includes(r.severity), r.id);
    assert.equal(typeof r.floor, 'boolean', r.id);
    assert.equal(typeof r.acceptsIntentional, 'boolean', r.id);
    assert.ok(typeof r.source === 'string' && r.source.length > 0, r.id);
  }
});

test('no floor rule accepts intentional, and THEME-03 does not either', () => {
  for (const r of catalog.rules) if (r.floor) assert.equal(r.acceptsIntentional, false, r.id);
  assert.equal(catalog.rules.find((r) => r.id === 'THEME-03').acceptsIntentional, false);
});

test('the floor is exactly WCAG A/AA rules plus CONTENT-01 markers', () => {
  const floor = catalog.rules.filter((r) => r.floor).map((r) => r.id).sort();
  assert.deepEqual(floor, ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04', 'CONTENT-01', 'STATE-04']);
});
```

`plugins/pignolo-ui/tests/design-validate.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, PLUGIN_ROOT, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { validateDesign, splitFrontmatter, DEFAULT_ALIASES } from '../lib/design-doc.mjs';

const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));
const VALID = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');

function edit(find, replace, text = VALID) {
  assert.equal(text.split(find).length, 2, `not unique: ${find}`);
  return text.replace(find, replace);
}

const check = (text, opts = {}) => validateDesign(text, { catalog, ...opts });
const ids = (r) => r.findings.map((f) => `${f.id} ${f.path}`);

test('the complete fixture is valid', () => {
  const r = check(VALID);
  assert.deepEqual(r.findings, []);
  assert.equal(r.status, 'valid');
  assert.equal(r.reject, false);
});

test('a BOM and CRLF line endings validate the same (Review Focus 2)', () => {
  const r = check(`\uFEFF${VALID.replace(/\n/g, '\r\n')}`);
  assert.equal(r.status, 'valid', JSON.stringify(r.findings));
  const bad = check(`\uFEFF${edit('  platform: both\n', '  platform: tablet\n').replace(/\n/g, '\r\n')}`);
  assert.deepEqual(bad.findings.map((f) => [f.id, f.line]), [['DESIGN-SCHEMA', 32]]);
});

test('splitFrontmatter gives the YAML, the body and their first lines', () => {
  const s = splitFrontmatter(VALID);
  assert.equal(s.ok, true);
  assert.equal(s.yamlLine, 2);
  assert.match(s.body, /^\n## Overview/);
  assert.equal(splitFrontmatter('# no frontmatter\n').ok, false);
  assert.equal(splitFrontmatter('---\na: 1\n').ok, false);
});

test('without frontmatter the file is invalid and rejected', () => {
  const r = check('# Design\n\nJust prose.\n');
  assert.deepEqual(ids(r), ['DESIGN-FRONTMATTER ']);
  assert.equal(r.reject, true);
});

test('unsupported YAML is "not validated": no rule is evaluated', () => {
  const r = check(edit('  md: 8px\n', '  md: &r 8px\n'));
  assert.equal(r.status, 'unverified');
  assert.match(r.reason, /anchor/);
  assert.deepEqual(r.findings, []);
});

test('the pignolo: schema is closed: unknown keys and wrong values reject', () => {
  const cases = [
    [edit('  schema: 1\n', '  schema: 1\n  foo: 1\n'), 'pignolo.foo'],
    [edit('    reducedMotion: fade-or-none\n', '    reducedMotion: fade-or-none\n    speed: 2\n'), 'pignolo.motion.speed'],
    [edit('  platform: both\n', '  platform: tablet\n'), 'pignolo.platform'],
    [edit('    hoverOpacity: 0.08\n', '    hoverOpacity: 2\n'), 'pignolo.states.hoverOpacity'],
    [edit('    color: "{colors.primary}"\n', '    color: "{rounded.md}"\n'), 'pignolo.focus.color'],
    [edit('  schema: 1\n', '  schema: 2\n'), 'pignolo.schema'],
    [edit('    level1: "0 1px 2px rgb(0 0 0 / 0.14)"\n', '    level9: "none"\n'), 'pignolo.elevation.level9'],
    [edit('  schema: 1\n', '  schema: 1\n  rejections:\n    - id: R-1\n      date: 2026-09-28\n      note: x\n'), 'pignolo.rejections.0.id'],
    [edit('  schema: 1\n', '  schema: 1\n  rejections:\n    - id: R-001\n      date: 2026-09-28\n'), 'pignolo.rejections.0.note'],
    [edit('  schema: 1\n', '  schema: 1\n  cssVars:\n    colors.primary: primary\n'), 'pignolo.cssVars.colors.primary'],
    [edit('  schema: 1\n', '  schema: 1\n  extracted:\n    - colors.nope\n'), 'pignolo.extracted.0'],
    [edit('  schema: 1\n', '  schema: 1\n  web:\n    public: yes\n'), 'pignolo.web.public'],
  ];
  for (const [text, where] of cases) {
    const r = check(text);
    assert.deepEqual(ids(r), [`DESIGN-SCHEMA ${where}`], where);
    assert.equal(r.reject, true, where);
    assert.equal(typeof r.findings[0].line, 'number', where);
  }
});

test('the reserved web keys and a full rejection entry are accepted', () => {
  const text = edit('  schema: 1\n', [
    '  schema: 1',
    '  web:',
    '    public: true',
    '    indexable: false',
    '    locales: [es, en]',
    '    aiCrawlers: null',
    '    llmsTxt: false',
    '    structuredData: []',
    '    conversion: { goal: signup }',
    '  rejections:',
    '    - id: R-001',
    '      date: 2026-09-28',
    '      rule: COLOR-11',
    '      pattern: { kind: property, value: "background-image: linear-gradient" }',
    '      note: no purple gradients',
    '  cssVars:',
    '    colors.primary: --primary',
    '  extracted:',
    '    - colors.outline',
    '',
  ].join('\n'));
  assert.deepEqual(check(text).findings, []);
});

test('intentional only accepts rules with acceptsIntentional: floor and THEME-03 reject', () => {
  const withIntentional = (id) => edit('  schema: 1\n', `  schema: 1\n  intentional:\n    - id: ${id}\n      why: brand decision\n`);
  assert.deepEqual(check(withIntentional('COLOR-02')).findings, []);
  for (const id of ['A11Y-01', 'COLOR-03', 'THEME-03', 'NOPE-99']) {
    const r = check(withIntentional(id));
    assert.deepEqual(ids(r), ['DESIGN-INTENTIONAL pignolo.intentional.0.id'], id);
    assert.equal(r.reject, true);
  }
});

test('hex or dimensions inside pignolo: would be token-like-ignored and reject', () => {
  let r = check(edit('      fast: 120\n', '      fast: "120ms"\n'));
  assert.deepEqual(ids(r), ['DESIGN-SCHEMA pignolo.motion.durationMs.fast', 'DESIGN-TOKEN-LIKE pignolo.motion.durationMs.fast']);
  assert.equal(r.reject, true);
  r = check(edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      primary: "#7FB2F0"\n'));
  assert.ok(ids(r).includes('DESIGN-TOKEN-LIKE pignolo.themes.dark.primary'), ids(r).join());
  r = check(edit('    widthPx: 2\n', '    widthPx: 2\n    fontSize: 3\n'));
  assert.ok(ids(r).includes('DESIGN-TOKEN-LIKE pignolo.focus.fontSize'), ids(r).join());
  r = check(edit('  schema: 1\n', '  schema: 1\n  rejections:\n    - id: R-001\n      date: 2026-09-28\n      pattern: { kind: text, value: "12px gap" }\n      note: x\n'));
  assert.deepEqual(ids(r), ['DESIGN-SCHEMA pignolo.rejections.0.pattern.value']);
});

test('dark theme: detected in CSS without themes.dark, or incomplete, is THEME-03 alto', () => {
  let r = check(VALID, { darkInCss: true });
  assert.deepEqual(ids(r), ['THEME-03 pignolo.themes.dark']);
  assert.equal(r.findings[0].severity, 'alto');
  assert.equal(r.reject, false);
  const partial = edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      primary: "oklch(0.72 0.14 250)"\n      surface: "oklch(0.2 0 0)"\n');
  r = check(partial);
  assert.deepEqual(ids(r), ['THEME-03 pignolo.themes.dark.on-primary', 'THEME-03 pignolo.themes.dark.on-surface', 'THEME-03 pignolo.themes.dark.outline']);
  const full = edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      primary: "oklch(0.72 0.14 250)"\n      on-primary: "oklch(0.18 0.03 250)"\n      surface: "oklch(0.2 0 0)"\n      on-surface: "rgb(240 240 240)"\n      outline: "oklch(0.62 0 0)"\n');
  assert.deepEqual(check(full, { darkInCss: true }).findings, []);
  r = check(edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      nope: "oklch(0.5 0 0)"\n'));
  assert.ok(ids(r).includes('DESIGN-SCHEMA pignolo.themes.dark.nope'), ids(r).join());
});

test('missing mandatory content is alto and proposes completing, without rejecting', () => {
  const cases = [
    [edit('  platform: both\n', ''), 'DESIGN-CONTENT pignolo.platform'],
    [edit('### Hierarchy and reading order\n', '### Notes\n'), 'DESIGN-CONTENT body'],
    [edit('  button-primary-hover:\n    backgroundColor: "{colors.primary}"\n    textColor: "{colors.on-primary}"\n', ''), 'DESIGN-CONTENT components.button-primary-hover'],
    [edit('  on-surface: "#1A1A1A"\n', ''), 'DESIGN-CONTENT colors.on-surface'],
    [edit('  blue-600: "#0B6BCB"\n  primary: "{colors.blue-600}"\n', '  primary: "#0B6BCB"\n'), 'DESIGN-CONTENT colors'],
    [edit('    draggedOpacity: 0.16\n', ''), 'DESIGN-CONTENT pignolo.states.draggedOpacity'],
  ];
  for (const [text, want] of cases) {
    const r = check(text);
    assert.deepEqual(ids(r), [want]);
    assert.equal(r.findings[0].severity, 'alto');
    assert.equal(r.reject, false);
  }
  const omitted = edit('rounded:\n  md: 8px\n', 'omitted:\n  - rounded\n').replace('    rounded: "{rounded.md}"\n', '');
  assert.deepEqual(check(omitted).findings, []);
});

test('semantic aliases: accent and text are read as primary and on-surface, and the finding names the alias', () => {
  const aliased = edit('  primary: "{colors.blue-600}"\n', '  accent: "{colors.blue-600}"\n')
    .replace('  on-surface: "#1A1A1A"\n', '  text: "#1A1A1A"\n')
    .replace(/\{colors\.primary\}/g, '{colors.accent}');
  const r = check(aliased);
  assert.deepEqual(r.findings.map((f) => [f.id, f.path, f.severity, f.rejects]), [
    ['DESIGN-ALIAS', 'colors.accent', 'detalle', false],
    ['DESIGN-ALIAS', 'colors.text', 'detalle', false],
  ]);
  assert.equal(r.findings[0].message, 'colors.accent read as primary (default alias)');
  assert.equal(r.status, 'valid');
  const dark = check(aliased.replace('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      text: "oklch(0.95 0 0)"\n      on-primary: "oklch(0.2 0 0)"\n      surface: "oklch(0.2 0 0)"\n      outline: "oklch(0.6 0 0)"\n'));
  assert.deepEqual(ids(dark), ['DESIGN-ALIAS colors.accent', 'DESIGN-ALIAS colors.text', 'THEME-03 pignolo.themes.dark.accent']);
  const both = check(edit('  on-surface: "#1A1A1A"\n', '  on-surface: "#1A1A1A"\n  text: "#333333"\n'));
  assert.deepEqual(both.findings, [], 'an MD3 name that exists wins: text stays a primitive');
});

test('pignolo.aliases completes the default map and is part of the closed schema', () => {
  const custom = edit('  on-surface: "#1A1A1A"\n', '  brand-ink: "#1A1A1A"\n');
  assert.deepEqual(ids(check(custom)), ['DESIGN-CONTENT colors.on-surface']);
  const r = check(custom.replace('  schema: 1\n', '  schema: 1\n  aliases:\n    brand-ink: on-surface\n'));
  assert.deepEqual(r.findings.map((f) => f.message), ['colors.brand-ink read as on-surface (pignolo.aliases)']);
  assert.deepEqual(ids(check(edit('  schema: 1\n', '  schema: 1\n  aliases:\n    ink: blue-600\n'))), ['DESIGN-SCHEMA pignolo.aliases.ink']);
  assert.deepEqual(ids(check(edit('  schema: 1\n', '  schema: 1\n  aliases:\n    primary: surface\n'))), ['DESIGN-SCHEMA pignolo.aliases.primary']);
});

test('the README documents every default alias', () => {
  const readme = fs.readFileSync(path.join(PLUGIN_ROOT, 'README.md'), 'utf8');
  for (const [from, to] of Object.entries(DEFAULT_ALIASES)) assert.ok(readme.includes(`\`${from}\` → \`${to}\``), `${from} → ${to}`);
});

test('an unquoted hex is empty for YAML and is reported on its line (Review Focus 3)', () => {
  const r = check(edit('  on-primary: "#FFFFFF"\n', '  on-primary: #FFFFFF\n'));
  assert.deepEqual(r.findings.map((f) => [f.id, f.path, f.line, f.severity]), [['DESIGN-FORMAT', 'colors.on-primary', 8, 'alto']]);
  assert.match(r.findings[0].message, /comment/);
});

test('broken references are alto', () => {
  const r = check(edit('    rounded: "{rounded.md}"\n', '    rounded: "{rounded.lg}"\n'));
  assert.deepEqual(ids(r), ['DESIGN-REF components.button-primary.rounded']);
  assert.equal(r.reject, false);
});

test('an error in one key is reported and the rest is still validated', () => {
  const r = check(edit('  outline: "#8F8F8F"\n', '  outline: a: b\n').replace('  register: product\n', ''));
  assert.deepEqual(ids(r), ['DESIGN-YAML colors.outline', 'DESIGN-CONTENT pignolo.register']);
  assert.equal(r.reject, true);
});

test('CLI: exit 0 valid, 1 with findings, 2 unverified; --project detects dark CSS', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  fs.writeFileSync(file, VALID);
  let out = runScript('design-md.mjs', ['validate', '--file', file]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.status, 'valid');
  writeTree(dir, { 'src/app.css': ':root { --x: #fff }\n.dark { --x: #000 }\n' });
  out = runScript('design-md.mjs', ['validate', '--file', file, '--project', dir]);
  assert.equal(out.status, 1);
  assert.deepEqual(out.json.findings.map((f) => f.id), ['THEME-03']);
  fs.writeFileSync(file, edit('  md: 8px\n', '  md: *r\n'));
  out = runScript('design-md.mjs', ['validate', '--file', file]);
  assert.equal(out.status, 2);
  assert.equal(out.json.status, 'unverified');
  out = runScript('design-md.mjs', ['validate', '--file', path.join(dir, 'missing.md')]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /no se pudo leer/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `catalog.test.mjs` no carga (`ENOENT … catalog/rules.json`) y `design-validate.test.mjs` tampoco (`Cannot find module …/lib/design-doc.mjs`) (`tests 57`, `pass 55`, `fail 2`).

- [ ] **Step 3: Implementación mínima**

Los criterios de A11Y-04, A11Y-16, COLOR-02, DEPTH-01 y LAYOUT-04 siguen el texto de §5.4 del spec vigente; sus checkers son del hito 2.

`plugins/pignolo-ui/catalog/rules.json`:
```json
{
  "catalogVersion": "0.1.0",
  "note": "Seed of milestone 1: the 25 v1 checker rules of spec §5.4 plus THEME-03. Milestone 2 completes the catalog.",
  "rules": [
    { "id": "A11Y-01", "criterion": "<html lang> present and a valid BCP 47 tag", "class": "script", "level": "document", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 3.1.1 (A)" },
    { "id": "A11Y-02", "criterion": "<title> present and not empty", "class": "script", "level": "document", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 2.4.2 (A)" },
    { "id": "A11Y-04", "criterion": "Static accessible name for button, a, input and [role=button]; icon-only buttons have a name. Roles that do not take their name from content (combobox, listbox, textbox, searchbox, slider, spinbutton...) need aria-label, aria-labelledby or an associated label", "class": "script", "level": "element", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 4.1.2 (A)" },
    { "id": "A11Y-05", "criterion": "Exactly one main landmark", "class": "script", "level": "document", "platform": "D+M", "severity": "alto", "floor": false, "acceptsIntentional": false, "source": "WAI-ARIA landmarks (good practice, not WCAG)" },
    { "id": "A11Y-16", "criterion": "input, select and textarea have a label (aria-hidden ones are skipped); a placeholder alone is a failure, stricter than axe and declared", "class": "script", "level": "element", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 1.3.1 / 4.1.2 (A)" },
    { "id": "A11Y-26", "criterion": "img has an alt attribute; svg[role=img] has a name (presence only)", "class": "script", "level": "element", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 1.1.1 (A)" },
    { "id": "A11Y-28", "criterion": "Viewport without user-scalable=no or maximum-scale below 2", "class": "script", "level": "document", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 1.4.4 (AA)" },
    { "id": "A11Y-39", "criterion": "No focusable element inside aria-hidden=\"true\"; never on body", "class": "script", "level": "element", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 4.1.2 (A)" },
    { "id": "COLOR-03", "criterion": "Text contrast between token pairs: 4.5:1, or 3:1 for large text; alpha composited; both themes", "class": "script", "level": "style", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 1.4.3 (AA)" },
    { "id": "COLOR-04", "criterion": "Non-text contrast (functional border, focus ring) of 3:1", "class": "script", "level": "style", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 1.4.11 (AA)" },
    { "id": "STATE-04", "criterion": "outline: none/0 without a :focus-visible that draws an indicator", "class": "script", "level": "style", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "WCAG 2.2 SC 2.4.7 (AA)" },
    { "id": "MOTION-03", "criterion": "Animation or transform transition without @media (prefers-reduced-motion: reduce)", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": false, "source": "WCAG 2.2 SC 2.3.3 (AAA); Apple HIG Motion; MDN prefers-reduced-motion" },
    { "id": "MOTION-04", "criterion": "transition: all", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "pignolo-ui research (performance and intent)" },
    { "id": "COLOR-02", "criterion": "Color literals outside the token source, or a token of another family in a color property", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "Apple HIG Color (avoid hard-coded values)" },
    { "id": "DEPTH-01", "criterion": "Literal box-shadow outside tokens, or a token that is not an elevation token", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "Fluent 2 elevation" },
    { "id": "LAYOUT-04", "criterion": "Literal border-radius outside tokens, or a token that is not a radius token (for example var(--space-2))", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "Material 3 shape scale" },
    { "id": "DRIFT-01", "criterion": "DESIGN.md and CSS differ (through cssVars)", "class": "script", "level": "style", "platform": "D+M", "severity": "alto", "floor": false, "acceptsIntentional": false, "source": "pignolo-ui spec §4.5" },
    { "id": "THEME-01", "criterion": "Primary, surface, radius or font are framework defaults and not declared", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "pignolo-ui research (default-kit look)" },
    { "id": "THEME-02", "criterion": "shadcn: at least 80% of color variables match a published baseColor", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "shadcn/ui themes" },
    { "id": "THEME-03", "criterion": "Declared dark theme is complete: every semantic color defined in both themes", "class": "script", "level": "style", "platform": "D+M", "severity": "alto", "floor": false, "acceptsIntentional": false, "source": "pignolo-ui spec §4.3 (A-16)" },
    { "id": "COLOR-11", "criterion": "Factory accent: primary with OKLCH hue 265-310 and chroma >= 0.12, or a blue to violet gradient", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "pignolo-ui research (AI-default traits)" },
    { "id": "COLOR-12", "criterion": "Text with background-clip: text over a gradient (presence; contrast is reported as COLOR-03)", "class": "script", "level": "style", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "WCAG 2.2 SC 1.4.3 (contrast part only)" },
    { "id": "ICON-01", "criterion": "Emoji at the start of button, navigation link, h1-h6 or li text", "class": "script", "level": "element", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "pignolo-ui research (AI-default traits)" },
    { "id": "CONTENT-01", "criterion": "Markers (data-sample or ‹…›) block when taken to real code; filler heuristics are medio", "class": "script", "level": "element", "platform": "D+M", "severity": "bloquea", "floor": true, "acceptsIntentional": false, "source": "pignolo-ui spec §7.1" },
    { "id": "COPY-01", "criterion": "Marketing filler phrases (es/en); other lang is unverified", "class": "script", "level": "element", "platform": "D+M", "severity": "detalle", "floor": false, "acceptsIntentional": true, "source": "pignolo-ui research (copy)" },
    { "id": "META-01", "criterion": "Template title, default favicon, generator attribution", "class": "script", "level": "document", "platform": "D+M", "severity": "medio", "floor": false, "acceptsIntentional": true, "source": "pignolo-ui research (default-kit look)" }
  ]
}
```

`plugins/pignolo-ui/lib/design-doc.mjs`:
```js
// DESIGN.md: frontmatter split and own validator (spec §4.2, §4.3, §5.4 "Validador").
// Google Labs format pinned to 0.4.0 plus the closed `pignolo:` schema, version 1.
//
// splitFrontmatter(text) -> { ok, yaml, yamlLine, body, bodyLine, eol } | { ok: false, reason }
// validateDesign(text, { catalog, darkInCss }) ->
//   { status: 'valid'|'invalid'|'unverified', reason, reject, findings, data }
// Finding: { id, severity, path, line, message, rejects }. `rejects: true` means the file
// must not be written as is (closed schema, intentional on the floor, token-like values).
// DESIGN-ALIAS findings are `detalle`: they say which alias was read and never make the
// status invalid.
import { parseYaml, locate } from './yaml-subset.mjs';
import { parseColor } from './color.mjs';

export const MD3_FAMILIES = new Set(['primary', 'secondary', 'tertiary', 'error', 'surface', 'background', 'outline']);
const REQUIRED_SEMANTIC = ['primary', 'on-primary', 'surface', 'on-surface'];
const CONTROL_PREFIXES = ['button', 'input', 'select', 'checkbox', 'radio', 'switch', 'link', 'tab', 'chip', 'toggle', 'textarea'];
const STATE_SUFFIX = /-(hover|pressed|focus|disabled|active|selected|dragged)$/;
const TYPOGRAPHY_PROPS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFeature', 'fontVariation']);
const COMPONENT_PROPS = new Set(['backgroundColor', 'textColor', 'typography', 'rounded', 'padding', 'size', 'height', 'width']);
// Same heuristics as token-like-ignored in @google/design.md 0.4.0.
const TOKEN_LIKE_KEYS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']);
const HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const DIMENSION_RE = /^-?\d*\.?\d+[a-zA-Z%]+$/;
const TOKEN_SECTIONS = ['colors', 'typography', 'rounded', 'spacing', 'components'];
const HIERARCHY_HEADING = /^#{2,6}\s+.*(hierarch|reading order|jerarqu|orden de lectura)/im;

// Official vocabulary: on-/inverse- prefixes and -container/-fixed/-dim... suffixes.
export function colorFamily(name) {
  return name.replace(/^on-/, '').replace(/^inverse-/, '').replace(/^on-/, '')
    .replace(/-container.*$/, '').replace(/-fixed.*$/, '').replace(/-(dim|bright|tint|variant)$/, '');
}

export const isSemanticColor = (name) => MD3_FAMILIES.has(colorFamily(name));

// Reading a user's DESIGN.md does not demand literal MD3 names (spec §4.2): these aliases,
// completed or overridden by pignolo.aliases, map common project names to MD3. What
// pignolo-ui generates keeps MD3 names. The README documents this map (a test checks it).
export const DEFAULT_ALIASES = Object.freeze({
  accent: 'primary',
  brand: 'primary',
  'on-accent': 'on-primary',
  'accent-foreground': 'on-primary',
  'primary-foreground': 'on-primary',
  text: 'on-surface',
  label: 'on-surface',
  foreground: 'on-surface',
  fg: 'on-surface',
  bg: 'background',
  card: 'surface',
  'card-foreground': 'on-surface',
  'muted-foreground': 'on-surface-variant',
  'text-muted': 'on-surface-variant',
  border: 'outline-variant',
  danger: 'error',
  destructive: 'error',
  'on-danger': 'on-error',
  'destructive-foreground': 'on-error',
});

// name -> { as, source } for the colors read through an alias. An alias is taken only when
// its MD3 target is not defined itself and no earlier name took it.
export function resolveAliases(colors, custom) {
  const map = { ...DEFAULT_ALIASES, ...(custom !== null && typeof custom === 'object' && !Array.isArray(custom) ? custom : {}) };
  const out = new Map();
  const taken = new Set();
  for (const name of Object.keys(colors)) {
    if (isSemanticColor(name) || !Object.prototype.hasOwnProperty.call(map, name)) continue;
    const target = map[name];
    if (typeof target !== 'string' || !isSemanticColor(target) || Object.prototype.hasOwnProperty.call(colors, target) || taken.has(target)) continue;
    taken.add(target);
    const source = custom && Object.prototype.hasOwnProperty.call(custom, name) ? 'pignolo.aliases' : 'default alias';
    out.set(name, { as: target, source });
  }
  return out;
}

export function splitFrontmatter(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split('\n');
  if (lines[0].replace(/\r$/, '').trimEnd() !== '---') return { ok: false, reason: 'no YAML frontmatter (first line must be ---)' };
  const end = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '').trimEnd() === '---');
  if (end < 0) return { ok: false, reason: 'frontmatter is not closed with ---' };
  return {
    ok: true,
    yaml: lines.slice(1, end).join('\n'),
    yamlLine: 2,
    body: lines.slice(end + 1).join('\n'),
    bodyLine: end + 2,
    eol,
  };
}

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (obj, k) => isMap(obj) && Object.prototype.hasOwnProperty.call(obj, k);

// ---- schema nodes for pignolo: -----------------------------------------------------------

const V = (check) => ({ kind: 'value', check });
const M = (keys, required = []) => ({ kind: 'map', keys, required });
const FREE = (keyCheck, value) => ({ kind: 'free', keyCheck, value });
const L = (item) => ({ kind: 'list', item });

const num = (min, max) => (v) => (typeof v === 'number' && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)
  ? null : `must be a number${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` and <= ${max}` : ''}`);
const oneOf = (...vals) => (v) => (vals.includes(v) ? null : `must be one of: ${vals.join(', ')}`);
const bool = (v) => (typeof v === 'boolean' ? null : 'must be true or false');
const str = (v) => (typeof v === 'string' && v.trim() ? null : 'must be a non-empty string');
const colorRef = (v, ctx) => (typeof v === 'string' && /^\{colors\.[^{}]+\}$/.test(v) && has(ctx.data.colors, v.slice(8, -1))
  ? null : 'must reference an existing color as {colors.name}');
const darkColor = (v) => (typeof v === 'string' && /^(oklch|rgba?)\(/i.test(v.trim()) && parseColor(v).ok ? null : 'must be an OKLCH or rgb() color');
const shadow = (v) => (v === 'none' || (typeof v === 'string' && v.trim() && !/[;{}]/.test(v)) ? null : 'must be a full box-shadow string or "none"');
const bezier = (v) => (typeof v === 'string' && /^cubic-bezier\(\s*-?[\d.]+\s*(,\s*-?[\d.]+\s*){3}\)$/.test(v) ? null : 'must be cubic-bezier(x1, y1, x2, y2)');
const tokenPath = (v, ctx) => (typeof v === 'string' && ctx.hasToken(v) ? null : 'must name an existing token (colors.x, rounded.x...)');
const cssVarName = (v) => (typeof v === 'string' && /^--[A-Za-z0-9_-]+$/.test(v) ? null : 'must be a CSS variable name (--x)');
const mapOrNull = (v) => (v === null || isMap(v) ? null : 'must be a map or null');
const anyList = (v) => (Array.isArray(v) ? null : 'must be a list');
const patternValue = (v) => {
  if (typeof v !== 'string' || !v.trim()) return 'must be a non-empty string';
  if (/^#[0-9a-fA-F]{3,8}\b/.test(v) || /^-?\d*\.?\d+[a-zA-Z%]+(\s|$)/.test(v)) return 'must not start with a hex color or a dimension (write a regex or OKLCH)';
  return null;
};

const shadowLevels = Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [`level${n}`, V(shadow)]));
const STATES = ['hoverOpacity', 'focusOpacity', 'pressedOpacity', 'draggedOpacity', 'disabledContentOpacity', 'disabledContainerOpacity'];

export const PIGNOLO_SCHEMA = M({
  schema: V((v) => (v === 1 ? null : 'must be 1')),
  platform: V(oneOf('desktop', 'mobile', 'both')),
  register: V(oneOf('product', 'brand')),
  themes: M({ dark: FREE((k, ctx) => (has(ctx.data.colors, k) ? null : 'must be a color defined in colors'), V(darkColor)) }),
  elevation: M(shadowLevels),
  states: M(Object.fromEntries(STATES.map((k) => [k, V(num(0, 1))]))),
  focus: M({ color: V(colorRef), widthPx: V(num(0)), offsetPx: V(num()) }),
  motion: M({
    durationMs: M(Object.fromEntries(['fast', 'base', 'slow', 'slower'].map((k) => [k, V(num(0))]))),
    easing: M(Object.fromEntries(['standard', 'decelerate', 'accelerate'].map((k) => [k, V(bezier)]))),
    reducedMotion: V(oneOf('fade-or-none', 'none')),
  }),
  borders: M({ subtle: V(colorRef), strong: V(colorRef), widthPx: V(num(0)) }),
  targets: M({ minPx: V(num(0)), recommendedPx: V(num(0)) }),
  aliases: FREE((k) => (isSemanticColor(k) ? 'is already an MD3 semantic name' : null),
    V((v) => (typeof v === 'string' && isSemanticColor(v) ? null : 'must be an MD3 semantic color name (primary, on-surface...)'))),
  cssVars: FREE((k, ctx) => (ctx.hasToken(k) ? null : 'must name an existing token (colors.x, rounded.x...)'), V(cssVarName)),
  extracted: L(V(tokenPath)),
  intentional: L(M({ id: V(str), why: V(str) }, ['id', 'why'])),
  rejections: L(M({
    id: V((v) => (typeof v === 'string' && /^R-\d{3}$/.test(v) ? null : 'must be R-nnn')),
    date: V((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'must be a YYYY-MM-DD date')),
    rule: V(str),
    pattern: M({ kind: V(oneOf('selector', 'property', 'text')), value: V(patternValue) }, ['kind', 'value']),
    note: V(str),
  }, ['id', 'date', 'note'])),
  web: M({
    public: V(bool),
    indexable: V(bool),
    locales: L(V(str)),
    aiCrawlers: V(mapOrNull),
    llmsTxt: V(bool),
    structuredData: V(anyList),
    conversion: V(mapOrNull),
  }),
}, ['schema']);

function walkSchema(node, value, p, ctx) {
  if (node.kind === 'value') {
    const err = node.check(value, ctx);
    if (err) ctx.add('DESIGN-SCHEMA', p, `${p.join('.')} ${err}`, { rejects: true });
    return;
  }
  if (node.kind === 'list') {
    if (!Array.isArray(value)) { ctx.add('DESIGN-SCHEMA', p, `${p.join('.')} must be a list`, { rejects: true }); return; }
    value.forEach((item, i) => walkSchema(node.item, item, [...p, i], ctx));
    return;
  }
  if (!isMap(value)) { ctx.add('DESIGN-SCHEMA', p, `${p.join('.')} must be a map`, { rejects: true }); return; }
  if (node.kind === 'free') {
    for (const [k, v] of Object.entries(value)) {
      const err = node.keyCheck(k, ctx);
      if (err) ctx.add('DESIGN-SCHEMA', [...p, k], `${[...p, k].join('.')}: key ${err}`, { rejects: true });
      else walkSchema(node.value, v, [...p, k], ctx);
    }
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (!has(node.keys, k)) ctx.add('DESIGN-SCHEMA', [...p, k], `${[...p, k].join('.')} is not a key of the pignolo: schema v1`, { rejects: true });
    else walkSchema(node.keys[k], v, [...p, k], ctx);
  }
  for (const k of node.required) {
    if (!has(value, k)) ctx.add('DESIGN-SCHEMA', [...p, k], `${[...p, k].join('.')} is required`, { rejects: true });
  }
}

function walkTokenLike(value, p, ctx) {
  if (Array.isArray(value)) { value.forEach((v, i) => walkTokenLike(v, [...p, i], ctx)); return; }
  if (isMap(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (TOKEN_LIKE_KEYS.has(k)) ctx.add('DESIGN-TOKEN-LIKE', [...p, k], `${[...p, k].join('.')}: typography keys inside pignolo: trigger token-like-ignored`, { rejects: true });
      walkTokenLike(v, [...p, k], ctx);
    }
    return;
  }
  if (typeof value === 'string' && value.length <= 64 && (HEX_RE.test(value) || DIMENSION_RE.test(value))) {
    ctx.add('DESIGN-TOKEN-LIKE', p, `${p.join('.')}: "${value}" is a hex color or a dimension; the official linter warns token-like-ignored (use a number with the unit in the key, OKLCH or {colors.x})`, { rejects: true });
  }
}

function omittedSections(data) {
  const list = Array.isArray(data.omitted) ? data.omitted : [];
  return new Set(list.map((o) => (typeof o === 'string' ? o : isMap(o) ? o.section : null)).filter(Boolean).map((s) => String(s).toLowerCase()));
}

export function validateDesign(text, { catalog, darkInCss = false } = {}) {
  const findings = [];
  const fm = splitFrontmatter(text);
  if (!fm.ok) {
    findings.push({ id: 'DESIGN-FRONTMATTER', severity: 'alto', path: '', line: 1, message: fm.reason, rejects: true });
    return { status: 'invalid', reason: null, reject: true, findings, data: null };
  }
  const parsed = parseYaml(fm.yaml);
  if (!parsed.supported) {
    return { status: 'unverified', reason: `YAML no soportado: no validado (${parsed.reason}, line ${parsed.line + fm.yamlLine - 1})`, reject: false, findings, data: null };
  }
  const data = isMap(parsed.value) ? parsed.value : {};
  const lineFor = (p) => {
    for (let i = p.length; i > 0; i--) {
      const loc = locate(parsed, p.slice(0, i));
      if (loc) return loc.line + fm.yamlLine - 1;
    }
    return fm.yamlLine;
  };
  const hasToken = (tp) => {
    const dot = tp.indexOf('.');
    return dot > 0 && TOKEN_SECTIONS.includes(tp.slice(0, dot)) && has(data[tp.slice(0, dot)], tp.slice(dot + 1));
  };
  const ctx = {
    data,
    hasToken,
    add(id, p, message, { severity = 'alto', rejects = false } = {}) {
      findings.push({ id, severity, path: p.join('.'), line: lineFor(p), message, rejects });
    },
  };

  for (const e of parsed.errors) {
    findings.push({ id: 'DESIGN-YAML', severity: 'alto', path: e.path.join('.'), line: e.line + fm.yamlLine - 1, message: e.message, rejects: true });
  }

  // official sections: shapes the linter and the checker rely on
  if (data.colors !== undefined && !isMap(data.colors)) ctx.add('DESIGN-FORMAT', ['colors'], 'colors must be a map');
  for (const [name, v] of Object.entries(isMap(data.colors) ? data.colors : {})) {
    if (v === null) ctx.add('DESIGN-FORMAT', ['colors', name], `colors.${name} is empty: an unquoted # starts a YAML comment, quote the color`);
    else if (typeof v !== 'string') ctx.add('DESIGN-FORMAT', ['colors', name], `colors.${name} must be a quoted color string`);
  }
  for (const [name, v] of Object.entries(isMap(data.typography) ? data.typography : {})) {
    if (!isMap(v)) { ctx.add('DESIGN-FORMAT', ['typography', name], `typography.${name} must be a map`); continue; }
    for (const k of Object.keys(v)) if (!TYPOGRAPHY_PROPS.has(k)) ctx.add('DESIGN-FORMAT', ['typography', name, k], `typography.${name}.${k} is not a 0.4.0 property (extensions go under pignolo:)`, { severity: 'medio' });
  }
  for (const [name, v] of Object.entries(isMap(data.components) ? data.components : {})) {
    if (!isMap(v)) { ctx.add('DESIGN-FORMAT', ['components', name], `components.${name} must be a map`); continue; }
    for (const k of Object.keys(v)) if (!COMPONENT_PROPS.has(k)) ctx.add('DESIGN-FORMAT', ['components', name, k], `components.${name}.${k} is not a 0.4.0 sub-token (extensions go under pignolo:)`, { severity: 'medio' });
  }

  // references in the official sections
  const walkRefs = (v, p) => {
    if (isMap(v)) { for (const [k, x] of Object.entries(v)) walkRefs(x, [...p, k]); return; }
    if (typeof v !== 'string') return;
    const m = /^\{([^{}]+)\}$/.exec(v.trim());
    if (m && !hasToken(m[1])) ctx.add('DESIGN-REF', p, `${p.join('.')} references ${v}, which does not exist`);
  };
  for (const section of TOKEN_SECTIONS) walkRefs(data[section], [section]);

  // pignolo: closed schema, intentional, token-like
  const pig = data.pignolo;
  if (pig !== undefined) {
    walkSchema(PIGNOLO_SCHEMA, pig, ['pignolo'], ctx);
    const rules = new Map(((catalog && catalog.rules) || []).map((r) => [r.id, r]));
    (Array.isArray(pig && pig.intentional) ? pig.intentional : []).forEach((item, i) => {
      if (!isMap(item) || typeof item.id !== 'string') return;
      const rule = rules.get(item.id);
      if (!rule) ctx.add('DESIGN-INTENTIONAL', ['pignolo', 'intentional', i, 'id'], `${item.id} is not a rule of the catalog`, { rejects: true });
      else if (!rule.acceptsIntentional) ctx.add('DESIGN-INTENTIONAL', ['pignolo', 'intentional', i, 'id'], `${item.id} does not accept intentional (floor or fixed rule)`, { rejects: true });
    });
    walkTokenLike(pig, ['pignolo'], ctx);
  }

  // semantic aliases (spec §4.2): informative, the finding names the alias it took
  const colors = isMap(data.colors) ? data.colors : {};
  const aliases = resolveAliases(colors, isMap(pig) ? pig.aliases : undefined);
  for (const [name, a] of aliases) ctx.add('DESIGN-ALIAS', ['colors', name], `colors.${name} read as ${a.as} (${a.source})`, { severity: 'detalle' });
  const semanticOf = (name) => (isSemanticColor(name) ? name : aliases.has(name) ? aliases.get(name).as : null);

  // mandatory content (spec §4.2): alto, proposed as a diff, never rejected
  const content = (p, message) => ctx.add('DESIGN-CONTENT', p, message);
  const omitted = omittedSections(data);
  if (!omitted.has('colors')) {
    const present = new Set(Object.keys(colors).map(semanticOf));
    for (const name of REQUIRED_SEMANTIC) if (!present.has(name)) content(['colors', name], `semantic color ${name} is missing`);
    if (!Object.keys(colors).some((n) => semanticOf(n) === null)) content(['colors'], 'no primitive color tokens (for example blue-600) under the semantic ones');
  }
  for (const section of ['typography', 'rounded', 'spacing']) {
    if (!omitted.has(section) && !(isMap(data[section]) && Object.keys(data[section]).length)) content([section], `${section} scale is missing`);
  }
  const components = isMap(data.components) ? data.components : {};
  for (const name of Object.keys(components)) {
    const isControl = CONTROL_PREFIXES.some((pre) => name === pre || name.startsWith(`${pre}-`));
    if (isControl && !STATE_SUFFIX.test(name) && !has(components, `${name}-hover`)) content(['components', `${name}-hover`], `control ${name} has no hover state variant`);
  }
  if (!HIERARCHY_HEADING.test(fm.body)) content(['body'], 'no prose section on hierarchy and reading order');
  if (!isMap(pig)) {
    content(['pignolo'], 'pignolo: section is missing (platform, register, elevation, motion, states, focus)');
  } else {
    for (const k of ['platform', 'register']) if (!has(pig, k)) content(['pignolo', k], `pignolo.${k} is not declared`);
    if (!(isMap(pig.elevation) && Object.keys(pig.elevation).length)) content(['pignolo', 'elevation'], 'elevation scale is missing');
    if (!(isMap(pig.motion) && isMap(pig.motion.durationMs) && Object.keys(pig.motion.durationMs).length)) content(['pignolo', 'motion', 'durationMs'], 'motion durations are missing');
    if (!(isMap(pig.motion) && isMap(pig.motion.easing) && Object.keys(pig.motion.easing).length)) content(['pignolo', 'motion', 'easing'], 'motion easing is missing');
    if (!isMap(pig.states)) content(['pignolo', 'states'], 'control state opacities are missing');
    else for (const k of STATES) if (!has(pig.states, k)) content(['pignolo', 'states', k], `pignolo.states.${k} is missing`);
    if (!isMap(pig.focus)) content(['pignolo', 'focus'], 'focus indicator is missing');
  }

  // THEME-03 (A-16): a declared dark theme is complete
  const dark = isMap(pig) && isMap(pig.themes) ? pig.themes.dark : undefined;
  if (isMap(dark)) {
    for (const name of Object.keys(colors)) {
      if (semanticOf(name) !== null && !has(dark, name)) ctx.add('THEME-03', ['pignolo', 'themes', 'dark', name], `dark theme does not define ${name}`);
    }
  } else if (darkInCss) {
    ctx.add('THEME-03', ['pignolo', 'themes', 'dark'], 'the CSS has a dark theme but DESIGN.md does not declare pignolo.themes.dark');
  }

  const reject = findings.some((f) => f.rejects);
  // `detalle` findings (aliases) inform and never make the file invalid
  const status = findings.some((f) => f.severity !== 'detalle') ? 'invalid' : 'valid';
  return { status, reason: null, reject, findings, data };
}
```

`plugins/pignolo-ui/scripts/design-md.mjs`:
```js
// design-md.mjs: validate | extract | patch (spec §4). The skill passes every path as an
// argument (${CLAUDE_PLUGIN_ROOT} and userConfig never reach the Bash environment).
// Prints one JSON object on stdout. Exit codes:
//   validate: 0 valid, 1 findings, 2 not verified (unsupported YAML) or own error
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDesign } from '../lib/design-doc.mjs';
import { readTokenSources } from '../lib/token-sources.mjs';

const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

class UsageError extends Error {}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return { cmd, opts };
}

function readText(file, what) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new UsageError(`no se pudo leer ${what} ${file} (${e.code || e.message})`);
  }
}

function loadCatalog(opts) {
  const file = opts.catalog || path.join(PLUGIN_ROOT, 'catalog', 'rules.json');
  return JSON.parse(readText(file, 'el catálogo'));
}

function cmdValidate(opts) {
  if (!opts.file) throw new UsageError('falta --file <DESIGN.md>');
  const text = readText(opts.file, 'el archivo');
  const darkInCss = opts.project ? readTokenSources(opts.project).darkDetected : false;
  const r = validateDesign(text, { catalog: loadCatalog(opts), darkInCss });
  const { data, ...out } = r;
  return { out: { ...out, darkInCss }, code: r.status === 'valid' ? 0 : r.status === 'invalid' ? 1 : 2 };
}

const COMMANDS = { validate: cmdValidate };

export function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const run = COMMANDS[cmd];
    if (!run) throw new UsageError(`uso: design-md.mjs <${Object.keys(COMMANDS).join('|')}> [opciones]`);
    const { out, code } = run(opts);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  } catch (e) {
    process.stderr.write(`design-md: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
```

En `plugins/pignolo-ui/README.md`, justo después de:
```markdown
- Claude Code ≥ 2.1.271 (`userConfig` con `options`).
```
agregar:
```markdown

## Alias de nombres semánticos

Lo que genera pignolo-ui usa los nombres semánticos de Material 3 (`primary`, `on-surface`…). Al **leer** un `DESIGN.md` existente, estos nombres cuentan como su equivalente MD3, siempre que el nombre MD3 no esté definido también; `pignolo.aliases` completa o pisa este mapa. Cada alias usado sale como hallazgo `DESIGN-ALIAS` (`detalle`).

- `accent` → `primary`, `brand` → `primary`
- `on-accent` → `on-primary`, `accent-foreground` → `on-primary`, `primary-foreground` → `on-primary`
- `text` → `on-surface`, `label` → `on-surface`, `foreground` → `on-surface`, `fg` → `on-surface`, `card-foreground` → `on-surface`
- `bg` → `background`, `card` → `surface`
- `muted-foreground` → `on-surface-variant`, `text-muted` → `on-surface-variant`
- `border` → `outline-variant`
- `danger` → `error`, `destructive` → `error`, `on-danger` → `on-error`, `destructive-foreground` → `on-error`
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 77`, `pass 77`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 77).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `walkSchema`, dejar pasar las claves desconocidas (`if (has(node.keys, k)) walkSchema(…)` sin el `add`) | `the pignolo: schema is closed: unknown keys and wrong values reject` |
| En `validateDesign`, cambiar `else if (!rule.acceptsIntentional) ctx.add(` por `else if (false) ctx.add(` | `intentional only accepts rules with acceptsIntentional: floor and THEME-03 reject` |
| En `walkTokenLike`, mirar solo `HEX_RE` (sin `DIMENSION_RE`) | `hex or dimensions inside pignolo: would be token-like-ignored and reject` |
| Cambiar `} else if (darkInCss) {` por `} else if (false) {` | `dark theme: detected in CSS without themes.dark, or incomplete, is THEME-03 alto` y `CLI: exit 0 valid, 1 with findings, 2 unverified; --project detects dark CSS` |
| En `splitFrontmatter`, no quitar el BOM (`const src = String(text);`) | `a BOM and CRLF line endings validate the same (Review Focus 2)` |
| Borrar la línea que reporta `colors.<nombre> is empty: an unquoted # starts a YAML comment…` | `an unquoted hex is empty for YAML and is reported on its line (Review Focus 3)` |
| En `rules.json`, poner `"acceptsIntentional": true` en A11Y-01 | `no floor rule accepts intentional, and THEME-03 does not either` y `intentional only accepts rules with acceptsIntentional: floor and THEME-03 reject` |
| Fijar `const aliases = new Map();` en lugar de `resolveAliases(…)` | `semantic aliases: accent and text are read as primary and on-surface, and the finding names the alias` y `pignolo.aliases completes the default map and is part of the closed schema` |
| En `resolveAliases`, quitar `Object.prototype.hasOwnProperty.call(colors, target) \|\| ` (el alias gana aunque exista el nombre MD3) | `semantic aliases: accent and text are read as primary and on-surface, and the finding names the alias` |
| Volver a `const status = findings.length ? 'invalid' : 'valid';` | `semantic aliases: accent and text are read as primary and on-surface, and the finding names the alias` |
| En el esquema de `aliases`, aceptar cualquier valor (`V(() => null)`) | `pignolo.aliases completes the default map and is part of the closed schema` |
| En el README, borrar `` , `fg` → `on-surface` `` | `the README documents every default alias` |

Comprobación opcional de desarrollo: el linter oficial 0.4.0 sobre `valid.md` da 0 errores y 0 warnings (hecho en la copia).

- [ ] **Step 6: Commit**

```text
feat(ui): catálogo semilla y validador propio de DESIGN.md con esquema pignolo cerrado y alias semánticos
```
```bash
git add plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

### Task 8: `design-md patch`: edición por líneas con diff

**Files:**
- Create: `plugins/pignolo-ui/lib/design-patch.mjs`
- Modify: `plugins/pignolo-ui/scripts/design-md.mjs`
- Test: `plugins/pignolo-ui/tests/design-patch.test.mjs`

**Interfaces:**
- Consumes: `parseYaml`, `locate`, `stripComment` (Task 3); `splitFrontmatter`, `validateDesign` (Task 7).
- Produces:
  - `patchDesign(text, ops) -> { ok: true, text, hunks: [{ line, removed, added }], diff } | { ok: false, error, op }`. Operaciones: `{ op: 'set', path, value }`, `{ op: 'append', path, value }`, `{ op: 'remove-item', path, value }`, `{ op: 'section-append', heading, text }`. Errores: `in-flow`, `not-a-scalar`, `not-a-map`, `not-a-list`, `item-not-found`, `missing-list-item`, `no-frontmatter`, `unsupported-yaml`, `unknown-op`, `patch-not-effective`, y los de `yamlScalar`. Cada `set`/`append` se confirma releyendo el texto nuevo (evidencia de efecto).
  - `yamlScalar(value) -> string` (todo string va entre comillas dobles; rechaza saltos de línea, caracteres de control y números no finitos), `formatDiff(hunks, file = 'DESIGN.md') -> string`.
  - CLI: `node scripts/design-md.mjs patch --file <DESIGN.md> --ops <ops.json> [--write] [--project <raíz>]` → JSON `{ written, diff, hunks, validation }`; sin `--write` no toca nada; nunca escribe si el cambio introduce un hallazgo que rechaza la escritura (`{ written: false, refused, … }`, sale 1); una operación no aplicable sale 1 con `{ error, op }`.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/design-patch.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, makeTempDir, runScript } from './helpers.mjs';
import { patchDesign, yamlScalar } from '../lib/design-patch.mjs';
import { splitFrontmatter } from '../lib/design-doc.mjs';
import { parseYaml } from '../lib/yaml-subset.mjs';

const VALID = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const valueOf = (text) => parseYaml(splitFrontmatter(text).yaml).value;

const COMMENTED = [
  '---',
  '# tokens of the demo app',
  'name: Demo   # trailing comment',
  'colors:',
  '  primary: "#0B6BCB"  # brand blue',
  '  surface: "#FFFFFF"',
  'pignolo:',
  '  schema: 1',
  '  platform: both # asked on 2026-09-28',
  '  states: { hoverOpacity: 0.08 }',
  '  extracted:',
  '    - colors.primary',
  '    - colors.surface',
  '---',
  '',
  '## Overview',
  '',
].join('\n');

test('set on an existing line keeps comments, indentation and every other byte (CRLF + BOM)', () => {
  const input = `\uFEFF${COMMENTED.replace(/\n/g, '\r\n')}`;
  const r = patchDesign(input, [{ op: 'set', path: ['pignolo', 'platform'], value: 'desktop' }]);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.text, input.replace('  platform: both # asked', '  platform: "desktop" # asked'));
  assert.deepEqual(r.hunks, [{ line: 9, removed: ['  platform: both # asked on 2026-09-28'], added: ['  platform: "desktop" # asked on 2026-09-28'] }]);
  const r2 = patchDesign(COMMENTED, [{ op: 'set', path: ['colors', 'primary'], value: '#095BAD' }]);
  assert.equal(r2.text, COMMENTED.replace('"#0B6BCB"  # brand blue', '"#095BAD"  # brand blue'));
});

test('set creates missing keys under an existing block map, with its indentation', () => {
  const r = patchDesign(COMMENTED, [
    { op: 'set', path: ['pignolo', 'web', 'public'], value: true },
    { op: 'set', path: ['pignolo', 'register'], value: 'product' },
    { op: 'set', path: ['version'], value: 'alpha' },
  ]);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.text, COMMENTED
    .replace('    - colors.surface\n', '    - colors.surface\n  web:\n    public: true\n  register: "product"\n')
    .replace('    - colors.surface\n  web:\n    public: true\n  register: "product"\n---', '    - colors.surface\n  web:\n    public: true\n  register: "product"\nversion: "alpha"\n---'));
  const v = valueOf(r.text);
  assert.equal(v.pignolo.web.public, true);
  assert.equal(v.version, 'alpha');
});

test('flow collections and block containers are never rewritten', () => {
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'states', 'hoverOpacity'], value: 0.1 }]).error, 'in-flow');
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'states', 'focusOpacity'], value: 0.1 }]).error, 'in-flow');
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['colors'], value: 'x' }]).error, 'not-a-scalar');
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'extracted', 'x'], value: 1 }]).error, 'not-a-map');
  assert.deepEqual(patchDesign('# no frontmatter\n', [{ op: 'set', path: ['a'], value: 1 }]).error, 'no-frontmatter');
  assert.deepEqual(patchDesign('---\na: &x 1\n---\n', [{ op: 'set', path: ['b'], value: 1 }]).error, 'unsupported-yaml');
});

test('append adds a list item, creating the list when missing', () => {
  const entry = { id: 'R-001', date: '2026-09-28', rule: 'COLOR-11', pattern: { kind: 'property', value: 'background-image: linear-gradient' }, note: 'no purple gradients' };
  const r = patchDesign(VALID, [{ op: 'append', path: ['pignolo', 'rejections'], value: entry }]);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(valueOf(r.text).pignolo.rejections, [entry]);
  assert.deepEqual(r.hunks[0].added, [
    '  rejections:',
    '    - id: "R-001"',
    '      date: "2026-09-28"',
    '      rule: "COLOR-11"',
    '      pattern:',
    '        kind: "property"',
    '        value: "background-image: linear-gradient"',
    '      note: "no purple gradients"',
  ]);
  const r2 = patchDesign(COMMENTED, [{ op: 'append', path: ['pignolo', 'extracted'], value: 'rounded.md' }]);
  assert.equal(r2.text, COMMENTED.replace('    - colors.surface\n', '    - colors.surface\n    - "rounded.md"\n'));
});

test('remove-item drops the item lines; the last one leaves an empty flow list', () => {
  const r = patchDesign(COMMENTED, [{ op: 'remove-item', path: ['pignolo', 'extracted'], value: 'colors.primary' }]);
  assert.equal(r.text, COMMENTED.replace('    - colors.primary\n', ''));
  const r2 = patchDesign(r.text, [{ op: 'remove-item', path: ['pignolo', 'extracted'], value: 'colors.surface' }]);
  assert.equal(r2.text, COMMENTED.replace('  extracted:\n    - colors.primary\n    - colors.surface\n', '  extracted: []\n'));
  const r3 = patchDesign(r2.text, [{ op: 'append', path: ['pignolo', 'extracted'], value: 'colors.surface' }]);
  assert.deepEqual(valueOf(r3.text).pignolo.extracted, ['colors.surface']);
  assert.equal(patchDesign(COMMENTED, [{ op: 'remove-item', path: ['pignolo', 'extracted'], value: 'nope' }]).error, 'item-not-found');
});

test('section-append writes at the end of ## Decisions, creating it at the end when missing', () => {
  const entry = '- 2026-09-28 — decided X.';
  const r = patchDesign(VALID, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  assert.equal(r.text, `${VALID}\n${entry}\n`);
  const withContent = patchDesign(`${VALID}\n- 2026-09-01 — earlier.\n\n## Appendix\n\nx\n`, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  assert.equal(withContent.text, `${VALID}\n- 2026-09-01 — earlier.\n${entry}\n\n## Appendix\n\nx\n`);
  const noSection = VALID.replace('\n## Decisions\n', '');
  const created = patchDesign(noSection, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  assert.equal(created.text, `${noSection}\n## Decisions\n\n${entry}\n`);
});

test('yamlScalar quotes every string and refuses line breaks', () => {
  assert.equal(yamlScalar('a "b" \\ c'), '"a \\"b\\" \\\\ c"');
  assert.equal(yamlScalar(0.5), '0.5');
  assert.equal(yamlScalar(false), 'false');
  assert.equal(yamlScalar(null), 'null');
  assert.throws(() => yamlScalar('a\nb'), /line break/);
  assert.throws(() => yamlScalar(Number.NaN), /finite/);
  const r = patchDesign(COMMENTED, [{ op: 'set', path: ['name'], value: 'a\nb' }]);
  assert.equal(r.ok, false);
});

test('the diff shows each hunk with its line', () => {
  const r = patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'platform'], value: 'mobile' }]);
  assert.equal(r.diff, '--- DESIGN.md\n+++ DESIGN.md (propuesto)\n@@ línea 9 @@\n-  platform: both # asked on 2026-09-28\n+  platform: "mobile" # asked on 2026-09-28\n');
});

test('CLI: without --write nothing changes; a patch the validator would reject is never written', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  const ops = path.join(dir, 'ops.json');
  fs.writeFileSync(file, VALID);
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['pignolo', 'platform'], value: 'desktop' }]));
  let out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.written, false);
  assert.match(out.json.diff, /\+ {2}platform: "desktop"/);
  assert.equal(fs.readFileSync(file, 'utf8'), VALID);
  out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops, '--write']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.written, true);
  assert.equal(fs.readFileSync(file, 'utf8'), VALID.replace('  platform: both', '  platform: "desktop"'));
  fs.writeFileSync(ops, JSON.stringify([{ op: 'append', path: ['pignolo', 'intentional'], value: { id: 'A11Y-01', why: 'x' } }]));
  const before = fs.readFileSync(file, 'utf8');
  out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops, '--write']);
  assert.equal(out.status, 1);
  assert.equal(out.json.written, false);
  assert.deepEqual(out.json.validation.findings.map((f) => f.id), ['DESIGN-INTENTIONAL']);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['colors'], value: 1 }]));
  out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]);
  assert.equal(out.status, 1);
  assert.equal(out.json.error, 'not-a-scalar');
});

test('CLI: a rejecting finding the file already had does not block an unrelated patch', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  const ops = path.join(dir, 'ops.json');
  fs.writeFileSync(file, VALID.replace('      fast: 120\n', '      fast: "120ms"\n'));
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['pignolo', 'register'], value: 'brand' }]));
  const out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops, '--write']);
  assert.equal(out.status, 0, out.stdout);
  assert.equal(out.json.written, true);
  assert.ok(out.json.validation.findings.some((f) => f.id === 'DESIGN-TOKEN-LIKE'));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `design-patch.test.mjs` no carga (`Cannot find module …/lib/design-patch.mjs`) (`tests 78`, `pass 77`, `fail 1`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/lib/design-patch.mjs`:
```js
// Line-level edits of DESIGN.md (spec §4.4 "Escritura"): only inserts or replaces lines,
// never re-serializes, so comments and formatting survive byte for byte. Every change comes
// back as hunks and a diff for the user to confirm.
//
// patchDesign(text, ops) -> { ok: true, text, hunks: [{ line, removed, added }], diff } | { ok: false, error, op }
// ops: { op: 'set', path, value }            scalar on its own line; creates missing keys under a block map
//      { op: 'append', path, value }         list item (scalar or map); creates the list when missing
//      { op: 'remove-item', path, value }    removes a scalar item; the last one leaves "key: []"
//      { op: 'section-append', heading, text }  appends lines at the end of "## <heading>" (created at the end if missing)
import { parseYaml, locate, stripComment } from './yaml-subset.mjs';

class PatchError extends Error {}

const BOM = '\uFEFF';
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function yamlScalar(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new PatchError('numbers must be finite');
    return String(v);
  }
  if (typeof v !== 'string') throw new PatchError(`not a scalar: ${JSON.stringify(v)}`);
  if (/[\r\n]/.test(v)) throw new PatchError('strings cannot contain a line break');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) throw new PatchError('strings cannot contain control characters');
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlKey(k) {
  const s = String(k);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(s) ? s : yamlScalar(s);
}

// Block lines for a value placed after "key:" or "- ".
function blockLines(value, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    if (isMap(v)) out.push(`${pad}${yamlKey(k)}:`, ...blockLines(v, indent + 2));
    else if (Array.isArray(v)) out.push(`${pad}${yamlKey(k)}: [${v.map(yamlScalar).join(', ')}]`);
    else out.push(`${pad}${yamlKey(k)}: ${yamlScalar(v)}`);
  }
  return out;
}

function itemLines(value, dashIndent) {
  const pad = ' '.repeat(dashIndent);
  if (!isMap(value)) return [`${pad}- ${yamlScalar(value)}`];
  const inner = blockLines(value, dashIndent + 2);
  return [`${pad}- ${inner[0].trimStart()}`, ...inner.slice(1)];
}

function getAt(root, p) {
  let v = root;
  for (const k of p) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Splits "key: value  # c" at the given column into { head: 'key:', tail: '  # c' }.
function entryHead(rest) {
  let end;
  if (rest[0] === '"' || rest[0] === "'") {
    const q = rest[0];
    let j = 1;
    while (j < rest.length && !(rest[j] === q && rest[j - 1] !== '\\')) j++;
    end = rest.indexOf(':', j);
  } else {
    const m = /:(\s|$)/.exec(rest);
    end = m ? m.index : -1;
  }
  if (end < 0) throw new PatchError('not-a-scalar');
  return rest.slice(0, end + 1);
}

class Doc {
  constructor(text) {
    this.bom = text.startsWith(BOM);
    const src = this.bom ? text.slice(1) : text;
    this.eol = src.includes('\r\n') ? '\r\n' : '\n';
    this.lines = src.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    this.hunks = [];
  }

  text() {
    return (this.bom ? BOM : '') + this.lines.join(this.eol);
  }

  splice(index, remove, add) {
    const removed = this.lines.splice(index, remove, ...add);
    this.hunks.push({ line: index + 1, removed, added: add });
  }

  // Frontmatter bounds and a fresh parse of the YAML.
  yaml() {
    if (this.lines[0].trimEnd() !== '---') throw new PatchError('no-frontmatter');
    const end = this.lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
    if (end < 0) throw new PatchError('no-frontmatter');
    const parsed = parseYaml(this.lines.slice(1, end).join('\n'));
    if (!parsed.supported) throw new PatchError('unsupported-yaml');
    return { parsed, end };
  }
}

// Deepest existing ancestor of `p` that can take new block children.
function anchorFor(parsed, end, p) {
  for (let i = p.length - 1; i >= 0; i--) {
    const anc = p.slice(0, i);
    const value = i === 0 ? parsed.value : getAt(parsed.value, anc);
    if (value === undefined) continue;
    if (typeof p[i] === 'number') throw new PatchError('missing-list-item');
    const loc = i === 0 ? { line: 0, endLine: end - 1, indent: -2, style: 'block' } : locate(parsed, anc);
    if (loc.style === 'flow') throw new PatchError('in-flow');
    if (Array.isArray(value)) throw new PatchError('not-a-map');
    if (value !== null && !isMap(value)) throw new PatchError('not-a-map');
    let childIndent = loc.indent + 2;
    const first = isMap(value) ? Object.keys(value)[0] : undefined;
    if (first !== undefined) childIndent = locate(parsed, [...anc, first]).indent;
    const at = value === null ? loc.line : loc.endLine;
    return { depth: i, childIndent, at };
  }
  throw new PatchError('no-root');
}

// Lines that create p[depth..] under the anchor; the last key gets `lastSuffix`.
function creationLines(p, depth, indent, lastLines) {
  const out = [];
  let pad = indent;
  for (let i = depth; i < p.length - 1; i++) {
    out.push(`${' '.repeat(pad)}${yamlKey(p[i])}:`);
    pad += 2;
  }
  return [...out, ...lastLines(pad, p[p.length - 1])];
}

function opSet(doc, { path: p, value }) {
  const { parsed, end } = doc.yaml();
  const loc = locate(parsed, p);
  const ser = yamlScalar(value);
  if (loc) {
    if (loc.style === 'flow') throw new PatchError('in-flow');
    if (loc.style === 'block') throw new PatchError('not-a-scalar');
    const line = doc.lines[loc.line];
    const prefix = line.slice(0, loc.indent);
    const rest = line.slice(loc.indent);
    const kept = stripComment(rest);
    const tail = rest.slice(kept.length);
    const head = typeof p[p.length - 1] === 'number' ? '-' : entryHead(kept);
    doc.splice(loc.line, 1, [`${prefix}${head} ${ser}${tail}`]);
    return;
  }
  const a = anchorFor(parsed, end, p);
  const lines = creationLines(p, a.depth, a.childIndent, (pad, key) => [`${' '.repeat(pad)}${yamlKey(key)}: ${ser}`]);
  doc.splice(a.at + 1, 0, lines);
}

function opAppend(doc, { path: p, value }) {
  const { parsed, end } = doc.yaml();
  const loc = locate(parsed, p);
  const current = getAt(parsed.value, p);
  if (loc && current !== undefined && current !== null) {
    if (!Array.isArray(current)) throw new PatchError('not-a-list');
    if (loc.style === 'flow') {
      if (current.length) throw new PatchError('in-flow');
      const line = doc.lines[loc.line];
      const rest = line.slice(loc.indent);
      const tail = rest.slice(stripComment(rest).length);
      doc.splice(loc.line, 1, [`${line.slice(0, loc.indent)}${entryHead(stripComment(rest))}${tail}`, ...itemLines(value, loc.indent + 2)]);
      return;
    }
    const indent = current.length ? locate(parsed, [...p, 0]).indent : loc.indent + 2;
    doc.splice(loc.endLine + 1, 0, itemLines(value, indent));
    return;
  }
  if (loc && current === null) {
    doc.splice(loc.line + 1, 0, itemLines(value, loc.indent + 2));
    return;
  }
  const a = anchorFor(parsed, end, p);
  const lines = creationLines(p, a.depth, a.childIndent, (pad, key) => [`${' '.repeat(pad)}${yamlKey(key)}:`, ...itemLines(value, pad + 2)]);
  doc.splice(a.at + 1, 0, lines);
}

function opRemoveItem(doc, { path: p, value }) {
  const { parsed } = doc.yaml();
  const list = getAt(parsed.value, p);
  if (!Array.isArray(list)) throw new PatchError('not-a-list');
  const index = list.findIndex((item) => same(item, value));
  if (index < 0) throw new PatchError('item-not-found');
  const item = locate(parsed, [...p, index]);
  if (item.style === 'flow') throw new PatchError('in-flow');
  if (list.length > 1) {
    doc.splice(item.line, item.endLine - item.line + 1, []);
    return;
  }
  const key = locate(parsed, p);
  const line = doc.lines[key.line];
  const rest = line.slice(key.indent);
  const tail = rest.slice(stripComment(rest).length);
  doc.splice(key.line, item.endLine - key.line + 1, [`${line.slice(0, key.indent)}${entryHead(stripComment(rest))} []${tail}`]);
}

function opSectionAppend(doc, { heading, text }) {
  const { end } = doc.yaml();
  const add = String(text).replace(/\r\n/g, '\n').split('\n');
  const isHeading = (l) => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(l);
  const h = doc.lines.findIndex((l, i) => i > end && isHeading(l));
  if (h < 0) {
    let at = doc.lines.length;
    if (doc.lines[at - 1] === '') at--;
    doc.splice(at, 0, ['', `## ${heading}`, '', ...add]);
    return;
  }
  let stop = doc.lines.findIndex((l, i) => i > h && /^#{1,2}\s/.test(l));
  if (stop < 0) stop = doc.lines.length;
  let last = stop - 1;
  while (last > h && doc.lines[last].trim() === '') last--;
  if (last === h) {
    doc.splice(h + 1, 0, ['', ...add]);
    return;
  }
  doc.splice(last + 1, 0, add);
}

const OPS = { set: opSet, append: opAppend, 'remove-item': opRemoveItem, 'section-append': opSectionAppend };

export function formatDiff(hunks, file = 'DESIGN.md') {
  const out = [`--- ${file}`, `+++ ${file} (propuesto)`];
  for (const h of hunks) {
    out.push(`@@ línea ${h.line} @@`, ...h.removed.map((l) => `-${l}`), ...h.added.map((l) => `+${l}`));
  }
  return `${out.join('\n')}\n`;
}

export function patchDesign(text, ops) {
  const doc = new Doc(String(text));
  for (const op of ops) {
    try {
      const run = OPS[op && op.op];
      if (!run) throw new PatchError('unknown-op');
      const errorsBefore = op.op === 'section-append' ? 0 : doc.yaml().parsed.errors.length;
      run(doc, op);
      if (op.op === 'set' || op.op === 'append') {
        // evidence of effect: the new text parses to the requested value, with no new YAML errors
        const { parsed } = doc.yaml();
        const got = getAt(parsed.value, op.path);
        const ok = op.op === 'set' ? same(got, op.value) : Array.isArray(got) && same(got[got.length - 1], op.value);
        if (!ok || parsed.errors.length > errorsBefore) throw new PatchError('patch-not-effective');
      }
    } catch (e) {
      if (e instanceof PatchError) return { ok: false, error: e.message, op };
      throw e;
    }
  }
  return { ok: true, text: doc.text(), hunks: doc.hunks, diff: formatDiff(doc.hunks) };
}
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, justo después de:
```js
//   validate: 0 valid, 1 findings, 2 not verified (unsupported YAML) or own error
```
agregar:
```js
//   patch:    0 diff computed (written with --write), 1 refused or not applicable, 2 own error
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, justo después de:
```js
import { validateDesign } from '../lib/design-doc.mjs';
```
agregar:
```js
import { patchDesign } from '../lib/design-patch.mjs';
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, reemplazar:
```js
const COMMANDS = { validate: cmdValidate };
```
por:
```js
// Shows the diff; writes only with --write (after the user confirmed it) and never when the
// patch introduces a finding that rejects the file (for example intentional on the floor).
function cmdPatch(opts) {
  if (!opts.file || !opts.ops) throw new UsageError('faltan --file <DESIGN.md> y --ops <ops.json>');
  const text = readText(opts.file, 'el archivo');
  let ops;
  try {
    ops = JSON.parse(readText(opts.ops, 'las operaciones'));
  } catch (e) {
    if (e instanceof UsageError) throw e;
    throw new UsageError(`--ops no es JSON válido (${e.message})`);
  }
  if (!Array.isArray(ops)) throw new UsageError('--ops debe ser una lista de operaciones');
  const r = patchDesign(text, ops);
  if (!r.ok) return { out: { written: false, error: r.error, op: r.op }, code: 1 };
  const catalog = loadCatalog(opts);
  const darkInCss = opts.project ? readTokenSources(opts.project).darkDetected : false;
  const before = validateDesign(text, { catalog, darkInCss });
  const after = validateDesign(r.text, { catalog, darkInCss });
  const known = new Set(before.findings.filter((f) => f.rejects).map((f) => `${f.id} ${f.path}`));
  const introduced = after.findings.filter((f) => f.rejects && !known.has(`${f.id} ${f.path}`));
  const validation = { status: after.status, findings: after.findings };
  if (introduced.length) return { out: { written: false, refused: introduced, diff: r.diff, validation }, code: 1 };
  if (opts.write) {
    fs.writeFileSync(opts.file, r.text);
    if (fs.readFileSync(opts.file, 'utf8') !== r.text) throw new Error('el archivo escrito no coincide con el propuesto');
  }
  return { out: { written: Boolean(opts.write), diff: r.diff, hunks: r.hunks, validation }, code: 0 };
}

const COMMANDS = { validate: cmdValidate, patch: cmdPatch };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 87`, `pass 87`, `fail 0`).
Run: `npm test`
Expected: PASS (núcleo + 87).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `opSet`, escribir la línea sin `${tail}` (se pierde el comentario) | `set on an existing line keeps comments, indentation and every other byte (CRLF + BOM)` y `the diff shows each hunk with its line` |
| En `Doc`, fijar `this.eol = '\n';` | `set on an existing line keeps comments, indentation and every other byte (CRLF + BOM)` |
| En `opSet`, borrar `if (loc.style === 'flow') throw new PatchError('in-flow');` | `flow collections and block containers are never rewritten` |
| En `opRemoveItem`, cambiar `list.length > 1` por `list.length > 0` (la lista queda `null`) | `remove-item drops the item lines; the last one leaves an empty flow list` |
| En `yamlScalar`, devolver `"${v}"` sin escapar | `yamlScalar quotes every string and refuses line breaks` |
| En `cmdPatch`, borrar la línea `if (introduced.length) return { … refused … }` | `CLI: without --write nothing changes; a patch the validator would reject is never written` |
| En `cmdPatch`, contar todos los que rechazan (`after.findings.filter((f) => f.rejects)`) | `CLI: a rejecting finding the file already had does not block an unrelated patch` |

- [ ] **Step 6: Commit**

```text
feat(ui): design-md patch por líneas con diff y rechazo de escrituras inválidas
```
```bash
git add plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

### Task 9: Plantilla `DESIGN.md` 0/0 y linter oficial solo si ya está instalado

**Files:**
- Create: `plugins/pignolo-ui/templates/DESIGN.md`, `plugins/pignolo-ui/lib/official-lint.mjs`
- Modify: `plugins/pignolo-ui/scripts/design-md.mjs`
- Test: `plugins/pignolo-ui/tests/template.test.mjs`, `plugins/pignolo-ui/tests/official-lint.test.mjs`

**Interfaces:**
- Consumes: `validateDesign`, `splitFrontmatter` (Task 7).
- Produces:
  - `templates/DESIGN.md`: tokens primitivos y semánticos (MD3), escalas, estados, `pignolo:` completo sin tema oscuro, prosa en el orden canónico que cita tokens, `### Hierarchy and reading order` y `## Decisions` vacía al final. `platform: both` y `register: product` son los valores por defecto que el flujo pregunta al crearlo.
  - `PINNED_VERSION = '0.4.0'`; `findOfficialLinter({ projectRoot, env }) -> { entry, version, dir } | null`; `runOfficialLint(file, { projectRoot, env, timeoutMs }) -> { status: 'ran', version, pinned, errors, warnings, infos, findings } | { status: 'unverified', reason, version? }`.
  - CLI: `validate … --official` agrega `official` a la salida sin cambiar el código de salida (sus warnings sobre un archivo del usuario informan y no bloquean, §4.2).

- [ ] **Step 1: Escribir los tests que fallan**

`plugins/pignolo-ui/tests/template.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';
import { validateDesign, splitFrontmatter } from '../lib/design-doc.mjs';

const TEMPLATE = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'DESIGN.md'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));

test('the template passes the own validator with no findings', () => {
  const r = validateDesign(TEMPLATE, { catalog });
  assert.deepEqual(r.findings, []);
  assert.equal(r.status, 'valid');
});

test('the template prose cites tokens, never raw values', () => {
  const { body } = splitFrontmatter(TEMPLATE);
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|ms|%)\b/);
  assert.match(body, /\{colors\.primary\}/);
});

test('the template ends with an empty ## Decisions section and has no dark theme by default', () => {
  assert.match(TEMPLATE, /\n## Decisions\n$/);
  assert.doesNotMatch(TEMPLATE, /^\s+themes:/m);
  assert.doesNotMatch(TEMPLATE, /^\s+extracted:/m);
});
```

`plugins/pignolo-ui/tests/official-lint.test.mjs`:
```js
// Development test against the official linter (spec §0.1 criterion 2, A-09). It only runs
// when a developer installed @google/design.md@0.4.0 by hand, outside package.json, and
// points PIGNOLO_UI_DESIGNMD at it. Without it the test is a visible skip, never a green.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { findOfficialLinter, runOfficialLint, PINNED_VERSION } from '../lib/official-lint.mjs';

const TEMPLATE = path.join(PLUGIN_ROOT, 'templates', 'DESIGN.md');
const NO_LINTER = 'sin linter oficial: instalar @google/design.md@0.4.0 a mano fuera del repo y fijar PIGNOLO_UI_DESIGNMD';

test('without the official linter the result is unverified', () => {
  const r = runOfficialLint(TEMPLATE, { projectRoot: makeTempDir(), env: {} });
  assert.deepEqual(r, { status: 'unverified', reason: 'official linter not installed (@google/design.md)' });
});

test('a linter that prints no JSON is unverified, never approved', () => {
  const project = writeTree(makeTempDir(), {
    'node_modules/@google/design.md/package.json': JSON.stringify({ name: '@google/design.md', version: '0.4.0', bin: { designmd: 'dist/index.js' } }),
    'node_modules/@google/design.md/dist/index.js': 'process.exit(0);\n',
  });
  const r = runOfficialLint(TEMPLATE, { projectRoot: project, env: {} });
  assert.equal(r.status, 'unverified');
  assert.match(r.reason, /no JSON/);
});

test('validate --official reports the official result without changing the exit code', () => {
  const out = runScript('design-md.mjs', ['validate', '--file', TEMPLATE, '--project', makeTempDir(), '--official'], { env: { ...process.env, PIGNOLO_UI_DESIGNMD: '' } });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.official.status, 'unverified');
});

test(`the template passes the official linter ${PINNED_VERSION} with 0 errors and 0 warnings (development)`, (t) => {
  const found = findOfficialLinter({ env: process.env });
  if (!found) {
    t.skip(NO_LINTER);
    return;
  }
  assert.equal(found.version, PINNED_VERSION);
  const r = runOfficialLint(TEMPLATE, { env: process.env });
  assert.equal(r.status, 'ran');
  assert.deepEqual([r.errors, r.warnings], [0, 0], JSON.stringify(r.findings));
  assert.ok(fs.existsSync(found.entry));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `template.test.mjs` (`ENOENT … templates/DESIGN.md`) y `official-lint.test.mjs` (`Cannot find module …/lib/official-lint.mjs`) no cargan (`tests 89`, `pass 87`, `fail 2`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/templates/DESIGN.md`:
```markdown
---
version: alpha
name: Project name
description: Design decisions of this project. Tokens are the source of truth; the prose cites them.
colors:
  blue-50: "#E6F0FB"
  blue-600: "#0B6BCB"
  blue-700: "#095BAD"
  blue-800: "#084F96"
  blue-900: "#07467F"
  neutral-0: "#FFFFFF"
  neutral-100: "#F5F5F5"
  neutral-600: "#6E6E6E"
  neutral-700: "#5C5C5C"
  neutral-900: "#1A1A1A"
  red-700: "#C4291C"
  primary: "{colors.blue-600}"
  on-primary: "{colors.neutral-0}"
  primary-hover: "{colors.blue-700}"
  primary-pressed: "{colors.blue-800}"
  primary-container: "{colors.blue-50}"
  on-primary-container: "{colors.blue-900}"
  background: "{colors.neutral-0}"
  surface: "{colors.neutral-0}"
  surface-container: "{colors.neutral-100}"
  on-surface: "{colors.neutral-900}"
  on-surface-variant: "{colors.neutral-700}"
  on-surface-muted: "{colors.neutral-600}"
  outline: "#8F8F8F"
  focus-ring: "{colors.blue-600}"
  error: "{colors.red-700}"
  on-error: "{colors.neutral-0}"
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "6": 24px
  "8": 32px
  "12": 48px
  "16": 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.md}"
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    height: 40px
  input-hover:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  text-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-variant}"
  text-muted:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface-muted}"
  error-banner:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
  focus-indicator:
    backgroundColor: "{colors.focus-ring}"
pignolo:
  schema: 1
  platform: both
  register: product
  elevation:
    level0: "none"
    level1: "0 0 2px rgb(0 0 0 / 0.12), 0 1px 2px rgb(0 0 0 / 0.14)"
    level2: "0 0 2px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.14)"
    level3: "0 0 2px rgb(0 0 0 / 0.12), 0 8px 16px rgb(0 0 0 / 0.14)"
    level4: "0 0 8px rgb(0 0 0 / 0.12), 0 32px 64px rgb(0 0 0 / 0.14)"
  states:
    hoverOpacity: 0.08
    focusOpacity: 0.12
    pressedOpacity: 0.12
    draggedOpacity: 0.16
    disabledContentOpacity: 0.38
    disabledContainerOpacity: 0.12
  focus:
    color: "{colors.focus-ring}"
    widthPx: 2
    offsetPx: 2
  motion:
    durationMs:
      fast: 120
      base: 200
      slow: 300
      slower: 450
    easing:
      standard: "cubic-bezier(0.2, 0, 0, 1)"
      decelerate: "cubic-bezier(0, 0, 0, 1)"
      accelerate: "cubic-bezier(0.3, 0, 1, 1)"
    reducedMotion: fade-or-none
  borders:
    subtle: "{colors.surface-container}"
    strong: "{colors.outline}"
    widthPx: 1
  targets:
    minPx: 24
    recommendedPx: 44
---

# Project name

## Overview

What the product is, who uses it and the tone. Register {pignolo.register}: restraint, neutral surfaces and a single accent, {colors.primary}.

## Colors

Text is {colors.on-surface} on {colors.surface}; secondary text is {colors.on-surface-variant} and tertiary text {colors.on-surface-muted}. The only accent is {colors.primary}, with {colors.on-primary} on top. Functional borders use {colors.outline}; decorative ones {colors.surface-container}. Errors use {colors.error} with {colors.on-error}.

## Typography

One family. Page titles use {typography.headline-lg}, section titles {typography.headline-md}, body text {typography.body-md} and controls {typography.label-md}.

## Layout

Spacing follows the scale in {spacing}. Content stays within a readable measure.

### Hierarchy and reading order

One primary action per screen, using {components.button-primary}. Reading order: page title, the primary action, then the content from most to least important.

## Elevation & Depth

Resting cards use {pignolo.elevation.level1}; floating layers use {pignolo.elevation.level3}. Hover raises one level.

## Shapes

Controls use {rounded.md}, inputs {rounded.sm} and cards {rounded.lg}.

## Components

Every control has hover, pressed, focus and disabled states. Focus is drawn with {pignolo.focus.color}; disabled states use the opacities in {pignolo.states}.

## Do's and Don'ts

- Do cite tokens in this prose, never raw values.
- Don't add a second accent color.

## Decisions
```

`plugins/pignolo-ui/lib/official-lint.mjs`:
```js
// Official DESIGN.md linter, only when it is already installed (spec §4.2, A-09). Never
// downloads anything: it looks for the package in PIGNOLO_UI_DESIGNMD (package folder or its
// dist/index.js) or in <project>/node_modules/@google/design.md, and runs it with node
// (no shell, so it behaves the same on Windows). No JSON output = unverified, never approved.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PINNED_VERSION = '0.4.0';

export function findOfficialLinter({ projectRoot, env = process.env } = {}) {
  const candidates = [];
  if (env.PIGNOLO_UI_DESIGNMD) candidates.push(env.PIGNOLO_UI_DESIGNMD);
  if (projectRoot) candidates.push(path.join(projectRoot, 'node_modules', '@google', 'design.md'));
  for (const c of candidates) {
    const dir = /\.m?js$/.test(c) ? path.dirname(path.dirname(c)) : c;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name !== '@google/design.md') continue;
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && (pkg.bin.designmd || pkg.bin['design.md']);
      const entry = path.join(dir, bin || path.join('dist', 'index.js'));
      if (fs.existsSync(entry)) return { entry, version: pkg.version, dir };
    } catch {
      // not this candidate
    }
  }
  return null;
}

export function runOfficialLint(file, { projectRoot, env = process.env, timeoutMs = 30000 } = {}) {
  const found = findOfficialLinter({ projectRoot, env });
  if (!found) return { status: 'unverified', reason: 'official linter not installed (@google/design.md)' };
  const res = spawnSync(process.execPath, [found.entry, 'lint', '--format', 'json', file], { encoding: 'utf8', timeout: timeoutMs });
  let json;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    return { status: 'unverified', reason: `official linter gave no JSON output (exit ${res.status})`, version: found.version };
  }
  const s = json.summary || {};
  return {
    status: 'ran',
    version: found.version,
    pinned: found.version === PINNED_VERSION,
    errors: s.errors ?? 0,
    warnings: s.warnings ?? 0,
    infos: s.infos ?? 0,
    findings: Array.isArray(json.findings) ? json.findings : [],
  };
}
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, justo después de:
```js
import { patchDesign } from '../lib/design-patch.mjs';
```
agregar:
```js
import { runOfficialLint } from '../lib/official-lint.mjs';
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, justo después de:
```js
  const { data, ...out } = r;
```
agregar:
```js
  // The official linter only informs: its warnings on a user's file never block (spec §4.2).
  if (opts.official) out.official = runOfficialLint(opts.file, { projectRoot: opts.project });
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS con un skip visible (`﹣ the template passes the official linter 0.4.0 … # sin linter oficial: …`) (`tests 94`, `pass 93`, `fail 0`, `skipped 1`).
Run: `npm test`
Expected: PASS (núcleo + 94, `skipped 1`).

Test de desarrollo (criterio 2 de §0.1), con el linter instalado a mano fuera del repo:
```bash
npm install --prefix <carpeta-fuera-del-repo> --no-audit --no-fund @google/design.md@0.4.0
PIGNOLO_UI_DESIGNMD=<carpeta-fuera-del-repo>/node_modules/@google/design.md npm run test:ui
```
(En PowerShell: `$env:PIGNOLO_UI_DESIGNMD = '<…>\node_modules\@google\design.md'; npm run test:ui`.)
Expected: `tests 94`, `pass 94`, `skipped 0`.

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En la prosa de la plantilla, cambiar `Controls use {rounded.md}, inputs` por `Controls use 8px, inputs` | `the template prose cites tokens, never raw values` |
| En la plantilla, borrar el componente `input-hover` (3 líneas) | `the template passes the own validator with no findings` y `validate --official reports the official result without changing the exit code` |
| En `runOfficialLint`, tratar la salida sin JSON como `json = { summary: {} };` | `a linter that prints no JSON is unverified, never approved` |
| Con `PIGNOLO_UI_DESIGNMD`: en la plantilla, agregar `neutral-500: "#8F8F8F"` antes de `neutral-600` (primitivo huérfano: solo lo ve el linter oficial) | `the template passes the official linter 0.4.0 with 0 errors and 0 warnings (development)` |
| Con `PIGNOLO_UI_DESIGNMD`: en `pignolo.borders` de la plantilla, agregar `color: "#8F8F8F"` | los dos linters: `the template passes the own validator with no findings`, `validate --official reports the official result without changing the exit code` y `the template passes the official linter 0.4.0 with 0 errors and 0 warnings (development)` |

- [ ] **Step 6: Commit**

```text
feat(ui): plantilla DESIGN.md 0/0 y linter oficial solo si ya está instalado
```
```bash
git add plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

### Task 10: `design-md extract`: arranque desde la configuración, frecuencia como último recurso, nombres MD3 y carpeta del run

**Files:**
- Create: `plugins/pignolo-ui/lib/design-extract.mjs`, `plugins/pignolo-ui/lib/run-folder.mjs`
- Modify: `plugins/pignolo-ui/lib/token-sources.mjs` (exporta `blankComments` y `listCss`), `plugins/pignolo-ui/lib/design-patch.mjs` (exporta `yamlKey`), `plugins/pignolo-ui/scripts/design-md.mjs`
- Test: `plugins/pignolo-ui/tests/design-extract.test.mjs`, `plugins/pignolo-ui/tests/run-folder.test.mjs`, `plugins/pignolo-ui/tests/official-lint.test.mjs` (modificado), fixtures en `plugins/pignolo-ui/tests/fixtures/extract/{tailwind-v4,tailwind-v3,css-root,shadcn,frequency}/`

**Interfaces:**
- Consumes: `readTokenSources`, `listCss`, `blankComments` (Tasks 5–6); `parseColor`, `formatColor`, `detectFormat`, `toOklch` (Task 4); `yamlScalar`, `yamlKey`, `formatDiff` (Task 8); `validateDesign`, `resolveAliases` (Task 7); `runOfficialLint` (Task 9).
- Produces:
  - `extractDesign(root, { date }) -> { mode: 'config' | 'frequency' | 'unverified' | 'none', text, from, extracted, renamed, darkDetected, unsupported, unverified }`; `text` es la propuesta completa de `DESIGN.md` o `null`; `renamed` = `[{ from, to }]` de los colores renombrados a MD3 por el mapa de alias.
  - `lib/run-folder.mjs`: `RUN_ROOT = '.pignolo-ui'`, `ensureRunRoot(projectRoot) -> dir` (crea `.pignolo-ui/.gitignore` = `*` si no existe, sin pisar uno existente), `isInsideRunRoot(projectRoot, file) -> boolean` (resuelve `..`).
  - CLI: `node scripts/design-md.mjs extract --project <raíz> --out <archivo> [--date YYYY-MM-DD]` → escribe solo la propuesta en `--out` (nunca sobre un archivo que existe; si `--out` cae en `<raíz>/.pignolo-ui/`, crea antes el `.gitignore` y la carpeta) y devuelve `{ mode, out, from, extracted, renamed, darkDetected, unsupported, unverified, validation, diff }`; sale 0 con propuesta, 1 si no hay nada que proponer (`mode: 'exists'` cuando el proyecto ya tiene `DESIGN.md`, en cualquier combinación de mayúsculas), 2 error propio.

- [ ] **Step 1: Escribir los tests que fallan (y los fixtures)**

`plugins/pignolo-ui/tests/fixtures/extract/tailwind-v4/app.css`:
```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.55 0.2 260);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-surface: oklch(1 0 0);
  --color-surface-foreground: oklch(0.2 0 0);
  --color-brand-500: oklch(0.62 0.18 40);
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --font-sans: "Inter", ui-sans-serif, sans-serif;
  --spacing: 0.25rem;
  --header-height: 64px;
}

.btn {
  background: var(--color-primary);
}
```

`plugins/pignolo-ui/tests/fixtures/extract/tailwind-v3/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0b6bcb', foreground: '#ffffff' },
        surface: '#ffffff',
        'on-surface': '#1a1a1a',
      },
      borderRadius: { lg: '12px' },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
```

`plugins/pignolo-ui/tests/fixtures/extract/css-root/styles/tokens.css`:
```css
:root {
  --primary: #0b6bcb;
  --on-primary: #ffffff;
  --surface: #ffffff;
  --on-surface: #1a1a1a;
  --radius: 8px;
  --font-body: "Source Sans 3", sans-serif;
}

.dark {
  --primary: #7fb2f0;
  --on-primary: #0a1f33;
  --surface: #121212;
  --on-surface: #f0f0f0;
}
```

`plugins/pignolo-ui/tests/fixtures/extract/css-root/src/page.css`:
```css
.promo { color: #ff00ff; border-color: #ff00ff; background: #ff00ff; }
.promo:hover { color: #ff00ff; outline-color: #ff00ff; }
```

`plugins/pignolo-ui/tests/fixtures/extract/shadcn/components.json`:
```json
{
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  }
}
```

`plugins/pignolo-ui/tests/fixtures/extract/shadcn/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --radius: 0.5rem;
    --font-sans: "Geist", sans-serif;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
  }
}
```

`plugins/pignolo-ui/tests/fixtures/extract/frequency/src/site.css`:
```css
body { font-family: "Merriweather", Georgia, serif; color: #1a1a1a; background: #ffffff; }
h1, h2 { font-family: "Merriweather", serif; color: #1a1a1a; }
.card { background: #ffffff; border-radius: 12px; color: #1a1a1a; }
.button { background: #0b6bcb; color: #ffffff; border-radius: 6px; }
.button:hover { background: #0B6BCB; }
.link { color: rgb(11 107 203); }
.badge { background: #0b6bcb; border-radius: 6px; font-family: system-ui, sans-serif; }
.tag { border: 1px solid #e5e5e5; border-radius: 6px; }
.chip { background-color: #ffffff; outline: 2px solid #0b6bcb; }
```

`plugins/pignolo-ui/tests/design-extract.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FIXTURES, PLUGIN_ROOT, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { extractDesign } from '../lib/design-extract.mjs';
import { validateDesign, splitFrontmatter } from '../lib/design-doc.mjs';
import { parseYaml } from '../lib/yaml-subset.mjs';

const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));
const fixture = (name) => path.join(FIXTURES, 'extract', name);
const DATE = '2026-09-28';

function extract(name) {
  const r = extractDesign(fixture(name), { date: DATE });
  assert.ok(r.text, `${name}: no proposal (${r.mode})`);
  const parsed = parseYaml(splitFrontmatter(r.text).yaml);
  assert.equal(parsed.supported, true);
  assert.deepEqual(parsed.errors, []);
  const v = validateDesign(r.text, { catalog });
  assert.equal(v.reject, false, JSON.stringify(v.findings.filter((f) => f.rejects)));
  return { r, data: parsed.value };
}

test('Tailwind v4 @theme: read from config, namespaces removed, cssVars kept', () => {
  const { r, data } = extract('tailwind-v4');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['app.css']);
  assert.deepEqual(data.colors, {
    primary: 'oklch(0.55 0.2 260)', 'on-primary': 'oklch(0.98 0 0)', surface: 'oklch(1 0 0)', 'on-surface': 'oklch(0.2 0 0)', 'brand-500': 'oklch(0.62 0.18 40)',
  });
  assert.deepEqual(data.rounded, { md: '0.5rem', lg: '0.75rem' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Inter' } });
  assert.deepEqual(data.spacing, { 1: '0.25rem' });
  assert.equal(data.pignolo.cssVars['colors.primary'], '--color-primary');
  assert.equal(data.pignolo.cssVars['rounded.md'], '--radius-md');
  assert.equal(data.pignolo.extracted, undefined);
  assert.equal(data.pignolo.themes, undefined);
});

test('Tailwind v3 literal config: nested DEFAULT/foreground and the first font of the list', () => {
  const { r, data } = extract('tailwind-v3');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['tailwind.config.js']);
  assert.deepEqual(data.colors, { primary: '#0b6bcb', 'on-primary': '#ffffff', surface: '#ffffff', 'on-surface': '#1a1a1a' });
  assert.deepEqual(data.rounded, { lg: '12px' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Inter' } });
  assert.equal(data.pignolo.cssVars, undefined);
});

test(':root and .dark: the dark theme goes to pignolo.themes.dark in OKLCH; other CSS is not counted', () => {
  const { r, data } = extract('css-root');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['styles/tokens.css']);
  assert.equal(r.darkDetected, true);
  assert.deepEqual(Object.keys(data.colors), ['primary', 'on-primary', 'surface', 'on-surface']);
  assert.ok(!r.text.toLowerCase().includes('ff00ff'), 'frequency counting must not run when config exists');
  assert.deepEqual(Object.keys(data.pignolo.themes.dark), ['primary', 'on-primary', 'surface', 'on-surface']);
  for (const v of Object.values(data.pignolo.themes.dark)) assert.match(v, /^oklch\(/);
  assert.deepEqual(data.rounded, { md: '8px' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Source Sans 3' } });
});

test('shadcn: bare HSL becomes hex, foreground becomes on-background', () => {
  const { r, data } = extract('shadcn');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['app/globals.css']);
  assert.deepEqual(data.colors, { background: '#ffffff', 'on-background': '#020817', primary: '#0f172a', 'on-primary': '#f8fafc' });
  assert.deepEqual(Object.keys(data.pignolo.themes.dark), ['background', 'on-background', 'primary', 'on-primary']);
  assert.deepEqual(data.rounded, { md: '0.5rem' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Geist' } });
  assert.equal(data.pignolo.cssVars['colors.on-background'], '--foreground');
});

test('without any config: most frequent colors, font and radii, all marked extracted', () => {
  const { r, data } = extract('frequency');
  assert.equal(r.mode, 'frequency');
  assert.deepEqual(r.from, ['src/site.css']);
  assert.deepEqual(data.colors, { primary: '#0b6bcb', surface: '#ffffff', 'on-surface': '#1a1a1a', 'neutral-1': '#e5e5e5' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Merriweather' } });
  assert.deepEqual(data.rounded, { sm: '6px', lg: '12px' });
  assert.deepEqual(data.pignolo.extracted, ['colors.primary', 'colors.surface', 'colors.on-surface', 'colors.neutral-1', 'typography.body-md', 'rounded.sm', 'rounded.lg']);
  assert.match(r.text, /extracted, not decided/);
});

test('an unreadable config or tokens in JavaScript: no proposal, never a frequency guess', () => {
  const tw = extractDesign(writeTree(makeTempDir(), {
    'tailwind.config.js': "module.exports = { theme: { colors: require('./tokens') } };",
    'src/a.css': '.a { color: #123456; }',
  }), { date: DATE });
  assert.equal(tw.mode, 'unverified');
  assert.equal(tw.text, null);
  assert.equal(tw.unverified[0].kind, 'tailwind-v3');
  const mui = extractDesign(writeTree(makeTempDir(), {
    'package.json': JSON.stringify({ dependencies: { '@mui/material': '^6' } }),
    'src/a.css': '.a { color: #123456; }',
  }), { date: DATE });
  assert.equal(mui.mode, 'unverified');
  assert.equal(mui.text, null);
  assert.equal(mui.unsupported[0].kind, 'mui');
  const empty = extractDesign(makeTempDir(), { date: DATE });
  assert.deepEqual([empty.mode, empty.text], ['none', null]);
});

test('what extract generates uses MD3 names: known aliases are renamed, cssVars keeps the project variable', () => {
  const root = writeTree(makeTempDir(), {
    'styles.css': ':root {\n  --accent: #0b6bcb;\n  --text: #1a1a1a;\n  --bg: #ffffff;\n  --card: #fafafa;\n  --font-body: Inter, sans-serif;\n}\n',
  });
  const r = extractDesign(root, { date: DATE });
  const data = parseYaml(splitFrontmatter(r.text).yaml).value;
  assert.deepEqual(data.colors, { primary: '#0b6bcb', 'on-surface': '#1a1a1a', background: '#ffffff', surface: '#fafafa' });
  assert.deepEqual(data.pignolo.cssVars, { 'colors.primary': '--accent', 'colors.on-surface': '--text', 'colors.background': '--bg', 'colors.surface': '--card' });
  assert.deepEqual(r.renamed, [{ from: 'accent', to: 'primary' }, { from: 'text', to: 'on-surface' }, { from: 'bg', to: 'background' }, { from: 'card', to: 'surface' }]);
  const both = extractDesign(writeTree(makeTempDir(), { 'a.css': ':root { --primary: #000; --accent: #111; --font-body: Inter; }' }), { date: DATE });
  assert.deepEqual(Object.keys(parseYaml(splitFrontmatter(both.text).yaml).value.colors), ['primary', 'accent']);
});

test('CLI extract into the run folder creates .pignolo-ui/.gitignore first and leaves git status clean', () => {
  const repo = writeTree(makeTempDir(), { 'a.css': ':root { --primary: #0b6bcb; --on-primary: #fff; --font-body: Inter; }' });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const out = path.join(repo, '.pignolo-ui', 'runs', '20260928-2100-new-home', 'DESIGN.proposal.md');
  const res = runScript('design-md.mjs', ['extract', '--project', repo, '--out', out, '--date', DATE]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readFileSync(path.join(repo, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  assert.ok(fs.existsSync(out));
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo, encoding: 'utf8' }), '?? a.css\n');
});

test('CLI extract: writes only the proposal, never over a file, never when DESIGN.md exists', () => {
  const dir = makeTempDir();
  const out = path.join(dir, 'proposal.md');
  let res = runScript('design-md.mjs', ['extract', '--project', fixture('css-root'), '--out', out, '--date', DATE]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.json.mode, 'config');
  assert.equal(fs.readFileSync(out, 'utf8'), extractDesign(fixture('css-root'), { date: DATE }).text);
  assert.ok(res.json.diff.split('\n').slice(2).filter(Boolean).every((l) => l.startsWith('+') || l.startsWith('@@')));
  res = runScript('design-md.mjs', ['extract', '--project', fixture('css-root'), '--out', out, '--date', DATE]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /ya existe/);
  const project = writeTree(makeTempDir(), { 'design.md': '# mine\n', 'a.css': ':root { --primary: #000 }' });
  res = runScript('design-md.mjs', ['extract', '--project', project, '--out', path.join(dir, 'p2.md')]);
  assert.equal(res.status, 1);
  assert.equal(res.json.mode, 'exists');
  assert.equal(fs.existsSync(path.join(dir, 'p2.md')), false);
  res = runScript('design-md.mjs', ['extract', '--project', makeTempDir(), '--out', path.join(dir, 'p3.md')]);
  assert.equal(res.status, 1);
  assert.equal(res.json.mode, 'none');
});
```

`plugins/pignolo-ui/tests/run-folder.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree } from './helpers.mjs';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';

test('ensureRunRoot creates .pignolo-ui/.gitignore with * and is idempotent', () => {
  const root = makeTempDir();
  const dir = ensureRunRoot(root);
  assert.equal(dir, path.join(root, RUN_ROOT));
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '*\n');
  assert.equal(ensureRunRoot(root), dir);
});

test('ensureRunRoot never rewrites an existing .gitignore', () => {
  const root = writeTree(makeTempDir(), { '.pignolo-ui/.gitignore': '*\n# kept\n' });
  ensureRunRoot(root);
  assert.equal(fs.readFileSync(path.join(root, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n# kept\n');
});

test('isInsideRunRoot resolves .. before deciding', () => {
  const root = makeTempDir();
  assert.equal(isInsideRunRoot(root, path.join(root, '.pignolo-ui', 'runs', 'x', 'a.md')), true);
  assert.equal(isInsideRunRoot(root, path.join(root, '.pignolo-ui', '..', 'src', 'a.md')), false);
  assert.equal(isInsideRunRoot(root, path.join(root, '.pignolo-ui-other', 'a.md')), false);
  assert.equal(isInsideRunRoot(root, path.join(makeTempDir(), 'a.md')), false);
});
```

En `plugins/pignolo-ui/tests/official-lint.test.mjs`, reemplazar:
```js
import { PLUGIN_ROOT, makeTempDir, writeTree, runScript } from './helpers.mjs';
```
por:
```js
import { PLUGIN_ROOT, FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';
```

En `plugins/pignolo-ui/tests/official-lint.test.mjs`, justo después de:
```js
import { findOfficialLinter, runOfficialLint, PINNED_VERSION } from '../lib/official-lint.mjs';
```
agregar:
```js
import { extractDesign } from '../lib/design-extract.mjs';
```

En `plugins/pignolo-ui/tests/official-lint.test.mjs`, justo después de:
```js
  assert.ok(fs.existsSync(found.entry));
});
```
agregar:
```js

test(`extract outputs of the fixtures pass the official linter ${PINNED_VERSION} with 0/0 (development)`, (t) => {
  const found = findOfficialLinter({ env: process.env });
  if (!found) {
    t.skip(NO_LINTER);
    return;
  }
  for (const name of ['tailwind-v4', 'tailwind-v3', 'css-root', 'shadcn', 'frequency']) {
    const r = extractDesign(path.join(FIXTURES, 'extract', name), { date: '2026-09-28' });
    const file = path.join(makeTempDir(), 'DESIGN.md');
    fs.writeFileSync(file, r.text);
    const lint = runOfficialLint(file, { env: process.env });
    assert.equal(lint.status, 'ran', name);
    assert.deepEqual([lint.errors, lint.warnings], [0, 0], `${name}: ${JSON.stringify(lint.findings)}`);
  }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `design-extract.test.mjs` y `official-lint.test.mjs` (`Cannot find module …/lib/design-extract.mjs`) y `run-folder.test.mjs` (`Cannot find module …/lib/run-folder.mjs`) no cargan (`tests 93`, `pass 90`, `fail 3`).

- [ ] **Step 3: Implementación mínima**

En `plugins/pignolo-ui/lib/token-sources.mjs`, reemplazar:
```js
function blankComments(
```
por:
```js
export function blankComments(
```

En `plugins/pignolo-ui/lib/token-sources.mjs`, reemplazar:
```js
function listCss(
```
por:
```js
export function listCss(
```

En `plugins/pignolo-ui/lib/design-patch.mjs`, reemplazar:
```js
function yamlKey(k) {
```
por:
```js
export function yamlKey(k) {
```

`plugins/pignolo-ui/lib/run-folder.mjs`:
```js
// Run folder root (spec §3.2): <repo>/.pignolo-ui/, with .pignolo-ui/.gitignore = "*"
// created before the first write, so the folder ignores itself without touching any
// versioned file or .git/info/exclude. Runs live in .pignolo-ui/runs/<run-id>/.
import fs from 'node:fs';
import path from 'node:path';

export const RUN_ROOT = '.pignolo-ui';

export function ensureRunRoot(projectRoot) {
  const dir = path.join(projectRoot, RUN_ROOT);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n', { flag: 'wx' });
  return dir;
}

export function isInsideRunRoot(projectRoot, file) {
  const rel = path.relative(path.resolve(projectRoot, RUN_ROOT), path.resolve(file));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
```

`plugins/pignolo-ui/lib/design-extract.mjs`:
```js
// Bootstrap of DESIGN.md from code (spec §4.5 "arranque", A-18). First the configuration that
// already exists (@theme, :root/.dark, shadcn, literal tailwind.config). Only when there is
// none, the most frequent colors, fonts and radii are counted; those tokens go to
// pignolo.extracted ("extracted, not decided"). When the tokens live somewhere pignolo-ui
// cannot read (non-literal config, CSS-in-JS), nothing is proposed: a frequency guess would
// become a second source. The result is a proposal the user confirms as a diff.
//
// extractDesign(root, { date }) -> { mode: 'config'|'frequency'|'unverified'|'none', text, from,
//   extracted, darkDetected, unsupported, unverified }
import fs from 'node:fs';
import path from 'node:path';
import { readTokenSources, listCss, blankComments } from './token-sources.mjs';
import { parseColor, formatColor, detectFormat, toOklch } from './color.mjs';
import { yamlScalar, yamlKey } from './design-patch.mjs';
import { resolveAliases } from './design-doc.mjs';

const OFFICIAL_COLOR_FORMATS = new Set(['hex', 'rgb', 'hsl', 'hwb', 'oklch', 'oklab', 'lab', 'lch']);
const TAILWIND_NAMESPACES = /^(text|leading|tracking|shadow|inset-shadow|drop-shadow|ease|animate|breakpoint|container|blur|perspective|aspect|font-weight|default)-/;
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert']);
const DIMENSION = /^\d*\.?\d+(px|rem|em)$/;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\)/g;
const MAX_FREQUENT_COLORS = 8;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function colorName(raw) {
  let n = raw.toLowerCase();
  if (n.startsWith('color-')) n = n.slice(6);
  if (n === 'foreground') return 'on-background';
  const fg = /^(.*)-foreground$/.exec(n);
  if (fg) return `on-${fg[1]}`;
  return n.replace(/[^a-z0-9-]/g, '-');
}

function firstFamily(value) {
  const first = String(value).split(',')[0].trim().replace(/^["']|["']$/g, '');
  return first && !GENERIC_FONTS.has(first.toLowerCase()) ? first : null;
}

function colorValue(value, vars) {
  const parsed = parseColor(value, { vars });
  if (!parsed.ok) return null;
  return OFFICIAL_COLOR_FORMATS.has(detectFormat(value)) && !parsed.viaVar ? value.trim() : formatColor(parsed.rgba, 'hex');
}

function newTokens() {
  return { colors: {}, typography: {}, rounded: {}, spacing: {}, dark: {}, cssVars: {}, from: [] };
}

function note(t, file) {
  if (!t.from.includes(file)) t.from.push(file);
}

function fromCssSources(sources, t) {
  const light = {};
  const dark = {};
  for (const s of sources) {
    for (const b of s.blocks || []) {
      for (const v of b.vars) {
        const target = b.theme === 'dark' ? dark : light;
        if (!(v.name in target)) target[v.name] = v.value;
      }
    }
  }
  for (const s of sources) {
    for (const b of (s.blocks || []).filter((x) => x.theme !== 'dark')) {
      for (const v of b.vars) {
        const raw = v.name.slice(2);
        const radius = /^radius(?:-(.+))?$/.exec(raw);
        const font = /^font-(.+)$/.exec(raw);
        const spacing = /^spacing(?:-(.+))?$/.exec(raw);
        if (radius) {
          const key = radius[1] || 'md';
          if (DIMENSION.test(v.value) && !(key in t.rounded)) {
            t.rounded[key] = v.value;
            t.cssVars[`rounded.${key}`] = v.name;
            note(t, s.file);
          }
        } else if (font && !/^weight-/.test(font[1])) {
          const family = firstFamily(v.value);
          const key = Object.keys(t.typography).length ? `font-${font[1]}` : 'body-md';
          if (family && !Object.values(t.typography).some((x) => x.fontFamily === family)) {
            t.typography[key] = { fontFamily: family };
            note(t, s.file);
          }
        } else if (spacing) {
          const key = spacing[1] || '1';
          if (DIMENSION.test(v.value) && !(key in t.spacing)) {
            t.spacing[key] = v.value;
            t.cssVars[`spacing.${key}`] = v.name;
            note(t, s.file);
          }
        } else if (!TAILWIND_NAMESPACES.test(raw)) {
          const name = colorName(raw);
          const value = colorValue(v.value, light);
          if (value && !(name in t.colors)) {
            t.colors[name] = value;
            t.cssVars[`colors.${name}`] = v.name;
            note(t, s.file);
          }
        }
      }
    }
  }
  for (const [varName, value] of Object.entries(dark)) {
    const name = colorName(varName.slice(2));
    if (!(name in t.colors) || name in t.dark) continue;
    const parsed = parseColor(value, { vars: { ...light, ...dark } });
    if (parsed.ok) t.dark[name] = formatColor(parsed.rgba, 'oklch');
  }
}

function fromTailwindV3(source, t) {
  for (const leaf of source.leaves) {
    const p = leaf.path[0] === 'extend' ? leaf.path.slice(1) : leaf.path;
    const [section, ...rest] = p;
    if (section === 'colors' && typeof leaf.value === 'string') {
      const parts = rest.map(String);
      let name;
      if (parts[parts.length - 1] === 'DEFAULT') name = parts.slice(0, -1).join('-');
      else if (parts[parts.length - 1] === 'foreground') name = `on-${parts.slice(0, -1).join('-')}`;
      else name = parts.join('-');
      const value = colorValue(leaf.value, {});
      if (name && value && !(name in t.colors)) {
        t.colors[colorName(name)] = value;
        note(t, source.file);
      }
    } else if (section === 'borderRadius' && typeof leaf.value === 'string' && DIMENSION.test(leaf.value)) {
      const key = rest[0] === 'DEFAULT' ? 'md' : String(rest[0]);
      if (!(key in t.rounded)) { t.rounded[key] = leaf.value; note(t, source.file); }
    } else if (section === 'fontFamily' && (rest.length === 1 || rest[1] === 0)) {
      const family = firstFamily(leaf.value);
      const key = Object.keys(t.typography).length ? `font-${rest[0]}` : 'body-md';
      if (family && !Object.values(t.typography).some((x) => x.fontFamily === family)) {
        t.typography[key] = { fontFamily: family };
        note(t, source.file);
      }
    } else if (section === 'spacing' && typeof leaf.value === 'string' && DIMENSION.test(leaf.value)) {
      const key = String(rest[0]);
      if (!(key in t.spacing)) { t.spacing[key] = leaf.value; note(t, source.file); }
    }
  }
}

// What pignolo-ui generates uses MD3 names (spec §4.2): a color read through a default alias
// (accent, text, bg...) is renamed to its MD3 name, keeping its place, its dark value and its
// cssVars link to the project variable.
function toMd3Names(t) {
  const aliases = resolveAliases(t.colors);
  if (!aliases.size) return [];
  const rename = (map, prefix = '') => Object.fromEntries(Object.entries(map).map(([k, v]) => {
    const name = prefix ? k.slice(prefix.length) : k;
    return [prefix && !k.startsWith(prefix) ? k : `${prefix}${aliases.has(name) ? aliases.get(name).as : name}`, v];
  }));
  t.colors = rename(t.colors);
  t.dark = rename(t.dark);
  t.cssVars = rename(t.cssVars, 'colors.');
  return [...aliases].map(([from, a]) => ({ from, to: a.as }));
}

function bump(map, key, order, file, t) {
  const cur = map.get(key);
  if (cur) cur.count++;
  else map.set(key, { count: 1, first: order });
  note(t, file);
}

function byCount(map) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first).map(([k]) => k);
}

function fromFrequency(root, t) {
  const colors = new Map();
  const fonts = new Map();
  const radii = new Map();
  let order = 0;
  for (const file of listCss(root, 2000).files) {
    const text = blankComments(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const m of text.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1].toLowerCase();
      const value = m[2].trim();
      if (prop.startsWith('--')) continue;
      for (const c of value.matchAll(COLOR_LITERAL)) {
        const parsed = parseColor(c[0]);
        if (parsed.ok) bump(colors, formatColor(parsed.rgba, 'hex'), order++, file, t);
      }
      if (prop === 'font-family') {
        const family = firstFamily(value);
        if (family) bump(fonts, family, order++, file, t);
      }
      if (prop === 'border-radius' && DIMENSION.test(value)) bump(radii, value, order++, file, t);
    }
  }
  const top = byCount(colors).slice(0, MAX_FREQUENT_COLORS);
  const chroma = (hex) => toOklch(parseColor(hex).rgba).c;
  const lightness = (hex) => toOklch(parseColor(hex).rgba).l;
  const accents = top.filter((h) => chroma(h) >= 0.05);
  const neutrals = top.filter((h) => chroma(h) < 0.05).sort((a, b) => lightness(b) - lightness(a));
  accents.forEach((hex, i) => { t.colors[i === 0 ? 'primary' : `accent-${i + 1}`] = hex; });
  if (neutrals.length) t.colors.surface = neutrals[0];
  if (neutrals.length > 1) t.colors['on-surface'] = neutrals[neutrals.length - 1];
  neutrals.slice(1, -1).forEach((hex, i) => { t.colors[`neutral-${i + 1}`] = hex; });
  const font = byCount(fonts)[0];
  if (font) t.typography['body-md'] = { fontFamily: font };
  const toPx = (v) => Number.parseFloat(v) * (v.endsWith('px') ? 1 : 16);
  const r = byCount(radii).slice(0, 3).sort((a, b) => toPx(a) - toPx(b));
  const names = r.length === 1 ? ['md'] : r.length === 2 ? ['sm', 'lg'] : ['sm', 'md', 'lg'];
  r.forEach((v, i) => { t.rounded[names[i]] = v; });
}

function render(t, { name, date, extracted }) {
  const lines = ['---', 'version: alpha', `name: ${yamlScalar(name)}`];
  const intro = extracted.length
    ? `Extracted from the project code on ${date}; the tokens listed in pignolo.extracted are extracted, not decided.`
    : `Extracted from the project configuration on ${date}; review before accepting.`;
  lines.push(`description: ${yamlScalar(intro)}`);
  const section = (key, map, fn = (v) => [`  ${yamlKey(v[0])}: ${yamlScalar(v[1])}`]) => {
    if (!Object.keys(map).length) return;
    lines.push(`${key}:`);
    for (const entry of Object.entries(map)) lines.push(...fn(entry));
  };
  section('colors', t.colors);
  section('typography', t.typography, ([k, v]) => [`  ${yamlKey(k)}:`, `    fontFamily: ${yamlScalar(v.fontFamily)}`]);
  section('rounded', t.rounded);
  section('spacing', t.spacing);
  lines.push('pignolo:', '  schema: 1');
  if (Object.keys(t.dark).length) {
    lines.push('  themes:', '    dark:');
    for (const [k, v] of Object.entries(t.dark)) lines.push(`      ${yamlKey(k)}: ${yamlScalar(v)}`);
  }
  if (Object.keys(t.cssVars).length) {
    lines.push('  cssVars:');
    for (const [k, v] of Object.entries(t.cssVars)) lines.push(`    ${yamlKey(k)}: ${yamlScalar(v)}`);
  }
  if (extracted.length) {
    lines.push('  extracted:');
    for (const p of extracted) lines.push(`    - ${yamlScalar(p)}`);
  }
  lines.push('---', '', `# ${name}`, '', '## Overview', '', intro, 'Platform, register, hierarchy and reading order are still to be decided.', '', '## Decisions', '');
  return lines.join('\n');
}

function projectName(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  } catch {
    // no package.json
  }
  return path.basename(path.resolve(root));
}

export function extractDesign(root, { date = today() } = {}) {
  const found = readTokenSources(root);
  const base = { from: [], extracted: [], darkDetected: found.darkDetected, unsupported: found.unsupported, unverified: found.unverified };
  const t = newTokens();
  fromCssSources(found.sources.filter((s) => s.kind !== 'tailwind-v3'), t);
  for (const s of found.sources.filter((x) => x.kind === 'tailwind-v3')) fromTailwindV3(s, t);
  const renamed = toMd3Names(t);
  let mode = 'config';
  let extracted = [];
  if (!Object.keys(t.colors).length) {
    if (found.unverified.length || found.unsupported.length) return { ...base, mode: 'unverified', text: null };
    Object.assign(t, newTokens());
    fromFrequency(root, t);
    if (!Object.keys(t.colors).length) return { ...base, mode: 'none', text: null };
    mode = 'frequency';
    extracted = [
      ...Object.keys(t.colors).map((k) => `colors.${k}`),
      ...Object.keys(t.typography).map((k) => `typography.${k}`),
      ...Object.keys(t.rounded).map((k) => `rounded.${k}`),
    ];
  }
  const text = render(t, { name: projectName(root), date, extracted });
  return { ...base, mode, text, from: t.from, extracted, renamed };
}
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, justo después de:
```js
//   patch:    0 diff computed (written with --write), 1 refused or not applicable, 2 own error
```
agregar:
```js
//   extract:  0 proposal written to --out, 1 nothing to propose (DESIGN.md exists, unreadable or no tokens), 2 own error
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, reemplazar:
```js
import { patchDesign } from '../lib/design-patch.mjs';
```
por:
```js
import { patchDesign, formatDiff } from '../lib/design-patch.mjs';
import { extractDesign } from '../lib/design-extract.mjs';
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, justo después de:
```js
import { extractDesign } from '../lib/design-extract.mjs';
```
agregar:
```js
import { ensureRunRoot, isInsideRunRoot } from '../lib/run-folder.mjs';
```

En `plugins/pignolo-ui/scripts/design-md.mjs`, reemplazar:
```js
const COMMANDS = { validate: cmdValidate, patch: cmdPatch };
```
por:
```js
// Writes a proposal (never DESIGN.md itself, never over an existing file); the diff is shown
// and the user confirms it before the flow copies it to DESIGN.md.
function cmdExtract(opts) {
  if (!opts.project || !opts.out) throw new UsageError('faltan --project <raíz del repo> y --out <archivo de propuesta>');
  if (fs.existsSync(opts.out)) throw new UsageError(`${opts.out} ya existe: extract nunca sobrescribe`);
  const existing = fs.readdirSync(opts.project).find((n) => n.toLowerCase() === 'design.md');
  if (existing) return { out: { mode: 'exists', file: existing }, code: 1 };
  const r = extractDesign(opts.project, opts.date ? { date: opts.date } : {});
  if (!r.text) return { out: { mode: r.mode, unsupported: r.unsupported, unverified: r.unverified }, code: 1 };
  if (isInsideRunRoot(opts.project, opts.out)) {
    ensureRunRoot(opts.project); // .gitignore before the first write (spec §3.2)
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  }
  fs.writeFileSync(opts.out, r.text, { flag: 'wx' });
  const v = validateDesign(r.text, { catalog: loadCatalog(opts), darkInCss: r.darkDetected });
  const diff = formatDiff([{ line: 1, removed: [], added: r.text.replace(/\n$/, '').split('\n') }]);
  return {
    out: {
      mode: r.mode, out: opts.out, from: r.from, extracted: r.extracted, renamed: r.renamed, darkDetected: r.darkDetected,
      unsupported: r.unsupported, unverified: r.unverified, validation: { status: v.status, findings: v.findings }, diff,
    },
    code: 0,
  };
}

const COMMANDS = { validate: cmdValidate, patch: cmdPatch, extract: cmdExtract };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS con dos skips visibles del linter oficial (`tests 107`, `pass 105`, `fail 0`, `skipped 2`).
Run: `npm test`
Expected: PASS (núcleo + 107, `skipped 2`).
Con `PIGNOLO_UI_DESIGNMD` (ver Task 9): `tests 107`, `pass 107`: las cinco salidas de `extract` pasan el linter oficial con 0/0.

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `extractDesign`, llamar además `fromFrequency(root, t);` justo después de `let mode = 'config';` | `:root and .dark: the dark theme goes to pignolo.themes.dark in OKLCH; other CSS is not counted`, `without any config: most frequent colors, font and radii, all marked extracted` y `an unreadable config or tokens in JavaScript: no proposal, never a frequency guess` |
| En `extractDesign`, borrar la línea `if (found.unverified.length \|\| found.unsupported.length) return { … mode: 'unverified' … };` | `an unreadable config or tokens in JavaScript: no proposal, never a frequency guess` |
| En `colorName`, borrar la línea `if (n === 'foreground') return 'on-background';` | `shadcn: bare HSL becomes hex, foreground becomes on-background` |
| En `fromCssSources`, escribir el tema oscuro en hex (`formatColor(parsed.rgba, 'hex')`) | `:root and .dark: …` y `shadcn: bare HSL becomes hex, foreground becomes on-background` |
| En `extractDesign`, vaciar `extracted = [];` justo antes de `render(…)` | `without any config: most frequent colors, font and radii, all marked extracted` |
| En `cmdExtract`, borrar la línea `if (fs.existsSync(opts.out)) throw new UsageError(…nunca sobrescribe…);` | `CLI extract: writes only the proposal, never over a file, never when DESIGN.md exists` |
| En `extractDesign`, fijar `const renamed = [];` en lugar de `toMd3Names(t)` | `what extract generates uses MD3 names: known aliases are renamed, cssVars keeps the project variable` |
| En `toMd3Names`, borrar la línea `t.cssVars = rename(t.cssVars, 'colors.');` | `what extract generates uses MD3 names: known aliases are renamed, cssVars keeps the project variable` |
| En `cmdExtract`, borrar la línea `ensureRunRoot(opts.project);` | `CLI extract into the run folder creates .pignolo-ui/.gitignore first and leaves git status clean` |
| En `ensureRunRoot`, escribir siempre (`fs.writeFileSync(ignore, '*\n');`) | `ensureRunRoot never rewrites an existing .gitignore` |
| En `isInsideRunRoot`, comparar el texto de la ruta sin resolver (`String(file).startsWith(path.join(projectRoot, RUN_ROOT))`) | `isInsideRunRoot resolves .. before deciding` |

- [ ] **Step 6: Commit**

```text
feat(ui): design-md extract desde la configuración existente, nombres MD3 y carpeta del run ignorada
```
```bash
git add plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

### Task 11: Chequeo de fuga (`leak-check`)

**Files:**
- Create: `plugins/pignolo-ui/lib/leak-check.mjs`, `plugins/pignolo-ui/scripts/leak-check.mjs`
- Test: `plugins/pignolo-ui/tests/leak-check.test.mjs`

**Interfaces:**
- Consumes: `tests/helpers.mjs` (`makeTempDir`, `writeTree`, `runScript`).
- Produces:
  - `findLeaks(text, values = []) -> [{ kind: 'value', index, line } | { kind: 'path', match, line }]`: valores sin distinguir mayúsculas (se ignoran los de menos de `MIN_VALUE_LENGTH = 3` caracteres) y rutas absolutas locales (`C:\`, `D:/`, `/Users/`, `/home/`). Nunca repite un valor: da su índice.
  - `checkLeaks(dir, values = []) -> { files, leaks: [{ file, ...leak }] }` (recorre toda la carpeta).
  - `readValuesFile(file) -> string[]` (lista JSON de strings; si no, error).
  - CLI: `node scripts/leak-check.mjs --dir <carpeta> [--values-file <lista JSON>]` → `{ ok, leaks }`; sale 0 limpio, 1 con alguna fuga, 2 error propio.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/leak-check.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';
import { findLeaks, checkLeaks } from '../lib/leak-check.mjs';

// Synthetic identities only: nothing here belongs to a real person or machine.
const VALUES = ['ana.perez@example.com', 'Ana Pérez', 'aperez'];

test('user values are found without case, with their line', () => {
  const text = '<p>Hola</p>\n<p>Contacto: ANA.PEREZ@example.com</p>\n<footer>hecho por ana pérez</footer>\n';
  assert.deepEqual(findLeaks(text, VALUES), [
    { kind: 'value', index: 0, line: 2 },
    { kind: 'value', index: 1, line: 3 },
  ]);
  assert.deepEqual(findLeaks('<p>‹Nombre›</p>\n', VALUES), []);
});

test('absolute local paths of Windows, macOS and Linux are found; relative ones and URLs are not', () => {
  const leaks = (s) => findLeaks(s, []).map((l) => l.match);
  assert.deepEqual(leaks('<img src="C:\\Users\\x\\a.png">'), ['C:\\']);
  assert.deepEqual(leaks('ver D:/proyectos/app'), ['D:/']);
  assert.deepEqual(leaks('/Users/aperez/app/page.tsx'), ['/Users/']);
  assert.deepEqual(leaks('cd /home/aperez/app'), ['/home/']);
  assert.deepEqual(leaks('<a href="https://example.com/home/x">x</a> src/home/a.png ../Users/b mailto:x@example.com'), []);
});

test('short values are ignored so a two-letter user does not flag every word', () => {
  assert.deepEqual(findLeaks('mi casa', ['mi', '']), []);
});

test('checkLeaks scans every file and never echoes the values back', () => {
  const dir = writeTree(makeTempDir(), {
    'home.html': '<p>ok</p>\n',
    'detail.html': '<p>aperez</p>\n<p>/home/someone/x</p>\n',
  });
  const r = checkLeaks(dir, VALUES);
  assert.deepEqual(r.leaks, [
    { file: 'detail.html', kind: 'value', index: 2, line: 1 },
    { file: 'detail.html', kind: 'path', match: '/home/', line: 2 },
  ]);
  assert.ok(!JSON.stringify(r).includes('aperez'));
  assert.deepEqual(checkLeaks(writeTree(makeTempDir(), { 'a.html': '<p>‹Dato›</p>' }), VALUES).leaks, []);
});

test('CLI: exit 0 clean, 1 with a leak, 2 on a bad values file', () => {
  const values = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(values, JSON.stringify(VALUES));
  const clean = writeTree(makeTempDir(), { 'a.html': '<p>ok</p>' });
  let out = runScript('leak-check.mjs', ['--dir', clean, '--values-file', values]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.json, { ok: true, leaks: [] });
  out = runScript('leak-check.mjs', ['--dir', writeTree(makeTempDir(), { 'a.html': 'Ana Pérez' }), '--values-file', values]);
  assert.equal(out.status, 1);
  assert.equal(out.json.ok, false);
  fs.writeFileSync(values, '{"not":"a list"}');
  out = runScript('leak-check.mjs', ['--dir', clean, '--values-file', values]);
  assert.equal(out.status, 2);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `leak-check.test.mjs` no carga (`Cannot find module …/lib/leak-check.mjs`) (`tests 108`, `pass 105`, `fail 1`, `skipped 2`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/lib/leak-check.mjs`:
```js
// Leak check (spec §7.4): before an option is published or saved as approved, its files must
// not carry data of the user or the machine: the values the skill passes (session email, git
// user.name / user.email, OS user, home) and any absolute local path (Windows drive,
// /Users/, /home/). Deterministic; the output never echoes a value back (index only).
//
// findLeaks(text, values) -> [{ kind: 'value', index, line } | { kind: 'path', match, line }]
// checkLeaks(dir, values) -> { files, leaks: [{ file, ...leak }] }
import fs from 'node:fs';
import path from 'node:path';

export const MIN_VALUE_LENGTH = 3;
const ABSOLUTE_PATH = /(?<![\w.~-])(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)/g;

export function findLeaks(text, values = []) {
  const wanted = values
    .map((v, index) => ({ v: String(v ?? '').trim().toLocaleLowerCase(), index }))
    .filter((x) => x.v.length >= MIN_VALUE_LENGTH);
  const leaks = [];
  String(text).split('\n').forEach((raw, i) => {
    const line = raw.toLocaleLowerCase();
    for (const w of wanted) if (line.includes(w.v)) leaks.push({ kind: 'value', index: w.index, line: i + 1 });
    for (const m of raw.matchAll(ABSOLUTE_PATH)) leaks.push({ kind: 'path', match: m[0], line: i + 1 });
  });
  return leaks;
}

export function checkLeaks(dir, values = []) {
  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else files.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  files.sort();
  const leaks = [];
  for (const f of files) {
    for (const l of findLeaks(fs.readFileSync(path.join(dir, f), 'utf8'), values)) leaks.push({ file: f, ...l });
  }
  return { files, leaks };
}

// Reads the JSON list of values the skill passes; throws on anything else.
export function readValuesFile(file) {
  const values = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) throw new Error('the values file must be a JSON list of strings');
  return values;
}
```

`plugins/pignolo-ui/scripts/leak-check.mjs`:
```js
// leak-check.mjs --dir <folder> [--values-file <json list>] (spec §7.4)
// Prints { ok, leaks } on stdout. Exit 0 clean, 1 at least one leak, 2 own error.
// The values (email, git name and email, OS user, home) come as a file argument: they
// never reach this script through the environment.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLeaks, readValuesFile } from '../lib/leak-check.mjs';

export function main(argv) {
  try {
    const opts = {};
    for (let i = 0; i < argv.length; i += 2) {
      if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`argumento inesperado: ${argv[i]}`);
      opts[argv[i].slice(2)] = argv[i + 1];
    }
    if (!opts.dir) throw new Error('falta --dir <carpeta>');
    const values = opts['values-file'] ? readValuesFile(opts['values-file']) : [];
    const { leaks } = checkLeaks(opts.dir, values);
    process.stdout.write(`${JSON.stringify({ ok: leaks.length === 0, leaks }, null, 2)}\n`);
    return leaks.length ? 1 : 0;
  } catch (e) {
    process.stderr.write(`leak-check: ${e.message}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 112`, `pass 110`, `fail 0`, `skipped 2`).
Run: `npm test`
Expected: PASS (núcleo + 112, `skipped 2`).

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `findLeaks`, comparar sin pasar la línea a minúsculas (`const line = raw;`) | `user values are found without case, with their line` y `CLI: exit 0 clean, 1 with a leak, 2 on a bad values file` |
| En `ABSOLUTE_PATH`, quitar el `(?<![\w.~-])` inicial | `absolute local paths of Windows, macOS and Linux are found; relative ones and URLs are not` |
| Filtrar con `x.v.length > 0` en lugar de `>= MIN_VALUE_LENGTH` | `short values are ignored so a two-letter user does not flag every word` |
| Agregar `value: w.v` al hallazgo de valor | `user values are found without case, with their line` y `checkLeaks scans every file and never echoes the values back` |
| En el CLI, devolver siempre `0` | `CLI: exit 0 clean, 1 with a leak, 2 on a bad values file` |

- [ ] **Step 6: Commit**

```text
feat(ui): chequeo de fuga de datos del usuario y de la máquina en las salidas
```
```bash
git add plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

### Task 12: Aprobados versionados (`approve save | record | verify`)

**Files:**
- Create: `plugins/pignolo-ui/lib/approved.mjs`, `plugins/pignolo-ui/scripts/approve.mjs`
- Test: `plugins/pignolo-ui/tests/approve.test.mjs`

**Interfaces:**
- Consumes: `patchDesign` (Task 8); `checkLeaks`, `readValuesFile` (Task 11); fixture `valid.md` (Task 7).
- Produces:
  - `checkScreens(dir) -> { files, problems: [{ file, problem, href? }] }` con `problem` ∈ `subfolder`, `not-html`, `bad-name`, `empty`, `no-charset`, `script`, `remote-resource`, `broken-link`.
  - `saveApproved({ projectRoot, flow, from, date, leakValues = [] }) -> { ok: true, path, version, manifestSha256 } | { ok: false, problems }`. Antes de escribir corre el chequeo de fuga (§7.4) y suma cada fuga como `{ file, problem: 'leak', kind, index | match, line }`, sin repetir el valor. `path` = `design/approved/<flujo>` o `<flujo>-vN`; nunca escribe sobre una carpeta existente.
  - `decisionEntry({ path, manifestSha256, date, quote }) -> string` = `` - <fecha> — approved `<path>/` (manifest sha256 `<hex>`): "<cita>" ``.
  - `verifyApproved({ projectRoot, approvedPath }) -> { status: 'ok' | 'BLOCKED', problems }` con `problem` ∈ `bad-path`, `no-design-md`, `no-entry`, `manifest-unreadable`, `manifest-sha-mismatch`, `missing-file`, `file-changed`, `extra-file`; vale la última entrada de esa ruta en `DESIGN.md`.
  - `APPROVED_PATH`, `findDesignFile(projectRoot)`, `manifestSha(projectRoot, approvedPath)`.
  - CLI: ver la cabecera de `scripts/approve.mjs`.

- [ ] **Step 1: Escribir el test que falla**

`plugins/pignolo-ui/tests/approve.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { saveApproved, verifyApproved, checkScreens, decisionEntry } from '../lib/approved.mjs';

const DESIGN = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const page = (title, extra = '') => `<!doctype html>\n<html lang="es">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body><main><h1 data-sample>‹${title}›</h1>${extra}</main></body>\n</html>\n`;

function screens(tree = {}) {
  return writeTree(makeTempDir(), {
    'home.html': page('Inicio', '<a href="detail.html#top">Ver</a>'),
    'detail.html': page('Detalle', '<a href="home.html">Volver</a> <a href="https://example.com">Ayuda</a>'),
    ...tree,
  });
}

function project() {
  return writeTree(makeTempDir(), { 'DESIGN.md': DESIGN });
}

test('save writes the folder and a manifest with the sha256 of every screen', () => {
  const root = project();
  const r = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-28' });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.path, 'design/approved/checkout');
  assert.equal(r.version, 1);
  const dir = path.join(root, 'design', 'approved', 'checkout');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['detail.html', 'home.html', 'manifest.json']);
  const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
  assert.equal(r.manifestSha256, sha(manifestBytes));
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(manifest, {
    flow: 'checkout',
    version: 1,
    date: '2026-09-28',
    files: ['detail.html', 'home.html'].map((f) => ({ path: f, sha256: sha(fs.readFileSync(path.join(dir, f))) })),
  });
});

test('an approved folder is never overwritten: a new approval creates -v2, then -v3', () => {
  const root = project();
  const first = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-28' });
  const before = fs.readFileSync(path.join(root, first.path, 'home.html'));
  const second = saveApproved({ projectRoot: root, flow: 'checkout', from: screens({ 'home.html': page('Inicio 2', '<a href="detail.html">x</a>') }), date: '2026-09-29' });
  const third = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  assert.deepEqual([second.path, second.version, third.path, third.version], ['design/approved/checkout-v2', 2, 'design/approved/checkout-v3', 3]);
  assert.deepEqual(fs.readFileSync(path.join(root, first.path, 'home.html')), before);
});

test('screens that are not self-contained static HTML are refused and nothing is written', () => {
  const cases = {
    'no-charset': { 'home.html': '<html><title>x</title><a href="detail.html">d</a></html>' },
    script: { 'home.html': page('x', '<script>alert(1)</script><a href="detail.html">d</a>') },
    'remote-resource': { 'home.html': page('x', '<img src="https://cdn.example.com/a.png" alt=""><a href="detail.html">d</a>') },
    'remote-resource ': { 'home.html': page('x', '<style>@import url("//fonts.example.com/f.css");</style><a href="detail.html">d</a>') },
    'broken-link': { 'home.html': page('x', '<a href="missing.html">m</a>') },
    'broken-link ': { 'home.html': page('x', '<a href="/detail.html">m</a>') },
    'not-html': { 'notes.txt': 'x' },
    'bad-name': { 'Home Page.html': page('x') },
  };
  for (const [problem, tree] of Object.entries(cases)) {
    const root = project();
    const r = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(tree), date: '2026-09-28' });
    assert.equal(r.ok, false, problem);
    assert.ok(r.problems.some((p) => p.problem === problem.trim()), `${problem}: ${JSON.stringify(r.problems)}`);
    assert.equal(fs.existsSync(path.join(root, 'design', 'approved', 'checkout')), false, problem);
  }
  const sub = screens();
  fs.mkdirSync(path.join(sub, 'assets'));
  assert.ok(checkScreens(sub).problems.some((p) => p.problem === 'subfolder'));
  assert.deepEqual(checkScreens(makeTempDir()).problems, [{ file: '', problem: 'empty' }]);
  assert.equal(saveApproved({ projectRoot: project(), flow: 'Check Out', from: screens(), date: '2026-09-28' }).ok, false);
});

test('save refuses screens that leak user or machine data (spec 7.4); nothing is written', () => {
  const cases = [
    [{ 'home.html': page('x', '<a href="detail.html">d</a><p>/Users/someone/app</p>') }, []],
    [{ 'detail.html': page('Detalle', '<a href="home.html">v</a><p>Hecho por Ana Pérez</p>') }, ['Ana Pérez']],
  ];
  for (const [tree, leakValues] of cases) {
    const root = project();
    const r = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(tree), date: '2026-09-28', leakValues });
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.problem === 'leak'), JSON.stringify(r.problems));
    assert.ok(!JSON.stringify(r.problems).includes('Ana'));
    assert.equal(fs.existsSync(path.join(root, 'design', 'approved', 'checkout')), false);
  }
  const values = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(values, JSON.stringify(['Ana Pérez']));
  const out = runScript('approve.mjs', ['save', '--project', project(), '--flow', 'checkout', '--from', screens(cases[1][0]), '--values-file', values]);
  assert.equal(out.status, 1);
  assert.equal(out.json.problems[0].problem, 'leak');
});

test('decisionEntry cites the path, the manifest sha256, the date and the literal choice', () => {
  assert.equal(
    decisionEntry({ path: 'design/approved/checkout', manifestSha256: 'a'.repeat(64), date: '2026-09-28', quote: 'B con la\ncabecera de A' }),
    `- 2026-09-28 — approved \`design/approved/checkout/\` (manifest sha256 \`${'a'.repeat(64)}\`): "B con la cabecera de A"`,
  );
});

function approvedProject() {
  const root = project();
  const saved = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-28' });
  const entry = decisionEntry({ ...saved, date: '2026-09-28', quote: 'B' });
  fs.writeFileSync(path.join(root, 'DESIGN.md'), `${DESIGN}\n${entry}\n`);
  return { root, saved, dir: path.join(root, saved.path) };
}

test('verify: an untouched approval registered in DESIGN.md is ok', () => {
  const { root, saved } = approvedProject();
  assert.deepEqual(verifyApproved({ projectRoot: root, approvedPath: saved.path }), { status: 'ok', problems: [] });
});

test('verify: an edited, added or removed file, or an edited manifest, is BLOCKED', () => {
  const edits = {
    'file-changed': ({ dir }) => fs.appendFileSync(path.join(dir, 'home.html'), '<!-- edited -->'),
    'extra-file': ({ dir }) => fs.writeFileSync(path.join(dir, 'extra.html'), page('x')),
    'missing-file': ({ dir }) => fs.rmSync(path.join(dir, 'detail.html')),
    'manifest-sha-mismatch': ({ dir }) => fs.appendFileSync(path.join(dir, 'manifest.json'), '\n'),
    'no-entry': ({ root }) => fs.writeFileSync(path.join(root, 'DESIGN.md'), DESIGN),
  };
  for (const [problem, edit] of Object.entries(edits)) {
    const p = approvedProject();
    edit(p);
    const r = verifyApproved({ projectRoot: p.root, approvedPath: p.saved.path });
    assert.equal(r.status, 'BLOCKED', problem);
    assert.ok(r.problems.some((x) => x.problem === problem), `${problem}: ${JSON.stringify(r.problems)}`);
  }
});

test('verify and record only accept design/approved/<flow> paths', () => {
  const { root } = approvedProject();
  for (const p of ['../outside', 'design/approved/../../x', 'design/approved/', 'src/checkout']) {
    assert.deepEqual(verifyApproved({ projectRoot: root, approvedPath: p }), { status: 'BLOCKED', problems: [{ problem: 'bad-path' }] }, p);
  }
  const quote = path.join(makeTempDir(), 'q.txt');
  fs.writeFileSync(quote, 'x');
  const out = runScript('approve.mjs', ['record', '--project', root, '--path', '../outside', '--quote-file', quote]);
  assert.equal(out.status, 1);
  assert.equal(out.json.error, 'bad-path');
});

test('verify uses the latest entry for the path', () => {
  const { root, saved } = approvedProject();
  const stale = decisionEntry({ path: saved.path, manifestSha256: 'b'.repeat(64), date: '2026-09-27', quote: 'old' });
  const text = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), text.replace('\n- 2026-09-28', `\n${stale}\n- 2026-09-28`));
  assert.equal(verifyApproved({ projectRoot: root, approvedPath: saved.path }).status, 'ok');
  fs.appendFileSync(path.join(root, 'DESIGN.md'), `${stale}\n`);
  assert.equal(verifyApproved({ projectRoot: root, approvedPath: saved.path }).status, 'BLOCKED');
});

test('CLI: save, record (diff first, then --write) and verify', () => {
  const root = project();
  const from = screens();
  const quote = path.join(makeTempDir(), 'quote.txt');
  fs.writeFileSync(quote, 'Me quedo con la B');
  let out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', from, '--date', '2026-09-28']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.path, 'design/approved/checkout');
  out = runScript('approve.mjs', ['verify', '--project', root, '--path', 'design/approved/checkout']);
  assert.equal(out.status, 1);
  assert.equal(out.json.status, 'BLOCKED');
  out = runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', quote, '--date', '2026-09-28']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.written, false);
  assert.match(out.json.diff, /\+- 2026-09-28 — approved `design\/approved\/checkout\/`/);
  assert.equal(fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8'), DESIGN);
  out = runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', quote, '--date', '2026-09-28', '--write']);
  assert.equal(out.json.written, true);
  out = runScript('approve.mjs', ['verify', '--project', root, '--path', 'design/approved/checkout']);
  assert.equal(out.status, 0, out.stdout);
  out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', path.join(root, 'nope')]);
  assert.equal(out.status, 2);
  out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', screens({ 'home.html': page('x', '<script></script>') })]);
  assert.equal(out.status, 1);
  assert.equal(out.json.ok, false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:ui`
Expected: FAIL — `approve.test.mjs` no carga (`Cannot find module …/lib/approved.mjs`) (`tests 113`, `pass 110`, `fail 1`, `skipped 2`).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo-ui/lib/approved.mjs`:
```js
// Approved visual decisions (spec §3.3, A-19, A-20): design/approved/<flow>/ holds one static
// HTML per screen plus manifest.json with the sha256 of each file. An approval is immutable:
// a change creates <flow>-v2 (-v3...). DESIGN.md "## Decisions" registers the path and the
// sha256 of the manifest; verify checks both before anything is implemented.
//
// checkScreens(dir) -> { files, problems }      saveApproved({ projectRoot, flow, from, date, leakValues })
// decisionEntry({ path, manifestSha256, date, quote })   verifyApproved({ projectRoot, approvedPath })
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkLeaks } from './leak-check.mjs';

const FLOW = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SCREEN = /^[a-z0-9][a-z0-9-]*\.html$/;
const RESOURCE_TAG = /<(img|script|link|iframe|video|audio|source|embed|object|image|use|track|input)\b[^>]*>/gi;
const REMOTE_ATTR = /\b(?:src|href|srcset|poster|data|xlink:href)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const REMOTE_CSS = /url\(\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\/|@import\s+["']\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

export function checkScreens(dir) {
  const problems = [];
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) problems.push({ file: ent.name, problem: 'subfolder' });
    else if (!ent.name.toLowerCase().endsWith('.html')) problems.push({ file: ent.name, problem: 'not-html' });
    else if (!SCREEN.test(ent.name)) problems.push({ file: ent.name, problem: 'bad-name' });
    else files.push(ent.name);
  }
  if (!files.length && !problems.length) problems.push({ file: '', problem: 'empty' });
  for (const f of files.sort()) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/<meta\s[^>]*charset\s*=\s*["']?utf-8/i.test(html)) problems.push({ file: f, problem: 'no-charset' });
    if (/<script\b/i.test(html)) problems.push({ file: f, problem: 'script' });
    const remoteTag = [...html.matchAll(RESOURCE_TAG)].some((m) => REMOTE_ATTR.test(m[0]));
    if (remoteTag || REMOTE_CSS.test(html)) problems.push({ file: f, problem: 'remote-resource' });
    for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi)) {
      const href = m[1].trim();
      if (href === '' || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
      const target = href.split(/[?#]/)[0];
      if (href.startsWith('/') || !files.includes(target)) problems.push({ file: f, problem: 'broken-link', href });
    }
  }
  return { files, problems };
}

export function saveApproved({ projectRoot, flow, from, date, leakValues = [] }) {
  if (!FLOW.test(flow || '')) return { ok: false, problems: [{ file: '', problem: 'bad-flow-name' }] };
  const { files, problems } = checkScreens(from);
  // leak check before saving as approved (spec §7.4); values are never echoed back
  for (const l of checkLeaks(from, leakValues).leaks) {
    const { file, kind, line } = l;
    problems.push(kind === 'path' ? { file, problem: 'leak', kind, match: l.match, line } : { file, problem: 'leak', kind, index: l.index, line });
  }
  if (problems.length) return { ok: false, problems };
  const base = path.join(projectRoot, 'design', 'approved');
  fs.mkdirSync(base, { recursive: true });
  let version = 1;
  let name = flow;
  while (fs.existsSync(path.join(base, name))) {
    version++;
    name = `${flow}-v${version}`;
  }
  const dir = path.join(base, name);
  fs.mkdirSync(dir); // not recursive: fails instead of writing into a folder that appeared meanwhile
  const entries = [];
  for (const f of files) {
    fs.copyFileSync(path.join(from, f), path.join(dir, f), fs.constants.COPYFILE_EXCL);
    entries.push({ path: f, sha256: sha256(fs.readFileSync(path.join(dir, f))) });
  }
  const manifest = `${JSON.stringify({ flow, version, date, files: entries }, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest, { flag: 'wx' });
  return { ok: true, path: posix(path.relative(projectRoot, dir)), version, manifestSha256: sha256(fs.readFileSync(path.join(dir, 'manifest.json'))) };
}

export function decisionEntry({ path: p, manifestSha256, date, quote }) {
  const q = String(quote).replace(/\s+/g, ' ').trim();
  return `- ${date} — approved \`${p}/\` (manifest sha256 \`${manifestSha256}\`): "${q}"`;
}

export function findDesignFile(projectRoot) {
  const name = fs.readdirSync(projectRoot).find((n) => n.toLowerCase() === 'design.md');
  return name ? path.join(projectRoot, name) : null;
}

export function manifestSha(projectRoot, approvedPath) {
  return sha256(fs.readFileSync(path.join(projectRoot, ...approvedPath.split('/'), 'manifest.json')));
}

export const APPROVED_PATH = /^design\/approved\/[a-z0-9][a-z0-9-]{0,63}$/;

export function verifyApproved({ projectRoot, approvedPath }) {
  const problems = [];
  const blocked = () => ({ status: 'BLOCKED', problems });
  if (!APPROVED_PATH.test(approvedPath || '')) {
    problems.push({ problem: 'bad-path' });
    return blocked();
  }
  const designFile = findDesignFile(projectRoot);
  if (!designFile) {
    problems.push({ problem: 'no-design-md' });
    return blocked();
  }
  const text = fs.readFileSync(designFile, 'utf8');
  const escaped = approvedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entries = [...text.matchAll(new RegExp(`\`${escaped}/\`[^\\n]*?sha256 \`([0-9a-f]{64})\``, 'g'))];
  if (!entries.length) {
    problems.push({ problem: 'no-entry' });
    return blocked();
  }
  const expected = entries[entries.length - 1][1];
  const dir = path.join(projectRoot, ...approvedPath.split('/'));
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    problems.push({ problem: 'manifest-unreadable' });
    return blocked();
  }
  if (manifestSha(projectRoot, approvedPath) !== expected) problems.push({ problem: 'manifest-sha-mismatch' });
  const listed = new Set();
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
    listed.add(f.path);
    const file = path.join(dir, f.path);
    if (!fs.existsSync(file)) problems.push({ file: f.path, problem: 'missing-file' });
    else if (sha256(fs.readFileSync(file)) !== f.sha256) problems.push({ file: f.path, problem: 'file-changed' });
  }
  for (const ent of fs.readdirSync(dir)) {
    if (ent !== 'manifest.json' && !listed.has(ent)) problems.push({ file: ent, problem: 'extra-file' });
  }
  return problems.length ? blocked() : { status: 'ok', problems };
}
```

`plugins/pignolo-ui/scripts/approve.mjs`:
```js
// approve.mjs: save | record | verify of approved visual decisions (spec §3.3).
//   save   --project <repo> --flow <slug> --from <folder with the chosen HTML> [--date YYYY-MM-DD]
//          [--values-file <JSON list of user and machine values for the leak check>]
//          0 saved, 1 refused (screens not self-contained or leaking data), 2 own error
//   record --project <repo> --path design/approved/<flow> --quote-file <file> [--date] [--write]
//          prints the diff of the "## Decisions" entry; writes DESIGN.md only with --write
//          0 ok, 1 not applicable, 2 own error
//   verify --project <repo> --path design/approved/<flow>
//          0 ok, 1 BLOCKED, 2 own error
// Prints one JSON object on stdout; paths always come as arguments.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveApproved, verifyApproved, decisionEntry, findDesignFile, manifestSha, APPROVED_PATH } from '../lib/approved.mjs';
import { patchDesign } from '../lib/design-patch.mjs';
import { readValuesFile } from '../lib/leak-check.mjs';

class UsageError extends Error {}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[a.slice(2)] = true;
    else { opts[a.slice(2)] = next; i++; }
  }
  return { cmd, opts };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function need(opts, ...keys) {
  const missing = keys.filter((k) => !opts[k] || opts[k] === true);
  if (missing.length) throw new UsageError(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function cmdSave(opts) {
  need(opts, 'project', 'flow', 'from');
  if (!isDir(opts.project)) throw new UsageError(`no existe el proyecto ${opts.project}`);
  if (!isDir(opts.from)) throw new UsageError(`no existe la carpeta de pantallas ${opts.from}`);
  const leakValues = opts['values-file'] ? readValuesFile(opts['values-file']) : [];
  const r = saveApproved({ projectRoot: opts.project, flow: opts.flow, from: opts.from, date: opts.date || today(), leakValues });
  return { out: r, code: r.ok ? 0 : 1 };
}

function cmdRecord(opts) {
  need(opts, 'project', 'path', 'quote-file');
  if (!APPROVED_PATH.test(opts.path)) return { out: { written: false, error: 'bad-path' }, code: 1 };
  const designFile = findDesignFile(opts.project);
  if (!designFile) return { out: { written: false, error: 'no-design-md' }, code: 1 };
  let sha;
  try {
    sha = manifestSha(opts.project, opts.path);
  } catch {
    return { out: { written: false, error: 'manifest-unreadable' }, code: 1 };
  }
  const quote = fs.readFileSync(opts['quote-file'], 'utf8');
  const entry = decisionEntry({ path: opts.path, manifestSha256: sha, date: opts.date || today(), quote });
  const text = fs.readFileSync(designFile, 'utf8');
  const r = patchDesign(text, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  if (!r.ok) return { out: { written: false, error: r.error }, code: 1 };
  if (opts.write) {
    fs.writeFileSync(designFile, r.text);
    if (fs.readFileSync(designFile, 'utf8') !== r.text) throw new Error('DESIGN.md escrito no coincide con el propuesto');
  }
  return { out: { written: Boolean(opts.write), entry, manifestSha256: sha, diff: r.diff }, code: 0 };
}

function cmdVerify(opts) {
  need(opts, 'project', 'path');
  const r = verifyApproved({ projectRoot: opts.project, approvedPath: opts.path });
  return { out: r, code: r.status === 'ok' ? 0 : 1 };
}

const COMMANDS = { save: cmdSave, record: cmdRecord, verify: cmdVerify };

export function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const run = COMMANDS[cmd];
    if (!run) throw new UsageError(`uso: approve.mjs <${Object.keys(COMMANDS).join('|')}> [opciones]`);
    const { out, code } = run(opts);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  } catch (e) {
    process.stderr.write(`approve: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:ui`
Expected: PASS (`tests 122`, `pass 120`, `fail 0`, `skipped 2`).
Run: `npm test`
Expected: PASS (núcleo + 122, `skipped 2`; en la copia de trabajo: `tests 683`, `pass 681`, `skipped 2`).
Con `PIGNOLO_UI_DESIGNMD`: `tests 122`, `pass 122`.
Run: `claude plugin validate plugins/pignolo-ui` y `claude plugin validate .`
Expected: `✔ Validation passed` en los dos.

- [ ] **Step 5: Demostrar el rojo**

| Rotura | Tiene que fallar |
|---|---|
| En `saveApproved`, borrar el bucle `while (fs.existsSync(path.join(base, name))) { … }` | `an approved folder is never overwritten: a new approval creates -v2, then -v3` |
| En `checkScreens`, cambiar `if (remoteTag \|\| REMOTE_CSS.test(html)) problems.push` por `if (false) problems.push` | `screens that are not self-contained static HTML are refused and nothing is written` |
| En `checkScreens`, cambiar la condición de `broken-link` por `if (false)` | `screens that are not self-contained static HTML are refused and nothing is written` |
| En `verifyApproved`, cambiar la condición de `extra-file` por `if (false)` | `verify: an edited, added or removed file, or an edited manifest, is BLOCKED` |
| En `verifyApproved`, no comparar el sha256 del manifest (`if (false) problems.push(…manifest-sha-mismatch…)`) | `verify: an edited, added or removed file, or an edited manifest, is BLOCKED` y `verify uses the latest entry for the path` |
| En `verifyApproved`, usar la primera entrada (`entries[0][1]`) | `verify uses the latest entry for the path` |
| En `verifyApproved`, cambiar `if (!APPROVED_PATH.test(approvedPath \|\| '')) {` por `if (!approvedPath) {` | `verify and record only accept design/approved/<flow> paths` |
| En `cmdRecord`, cambiar `if (opts.write) {` por `if (true) {` | `CLI: save, record (diff first, then --write) and verify` |
| En `saveApproved`, recorrer `[]` en lugar de `checkLeaks(from, leakValues).leaks` | `save refuses screens that leak user or machine data (spec 7.4); nothing is written` |
| En `cmdSave`, fijar `const leakValues = [];` | `save refuses screens that leak user or machine data (spec 7.4); nothing is written` |

- [ ] **Step 6: Commit**

```text
feat(ui): aprobados versionados con manifest, chequeo de fuga, registro en DESIGN.md y verificación
```
```bash
git add plugins/pignolo-ui
git commit -F <archivo-del-mensaje>
```


---

## Cierre del hito 1

- `npm test` y `npm run test:ui` en verde; el test de desarrollo con `PIGNOLO_UI_DESIGNMD` en verde (criterio 2 de §0.1 para la plantilla y los fixtures de `extract`).
- `claude plugin validate plugins/pignolo-ui` y `claude plugin validate .` sin errores.
- Revisión independiente (opus) del hito, antes del hito 2.

## Self-review

**Cobertura del spec para el hito 1** (§17: "linter del plugin, `yaml-subset`, `color`, `token-sources`, `design-md` (`validate`, `extract`, `patch`), `approve` y la plantilla 0/0"):

| Requisito | Task |
|---|---|
| §2 forma del plugin: `plugins/pignolo-ui/`, registro en el `marketplace.json` de la raíz, `plugin.json` con semver y `userConfig` | 1 |
| §3.1 `userConfig` (`optionsPerDecision`, `presentation`, `language`) con sus valores y defaults | 1 |
| §2 "Empaquetado": linter R9 (estructura, nombres, descripciones entre comillas, rutas, imports en Windows, `$<dígito>`, sin hooks ni binarios, sin `CLAUDE.md`/`AGENTS.md`, `SKILL.md` ≤ ~3 k tokens) | 2 (lo no estático, en "Diferido") |
| §4.4 parser: subconjunto soportado, "no validado" ante lo no soportado, error por clave | 3 |
| §4.4 escritura solo por inserción o reemplazo de líneas, diff, comentarios byte a byte | 8 |
| §4.5 colores que se entienden; lo demás "no verificado" | 4 |
| §4.5 contraste (base para COLOR-03, que es del hito 2) | 4 |
| §4.5 fuentes de tokens: lectura de las cinco filas de la tabla | 5 |
| §4.5 escritura en el bloque existente, mismo formato shadcn, Tailwind v3 solo reemplazo textual, nunca una segunda fuente | 6 |
| §4.2 formato 0.4.0, extensiones solo bajo `pignolo:`, sin hex ni dimensiones, contenido obligatorio (`alto`) | 7 |
| §4.3 esquema `pignolo:` v1 cerrado, incluido `web:` reservado, `intentional`, `rejections` y `pattern` | 7 |
| §4.1 / §5.4 `intentional` solo con `acceptsIntentional: true`; THEME-03 no lo acepta | 7 |
| §4.3 / A-16 tema oscuro detectado en CSS sin `themes.dark` → `alto`; oscuro incompleto → THEME-03 | 7 |
| §5.1 campos del catálogo (semilla) e invariante "ninguna regla con `floor` acepta `intentional`" | 7 |
| §4.2 contrato con el linter oficial: lo generado 0/0; el oficial solo si ya está instalado; si no corre, "no verificado" | 9, 10 |
| §0.1 criterio 2: la plantilla y los fixtures de salida de `extract` pasan 0.4.0 con 0/0 (test de desarrollo) | 9, 10 |
| §4.5 / A-18 `extract`: primero la configuración; frecuencia solo como último recurso, en `pignolo.extracted`, como diff | 10 |
| §3.3 / A-19 / A-20 aprobados: carpeta con un HTML por pantalla + `manifest.json`, registro en `## Decisions` como diff, inmutable (`-v2`), `verify` → `BLOCKED` | 12 |
| §4.2 / §4.3 alias semánticos al leer (`pignolo.aliases` y mapa por defecto del README), hallazgo que nombra el alias; lo generado usa MD3 | 7, 10 |
| §3.2 carpeta del run `<repo>/.pignolo-ui/runs/<run-id>/` con `.pignolo-ui/.gitignore` = `*` antes de la primera escritura (lo que escribe este hito: `extract --out`) | 10 |
| §7.4 chequeo de fuga antes de guardar como aprobado (valores del usuario y rutas absolutas locales) | 11, 12 |
| §0 / A-12 Node ≥ 22 declarado (README y restricciones); sin probar en 22 | 1 |
| §16.1 Parser: lo no soportado → "no validado"; escritura por inserción conserva comentarios byte a byte | 3, 8 |
| §16.1 Validador: esquema cerrado; `intentional` sobre piso o THEME-03 → rechaza; hex en `pignolo:` → rechaza; oscuro detectado sin `themes.dark` → `alto` | 7 |
| §16.1 Aprobados: no sobrescribe (crea `-v2`); archivo editado, agregado o quitado → `BLOCKED` | 12 |
| §16.1 Alias: un `DESIGN.md` con `accent` y `text` se lee como `primary` y `on-surface`, y el hallazgo nombra el alias | 7 |
| §16.1 Chequeo de fuga: email, nombre de git, usuario del SO y rutas absolutas de Windows, macOS y Linux → falla; un fixture limpio pasa | 11, 12 |
| §16.1 Carpeta del run: `.pignolo-ui/.gitignore` antes de la primera escritura y `git status` limpio | 10 |
| §16.1 `extract`: con configuración (v4, v3 literal, `:root`, shadcn) no cuenta frecuencias; sin configuración cuenta y completa `extracted` | 10 |
| §16.1 Linter del plugin (R9) | 2 |
| §16.1 toda la suite sin red; el test del linter oficial sin linter sale como skip visible | 9, 10 |

Fuera del hito 1 aunque §16.1 los nombre: `ui-check` sobre `design/approved/**` (hito 2), catálogo completo (hito 2), JSX no resoluble, comentarios por sintaxis y extensión no soportada (hito 2), clases de Tailwind, familia de tokens y reglas afinadas (hito 2), framing del pipe y tema explícito (hito 3), poda de la carpeta del run y "una auditoría deja `git status` limpio" (hito 4, con `run.mjs`), presentación y lienzo (hito 4).

**Búsqueda de placeholders:** ningún paso dice "similar a la Task N", "TBD" ni "agregar manejo de errores"; todo bloque de código es el archivo completo o una edición exacta con su contexto, y el replay los aplicó sin intervención. Los únicos marcadores `‹…›` están dentro de los HTML de prueba de las Tasks 11 y 12, a propósito (son los marcadores de §7.1).

**Consistencia de tipos:** los nombres que una tarea consume coinciden con los que otra produce (`parseYaml`/`locate`/`stripComment` → Tasks 7, 8; `parseColor`/`formatColor`/`detectFormat`/`toOklch` → Tasks 6, 7, 10; `readTokenSources`/`listCss`/`blankComments` → Tasks 7, 10; `validateDesign`/`splitFrontmatter` → Tasks 8, 9, 10; `patchDesign`/`yamlScalar`/`yamlKey`/`formatDiff` → Tasks 10, 12; `resolveAliases` → Task 10; `checkLeaks`/`readValuesFile` → Task 12; `runOfficialLint` → Tasks 9, 10). Las formas de hallazgo (`{ id, severity, path, line, message, rejects }`), de salida de los CLIs (un JSON por invocación) y los códigos 0/1/2 son los mismos en `design-md.mjs`, `leak-check.mjs` y `approve.mjs`. Las severidades usan solo la escala de §5.3.
