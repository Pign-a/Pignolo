# pignolo-ui v1 — spec de diseño

Fecha: 2026-09-28 · Repo: https://github.com/Pign-a/Pignolo (público, MIT) · Plugin hermano de pignolo (spec del núcleo: `docs/specs/2026-09-26-pignolo-v1-design.md`, citado como "núcleo §n").
Estado: diseño aprobado por el autor (borrador v2, partes 0–5) más dos rondas de decisiones del autor del 2026-09-28. Revisado de forma independiente (`REQUEST_CHANGES`) y corregido en una pasada: la tabla del pie dice cómo quedó cada hallazgo. Es la fuente de verdad para el plan de implementación.

**Convenciones.**
- "(decisión del autor, A-n)" remite a §0.2; el agente no la cambia.
- Toda decisión técnica (núcleo §4.3) lleva su motivo en una frase: "— porque …".
- **[spike]** marca un punto no verificado o condicionado; se prueba en §16.2 y tiene respaldo escrito. **[V]** significa verificado en la documentación oficial de Claude Code (bajada el 2026-09-28).
- "Script + texto" / best-effort: el script es determinista, pero que el agente respete lo que devuelve es instrucción, no mecanismo (núcleo §1.2).
- Los ids R-xx y Rn remiten a documentos locales pendientes de revisión para publicar (§19).
- Nombres de elementos, ids, claves y texto interno de skills y agentes van en inglés; lo que lee el usuario, en su idioma y en lenguaje llano.

---

## 0. Qué es y para qué

pignolo-ui es un plugin de Claude Code **opcional**, hermano de pignolo y en el mismo marketplace. Ayuda a los agentes de código a **crear y mejorar interfaces web**, sea cual sea el framework. Anda sin el núcleo y, si el núcleo está instalado, convive con él según §14 (A-01).

- **Promesa:** *decisiones de diseño explícitas y verificadas* (A-05). Toda decisión visual queda escrita en `DESIGN.md`, la verifica un script determinista y un auditor que cita evidencia, y lo que el usuario rechazó no vuelve. El conteo de rasgos de IA apilados es solo un indicador interno.
- **Cuatro piezas la sostienen:** `DESIGN.md` validado, script (`ui-check`), auditor con evidencia (`ui-auditor` + `report-check`) y memoria de rechazos. Criterio de diseño: ante la duda, lo más chico que sostenga la promesa — porque el autor pidió simplicidad.
- **Técnico por detrás, llano por delante** (A-04): ids, umbrales y tokens viven en archivos y JSON. El usuario lee frases llanas con el id entre paréntesis al final.
- **Sin dependencias npm, sin hooks, sin binarios y sin nada remoto en tiempo de ejecución** — porque es donde más fallan las skills de UI relevadas (R9, R17).
- **Requisitos:** Node ≥ 20 (A-12) y Claude Code ≥ 2.1.271 — porque `omitClaudeMd` y `options` de `userConfig` existen desde esa versión, y en versiones anteriores `omitClaudeMd` se ignora sin aviso [V]. Al arrancar, cada comando corre `claude --version`. Si la versión es menor o no se puede leer, avisa y usa el camino secuencial (§7.5), porque sin `omitClaudeMd` el aislamiento de `ui-option` no rige.

### 0.1 Criterio de éxito de la v1

1. **Auditor:** con entradas congeladas y ≥ 5 corridas por caso, recall ≥ 80 % de los defectos sembrados, y **≤ 20 % de las páginas limpias con al menos un falso positivo** (§16.3).
2. **Formato:** la plantilla y los fixtures de salida de `extract` pasan `@google/design.md@0.4.0 lint` con 0 errores y 0 warnings (test de desarrollo).
3. **Tests:** `npm test` en verde, sin red, en Windows nativo y en otro SO. Los tests de navegador sin navegador salen como skip visible, nunca como verde.
4. **"Terminado" honesto:** ningún flujo lo dice sin las condiciones de §12. Hay un fixture por condición.
5. **Aislamiento y diversidad:** el archivo trampa no aparece en ningún mockup y las N opciones superan el umbral de §7.5.
6. **Checklist manual** (§16.4) completo, con y sin el núcleo.
7. **Ablación** con y sin plugin, medida con chequeos deterministas: se informa. Es evidencia, no compuerta.

### 0.2 Decisiones del autor (todas del 2026-09-28)

Las de ronda 1 y ronda 2 se tomaron tras un debate con un agente opus por opción (`local/debate-ui-2026-09-28/SINTESIS*.md`) y se aprobaron tal como estaban recomendadas. Ante cualquier conflicto con un borrador anterior, vale esta tabla.

| id | Decisión |
|---|---|
| A-01 | Plugin hermano **independiente** `pignolo-ui`, opcional, en el mismo marketplace; para **web** y agnóstico de framework. |
| A-02 | **3 opciones por decisión**, cada una generada por su propio subagente; el usuario puede bajarlo a 1. |
| A-03 | Formato **`DESIGN.md` de Google Labs**, con extensión `pignolo:`. |
| A-04 | Se valida según la **plataforma declarada** (escritorio, móvil o ambas). Técnico por detrás, llano por delante. |
| A-05 | Promesa: "decisiones de diseño explícitas y verificadas". El conteo de rasgos de IA es un indicador interno. |
| A-06 | La v1 incluye solo **chequeos SEO estáticos por script**, y solo si `DESIGN.md` declara el sitio como público. El esquema `web:` se fija ya. GEO y CRO quedan para después. |
| A-07 | Navegador: el Chrome o Edge instalado, por CDP y sin paquetes; si no hay, MCP de navegador si existe; si tampoco, "no verificado". Todo, previa prueba (spike). |
| A-08 | Ninguna ley en lo que produce el agente. Solo un aviso en el README ("no es asesoría legal ni certifica cumplimiento") con enlaces oficiales fechados. |
| A-09 | Validador de `DESIGN.md` propio y sin dependencias. El oficial corre solo si ya está instalado. Test de desarrollo contra la versión 0.4.0. |
| A-10 | Tono por registro: `product` → contención; `brand` → identidad, con la audacia en un solo lugar. Las normas del autor mandan sobre la base. |
| A-11 | El núcleo permite **exactamente** `pignolo-ui:ui-option` y `pignolo-ui:ui-auditor`. Con el núcleo activo, implementa su `implementer`, y el hilo principal registra en `decisions/` la elección del usuario tomada de su turno. **[spike]:** si el hook no distingue el origen del agente o la elección no se puede registrar desde un canal humano, se usa el camino secuencial y se declara. |
| A-12 | Transporte al navegador: **`--remote-debugging-pipe`**, sin WebSocket ni puerto. Piso **Node ≥ 20**, el mismo que el núcleo. |
| A-13 | **axe-core fuera de v1**: solo reglas propias. El spike mide axe en apps reales; si aporta, axe fijado en v1.1, que vuelve a ser decisión del autor (dependencia y licencia MPL-2.0). |
| A-14 | Artifacts: solo **mockups y style tiles con datos de ejemplo**, y solo si el autor lo habilita **por proyecto**. Nunca capturas ni código. El camino principal es HTML local. **Modificada por A-20.** |
| A-15 | **v1 mínima con el SEO estático adentro**; `noindex` en la URL de desarrollo como `detalle`. `ui-option` en **sonnet**, y en opus solo si el spike muestra que sonnet no pasa los chequeos de forma o de diversidad. 3 opciones, con estimación antes de cada ronda. |
| A-16 | **Tema oscuro opcional con detección:** cuenta como declarado si el proyecto lo declara **o** si el CSS ya tiene `.dark`, `[data-theme]` o `prefers-color-scheme`. En ese caso, tokens completos y AA en los dos temas. |
| A-17 | Diseño v2 aprobado (partes 0–4). Parte 5 (pruebas) aprobada tal como se presentó. |
| A-18 | Tras el debate r3 (`local/debate-ui-2026-09-28/r3-*.md`): (a) `stateUrls` pasa a **v1.1**; sin esa clave, los estados que no se alcanzan quedan "no verificado". (b) `extract` queda en v1: **primero lee la configuración que ya existe** (Tailwind config, `:root`, tema shadcn); contar colores frecuentes es solo el último recurso, se muestra como diff que el usuario confirma y los tokens quedan marcados "extraídos, no decididos". (c) La comparación mockup ↔ implementación queda en v1, **solo informativa** (nunca bloquea), compara estructura y no tokens. El spike la valida con fixtures; si da > 30 % de diferencias falsas, pasa a v1.1. |
| A-19 | La **versión final aprobada de cada decisión visual** (la opción elegida o combinada en `new` y en `improve`, y la dirección visual del paso 0) **se guarda en el proyecto como HTML versionado**, y el agente que implementa se basa en ella. Motivo: entre elegir, escribir spec o plan e implementar, el resultado "no queda igual". A-20 la convierte en una carpeta por flujo. |
| A-20 | **Presentación en lienzo "Design"** (modifica A-14 y A-19). **Cuándo:** el artifact tipo "Design" de Claude Code (artboards `.dc.html`, controles con `is_interactive`, links entre artboards navegables en modo Play, comentarios por artboard, export) es la forma **principal** de presentar las opciones de `new` y de `improve`, y la dirección visual del paso 0, siempre que la herramienta Artifact y ese tipo estén disponibles. **Consentimiento:** una vez por proyecto, guardado en `project.json`. **Qué se publica:** solo mockups con marcadores; nunca capturas, código del proyecto ni datos reales. **Forma:** cada opción es un **flujo navegable** con un artboard por pantalla; las N opciones van en filas del mismo lienzo, cada fila con una nota `title1`; los tamaños siguen la plataforma declarada. **Elección:** el usuario puede comentar un artboard para elegir o combinar, pero la registra el hilo principal desde el turno del usuario. **Fuente de verdad:** el HTML local estándar; un script lo envuelve mecánicamente en `.dc.html` y se verifica lo local, no el lienzo publicado. **Aprobado:** pasa a ser una **carpeta** con un HTML por pantalla y un `manifest.json`. **Sin la herramienta o sin el tipo:** el mismo prototipo navegable, como HTML local. **v1.1:** un artifact "Design System" generado desde `DESIGN.md`. |

---

## 1. Principios

Valen los del núcleo (§1): verificar, no creer; declarar lo que no se ejecuta; fallar cerrado donde se puede; costo proporcional al riesgo; contexto acotado; Windows sin sandbox; el agente es falible, no atacante. Se agregan estos:

1. **"No corrió" no es "pasó".** Cada regla devuelve `pass | fail | unverified (motivo)`. Un valor sin resolver propaga "no verificado", y un script sin salida nunca cuenta como aprobado — porque un hallazgo sobre un valor vacío es un verde o un rojo falso (R4).
2. **Evidencia de efecto, no de retorno.** Cada acción se confirma con una lectura independiente del estado — porque las herramientas y los subagentes pueden informar éxito sin efecto (R3).
3. **Los bucles tienen tope** (§6); lo pendiente se informa — porque los bucles de revisión visual no convergen solos (R5).
4. **El usuario elige en su propio turno**, nunca en texto que escribió el modelo — porque la elección tiene que salir de un canal que el modelo no puede escribir (R13).
5. **El piso no baja.** Ningún nivel ni excepción apaga WCAG 2.2 A/AA, CONTENT-01 al llevar a código ni un rechazo registrado (§4.1).
6. **Nunca una segunda fuente de tokens** (§4.5).
7. **La fuente de verdad es local; publicar requiere consentimiento por proyecto.** El lienzo "Design" es la presentación principal cuando está disponible y el usuario consintió. Lo publicado es exactamente lo local, y nunca incluye capturas, código ni datos reales (A-14, A-20).
8. **El hilo principal mide; los subagentes no ejecutan nada.** El navegador y todos los scripts los corre el hilo principal. `ui-option` solo escribe y `ui-auditor` solo lee — porque así ningún subagente necesita Bash y la convivencia con el núcleo se reduce a los dos nombres de A-11.

---

## 2. Forma del plugin

Vive en `plugins/pignolo-ui/` del mismo repo y se registra en el `marketplace.json` de la raíz.

```
plugins/pignolo-ui/
  .claude-plugin/plugin.json   nombre, versión (semver), userConfig (§3.1)
  skills/new|improve|audit/SKILL.md   los tres comandos (disable-model-invocation: true)
  skills/<cmd>/reference/      texto de apoyo que carga el hilo principal
  agents/ui-option.md          generador de una opción (§7.4)
  agents/ui-auditor.md         auditor (§10)
  scripts/ui-check.mjs         checker (§5); --gate para compuertas del núcleo
  scripts/design-md.mjs        validate | extract | patch (§4)
  scripts/compare.mjs          huella y diferencia de opciones; aprobado ↔ implementación (informativa)
  scripts/report-check.mjs     cruce afirmación ↔ evidencia (§12)
  scripts/browser.mjs          driver CDP por pipe: capture | measure | dom (§11)
  scripts/files.mjs            save | verify | restore (§9)
  scripts/run.mjs              carpeta del run, poda, compare.html (prototipo local navegable), apertura
  scripts/approve.mjs          guarda el aprobado (carpeta + manifest) en design/approved/ y lo verifica (§3.3)
  scripts/to-canvas.mjs        envuelve los HTML locales en artboards .dc.html del lienzo "Design" (§13.1)
  lib/yaml-subset.mjs  lib/color.mjs  lib/token-sources.mjs  lib/strip-comments.mjs  lib/route.mjs
  catalog/rules.json           única fuente del catálogo (§5.1)
  catalog/symptoms.json        diccionario de síntomas (§5.7)
  norms/base.md                normas base (HIG, Fluent 2, WCAG 2.2, investigación)
  templates/DESIGN.md          plantilla 0/0 con el linter 0.4.0
  tests/                       node:test, fixtures sintéticos, evals, checklist manual
  README.md  CHANGELOG.md  CREDITS.md  LICENSE
```

| Comando | Qué hace | Cambia archivos |
|---|---|---|
| `/pignolo-ui:new <pantalla>` | Pantalla nueva (§7) | Sí, tras la elección del usuario |
| `/pignolo-ui:improve <URL o ruta>` | Mejora una pantalla (§8) | Sí, tras la elección del usuario |
| `/pignolo-ui:audit <URL o ruta>` | Solo diagnóstico (§10) | No |

- **Solo se entra por comandos.** En v1 no hay skill de activación automática — porque la activación por descripción no es confiable y falla en silencio (R7); el checker es un script y corre igual.
- Lo primero que hace cada comando es imprimir la versión cargada del plugin — porque una caché vieja no se nota (R15). El README explica cómo limpiarla.
- El texto del comando dice "el usuario pidió N subagentes para esta decisión" — porque el modelo puede tener instrucciones de no delegar si nadie lo pidió (R2).
- Las skills despachan siempre con el **nombre completo** (`pignolo-ui:ui-option`) y con `model` explícito en cada invocación — porque el parámetro de la invocación tiene prioridad sobre el frontmatter [V] y el hook del núcleo compara el nombre exacto (§14).
- `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` y los valores de `userConfig` se sustituyen en el texto de la skill y **no** llegan al entorno de Bash [V]. Por eso la skill se los pasa a los scripts **como argumentos**.
- **Empaquetado:** un linter del plugin (en `npm test`) verifica la lista R9 (estructura estándar, nombres, descripciones, rutas, imports en Windows, `$<dígito>` escapado, sin hooks ni binarios, sin archivos `CLAUDE.md`/`AGENTS.md`, cada `SKILL.md` ≤ ~3 k tokens). El detalle va al plan.
- **Huella en el proyecto del usuario:** los únicos archivos versionados que pignolo-ui crea o edita son `DESIGN.md`, los aprobados de `design/approved/` (§3.3) y las ediciones de UI aprobadas.

---

## 3. Configuración y dónde vive cada cosa

### 3.1 `userConfig` del plugin

Es del propio plugin y no usa `~/.pignolo/config.json` — porque así no depende en secreto del núcleo (R-23).

| Clave | Tipo | Valores | Por defecto |
|---|---|---|---|
| `optionsPerDecision` | `string` con `options` | `"1"`, `"3"` | `"3"` (A-02, A-15) |
| `presentation` | `string` con `options` | `"auto"` (lienzo "Design" si está disponible y hay consentimiento en el proyecto; si no, local), `"local"` (nunca se publica) | `"auto"` (A-20, §13) |
| `language` | `string` | código BCP 47; vacío = idioma de la conversación | vacío |

### 3.2 Archivos

| Qué | Dónde | Quién escribe | Versionado |
|---|---|---|---|
| `DESIGN.md` | Raíz del repo. Se busca sin distinguir mayúsculas; el nombre canónico es `DESIGN.md` | El agente, solo con un diff que el usuario confirma (§4.4) | Sí |
| Normas del autor | `~/.pignolo/ui/norms.md` | Solo el autor, a mano; el plugin lo lee | No |
| Aprobados (A-19, A-20) | `design/approved/<flujo>/` en la raíz del repo: un HTML por pantalla + `manifest.json` | Solo `approve.mjs`, después de la elección del usuario (§3.3) | Sí (commiteable) |
| Datos de máquina por proyecto (URL de desarrollo, rutas confirmadas, ruta de referencia, `canvasConsent`) | `${CLAUDE_PLUGIN_DATA}/<repo-id>/project.json` | Solo los scripts | No |
| Carpeta del run (capturas, DOM, JSON, flujos de opciones, `canvas/` con los `.dc.html`, `compare.html`, copias, informe) | `<tmp del sistema>/pignolo-ui/<repo-id>/<run-id>/` [spike] | Scripts; cada subagente, solo su archivo | No |

- `${CLAUDE_PLUGIN_DATA}` existe [V] (`~/.claude/plugins/data/<id>/`) y persiste entre actualizaciones, pero **se borra al desinstalar** el plugin. El README lo avisa: desinstalar hace perder las URLs y rutas confirmadas.
- `repo-id` es el hash de la ruta de `git rev-parse --git-common-dir`, como en el núcleo (§8.2). `run-id` = `<fecha-hora>-<comando>-<slug>`.
- **Poda:** al arrancar, cada comando borra los runs de más de 14 días, solo dentro de su `pignolo-ui/<repo-id>/` — porque pueden tener capturas con datos de la app, y así se alinea con los 14 días del núcleo.
- **Carpeta del run [spike]:** el spike elige **una** de estas opciones, en este orden:
  1. tmp, si `Write`/`Read` de un subagente fuera del proyecto no pide permiso;
  2. `<repo>/.pignolo-ui/runs/`, con un `.pignolo-ui/.gitignore` que contiene `*`, que se ignora a sí mismo sin tocar archivos versionados;
  3. mismo `ui-option` con `tools: []`, que devuelve el HTML en su respuesta para que lo escriba el hilo principal (~10 k tokens por opción en el contexto principal).
- **`norms.md`:** frontmatter con el esquema `pignolo:` (§4.3) más la clave `symptoms`, que solo es válida acá; después, prosa. Si falta, se usan las normas base. Si no valida, se ignora entero con un aviso de una línea — porque aplicar normas a medias es peor que no aplicarlas (R-24). En v1 no hay comando `norms`: el formato está en el README. pignolo-ui nunca escribe en `~/.pignolo/**`.

### 3.3 Aprobados (A-19)

La versión final aprobada de cada decisión visual es la fuente de verdad para implementar. Eso incluye la opción elegida o combinada en `new` y en `improve`, y la dirección visual (style tile) del paso 0. Las decisiones técnicas que siguen son del agente.

- **Ruta:** `design/approved/<flujo>/`, en la raíz del repo y versionada (A-20). `<flujo>` es el nombre del flujo o de la pantalla, o `direction` para la dirección visual. Adentro hay un HTML estándar por pantalla, enlazados entre sí con links relativos, de modo que la carpeta se navega abriéndola en el navegador. También hay un `manifest.json` con la lista de archivos y el sha256 de cada uno.
- **Contenido:** los HTML aprobados tal cual (los locales estándar, no los `.dc.html`): autocontenidos, con charset y sin recursos remotos. Llevan el texto funcional y el que dio el usuario en el brief; todo lo demás va como marcador `‹…›` con `data-sample`. Nunca contenido inventado ni datos personales o de sistemas reales — porque la carpeta se commitea en el repo del usuario.
- **Registro:** `approve.mjs` escribe la carpeta y agrega en `## Decisions` de `DESIGN.md` una entrada con la ruta, el **sha256 del `manifest.json`**, la fecha y la cita literal de la elección. La entrada se muestra como diff y el usuario la confirma.
- **Inmutable:** un aprobado no se edita nunca. Cualquier cambio crea `<flujo>-v2/` (`-v3`…), que pasa de nuevo por la elección y la aprobación; su entrada queda vigente, sin borrar la anterior. `approve.mjs` se niega a escribir sobre una carpeta que ya existe.
- **Verificación:** antes de implementar, `approve.mjs verify` comprueba el sha256 del manifest contra `DESIGN.md` y el de cada archivo contra el manifest, y que no haya archivos de más ni de menos. Si algo no coincide: `BLOCKED`.
- **Chequeos:** `ui-check` trata `design/approved/**` como **mockup**: CONTENT-01 por marcadores da `detalle`, nunca `bloquea`, y esos archivos nunca entran al alcance de una implementación.
- Se recomienda commitear el aprobado junto con `DESIGN.md`; el agente no commitea por su cuenta.

---

## 4. Normas, piso y `DESIGN.md`

### 4.1 Niveles y piso

- **Niveles.** En todo lo que no es piso, gana el más específico: `norms/base.md` → `~/.pignolo/ui/norms.md` → `DESIGN.md`.
- **Registro** (A-10): `product` → contención; `brand` → identidad, con la audacia en un solo lugar. Si no está declarado, se pregunta al crear o completar `DESIGN.md`.
- **Plataforma** (A-04): `desktop | mobile | both`. Sin declarar, vale `both`. Filtra las reglas marcadas D o M y los anchos de §11.4.
- **Piso fijo:** WCAG 2.2 A/AA, CONTENT-01 al llevar a código real y la reaparición de un rechazo traducido a patrón. **Ningún nivel lo baja.** `intentional` solo acepta reglas que en el catálogo tienen `acceptsIntentional: true`; el validador **rechaza** cualquier otra — porque si no, una línea en `DESIGN.md` apagaría la accesibilidad (R-10).
- Los criterios AAA nunca bloquean: son `detalle`.

### 4.2 Formato `DESIGN.md`

- Google Labs **fijado a 0.4.0** (A-03, A-09). Claves oficiales: `version`, `name`, `description`, `omitted`, `colors`, `typography`, `rounded`, `spacing`, `components`. Los estados van como variantes con nombre (`button-primary-hover`). Los semánticos usan el vocabulario MD3 (`primary`, `on-surface`, `surface-container`…) — porque el linter oficial marca como huérfanos los colores que no lo usan.
- **Las extensiones van solo bajo `pignolo:`**, nunca dentro de `typography` ni de `components`. Las ausencias se escriben con `omitted`, y la prosa cita tokens (`{colors.primary}`), no valores — porque 0.4.0 avisa por sub-propiedades desconocidas (R10).
- **En `pignolo:`, los valores hoja no llevan hex ni dimensiones con unidad.** Se usan números con el sufijo en el nombre (`widthPx`, `durationMs`), colores en OKLCH o `rgb()`, o referencias `{colors.x}` — porque la regla `token-like-ignored` de 0.4.0 los marca [verificado ejecutando el linter].
- **Contrato con el linter oficial:** lo que **genera** pignolo-ui pasa con 0 errores y 0 warnings. Un `DESIGN.md` **del usuario** puede tener warnings: se informan y no bloquean — porque exigir 0/0 a texto ajeno es un contrato frágil (R-20). El linter solo corre si ya está instalado (`npx --no-install`); si no corre, el resultado es "no verificado". En desarrollo se instala a mano, fuera de `package.json`.
- **Contenido obligatorio:**
  - tokens primitivos y semánticos;
  - escalas de tipografía, espaciado, radios, elevación y movimiento;
  - estados de cada control;
  - jerarquía y orden de lectura (en prosa);
  - `platform` y `register`.

  Si falta algo: `alto`, y se propone completarlo como diff.
- **Decisiones:** sección de prosa `## Decisions`, con fecha, qué y por qué. Incluye las entradas de los aprobados (§3.3). **Rechazos:** en `pignolo.rejections` (§5.6) y en la prosa.
- **CSS:** se genera con código propio, nunca con el `export` DTCG oficial — porque ese export convierte mal `lineHeight` con unidades.

### 4.3 Esquema `pignolo:` (versión 1, cerrado)

Toda clave que no esté en esta lista es un error del validador. Los mapas cuyas claves se declaran "libres" aceptan cualquier nombre, pero solo con el tipo de valor indicado.

| Clave | Tipo y claves permitidas |
|---|---|
| `schema` | `1` |
| `platform` | `desktop \| mobile \| both` |
| `register` | `product \| brand` |
| `themes.dark` | mapa: nombre de un color existente en `colors` → color OKLCH o `rgb()` (claves libres, restringidas a los nombres de `colors`) |
| `elevation` | mapa `level0`…`level5` → cadena `box-shadow` completa o `"none"` |
| `states` | `hoverOpacity`, `focusOpacity`, `pressedOpacity`, `draggedOpacity`, `disabledContentOpacity`, `disabledContainerOpacity` → número 0–1 |
| `focus` | `color` (referencia `{colors.x}`), `widthPx`, `offsetPx` (números) |
| `motion.durationMs` | `fast`, `base`, `slow`, `slower` → número |
| `motion.easing` | `standard`, `decelerate`, `accelerate` → cadena `cubic-bezier(...)` |
| `motion.reducedMotion` | `fade-or-none \| none` |
| `borders` | `subtle`, `strong` (referencia `{colors.x}`), `widthPx` (número) |
| `targets` | `minPx`, `recommendedPx` (números) |
| `cssVars` | mapa: nombre de token → nombre de variable CSS (`--x`) (claves libres) |
| `extracted` | lista de nombres de tokens "extraídos, no decididos" (A-18); cada uno sale de la lista cuando el usuario lo confirma como decisión |
| `intentional` | lista de `{ id, why }`; `id` con `acceptsIntentional: true` |
| `rejections` | lista de `{ id: R-nnn, date, rule?, pattern?, note }`; `pattern` = `{ kind: selector \| property \| text, value }`, donde `value` es una cadena sin hex ni dimensión al inicio (se escribe como regex o en OKLCH) |
| `web` | `public` (bool), `indexable` (bool); **reservadas** (se validan en su forma, no activan reglas en v1): `locales` (lista), `aiCrawlers` (mapa o `null`), `llmsTxt` (bool), `structuredData` (lista), `conversion` (mapa o `null`) |

- El esquema `web:` se fija completo desde ya, para que el contrato no cambie (A-06).
- No hay `a11y` — porque el objetivo (WCAG 2.2 AA) y el trato de AAA son fijos (§4.1), y en lo que produce el agente no se nombra ninguna ley (A-08).
- **Tema oscuro** (A-16): cuenta como declarado si existe `themes.dark` **o** si el CSS tiene `.dark`, `[data-theme]` o `@media (prefers-color-scheme: dark)`. Si está declarado, cada semántico tiene que estar definido en los dos temas y se pide AA en ambos (THEME-03). Si el CSS tiene oscuro y `DESIGN.md` no, es `alto` y se propone completarlo. Si no hay oscuro, no se pide ni se captura.

### 4.4 Parser YAML propio (`lib/yaml-subset.mjs`)

- **Soporta:** mapas y listas por bloque; mapas y listas en línea de una sola línea; claves entre comillas; comentarios; escalares con números; hasta 4 niveles.
- **Ante** anclas o alias, bloques `|`/`>`, varios documentos o colecciones en línea que ocupan varias líneas: "YAML no soportado: no validado", y ninguna regla de ese archivo se evalúa — porque leer mal en silencio da verdes falsos (R-09).
- Un error en una clave es un hallazgo de esa clave; el resto se sigue evaluando.
- **Escritura** (`patch`): solo inserta o reemplaza líneas, nunca vuelve a serializar. Cada cambio se muestra como diff y el usuario lo confirma — porque volver a serializar destruye comentarios y formato.
- Solo se usan fixtures de terceros con licencia MIT o Apache-2.0, y quedan registrados en `CREDITS.md`.

### 4.5 Fuentes de tokens del proyecto

`lib/token-sources.mjs` detecta la fuente que ya existe y **nunca crea una segunda** — porque sobrescribir la configuración o duplicar tokens es la falla más común al aplicar cambios (R8).

| Fuente | Lectura | Escritura en v1 |
|---|---|---|
| Variables CSS en `:root`, `.dark`, `[data-theme]` | Sí | Sí, en el bloque existente |
| Tailwind v4 `@theme` / `@theme inline` | Sí | Sí, en el bloque existente |
| shadcn (`components.json` + `:root`/`.dark`, HSL desnudo) | Sí | Sí, en el mismo formato |
| Tailwind v3 `tailwind.config.*` | Solo si el tema es un objeto literal; si no, "no verificado" | Solo reemplazo textual de un valor literal existente |
| CSS-in-JS, temas MUI o Chakra | No | No: **"no soportado"**, dicho explícitamente |

Estos límites existen porque leer la configuración ejecutándola es correr código ajeno, y porque un resultado a medias es peor que decir "no soportado" (R-08).

- **Colores que se entienden** (`lib/color.mjs`): hex de 3, 4, 6 u 8 dígitos; `rgb`, `hsl`, `hwb`, `oklch`, `oklab`, `lab` y `lch`, con alfa; HSL desnudo; `var()` encadenadas con fallback; `color-mix()` en `srgb` y `oklch`. Cualquier otro formato: "no verificado" (R12).
- **Sincronía.** `DESIGN.md` manda en las **decisiones** y el CSS en lo que **se ve**. Por eso se escribe en la dirección `DESIGN.md` → CSS.
  - La única vez que se va al revés es el **arranque** (`extract`, A-18): se arma un `DESIGN.md` a partir del código. **Primero** se lee la configuración que ya existe (`@theme` o `tailwind.config` literal, variables de `:root` y `.dark`, tema shadcn). Solo como **último recurso**, si no hay nada de eso, se cuentan los colores, las fuentes y los radios más frecuentes: esos tokens van a `pignolo.extracted` ("extraídos, no decididos") y el informe lo dice. Todo se muestra como diff que el usuario confirma.
  - Después, `cssVars` le permite al script cruzar los dos lados y reportar **DRIFT-01** (`alto`). El usuario elige cuál gana — porque sincronizar solo en las dos direcciones da verdes falsos (R-08).
- **Contraste medido dos veces:**
  - sobre pares de tokens en `DESIGN.md`;
  - sobre el CSS resuelto a través de `cssVars`; sin mapa, "no verificado".

  Los pares que se miden son `on-X` sobre `X` según el vocabulario MD3, los pares `backgroundColor`/`textColor` de cada componente y los que se declaren en la prosa de `DESIGN.md` como `{colors.a} sobre {colors.b}`. Si hay tema oscuro, se miden en los dos temas.

---

## 5. Catálogo de reglas de la v1

### 5.1 Una sola fuente

`catalog/rules.json` guarda, por regla:

- `id`;
- criterio;
- `class: script | browser | agent`;
- `level: document | element | style`;
- plataforma (`D | M | D+M`);
- `severity` base;
- `floor` (bool);
- `acceptsIntentional` (bool);
- fuente con versión.

Los conteos y la documentación se generan desde ese archivo. Un test verifica que los ids sean únicos, que las referencias existan, que no convivan pares de reglas que se contradicen y que ninguna regla con `floor` acepte `intentional`. Los snippets del catálogo se ejecutan en una página de prueba — porque un catálogo sin tests se contradice solo (R14).

- Toda regla marcada `script` tiene un checker con fixture en rojo y en verde; si no lo tiene, se degrada a `agent`, y así queda declarado.
- **En v1 tienen checker 25 reglas, más 4 chequeos de navegador y el SEO estático.** Las otras ~125 quedan como guía de texto para el auditor — porque el costo real de una regla está en su fixture (R-15).

### 5.2 Nivel de las reglas

**Nivel (`level`)**:
- **`document`**: la regla se evalúa **solo** sobre el DOM que entrega el navegador (`browser.mjs dom`) o sobre un archivo que contenga `<html>`. En cualquier otro caso devuelve `unverified (not a document)`. Así, un componente `.tsx` nuevo no bloquea por falta de `<title>`. Son de documento A11Y-01, A11Y-02, A11Y-05, A11Y-28, META-01 y todas las SEO.
- **`element`**: la regla se evalúa sobre el marcado de cualquier archivo que acepte el ruteo.
- **`style`**: la regla se evalúa sobre CSS y bloques `<style>`.

### 5.3 Severidad y alcance

**Escala única:** `bloquea | alto | medio | detalle`. Además, cada hallazgo lleva `scope: new | debt` y `status: pass | fail | unverified`.

| Condición | Severidad |
|---|---|
| Piso con evidencia de script o de navegador, **nuevo en lo tocado** | `bloquea` |
| Piso con evidencia solo de juicio del agente | `alto` — porque un bloqueo no puede descansar en una opinión (R-11) |
| Piso preexistente | `alto`, rotulado **deuda** |
| Reglas de look (`acceptsIntentional: true`) | `medio` o `detalle`; se apilan |
| Criterio cuyo único fundamento es AAA | `detalle` |

**Alcance (decisión técnica): solo bloquea lo nuevo en lo tocado.** Lo preexistente es deuda: se informa y no bloquea — porque en una app real bloquear por la pantalla entera haría imposible terminar cualquier mejora (R-02). Vale igual para `new` y para `improve`:

- **Qué entra al alcance:** los archivos nuevos del lote, más el delta de los archivos que el lote modifica.
- **Ref base:** `<base>` se fija **después** de verificar el paso 2 de §9 (el usuario ya commiteó sus cambios en los archivos esperados). Así, lo que commitea el usuario no se cuenta como nuevo.
- **Código:** `ui-check` corre sobre cada archivo tocado dos veces: en la versión de `<base>` (`git show <base>:<ruta>`) y en la actual. Los hallazgos se comparan como **multiconjunto** de `(id, huella)`. La huella es el selector o el texto normalizado, sin número de línea. Si en la versión actual hay más apariciones de un par que en la base, las de más son nuevas.
- **Navegador:**
  - En `improve`, el "antes" es la medición del paso 2 (§8).
  - En `new`, si la app ya existe, antes de implementar se mide una **ruta de referencia** que comparte el layout. El usuario la confirma una vez y queda guardada en `project.json`. Lo que aparece también ahí es deuda. Sin ruta de referencia, todo cuenta como nuevo.
- **`audit`** no cambia nada, así que no bloquea nada: informa severidades y rotula la deuda.

**Qué significa "bloquea" (decisión técnica):**

- Códigos de salida de `ui-check`:
  - `0`: no hay ningún `bloquea` en alcance;
  - `1`: hay al menos uno;
  - `2`: error propio del script. Cuenta como "no verificado", nunca como aprobado.
- Con código distinto de 0, el comando no puede decir "terminado".
- Queda declarado como **"script + texto"** — porque un plugin sin hooks no puede impedir nada por sí mismo.
- Con el núcleo instalado, el comando ofrece agregar `ui-check --gate` a las compuertas de `.pignolo/project.md`. Lo confirma el humano, y desde ahí lo hace cumplir la capa 2 del núcleo.
- **Los juicios nunca bloquean.**

### 5.4 Reglas con checker en v1

Leyenda de las columnas: **Nivel** = `d` document, `e` element, `s` style. **Int.** = acepta `intentional`.

| id | Qué chequea en v1 | Nivel | Piso | Severidad en alcance | Int. |
|---|---|---|---|---|---|
| A11Y-01 | `<html lang>` presente y BCP 47 válido | d | 3.1.1 A | `bloquea` | no |
| A11Y-02 | `<title>` presente y no vacío | d | 2.4.2 A | `bloquea` | no |
| A11Y-04 | Nombre accesible estático de `button`, `a`, `input`, `[role=button]`; botón solo-ícono con nombre | e | 4.1.2 A | `bloquea` | no |
| A11Y-05 | Exactamente un `main` | d | — | `alto`, porque es buena práctica, no WCAG | no |
| A11Y-16 | `input`, `select` y `textarea` con etiqueta | e | 1.3.1 / 4.1.2 A | `bloquea` | no |
| A11Y-26 | `img` con atributo `alt`; `svg[role=img]` con nombre (presencia; la calidad la juzga el agente) | e | 1.1.1 A | `bloquea` | no |
| A11Y-28 | Viewport sin `user-scalable=no` ni `maximum-scale` < 2 | d | 1.4.4 AA | `bloquea` | no |
| A11Y-39 | Ningún enfocable dentro de `aria-hidden="true"`; nunca en `body` | e | 4.1.2 A | `bloquea` | no |
| COLOR-03 | Contraste de texto entre pares de tokens (§4.5): 4.5:1, o 3:1 si es grande; alfa compuesto; los dos temas | s | 1.4.3 AA | `bloquea` | no |
| COLOR-04 | Contraste no textual (borde funcional, `focus-ring`) de 3:1 | s | 1.4.11 AA | `bloquea` | no |
| STATE-04 | `outline: none/0` sin `:focus-visible` que dibuje un indicador | s | 2.4.7 AA | `bloquea` | no |
| MOTION-03 | Hay animación o transición de `transform` sin `@media (prefers-reduced-motion: reduce)` | s | — (2.3.3 es AAA; también HIG y MDN) | `medio` | no |
| MOTION-04 | `transition: all` | s | — | `medio` | sí |
| COLOR-02 | Colores literales fuera de la fuente de tokens | s | — | `medio` | sí |
| DEPTH-01 | `box-shadow` literal fuera de tokens | s | — | `medio` | sí |
| LAYOUT-04 | `border-radius` literal fuera de tokens | s | — | `medio` | sí |
| DRIFT-01 | `DESIGN.md` y CSS difieren (vía `cssVars`) | s | — | `alto` | no |
| THEME-01 | Primario, superficie, radio o fuente son los valores por defecto del framework, sin declararlos | s | — | `medio` | sí |
| THEME-02 | shadcn: ≥ 80 % de las variables de color coinciden con un `baseColor` publicado | s | — | `medio` | sí |
| COLOR-11 | Acento de fábrica (primario con H OKLCH 265°–310° y C ≥ 0.12, o degradé azul→violeta) | s | — | `medio` | sí |
| COLOR-12 | Texto con `background-clip: text` sobre degradé: la presencia es `medio`; si algún punto no llega a 4.5:1, se reporta como COLOR-03 | s | 1.4.3 (solo el contraste) | `medio` / `bloquea` | sí (solo la presencia) |
| ICON-01 | Emoji al inicio del texto de `button`, `a` de navegación, `h1`–`h6` o `li` | e | — | `medio` | sí |
| CONTENT-01 | **Marcadores:** `data-sample` o `‹…›` → `bloquea` al llevar a código real, `detalle` en un mockup (§7.1). **Heurísticas:** `lorem ipsum`, "John/Jane Doe", "Acme", avatares de relleno, cifras redondas sin fuente → `medio` | e | Piso propio (solo marcadores) | `bloquea` / `medio` | no |
| COPY-01 | Muletillas de marketing (es/en). Con otro `lang`, "no verificado" | e | — | `detalle` | sí |
| META-01 | Título de plantilla, favicon por defecto, atribución de un generador | d | — | `medio` | sí |

- **JSX no resoluble:** las expresiones `{label}`, los spreads `{...props}` y los componentes propios (`<Button>`) no se pueden resolver de forma estática. En A11Y-04/16/26 salen `unverified`, con su fixture. El navegador (DOM renderizado) cubre esos casos cuando está disponible.
- **Validador** (`design-md.mjs validate`):
  - esquema cerrado (§4.3);
  - contenido obligatorio (§4.2);
  - `intentional` no permitido → **rechaza** escribir el archivo;
  - THEME-03 (oscuro completo): `alto`, no acepta `intentional`;
  - valores que dispararían `token-like-ignored` → rechaza.

**Navegador: 4 chequeos propios** (A-07, A-13). Corren sobre el DOM renderizado, así que no dependen de que el marcado se pueda resolver en forma estática.

| # | Chequeo | Regla | Severidad |
|---|---|---|---|
| B1 | Contraste computado del texto sobre el fondo sólido de su contenedor. Imagen o degradé: "no verificado" | COLOR-03 | `bloquea` si es nuevo |
| B2 | Recorrido con Tab: se llega a cada enfocable (incluido el botón del menú de navegación) y, al enfocarlo, cambian sus estilos computados | STATE-04 (2.4.7), NAV-01 parte teclado (2.1.1) | `bloquea` si es nuevo |
| B3 | Ningún texto con `scrollWidth > clientWidth + 1` sin `text-overflow`, sin scroll horizontal y con margen lateral ≥ 16 px | LAYOUT-11 a 320 px (1.4.10) → `bloquea`; a otros anchos → `alto`; LAYOUT-10 → `alto` | ver regla |
| B4 | Con `prefers-reduced-motion: reduce` y sin scroll, todo el texto de los dos primeros viewports tiene opacidad > 0 | MOTION-07 | `alto` |

NAV-01 bloquea solo en su parte de teclado (2.1.1) y de objetivo de 24 px (2.5.8); el resto es `medio`. En v1 solo la parte de teclado tiene checker (B2). PROC-02 (nada de teatro de diseño en el informe) lo hace cumplir `report-check` (§12).

**SEO estático** (A-06, A-15). Solo con `web.public: true`. Corre sobre archivos y, si hay URL de desarrollo, sobre lo que devuelve `fetch`. Son 7 ids (la decisión hablaba de "unas 5 reglas"), no gastan tokens y **nunca bloquean**, porque no son piso.

| id | Qué chequea | Severidad |
|---|---|---|
| SEO-01 | `robots.txt` existe (o da 404, que equivale a todo permitido), no bloquea rutas públicas ni assets de render y referencia un sitemap | `medio` |
| SEO-02 | `noindex` accidental: en el código fuente de una página pública → `alto`; visto solo en la URL de desarrollo → `detalle` | `alto` / `detalle` |
| SEO-04 | Un solo `link[rel=canonical]`, absoluto | `medio` |
| SEO-05 | El sitemap referenciado existe y es XML válido | `medio` |
| SEO-06 | `<title>` no vacío y sin duplicados entre las rutas revisadas | `medio` |
| SEO-09 | Ningún `a` sin `href` usado como enlace; ningún `href="javascript:…"` | `medio` |
| SEO-18 | `og:title`, `og:type`, `og:image`, `og:url` | `detalle` |

### 5.5 Ruteo, comentarios y salida

Hay una sola tabla de ruteo (`lib/route.mjs`), compartida por el script y el auditor — porque dos caminos daban dos respuestas (R4):

| Extensión | Reglas |
|---|---|
| `.html`, `.jsx`, `.tsx` | marcado (`element`, y `document` si hay `<html>`) |
| `.css` y bloques `<style>` | `style` |
| Cualquier otra (`.vue`, `.svelte`, `.astro`…) | "no verificado (extensión no soportada)" |

- Antes de evaluar se quitan los comentarios de cada sintaxis (CSS, JS/TS, JSX, HTML).
- Invocación:

  ```
  node <root>/scripts/ui-check.mjs --files <rutas> [--dom <run>/dom-*.html] [--base <ref>] --run <carpeta> [--design <ruta>] [--measures <browser.json>] [--gate]
  ```

- Salida en `<run>/ui-check.json`:
  - versión del catálogo;
  - sha256 de cada entrada;
  - una entrada por regla y ubicación: `{ id, status, reason?, severity, scope, file?, line?, selector?, fingerprint, measure? }`.

  Nada se omite: lo que no corrió aparece como `unverified` con su motivo.

### 5.6 Rechazos

- El agente traduce cada rechazo a un id o a un `pattern` (§4.3), y el usuario confirma la traducción en su turno.
- Los rechazos traducidos entran al piso: si reaparecen en algo nuevo, `bloquea`.
- Los que no se pueden traducir quedan como aviso de juicio (`medio`) — porque un gusto sin patrón no lo detecta un script (R-13).

### 5.7 Diccionario de síntomas

`catalog/symptoms.json` traduce las palabras del usuario ("se ve plana", "bordes negros", "apretada") a ids y a arreglos en tokens. El usuario puede sumar palabras en `norms.md` (`symptoms`). Se usa para armar el menú de `improve` (§8).

- `llms.txt` no se genera, y los permisos de crawlers de IA se difieren junto con GEO (§18).
- `CREDITS.md` lista las fuentes de las ideas.

---

## 6. Topes de los flujos

| Flujo | Tope |
|---|---|
| `new` | 1 ronda de direcciones, solo si el proyecto está vacío. Después, 1 ronda de mockups (+ ≤ 1 regeneración), 1 implementación, 1 chequeo en lote, 1 lote de arreglos y ≤ 1 confirmación. |
| `improve` | 1 inspección en lote → 1 ronda de versiones (+ ≤ 1 regeneración) → 1 lote de arreglos → ≤ 1 confirmación. |
| `audit` | 1 pasada. |

Al llegar al tope, lo que queda se informa como pendiente y el flujo termina (R5).

---

## 7. Flujo de pantalla nueva (`/pignolo-ui:new <pantalla>`)

**0. `DESIGN.md`.**
- Si existe, se valida (§4) y, si falta algo, se propone completarlo como diff.
- Si no existe y el proyecto ya tiene estilos, primero se **extrae** (§4.5) y se muestra como diff. Direcciones nuevas solo si el usuario las pide — porque agregar una pantalla no debe terminar en rediseñar la app (R-08).
- Si el proyecto está vacío, N subagentes proponen una dirección cada uno como style tile: paleta, tipografía, elevación, botón, tarjeta y formulario, cada uno sobre su eje (§7.5), presentada según §13. **No hay ronda de afinado:** el usuario elige o combina — porque una ronda más no sostiene la promesa y suma costo (R-15, R-16). La dirección elegida se guarda como `design/approved/direction/` (§3.3) y sus tokens pasan a `DESIGN.md` como diff.

**1. Brief en texto.** Qué es, quién la usa, acción principal, inventario de contenido **real** que da el usuario y orden de lectura. El usuario lo confirma en su turno.

**2. N opciones, cada una un flujo navegable** de HTML estático: una pantalla por archivo, enlazadas con links relativos (§7.4–7.5). Se presentan según §13: en el lienzo "Design", una fila por opción, o como prototipo local.
- Cada uno lleva `<meta charset="utf-8">` y ningún recurso remoto — porque sin charset el UTF-8 se rompe al publicar (R11).
- `ui-check` corre sobre cada pantalla de cada opción, y las citas de reglas que el script contradice se retiran — porque citar reglas sin verificarlas es teatro (R-19).

**3. El usuario elige o combina en su turno** (`A`, `B`, `C`, "B con la cabecera de A"). Un comentario sobre un artboard sirve de insumo, pero la elección se confirma en un turno del chat y el hilo principal la registra desde ahí (A-11, A-20). Si combina, el hilo principal arma el flujo combinado, lo pasa por `ui-check` y lo muestra, local y en el lienzo si corresponde, antes de implementar. Lo elegido o combinado se guarda como aprobado en `design/approved/<flujo>/` (§3.3, A-19, A-20).

**4. Implementación** en el framework real, aplicando sin romper (§9), con **el aprobado como fuente de verdad**: el paso de aplicar recibe su ruta. Con el núcleo activo, según §14.

**5. Verificación.**
- El hilo principal corre `ui-check` y `browser.mjs` a los anchos del mockup.
- `compare.mjs` compara cada pantalla del **aprobado** con su implementación renderizada **solo en estructura** (orden de bloques, encabezados, columnas, posición de la acción primaria). Usa la misma huella que §7.5 y no compara tokens (A-18). Es **informativa**: las diferencias se informan y nunca bloquean — porque un antes/después no dice si se implementó lo que se eligió (R-19). **[spike]:** si en los fixtures da > 30 % de diferencias falsas, pasa a v1.1.
- Después corre el auditor (§10).

### 7.1 Contenido: marcadores, nunca inventos

- Lo que falta en el inventario va como **marcador visible** (`‹Cifra real›`), con `data-sample` y una franja "Datos de ejemplo" — porque un mockup sin contenido no se puede evaluar, y CONTENT-01 sin marcadores bloquearía todo (R-14).
- Nunca se inventan testimonios, logos, métricas, precios ni personas, tampoco dentro de un marcador.
- El agente escribe el **texto funcional** (etiquetas, verbos del brief, errores). **No escribe titulares ni propuestas de valor de marca:** van como marcador salvo que el usuario los dé. A pedido, ofrece 2 o 3 propuestas rotuladas como tales.
- Un marcador (`data-sample` o `‹…›`) que llega a la implementación es `bloquea`.

### 7.2 Estimación antes de cada ronda

Antes de lanzar una ronda se muestra una línea: "≈ N corridas de ~X k tokens" (A-15), con X tomado de §15 — porque el costo lo decide el autor, y no debe aprobarse a ciegas.

### 7.3 Presentación

Se muestra según §13.

### 7.4 Aislamiento real de `ui-option`

```yaml
# agents/ui-option.md (frontmatter)
name: ui-option
description: "Generates one static HTML option (mockup or style tile) along an assigned axis. No repo access."
tools: Write
model: sonnet
omitClaudeMd: true
```

- **`tools: Write` y nada más:** no puede leer el código y no hereda MCP — porque por defecto un subagente hereda MCP y los CLAUDE.md [V] (R-05).
- **`omitClaudeMd: true`** — porque el CLAUDE.md del proyecto hace converger las opciones.
  - **Costo declarado:** también se pierden las reglas de seguridad globales del usuario. Se compensa porque el agente solo escribe un archivo y el brief trae tres reglas: no inventar contenido; ningún dato personal ni credencial; escribir solo en la ruta dada.
  - **Residuo declarado [V]:** el snapshot de `git status` (nombres de archivos) llega igual a todo subagente y no se puede quitar. Se acepta porque son nombres, no contenido.
- **El brief va en el prompt,** sin rutas: brief confirmado, extracto de normas, tokens, eje asignado y, en `improve`, los hallazgos elegidos y un **resumen en texto de la captura "antes"** (orden de bloques, medidas de `browser.json`, hallazgos). El Agent tool solo recibe texto [V]; darle `Read` para ver el PNG rompería el aislamiento.
- **Salida:** escribe `option-<X>/<pantalla>.html`, un archivo por pantalla del flujo, enlazados con `<a href="<pantalla>.html">` relativos y sin scripts (A-20). Cada subagente escribe solo su carpeta, y solo el hilo principal junta las opciones y genera el lienzo (§13.1).
- **Verificación del hilo principal:** cada archivo existe, pesa más de 0 bytes, tiene charset, los links internos resuelven dentro de la carpeta, `ui-check` corre sobre él y `git status --porcelain` no cambió. Volver con 0 herramientas usadas o sin archivo es una **falla**, no un resultado — porque un subagente sin acceso puede inventar un resultado plausible (R3).
- **Modelo:** sonnet (A-15), pasado explícito en cada invocación. El modelo real se lee de `tool_response.resolvedModel` del Agent [V]. Si difiere (por ejemplo por `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, que el README menciona), el informe lo dice. **[spike]:** si sonnet no pasa forma y diversidad, pasa a opus solo para `ui-option`.
- **Respaldo 3 de §3.2:** se cambia **la misma** definición de `ui-option` a `tools: []` [V]; no se crea otro agente — porque un tercer nombre rompería la allowlist exacta de A-11. La regla de falla pasa a ser "respuesta sin un documento HTML completo".

### 7.5 Diversidad medible y camino secuencial

- **Un eje por subagente**, con el mismo `DESIGN.md` para todos — porque aislar no genera diversidad (R-04).
  - **Mockups:** A = densidad; B = estructura (otro orden o agrupación, otra navegación); C = énfasis (una pieza protagonista).
  - **Style tiles:** A = contención (neutros + un acento); B = calidez o editorial; C = contraste alto (color de marca dominante). En `product`, B y C quedan dentro de "contención con un acento" y varían tipografía y densidad (A-10).
- **`compare.mjs` mide la diferencia:**
  - **Mockups:** en un flujo, la huella se calcula sobre la pantalla principal. La huella es la secuencia de bloques de primer nivel, los encabezados, las columnas a 1440 px y la posición de la acción primaria. Dos mockups **coinciden** si la distancia de edición normalizada es < 0,3 **y** tienen las mismas columnas **y** la acción primaria en la misma posición. No se miden tokens, porque coincidirían por construcción.
  - **Style tiles:** coinciden si el ΔH del primario es < 30° en OKLCH **y** tienen la misma familia tipográfica **y** la misma escala de radios.
- **Tope:** si dos coinciden, se regenera una vez la de menor diferencia. Si vuelve a coincidir, se muestra con el aviso "B y C son muy parecidas".
- **Camino secuencial:** se usa cuando `optionsPerDecision = "1"`, no hay tool Agent, el modelo no delega, un hook lo niega o la versión de Claude Code es menor que la mínima. El hilo principal genera las opciones una tras otra, cada una con su eje. **La primera línea del informe** lo dice: "opciones generadas en secuencia en el hilo principal: no son independientes; se lanzaron 0 de 3 subagentes". El conteo sale de las llamadas a Agent que devolvieron resultado — porque fallar en silencio sería teatro (R2).

---

## 8. Flujo de mejorar pantalla (`/pignolo-ui:improve <URL o ruta>`)

1. **De la pantalla a una URL** (§11.2). Sin navegador, o si la URL no responde, el flujo sigue **degradado**: solo script sobre los archivos, sin menú desde el render ni antes/después visual, dicho en la primera línea (R-03).
2. **Inspección en lote.** El hilo principal corre `browser.mjs` (capturas, DOM, B1–B4, en todos los anchos y temas de §11.3) y `ui-check`. Después lanza el auditor sobre la carpeta del run (§10). Queda el "antes".
3. **Menú de síntomas en el chat:** lista numerada, en las palabras del usuario, pre-tildada con lo detectado y con los ids de cada síntoma. El usuario responde en su turno.
4. **N versiones mejoradas**, como flujos de HTML estático (§7.4–7.5), presentadas según §13.
5. **El usuario elige o combina.** Lo elegido se guarda como aprobado en `design/approved/<flujo>/` (§3.3), y se aplica según §9 tomándolo como fuente de verdad: primero tokens, después estructura, un cambio estructural por lote.
6. **Confirmación (≤ 1).** El hilo principal repite script, medidas y captura con los mismos anchos y temas. Arma el antes/después con:
   - hallazgos cerrados, cada uno citando el dato de la segunda lectura;
   - hallazgos nuevos: si son de piso, **bloquean**;
   - deuda sin tocar;
   - comparación estructural con el aprobado (solo informativa).

Si el problema está en `DESIGN.md`, primero se propone completarlo como diff. Cada versión (mockup, captura y diff) queda guardada en el run — porque la mejora no es monótona y a veces conviene volver atrás.

---

## 9. Aplicar sin romper (`new` paso 4 e `improve` paso 5)

0. **Entrada:** la carpeta del aprobado (§3.3), verificada con `approve.mjs verify`. Es la fuente de verdad del lote: el implementador trabaja sobre esos HTML, pantalla por pantalla, y no sobre un resumen.
1. **Antes de editar,** el agente declara la **lista de archivos esperados**. Por cada uno indica si ya existe o si va a crearlo, y si el cambio es de tokens o de estructura. **Tope por lote: 5 archivos y 200 líneas.** Si no alcanza, se parte en lotes y se avisa — porque un diff acotado es lo que atrapa roturas (R8).
2. Si algún archivo esperado tiene cambios sin commitear, se le pide al usuario que commitee primero. El agente no commitea por su cuenta. Con esa verificación hecha, se fija `<base>` (§5.3) y se toma el **estado inicial**: `git status --porcelain --untracked-files=all`.
3. `files.mjs save`: copia cada archivo esperado que ya existe (contenido + sha256). Los que se van a crear se registran como "no existía".
4. Se edita la fuente de tokens que ya existe (§4.5).
5. **Después de editar:**
   - Se toma de nuevo `git status --porcelain --untracked-files=all` y se compara el **delta** con el estado inicial. Todo archivo nuevo o modificado del delta tiene que estar en la lista esperada; si no, se revierte. Así se detectan los archivos nuevos sin seguimiento, y los cambios sucios previos en otros archivos no disparan nada.
   - Se relee cada archivo editado.
   - Corre el primer script que exista entre `typecheck`, `build` y `lint` de `package.json`. Si no hay ninguno: "no verificado: el proyecto no declara build".
6. **Revertir** (si falla el paso 5 o el usuario rechaza el antes/después):
   - `files.mjs restore` reescribe desde las copias, y `verify` comprueba que el sha256 coincida con el original.
   - Un archivo registrado como "no existía" se borra **solo** si su sha256 actual es el que escribió el lote. Si no coincide, `BLOCKED`: se le pregunta al usuario y no se borra nada.
   - Nunca se usa git destructivo — porque la guardia del núcleo lo niega y porque sin copia previa se pierde el original. Funciona igual con núcleo y sin él.

---

## 10. Auditor (`ui-auditor`) y `/pignolo-ui:audit`

```yaml
# agents/ui-auditor.md (frontmatter)
name: ui-auditor
description: "Audits one web screen from a prepared run folder against DESIGN.md, the rule catalog and written criteria; every finding cites evidence."
tools: Read, Grep, Glob
model: opus
```

- **Opus**, por la regla del repo para revisores y auditores. **Sin Bash, sin MCP y sin Agent:** es de solo lectura por construcción, no por instrucción. Los scripts y el navegador los corre el hilo principal (principio 8).
- **Entrada:** la ruta de la carpeta del run, con `ui-check.json`, `browser.json`, `dom-*.html`, capturas con su sha256 y `DESIGN.md`. Además lee los archivos de la pantalla en el repo y el aprobado vigente, si existe.
- **Fases fijas, todas de lectura:**
  1. **Preparación:** `DESIGN.md`, plataforma, registro, rechazos y tema oscuro.
  2. **Render:** capturas, dentro del presupuesto de §11.3.
  3. **Interacción:** resultados de B2. Hover, press y los estados vacío, cargando y error quedan en v1 como "no verificado" cuando no se llega a ellos desde la URL dada — porque no se pueden forzar de forma genérica (R-27). Declarar cómo forzarlos (`stateUrls`) queda para v1.1 (A-18).
  4. **Script:** `ui-check.json`.
  5. **Juicio con criterio escrito:** jerarquía de texto, orden de lectura, una acción primaria, heurísticas de Nielsen, decisiones explícitas y la guía de texto de las reglas sin checker.
- **Cada hallazgo lleva:** id, severidad (§5.3), alcance, evidencia (`archivo:línea`, captura + sha256 + medida, o una entrada de un JSON del run), antes/después/por qué, y una frase llana al frente.
- **Lo que el auditor dice sobre el "look" nunca aprueba solo:** se apoya en el script o en una captura — porque un evaluador tiende a quitarle gravedad a lo que encuentra.
- **No hay autocalificación 1–5 del implementador** — porque un autopuntaje usado como compuerta es "creer" e infla (R-22).
- Si no se puede lanzar como subagente (§7.5), corre en el hilo principal y el informe dice "auditoría no independiente".
- **`/pignolo-ui:audit`:** el hilo principal prepara el run (sin cambiar nada) y lanza el auditor. No bloquea: informa severidades y rotula la deuda.

---

## 11. Capa de navegador

### 11.1 Driver CDP por pipe (`scripts/browser.mjs`)

Transporte **`--remote-debugging-pipe`** (A-12): mensajes JSON separados por `\0` por los fd 3 y 4, sin WebSocket ni puerto. Un spike local (`local/pignolo-ui-2026-09-28/spikes/pipe-spike.mjs`) ya lo probó en Windows con Node 24, Edge y Chrome headless. **[spike]:** falta probarlo con Node 20. Lo corre solo el hilo principal.

- **Perfil temporal propio siempre** (`--user-data-dir` absoluto, `--headless=new`). Nunca se engancha al navegador del usuario ni trae ventanas al frente — porque el perfil del usuario no es accesible y robar el foco molesta.
- **Descubrimiento del navegador:**
  - Windows: Edge y Chrome en las carpetas de instalación estándar.
  - macOS: `/Applications`.
  - Linux: `google-chrome`, `chromium` y `microsoft-edge` en `PATH`.
  - `PIGNOLO_UI_BROWSER` fuerza la ruta (R-28).
- **Limpieza en `finally`:** se cierra el navegador; si no sale, se mata el árbol de procesos (sin shell) y se borra el perfil; teclas y botones se liberan.
- **Plazos:** si vence cualquiera, "no verificado" con el motivo, y limpieza. Una política corporativa que bloquea la depuración remota también da "no verificado".
- **Subcomandos:** `capture` (capturas), `measure` (B1–B4 a `browser.json`) y `dom` (DOM renderizado a `dom-<ancho>.html`, para las reglas `document`). Los argumentos de lanzamiento, los métodos CDP, los plazos exactos y el framing (con sus tests) se detallan en el plan.

### 11.2 URL, servidor, login y respaldo MCP

- **pignolo-ui no levanta el servidor de desarrollo** — porque es la parte más frágil y el usuario normalmente ya lo tiene corriendo (R-03).
- **URL base:** se pide la primera vez y se guarda en `project.json`. Antes de usarla, `fetch` con plazo de 5 s. Si no responde, se indica qué script de `package.json` parece el de desarrollo y se pide levantarlo; si el usuario no lo hace, el flujo sigue degradado.
- **Archivo en lugar de URL:** el agente propone la ruta según las convenciones del framework, el usuario la confirma una vez y queda guardada.
- **Login:** si la URL final difiere de la pedida o hay un `input[type=password]` visible, "no verificado (requiere sesión)" y flujo degradado. En v1 no se automatiza el login — porque manejar credenciales es un riesgo que la v1 no necesita.
- **Estados** vacío, cargando y error: si no se alcanzan desde la URL dada, "no verificado". Declarar cómo forzarlos (`stateUrls`) queda para v1.1 (A-18).
- **Respaldo con MCP de navegador:** solo desde el hilo principal — porque el núcleo prohíbe MCP a los subagentes. Cada paso se confirma leyendo su efecto: `location.href` y título después de navegar; hash distinto después de capturar. B1–B4 se hacen solo si el MCP permite evaluar JS, cambiar el tamaño y enviar Tab; lo que no permita queda "no verificado". Sin driver ni MCP, "no verificado" explícito (A-07).

### 11.3 Capturas dentro de los límites

- **Por viewport, nunca `fullPage` para juicio;** DPR 1 — porque las imágenes grandes se reducen hasta volverse ilegibles (R6).
- **Anchos por plataforma** (A-04):

  | Plataforma | Con captura | Solo medidos por script (sin imagen) |
  |---|---|---|
  | `desktop` | 1440×900 | 320 (reflow, porque 1.4.10 vale siempre) |
  | `mobile` | 375×812 | 320 |
  | `both` | 1440×900 y 375×812 | 768 y 320 |

- **Temas:** claro siempre; oscuro solo si está declarado o detectado (A-16) (R-31).
- Las páginas largas se capturan en hasta 3 recortes de viewport por ancho.
- **Presupuesto:** como mucho 8 imágenes al contexto por comando; el resto se cita por ruta y hash.
- **Validación:** firma PNG, lados ≤ 2000 px y sha256. Antes de capturar se espera `readyState`, `fonts.ready` y dos frames. Un error de imagen termina el paso tras 1 reintento, con "no verificado".
- Las capturas quedan solo en la carpeta del run; nunca van al repo ni se publican (A-14).

---

## 12. Evidencia, `report-check` y "terminado"

El principio 2 se aplica así:
- archivo editado → releído y presente en el delta;
- navegación → `location.href`;
- captura → PNG válido con su hash;
- script → su JSON citado por hash;
- subagente → su archivo, verificado según §7.4.

**`scripts/report-check.mjs`.** El informe final se escribe como `<run>/report.json` más texto. Cada afirmación lleva un id y una referencia: una entrada de `ui-check.json` o de `browser.json`, o una captura con su sha256. El script comprueba que la referencia **existe y dice lo afirmado** (mismo id, mismo estado y, si hay medida, el mismo valor). Si el run implementó algo (`new` o `improve`), `report.json` tiene que citar el aprobado (`implements: { path, manifestSha256 }`), y ese sha256 tiene que coincidir con el que registra `DESIGN.md`. Si falta la cita o no coincide, `report-check` sale con 1 (A-19). Las afirmaciones que no pasan se retiran antes de mostrar el informe — porque si el cruce lo hiciera un LLM sería otra afirmación sin verificar (PROC-02, R-18). Códigos de salida:

- `0`: no se retiró ninguna afirmación;
- `1`: se retiró al menos una. El informe se muestra depurado, con el conteo, y el flujo no puede decir "terminado";
- `2`: error. Cuenta como "sin verificar".

**"Terminado"** (en `new` e `improve`) exige tres cosas: `ui-check` = 0 en alcance, `report-check` = 0, y build en verde si existe.
- Si hay algún `bloquea` en alcance o fallan `report-check` o el build → `BLOCKED`, con la lista.
- Si `ui-check` o `report-check` salen con 2 → "sin verificar", con el motivo.
- Nunca "terminado" en esos casos. Los chequeos "no verificado" sueltos (por ejemplo, sin navegador o porque requiere sesión) no impiden "terminado", pero se listan como pendientes.

**Publicación en el lienzo:** el lienzo publicado **no se relee** para verificar, porque el tipo lo pide. Se verifica lo local: los `.dc.html` que genera `to-canvas` se registran con su sha256 en el run, y son exactamente los bytes que se publican. Es la única excepción al principio 2, y queda declarada. El resultado del tool (URL) se cita en el informe.

**Primera línea del informe:** versión del plugin, qué caminos se degradaron (sin navegador, lienzo no disponible, requiere sesión, secuencial, auditoría no independiente, versión de Claude Code) y cuántos subagentes se lanzaron de cuántos pedidos, con el modelo real de cada uno.

---

## 13. Presentación

- **Camino principal: lienzo "Design"** (A-20). Se usa en `new` y en `improve`, y también para la dirección del paso 0, si se cumplen las cuatro condiciones:
  1. `presentation` es `auto`;
  2. la herramienta Artifact existe en la sesión;
  3. el tipo "Design" está entre los tipos disponibles (se detecta al inicio);
  4. el autor dio su consentimiento **para este proyecto**. Se pregunta una sola vez y se guarda como `canvasConsent: true | false` en `project.json` — porque el autor pide confirmar las subidas a la nube.
- **Respaldo:** si falla cualquiera de las cuatro condiciones (por ejemplo, con API key), el mismo prototipo navegable se muestra como HTML local. `compare.html` pone las opciones en filas, cada pantalla enlazada, a los anchos de la plataforma. `run.mjs` lo abre e imprime la ruta, y el informe lo dice en una línea.
- **Disposición del lienzo:** una fila por opción, con una nota `title1` ("Opción A", "Opción B", "Opción C") y un artboard por pantalla del flujo, enlazados con `<a href="<pantalla>.dc.html">` y navegables en modo Play. Tamaños según la plataforma: celular 390×844 y escritorio 1440 de ancho (se acepta desde 1280). Con `both`, las dos filas de tamaños.
- **Qué se publica:** solo mockups y style tiles con marcadores `‹…›` y `data-sample`. **Nunca capturas, código del proyecto ni datos reales** — porque las capturas pueden llevar datos de desarrollo y un filtro de texto no mira píxeles (R-07).
- **Reglas que se heredan de núcleo §4.6:** el contenido es idéntico al local, se publica privado y la elección se confirma **en el chat**. Con el núcleo instalado, además se aplica su filtro de `pii-patterns` y secretos.
- **Lo que no se hereda:** el requisito de plantillas aprobadas (`templates/present/APPROVALS.md`) — porque regula las tarjetas del núcleo, y acá el mockup es el contenido a decidir. El generador y `compare.html` se prueban en `npm test`.

### 13.1 Generador del lienzo (`scripts/to-canvas.mjs`)

Sin dependencias y mecánico: no decide nada de diseño. Por cada pantalla de cada opción:

- toma el HTML local ya verificado;
- escribe un `.dc.html` con los tokens como variables CSS en `:root`, dentro de `<helmet><style>`;
- pasa los estados hover, press y focus a clases, en ese mismo `<style>`;
- agrega la línea exacta `<script src="./support.js"></script>`;
- usa como raíz un elemento de tamaño fijo igual al artboard;
- agrega el bloque `<script type="text/x-dc" data-dc-script>` con `class Component extends DCLogic`;
- marca con `is_interactive` los controles que funcionan;
- convierte los links entre pantallas en links entre `.dc.html`.

El estado vive en cada artboard: un flujo que comparte estado entre pasos va en un solo artboard. **No agrega scripts propios ni usa `innerHTML`.** La forma se verificó en una prueba real: un lienzo privado de 2 pantallas, que el autor aprobó después de navegarlo. Los detalles del formato los fija el plan, a partir de las instrucciones del tipo.

- **Menú de síntomas:** una lista numerada en el chat. El HTML solo la muestra — porque la respuesta va en la conversación (R-06).

---

## 14. Convivencia con el núcleo (A-11)

**Único cambio de contrato del núcleo.** El hook `PreToolUse` sobre `Agent` (núcleo §6 y §8.3) compara `tool_input.subagent_type` [V] por **igualdad exacta**. Hoy niega todo lo que no sea `pignolo:*`; con el cambio, niega todo lo que no sea `pignolo:*` **salvo `pignolo-ui:ui-option` y `pignolo-ui:ui-auditor`**. No hay ninguna otra regla nueva: los dos agentes no tienen Bash (principio 8), así que las restricciones de Bash por rol del núcleo no los alcanzan. Cada agente nuevo de pignolo-ui con el núcleo activo requiere otro cambio de contrato, que es decisión del autor. El cambio se aplica como tarea del spec y del plan del núcleo.

- **Riesgo residual declarado:** los agentes que no son de plugin no pueden llevar `:` en el nombre desde Claude Code 2.1.218 [V], y pignolo-ui exige ≥ 2.1.271 (§0). Por eso el único riesgo que queda es que otro plugin, de otro marketplace, también se llame `pignolo-ui`. **[spike]:** qué recibe el hook en ese caso, y si el Agent tool acepta el nombre corto `ui-option`. Las skills siempre despachan con el nombre completo; si el nombre corto se resolviera al del plugin, la allowlist exacta lo negaría, y eso es aceptable.

**Con el núcleo activo:**

| Tema | Qué pasa |
|---|---|
| Subagentes | Allowlist exacta. **Respaldo si falla el spike:** no hay allowlist y se usa siempre el camino secuencial (§7.5), declarado. |
| Carril | `visible-paths` marca el cambio de UI como reservado. Carril esperado: `daily` si el proyecto declara `visible-paths`; si no, `plan` (núcleo §4.2). pignolo-ui no lo elige. |
| Decisión humana | El hilo principal registra la elección en `.pignolo/state/decisions/` a partir del turno del usuario: cita literal, opciones presentadas (ruta + sha256), `autonomous: false`. **[spike]:** el registro tiene que poder comprobarse contra un mensaje del usuario (candidato: el prompt de `UserPromptSubmit` o los mensajes de usuario del transcript; el formato del transcript no es un contrato documentado). **Respaldo:** la elección no satisface el tripwire, el núcleo pregunta como con cualquier reservada y pignolo-ui sigue secuencial. |
| Quién implementa | El `implementer` del núcleo recibe como entrada de la task-card la ruta del aprobado (§3.3) y la lista de archivos esperados. El núcleo hace su parte de §9: worktree, test-writer si el carril lo exige, compuertas y sellos. El gate rechaza archivos fuera de la card. pignolo-ui conserva los topes de §6, el antes/después y `report-check` sobre el resultado. |
| Implementación en el respaldo secuencial | El hilo principal implementa aplicando §9 completo, y el núcleo hace la pregunta normal de su tripwire. |
| Revertir | Con `implementer`, se revierte por los mecanismos del núcleo (worktree descartable, instantáneas). En el hilo principal, con las copias de §9. Nunca con git destructivo. |
| MCP | Solo en el hilo principal (§11.2). |
| `~/.pignolo/**` | pignolo-ui no escribe ahí nunca. |
| "Bloquea" | Con confirmación del humano, `ui-check --gate` entra a las compuertas de `project.md`. |

**Test de convivencia** (§16.4): con el núcleo instalado, `/pignolo-ui:new` termina y el informe dice si fue por subagentes o por el camino secuencial. Un nombre parecido (`ui-option` sin prefijo, `pignolo-ui-x:ui-option`) queda negado.

---

## 15. Costo (supuestos hasta el spike)

Las cifras son **supuestos** del borrador y se reemplazan por la medición del spike. Se expresan en tokens, porque es la medida comparable con o sin suscripción.

| Corrida | Entrada | Salida |
|---|---|---|
| Mockup (`ui-option`) | ~30 k | ~15 k |
| Style tile | ~25 k | ~10 k |
| Auditor (opus, ~85 % en caché, 2–4 imágenes) | ~480 k acumulados | ~10 k |

**Corridas de subagente por flujo, con 3 opciones:**

| Flujo | Corridas |
|---|---|
| `new` en proyecto vacío | 7 (+ hasta 2 regeneraciones) |
| `new` con `DESIGN.md` | 4 |
| `improve` | 4 |
| `audit` | 1 |

Con 1 opción: `new` 2–3, `improve` 2. El hilo principal se suma aparte. Los scripts y el SEO no consumen tokens del modelo.

---

## 16. Pruebas

Se separan por dónde corre cada una — porque las evals de agentes con shell necesitan WSL2 y ahí no está el navegador de Windows (núcleo §15). **Todos los fixtures y evals son sintéticos.**

### 16.1 `npm test` (`node:test`, Windows nativo y cualquier SO, sin red)

- **Regla general:** cada regla, script y respaldo tiene fixture en rojo y en verde, con el rojo demostrado rompiendo lo que protege.
- **Además**, se piden explícitamente estos tests, que no salen de la regla general:
  - **Nivel de documento (C-01):** un componente `.tsx` nuevo da 0 `bloquea` por A11Y-01/02/05; el mismo HTML con `<html>` sí se evalúa.
  - **Alcance:** deuda preexistente + un defecto nuevo → solo bloquea el nuevo. Una línea movida sigue siendo deuda. Un par duplicado cuenta como multiconjunto. Lo que commitea el usuario antes de fijar `<base>` no cuenta como nuevo. Salidas 0/1/2.
  - **Delta de §9:** árbol sucio con cambios ajenos a la lista → no se revierte. Archivo nuevo inesperado → se revierte. Archivo creado y después modificado a mano → `BLOCKED`, no se borra.
  - **JSX no resoluble** → `unverified`. **Comentarios** en cada sintaxis → 0 hallazgos. **Extensión no soportada** → `unverified`.
  - **Parser:** lo no soportado → "no validado"; la escritura por inserción conserva comentarios byte a byte.
  - **Validador:** esquema cerrado; `intentional` sobre piso o sobre THEME-03 → rechaza; hex en `pignolo:` → rechaza; oscuro detectado sin `themes.dark` → `alto`.
  - **`report-check`:** una afirmación sin evidencia y otra con evidencia contradictoria → las dos se retiran y sale con 1. Una implementación que no cita el aprobado, o que lo cita con otro sha256 → sale con 1.
  - **Aprobados:** `approve.mjs` no sobrescribe: crea `<flujo>-v2/`. Un archivo editado, agregado o quitado a mano → `verify` da `BLOCKED`. `ui-check` sobre `design/approved/**` con marcadores → `detalle`, nunca `bloquea`.
  - **`extract`:** si hay configuración (Tailwind v4, v3 literal, `:root`, shadcn), la lee y no cuenta frecuencias. Sin configuración → cuenta frecuencias y completa `pignolo.extracted`.
  - **Aprobado ↔ implementación:** fixtures iguales y distintos en estructura; un cambio que solo toca tokens no cuenta como diferencia; la comparación nunca cambia el código de salida.
  - **Framing del pipe:** mensaje partido en dos lecturas, varios mensajes en una lectura, UTF-8 partido, error de CDP.
  - **Linter del plugin (R9)** y **catálogo (R14)**.
  - **Carpeta del run:** una auditoría deja `git status` limpio; la poda solo borra lo de más de 14 días y solo dentro de su carpeta.
  - **Presentación:** con `local`, sin consentimiento en el proyecto o sin el tipo "Design", nunca se invoca Artifact y se genera el prototipo local.
  - **Generador del lienzo:** fixtures de entrada HTML → `.dc.html` esperado, byte a byte. Cubren tokens en `:root` dentro de `<helmet><style>`, estados por clases, la línea exacta de `support.js`, la raíz de tamaño fijo, el bloque `data-dc-script`, `is_interactive` y los links entre artboards. Además verifican que no se agregan otros scripts ni `innerHTML`, y que una entrada con script o con recurso remoto se rechaza.
  - **Flujos:** un link interno roto en una opción → falla de la opción.
  - Toda la suite corre **sin red**.
  - **Tests de navegador** (páginas fixture servidas en 127.0.0.1): **sin navegador → "skip: sin navegador", visible, nunca verde.**

### 16.2 Spike (una vez, en la máquina del autor, Windows, antes del plan)

Lo que se publique del spike sale sin datos de proyectos privados: solo cifras agregadas.

| Qué se prueba | Si pasa | Si falla |
|---|---|---|
| **Nombre del agente en el hook** (A-11): (a) otro plugin llamado `pignolo-ui` desde otro marketplace; (b) versión mínima 2.1.271 comprobada; (c) nombre corto `ui-option` en el Agent tool | Allowlist exacta sobre `tool_input.subagent_type` | Sin allowlist; camino secuencial con el núcleo activo, declarado |
| **Registro de la elección desde un canal humano** (A-11) | La elección cuenta para `visible-paths` | Pregunta normal del núcleo; camino secuencial |
| **Pipe en Node 20 real** con Chrome y Edge, **con Edge ya abierto** con el perfil por defecto; también Node 24; limpieza | Transporte fijo (A-12) | Si falla solo en Node 20: la capa de navegador dice "no verificado: Node 20" y la pregunta del piso vuelve al autor |
| **Aislamiento de `ui-option`** con un archivo trampa | Ninguna opción contiene la frase y no hay lecturas | Bug de aislamiento: no hay release hasta corregirlo |
| **`Write`/`Read` de subagentes fuera del proyecto** (los permisos se piden en la sesión principal [V]) | Carpeta del run en tmp | Respaldos 2 o 3 de §3.2 |
| **Sonnet vs opus en `ui-option`**, ≥ 5 corridas, con `resolvedModel` leído del transcript | Sonnet (A-15) | Opus solo para `ui-option` (A-15) |
| **axe inyectado por CDP vs reglas propias**, en apps reales (A-13) | Solo lo propio | Propuesta al autor de axe fijado en v1.1 |
| **Comparación aprobado ↔ implementación** con fixtures (A-18) | Queda en v1, informativa | Con > 30 % de diferencias falsas pasa a v1.1 |
| **Tokens medidos por flujo** | Reemplazan §15 y la línea de §7.2 | — |

### 16.3 Evals de agentes (`claude plugin eval`, WSL2)

- **Auditor, sobre entradas congeladas:** carpeta del run completa (capturas, DOM, JSON) sin navegador. Encaja con el principio 8: el auditor solo lee. Recall ≥ 80 % sobre defectos sembrados; ≤ 20 % de páginas limpias con algún falso positivo; ≥ 5 corridas por caso. Como el juicio nunca llega a `bloquea`, ese 20 % no bloquea pantallas limpias (R-11).
- **`ui-option`: solo chequeos de forma:**
  - sin errores de piso;
  - ids válidos;
  - solo tokens de `DESIGN.md`;
  - `data-sample` en todo lo no provisto;
  - diferencia sobre el umbral de §7.5.
- **Ablación:** mismo brief con y sin plugin, ≥ 5 corridas, medida con chequeos deterministas. Se informa.

### 16.4 Checklist manual (Windows nativo, sesión real)

- `new`, `improve` y `audit` de punta a punta.
- En Opus 5 y en otro modelo: cuántos subagentes se lanzaron y con qué modelo (R2).
- Camino secuencial forzado.
- Con y sin la herramienta Artifact o el tipo "Design", con y sin consentimiento: se pide una sola vez por proyecto y, sin él, el prototipo sale local con su aviso.
- **Lienzo:** navegar las opciones en modo Play (los links entre artboards y los controles `is_interactive` funcionan); comentar un artboard para elegir o combinar, y confirmar que la elección se registra desde el turno del chat.
- **Con el núcleo instalado:** convivencia y nombre parecido negado.
- Pantalla detrás de login → "no verificado (requiere sesión)".
- Sin navegador ni MCP → degradado en la primera línea.
- Claude Code por debajo de la versión mínima → aviso y camino secuencial.
- Instalación y actualización real: cambia la versión impresa (R15).
- `node` con permiso negado → mensaje claro.
- **Prueba con lector de pantalla (A11Y-40):** "recomendado antes de publicar". Se informa y **nunca es compuerta** — porque la hace una persona (R-11).

---

## 17. Construcción (hitos internos)

El spike (§16.2) va antes del plan, porque decide los puntos marcados [spike]. Cada hito se cierra con sus tests en verde.

1. **Esqueleto y formato:** linter del plugin, `yaml-subset`, `color`, `token-sources`, `design-md` (`validate`, `extract`, `patch`), `approve` y la plantilla 0/0.
2. **Checker:** `rules.json` con `level` y `acceptsIntentional`, `route`, `strip-comments`, `ui-check` (25 reglas, alcance, SEO), `files` y `report-check`.
3. **Navegador:** `browser.mjs` por pipe (`capture`, `measure`, `dom`), B1–B4, capturas validadas y limpieza.
4. **Flujos:** `ui-option`, `ui-auditor`, las tres skills, `compare`, `run`, `to-canvas`, presentación, síntomas y evals.
5. **Convivencia:** el cambio del núcleo (solo la allowlist, según el spike) va como tarea del plan del núcleo. Después, el test de convivencia y el checklist.

---

## 18. Fuera de alcance de la v1

- **Candidatos a v1.1:**
  - axe-core fijado, si el spike lo justifica (decisión del autor, A-13);
  - más SEO: hreflang, datos estructurados, sitemap completo, Core Web Vitals;
  - objetivo de 24 px con checker (NAV-01, 2.5.8);
  - `stateUrls`, para forzar los estados vacío, cargando y error (A-18);
  - la comparación aprobado ↔ implementación, si el spike la descarta (A-18);
  - migración a temas `{light, dark}` y a `shadows` si el formato oficial los incorpora (hoy son PRs abiertos): leer las dos formas y escribir la oficial;
  - más reglas con checker, a medida que tengan fixture;
  - generar un artifact tipo "Design System" desde `DESIGN.md`: tokens por tema, tipografía y componentes con vista previa (A-20).
- **Fuera de la v1:**
  - GEO, con los permisos de crawlers de IA y `llms.txt`, y CRO;
  - ronda de afinado y autocrítica 1–5;
  - activación automática y comando `norms`;
  - levantar el servidor y login automatizado;
  - Tailwind v3 más allá de reemplazar un valor; CSS-in-JS, MUI y Chakra; `.vue`, `.svelte` y `.astro`;
  - guiones APG, LCP/INP y paridad móvil de SEO;
  - unas 125 reglas que quedan como guía del auditor;
  - plataformas no web.

---

## 19. Fuentes

Investigación local, pendiente de revisión para publicar (`local/`, fuera de git):

- `research-ui-2026-09-28/INFORME.md`: catálogo visual, tokens y `DESIGN.md`.
- `research-ui-2026-09-28/INFORME-a11y-seo-geo.md`: A11Y, SEO, GEO y CRO.
- `research-ui-2026-09-28/INFORME-sintomas-y-skills.md`: síntomas y skills relevadas.
- `pignolo-ui-2026-09-28/REFUTACION.md`: R-01…R-31.
- `pignolo-ui-2026-09-28/INFORME-bugs-y-lecciones.md`: R1…R17, con las issues y los casos de terceros que motivan los "— porque".
- `pignolo-ui-2026-09-28/BORRADOR-diseno-v2.md`: diseño aprobado, con la tabla de trazabilidad.
- `pignolo-ui-2026-09-28/REVISION-SPEC.md`: revisión independiente de este spec.
- `pignolo-ui-2026-09-28/spikes/pipe-spike.mjs`: prueba del transporte por pipe.
- `debate-ui-2026-09-28/SINTESIS.md` y `SINTESIS-ronda2.md`: debates de A-05…A-16.

Documentación oficial de Claude Code (sub-agents, hooks, plugins-reference, skills, errors), consultada el 2026-09-28, para los puntos marcados [V].

---

## Anexo. Hallazgos de la revisión independiente y cómo quedaron

| id | Cómo quedó |
|---|---|
| C-01 | `level: document \| element \| style` (§5.1–5.2); las reglas de documento se evalúan solo sobre el DOM del navegador o sobre archivos con `<html>`, si no `unverified (not a document)`; fixture en §16.1 |
| M-01 | El hook compara `tool_input.subagent_type`; nombre completo siempre; Claude Code ≥ 2.1.271; se reescribió la fila del spike; riesgo residual: otro plugin `pignolo-ui` (§14, §16.2) |
| M-02 | El hilo principal corre el navegador y los scripts; `ui-auditor` = Read, Grep, Glob (principio 8, §8, §10) |
| M-03 | Desaparece: la única excepción de contrato es la de A-11 (§14) |
| M-04 | Resumen en texto de la captura, sin imagen ni `Read` (§7.4) |
| M-05 | Delta de `git status --porcelain --untracked-files=all` contra el estado inicial (§9); fixtures (§16.1) |
| M-06 | "No existía" registrado; se borra solo si el sha256 coincide con lo escrito; si no, `BLOCKED` (§9) |
| M-07 | `report-check` con salidas 0/1/2 (§12) |
| M-08 | CONTENT-01 bloquea solo por marcadores; las heurísticas son `medio` (§5.4) |
| M-09 | Alcance = archivos nuevos + delta en los tocados, en los dos flujos; `<base>` después del paso 2 de §9; multiconjunto; ruta de referencia en `new` (§5.3) |
| M-10 | Esquema `pignolo:` cerrado, forma de `pattern`, `symptoms` solo en `norms.md` (§4.3, §3.2) |
| M-11 | Tabla "con el núcleo activo": carril, reparto de §9, implementación en el respaldo, revert (§14) |
| m-01 | Tipos de `userConfig` con `options`; valores pasados por argumento (§3.1, §2) |
| m-02 | `${CLAUDE_PLUGIN_DATA}` [V], se pasa por argumento; se quitó el respaldo `~/.pignolo-ui/`; aviso de desinstalación (§3.2) |
| m-03 | Residuo de `git status` [V]; versión mínima declarada y comprobada (§0, §7.4) |
| m-04 | Misma definición con `tools: []` (§7.4) |
| m-05 | `model` explícito, `resolvedModel`, variable FORCE en el README (§2, §7.4, §16.2) |
| m-06 | "Puede no estar disponible" (§13) |
| m-07 | No se hereda el requisito de plantillas aprobadas, con su motivo (§13) |
| m-08 | 7 ids de SEO, dicho en el texto (§5.4) |
| m-09 | "Decide los puntos marcados [spike]" (§17) |
| m-10 | `acceptsIntentional` por regla; THEME-03 no lo acepta (§5.1, §5.4) |
| m-11 | Pares medidos definidos (§4.5) |
| m-12 | JSX no resoluble → `unverified`, con fixture (§5.4, §16.1) |
| m-13 | Criterio: plantilla y fixtures de `extract`; linter instalado a mano en desarrollo (§0.1, §4.2) |
| m-14 | FP medido por página limpia (§0.1, §16.3) |
| m-15 | Anchos por plataforma; 320 siempre medido (§11.3) |
| m-16 | Chequeos posibles con MCP (§11.2) |
| m-17 | El validador "rechaza" (§5.4) |
| m-18 | Se sacó el bloque `a11y` (§4.3) |
| m-19 | Sin números de issue, anécdotas ni precios en dólares; los ids R remiten a §19 (Convenciones) |
| S-01…S-14 | Aplicados, salvo que la migración de formato pasó a §18 en lugar de eliminarse |
| S-15, S-16, S-17 | Los decidió el autor (A-18): `stateUrls` pasa a v1.1; `extract` lee primero la configuración y solo como último recurso cuenta frecuencias, marcadas en `extracted`; la comparación estructural queda informativa, contra el aprobado y sujeta al spike (§3.3, §4.5, §7, §16) |
