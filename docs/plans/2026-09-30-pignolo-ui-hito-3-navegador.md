# pignolo-ui v1 — Hito 3: navegador (`browser.mjs` por pipe, B1–B4, capturas validadas y limpieza). Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de abajo (olas, worktrees creadas a mano, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`). **Todo el código de este plan se ejecutó** en una copia (clon temporal de `main` en `c3f3291`, Windows 11, Node 24.13.1, Edge 154.0.4258.37 y Chrome 154.0.8037.58): cada test se vio en rojo y después en verde, y cada rojo de "romper lo que protege" está anotado en su tarea. Lo que registra la sección final es lo que se corrió.

**Objetivo:** cerrar el hito 3 de §17. `scripts/browser.mjs` maneja el Chrome o Edge instalado por `--remote-debugging-pipe` (A-12), con perfil temporal propio, y tiene tres subcomandos: `measure` (B1–B4 a `browser.json`, con la forma de `entries` de `ui-check.json`), `capture` (capturas de viewport validadas, con sha256) y `dom` (DOM renderizado a `dom-<ancho>.html`, para las reglas `document` de `ui-check`). Todo lo que no se puede medir (sin navegador, URL caída, sesión requerida, plazo vencido) sale `unverified` con su motivo. `ui-check --measures <browser.json>` suma esas entradas a su salida y a su código, y `report-check` ya puede citar `browser.json`.

**Arquitectura:**
- `lib/cdp-pipe.mjs`: framing `\0` sobre `Buffer` y cliente CDP (pedidos con plazo, eventos, cierre).
- `lib/browser-find.mjs` (descubrimiento), `lib/png.mjs` (validación de capturas), `lib/shot-plan.mjs` (anchos y temas de §11.3 desde la plataforma y el oscuro declarado o detectado).
- `lib/browser-session.mjs`: lanza el navegador con perfil temporal, abre páginas (viewport con `mobile: false`, tema **siempre** explícito, navegación con plazo, espera de `readyState` + `fonts.ready` + dos frames, `evaluate`, captura, Tab) y limpia en `finally` (cierra sus páginas, `Browser.close`, a los 8 s mata el árbol sin shell, borra el perfil con reintentos).
- `lib/browser-checks.mjs`: las funciones de página de B1–B4 (solo leen el DOM) y su conversión a hallazgos del lado de Node (colores con `lib/color.mjs`).
- `lib/browser-run.mjs`: recorre anchos × temas, detecta "requiere sesión", arma las entradas (huella, alcance con `--before`, severidad efectiva) y las capturas y DOM. `scripts/browser.mjs` es la CLI fina.
- `lib/ui-check.mjs` y `scripts/ui-check.mjs`: `--measures`.

**Stack:** Node ≥ 22 para pignolo-ui (A-12), ESM `.mjs`, `node:test` + `node:assert/strict`, sin dependencias npm. Navegador: el instalado (Edge o Chrome); nunca se descarga nada.

**Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md`: §0 (nada remoto), §1 (principios 1, 2 y 8), §3.2 (carpeta del run), §5.2 (`document` sobre el DOM), §5.3 (alcance del navegador: el "antes"), §5.4 (B1–B4), §5.5 (`--measures`), §5.9 (contrato de `browser.json`), §11.1–§11.3, §12, §16.1 (framing, tema explícito, B1/B2 con deshabilitados, "sin navegador → skip visible"), §16.2 (spike del pipe), §16.4 (Node 22 en el checklist) y §17 hito 3.

**Prerrequisito:** `main` con el hito 2b unido (`c3f3291` o posterior). Lo que este hito consume, con su firma real:
- `runCheck({ project, files, design, base, dom, urls, inject })` → `{ entries, inputs, exitCode }`; `publicEntry` con los campos `id, status, reason, severity, scope, file, line, selector, fingerprint, measure`; `--dom` se evalúa como documento y su alcance es siempre `new` (`lib/ui-check.mjs`).
- `checkReport` (`lib/report-check.mjs`): `SOURCES = { 'ui-check': 'ui-check.json', browser: 'browser.json' }`; una afirmación con `ref.source: 'browser'` se busca por `fingerprint` en `browser.json.entries`; un `ui-check.json` cuyo `inputs[].file` cambió de sha256 queda vencido.
- `parseColor`, `contrastRatio`, `composite` (`lib/color.mjs`); `validateDesign` (`lib/design-doc.mjs`); `readTokenSources(root).darkDetected` (`lib/token-sources.mjs`); `loadCatalog` (`lib/catalog.mjs`, con NAV-01, LAYOUT-10, LAYOUT-11 y MOTION-07 ya como `class: browser`); `ensureRunRoot`, `isInsideRunRoot`, `RUN_ROOT` (`lib/run-folder.mjs`); `isLoopbackUrl` (`lib/site-fetch.mjs`); `makeTempDir`, `writeTree`, `runScript`, `serveRoutes`, `PLUGIN_ROOT` (`tests/helpers.mjs`).

## Alcance del hito 3

- **Adentro:** `browser.mjs` (`capture`, `measure`, `dom`) con B1–B4 en todos los anchos y temas de §11.3; descubrimiento del navegador y `PIGNOLO_UI_BROWSER`; perfil temporal y limpieza; plazos; "requiere sesión"; prechequeo de la URL (5 s); validación de capturas (firma PNG, lados ≤ 2000 px, sha256, 1 reintento); `--before` para el "antes" de `improve` (§5.3); `ui-check --measures`; prueba transversal con `report-check`; versión 0.4.0.
- **Afuera (hito 4, las skills):** pedir y guardar la URL en `project.json` y sugerir el script de desarrollo (§11.2); el respaldo con MCP de navegador desde el hilo principal (§11.2: es texto de la skill, no código); el presupuesto de 8 imágenes al contexto (§11.3); la ruta de referencia de `new` (§5.3); armar el informe. Los estados vacío/cargando/error siguen "no verificado" (`stateUrls` es v1.1, A-18).
- **Afuera siempre:** automatizar el login (§11.2), axe (A-13), `fullPage` para juicio.

## Global Constraints

- **Sin dependencias npm, sin hooks, sin binarios y sin nada remoto en tiempo de ejecución** (§0). Imports solo `node:` o relativos con extensión. El linter del plugin (`tests/lint-plugin.test.mjs`) lo hace cumplir; ningún fixture binario: los PNG de los tests se generan en memoria (`makePng`).
- **Node ≥ 22** (A-12); ningún `spawn` con shell. El navegador se lanza con `spawn(exe, args, { stdio: ['ignore','ignore','ignore','pipe','pipe'], windowsHide: true, detached: <no Windows> })`; el árbol se mata con `taskkill /PID <pid> /T /F` en Windows y `process.kill(-pid, 'SIGKILL')` en el resto, siempre por `execFileSync`/`process.kill`, nunca por una shell.
- **Nunca el navegador del usuario:** siempre `--user-data-dir=<mkdtemp absoluto con prefijo pignolo-ui-browser->` y `--headless=new`; nunca `--remote-debugging-port`.
- **"No corrió" no es "pasó"** (principio 1): sin navegador, URL caída, sesión requerida, plazo vencido o error de página → una entrada `unverified` con motivo por regla de navegador (`COLOR-03, STATE-04, NAV-01, LAYOUT-10, LAYOUT-11, MOTION-07`). Un `pass` agregado de una regla en un ancho y tema solo existe si esa regla no tuvo ningún `fail` ahí.
- **Tema explícito siempre:** antes de cada navegación, `Emulation.setEmulatedMedia` con `prefers-color-scheme` y `prefers-reduced-motion` explícitos (el headless hereda el tema del SO; en esta máquina es oscuro).
- **`--url` solo local** (misma regla que `ui-check --url`): `localhost`, `127.0.0.0/8`, `[::1]`. Un archivo va por `--file` y tiene que estar dentro del proyecto.
- **Tests de navegador:** sin navegador, `skip` visible con el motivo (`sin navegador: …`), nunca verde; con navegador, páginas servidas por `serveRoutes` en `127.0.0.1`. Un test que corre una CLI contra un servidor del mismo proceso usa `spawn` asíncrono.
- **Idioma:** ids, claves, `reason` y comentarios en inglés; stderr para la persona en español y sin stack (salvo "error interno"). Commits en español, Conventional Commits, con `git commit -F <archivo>` y los trailers de la sesión.
- **Archivos nuevos en LF, sin BOM.** Ojo: si se escriben con un *heredoc* de Git Bash, `\\` se reduce a `\` (se vio al escribir este plan); los bloques de este plan no dependen de `\\`, pero conviene escribirlos con la herramienta de escritura.
- **Tests** con `npm test`, `npm run test:quiet` o `npm run test:ui`; un implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>`.

## Método de ejecución y economía de tests

- **Rama base:** `ui/hito-3`, desde `main`. Al terminar cada ola se une a `ui/hito-3` y `npm run test:ui` corre una vez (≈ 25 s con navegador).
- **Olas:**
  - **Ola 0 (paralelo):** Task 1 ∥ Task 2 ∥ Task 3 (archivos disjuntos; la 2 agrega `makePng` al final de `tests/helpers.mjs`, ninguna otra lo toca en esta ola).
  - **Ola 1:** Task 4 (sesión; agrega los helpers de navegador a `tests/helpers.mjs`).
  - **Ola 2:** Task 5 (B1–B4).
  - **Ola 3:** Task 6 (`browser-run` + CLI).
  - **Ola 4:** Task 7 (transversal, documentación, versión y cierre) y la revisión final opus de `main..ui/hito-3`, una pasada de arreglos y una confirmación acotada.
- **Worktrees creadas a mano:** `git worktree add -b task/ui-3/<NN> <scratchpad>/wt-3-<NN> ui/hito-3`; primer paso `git merge-base --is-ancestor <sha de la ola anterior> HEAD` o `BLOCKED`.
- **Modelos:** Tasks 1, 2, 3, 5 y 7 en sonnet (traen el código ejecutado). **Tasks 4 y 6 en opus:** lanzan y matan procesos y borran carpetas (perfil temporal). Sin revisión por tarea; una revisión final opus.
- **Tests que valen lo que cuestan:** 51 tests nuevos (764 en la suite de pignolo-ui, contando subtests). Los de navegador abren un navegador por test (≈ 1 s cada uno con la limpieza corregida); la conversión a hallazgos (colores, umbrales, severidad) se prueba sin navegador.

## Review Focus

1. **Procesos y perfiles que quedan.** Con `Browser.close` que no termina (1 de 16 en el spike; también visto al escribir este plan), `close({ graceful: false })` y bajo carga (la suite completa en paralelo): el árbol muere, el perfil se borra (o `browser.json` lo dice en `cleanup` y la CLI imprime `leftoverProfile`) y ningún proceso con el perfil en su línea de comandos queda vivo (Task 4, `leftoverProcesses`).
2. **Nada deja vivo a Node:** ningún temporizador pendiente después de cerrar (el bug encontrado: `Promise.race` con `sleep(8000)` mantenía vivo cada CLI 8 s de más; test "after close nothing keeps Node alive").
3. **Falsos `bloquea` de B1–B4 en páginas comunes:** texto sobre degradé o imagen → `unverified`; controles deshabilitados exentos (B1 y B2); texto grande a 3:1; código con `overflow-x: auto` no es reflow roto; barras de borde a borde no violan el margen; texto recortado por un contenedor con `overflow` se mide recortado.
4. **"Requiere sesión" y URL caída nunca dan `pass`:** redirección a otra ruta o `input[type=password]` visible → todo `unverified`; URL sin respuesta → `unverified` antes de lanzar el navegador.
5. **Contrato con `report-check`:** huellas sin valores ni número de línea (`<id>|<página>|<ancho>|<tema>|<selector o clave>`), `--before` como multiconjunto, `ui-check.json` vencido cuando cambia `browser.json`.

## Rulings del plan (técnicos, registrados)

- **Método y costo:** el aprobado por el autor para los hitos anteriores (sonnet en tareas con código literal, opus donde se borran cosas o se matan procesos, una revisión final opus). Sin costo de API nuevo: los tests usan el navegador local.
- **Transporte y lanzamiento** (A-12, spike): argumentos `--headless=new --remote-debugging-pipe --no-first-run --no-default-browser-check --disable-extensions --hide-scrollbars --mute-audio --user-data-dir=<tmp> about:blank` (los del spike). Página propia con `Target.createTarget` + `Target.attachToTarget { flatten: true }`; `Page.enable` y `Runtime.enable`.
- **Plazos:** arranque (`Browser.getVersion`) 15 s; cada pedido CDP 30 s; navegación 30 s; espera de "lista" 10 s; cierre 8 s (spike) y después matar el árbol, esperar la salida 5 s (una vez más si no salió) y borrar el perfil con reintentos hasta 20 s; prechequeo de la URL 5 s (§11.2). Cualquier plazo vencido → `unverified` con el motivo para ese ancho y tema, y se sigue con el siguiente.
- **Cierre más rápido:** `close()` cierra primero sus páginas (`Target.closeTarget`, 2 s cada una) y después manda `Browser.close`. Medido al escribir el plan: sin cerrar las páginas, 5 de 6 cierres limpios (uno necesitó matar el árbol) con 0,4–4,9 s; cerrándolas, 14 de 14 limpios, la mayoría en ≈ 0,3 s. No lleva test propio (es un tiempo, no un comportamiento); lo cubre el Review Focus 1.
- **Descubrimiento** (§11.1): `PIGNOLO_UI_BROWSER` manda; si apunta a un archivo que no existe, es "sin navegador" con ese motivo (no se cae a otro: el usuario pidió ese). Windows: `%ProgramFiles%`, `%ProgramFiles(x86)%` y `%LOCALAPPDATA%`, **Edge antes que Chrome** (Edge está en todo Windows 10/11, así el resultado no depende de qué más haya); macOS: Edge, Chrome, Chromium en `/Applications`; Linux: `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, `microsoft-edge`, `microsoft-edge-stable` en `PATH`.
- **Plan de anchos** (§11.3): `desktop` 1440×900 (captura) + 320×640; `mobile` 375×812 (captura) + 320×640; `both` 1440×900 y 375×812 (captura) + 768×1024 y 320×640. La altura de los anchos sin captura no está en el spec: 640 (la del spike) y 1024. Temas: `light`, más `dark` si `DESIGN.md` tiene `pignolo.themes.dark` o el CSS del proyecto tiene oscuro (A-16, `readTokenSources().darkDetected`). `--platform` y `--dark` pisan lo que dice el proyecto.
- **B1 (COLOR-03):** por cada elemento con texto visible propio: color computado y capas de fondo de sus ancestros hasta la primera opaca, compuestas sobre blanco. Un ancestro con `background-image` (imagen o degradé) → `unverified`; texto con opacidad efectiva < 1 → `unverified`; sin fondo opaco y con `color-scheme` de la raíz distinto de `normal`/`light` (lienzo desconocido) → `unverified`. Colores computados: `rgb()`/`rgba()`, `lab()`, `oklch()` por `parseColor` y `color(srgb r g b / a)` (lo que devuelve Chrome para `color-mix()`) traducido a `rgb()`; `color(display-p3 …)` → `unverified`. Grande = `font-size` ≥ 24 px, o ≥ 18,66 px con peso ≥ 700 → 3:1; si no, 4,5:1 (comparación sin redondear; la medida se informa con 2 decimales). Deshabilitado = el elemento o un ancestro `:disabled` o `[aria-disabled="true"]` → exento. Límite declarado: un elemento posicionado encima de otro contenido toma el fondo de sus ancestros, no el de lo que tiene detrás.
- **B2 (STATE-04 y NAV-01):** esperados = visibles, no deshabilitados, no `inert`, sin `tabindex` negativo, entre `a[href], area[href], button, input:not([type=hidden]), select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable], [tabindex]` y los roles interactivos `button, link, menuitem, tab, checkbox, switch, combobox, option` (un `div role=button` sin `tabindex` es esperado y no se alcanza → NAV-01 con motivo propio). Se anotan sus estilos sin foco (`outline-*`, `box-shadow`, `border-*-color`, `border-top-width`, `background-color`, `color`, `text-decoration-line`), se aprieta Tab hasta (esperados + 5) veces (tope 200) terminando las animaciones antes de leer, y se para al volver al primero. No alcanzado → NAV-01; alcanzado sin ningún estilo distinto → STATE-04. Corre en cada ancho (así se prueba el botón del menú móvil) y tema.
- **B3 (LAYOUT-11 y LAYOUT-10):** scroll horizontal = `scrollWidth` del documento > `clientWidth`. Texto recortado = elemento no `inline` con `scrollWidth > clientWidth + 1`, sin `text-overflow: ellipsis` y con `overflow-x` distinto de `auto|scroll` (el contenido que necesita dos dimensiones, como código o tablas con scroll propio, es la excepción de 1.4.10). LAYOUT-11 es `bloquea` (piso) a 320 px y `alto` en los otros anchos. Margen: cada tramo de texto (rectángulo de un `Range`, recortado por el contenedor más cercano con `overflow-x` distinto de `visible`) necesita 16 px a cada lado; se exime el texto dentro de una "barra": un ancestro (que no sea `body` ni `html`) pintado (fondo, imagen o borde superior/inferior) que ocupa todo el ancho.
- **B4 (MOTION-07):** se navega de nuevo con `prefers-reduced-motion: reduce`, sin scroll; texto cuyo rectángulo corta los dos primeros viewports (`0 … 2 × innerHeight`) con opacidad efectiva 0 → `fail` (`alto`). Corre en cada ancho y tema.
- **Requiere sesión** (§11.2): la URL final tiene otro origen u otra ruta (sin contar la barra final) que la pedida, o hay un `input[type=password]` visible → todas las reglas `unverified (requires session: …)`, `degraded` lo dice y no se captura ni se mide nada más.
- **Entradas de `browser.json`:** `{ id, status, reason?, severity, scope, selector?, fingerprint, measure }`, con `measure` que siempre trae `width`, `theme` y `page` (la ruta de la URL, o la ruta del archivo relativa al proyecto con `--file`). Huella `<id>|<página>|<ancho>|<tema>|<selector o clave>` (sin valores: un contraste que cambia de 2,3 a 3,1 sigue siendo la misma huella). La severidad es la del catálogo salvo LAYOUT-11 fuera de 320 px (`alto`); una falla de piso que es deuda baja a `alto`, igual que en `ui-check`.
- **Alcance del navegador** (§5.3): sin `--before`, todo es `new`. Con `--before <browser.json>` (la medición del "antes" de `improve`), cada `fail` cuya huella está en las fallas del "antes" es `debt`, como multiconjunto.
- **`browser.json`** (contrato de §5.9, ampliado de forma aditiva): `{ version: 1, browser, url, finalUrl, degraded, cleanup, plan, entries }`; `cleanup = { graceful, killed, profileRemoved, profile }` o `null` sin navegador. **`captures.json`**: `{ version, browser, url, finalUrl, degraded, cleanup, captures: [{ path, sha256, width, height, theme, crop }], unverified }`, con las capturas en `<run>/captures/<ancho>-<tema>-<n>.png` (hasta 3 recortes de viewport por ancho con captura, recorriendo con `scrollTo` y dos frames). **`dom.json`** y `<run>/dom-<ancho>.html` (`<!doctype …>` + `outerHTML`, tema claro, cada ancho del plan).
- **Códigos de salida de `browser.mjs`:** 0 hecho (lo no medido va `unverified`); 1 `measure` encontró algún `bloquea` nuevo; 2 uso o error propio. Un perfil que no se pudo borrar no cambia el código: sale en `cleanup` y en `leftoverProfile` para que la skill lo diga.
- **`ui-check --measures <browser.json>`:** el archivo tiene que estar dentro del proyecto y cumplir el contrato (`entries`, y cada entrada con `id`, `status`, `severity`, `scope` y `fingerprint` válidos); si no, exit 2 en español. Sus entradas se agregan tal cual (ya traen alcance y severidad) y cuentan para el código de salida; `browser.json` entra en `inputs` con su sha256, así un `measure` nuevo deja vencido el `ui-check.json` anterior en `report-check`. `--measures` solo ya es una corrida válida.
- **Capturas:** solo en la carpeta del run; nunca al repo ni a publicar (A-14). La validación es la de §11.3; un error de imagen se reintenta una vez y después queda `unverified` para ese recorte.

---

## Ola 0 (en paralelo: Tasks 1, 2 y 3)

### Task 1 (sonnet): framing y cliente CDP (`lib/cdp-pipe.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/cdp-pipe.mjs`
- Test: `plugins/pignolo-ui/tests/cdp-pipe.test.mjs`

**Produces:** `createFrameReader(onMessage, onError)`, `encodeMessage(obj)`, `createCdpClient({ writable, readable, timeoutMs })` → `{ send, waitFor, on, pendingCount }`, `CdpError` (con `code`), `CdpTimeout`, `CdpClosed`.

- [ ] **Paso 1: tests primero** (`tests/cdp-pipe.test.mjs`, 9 tests; §16.1: mensaje partido en dos lecturas, varios en una, UTF-8 partido, error de CDP):

```js
// CDP framing and client over --remote-debugging-pipe (lib/cdp-pipe.mjs, spec §11.1, §16.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createFrameReader, encodeMessage, createCdpClient, CdpError, CdpTimeout, CdpClosed } from '../lib/cdp-pipe.mjs';

function collect() {
  const got = [];
  const errors = [];
  const push = createFrameReader((m) => got.push(m), (e) => errors.push(e));
  return { got, errors, push };
}

test('framing: one message split across two reads', () => {
  const { got, push } = collect();
  const buf = encodeMessage({ id: 1, result: { a: 'x' } });
  push(buf.subarray(0, 5));
  assert.deepEqual(got, []);
  push(buf.subarray(5));
  assert.deepEqual(got, [{ id: 1, result: { a: 'x' } }]);
});

test('framing: several messages in one read', () => {
  const { got, push } = collect();
  push(Buffer.concat([encodeMessage({ id: 1 }), encodeMessage({ id: 2 }), encodeMessage({ method: 'Page.loadEventFired' })]));
  assert.deepEqual(got.map((m) => m.id ?? m.method), [1, 2, 'Page.loadEventFired']);
});

test('framing: UTF-8 character split between two reads is not broken', () => {
  const { got, push } = collect();
  const buf = encodeMessage({ id: 3, result: { title: 'Título ñandú — á é' } });
  const cut = buf.indexOf(Buffer.from('ñ')) + 1; // inside the two bytes of ñ
  push(buf.subarray(0, cut));
  push(buf.subarray(cut));
  assert.equal(got[0].result.title, 'Título ñandú — á é');
});

test('framing: invalid JSON is reported, the next message still arrives', () => {
  const { got, errors, push } = collect();
  push(Buffer.concat([Buffer.from('{nope\0'), encodeMessage({ id: 4 })]));
  assert.equal(errors.length, 1);
  assert.deepEqual(got, [{ id: 4 }]);
});

function fakeBrowser() {
  const toBrowser = new PassThrough();
  const fromBrowser = new PassThrough();
  const sent = [];
  const read = createFrameReader((m) => sent.push(m));
  toBrowser.on('data', read);
  const reply = (obj) => fromBrowser.write(encodeMessage(obj));
  return { toBrowser, fromBrowser, sent, reply };
}
const tick = () => new Promise((r) => setImmediate(r));

test('client: a response resolves its request; sessionId travels with it', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.send('Runtime.evaluate', { expression: '1' }, { sessionId: 'S1' });
  await tick();
  assert.deepEqual(b.sent[0], { id: 1, method: 'Runtime.evaluate', params: { expression: '1' }, sessionId: 'S1' });
  b.reply({ id: 1, result: { result: { value: 1 } }, sessionId: 'S1' });
  assert.deepEqual(await p, { result: { value: 1 } });
});

test('client: a CDP error rejects with CdpError', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.send('Page.navigate', { url: 'x' });
  await tick();
  b.reply({ id: 1, error: { code: -32000, message: 'Cannot navigate to invalid URL' } });
  await assert.rejects(p, (e) => e instanceof CdpError && e.code === -32000 && /Page\.navigate: Cannot navigate/.test(e.message));
});

test('client: a request without answer times out and is forgotten', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  await assert.rejects(cdp.send('Browser.getVersion', {}, { timeoutMs: 20 }), (e) => e instanceof CdpTimeout && /Browser\.getVersion/.test(e.message));
  assert.equal(cdp.pendingCount(), 0);
});

test('client: the pipe closing rejects what is pending', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.send('Browser.getVersion');
  await tick();
  b.fromBrowser.end();
  await assert.rejects(p, CdpClosed);
  await assert.rejects(cdp.send('Browser.getVersion'), CdpClosed);
});

test('client: waitFor resolves on the first matching event of the session', async () => {
  const b = fakeBrowser();
  const cdp = createCdpClient({ writable: b.toBrowser, readable: b.fromBrowser });
  const p = cdp.waitFor('Page.loadEventFired', { sessionId: 'S1', timeoutMs: 1000 });
  b.reply({ method: 'Page.loadEventFired', params: { timestamp: 1 }, sessionId: 'S2' });
  b.reply({ method: 'Page.loadEventFired', params: { timestamp: 2 }, sessionId: 'S1' });
  assert.deepEqual(await p, { timestamp: 2 });
  await assert.rejects(cdp.waitFor('Page.frameNavigated', { timeoutMs: 20 }), CdpTimeout);
});
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/cdp-pipe.test.mjs` falla (no existe `lib/cdp-pipe.mjs`).
- [ ] **Paso 3: implementación** (`lib/cdp-pipe.mjs`):

```js
// Chrome DevTools Protocol over --remote-debugging-pipe (spec §11.1, A-12): JSON messages
// separated by a NUL byte on fd 3 (to the browser) and fd 4 (from the browser); no WebSocket,
// no port. The read buffer is a Buffer, never a string, so a UTF-8 character split between two
// reads is decoded whole.
//
// createFrameReader(onMessage, onError?) -> (chunk: Buffer) => void
// encodeMessage(obj) -> Buffer
// createCdpClient({ writable, readable, timeoutMs = 20000 }) -> {
//   send(method, params?, { sessionId?, timeoutMs? }) -> Promise<result>   CdpError | CdpTimeout | CdpClosed
//   waitFor(method, { sessionId?, timeoutMs? }) -> Promise<params>         first matching event
//   on(listener(message)) -> off()   every event
//   pendingCount() -> number
// }

export class CdpError extends Error {
  constructor(method, error) {
    super(`${method}: ${error && error.message ? error.message : 'CDP error'}`);
    this.code = error ? error.code : undefined;
  }
}
export class CdpTimeout extends Error {}
export class CdpClosed extends Error {}

export function encodeMessage(obj) {
  return Buffer.concat([Buffer.from(JSON.stringify(obj), 'utf8'), Buffer.from([0])]);
}

export function createFrameReader(onMessage, onError = () => {}) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
    let i;
    while ((i = buf.indexOf(0)) >= 0) {
      const raw = buf.subarray(0, i);
      buf = buf.subarray(i + 1);
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch (e) { onError(e); continue; }
      onMessage(msg);
    }
  };
}

export function createCdpClient({ writable, readable, timeoutMs = 20000 }) {
  let nextId = 0;
  let closed = null;
  const pending = new Map();
  const listeners = new Set();

  const closeAll = (reason) => {
    if (closed) return;
    closed = new CdpClosed(`CDP pipe closed (${reason})`);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(closed); }
    pending.clear();
  };

  readable.on('data', createFrameReader((msg) => {
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new CdpError(p.method, msg.error));
      else p.resolve(msg.result ?? {});
      return;
    }
    if (typeof msg.method === 'string') for (const l of [...listeners]) l(msg);
  }));
  readable.on('end', () => closeAll('end'));
  readable.on('close', () => closeAll('close'));
  readable.on('error', (e) => closeAll(e.code || e.message));
  writable.on('error', (e) => closeAll(e.code || e.message));

  function send(method, params = {}, { sessionId, timeoutMs: ms = timeoutMs } = {}) {
    if (closed) return Promise.reject(closed);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new CdpTimeout(`${method}: no answer in ${ms} ms`));
      }, ms);
      pending.set(id, { method, resolve, reject, timer });
      writable.write(encodeMessage({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  function on(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function waitFor(method, { sessionId, timeoutMs: ms = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const off = on((msg) => {
        if (msg.method !== method || (sessionId && msg.sessionId !== sessionId)) return;
        off();
        clearTimeout(timer);
        resolve(msg.params ?? {});
      });
      const timer = setTimeout(() => { off(); reject(new CdpTimeout(`${method}: no event in ${ms} ms`)); }, ms);
    });
  }

  return { send, waitFor, on, pendingCount: () => pending.size };
}
```

- [ ] **Paso 4: verde.** El mismo comando: 9 pasan.
- [ ] **Paso 5: rojo rompiendo lo que protege** (cada uno se deshace después):
  - decodificar cada lectura por separado (`Buffer.from(chunk.toString('utf8'))`) → cae "UTF-8 character split between two reads";
  - no borrar el pedido al vencer el plazo → cae "times out and is forgotten";
  - no escuchar `end`/`close` del pipe → cae "the pipe closing rejects what is pending";
  - no rechazar con `CdpError` una respuesta con `error` → cae "a CDP error rejects with CdpError";
  - ignorar el `sessionId` en `waitFor` → cae "waitFor resolves on the first matching event of the session".
- [ ] **Paso 6: commit** `feat(pignolo-ui): framing y cliente CDP por pipe`.

### Task 2 (sonnet): descubrimiento, PNG y plan de anchos

**Files:**
- Create: `plugins/pignolo-ui/lib/browser-find.mjs`, `lib/png.mjs`, `lib/shot-plan.mjs`
- Modify: `plugins/pignolo-ui/tests/helpers.mjs` (agrega `import zlib from 'node:zlib';` y `makePng` al final)
- Test: `plugins/pignolo-ui/tests/browser-env.test.mjs`

**Consumes:** `validateDesign`, `readTokenSources`.
**Produces:** `findBrowser({ platform, env, exists })` → `{ path, source } | { path: null, reason }`; `checkPng(buf, { maxSide })` → `{ ok, width, height, sha256 } | { ok: false, reason }`; `shotPlan({ platform, dark })` → `{ widths: [{ width, height, capture }], themes }`; `planFromProject({ project, design })` → `{ platform, dark }`; `makePng(width, height, rgba)` en los helpers.

- [ ] **Paso 1: tests primero.** En `tests/helpers.mjs`, después de `import http from 'node:http';` agregar `import zlib from 'node:zlib';`, y al final:

```js
// A real PNG of width x height (RGBA, one flat color), built in memory: the plugin linter
// forbids binary fixtures, so tests that need a PNG make one.
export function makePng(width, height, rgba = [255, 255, 255, 255]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgba).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
```

`tests/browser-env.test.mjs` (7 tests):

```js
// Browser discovery, PNG validation and the width/theme plan (spec §11.1, §11.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { makePng, makeTempDir, writeTree } from './helpers.mjs';
import { findBrowser } from '../lib/browser-find.mjs';
import { checkPng } from '../lib/png.mjs';
import { shotPlan, planFromProject } from '../lib/shot-plan.mjs';

const existsIn = (list) => (p) => list.includes(p);

const win = (...parts) => path.win32.join(...parts);
const PF = win('C:/', 'Program Files');
const PF86 = win('C:/', 'Program Files (x86)');
const LOCAL = win('C:/', 'Users', 'u', 'AppData', 'Local');

test('discovery: PIGNOLO_UI_BROWSER wins, and a missing one is not replaced', () => {
  const forced = win('D:/', 'b', 'chrome.exe');
  const env = { PIGNOLO_UI_BROWSER: forced, ProgramFiles: PF };
  const edge = win(PF, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  assert.deepEqual(findBrowser({ platform: 'win32', env, exists: existsIn([forced, edge]) }), { path: forced, source: 'env' });
  const r = findBrowser({ platform: 'win32', env, exists: existsIn([edge]) });
  assert.equal(r.path, null);
  assert.match(r.reason, /PIGNOLO_UI_BROWSER/);
});

test('discovery: Windows standard folders, Edge before Chrome, per-user Chrome too', () => {
  const env = { ProgramFiles: PF, 'ProgramFiles(x86)': PF86, LOCALAPPDATA: LOCAL };
  const edge = win(PF86, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const chrome = win(PF, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const userChrome = win(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe');
  assert.equal(findBrowser({ platform: 'win32', env, exists: existsIn([chrome, edge]) }).path, edge);
  assert.equal(findBrowser({ platform: 'win32', env, exists: existsIn([chrome]) }).path, chrome);
  assert.equal(findBrowser({ platform: 'win32', env, exists: existsIn([userChrome]) }).path, userChrome);
});

test('discovery: macOS /Applications and Linux PATH', () => {
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(findBrowser({ platform: 'darwin', env: {}, exists: existsIn([mac]) }).path, mac);
  const env = { PATH: '/usr/local/bin:/usr/bin' };
  assert.equal(findBrowser({ platform: 'linux', env, exists: existsIn(['/usr/bin/chromium']) }).path, '/usr/bin/chromium');
  assert.equal(findBrowser({ platform: 'linux', env, exists: existsIn(['/usr/bin/microsoft-edge']) }).path, '/usr/bin/microsoft-edge');
});

test('discovery: nothing installed gives a reason, never a guess', () => {
  const r = findBrowser({ platform: 'win32', env: { ProgramFiles: PF }, exists: () => false });
  assert.deepEqual(r, { path: null, reason: 'no Chrome or Edge found (set PIGNOLO_UI_BROWSER)' });
});

test('png: signature, sides at most 2000 px and sha256', () => {
  const png = makePng(40, 30);
  assert.deepEqual(checkPng(png), { ok: true, width: 40, height: 30, sha256: crypto.createHash('sha256').update(png).digest('hex') });
  assert.match(checkPng(Buffer.from('not a png at all, really')).reason, /not a PNG/);
  assert.match(checkPng(png.subarray(0, 20)).reason, /truncated/);
  assert.match(checkPng(makePng(2001, 1)).reason, /2001x1 exceeds 2000 px/);
  const zero = Buffer.from(png);
  zero.writeUInt32BE(0, 16);
  assert.match(checkPng(zero).reason, /empty image/);
});

test('plan: widths per platform (§11.3), dark only when declared or detected', () => {
  const w = (p) => shotPlan({ platform: p }).widths.map((x) => `${x.width}x${x.height}${x.capture ? '*' : ''}`);
  assert.deepEqual(w('desktop'), ['1440x900*', '320x640']);
  assert.deepEqual(w('mobile'), ['375x812*', '320x640']);
  assert.deepEqual(w('both'), ['1440x900*', '375x812*', '768x1024', '320x640']);
  assert.deepEqual(shotPlan({ platform: 'both' }).themes, ['light']);
  assert.deepEqual(shotPlan({ platform: 'both', dark: true }).themes, ['light', 'dark']);
  assert.throws(() => shotPlan({ platform: 'tv' }), /platform/);
});

test('plan from the project: DESIGN.md platform, dark from themes.dark or the CSS', () => {
  const plain = writeTree(makeTempDir(), { 'DESIGN.md': '---\nname: X\npignolo:\n  schema: 1\n  platform: mobile\n---\n', 'app.css': ':root { --bg: #fff; }\n' });
  assert.deepEqual(planFromProject({ project: plain, design: path.join(plain, 'DESIGN.md') }), { platform: 'mobile', dark: false });
  const css = writeTree(makeTempDir(), { 'app.css': ':root { --bg: #fff; }\n.dark { --bg: #000; }\n' });
  assert.deepEqual(planFromProject({ project: css, design: null }), { platform: 'both', dark: true });
  const declared = writeTree(makeTempDir(), { 'DESIGN.md': '---\nname: X\ncolors:\n  surface: "#FFFFFF"\npignolo:\n  schema: 1\n  platform: desktop\n  themes:\n    dark:\n      surface: "rgb(0 0 0)"\n---\n' });
  assert.deepEqual(planFromProject({ project: declared, design: path.join(declared, 'DESIGN.md') }), { platform: 'desktop', dark: true });
});
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/browser-env.test.mjs` falla (faltan los módulos).
- [ ] **Paso 3: implementación.**

`lib/browser-find.mjs`:

```js
// Finds the installed Chrome or Edge (spec §11.1, A-07). Never downloads anything.
// findBrowser({ platform, env, exists }) -> { path, source: 'env' | 'standard' } | { path: null, reason }
// PIGNOLO_UI_BROWSER forces the path; when it points to a missing file the answer is a reason,
// not another browser (the user asked for that one).
import fs from 'node:fs';
import path from 'node:path';

const fileExists = (p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
};

const WINDOWS = [
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
];
const MAC = [
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const LINUX = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];

function candidates(platform, env) {
  if (platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
    return WINDOWS.flatMap((parts) => roots.map((r) => path.win32.join(r, ...parts)));
  }
  if (platform === 'darwin') return MAC;
  const dirs = String(env.PATH ?? '').split(':').filter(Boolean);
  return LINUX.flatMap((name) => dirs.map((d) => path.posix.join(d, name)));
}

export function findBrowser({ platform = process.platform, env = process.env, exists = fileExists } = {}) {
  const forced = env.PIGNOLO_UI_BROWSER;
  if (forced) return exists(forced) ? { path: forced, source: 'env' } : { path: null, reason: `PIGNOLO_UI_BROWSER points to a missing file: ${forced}` };
  const found = candidates(platform, env).find((p) => exists(p));
  return found ? { path: found, source: 'standard' } : { path: null, reason: 'no Chrome or Edge found (set PIGNOLO_UI_BROWSER)' };
}
```

`lib/png.mjs`:

```js
// Screenshot validation (spec §11.3): PNG signature, IHDR first, both sides > 0 and <= maxSide,
// and the sha256 of the bytes. checkPng(buf, { maxSide }) -> { ok, width, height, sha256 } | { ok: false, reason }
import crypto from 'node:crypto';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function checkPng(buf, { maxSide = 2000 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) return { ok: false, reason: 'not a PNG (bad signature)' };
  if (buf.length < 33 || buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, reason: 'truncated PNG (no IHDR)' };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return { ok: false, reason: 'empty image (0 px side)' };
  if (width > maxSide || height > maxSide) return { ok: false, reason: `image ${width}x${height} exceeds ${maxSide} px` };
  return { ok: true, width, height, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}
```

`lib/shot-plan.mjs`:

```js
// Widths and themes of a browser run (spec §11.3, A-04, A-16).
// shotPlan({ platform, dark }) -> { widths: [{ width, height, capture }], themes }
//   capture: true = screenshot and measures; false = measured by script only (no image).
// planFromProject({ project, design }) -> { platform, dark }
//   platform from DESIGN.md pignolo.platform (default both); dark when DESIGN.md has
//   pignolo.themes.dark or the project CSS has .dark, [data-theme] or prefers-color-scheme: dark.
import fs from 'node:fs';
import { validateDesign } from './design-doc.mjs';
import { readTokenSources } from './token-sources.mjs';

const WIDTHS = {
  desktop: [[1440, 900, true], [320, 640, false]],
  mobile: [[375, 812, true], [320, 640, false]],
  both: [[1440, 900, true], [375, 812, true], [768, 1024, false], [320, 640, false]],
};

export function shotPlan({ platform = 'both', dark = false } = {}) {
  if (!WIDTHS[platform]) throw new Error(`unknown platform ${JSON.stringify(platform)} (desktop, mobile or both)`);
  return {
    widths: WIDTHS[platform].map(([width, height, capture]) => ({ width, height, capture })),
    themes: dark ? ['light', 'dark'] : ['light'],
  };
}

export function planFromProject({ project, design = null }) {
  let pig = null;
  if (design && fs.existsSync(design)) {
    const v = validateDesign(fs.readFileSync(design, 'utf8'));
    pig = v.data && v.data.pignolo && typeof v.data.pignolo === 'object' ? v.data.pignolo : null;
  }
  const platform = pig && WIDTHS[pig.platform] ? pig.platform : 'both';
  const declaredDark = Boolean(pig && pig.themes && pig.themes.dark && typeof pig.themes.dark === 'object');
  return { platform, dark: declaredDark || readTokenSources(project).darkDetected };
}
```

- [ ] **Paso 4: verde.** 7 pasan.
- [ ] **Paso 5: rojo rompiendo lo que protege:** `PIGNOLO_UI_BROWSER` inexistente que cae a otro navegador → test 1; sin `%LOCALAPPDATA%` → test 2; sin los nombres de Edge en Linux → test 3; devolver una ruta adivinada sin navegador → test 4; sin el tope de 2000 px → test 5; sin el ancho 768 en `both` → test 6; sin la detección del oscuro en el CSS → test 7.
- [ ] **Paso 6: commit** `feat(pignolo-ui): descubrimiento del navegador, validación de PNG y plan de anchos`.

### Task 3 (sonnet): `ui-check --measures` (§5.5)

**Files:**
- Modify: `plugins/pignolo-ui/lib/ui-check.mjs`, `plugins/pignolo-ui/scripts/ui-check.mjs`, `plugins/pignolo-ui/tests/ui-check-cli.test.mjs` (un caso: el mensaje "falta --files, --dom, --design o --measures")
- Test: `plugins/pignolo-ui/tests/ui-check-measures.test.mjs`

**Produces:** `runCheck({ …, measures })` con `measures = { file, entries } | null`; la opción `--measures <browser.json>` de la CLI.

- [ ] **Paso 1: tests primero** (`tests/ui-check-measures.test.mjs`, 4 tests, 9 con subtests):

```js
// ui-check --measures <browser.json> (spec §5.5): the browser entries join ui-check.json and
// its exit code, and browser.json is recorded in inputs so a later measure makes it stale.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

const entry = (over = {}) => ({
  id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', selector: '#low',
  fingerprint: 'COLOR-03|/|1440|light|#low', measure: { ratio: 2.32, required: 4.5, width: 1440, theme: 'light', page: '/' }, ...over,
});

function setup(entries) {
  const root = writeTree(makeTempDir(), { 'src/a.css': '.a { display: block; }\n' });
  const run = path.join(root, '.pignolo-ui', 'runs', 'r1');
  const measures = path.join(run, 'browser.json');
  writeTree(root, { '.pignolo-ui/runs/r1/browser.json': JSON.stringify({ version: 1, entries }) });
  return { root, run, measures };
}
const uiCheck = ({ root, run, measures }, extra = []) => runScript('ui-check.mjs', ['--project', root, '--run', run, '--measures', measures, ...extra], { cwd: root });
const readOut = (run) => JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));

test('a new bloquea from the browser makes ui-check exit 1; browser.json is an input', () => {
  const s = setup([entry(), entry({ id: 'NAV-01', status: 'pass', severity: 'bloquea', fingerprint: 'NAV-01|/|1440|light|checked', selector: undefined, measure: { checked: 3 } })]);
  const r = uiCheck(s, ['--files', 'src/a.css']);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.json.counts.blockingNew, 1);
  const out = readOut(s.run);
  assert.deepEqual(out.entries.filter((e) => e.fingerprint.startsWith('COLOR-03|/')), [entry()]);
  assert.ok(out.entries.some((e) => e.fingerprint === 'NAV-01|/|1440|light|checked'));
  const sha = crypto.createHash('sha256').update(fs.readFileSync(s.measures)).digest('hex');
  assert.deepEqual(out.inputs.find((i) => i.file === '.pignolo-ui/runs/r1/browser.json'), { file: '.pignolo-ui/runs/r1/browser.json', sha256: sha });
});

test('browser debt does not block, and --measures alone is a valid run', () => {
  const s = setup([entry({ scope: 'debt', severity: 'alto' })]);
  const r = uiCheck(s);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readOut(s.run).entries.filter((e) => e.fingerprint.startsWith('COLOR-03|/')).map((e) => [e.scope, e.severity]), [['debt', 'alto']]);
});

test('a browser.json that is not the contract is a usage error (exit 2)', async (t) => {
  const CASES = [
    ['not JSON', '{nope', /browser\.json no es JSON válido/],
    ['no entries', JSON.stringify({ version: 1 }), /browser\.json no tiene la lista entries/],
    ['bad status', JSON.stringify({ entries: [entry({ status: 'ok' })] }), /browser\.json: entrada 1 inválida/],
    ['bad scope', JSON.stringify({ entries: [entry({ scope: 'old' })] }), /browser\.json: entrada 1 inválida/],
    ['no fingerprint', JSON.stringify({ entries: [entry({ fingerprint: undefined })] }), /browser\.json: entrada 1 inválida/],
  ];
  for (const [name, body, message] of CASES) {
    await t.test(name, () => {
      const s = setup([]);
      fs.writeFileSync(s.measures, body);
      const r = uiCheck(s);
      assert.equal(r.status, 2);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /error interno/);
    });
  }
});

test('--measures outside the project is refused', () => {
  const s = setup([]);
  const outside = path.join(writeTree(makeTempDir(), { 'browser.json': JSON.stringify({ entries: [] }) }), 'browser.json');
  const r = uiCheck({ ...s, measures: outside });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--measures está fuera del proyecto/);
});
```

En `tests/ui-check-cli.test.mjs`, el caso `'no --files, --dom or --design'` pasa a:

```js
    ['no --files, --dom, --design or --measures', ['--project', repo, '--run', run], /falta --files, --dom, --design o --measures/],
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/ui-check-measures.test.mjs`: los 9 fallan (opción desconocida `--measures`).
- [ ] **Paso 3: implementación** (diff verificado contra `c3f3291`):

```diff
diff --git a/plugins/pignolo-ui/lib/ui-check.mjs b/plugins/pignolo-ui/lib/ui-check.mjs
index f79ddf1..82ec74f 100644
--- a/plugins/pignolo-ui/lib/ui-check.mjs
+++ b/plugins/pignolo-ui/lib/ui-check.mjs
@@ -1,7 +1,8 @@
 // ui-check runner (spec §5.3, §5.5). Reads the inputs, runs the rules and returns entries;
 // it never writes anything (scripts/ui-check.mjs writes <run>/ui-check.json).
 //
-// runCheck({ project, files, design, base, dom, inject }) -> Promise<{ entries, inputs, exitCode }>
+// runCheck({ project, files, design, base, dom, urls, measures, inject }) -> Promise<{ entries, inputs, exitCode }>
+//   measures   { file, entries } of a browser.json (scripts/browser.mjs measure) or null.
 //   files/dom  paths relative to `project` (or absolute inside it); `files: []` is valid and
 //              runs only the project rules (checkProject).
 //   design     path of DESIGN.md or null.   base  git ref or null.
@@ -273,7 +274,7 @@ function sourceFilesOf(project, relFiles, designRel) {
   return [...new Set(list)];
 }
 
-export async function runCheck({ project, files = [], design = null, base = null, dom = [], urls = [], inject = {} } = {}) {
+export async function runCheck({ project, files = [], design = null, base = null, dom = [], urls = [], measures = null, inject = {} } = {}) {
   const root = path.resolve(project);
   const rules = inject.rules ?? DISK_RULES;
   const catalog = inject.catalog ?? loadCatalog();
@@ -298,8 +299,10 @@ export async function runCheck({ project, files = [], design = null, base = null
     .map((e) => ({ ...e, scope: domSet.has(e.file) ? 'new' : e.scope === 'debt' ? 'debt' : 'new' }));
   // (5) severity, (6) aggregation and order
   const entries = aggregate(scoped.map((e) => ({ ...e, severity: effectiveSeverity(e, byId.get(e.id)) }))).map(publicEntry);
+  // Browser measures (browser.json) come scoped and with their severity: appended as they are.
+  if (measures) entries.push(...measures.entries.map(publicEntry));
 
-  const inputs = [...relFiles, ...domFiles, ...(designRel ? [designRel] : [])]
+  const inputs = [...relFiles, ...domFiles, ...(designRel ? [designRel] : []), ...(measures ? [measures.file] : [])]
     .map((rel) => ({ file: rel, sha256: sha256(path.join(root, rel)) }));
   if (site) {
     for (const r of [...site.pages, site.robots, ...site.sitemaps]) if (r.sha256) inputs.push({ url: r.finalUrl, sha256: r.sha256 });
diff --git a/plugins/pignolo-ui/scripts/ui-check.mjs b/plugins/pignolo-ui/scripts/ui-check.mjs
index 6d6093e..3157035 100644
--- a/plugins/pignolo-ui/scripts/ui-check.mjs
+++ b/plugins/pignolo-ui/scripts/ui-check.mjs
@@ -2,7 +2,7 @@
 //
 // node <root>/scripts/ui-check.mjs [--project <repo root>] --run <folder in .pignolo-ui/>
 //   (--files <path>)... [--files-from <list.json>] [--design <DESIGN.md>] [--base <ref>]
-//   [--dom <file>]... [--url <development URL>]... [--gate]
+//   [--dom <file>]... [--url <development URL>]... [--measures <browser.json>] [--gate]
 //
 // --url (at most 20, one origin, loopback only: nothing remote at run time) feeds the static
 // SEO rules with what the development server returns; it needs --design (spec §5.4, A-06).
@@ -24,7 +24,7 @@ import { isLoopbackUrl } from '../lib/site-fetch.mjs';
 
 class UsageError extends Error {}
 
-const VALUE_OPTS = new Set(['project', 'run', 'files', 'files-from', 'design', 'base', 'dom', 'url']);
+const VALUE_OPTS = new Set(['project', 'run', 'files', 'files-from', 'design', 'base', 'dom', 'url', 'measures']);
 const REPEATED = new Set(['files', 'dom', 'url']);
 const MAX_URLS = 20;
 const FLAGS = new Set(['gate']);
@@ -103,6 +103,22 @@ function readFilesFrom(file) {
   return list;
 }
 
+// browser.json of scripts/browser.mjs measure (spec §5.9): entries already carry severity,
+// scope and fingerprint; they join ui-check.json as they are.
+const STATUS = new Set(['pass', 'fail', 'unverified']);
+const SEVERITY = new Set(['bloquea', 'alto', 'medio', 'detalle']);
+const SCOPE = new Set(['new', 'debt']);
+function readMeasures(project, file) {
+  let json;
+  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new UsageError('--measures: browser.json no es JSON válido'); }
+  if (!json || !Array.isArray(json.entries)) throw new UsageError('--measures: browser.json no tiene la lista entries');
+  json.entries.forEach((e, i) => {
+    const ok = e && typeof e.id === 'string' && STATUS.has(e.status) && SEVERITY.has(e.severity) && SCOPE.has(e.scope) && typeof e.fingerprint === 'string';
+    if (!ok) throw new UsageError(`--measures: browser.json: entrada ${i + 1} inválida (id, status, severity, scope y fingerprint)`);
+  });
+  return { file: path.relative(project, file).split(path.sep).join('/'), entries: json.entries };
+}
+
 function checkUrls(urls, design) {
   if (!urls.length) return [];
   if (!design) throw new UsageError('--url necesita --design: el SEO estático solo corre si DESIGN.md declara web.public');
@@ -131,11 +147,12 @@ export async function main(argv, { cwd = process.cwd(), check = runCheck } = {})
     const dom = opts.dom.map((f) => inputFile(project, path.resolve(cwd, f), '--dom'));
     const design = opts.design !== undefined ? inputFile(project, path.resolve(cwd, opts.design), '--design') : null;
     const urls = checkUrls(opts.url, design);
-    if (!files.length && !dom.length && !design) throw new UsageError('falta --files, --dom o --design: no hay nada que chequear');
+    const measures = opts.measures !== undefined ? readMeasures(project, inputFile(project, path.resolve(cwd, opts.measures), '--measures')) : null;
+    if (!files.length && !dom.length && !design && !measures) throw new UsageError('falta --files, --dom, --design o --measures: no hay nada que chequear');
 
     const base = opts.base ?? null;
     if (base !== null) assertRef(project, base); // an invalid ref is a usage error, before any rule runs
-    const result = await check({ project, files, design, base, dom, urls });
+    const result = await check({ project, files, design, base, dom, urls, measures });
 
     ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
     fs.mkdirSync(runDir, { recursive: true });
```

- [ ] **Paso 4: verde.** 9 pasan; `tests/ui-check-cli.test.mjs` sigue verde.
- [ ] **Paso 5: rojo rompiendo lo que protege:** no agregar las entradas → caen los tests 1 y 2; no sumar `browser.json` a `inputs` → cae el test 1; no validar cada entrada → caen "bad status", "bad scope" y "no fingerprint".
- [ ] **Paso 6: commit** `feat(pignolo-ui): ui-check --measures suma las medidas del navegador`.

## Ola 1

### Task 4 (opus): sesión de navegador (`lib/browser-session.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/browser-session.mjs`
- Modify: `plugins/pignolo-ui/tests/helpers.mjs` (agrega `import { findBrowser } from '../lib/browser-find.mjs';` después del import de `zlib`, y al final `BROWSER_SKIP`, `browserPath`, `processesWith`, `leftoverProcesses`)
- Test: `plugins/pignolo-ui/tests/browser-session.test.mjs`

**Consumes:** `createCdpClient` (Task 1), `findBrowser` (Task 2, en los helpers).
**Produces:** `openBrowser({ executable, startTimeoutMs, closeTimeoutMs })`, `withBrowser(opts, fn)`, `BrowserUnavailable`, `PageLoadError`, `LAUNCH_ARGS`; la interfaz `page` del encabezado del módulo.

- [ ] **Paso 1: tests primero.** Al final de `tests/helpers.mjs`:

```js
// Browser tests (spec §16.1): without Chrome or Edge they are a visible skip, never a pass.
const FOUND_BROWSER = findBrowser();
export const BROWSER_SKIP = FOUND_BROWSER.path ? false : `sin navegador: ${FOUND_BROWSER.reason}`;
export const browserPath = () => FOUND_BROWSER.path;

// Process ids whose command line mentions the temporary profile (orphan check, spec §11.1).
export function processesWith(profile) {
  const marker = path.basename(profile);
  if (process.platform === 'win32') {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${marker}*' } | ForEach-Object { $_.ProcessId }`;
    const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    return res.stdout.split(/\s+/).filter(Boolean).map(Number);
  }
  const res = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 10000 });
  return res.stdout.split('\n').filter((l) => l.includes(marker)).map((l) => Number(l.trim().split(/\s+/)[0]));
}

// Processes of that profile still alive after timeoutMs (children exit a moment after the main
// process, longer under load): an orphan is one that stays.
export async function leftoverProcesses(profile, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const left = processesWith(profile);
    if (!left.length || Date.now() > until) return left;
    await new Promise((r) => setTimeout(r, 500));
  }
}
```

(`$_.ProcessId -ne $PID` hace falta: sin eso, el propio PowerShell aparece porque su línea de comandos lleva el nombre del perfil. Visto al escribir el plan.)

`tests/browser-session.test.mjs` (8 tests; 7 necesitan navegador):

```js
// Real browser over the pipe (lib/browser-session.mjs, spec §11.1, §16.1). Without Chrome or
// Edge every test here is a visible skip ("sin navegador"), never a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { serveRoutes, BROWSER_SKIP, browserPath, leftoverProcesses, PLUGIN_ROOT } from './helpers.mjs';
import { openBrowser, withBrowser, BrowserUnavailable, PageLoadError } from '../lib/browser-session.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('opens a headless browser with its own profile, UTF-8 over the pipe, closes clean', { skip }, async () => {
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><title>Título ñandú — á é</title><p>x</p>' } });
  let browser;
  try {
    browser = await openBrowser({ executable: browserPath() });
    assert.match(browser.product, /(Chrome|Edg|HeadlessChrome)\//);
    assert.ok(fs.existsSync(browser.profile));
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setMedia({ theme: 'light' });
    const { finalUrl } = await page.navigate(`${site.base}/`);
    assert.equal(finalUrl, `${site.base}/`);
    await page.waitReady();
    assert.equal(await page.evaluate(() => document.title), 'Título ñandú — á é');
  } finally {
    const cleanup = await browser.close();
    await site.close();
    assert.equal(cleanup.profileRemoved, true);
    assert.equal(alive(browser.pid), false);
    assert.equal(fs.existsSync(browser.profile), false);
    assert.deepEqual(await leftoverProcesses(browser.profile), []);
  }
});

test('theme is always set explicitly, whatever the OS uses (§11.1)', { skip }, async () => {
  await withBrowser({ executable: browserPath() }, async (browser) => {
    const page = await browser.newPage();
    const dark = () => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
    const reduce = () => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.setMedia({ theme: 'light' });
    assert.equal(await dark(), false);
    await page.setMedia({ theme: 'dark', reducedMotion: true });
    assert.deepEqual([await dark(), await reduce()], [true, true]);
    await page.setMedia({ theme: 'light' });
    assert.deepEqual([await dark(), await reduce()], [false, false]);
    assert.throws(() => page.setMedia({ theme: 'auto' }), /light or dark/);
  });
});

test('widths are emulated with mobile: false, so 320 means 320 without a viewport meta', { skip }, async () => {
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><title>w</title><p>x</p>' } });
  try {
    await withBrowser({ executable: browserPath() }, async (browser) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 320, height: 640 });
      await page.navigate(`${site.base}/`);
      assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]), [320, 640, 1]);
    });
  } finally {
    await site.close();
  }
});

test('when Browser.close is not honored the process tree is killed and the profile removed', { skip }, async () => {
  const browser = await openBrowser({ executable: browserPath() });
  const cleanup = await browser.close({ graceful: false });
  assert.deepEqual(cleanup, { graceful: false, killed: true, profileRemoved: true });
  assert.equal(alive(browser.pid), false);
  assert.equal(fs.existsSync(browser.profile), false);
  assert.deepEqual(await leftoverProcesses(browser.profile), []);
});

test('after close nothing keeps Node alive (no timer left waiting for the close deadline)', { skip }, async () => {
  const lib = pathToFileURL(path.join(PLUGIN_ROOT, 'lib', 'browser-session.mjs')).href;
  const code = `import { withBrowser } from ${JSON.stringify(lib)};
await withBrowser({ executable: ${JSON.stringify(browserPath())}, closeTimeoutMs: 60000 }, async (b) => { await b.newPage(); });`;
  const t = Date.now();
  const status = await new Promise((resolve) => spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' }).on('close', resolve));
  assert.equal(status, 0);
  assert.ok(Date.now() - t < 30000, `the process took ${Date.now() - t} ms to exit`);
});

test('a missing executable is BrowserUnavailable and leaves no profile', async () => {
  await assert.rejects(openBrowser({ executable: 'Z:/no/such/browser.exe', startTimeoutMs: 5000 }), (e) => {
    assert.ok(e instanceof BrowserUnavailable, e.message);
    assert.equal(fs.existsSync(e.profile), false);
    return true;
  });
});

test('a page that never answers is PageLoadError, and cleanup still happens', { skip }, async () => {
  const site = await serveRoutes({ '/hang': () => { /* never answers */ } });
  let browser;
  try {
    browser = await openBrowser({ executable: browserPath() });
    const page = await browser.newPage();
    await assert.rejects(page.navigate(`${site.base}/hang`, { timeoutMs: 1500 }), PageLoadError);
  } finally {
    const cleanup = await browser.close();
    await site.close();
    assert.equal(cleanup.profileRemoved, true);
  }
});

test('Tab is dispatched as keyDown and keyUp and moves the focus', { skip }, async () => {
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><title>t</title><a href="#a" id="a">a</a><button id="b">b</button>' } });
  try {
    await withBrowser({ executable: browserPath() }, async (browser) => {
      const page = await browser.newPage();
      await page.navigate(`${site.base}/`);
      await page.evaluate(() => {
        window.keys = [];
        addEventListener('keydown', (e) => keys.push(`down:${e.key}`));
        addEventListener('keyup', (e) => keys.push(`up:${e.key}`));
      });
      await page.pressTab();
      await page.pressTab();
      assert.deepEqual(await page.evaluate(() => [document.activeElement.id, keys]), ['b', ['down:Tab', 'up:Tab', 'down:Tab', 'up:Tab']]);
    });
  } finally {
    await site.close();
  }
});
```

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot plugins/pignolo-ui/tests/browser-session.test.mjs` falla (no existe el módulo).
- [ ] **Paso 3: implementación** (`lib/browser-session.mjs`):

```js
// One headless browser over --remote-debugging-pipe (spec §11.1, A-12). Always a temporary
// profile of its own (--user-data-dir, absolute), never the user's browser; cleanup in finally.
//
// openBrowser({ executable, startTimeoutMs = 15000, closeTimeoutMs = 8000 }) -> Promise<browser>
//   browser { product, pid, profile, cdp, newPage() -> Promise<page>, close({ graceful = true }) -> Promise<cleanup> }
//   cleanup { graceful, killed, profileRemoved }: close() first closes its pages, then Browser.close;
//   after closeTimeoutMs it kills the process tree; the profile is removed with retries.
//   Throws BrowserUnavailable (reason in English, for `unverified`) when the browser
//   does not start or does not answer (for example a policy that blocks remote debugging);
//   the profile is removed before throwing.
// page {
//   sessionId,
//   setViewport({ width, height })                       DPR 1, mobile: false (spike: mobile: true gives 980 px)
//   setMedia({ theme: 'light' | 'dark', reducedMotion }) always explicit: headless inherits the OS theme
//   navigate(url, { timeoutMs = 30000 }) -> { finalUrl }  PageLoadError when it does not load
//   waitReady({ timeoutMs = 10000 })                     readyState complete, fonts.ready, two frames
//   evaluate(fn, arg, { timeoutMs }) -> value            fn: a function, run as (fn)(arg), or an expression
//   screenshot() -> Buffer                               PNG of the viewport
//   pressTab()                                           keyDown + keyUp, never left pressed
// }
// withBrowser(opts, fn) -> fn's value; the browser is closed in finally whatever happens.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createCdpClient } from './cdp-pipe.mjs';

export class BrowserUnavailable extends Error {}
export class PageLoadError extends Error {}

export const LAUNCH_ARGS = [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--mute-audio',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A closed or killed browser can hold its profile files for a while (Windows, under load): retry up to 20 s.
async function removeProfile(dir, deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  for (;;) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* retried below */ }
    if (!fs.existsSync(dir)) return true;
    if (Date.now() > until) return false;
    await sleep(250);
  }
}

// Kills the browser's process tree without a shell (spec §11.1).
function killTree(child) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    } else {
      process.kill(-child.pid, 'SIGKILL'); // detached: the browser leads its own process group
    }
  } catch { /* already gone */ }
}

// true when the process ended within ms; the timer is cleared so it never keeps Node alive.
function exited(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off('exit', onExit); resolve(false); }, ms);
    function onExit() { clearTimeout(timer); resolve(true); }
    child.once('exit', onExit);
  });
}

export async function openBrowser({ executable, startTimeoutMs = 15000, closeTimeoutMs = 8000 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-ui-browser-'));
  let child;
  try {
    child = spawn(executable, [...LAUNCH_ARGS, `--user-data-dir=${profile}`, 'about:blank'], {
      stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
  } catch (e) {
    await removeProfile(profile);
    throw Object.assign(new BrowserUnavailable(`the browser could not start (${e.code || e.message})`), { profile });
  }
  const spawnError = new Promise((resolve) => child.once('error', resolve));
  const cdp = createCdpClient({ writable: child.stdio[3], readable: child.stdio[4], timeoutMs: 30000 });

  const targets = [];
  let closing = null;
  async function close({ graceful = true } = {}) {
    if (closing) return closing;
    closing = (async () => {
      let clean = false;
      if (graceful && child.pid && child.exitCode === null) {
        // Closing our pages first makes Browser.close finish sooner (measured while writing the plan).
        for (const targetId of targets) await cdp.send('Target.closeTarget', { targetId }, { timeoutMs: 2000 }).catch(() => {});
        cdp.send('Browser.close', {}, { timeoutMs: closeTimeoutMs }).catch(() => {});
        clean = await exited(child, closeTimeoutMs);
      }
      let killed = false;
      if (!clean && child.pid && child.exitCode === null && child.signalCode === null) {
        killTree(child);
        killed = true;
        if (!(await exited(child, 5000))) { killTree(child); await exited(child, 5000); } // once more under load
      }
      return { graceful: clean, killed, profileRemoved: await removeProfile(profile) };
    })();
    return closing;
  }

  let product;
  try {
    const version = await Promise.race([
      cdp.send('Browser.getVersion', {}, { timeoutMs: startTimeoutMs }),
      spawnError.then((e) => { throw new Error(e.code || e.message); }),
    ]);
    product = version.product;
  } catch (e) {
    await close({ graceful: false });
    throw Object.assign(new BrowserUnavailable(`the browser did not answer over the pipe (${e.message})`), { profile });
  }

  async function newPage() {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targets.push(targetId);
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}, opts = {}) => cdp.send(method, params, { sessionId, ...opts });
    await call('Page.enable');
    await call('Runtime.enable');

    async function evaluate(fn, arg, { timeoutMs = 30000 } = {}) {
      const expression = typeof fn === 'string' ? fn : `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, { timeoutMs });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(`page script failed: ${(d.exception && d.exception.description) || d.text}`);
      }
      return r.result ? r.result.value : undefined;
    }

    return {
      sessionId,
      setViewport: ({ width, height }) => call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
      setMedia: ({ theme, reducedMotion = false }) => {
        if (theme !== 'light' && theme !== 'dark') throw new Error(`theme must be light or dark, got ${theme}`);
        return call('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-color-scheme', value: theme },
            { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
          ],
        });
      },
      async navigate(url, { timeoutMs = 30000 } = {}) {
        const loaded = cdp.waitFor('Page.loadEventFired', { sessionId, timeoutMs });
        loaded.catch(() => {});
        let nav;
        try { nav = await call('Page.navigate', { url }, { timeoutMs }); } catch (e) { throw new PageLoadError(`the page did not answer (${e.message})`); }
        if (nav.errorText) throw new PageLoadError(`the page did not load (${nav.errorText})`);
        try { await loaded; } catch { throw new PageLoadError(`the page did not finish loading in ${timeoutMs} ms`); }
        return { finalUrl: await evaluate(() => location.href) };
      },
      waitReady: ({ timeoutMs = 10000 } = {}) => evaluate(() => new Promise((resolve) => {
        const go = () => document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
        if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
      }), null, { timeoutMs }),
      evaluate,
      async screenshot() {
        const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        return Buffer.from(data, 'base64');
      },
      async pressTab() {
        const key = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      },
    };
  }

  return { product, pid: child.pid, profile, cdp, newPage, close };
}

export async function withBrowser(opts, fn) {
  const browser = await openBrowser(opts);
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Paso 4: verde.** 8 pasan (≈ 10 s con Edge). Con `PIGNOLO_UI_BROWSER=Z:/none/chrome.exe`, 7 salen `# SKIP sin navegador: …` y pasa solo el del ejecutable faltante.
- [ ] **Paso 5: rojo rompiendo lo que protege:**
  - no mandar `prefers-color-scheme: light` (lista vacía en claro) → cae "theme is always set explicitly" (en esta máquina el headless hereda el oscuro del SO);
  - `mobile: true` → cae "widths are emulated with mobile: false" (`innerWidth` 980);
  - `killTree` que no hace nada → cae "when Browser.close is not honored…". **Ojo:** con este sabotaje el navegador queda vivo y el proceso de test no termina; correrlo con plazo y matar después el árbol de ese perfil a mano (`taskkill /PID <pid> /T /F`);
  - `profileRemoved: true` sin borrar → caen "opens a headless browser…" y "a missing executable…";
  - dejar pasar el `CdpTimeout` de `Page.navigate` → cae "a page that never answers is PageLoadError…";
  - sin `keyUp` → cae "Tab is dispatched as keyDown and keyUp…";
  - no limpiar el temporizador en `exited` (`function onExit() { resolve(true); }`) → cae "after close nothing keeps Node alive" (el proceso tarda 60 s en salir).
- [ ] **Paso 6: commit** `feat(pignolo-ui): sesión de navegador por pipe con perfil temporal y limpieza`.

## Ola 2

### Task 5 (sonnet): B1–B4 (`lib/browser-checks.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/browser-checks.mjs`
- Test: `plugins/pignolo-ui/tests/browser-checks.test.mjs`

**Consumes:** `withBrowser`, `page` (Task 4); `parseColor`, `contrastRatio`, `composite`.
**Produces:** `runChecks(page)`, `runReducedMotionCheck(page)`, `parseComputedColor(value)`, `contrastFindings(items)`, `reflowFindings(data, { width })`, `keyboardFindings(page, { maxSteps })`. Hallazgos crudos `{ id, status, key, reason?, selector?, severity?, measure? }`.

- [ ] **Paso 1: tests primero** (`tests/browser-checks.test.mjs`, 10 tests; 7 con navegador):

```js
// B1-B4 (lib/browser-checks.mjs, spec §5.4, §16.1). The Node-side conversion runs always; the
// page checks need Chrome or Edge and are a visible skip without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveRoutes, BROWSER_SKIP, browserPath } from './helpers.mjs';
import { withBrowser } from '../lib/browser-session.mjs';
import { parseComputedColor, contrastFindings, reflowFindings, runChecks, runReducedMotionCheck } from '../lib/browser-checks.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const page = (body, style = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>p</title><style>body{margin:0;padding:0 24px;background:#fff;color:#111;font:16px/1.4 sans-serif}${style}</style></head><body>${body}</body></html>`;

test('computed colors: rgb with alpha, lab, oklch and color(srgb) are read', () => {
  const rgb = (v) => { const c = parseComputedColor(v); assert.ok(c.ok, v); return c.rgba; };
  assert.deepEqual(rgb('rgba(0, 0, 0, 0.5)').a, 0.5);
  assert.ok(Math.abs(rgb('color(srgb 0.5 0.5 0.5)').r - 0.5) < 1e-9);
  assert.equal(rgb('color(srgb 1 0 0 / 0.25)').a, 0.25);
  assert.ok(rgb('lab(20 0 0)').r < 0.25);
  assert.ok(rgb('oklch(0.8 0 0)').r > 0.7);
  assert.equal(parseComputedColor('color(display-p3 1 0 0)').ok, false);
});

test('B1 on measured items: thresholds, large text, layers, image, disabled, unknown canvas', () => {
  const base = { fontSize: 16, fontWeight: 400, opacity: 1, rootScheme: 'normal' };
  const { findings, checked } = contrastFindings([
    { ...base, selector: 'p.ok', color: 'rgb(17, 17, 17)', layers: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'] },
    { ...base, selector: 'p.low', color: 'rgb(170, 170, 170)', layers: ['rgb(255, 255, 255)'] },
    { ...base, selector: 'h1.large', fontSize: 24, color: 'rgb(148, 148, 148)', layers: ['rgb(255, 255, 255)'] },
    { ...base, selector: 'p.normal-same', color: 'rgb(148, 148, 148)', layers: ['rgb(255, 255, 255)'] },
    { ...base, selector: 'p.veil', color: 'rgb(255, 255, 255)', layers: ['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'] },
    { ...base, selector: 'p.img', color: 'rgb(0, 0, 0)', layers: [], image: 'div.hero' },
    { ...base, selector: 'button.off', color: 'rgb(200, 200, 200)', layers: ['rgb(255, 255, 255)'], disabled: true },
    { ...base, selector: 'p.dark-canvas', color: 'rgb(200, 200, 200)', layers: [], rootScheme: 'dark' },
  ]);
  const by = Object.fromEntries(findings.map((f) => [f.selector, f]));
  assert.equal(by['p.ok'], undefined);
  assert.deepEqual([by['p.low'].status, by['p.low'].measure], ['fail', { ratio: 2.32, required: 4.5, fontSizePx: 16 }]);
  assert.equal(by['h1.large'], undefined, 'large text needs 3:1 (3.03)');
  assert.equal(by['p.normal-same'].status, 'fail');
  assert.equal(by['p.veil'].measure.ratio, 3.98, 'white over black at 50 % over white');
  assert.match(by['p.img'].reason, /image or gradient \(div\.hero\)/);
  assert.equal(by['button.off'], undefined, 'disabled controls are exempt');
  assert.match(by['p.dark-canvas'].reason, /canvas color is not known/);
  assert.equal(checked, 5);
});

test('B3 on measured data: LAYOUT-11 is bloquea only at 320, passes when nothing fails', () => {
  const data = { innerWidth: 320, scrollWidth: 500, clipped: [{ selector: 'p.cut', scrollWidth: 400, clientWidth: 272 }], margin: [{ selector: 'p.edge', left: 0, right: 40 }], checked: 4 };
  const at320 = reflowFindings(data, { width: 320 });
  assert.deepEqual(at320.map((f) => [f.id, f.key, f.severity]), [['LAYOUT-11', 'horizontal-scroll', undefined], ['LAYOUT-11', 'p.cut', undefined], ['LAYOUT-10', 'p.edge', undefined]]);
  const at768 = reflowFindings({ ...data, innerWidth: 768, scrollWidth: 900 }, { width: 768 });
  assert.deepEqual(at768.filter((f) => f.id === 'LAYOUT-11').map((f) => f.severity), ['alto', 'alto']);
  const clean = reflowFindings({ innerWidth: 320, scrollWidth: 320, clipped: [], margin: [], checked: 3 }, { width: 320 });
  assert.deepEqual(clean.map((f) => [f.id, f.status, f.measure.checked]), [['LAYOUT-11', 'pass', 3], ['LAYOUT-10', 'pass', 3]]);
});

async function checkPage(html, { width = 1440, height = 900, theme = 'light', reduced = false, headers = HTML } = {}) {
  const site = await serveRoutes({ '/': { headers, body: html } });
  try {
    return await withBrowser({ executable: browserPath() }, async (browser) => {
      const p = await browser.newPage();
      await p.setViewport({ width, height });
      await p.setMedia({ theme, reducedMotion: reduced });
      await p.navigate(`${site.base}/`);
      await p.waitReady();
      return reduced ? runReducedMotionCheck(p) : runChecks(p);
    });
  } finally {
    await site.close();
  }
}
const ids = (findings, id, status = 'fail') => findings.filter((f) => f.id === id && f.status === status);

test('B1 in the browser: rgb with alpha, lab, oklch and color-mix computed; gradient unverified; disabled exempt', { skip }, async () => {
  const f = await checkPage(page(`
    <p id="ok">Texto legible</p>
    <p id="alpha" style="color: rgb(0 0 0 / 0.3)">Texto translúcido</p>
    <p id="lab" style="color: lab(20 0 0)">Texto lab</p>
    <p id="oklch" style="color: oklch(0.8 0 0)">Texto oklch</p>
    <p id="mix" style="color: color-mix(in srgb, #000 50%, #fff)">Texto mezclado</p>
    <h1 id="large" style="font-size: 24px; color: #949494">Título grande</h1>
    <div style="background-image: linear-gradient(#000, #333)"><p id="grad" style="color: #fff">Sobre degradé</p></div>
    <button id="off" disabled style="color: #ccc; background: #fff">Deshabilitado</button>`));
  assert.deepEqual(ids(f, 'COLOR-03').map((x) => x.selector).sort(), ['#alpha', '#mix', '#oklch']);
  assert.equal(ids(f, 'COLOR-03', 'unverified')[0].selector, '#grad');
  assert.equal(ids(f, 'COLOR-03', 'pass').length, 0, 'no pass entry when something fails');
});

test('B1 in the browser: dark theme is measured with the dark colors', { skip }, async () => {
  const html = page('<p id="t">Texto</p>', '@media (prefers-color-scheme: dark){body{background:#101010;color:#3a3a3a}}');
  assert.deepEqual(ids(await checkPage(html), 'COLOR-03').length, 0);
  assert.deepEqual(ids(await checkPage(html, { theme: 'dark' }), 'COLOR-03').map((x) => x.selector), ['#t']);
});

test('B1 in the browser works under a strict CSP (nothing injected as a script)', { skip }, async () => {
  const f = await checkPage(page('<p id="low" style="color:#aaa">Texto</p>'), { headers: { ...HTML, 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'" } });
  assert.deepEqual(ids(f, 'COLOR-03').map((x) => x.selector), ['#low']);
});

test('B2 in the browser: focus without visible change, trap and role without tabindex', { skip }, async () => {
  const f = await checkPage(page(`
    <nav><a id="home" href="#h">Inicio</a> <div id="menu" role="button">Menú</div></nav>
    <button id="plain" style="outline: none">Sin foco visible</button>
    <button id="ring">Con foco</button>
    <button id="off" disabled>Deshabilitado</button>`, '#ring:focus-visible{outline:3px solid #0b6bcb}'));
  assert.deepEqual(ids(f, 'STATE-04').map((x) => x.selector), ['#plain']);
  assert.deepEqual(ids(f, 'NAV-01').map((x) => [x.selector, x.reason]), [['#menu', 'interactive role without tabindex: not reachable with Tab']]);
  const trap = await checkPage(page(`<input id="trap" aria-label="t" onkeydown="if (event.key === 'Tab') event.preventDefault()"><a id="after" href="#a">Después</a>`));
  assert.deepEqual(ids(trap, 'NAV-01').map((x) => x.selector), ['#after']);
});

test('B2 in the browser: a page where every control shows focus passes', { skip }, async () => {
  const f = await checkPage(page('<a href="#a">Uno</a> <button>Dos</button> <input aria-label="tres">'));
  assert.deepEqual(f.filter((x) => ['NAV-01', 'STATE-04'].includes(x.id)).map((x) => [x.id, x.status, x.measure.checked]), [['NAV-01', 'pass', 3], ['STATE-04', 'pass', 3]]);
});

test('B3 in the browser at 320: horizontal scroll, clipped text, margin; edge-to-edge bar exempt', { skip }, async () => {
  const f = await checkPage(page(`
    <header style="background:#0b6bcb;margin:0 -24px;padding:8px 4px"><span id="bar" style="color:#fff">Barra</span></header>
    <p id="fine">Texto con margen</p>
    <div id="wide" style="width: 500px">Ancho fijo</div>
    <p id="cut" style="white-space: nowrap; overflow: hidden; width: 100px">Un texto que no entra en su caja</p>
    <p id="dots" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100px">Un texto que no entra en su caja</p>
    <pre id="code" style="overflow-x: auto; width: 100px">const larguisimo = 'una línea que no entra';</pre>
    <p id="edge" style="margin-left: -20px">Pegado al borde</p>`), { width: 320, height: 640 });
  assert.deepEqual(ids(f, 'LAYOUT-11').map((x) => x.key), ['horizontal-scroll', '#cut']);
  assert.ok(ids(f, 'LAYOUT-11').every((x) => x.severity === undefined), 'catalog severity (bloquea) at 320');
  assert.deepEqual(ids(f, 'LAYOUT-10').map((x) => x.selector), ['#edge']);
});

test('B4 in the browser: text left at opacity 0 by a reveal animation fails under reduced motion', { skip }, async () => {
  const reveal = '.fade{opacity:0;animation:in 1s forwards}@keyframes in{to{opacity:1}}';
  const bad = page('<h1 class="fade" id="hero">Título</h1><p>Texto</p>', `${reveal}@media (prefers-reduced-motion: reduce){.fade{animation:none}}`);
  assert.deepEqual(ids(await checkPage(bad, { reduced: true }), 'MOTION-07').map((x) => x.selector), ['#hero']);
  const good = page('<h1 class="fade" id="hero">Título</h1><p>Texto</p>', `${reveal}@media (prefers-reduced-motion: reduce){.fade{animation:none;opacity:1}}`);
  const ok = await checkPage(good, { reduced: true });
  assert.deepEqual(ok.map((x) => [x.id, x.status]), [['MOTION-07', 'pass']]);
  const below = page(`<div style="height:2000px"></div><p class="fade" id="far">Lejos</p>`, `${reveal}@media (prefers-reduced-motion: reduce){.fade{animation:none}}`);
  assert.deepEqual(ids(await checkPage(below, { reduced: true, height: 600 }), 'MOTION-07'), [], 'only the first two viewports');
});
```

- [ ] **Paso 2: rojo.** Falla (no existe el módulo).
- [ ] **Paso 3: implementación** (`lib/browser-checks.mjs`):

```js
// The four browser checks of spec §5.4 over the rendered page. The page functions run inside
// the browser (page.evaluate(inPage(fn))); they only read the DOM. The Node
// side turns what they return into entries of the ui-check shape (§5.9 browser.json).
//
// B1 contrast   -> COLOR-03   text over the solid background of its containers
// B2 keyboard   -> NAV-01 (Tab reaches it) and STATE-04 (focus changes computed styles)
// B3 reflow     -> LAYOUT-11 (horizontal scroll, clipped text) and LAYOUT-10 (16 px margin)
// B4 reduced    -> MOTION-07  text of the first two viewports with opacity > 0
//
// runChecks(page) -> raw findings [{ id, status, key, reason?, selector?, severity?, measure? }]
//   B1-B3 on the page as it is (the caller set viewport and theme and navigated);
// runReducedMotionCheck(page) -> raw findings of B4 (the caller
//   navigated again with prefers-reduced-motion: reduce).
import { parseColor, contrastRatio, composite } from './color.mjs';

// ---- page side (serialized with toString; they use the helpers below as free names) ---------

// Helpers defined in the same expression as every page function (see inPage).
const PAGE_HELPERS = String.raw`
  const selectorOf = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const tag = e.tagName.toLowerCase();
      const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [e];
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(e) + 1) + ')' : tag);
    }
    return parts.join(' > ');
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'OPTION']);
  const textNodes = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || SKIP.has(n.parentElement.tagName)) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.display === 'none' || cs.visibility !== 'visible') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({ node: n, el: n.parentElement, rect: r });
    }
    return out;
  };
  const isDisabled = (el) => Boolean(el.closest(':disabled, [aria-disabled="true"]'));
`;

// One expression that defines the helpers and runs fn: nothing is added to the page as a <script>,
// which a strict CSP would block (Runtime.evaluate itself is not subject to the page CSP).
const inPage = (fn) => `(() => { ${PAGE_HELPERS}; return (${fn.toString()})(); })()`;

// B1: foreground, background layers up to the first opaque one, font size and weight.
function collectContrast() {
  const seen = new Set();
  const out = [];
  for (const { el } of textNodes()) {
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const item = { selector: selectorOf(el), color: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || 400, layers: [] };
    if (isDisabled(el)) { item.disabled = true; out.push(item); continue; }
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    item.opacity = opacity;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') { item.image = selectorOf(e); break; }
      if (s.backgroundColor) item.layers.push(s.backgroundColor);
    }
    item.rootScheme = getComputedStyle(document.documentElement).colorScheme;
    out.push(item);
  }
  return out;
}

// B3: horizontal scroll, clipped text and the side margin of every text run.
function collectReflow() {
  const vw = document.documentElement.clientWidth;
  const out = { innerWidth: vw, scrollWidth: document.documentElement.scrollWidth, clipped: [], margin: [], checked: 0 };
  const seen = new Set();
  const isBar = (el) => {
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      const painted = (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) || s.backgroundImage !== 'none' || parseFloat(s.borderBottomWidth) > 0 || parseFloat(s.borderTopWidth) > 0;
      if (painted && r.left <= 0 && r.right >= vw) return true;
    }
    return false;
  };
  for (const { el, rect } of textNodes()) {
    out.checked++;
    const s = getComputedStyle(el);
    if (!seen.has(el)) {
      seen.add(el);
      const scrolls = /auto|scroll/.test(s.overflowX);
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && s.textOverflow !== 'ellipsis' && !scrolls && s.display !== 'inline') {
        out.clipped.push({ selector: selectorOf(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }
    // What is seen of the text: clipped by the nearest container that hides or scrolls it.
    let left = rect.left;
    let right = rect.right;
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (getComputedStyle(e).overflowX === 'visible') continue;
      const box = e.getBoundingClientRect();
      left = Math.max(left, box.left);
      right = Math.min(right, box.right);
      break;
    }
    if ((left < 16 || right > vw - 16) && !isBar(el)) {
      out.margin.push({ selector: selectorOf(el), left: Math.round(left), right: Math.round(vw - right) });
    }
  }
  return out;
}

// B4: text of the first two viewports whose effective opacity is 0.
function collectHiddenText() {
  const limit = innerHeight * 2;
  const hidden = [];
  let checked = 0;
  const seen = new Set();
  for (const { el, rect } of textNodes()) {
    if (rect.top >= limit || rect.bottom <= 0 || seen.has(el)) continue;
    seen.add(el);
    checked++;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity <= 0) hidden.push({ selector: selectorOf(el) });
  }
  return { hidden, checked };
}

// B2, step 1: the elements a keyboard user must reach, with their unfocused styles.
function collectFocusables() {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const NATIVE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"], [tabindex]';
  const ROLES = '[role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [role="combobox"], [role="option"]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility === 'visible' && !el.closest('[inert]');
  };
  const styleOf = (el) => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderTopWidth, s.backgroundColor, s.color, s.textDecorationLine].join('|');
  };
  const list = [];
  for (const el of document.querySelectorAll(`${NATIVE}, ${ROLES}`)) {
    if (!visible(el) || isDisabled(el)) continue;
    if (el.getAttribute('tabindex') !== null && el.tabIndex < 0) continue;
    list.push({ selector: selectorOf(el), style: styleOf(el), focusable: el.tabIndex >= 0 });
  }
  return list;
}

// B2, step 2: after one Tab, what has the focus and how it looks (transitions finished).
function readFocus() {
  for (const a of document.getAnimations()) { try { a.finish(); } catch { /* infinite */ } }
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const s = getComputedStyle(el);
  return { selector: selectorOf(el), style: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderTopWidth, s.backgroundColor, s.color, s.textDecorationLine].join('|') };
}

// ---- Node side --------------------------------------------------------------------------------

// Computed colors come as rgb()/rgba(), lab(), oklch()... and color(srgb r g b / a) for
// color-mix() and relative colors; parseColor does not read color(), so it is mapped to rgb().
export function parseComputedColor(value) {
  const m = /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+%?))?\)$/i.exec(String(value).trim());
  if (m) {
    const [r, g, b] = m.slice(1, 4).map((x) => Number(x) * 100);
    return parseColor(`rgb(${r}% ${g}% ${b}%${m[4] !== undefined ? ` / ${m[4]}` : ''})`);
  }
  return parseColor(String(value));
}

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

export function contrastFindings(items) {
  const out = [];
  let checked = 0;
  for (const it of items) {
    if (it.disabled) continue;
    const key = it.selector;
    if (it.image) { out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: `text over an image or gradient (${it.image})` }); continue; }
    if (it.opacity < 1) { out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: 'translucent text (opacity below 1)' }); continue; }
    const fg = parseComputedColor(it.color);
    const layers = it.layers.map(parseComputedColor);
    const bad = [fg, ...layers].find((c) => !c.ok);
    if (bad) { out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: `color not understood (${bad.reason})` }); continue; }
    const opaque = layers.findIndex((c) => c.rgba.a >= 1);
    if (opaque < 0 && !/^(normal|light)$/.test(it.rootScheme || 'normal')) {
      out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: 'no opaque background and the canvas color is not known' });
      continue;
    }
    const stack = (opaque < 0 ? layers : layers.slice(0, opaque + 1)).reverse();
    const bg = stack.reduce((under, c) => (c.rgba.a >= 1 ? c.rgba : composite(c.rgba, under)), WHITE);
    const ratio = contrastRatio(fg.rgba, bg);
    const large = it.fontSize >= 24 || (it.fontSize >= 18.66 && it.fontWeight >= 700);
    const required = large ? 3 : 4.5;
    checked++;
    if (ratio < required) {
      out.push({ id: 'COLOR-03', status: 'fail', key, selector: it.selector, measure: { ratio: Math.round(ratio * 100) / 100, required, fontSizePx: it.fontSize } });
    }
  }
  return { findings: out, checked };
}

export function reflowFindings(data, { width }) {
  const out = [];
  if (data.scrollWidth > data.innerWidth) {
    out.push({ id: 'LAYOUT-11', status: 'fail', key: 'horizontal-scroll', measure: { scrollWidth: data.scrollWidth, innerWidth: data.innerWidth } });
  }
  for (const c of data.clipped) out.push({ id: 'LAYOUT-11', status: 'fail', key: c.selector, selector: c.selector, measure: { scrollWidth: c.scrollWidth, clientWidth: c.clientWidth } });
  for (const m of data.margin) out.push({ id: 'LAYOUT-10', status: 'fail', key: m.selector, selector: m.selector, measure: { leftPx: m.left, rightPx: m.right, requiredPx: 16 } });
  // LAYOUT-11 is floor (1.4.10) at 320 px only; at other widths it is alto (spec §5.4, B3).
  return out.map((f) => (f.id === 'LAYOUT-11' && width !== 320 ? { ...f, severity: 'alto' } : f)).concat([
    { id: 'LAYOUT-11', status: 'pass', key: 'checked', measure: { checked: data.checked } },
    { id: 'LAYOUT-10', status: 'pass', key: 'checked', measure: { checked: data.checked } },
  ].filter((p) => !out.some((f) => f.id === p.id)));
}

// Walks the page with Tab: every expected element must be reached, and look different.
export async function keyboardFindings(page, { maxSteps = 200 } = {}) {
  const expected = await page.evaluate(inPage(collectFocusables));
  const before = new Map(expected.map((e) => [e.selector, e.style]));
  const reached = new Map();
  const steps = Math.min(maxSteps, expected.length + 5);
  let first = null;
  for (let i = 0; i < steps; i++) {
    await page.pressTab();
    const now = await page.evaluate(inPage(readFocus));
    if (!now) { if (reached.size) break; continue; }
    if (now.selector === first) break;
    first ??= now.selector;
    if (!reached.has(now.selector)) reached.set(now.selector, now.style);
  }
  const out = [];
  for (const e of expected) {
    if (!reached.has(e.selector)) {
      out.push({ id: 'NAV-01', status: 'fail', key: e.selector, selector: e.selector, reason: e.focusable ? 'not reached with Tab' : 'interactive role without tabindex: not reachable with Tab' });
      continue;
    }
    if (reached.get(e.selector) === before.get(e.selector)) {
      out.push({ id: 'STATE-04', status: 'fail', key: e.selector, selector: e.selector, reason: 'focus does not change any computed style' });
    }
  }
  const passed = (id) => !out.some((f) => f.id === id);
  if (passed('NAV-01')) out.push({ id: 'NAV-01', status: 'pass', key: 'checked', measure: { checked: expected.length } });
  if (passed('STATE-04')) out.push({ id: 'STATE-04', status: 'pass', key: 'checked', measure: { checked: expected.length } });
  return out;
}

export async function runChecks(page) {
  const contrast = contrastFindings(await page.evaluate(inPage(collectContrast)));
  const findings = [...contrast.findings];
  if (!findings.some((f) => f.status === 'fail')) findings.push({ id: 'COLOR-03', status: 'pass', key: 'checked', measure: { checked: contrast.checked } });
  const width = await page.evaluate(() => innerWidth);
  findings.push(...reflowFindings(await page.evaluate(inPage(collectReflow)), { width }));
  findings.push(...await keyboardFindings(page));
  return findings;
}

export async function runReducedMotionCheck(page) {
  const { hidden, checked } = await page.evaluate(inPage(collectHiddenText));
  const out = hidden.map((h) => ({ id: 'MOTION-07', status: 'fail', key: h.selector, selector: h.selector, reason: 'text with opacity 0 under prefers-reduced-motion: reduce' }));
  if (!out.length) out.push({ id: 'MOTION-07', status: 'pass', key: 'checked', measure: { checked } });
  return out;
}

```

- [ ] **Paso 4: verde.** 10 pasan (≈ 18 s).
- [ ] **Paso 5: rojo rompiendo lo que protege:** sin leer `color(srgb …)` → caen "computed colors…" y "B1 in the browser: rgb…" (`#mix` pasa a `unverified`); umbral 4,5 siempre → cae "B1 on measured items"; sin eximir deshabilitados → ídem; fondo siempre blanco sin componer capas → ídem (la medida 3,98 del velo); sin el caso del lienzo desconocido → ídem; sin cortar en `background-image` → cae "B1 in the browser: rgb…"; `setMedia` que siempre manda claro → cae "dark theme is measured with the dark colors"; STATE-04 que falla siempre → cae "a page where every control shows focus passes"; STATE-04 que nunca falla → cae "B2 in the browser: focus…"; sin los roles interactivos → ídem; sin la excepción de barras → cae "B3 in the browser at 320"; sin recortar por el contenedor → ídem (`#code`); sin mirar `text-overflow` → ídem (`#dots`); LAYOUT-11 sin bajar a `alto` fuera de 320 → cae "B3 on measured data"; B4 sin el límite de dos viewports → cae "B4 in the browser"; ayudantes inyectados como `<script>` en la página → cae "works under a strict CSP" (un `eval` dentro de la expresión **no** lo pone rojo: CDP también lo exime del CSP; lo que el test protege es no inyectar nada en la página).
- [ ] **Paso 6: commit** `feat(pignolo-ui): chequeos de navegador B1 a B4`.

## Ola 3

### Task 6 (opus): `browser-run` y la CLI `scripts/browser.mjs`

**Files:**
- Create: `plugins/pignolo-ui/lib/browser-run.mjs`, `plugins/pignolo-ui/scripts/browser.mjs`
- Test: `plugins/pignolo-ui/tests/browser-cli.test.mjs`

**Consumes:** Tasks 2, 4 y 5; `loadCatalog`, `ensureRunRoot`, `isInsideRunRoot`, `RUN_ROOT`, `isLoopbackUrl`.
**Produces:** `measurePage`, `capturePage`, `dumpDom`, `preflight`, `BROWSER_RULES`; la CLI `browser.mjs <capture|measure|dom>` con los archivos y códigos de los Rulings.

- [ ] **Paso 1: tests primero** (`tests/browser-cli.test.mjs`, 7 tests; 4 con navegador):

```js
// scripts/browser.mjs end to end (spec §11, §16.1): usage, degraded paths without a browser,
// and the three subcommands against pages served on 127.0.0.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { makeTempDir, writeTree, serveRoutes, runScript, BROWSER_SKIP, PLUGIN_ROOT } from './helpers.mjs';
import { checkPng } from '../lib/png.mjs';
import { BROWSER_RULES } from '../lib/browser-run.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const GOOD = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inicio</title><style>body{margin:0;padding:0 24px;background:#fff;color:#111}</style></head><body><main><h1>Inicio</h1><p>Texto</p></main></body></html>';
const LOW = GOOD.replace('<p>Texto</p>', '<p id="low" style="color:#aaa">Texto claro</p>');

// Async run: the test server lives in this process, so the CLI must not block the event loop.
function cli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'browser.mjs'), ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      resolve({ status, stdout, stderr, json });
    });
  });
}

function project(extra = {}) {
  const root = writeTree(makeTempDir(), { 'index.html': GOOD, ...extra });
  return { root, run: path.join(root, '.pignolo-ui', 'runs', 'r1') };
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('usage errors exit 2 with a message and no stack', async () => {
  const { root, run } = project();
  const CASES = [
    [[], /falta el subcomando/],
    [['measure', '--project', root, '--run', run], /indicá --url o --file/],
    [['measure', '--project', root, '--run', run, '--url', 'https://example.com/'], /solo acepta direcciones locales/],
    [['measure', '--project', root, '--run', path.join(root, 'out'), '--url', 'http://127.0.0.1:9/'], /dentro de \.pignolo-ui\/runs\//],
    [['measure', '--project', root, '--run', run, '--file', path.join(root, '..', 'x.html')], /no existe|fuera del proyecto/],
    [['capture', '--project', root, '--run', run, '--url', 'http://127.0.0.1:9/', '--before', path.join(root, 'index.html')], /--before no es un browser.json/],
    [['measure', '--project', root, '--run', run, '--url', 'http://127.0.0.1:9/', '--platform', 'tv'], /--platform debe ser/],
  ];
  for (const [args, message] of CASES) {
    const r = await cli(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, message);
    assert.doesNotMatch(r.stderr, /error interno|\n\s+at /);
  }
});

test('without a browser: every browser rule is unverified with the reason, never a pass (A-07)', async () => {
  const { root, run } = project();
  const env = { PIGNOLO_UI_BROWSER: path.join(root, 'no-browser.exe') };
  const r = await cli(['measure', '--project', root, '--run', run, '--file', path.join(root, 'index.html')], env);
  assert.equal(r.status, 0);
  assert.match(r.json.degraded, /no browser: PIGNOLO_UI_BROWSER points to a missing file/);
  const json = readJson(path.join(run, 'browser.json'));
  assert.deepEqual(json.entries.map((e) => [e.id, e.status]), BROWSER_RULES.map((id) => [id, 'unverified']));
  assert.deepEqual([json.browser, json.cleanup], [null, null]);
  assert.equal(fs.readFileSync(path.join(root, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  writeTree(root, { 'pages/a/index.html': GOOD });
  await cli(['measure', '--project', root, '--run', run, '--file', path.join(root, 'pages', 'a', 'index.html')], env);
  assert.equal(readJson(path.join(run, 'browser.json')).entries[0].fingerprint, 'COLOR-03|pages/a/index.html|||run', 'a file is named by its project path');
  const c = await cli(['capture', '--project', root, '--run', run, '--file', path.join(root, 'index.html')], env);
  assert.equal(c.status, 0);
  assert.deepEqual(readJson(path.join(run, 'captures.json')).captures, []);
});

test('a URL that does not answer is unverified before any browser starts (§11.2)', async () => {
  const { root, run } = project();
  const site = await serveRoutes({});
  const url = `${site.base}/`;
  await site.close(); // nothing listens there now
  const r = await cli(['measure', '--project', root, '--run', run, '--url', url], { PIGNOLO_UI_BROWSER: path.join(root, 'must-not-start.exe') });
  assert.equal(r.status, 0);
  assert.match(r.json.degraded, /the URL did not respond in 5 s/);
});

test('measure: B1-B4 at every width of the plan, fingerprints without values, exit 1 on a new bloquea', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({ '/': { headers: HTML, body: LOW } });
  try {
    const r = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop']);
    assert.equal(r.status, 1, r.stderr);
    const json = readJson(path.join(run, 'browser.json'));
    assert.match(json.browser, /Chrome|Edg/);
    assert.deepEqual(json.plan, { widths: [{ width: 1440, height: 900, capture: true }, { width: 320, height: 640, capture: false }], themes: ['light'] });
    const fail = json.entries.find((e) => e.id === 'COLOR-03' && e.status === 'fail' && e.measure.width === 1440);
    assert.deepEqual(fail, {
      id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', selector: '#low',
      fingerprint: 'COLOR-03|/|1440|light|#low',
      measure: { ratio: 2.32, required: 4.5, fontSizePx: 16, width: 1440, theme: 'light', page: '/' },
    });
    for (const id of BROWSER_RULES) assert.ok(json.entries.some((e) => e.id === id && e.measure.width === 320), `${id} at 320`);
    assert.equal(json.entries.filter((e) => e.status === 'unverified').length, 0);
    assert.equal(json.cleanup.profileRemoved, true, 'the temporary profile is removed and said so');
    assert.equal(fs.existsSync(json.cleanup.profile), false);
    assert.equal(r.json.leftoverProfile, undefined);

    // The same page measured again with the first run as "before": the fail is debt, alto, exit 0.
    const before = path.join(run, 'before.json');
    fs.copyFileSync(path.join(run, 'browser.json'), before);
    const again = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop', '--before', before]);
    assert.equal(again.status, 0, again.stderr);
    const debt = readJson(path.join(run, 'browser.json')).entries.find((e) => e.fingerprint === 'COLOR-03|/|1440|light|#low');
    assert.deepEqual([debt.scope, debt.severity], ['debt', 'alto']);
  } finally {
    await site.close();
  }
});

test('measure: a redirect to a login page is "requires session", not a pass (§11.2)', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({
    '/panel': { status: 302, headers: { location: '/login' } },
    '/login': { headers: HTML, body: '<!doctype html><title>Entrar</title><form><input type="password" aria-label="clave"></form>' },
  });
  try {
    const r = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/panel`, '--platform', 'desktop']);
    assert.equal(r.status, 0);
    assert.match(r.json.degraded, /requires session: \/panel redirected to \/login/);
    assert.ok(readJson(path.join(run, 'browser.json')).entries.every((e) => e.status === 'unverified'));
  } finally {
    await site.close();
  }
});

test('capture: valid PNGs per viewport, sha256 recorded, dark only when detected, at most 3 crops', { skip }, async () => {
  const long = GOOD.replace('<p>Texto</p>', '<p>Texto</p><div style="height:5000px"></div>').replace('</style>', '@media (prefers-color-scheme: dark){body{background:#000;color:#eee}}</style>');
  const { root, run } = project({ 'app.css': ':root{--bg:#fff}\n@media (prefers-color-scheme: dark){:root{--bg:#000}}\n' });
  const site = await serveRoutes({ '/': { headers: HTML, body: long } });
  try {
    const r = await cli(['capture', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'mobile']);
    assert.equal(r.status, 0, r.stderr);
    const { captures, unverified } = readJson(path.join(run, 'captures.json'));
    assert.deepEqual(unverified, []);
    assert.deepEqual(captures.map((c) => c.path), ['captures/375-light-1.png', 'captures/375-light-2.png', 'captures/375-light-3.png', 'captures/375-dark-1.png', 'captures/375-dark-2.png', 'captures/375-dark-3.png']);
    for (const c of captures) {
      const buf = fs.readFileSync(path.join(run, c.path));
      assert.deepEqual(checkPng(buf), { ok: true, width: 375, height: 812, sha256: c.sha256 });
      assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), c.sha256);
    }
    assert.notEqual(captures[0].sha256, captures[3].sha256, 'light and dark differ');
  } finally {
    await site.close();
  }
});

test('dom: the rendered DOM per width, with what scripts added, readable by ui-check --dom', { skip }, async () => {
  const withScript = GOOD.replace('</main>', '<p id="late"></p><script>document.getElementById("late").textContent = "Añadido por script";</script></main>');
  const { root, run } = project();
  const site = await serveRoutes({ '/': { headers: HTML, body: withScript } });
  try {
    const r = await cli(['dom', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'both']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.doms, ['dom-1440.html', 'dom-375.html', 'dom-768.html', 'dom-320.html']);
    const dom = fs.readFileSync(path.join(run, 'dom-320.html'), 'utf8');
    assert.match(dom, /^<!doctype html>\n<html lang="es">/);
    assert.match(dom, /Añadido por script/);
    const uc = runScript('ui-check.mjs', ['--project', root, '--run', run, '--dom', path.join(run, 'dom-320.html')]);
    assert.equal(uc.status, 0, uc.stderr);
    const a11y01 = readJson(path.join(run, 'ui-check.json')).entries.find((e) => e.id === 'A11Y-01');
    assert.deepEqual([a11y01.status, a11y01.file], ['pass', '.pignolo-ui/runs/r1/dom-320.html']);
  } finally {
    await site.close();
  }
});
```

- [ ] **Paso 2: rojo.** Falla (no existe la CLI).
- [ ] **Paso 3: implementación.**

`lib/browser-run.mjs`:

```js
// The three browser subcommands of spec §11.1 over one page, for every width and theme of
// §11.3. Nothing here decides "passed": what could not be measured is `unverified` with its
// reason (principle 1), and the caller writes the JSON.
//
// measurePage({ url, plan, open, before, page }) -> { browser, finalUrl, entries, degraded }
//   page  the label in fingerprints: the URL path, or the project-relative path of a --file.
// capturePage({ url, plan, open, outDir }) -> { browser, finalUrl, captures, unverified, degraded }
// dumpDom({ url, plan, open, outDir })     -> { browser, finalUrl, doms, unverified, degraded }
//   plan  shotPlan() result; open(fn) runs fn(browser) with a fresh browser and always closes it
//         (withBrowser bound to the executable), or throws BrowserUnavailable.
//   before  a previous browser.json (object) or null: its fails are debt (multiset by fingerprint).
// preflight(url, { timeoutMs = 5000, fetchImpl }) -> null | reason   (spec §11.2: 5 s)
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from './catalog.mjs';
import { runChecks, runReducedMotionCheck } from './browser-checks.mjs';
import { checkPng } from './png.mjs';

export const BROWSER_RULES = ['COLOR-03', 'STATE-04', 'NAV-01', 'LAYOUT-10', 'LAYOUT-11', 'MOTION-07'];
const MAX_CROPS = 3;

export async function preflight(url, { timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  if (!/^https?:/.test(url)) return null;
  try {
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return null;
  } catch (e) {
    return `the URL did not respond in ${timeoutMs / 1000} s (${e.cause?.code || e.name})`;
  }
}

const pathOf = (u) => {
  try { const x = new URL(u); return x.protocol === 'file:' ? path.basename(decodeURIComponent(x.pathname)) : x.pathname; } catch { return u; }
};
const samePage = (a, b) => {
  const norm = (u) => { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/$/, '')}`; };
  try { return norm(a) === norm(b); } catch { return a === b; }
};

// "Requires session" (spec §11.2): the final URL is another page, or a password field is visible.
async function sessionReason(page, url, finalUrl) {
  if (!samePage(url, finalUrl)) return `requires session: ${pathOf(url)} redirected to ${pathOf(finalUrl)}`;
  const pwd = await page.evaluate(() => [...document.querySelectorAll('input[type="password"]')]
    .some((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(i).visibility === 'visible'; }));
  return pwd ? 'requires session: a password field is visible' : null;
}

async function load(page, { url, width, height, theme, reducedMotion = false }) {
  await page.setViewport({ width, height });
  await page.setMedia({ theme, reducedMotion });
  const { finalUrl } = await page.navigate(url);
  await page.waitReady();
  return finalUrl;
}

function unverifiedAll(reason, extra = {}) {
  return BROWSER_RULES.map((id) => ({ id, status: 'unverified', key: 'run', reason, measure: { ...extra } }));
}

// Entry of the ui-check shape (spec §5.5, §5.9) with scope, effective severity and fingerprint.
function toEntries(raw, { page, catalog, before }) {
  const byId = new Map(catalog.rules.map((r) => [r.id, r]));
  const debt = new Map();
  for (const e of before && Array.isArray(before.entries) ? before.entries : []) {
    if (e.status === 'fail') debt.set(e.fingerprint, (debt.get(e.fingerprint) ?? 0) + 1);
  }
  return raw.map((f) => {
    const { width, theme } = f.measure ?? {};
    const fingerprint = [f.id, page, width ?? '', theme ?? '', f.key].join('|');
    let scope = 'new';
    if (f.status === 'fail' && debt.get(fingerprint) > 0) { scope = 'debt'; debt.set(fingerprint, debt.get(fingerprint) - 1); }
    const rule = byId.get(f.id);
    let severity = f.severity ?? rule?.severity ?? 'alto';
    if (f.status === 'fail' && scope === 'debt' && rule?.floor && severity === 'bloquea') severity = 'alto';
    const e = { id: f.id, status: f.status };
    if (f.reason) e.reason = f.reason;
    Object.assign(e, { severity, scope });
    if (f.selector) e.selector = f.selector;
    return { ...e, fingerprint, measure: { ...(f.measure ?? {}), page } };
  });
}

export async function measurePage({ url, plan, open, before = null, catalog = loadCatalog(), page = pathOf(url) }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, entries: toEntries(unverifiedAll(down), { page, catalog, before }) };
  let product = null;
  let finalUrl = null;
  let degraded = null;
  const raw = [];
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      for (const { width, height } of plan.widths) {
        for (const theme of plan.themes) {
          const at = { width, theme };
          try {
            finalUrl = await load(tab, { url, width, height, theme });
            const session = await sessionReason(tab, url, finalUrl);
            if (session) { degraded = session; raw.push(...unverifiedAll(session, at)); return; }
            for (const f of await runChecks(tab)) raw.push({ ...f, measure: { ...(f.measure ?? {}), ...at } });
            await load(tab, { url, width, height, theme, reducedMotion: true });
            for (const f of await runReducedMotionCheck(tab)) raw.push({ ...f, measure: { ...(f.measure ?? {}), ...at } });
          } catch (e) {
            raw.push(...unverifiedAll(`not measured: ${e.message}`, at));
          }
        }
      }
    });
  } catch (e) {
    degraded = e.message;
    raw.push(...unverifiedAll(e.message));
  }
  return { browser: product, finalUrl, degraded, entries: toEntries(raw, { page, catalog, before }) };
}

export async function capturePage({ url, plan, open, outDir }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, captures: [], unverified: [{ reason: down }] };
  const captures = [];
  const unverified = [];
  let product = null;
  let finalUrl = null;
  let degraded = null;
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      fs.mkdirSync(outDir, { recursive: true });
      for (const { width, height } of plan.widths.filter((w) => w.capture)) {
        for (const theme of plan.themes) {
          finalUrl = await load(tab, { url, width, height, theme });
          const session = await sessionReason(tab, url, finalUrl);
          if (session) { degraded = session; unverified.push({ width, theme, reason: session }); return; }
          const total = await tab.evaluate(() => document.documentElement.scrollHeight);
          const crops = Math.min(MAX_CROPS, Math.max(1, Math.ceil(total / height)));
          for (let crop = 1; crop <= crops; crop++) {
            await tab.evaluate((y) => new Promise((r) => { scrollTo(0, y); requestAnimationFrame(() => requestAnimationFrame(() => r(true))); }), (crop - 1) * height);
            let shot = null;
            let reason = null;
            for (let attempt = 0; attempt < 2 && !shot; attempt++) { // one retry (spec §11.3)
              try {
                const buf = await tab.screenshot();
                const v = checkPng(buf);
                if (v.ok) shot = { buf, ...v }; else reason = v.reason;
              } catch (e) { reason = e.message; }
            }
            if (!shot) { unverified.push({ width, theme, crop, reason: `capture failed: ${reason}` }); continue; }
            const name = `${width}-${theme}-${crop}.png`;
            fs.writeFileSync(path.join(outDir, name), shot.buf);
            captures.push({ path: `captures/${name}`, sha256: shot.sha256, width: shot.width, height: shot.height, theme, crop });
          }
        }
      }
    });
  } catch (e) {
    degraded = e.message;
    unverified.push({ reason: e.message });
  }
  return { browser: product, finalUrl, degraded, captures, unverified };
}

export async function dumpDom({ url, plan, open, outDir }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, doms: [], unverified: [{ reason: down }] };
  const doms = [];
  const unverified = [];
  let product = null;
  let finalUrl = null;
  let degraded = null;
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      for (const { width, height } of plan.widths) {
        finalUrl = await load(tab, { url, width, height, theme: 'light' });
        const session = await sessionReason(tab, url, finalUrl);
        if (session) { degraded = session; unverified.push({ width, reason: session }); return; }
        const html = await tab.evaluate(() => {
          const dt = document.doctype;
          return `${dt ? `<!doctype ${dt.name}>` : ''}\n${document.documentElement.outerHTML}\n`;
        });
        const name = `dom-${width}.html`;
        fs.writeFileSync(path.join(outDir, name), html);
        doms.push({ path: name, width });
      }
    });
  } catch (e) {
    degraded = e.message;
    unverified.push({ reason: e.message });
  }
  return { browser: product, finalUrl, degraded, doms, unverified };
}
```

`scripts/browser.mjs`:

```js
// browser.mjs: CDP driver over --remote-debugging-pipe (spec §11). Run only by the main thread.
//
// node <root>/scripts/browser.mjs <capture|measure|dom> --project <repo> --run <folder in .pignolo-ui/runs/>
//   (--url <local URL> | --file <HTML file in the project>) [--design <DESIGN.md>]
//   [--platform desktop|mobile|both] [--dark] [--before <browser.json>]
//
// --url accepts only localhost, 127.0.0.0/8 and [::1] (nothing remote at run time, spec §0);
// the browser is the installed Chrome or Edge (PIGNOLO_UI_BROWSER forces the path).
// Widths and themes (§11.3) come from --platform/--dark, else from DESIGN.md and the project CSS.
//   capture  <run>/captures/<width>-<theme>-<n>.png (viewport crops, at most 3 per width) and
//            <run>/captures.json { version, browser, url, finalUrl, degraded, cleanup, captures, unverified }
//   measure  <run>/browser.json { version, browser, url, finalUrl, degraded, cleanup, plan, entries } with
//            B1-B4 as entries of the ui-check shape; --before makes its fails debt.
//   dom      <run>/dom-<width>.html (rendered DOM, for ui-check --dom) and <run>/dom.json
// cleanup = { graceful, killed, profileRemoved, profile } (null without a browser); a profile that
// could not be removed is also printed as leftoverProfile.
// Prints { out, degraded, ... } on stdout. Exit codes: 0 done (what could not be measured is
// `unverified`, never a pass); 1 measure found a new `bloquea`; 2 usage or own error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { isLoopbackUrl } from '../lib/site-fetch.mjs';
import { findBrowser } from '../lib/browser-find.mjs';
import { openBrowser, BrowserUnavailable } from '../lib/browser-session.mjs';
import { shotPlan, planFromProject } from '../lib/shot-plan.mjs';
import { measurePage, capturePage, dumpDom } from '../lib/browser-run.mjs';

class UsageError extends Error {}
const COMMANDS = ['capture', 'measure', 'dom'];
const VALUE_OPTS = new Set(['project', 'run', 'url', 'file', 'design', 'platform', 'before']);
const FLAGS = new Set(['dark']);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new UsageError(`falta el subcomando: ${COMMANDS.join(' | ')}`);
  const opts = { command };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (FLAGS.has(key)) { opts[key] = true; continue; }
    if (!VALUE_OPTS.has(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: ${[...VALUE_OPTS, ...FLAGS].map((k) => `--${k}`).join(', ')}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  return opts;
}

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

function pageUrl(opts, project, cwd) {
  if ((opts.url === undefined) === (opts.file === undefined)) throw new UsageError('indicá --url o --file (uno de los dos)');
  if (opts.url !== undefined) {
    if (!isLoopbackUrl(opts.url)) throw new UsageError(`--url solo acepta direcciones locales (localhost, 127.0.0.1, ::1): ${opts.url}`);
    return opts.url;
  }
  const file = path.resolve(cwd, opts.file);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new UsageError(`--file no existe o no es un archivo: ${opts.file}`);
  if (!inside(project, file)) throw new UsageError(`--file está fuera del proyecto: ${opts.file}`);
  return pathToFileURL(file).href;
}

function readBefore(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!json || !Array.isArray(json.entries)) throw new Error('no entries');
    return json;
  } catch (e) {
    throw new UsageError(`--before no es un browser.json legible: ${file} (${e.code || e.message})`);
  }
}

export async function main(argv, { cwd = process.cwd(), env = process.env } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.project === undefined) throw new UsageError('falta --project <raíz del repo>');
    const project = path.resolve(cwd, opts.project);
    if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
    if (opts.run === undefined) throw new UsageError(`falta --run <carpeta de la corrida dentro de ${RUN_ROOT}/runs/>`);
    const run = path.resolve(cwd, opts.run);
    if (!isInsideRunRoot(project, run) || !inside(path.join(project, RUN_ROOT, 'runs'), run)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/runs/ del proyecto`);
    const url = pageUrl(opts, project, cwd);
    const design = opts.design !== undefined ? path.resolve(cwd, opts.design) : null;
    if (design && !fs.existsSync(design)) throw new UsageError(`--design no existe: ${opts.design}`);
    if (opts.platform !== undefined && !['desktop', 'mobile', 'both'].includes(opts.platform)) throw new UsageError('--platform debe ser desktop, mobile o both');
    const fromProject = planFromProject({ project, design });
    const plan = shotPlan({ platform: opts.platform ?? fromProject.platform, dark: opts.dark === true || fromProject.dark });
    const before = opts.before !== undefined ? readBefore(path.resolve(cwd, opts.before)) : null;
    if (before && opts.command !== 'measure') throw new UsageError('--before solo vale con measure');

    const found = findBrowser({ env });
    // cleanup of the browser (§11.1) goes into the JSON: a profile that could not be removed is
    // said, with its path, instead of staying behind in silence.
    let cleanup = null;
    const open = async (fn) => {
      if (!found.path) throw new BrowserUnavailable(`no browser: ${found.reason}`);
      const browser = await openBrowser({ executable: found.path });
      try {
        return await fn(browser);
      } finally {
        cleanup = { ...(await browser.close()), profile: browser.profile };
      }
    };

    ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
    fs.mkdirSync(run, { recursive: true });
    const head = { version: 1 };
    let out;
    let summary;
    let exitCode = 0;
    if (opts.command === 'measure') {
      const r = await measurePage({ url, plan, open, before, page: opts.file !== undefined ? path.relative(project, path.resolve(cwd, opts.file)).split(path.sep).join('/') : undefined });
      out = path.join(run, 'browser.json');
      fs.writeFileSync(out, `${JSON.stringify({ ...head, browser: r.browser, url, finalUrl: r.finalUrl, degraded: r.degraded, cleanup, plan, entries: r.entries }, null, 2)}\n`);
      const count = (s) => r.entries.filter((e) => e.status === s).length;
      const blockingNew = r.entries.filter((e) => e.status === 'fail' && e.severity === 'bloquea' && e.scope === 'new').length;
      exitCode = blockingNew ? 1 : 0;
      summary = { counts: { pass: count('pass'), fail: count('fail'), unverified: count('unverified'), blockingNew } };
    } else if (opts.command === 'capture') {
      const r = await capturePage({ url, plan, open, outDir: path.join(run, 'captures') });
      out = path.join(run, 'captures.json');
      fs.writeFileSync(out, `${JSON.stringify({ ...head, browser: r.browser, url, finalUrl: r.finalUrl, degraded: r.degraded, cleanup, captures: r.captures, unverified: r.unverified }, null, 2)}\n`);
      summary = { captures: r.captures.length, unverified: r.unverified.length };
    } else {
      const r = await dumpDom({ url, plan, open, outDir: run });
      out = path.join(run, 'dom.json');
      fs.writeFileSync(out, `${JSON.stringify({ ...head, browser: r.browser, url, finalUrl: r.finalUrl, degraded: r.degraded, cleanup, doms: r.doms, unverified: r.unverified }, null, 2)}\n`);
      summary = { doms: r.doms.map((d) => d.path), unverified: r.unverified.length };
    }
    const degraded = JSON.parse(fs.readFileSync(out, 'utf8')).degraded ?? null;
    const leftover = cleanup && !cleanup.profileRemoved ? { leftoverProfile: cleanup.profile } : {};
    process.stdout.write(`${JSON.stringify({ out, degraded, ...leftover, ...summary, exitCode }, null, 2)}\n`);
    return exitCode;
  } catch (e) {
    process.stderr.write(`browser: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
```

- [ ] **Paso 4: verde.** 7 pasan (≈ 15 s).
- [ ] **Paso 5: rojo rompiendo lo que protege:** aceptar una URL remota → cae "usage errors"; sin navegador no escribir las entradas `unverified` → cae "without a browser"; sin el prechequeo de la URL → cae "a URL that does not answer"; sin `--before` como deuda → cae "measure: B1-B4…"; sin comparar la URL final → cae "requires session"; `MAX_CROPS` 10 → cae "capture"; DOM sin `<!doctype>` → cae "dom"; no escribir `cleanup` → cae "measure: B1-B4…"; la página de un `--file` como nombre de archivo en vez de ruta del proyecto → cae "without a browser".
- [ ] **Paso 6: commit** `feat(pignolo-ui): browser.mjs con capture, measure y dom`.

## Ola 4

### Task 7 (sonnet): prueba transversal, documentación, versión y cierre

**Files:**
- Test: `plugins/pignolo-ui/tests/hito-3-acceptance.test.mjs`
- Modify: `plugins/pignolo-ui/.claude-plugin/plugin.json` (`version` 0.4.0), `plugins/pignolo-ui/CHANGELOG.md`, `plugins/pignolo-ui/README.md`, `plugins/pignolo-ui/catalog/rules.json` (solo `note`: "the 4 browser checks (browser.mjs measure, hito 3)"), `docs/specs/2026-09-28-pignolo-ui-v1-design.md` (§5.10 nueva y dos líneas de §11), `docs/STATE.md`.

- [ ] **Paso 1: test transversal** (`tests/hito-3-acceptance.test.mjs`): `measure`, `dom` y `capture` por la CLI sobre una página con dos defectos (texto claro y botón sin foco visible), `ui-check --dom --measures`, `report-check` que conserva la afirmación de la falla (citada desde `browser.json` y desde `ui-check.json`) y la de la captura, retira la que dice "pasa" y, después de un `measure` nuevo, da por vencido `ui-check.json`:

```js
// Hito 3 end to end through the CLIs (spec §8 step 2, §11, §12): measure, dom and capture on a
// page served on 127.0.0.1, ui-check with --dom and --measures, and report-check citing
// browser.json and a capture. Without Chrome or Edge: visible skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { makeTempDir, writeTree, serveRoutes, runScript, BROWSER_SKIP, PLUGIN_ROOT } from './helpers.mjs';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta</title>
<style>body{margin:0;padding:0 24px;background:#fff;color:#111;font:16px sans-serif} .muted{color:#9a9a9a} #save{outline:none}</style></head>
<body><main><h1>Cuenta</h1><p class="muted" id="hint">Última actualización hace 2 días</p><button id="save">Guardar</button></main></body></html>`;

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function browserCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'browser.mjs'), ...args]);
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

test('hito 3: the browser evidence reaches ui-check and report-check', { skip: BROWSER_SKIP }, async () => {
  const root = writeTree(makeTempDir(), { 'DESIGN.md': '---\nname: X\npignolo:\n  schema: 1\n  platform: desktop\n---\n' });
  const run = path.join(root, '.pignolo-ui', 'runs', '2026-09-30-audit-cuenta');
  const site = await serveRoutes({ '/cuenta': { headers: HTML, body: PAGE } });
  const common = ['--project', root, '--run', run, '--url', `${site.base}/cuenta`, '--design', path.join(root, 'DESIGN.md')];
  try {
    assert.equal((await browserCli(['measure', ...common])).status, 1, 'B1 and B2 find new bloquea');
    assert.equal((await browserCli(['dom', ...common])).status, 0);
    assert.equal((await browserCli(['capture', ...common])).status, 0);
  } finally {
    await site.close();
  }
  const browser = readJson(path.join(run, 'browser.json'));
  const hint = browser.entries.find((e) => e.fingerprint === 'COLOR-03|/cuenta|1440|light|#hint');
  assert.equal(hint.status, 'fail');
  assert.ok(browser.entries.some((e) => e.fingerprint === 'STATE-04|/cuenta|1440|light|#save' && e.status === 'fail'));

  const uc = runScript('ui-check.mjs', ['--project', root, '--run', run, '--design', path.join(root, 'DESIGN.md'), '--dom', path.join(run, 'dom-1440.html'), '--measures', path.join(run, 'browser.json')]);
  assert.equal(uc.status, 1, uc.stderr);
  const uiCheck = readJson(path.join(run, 'ui-check.json'));
  assert.ok(uiCheck.entries.some((e) => e.id === 'A11Y-02' && e.status === 'pass' && e.file.endsWith('dom-1440.html')));
  assert.ok(uiCheck.entries.some((e) => e.fingerprint === hint.fingerprint));

  const capture = readJson(path.join(run, 'captures.json')).captures[0];
  const report = {
    version: 1,
    implemented: false,
    evidence: { 'ui-check.json': sha(path.join(run, 'ui-check.json')), 'browser.json': sha(path.join(run, 'browser.json')) },
    claims: [
      { id: 'c1', text: 'El texto de ayuda no llega al contraste mínimo', rule: 'COLOR-03', status: 'fail', measure: { ratio: hint.measure.ratio }, ref: { source: 'browser', fingerprint: hint.fingerprint } },
      { id: 'c2', text: 'El texto de ayuda tiene buen contraste', rule: 'COLOR-03', status: 'pass', ref: { source: 'browser', fingerprint: hint.fingerprint } },
      { id: 'c3', text: 'Así se ve la pantalla', ref: { source: 'capture', path: capture.path, sha256: capture.sha256 } },
      { id: 'c4', text: 'Lo mismo, citado desde ui-check', rule: 'COLOR-03', status: 'fail', ref: { source: 'ui-check', fingerprint: hint.fingerprint } },
    ],
  };
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report));
  const rc = runScript('report-check.mjs', ['--project', root, '--run', run]);
  assert.equal(rc.status, 1, rc.stderr);
  const out = readJson(path.join(run, 'report-check.json'));
  assert.deepEqual(out.kept, ['c1', 'c3', 'c4']);
  assert.deepEqual(out.retired, [{ id: 'c2', reason: 'evidence says COLOR-03 fail' }]);

  // Measuring again changes browser.json: ui-check.json, which listed it as an input, is stale.
  fs.appendFileSync(path.join(run, 'browser.json'), '\n');
  report.evidence['browser.json'] = sha(path.join(run, 'browser.json'));
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report));
  runScript('report-check.mjs', ['--project', root, '--run', run]);
  const stale = readJson(path.join(run, 'report-check.json')).retired.find((r) => r.id === 'c4');
  assert.match(stale.reason, /ui-check\.json is stale: \.pignolo-ui\/runs\/2026-09-30-audit-cuenta\/browser\.json changed after it ran/);
});
```

  Verde al escribirlo (≈ 12 s): la integración ya estaba hecha por las Tasks 3 y 6. **Rojo rompiendo lo que protege:** sin agregar las entradas de `--measures` → cae; sin `browser.json` en `inputs` → cae (la afirmación `c4` no queda vencida).
- [ ] **Paso 2: documentación** (texto, en español):
  - `CHANGELOG.md`, entrada `0.4.0 — sin publicar`: `browser.mjs` (`capture`, `measure`, `dom`), B1–B4, `ui-check --measures`; motivo de subir a 0.4.0 (interfaz nueva); qué cambia para el usuario (hace falta Chrome o Edge instalado para medir; sin navegador todo sale "no verificado"; `--url` solo local; las capturas quedan en la carpeta del run; un perfil temporal que no se pudo borrar se informa con su ruta).
  - `README.md`: sección "Navegador" (qué navegador usa, `PIGNOLO_UI_BROWSER`, que nunca toca el navegador ni el perfil del usuario, que no levanta el servidor, "requiere sesión", dónde quedan capturas y DOM, que los tests de navegador sin navegador salen como skip).
  - Spec §5.10 "Aclaraciones técnicas del hito 3": los Rulings de B1–B4, "requiere sesión", huella y `--before`, alturas 640/1024, Edge antes que Chrome, `cleanup` y los campos agregados de `browser.json`; en §11.1, "cierra primero sus páginas" y "reintenta el borrado del perfil hasta 20 s".
  - `docs/STATE.md`: el hito 3 construido, con lo que queda para el hito 4 (URL en `project.json`, respaldo MCP, presupuesto de imágenes, ruta de referencia) y Node 22 todavía sin probar.
- [ ] **Paso 3: suite completa.** `npm run test:ui` y `npm test` en verde; `PIGNOLO_UI_BROWSER=Z:/none/chrome.exe npm run test:ui` en verde con los tests de navegador como skip visible; con `PIGNOLO_UI_BROWSER` apuntando a Chrome, los 26 tests de navegador en verde.
- [ ] **Paso 4: sin restos.** Ningún proceso con `pignolo-ui-browser-` en su línea de comandos y ninguna carpeta `%TEMP%\pignolo-ui-browser-*` nueva después de la suite.
- [ ] **Paso 5: commit** `docs(pignolo-ui): hito 3 del navegador, versión 0.4.0` y revisión final opus de `main..ui/hito-3`.

---

## Decisiones que necesita el autor

**D-3-1 — Perfiles temporales que no se pudieron borrar.** Con el navegador colgado y bajo carga, el borrado del perfil puede no terminar en 20 s (pasó al escribir este plan: quedaron carpetas `%TEMP%\pignolo-ui-browser-*` de corridas con sabotajes y de mediciones de tiempos). Hoy el plan **no borra nada fuera de su propio perfil**: lo informa (`cleanup.profileRemoved: false` en el JSON y `leftoverProfile` en la salida) para que la skill se lo diga al usuario.
- **Recomendación:** dejarlo así en v1 (informar, no podar). Motivo: borrar carpetas que no creó esta corrida es una decisión reservada, y el tamaño es chico (cientos de archivos, del orden de MB por perfil).
- **Alternativa:** al arrancar, `browser.mjs` borra las carpetas `pignolo-ui-browser-*` de `os.tmpdir()` con más de 24 h. Cambio chico (una función en `lib/browser-session.mjs` y un test con carpetas falsas viejas y nuevas); se decide antes de la ola 1.

**D-3-2 — Probar en una app real antes de unir (opcional).** Como en el spike (§16.2), correr `browser.mjs measure` sobre una o dos apps locales del autor mostraría falsos positivos de B1–B4 que las páginas sintéticas no ven (sobre todo B2 con componentes y B3 con layouts reales). Necesita que el autor nombre la app y la URL, y los resultados quedarían solo en `local/`. **Recomendación:** sí, una app, después de la ola 3 y antes de la revisión final; si el autor prefiere no hacerlo, queda en el checklist manual del hito 4.

**Revisado contra lo reservado (sin otra decisión):** sin dependencias ni binarios nuevos (el navegador es el instalado, como decidió A-07); sin costo de API; nada se publica ni se sube; ningún contrato que consuma el núcleo cambia (`--measures` ya estaba en §5.5; `browser.json` crece de forma aditiva y es interno de pignolo-ui); el mensaje de uso de `ui-check` sin entradas cambia de texto (no es contrato). Un ruling acota el spec a favor de la seguridad y queda anotado para la revisión: `--url` solo local también en `browser.mjs` (§8 dice "URL o ruta"; una URL de la red local o de *staging* se rechaza; un archivo va por `--file`).

## Contradicciones y huecos del spec encontrados

1. **§11.3 no da la altura** de los anchos que solo se miden (768 y 320). Ruling: 1024 y 640; B4 ("dos primeros viewports") depende de eso.
2. **§5.4 B1 "fondo sólido de su contenedor"** no dice qué pasa con fondos translúcidos apilados ni con texto translúcido. Ruling: capas compuestas hasta la primera opaca; texto con opacidad < 1, `unverified`.
3. **§5.4 B2 "cambian sus estilos computados"** no dice cuáles. Ruling: la lista de B2 en Rulings; un cambio solo de `cursor` o `transform` no cuenta.
4. **§5.4 B3 "sin text-overflow"** choca con la excepción de 1.4.10 para contenido que necesita dos dimensiones. Ruling: `overflow-x: auto|scroll` exento.
5. **§5.3 "en `improve`, el 'antes' es la medición del paso 2"** no dice cómo se compara. Ruling: `--before` y multiconjunto por huella, como `--base` en `ui-check`.
6. **§11.1 "política corporativa que bloquea la depuración remota"** no se pudo probar en esta máquina: se cubre con el mismo camino que "el navegador no contesta por el pipe" (`BrowserUnavailable` → `unverified`), declarado.
7. **§11.2 respaldo MCP y URL en `project.json`**, y **§11.3 presupuesto de 8 imágenes**: son de las skills (hito 4); acá solo queda el contrato que esas skills van a usar.
8. **§11.1 "`dom` … para las reglas `document`"** no dice en qué tema: el DOM se toma en claro (el marcado no depende del tema).

## Qué se verificó al escribir este plan

Copia: clon de la worktree del plan en `c3f3291` (rama local `replay/ui-3`), en Windows 11 Pro, Node 24.13.1, Edge 154.0.4258.37 y Chrome 154.0.8037.58, con el Edge del usuario sin tocar (perfil temporal propio siempre). Borrada al terminar.

- **Línea de base:** `npm run test:ui` → 713 tests, 711 pasan, 2 salteados (el linter oficial ausente).
- **Rojo de cada test:** en las Tasks 1 y 3 el test se escribió primero y falló contra el código ausente (Task 3: 9 de 9 en rojo por la opción desconocida). En las Tasks 2, 4, 5 y 6 el código de la copia se escribió antes o a la par del test (se estaba explorando el protocolo), así que **cada test de esas tareas se demostró en rojo rompiendo lo que protege**: la lista del Paso 5 cubre todos sus tests, uno por uno. Quien ejecute el plan sí escribe los tests primero (Paso 1) y los ve fallar contra el módulo ausente (Paso 2). Los rojos de cada Paso 5 se corrieron con un script que aplica un `sed`, corre solo los tests del patrón y restaura el archivo: todos cayeron en el test anotado, salvo dos que se corrigieron antes de fijar el plan (el velo de B1 pasaba con el fondo siempre blanco: el test ahora compara la medida 3,98; y el `eval` bajo CSP, que CDP exime: el sabotaje válido es inyectar un `<script>`).
- **Hallazgos al ejecutar, ya incorporados:**
  - `processesWith` encontraba al propio PowerShell (su línea de comandos lleva el perfil) → `$_.ProcessId -ne $PID`.
  - Bajo carga (la suite completa en paralelo), un proceso hijo seguía vivo justo después de cerrar y un perfil no se borró en 10 s → el chequeo de huérfanos espera hasta 15 s (`leftoverProcesses`), el borrado reintenta hasta 20 s y la muerte del árbol se repite una vez.
  - `Page.navigate` contra un servidor que no contesta vence su propio plazo antes que el evento de carga → se traduce a `PageLoadError`.
  - Un texto dentro de `pre { overflow-x: auto }` fallaba el margen → el rectángulo se recorta por el contenedor.
  - **Cada CLI tardaba ≈ 8,8 s de más en salir:** `Promise.race` con `sleep(8000)` dejaba vivo el temporizador. Con `exited()` que lo limpia: `measure` 1,1 s, `dom` 1,0 s, `capture` 1,0 s (página chica, `desktop`). El test "after close nothing keeps Node alive" lo protege.
  - `Browser.close` no siempre termina (una vez con una página con `input[type=password]`, otras al azar) → cerrar las páginas antes: 14 de 14 cierres limpios contra 5 de 6.
  - Perfiles que quedaron de corridas con sabotaje y de mediciones → D-3-1 y `cleanup`/`leftoverProfile`.
- **Suite final:** `node --test "plugins/pignolo-ui/tests/**/*.test.mjs"` (lo mismo que `npm run test:ui`) → 764 tests, 762 pasan, 2 salteados, 24–29 s, en tres corridas seguidas con el código final. Sin navegador (`PIGNOLO_UI_BROWSER=Z:/none/chrome.exe`): 764, 743 pasan, 21 salteados (19 de navegador con `# SKIP sin navegador: PIGNOLO_UI_BROWSER points to a missing file: …`). Con Chrome forzado: los 4 archivos de navegador, 26 de 26. Núcleo (`tests/**/*.test.js`): 1092 de 1092. Esas cuatro últimas corridas (dos con Edge, una sin navegador, una con Chrome) no dejaron carpetas `pignolo-ui-browser-*` nuevas ni procesos con ese perfil.
- **Replay byte a byte:** un segundo clon limpio en `c3f3291`, armado solo con los bloques de este plan (archivos completos, el `diff` de la Task 3 aplicado con `git apply`, los agregados a `tests/helpers.mjs` y la línea de `tests/ui-check-cli.test.mjs`): los 19 archivos coinciden byte a byte con la copia de trabajo, y su suite da 764 tests, 762 pasan, 2 salteados.
- **`--file` con navegador real:** `measure --file index.html --platform mobile` sobre una página con texto `#bbb` → 2 `COLOR-03` `bloquea` (375 y 320), exit 1, `finalUrl` `file:///…/index.html`.
- **No verificado:** Node 22 (no está instalado; sigue en el checklist manual, §16.4); macOS y Linux (el descubrimiento y la muerte del árbol por grupo de procesos se probaron solo como tabla y en Windows); una política corporativa que bloquee la depuración remota; apps reales (D-3-2).
