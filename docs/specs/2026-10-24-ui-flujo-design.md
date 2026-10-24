# Flujo de primera versión para pantallas de app (`ui-flujo`): diseño

_Borrador para el debate, 2026-10-24. Rama `ui-flujo`. Cada afirmación lleva **[dato]** (comprobable en el repo o en la fuente citada), **[opinión]** o **[supuesto]** (no comprobado; se mide en las pruebas por partes). Lo escribió el agente arquitecto (defensor); el atacante lo revisa a continuación._

## 1. Problema y tesis

El agente genera pantallas que funcionan pero están sobrecargadas. No tienen jerarquía de acciones ni de texto, y los paneles no tienen propósito. Les faltan hover y foco y usan los selectores nativos del navegador. Mejoran al pedir "revisalo como Apple" o al investigar un elemento puntual (palabras del autor).

Tesis [opinión]: los síntomas salen de dos huecos. Nadie decide para qué es la pantalla antes de dibujarla, y nadie compara el resultado contra criterios fijos. La investigación respalda la crítica con rúbrica específica (+17 puntos frente a una genérica) y las pocas pasadas con ancla, porque iterar sin ancla puede empeorar [dato: arxiv 2508.19227; 2602.05998, credibilidad baja]. Ninguna skill popular trae fichas numéricas por elemento [dato: `docs/research/2026-10-24-ui-ux-con-agentes.md`]. Que las fichas ayuden es [supuesto]: no hay estudio que lo aísle.

## 2. Dónde vive cada paso (a)

Seis pasos, cada uno con su referencia en `plugins/pignolo/skills/ui/references/` y **una línea** en `ui/SKILL.md`. La crítica se separa del chequeo para poder sacar cada uno por separado en las pruebas.

| Paso | Archivo | Qué hace |
|---|---|---|
| Brief | `references/brief.md` | ficha de pantalla antes de dibujar |
| Patterns | `references/patterns.md` + `references/patterns/<slug>.md` (14 fichas semilla) | ficha por pieza: busca, si no hay investiga y guarda |
| Wireframe | `references/wireframe.md` | estructura en grises, después estilo |
| States | `references/states.md` | matriz de estados con `data-state` |
| Check | `references/check.md` + `ui-audit/scripts/light-check.mjs` | chequeo determinista, sin modelo |
| Critique | `references/critique.md` | rúbrica fija, 1 o 2 pasadas |

Regla para las pruebas por partes: ninguna referencia nombra la ruta de otra. El script de brazos borra la línea de `SKILL.md` que contiene `references/<paso>.md`, que aparece en exactamente una línea [opinión: un test lo verifica, tarea 9]. Si una referencia usa el resultado de otra (la crítica usa la acción principal del brief), lo dice como condicional: "si hay brief".

Sección nueva de `ui/SKILL.md` (texto exacto; las secciones actuales 4 a 6 pasan a ser 5 a 7):

```
## 4. Screens: the first-version flow

A first version gets overloaded when nothing decided what the screen is for before drawing it, and gets no better when nothing checks it against fixed criteria. Run only the steps the change needs (table below); each step's detail is in its reference, loaded when the step runs. A step missing from this list is skipped, also where the table names it.

- **Brief**: before drawing a new screen, write its brief (`references/brief.md`).
- **Patterns**: before building a piece, read its pattern sheet, or research and save one (`references/patterns.md`).
- **Wireframe**: build a new screen in grayscale first, then apply the identity (`references/wireframe.md`).
- **States**: every catalog component shows its full state matrix (`references/states.md`).
- **Check**: after generating, run the light check and fix what it finds (`references/check.md`).
- **Critique**: then review against the fixed rubric, at most two passes (`references/critique.md`).

| Change | Steps |
|---|---|
| Text, color or spacing tweak on something that exists | Check, on the changed files only |
| New component, or a new piece inside an existing screen | Patterns, States, Check; Critique once if the piece is navigation, a modal or a data table |
| New screen, or a redesign of one | all; a second Critique pass only if the first had a "no" |
| New product (identity and first screens) | identity phase (section 2), then all, per screen |
```

Más una línea en "Values", copiada de `ui-audit/SKILL.md`: `<root>` = `${CLAUDE_PLUGIN_ROOT}` [dato: así lo resuelve hoy `ui-audit`].

`ui/SKILL.md` pasa de ~700 palabras a ~950, por encima de la meta de ~600 [dato: spec 2026-10-23 §3.4; el conteo actual es una estimación]. Es el costo de que la tabla esté siempre a la vista.

## 3. Reglas de proporcionalidad (b)

Las fija la tabla de arriba: se decide por **novedad estructural**, no por líneas [opinión, como `work`]:

- **Retoque** (texto, color, espaciado, una prop de algo existente): solo Check sobre los archivos tocados. Es barato y atrapa el caso común de un color que rompe el contraste (COLOR-03).
- **Componente nuevo o pieza nueva**: ficha, matriz de estados y chequeo. Crítica solo para piezas grandes (las mismas que hoy tienen opciones: nav, modal, tabla [dato: `ui/SKILL.md` §4]).
- **Pantalla nueva o rediseño**: todo, con una pasada de crítica; la segunda solo si la primera tuvo algún "no". Nunca hay tercera.
- **Producto nuevo**: fase de identidad y después todo por pantalla. Las fichas que falten se investigan en paralelo, un agente por patrón.
- Un bug de comportamiento en la UI no entra en el flujo: es `work` chico.
- Las opciones (tres HTML) siguen como hoy. Si hay opciones de pantalla, brief, fichas y wireframe van **antes** y se citan en el encargo de cada `ui-option`, que no puede leer el repo [dato: `agents/ui-option.md`, `tools: Write`].

## 4. Paso de `work` a `ui` (c)

Una línea en `work/SKILL.md`, debajo de "Missing documents":

```
If the change creates or redesigns a screen, panel, navigation or interface component, follow section 4 of `/pignolo:ui` for that part: it sizes its own steps. For a text or color tweak, run only its light check.
```

Costo para tareas sin UI: esa línea, ~50 tokens [supuesto]. `ui/SKILL.md` se carga solo si la tarea toca interfaz. El nivel de `work` (chico, feature, grande) sigue igual. Cuando hay tarjeta y brief, la tarjeta cita la ruta del brief en "Criterio de hecho" y no lo repite [opinión]. Riesgo: la activación de skills por frase no está garantizada (2, 1 y 2 de 10 [dato: spec §7]). Esta línea es la defensa principal y se mide (§9, F1).

## 5. Formatos (d)

Texto interno en inglés, porque lo lee el agente.

**Brief** (`design/screens/<slug>/brief.md`, ≤ 15 líneas):

```
# <Screen> brief
- User: <who, in what situation, how often>
- Job: <the one thing they come to do, verb + object>
- Primary action: <one label, verb + object>
- Key data (max 3): 1. … 2. … 3. …
- Secondary actions (max 2): …
- Left out on purpose: <what is not here, and where it lives instead>
- Regions: <in reading order, each with its one dominant element>
- Pieces: <pattern sheet slugs>
```

Regla, con su razón: si dos acciones compiten por ser la principal, o hay más de 3 datos clave y ninguno pasa a "Left out", son dos pantallas. Se le dice al autor en una línea y se sigue con la primera. La razón es que la sobrecarga empieza cuando una pantalla tiene que servir a dos trabajos [opinión, práctica de "trabajo a resolver": dato de práctica en la investigación, credibilidad media].

**Ficha de patrón** (`design/patterns/<slug>.md`):

```
---
pattern: card-actions
version: 1
date: 2026-10-24
origin: plugin seed | research | adapted from plugin seed
---
# Card with actions
## Use when / not when
## Anatomy        ordered parts, each required or optional
## Content limits title 1 line, max N characters, ellipsis; body max 2 lines; metadata max 3 items
## Actions        primary 0-1; secondary max 2, quieter style; destructive apart (overflow or separated), never primary style, confirms
## Measures       in token roles: padding {spacing.6}; title {typography.title}; meta {typography.body-sm}; target >= {pignolo.targets.minPx}; px ranges only where a source gives them
## States         rest, hover, active, focus-visible, disabled, loading, plus empty/error if it shows data
## Keyboard       keys and roles (WAI-ARIA APG pattern when one exists)
## Avoid          short list
## Sources        | claim | source | credibility (alta/media/baja + criterion) | date |
```

Las 14 fichas semilla (slugs): `card-actions`, `data-table`, `form`, `section-header`, `sidebar-nav`, `filter-bar`, `list`, `modal-confirm`, `empty-loading-error`, `dropdown`, `date-picker` (día y mes), `kpi-card`, `toast`, `button-states`. Se buscan en este orden: `design/patterns/` del proyecto, después las semillas del plugin. Una semilla se lee en el plugin y se copia al proyecto solo si se adapta. Si no hay ficha, se lanza el agente nuevo `ui-pattern` (sonnet/medium, herramientas `WebSearch` y `WebFetch`, sin acceso al repo). Recibe **una** pregunta abstracta, sin datos del proyecto ("anatomy, content limits, actions, measures and states of a <pattern> in a <product|brand> application UI"). Prefiere sistemas de diseño primarios (HIG, Material 3, Fluent 2, Polaris, Carbon, GOV.UK, WAI-ARIA APG, NN/g), devuelve la ficha y el hilo principal la guarda. Las medidas van en roles de token para que la ficha sirva con cualquier identidad [opinión].

**Matriz de estados** (en cada `design/components/<el>.html`): `<body data-kind="control|data|feedback">`. Cada estado es una muestra con `data-state="<estado>"`. Estados exigidos:

- `control`: rest, hover, active, focus-visible, disabled; además loading (botones), open (dropdown, picker) y error (campos).
- `data`: rest, loading, empty, error; además hover si las filas se pueden tocar.
- `feedback`: una muestra por variante.

Así la matriz se puede chequear con un script (STATE-06) en vez de quedar en promesa [opinión].

**Rúbrica de crítica** (fija; sí/no; cada ítem ligado a un síntoma del autor):

| # | Item (inglés, va a la skill) | Síntoma |
|---|---|---|
| 1 | Each panel and region states what it is for (a header or label), and it matches the brief if there is one | paneles sin propósito |
| 2 | Exactly one primary-styled action per view, and it is the most prominent element | sin jerarquía de acciones |
| 3 | Per group: max two secondary actions, visibly quieter; destructive actions apart and never primary style | sin jerarquía de acciones |
| 4 | With the detail blurred, title, section, body and caption read in that order; max 4 text roles per region | sin jerarquía de texto |
| 5 | Nothing on screen is outside the job and the key data (the brief's, if there is one) without a reason | sobrecarga |
| 6 | Each region has one dominant element | sobrecarga |
| 7 | Whitespace separates regions and proximity groups related items, at the identity's density | sobrecarga, identidad Apple |
| 8 | Every interactive element has hover and focus-visible styles that are visible | sin hover ni foco |
| 9 | No native select, date or month input: the catalog dropdown or picker is used, with its keyboard behavior | selectores nativos |
| 10 | Every data area has empty, loading and error states | estados ausentes (práctica previa a la IA) |

La salida va en la respuesta, no en un archivo: `Critique pass 1: 8 yes, 2 no`, y por cada "no" una línea con el elemento y el arreglo. Regla anti-degradación: **solo se tocan los "no"; lo que pasó no se "mejora"** [opinión con base: dato de VisRefiner, credibilidad baja]. Si hay herramienta de navegador, la crítica mira una captura (`capturePage` ya existe [dato: `ui-audit/lib/browser-run.mjs`]). Si no hay, mira el código y lo dice.

**Salida del chequeo** (stdout, una línea por hallazgo; el JSON completo queda en `.pignolo-ui/<run>/ui-check.json` con el formato actual de `ui-check` [dato]):

```
pignolo light-check: 3 fallas, 1 no verificado (6 archivos, estático)
medio  NATIVE-01  app/gastos/page.tsx:42  <input type="date">: usar el date-picker del catálogo
medio  ACTION-01  app/gastos/page.tsx  2 botones primarios (líneas 18, 51)
bloquea COLOR-03  globals.css:12  on-surface-muted sobre surface 3.9:1 (pide 4.5:1)
no verificado STATE-05  components/Row.tsx: clases dinámicas
```

Nada bloquea: el código de salida no detiene el flujo. "No verificado" nunca se informa como "pasó" (misma regla que `ui-audit` [dato]).

## 6. Chequeo liviano frente a `/pignolo:ui-audit` (e)

- **Código compartido** [dato: ya existe]: `lib/ui-check.mjs` `runCheck` acepta `inject.rules`, y el chequeo liviano lo llama con una lista de reglas reducida. Además: `lib/run-init.mjs` (`initRun`), `run-folder.mjs` (`.pignolo-ui/` con su `.gitignore`), `design-doc.mjs` (tokens) y los módulos de reglas.
- **Reglas que se reusan** [dato: `catalog/rules.json`]: STATE-04 (foco), COLOR-02/03/04, LAYOUT-04, DEPTH-01, A11Y-04, A11Y-16.
- **Reglas nuevas** (formato `^[A-Z0-9]+-\d{2}$` [dato: `catalog.mjs`], cada una con fixtures porque el banco de pruebas las exige [dato: `tests/rules-fixtures.test.mjs:121`]):
  - `NATIVE-01`: `<select>`, `<datalist>` o `input` de tipo date, month, week, time, datetime-local o color en el markup. Severidad medio; acepta "intencional".
  - `STATE-05`: elemento interactivo cuyas clases o selector no tienen regla `:hover` ni utilidad `hover:`. Los componentes importados (`<Button>`) se chequean en su propio archivo; las clases dinámicas quedan como no verificadas. Heurística declarada.
  - `STATE-06`: archivo de `design/components/` al que le faltan los `data-state` exigidos por su `data-kind`.
  - `ACTION-01`: más de un botón primario por archivo de vista. Cuenta como primario: clase `primary` o `bg-primary`, o `<Button>` sin `variant` (el default de shadcn). Heurística.
  - `TYPE-01`: más de 5 tamaños de letra distintos en una vista.
  - `TYPE-02`: `font-size` literal fuera de los tokens de `typography`.
  - `TARGET-01`: token `height` de un componente por debajo de `pignolo.targets.minPx` (checker `design-md`).
- **Qué no hace el chequeo liviano**: navegador, agente auditor, reporte ni validación previa de `design.md`. El objetivo es que tarde segundos [supuesto] y se pueda correr en cada retoque.
- **`ui-audit`** sigue igual en pasos y solo a pedido. Si las reglas nuevas entran al catálogo compartido, `ui-audit` también las corre y cambia el conteo de la tabla del README. Eso toca la decisión del autor de mantener el catálogo "como está" (§8): pregunta abierta Q1.

## 7. Archivos que el flujo deja en el proyecto (f)

```
design/
  index.html                     navegador, sin cambios de plantilla
  screens/<slug>/brief.md
  screens/<slug>/wireframe.html  grises, abre con doble clic
  patterns/<slug>.md             solo las investigadas o adaptadas
  components/<el>.html           ahora con data-kind y data-state
.pignolo-ui/<run>/ui-check.json  ignorado por git
```

El navegador sigue funcionando sin tocar la plantilla. Cada pantalla se registra como pieza `{ "name": "Pantalla: <nombre>", "status": "pendiente", "options": ["screens/<slug>/wireframe.html"] }`, porque `options` acepta cualquier ruta `.html` relativa a `design/` [dato: comentario de `templates/index.html`, línea 110]. Las fichas `.md` no van al índice: son material para el agente [opinión].

## 8. Costo (g)

Todas las cifras son estimaciones [supuesto] y se miden en las pruebas por partes.

| Paso | Tokens | Tiempo |
|---|---|---|
| `ui/SKILL.md` cargada | ~1,3 k | — |
| Brief | ~1 k (referencia + 300-500 de salida) | < 1 min |
| Fichas, semilla encontrada | ~1 k por ficha; 4-6 por pantalla = 5-7 k | segundos |
| Ficha que falta (investigación) | 25-60 k en sonnet, una vez por proyecto y patrón | 2-5 min, en paralelo |
| Wireframe | 3-6 k de salida | 1-2 min |
| Matriz por componente nuevo | +1-3 k | < 1 min |
| Chequeo | 0,5-1,5 k | segundos |
| Crítica, por pasada | 3-6 k de lectura + 2-8 k de arreglos (+~1,5 k con captura) | 1-3 min |

Extra por pantalla nueva, con las semillas encontradas: **~15-30 k tokens y 5-10 min**. Para un retoque: ~1-2 k. Con `ui-option` el contexto citado se paga 3 veces.

La regla que lo hace proporcionado: **el costo sigue a la novedad estructural**. Lo que reutiliza pantallas y componentes sin agregar una región salta brief, wireframe y crítica. Es la tabla de §2 y no hay otro disparador.

## 9. Modos de falla y cómo detectarlos (h)

| # | Falla | Cómo se mide |
|---|---|---|
| F1 | `ui` no se activa desde `work` | % de tareas de UI con `brief.md` o con corrida del chequeo (grep sobre transcripción y `.pignolo-ui/`) |
| F2 | Brief de trámite (genérico) | la acción principal del brief coincide con el único botón primario (ACTION-01 en 0); voto ciego |
| F3 | Fichas flojas o mal sacadas | proporción de fuentes alta/media; revisión del autor de las 14 semillas; brazo con y sin fichas |
| F4 | Fichas que aplanan la identidad (todas las pantallas iguales) | voto ciego de diversidad entre 3 productos de prueba |
| F5 | Wireframe salteado o caro | `wireframe.html` existe y no tiene literales de color con croma; tokens por brazo |
| F6 | Falsos positivos de las heurísticas (ACTION-01, STATE-05) | precisión sobre fixtures más 20 hallazgos reales revisados a mano; ≥ 80 % como meta |
| F7 | La crítica empeora o se aprueba sola (todo "sí") | voto ciego pasada 1 contra pasada 2; distribución de "sí"; hallazgos del chequeo antes y después |
| F8 | Ceremonia en retoques (anti-meta) | tokens de una tarea chica de UI con y sin flujo: ≤ +10 % |
| F9 | El dropdown propio es menos accesible que el nativo | NAV-01 y teclado de `ui-audit` sobre los componentes; la ficha `dropdown` exige el patrón APG |
| F10 | Contexto inflado por fichas | tokens de entrada por pantalla |

F9 es el riesgo de producto más serio [opinión]: reemplazar lo nativo por algo inaccesible empeora la app aunque se vea mejor.

## 10. Tareas de implementación, en orden (i)

1. `ui-audit/lib/rules/light.mjs` (nuevo): NATIVE-01, ACTION-01, TYPE-01, TYPE-02, con sus entradas en `catalog/rules.json`, alta en `DISK_RULES` de `lib/ui-check.mjs` y fixtures en `tests/fixtures/rules/<ID>/`.
2. STATE-05 en el mismo módulo, reusando `utility-classes.mjs` y la lógica de selector base de STATE-04 en `rules/style.mjs`, con fixtures.
3. STATE-06 (sobre `design/components/*.html`) y TARGET-01 (en `lib/design-doc.mjs`), con fixtures.
4. `ui-audit/scripts/light-check.mjs` y `tests/light-check-cli.test.mjs`: `initRun` + `runCheck` con `LIGHT_RULES`, más un test de que cada id existe en el catálogo; salida compacta; acepta `--files`, `--base` y `--design`.
5. `ui-audit/catalog/symptoms.json`: síntomas "sobrecargada", "sin hover", "selector nativo", que apuntan a las reglas nuevas.
6. `plugins/pignolo/agents/ui-pattern.md` (sonnet/medium, WebSearch + WebFetch).
7. Las 14 semillas en `skills/ui/references/patterns/`, una tarea por grupo de 3-4, cada una revisada por opus. Costo estimado: 0,4-0,8 M tokens [supuesto], y lo aprueba el autor.
8. `skills/ui/references/{brief,patterns,wireframe,states,check,critique}.md`: una tarea, sin referencias cruzadas entre ellas.
9. `skills/ui/SKILL.md`: sección 4, tabla y `<root>`, más un test de que cada `references/<paso>.md` aparece en exactamente una línea.
10. `skills/work/SKILL.md`: la línea del §4.
11. Script de brazos de las pruebas (borra líneas por ruta) y su ficha preinscrita en `tests/evals/RESULTS-ui-flujo.md`.
12. `version` en `plugins/pignolo/.claude-plugin/plugin.json` y entrada del CHANGELOG [dato: convención de `CLAUDE.md`].

## 11. Preguntas abiertas (j)

- **Q1 (autor).** ¿Las reglas nuevas entran al catálogo compartido (y `ui-audit` las hereda), o van en una lista aparte? §8 fija "el catálogo se mantiene como está", y además `ui` pasaría a depender de `ui-audit` (spec §5.4: "el resto del plugin no depende de ellos"). Es un cambio de contrato.
- **Q2 (autor, costo).** ¿Se incluyen las 14 semillas (una sola vez, 0,4-0,8 M tokens) o solo se investiga en cada proyecto cuando falta una?
- **Q3.** ¿Crítica en el hilo principal (más barata, con sesgo de autor) o con un agente independiente con captura? Lo resuelve una prueba A/B.
- **Q4.** ¿Wireframe como HTML aparte o como bosquejo de texto en el brief (+4 puntos para la representación estructurada, dato de arxiv 2508.19227)? El HTML cuesta 3-6 k más.
- **Q5.** NATIVE-01 frente a móvil: la HIG prefiere los selectores nativos en iOS. ¿Se exime `platform: mobile` o se deja como "intencional"?
- **Q6.** Umbrales elegidos sin dato: 5 tamaños de letra, 4 roles de texto, 3 datos clave, 2 secundarias.

## 12. Decisiones después del ataque (2026-10-24, mandan sobre las secciones 2 a 10 donde choquen)

El atacante (opus) verificó los datos y encontró que el alcance era demasiado grande y que el experimento no se podía interpretar. Comprobado por el controlador: la cifra "2, 1 y 2 de 10" es la activación de `plan` con "armá un plan" en una carpeta vacía (`docs/benchmarks.md` §3d), no de `work`/`ui`; y `ui/SKILL.md` ya dice "todos sus estados" y "nunca selectores nativos" y aun así salen los síntomas, así que lo que falla es que la skill **no se carga**, no que falte la instrucción. Decisiones técnicas (las toma el agente; ninguna cambia un contrato del autor):

1. **Primero la activación, aparte.** Fase 0: con los pedidos naturales del autor, medir si se carga `ui` con el plugin 1.0.0 y con variantes baratas (frases de construcción en la `description` de `ui`; la línea de `work`; las 3 o 4 reglas núcleo dentro de `work`). Método de `docs/benchmarks.md` §3c (solo la herramienta Skill), que es barato.
2. **Primer experimento de valor del flujo, con invocación forzada** (`/pignolo:ui` en el pedido) para que la activación no confunda. Brazos **aditivos**: base (1.0.0) → + Brief → + Ficha de patrón bajo demanda → + Crítica por juicio de una sola pasada. Más un brazo N (sin plugin) de referencia. Los brazos se **componen** desde partes; no se arman borrando líneas de una skill que nombra todos los pasos. `SKILL.md` no lleva la tabla que nombra los pasos ni la frase "a step missing from this list is skipped".
3. **Pasos sin solapamiento.** Brief decide propósito, acción principal y qué se deja afuera (con las regiones en texto: sin wireframe HTML). La ficha de patrón aporta los límites y los estados del elemento concreto. La crítica lleva solo los ítems de juicio (1, 4, 5, 6, 7) y mira una captura si hay navegador; no repite lo que mide un script.
4. **El instrumento no es el tratamiento.** El chequeo existente (`ui-audit/scripts/ui-check.mjs` con `--files`, `--design`, `--base`) y las mediciones de navegador las corre el **arnés** en todos los brazos, no el agente. La medida primaria es el voto ciego del autor y cuántos cambios pediría, por tipo.
5. **Fichas.** Se mantienen las 14 semillas ya escritas como un brazo propio (semillas contra investigación bajo demanda con el contexto de la tarea); la ficha investigada bajo demanda recibe la pregunta del patrón **con** el contexto de la pieza. Precedencia: `design.md` gana siempre sobre una ficha. Sin agente nuevo: la ficha se investiga con un agente general con `model` explícito.
6. **Fuera de este primer experimento:** wireframe en HTML, segunda pasada de crítica, reglas ACTION-01, STATE-05, TYPE-01, TARGET-01 y STATE-06, síntomas nuevos en `symptoms.json`, cualquier cambio al catálogo compartido. Q1 queda resuelta sin tocar el contrato: la única regla nueva posible (NATIVE-01) vive en un archivo aparte y se agrega solo si los datos la piden. Q3: crítica en el hilo principal. Q4: bosquejo de texto. Q5: NATIVE-01 solo para web de escritorio. Q6: los límites numéricos del brief son guía, declarados como hipótesis.
7. **Detalles a corregir en la implementación:** las rutas del código de auditoría son `plugins/pignolo/ui-audit/...`; las referencias entre secciones van por nombre de sección y no por número; el dropdown y el selector de fecha del catálogo deben pasar la prueba de teclado y foco (F9) antes de exigir que se reemplace lo nativo.
