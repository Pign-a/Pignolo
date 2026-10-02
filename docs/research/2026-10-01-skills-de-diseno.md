# Qué puede aprender pignolo-ui de tres skills públicas de diseño

Fecha de consulta de todas las fuentes: **2026-10-01**. Investigación y propuesta (no se tocó código). Las citas textuales van en inglés, de dos líneas como máximo. Los repos se leyeron clonados (texto real de los `SKILL.md` y referencias), no resúmenes.

Límites de lo leído: de impeccable leí `SKILL.src.md`, `craft-floor.md`, `audit.md`, `animate.md`, `typeset.md`, `layout.md`, el catálogo del detector (`antipatterns.json`) y partes de `critique.md`, `polish.md` e `ios.md`; **no** leí `new-work.md` (59 KB), `live.md` ni el sitio impeccable.style. De Emil leí completos `emil-design-eng`, `review-animations/STANDARDS.md`, `apple-design` y partes de `review-animations`, `mobile-native` y `animation-vocabulary`. De la skill de Apple leí `SKILL.md` (lentes, informe, reglas de trabajo) y el README; no las 123 páginas de HIG copiadas.

## A. Las tres fuentes

### A1. impeccable (Paul Bakaus)

- **Qué es.** Repo https://github.com/pbakaus/impeccable, 73.640 estrellas, Apache-2.0, creado 2025-11-16, versión 4.4.0 (commit `4adabaf`, 2026-10-01). Sitio declarado en su `plugin.json`: impeccable.style. Su README dice que partió de la skill `frontend-design` de Anthropic.
- **Estructura.** Una sola skill con 24 comandos en una tabla (construir: `shape`, `init`, `document`, `extract`; evaluar: `critique`, `audit`; refinar: `polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`; realzar: `animate`, `colorize`, `typeset`, `layout`, `delight`, `overdrive`; arreglar: `clarify`, `adapt`, `optimize`; iterar: `live`, `generate`). Cada comando carga su archivo de `reference/`. Cuatro "modos" según qué hace el visitante (Persuade, Operate, Read, Experience). Un detector determinista de 61 reglas (`npx impeccable detect`, binario propio en Rust) y cuatro subagentes.
- **Lo que hace bien.**
  - Separa lo que mide un script de lo que juzga el modelo, y corre las dos cosas aisladas: "Do not let detector findings anchor the design assessment." (`reference/typeset.md`).
  - El pedido manda sobre el gusto de la skill: "The brief wins. [...] Redirecting a clear brief toward your taste is failure." (`SKILL.src.md`).
  - Verificación acotada: "Verify in bounded passes, not a loop" (`SKILL.src.md`). Es la misma idea que los límites de `improve`.
  - La lista de clichés se presenta como hábitos, no como ley: "These are the category's defaults, not bans: the brief's own words can earn any of them." (`reference/craft-floor.md`).
  - Las preguntas de evaluación piden evidencia: cada respuesta "with a file, selector, or computed value".
- **Lo que hace mal (para nuestro caso).**
  - Es enorme: `critique.md` 46 KB, `new-work.md` 59 KB. Caro en tokens; sin evals publicadas en el README que muestren que mejora el resultado.
  - Se pone nota a sí misma (0–4 por dimensión, total /20 y /40). pignolo-ui lo prohíbe en el auditor.
  - Tono de arenga ("award-winning design director", "Go all out"), que empuja a exagerar.
  - Tiene una prohibición absoluta que contradice su propia regla del pedido: el rótulo chico sobre un título, "no brief earns it back".
  - Reglas de gusto en el detector: `overused-font` marca Inter, Roboto y Geist; `cream-palette` marca fondos crema. Chocan con cualquier `DESIGN.md` que los elija.
  - El lanzador baja un binario en el primer uso (dependencia).
- **Licencia y reúso.** Apache-2.0: se puede reusar texto y código con aviso de licencia, conservando el `NOTICE` y marcando los cambios. Recomendación: **no copiar texto ni código**; tomar ideas, escribirlas con palabras propias y sumar una línea a `CREDITS.md` (repo, licencia, fecha). Sus `ios.md`/`android.md` derivan de `ehmo/platform-design-skills` (MIT), según su `NOTICE.md`.

### A2. Skills de Emil Kowalski

- **Cuál es la suya.** https://github.com/emilkowalski/skills, 42.691 estrellas, MIT ("Copyright (c) 2026 Emil Kowalski"), creado 2026-03-16 (commit `d16ebe6`, 2026-09-24). Se instala con `npx skills@latest add emilkowalski/skills`; el README enlaza aiforui.dev y emilkowal.ski.
- **Derivaciones de terceros (no son suyas):** `kylezantos/design-motion-principles` (1.185 estrellas; mezcla a Emil, Jakub Krehel y Jhey Tompkins), `delphi-ai/animate-skill` (102), `h3nryprod01/design-taste` (60; mezcla Emil + impeccable + taste-skill), `master5d/claude-design-skills` (28).
- **Estructura.** 13 skills chicas. La principal es `emil-design-eng` (28 KB, casi todo animación). Otras: `animate`, `review-animations` (10 estándares + `STANDARDS.md`), `improve-animations`, `find-animation-opportunities`, `animation-vocabulary` (glosario inverso: descripción vaga → término exacto), `apple-design` (charlas WWDC llevadas a la web), `mobile-native` (tabla síntoma → arreglo), `prototype`, `pick-ui-library`.
- **Lo que hace bien.**
  - Números concretos: tabla de duraciones (botón 100–160 ms, tooltips 125–200, desplegables 150–250, modales 200–500).
  - Decide primero si hay que animar, según frecuencia de uso: 100+ veces por día, "No animation. Ever." (`emil-design-eng/SKILL.md`).
  - Formato de revisión Antes / Después / Por qué en tabla, y un orden de arreglos que empieza por borrar la animación.
  - `mobile-native` es una tabla "lo que ve el usuario → una línea de CSS", igual en espíritu a `catalog/symptoms.json`.
  - Movimiento reducido bien entendido: "Reduced motion means fewer and gentler animations, not zero."
- **Lo que hace mal.**
  - Gusto presentado como ley: "Never use ease-in for UI animations" y "The built-in CSS easings are too weak."
  - Se contradice: "UI animations should stay under 300ms" junto a una tabla que admite modales de hasta 500 ms.
  - Postura de revisor que infla hallazgos: "Default to flagging. Approval is earned, not assumed." (`review-animations/SKILL.md`). Es justo el problema que ya tiene nuestro auditor.
  - Mucho es de React/Framer Motion y de gestos con JavaScript; `ui-option` no escribe scripts.
  - Ningún script: todo es prosa para el modelo.
- **Licencia y reúso.** MIT: se puede reusar con el aviso de copyright si se copian partes sustanciales. Si se toman valores (curvas `cubic-bezier`, duraciones), seguir el patrón que `CREDITS.md` ya usa en "Third-party values (MIT)": valor, fuente, commit y aviso.

### A3. Skill de diseño Apple (la de más estrellas)

Candidatas comparadas (búsquedas en GitHub: "apple hig skill", "human interface guidelines claude skill", "apple design skill agent", "swiftui design skill agent", "ios design guidelines skill"; puede haber repos con otro nombre que no aparecieron):

| Repo | Estrellas | Creado | Licencia | Qué es |
|---|---|---|---|---|
| `dickwu/apple-design-skill` | 917 | 2026-02-27 | **ninguna** | Revisor de UI contra HIG, multi-framework |
| `ehmo/platform-design-skills` | 603 | 2026-02-01 | MIT | 300+ reglas HIG, Material 3 y WCAG, incluye Web |
| `justinwetch/HIGAgentSkills` | 489 | 2026-03-15 | ninguna | HIG para agentes |
| `Wholiver/swiftui-design-skill` | 207 | 2026-04-30 | sin verificar | Diseño SwiftUI |
| `axiaoge2/Apple-Hig-Designer` | 154 | 2025-12-12 | sin verificar | Diseño HIG |

- **Elegida: `dickwu/apple-design-skill`** (https://github.com/dickwu/apple-design-skill, commit `6237cc1`, 2026-09-29) por ser la de más estrellas, que era el criterio pedido. Aviso: `ehmo/platform-design-skills` tiene menos estrellas pero licencia MIT y sección Web; para reusar algo es mejor fuente. Además, la propia colección de Emil trae `apple-design` (MIT), pensada para la web.
- **Estructura.** Un `SKILL.md` de 23 KB más 123 páginas de HIG bajadas de developer.apple.com con un script (`scripts/pull-hig.mjs`), una tabla de ruteo (`hig-lookup.md`) y una tabla de equivalencias entre frameworks. Revisa con cinco lentes en orden y con severidad por defecto: accesibilidad (crítico), convenciones de plataforma (alto), visual y oficio (alto o medio), interacción (medio), texto (medio). Cada hallazgo: Qué / Por qué (archivo › título) / Arreglo.
- **Lo que hace bien.**
  - Pide números y no adjetivos: cada observación lleva la medida (un contraste con su razón, por ejemplo).
  - Cada hallazgo cita la guía de la que sale o se rotula como juicio; no inventa guías.
  - Frena la sobre-crítica: un diseño fuerte recibe una reseña corta y no una lista larga de hallazgos.
  - Carga solo las referencias de lo que hay en pantalla.
- **Lo que hace mal.**
  - 1,5 MB de texto de Apple copiado, sin archivo de licencia. Su propio README reconoce que ese texto es de Apple y que lo reproduce.
  - Casi todo es nativo (barras de pestañas, hojas, barra de menú, iPhone Duo, Liquid Glass).
  - Pone calificación global (Excellent / Good / Needs work), o sea nota.
  - Sin scripts de verificación.
- **Licencia y reúso.** Sin licencia = todos los derechos reservados sobre lo propio; el texto de HIG es de Apple. **No reusar texto.** Solo ideas, y citando a Apple HIG directamente con enlace (como ya hace `norms/base.md` en "Platform (HIG, Fluent 2)"). Es tema legal: decide el autor (D-UX-3).

## B. Tabla comparativa

Costo: bajo = una entrada de catálogo o unas líneas de carta; medio = checker nuevo con fixtures; alto = flujo nuevo.

| Idea (fuente) | ¿Ya está en pignolo-ui? (dónde) | Brecha | Valor | Costo | ¿Script? |
|---|---|---|---|---|---|
| Tamaño de objetivo táctil 44 / 24 px (HIG vía dickwu; impeccable `audit.md`) | Solo prosa: `norms/base.md`, `ui-option.md` Craft 8; la spec dice que el checker de 24 px no está en v1 (§5.4, línea 373) | Sin checker | Alto | Medio | Sí (navegador) |
| `transition: all` (Emil) | Sí, MOTION-04 (`rules.json`) | Ninguna | — | — | Sí |
| Movimiento reducido (los tres) | Sí, MOTION-03 y MOTION-07 | Ninguna | — | — | Sí |
| Duraciones por tipo de elemento (Emil; impeccable `animate.md`) | Tokens `motion.durationMs` en la spec §4.3, sin regla que los compare | Sin checker | Medio | Medio | Sí |
| Curvas: sin `ease-in`, sin rebote (Emil; impeccable `bounce-easing`) | No | Sin regla | Medio-bajo | Bajo | Sí |
| Animar `width/height/top/left/margin` (Emil; impeccable `layout-transition`) | No | Sin regla | Medio | Bajo | Sí |
| `:hover` sin `@media (hover: hover)` (Emil) | No | Sin regla | Medio | Bajo | Sí |
| `input` con letra < 16 px hace zoom en iOS (Emil `mobile-native`) | No (A11Y-28 cubre solo no bloquear el zoom) | Sin regla | Medio | Bajo | Sí (navegador) |
| Renglón demasiado largo, interlineado apretado, texto chico (impeccable `line-length`, `tight-leading`, `tiny-text`) | No | Sin regla | Medio | Medio | Sí (navegador) |
| Salto de nivel de títulos h1→h3 (impeccable `skipped-heading`) | `ui-option.md` pide "headings in order"; sin checker | Sin regla | Medio | Bajo | Sí |
| Jerarquía de tamaños plana, razón < 1,25 (impeccable `flat-type-hierarchy`) | J-02 de juicio | Evidencia medida para J-02 | Alto | Medio | Sí (navegador) |
| Borde lateral de color en tarjetas; tarjeta dentro de tarjeta (impeccable `side-tab`, `nested-cards`) | Prosa en `ui-option.md` Craft 6 | Sin checker | Bajo-medio | Bajo | Sí / en parte |
| Colores, radios y fuentes fuera de `DESIGN.md` (impeccable `design-system-*`) | Sí: COLOR-02, LAYOUT-04, DRIFT-01; falta fuente y tamaño de letra | Fuente y escala de letra | Medio | Medio | Sí |
| Texto degradado, paleta violeta, emoji, frases de marketing (impeccable) | Sí: COLOR-12, COLOR-11, ICON-01, COPY-01 | Ninguna | — | — | Sí |
| Más espacio arriba que abajo de un título (impeccable `heading-rhythm`) | J-05 de juicio | Evidencia medida | Bajo | Medio | Sí (navegador) |
| Estados y superficies del navegador: selección, cursor, barras, foco (impeccable `craft-floor.md`) | Foco sí (STATE-04); el resto no | Regla de oficio | Medio | Bajo | En parte |
| Criterio "no aplica" por heurística (impeccable `critique.md`, modos) | No: los J-nn se aplican siempre | Causa de la sobre-severidad | Alto | Bajo | No |
| Reseña corta para un diseño fuerte (idea de la skill Apple) | No | Freno a hallazgos de relleno | Alto | Bajo | En parte (tope contado) |
| Prueba de entrecerrar los ojos; cuatro preguntas de orientación (impeccable `layout.md`; Emil `apple-design`) | J-01, J-02, J-04 genéricos | Redacción más filosa | Medio | Bajo | No |
| El botón nombra lo que pasa y no usa un rótulo genérico (idea de la skill Apple, lente de texto) | J-07 genérico | Regla de texto | Medio | Bajo | En parte (lista de palabras) |
| Vocabulario de direcciones `bolder`, `quieter`, `distill`, `clarify` (impeccable) | 11 síntomas en `symptoms.json` | Faltan síntomas de carga, sosería, texto y movimiento | Medio | Bajo | Sí (mapa palabra → regla) |
| Nota 0–4 y total (impeccable, dickwu) | Prohibido: `ui-auditor.md` "No self-grade" | — | Negativo | — | — |
| Personas (impeccable `critique.md`) | No | — | Bajo, caro | Alto | No |

## C. Candidatos concretos

Los ids son provisorios; hay que asignarlos contra el catálogo de la spec §5.

### C1. Reglas para la sección Craft de `ui-option`

Cinco líneas, todas subordinadas a `DESIGN.md` y al brief:

1. Estados: cada control interactivo muestra reposo, foco y presionado; si la pantalla tiene lista o formulario, mostrar también el estado vacío o de error que el brief describa. (impeccable `craft-floor.md`, "States".)
2. Ritmo de espacios: grupos apretados, separación generosa entre grupos, y más espacio arriba de un título que abajo. (impeccable `layout.md`.)
3. Escala de letra: pasos visibles (cada nivel al menos 1,25 veces el anterior), renglones de texto corrido de 45 a 75 caracteres, y jerarquía con peso además de tamaño. (impeccable `typeset.md`; Emil `apple-design` §15.)
4. Énfasis en un solo lugar: el color de acento queda para la acción principal y el estado; lo demás, neutro. (dickwu lente 3, basado en la HIG de Apple.)
5. Movimiento: solo transiciones de estado (hover, foco, presionado), con propiedad nombrada, 100 a 200 ms, y dentro de `prefers-reduced-motion`. Sin animaciones de entrada.

No sumar más: la carta mejorada no cambió la preferencia del autor (RESULTS-lienzo.md), así que cada línea tiene que ganarse el lugar en la medición de la sección E.

### C2. Reglas con checker nuevas

| Id provisorio | Qué mira el checker | Dónde | Severidad sugerida | Fuente |
|---|---|---|---|---|
| TARGET-01 | Caja de cada `button`, `a`, `input`, `[role=button]`: menor a 24×24 px falla; menor a 44 px en ancho de celular es aviso | navegador | `alto` / `medio` | WCAG 2.2 SC 2.5.8; HIG |
| MOTION-05 | Duración escrita a mano fuera de `motion.durationMs` de `DESIGN.md`; sin `DESIGN.md`, transición de un control mayor a 500 ms | CSS estático | `medio`, admite intencional | Emil; impeccable `animate.md` |
| MOTION-06 | `ease-in` en transición de control, o `cubic-bezier` con valores fuera de 0–1 (rebote) | CSS estático | `detalle`, admite intencional | Emil; impeccable `bounce-easing` |
| MOTION-08 | `transition` o `@keyframes` sobre `width`, `height`, `top`, `left`, `margin`, `padding` | CSS estático | `medio`, admite intencional | Emil; impeccable `layout-transition` |
| MOTION-09 | Regla `:hover` con `transform` fuera de `@media (hover: hover)` | CSS estático | `detalle` | Emil `mobile-native` |
| FORM-01 | `input`, `select`, `textarea` con letra calculada menor a 16 px en ancho de celular | navegador | `medio` | Emil `mobile-native` |
| TYPE-01 | Texto corrido con renglones de más de 80 caracteres, o interlineado menor a 1,3 en párrafos de varias líneas, o cuerpo menor a 12 px | navegador | `medio` | impeccable `line-length`, `tight-leading`, `tiny-text` |
| TYPE-02 | Razón entre el tamaño del título principal y el del cuerpo menor a 1,25 | navegador | `medio` | impeccable `flat-type-hierarchy` |
| A11Y-xx | Niveles de título que saltan (h1 → h3) | HTML estático | `medio` | impeccable `skipped-heading`; WCAG 1.3.1 |
| LAYOUT-xx | `border-left` o `border-right` de color mayor a 1 px en un elemento con radio | CSS estático | `detalle`, admite intencional | impeccable `side-tab` |

Prioridad: TARGET-01, TYPE-02, A11Y-xx y MOTION-08 primero. TARGET-01 cierra un hueco que la spec ya reconoce; TYPE-02 le da evidencia medida a J-02.

### C3. Auditor: criterios más filosos y cómo evitan la sobre-severidad

El problema medido (RESULTS-ui-hito-4.md): en páginas limpias el auditor marcó `J-08:alto` en 4 de 5 corridas de `clean-2`, y `J-04:alto` y `J-11:alto` en `clean-3`.

1. **Condición de aplicación por criterio.** Cada J-nn dice cuándo aplica; si no aplica, no hay hallazgo. Ejemplo: J-08 (deshacer o salir sin perder trabajo) aplica solo si la pantalla tiene un formulario, una edición o una acción destructiva. J-06 aplica solo si hay una acción que tarda o guarda. J-10, solo si hay un estado de error alcanzable. Idea tomada de las heurísticas "n/a" de impeccable. Ataca directo el caso `clean-2`.
2. **Ancla de severidad.** Un J-nn es `medio` por defecto. Sube a `alto` solo si se cumple todo: la tarea principal de la pantalla queda bloqueada o engañosa, y la evidencia es un elemento concreto del DOM o del archivo. Prueba de una línea, de impeccable: "Would a user contact support about this?".
3. **Tope y orden.** Como mucho 3 hallazgos de juicio por pantalla, los de más efecto; el resto no se informa. Un script lo cuenta en `auditor.json`. Idea de la skill Apple (frenar la lista larga de hallazgos), en palabras propias.
4. **Número o etiqueta.** Si un juicio se puede medir (jerarquía, espacios, contraste), cita el número de `browser.json`; si no, el `why` empieza diciendo que es juicio. Idea de la skill Apple (medidas y no adjetivos), en palabras propias.
5. **Redacción más filosa:**
   - J-01/J-02: "con el detalle borroso, ¿se distingue primero la acción principal y después los grupos?" (prueba de entrecerrar los ojos, impeccable `layout.md`).
   - J-04: la primera vista responde ¿dónde estoy?, ¿a dónde puedo ir?, ¿qué hay acá?, ¿cómo salgo? (Emil `apple-design` §16).
   - J-07: el rótulo de cada control nombra lo que pasa; la acción conserva su nombre en todo el flujo (dickwu lente 5).
   - J-08: lo destructivo e irreversible pide confirmación con Cancelar; lo demás, deshacer (HIG vía dickwu lente 4).
   - J-09: un color significa una sola cosa (dickwu lente 3).

No adoptar la postura de Emil de "marcar por defecto": empeora lo que ya falla.

### C4. Vocabulario para `improve` (lo que dice la persona → qué significa)

| Dice | Significa | Reglas |
|---|---|---|
| "se siente lenta", "pesada" | Transiciones largas o con arranque lento | MOTION-05, MOTION-06 |
| "va a los saltos", "se traba" | Se animan propiedades de layout | MOTION-08 |
| "cuesta tocar los botones", "le erro" | Objetivos chicos o pegados | TARGET-01 |
| "hace zoom cuando escribo en el celular" | Campos con letra menor a 16 px | FORM-01 |
| "queda marcado después de tocar" | `:hover` sin filtro de dispositivo | MOTION-09 |
| "cansa leer", "mucho texto de corrido" | Renglón largo o interlineado apretado | TYPE-01 |
| "todo son cajas", "mucha tarjeta" | Tarjetas iguales o anidadas | LAYOUT-xx, J-05 |
| "muy cargada", "ruidosa" | Demasiados acentos o densidad fuera de registro | J-12, J-01 |
| "no se entiende qué hace el botón" | Rótulos genéricos | J-07 |
| "sosa", "aburrida", "le falta onda" | Pide salir del sistema de diseño | Sin regla: ofrecer el modo explorar |

El último es importante: "sosa" no se arregla dentro de `DESIGN.md`; el flujo debe decirlo y ofrecer el modo explorar, no inventar estilo. (El modo explorar no lo encontré escrito en la spec ni en las skills; lo tomo como decisión del autor todavía sin texto.)

### C5. Movimiento

- **¿Entra en la v1?** En parte. Auditar movimiento en pantallas reales: sí, con checkers estáticos, porque es barato y la spec ya tiene tokens `motion.*`. Generar movimiento en `ui-option`: solo transiciones de estado (C1.5). Animaciones de entrada, gestos y resortes: fuera, porque `ui-option` no escribe scripts y las capturas y el lienzo no muestran movimiento.
- **Qué se puede verificar con script:** duración contra tokens o tope (MOTION-05), curva (MOTION-06), propiedades animadas (MOTION-08), `transition: all` (ya está), `prefers-reduced-motion` (ya está), contenido visible sin movimiento (ya está, MOTION-07), hover filtrado (MOTION-09), entrada desde `scale(0)` (fácil de sumar).
- **Qué no:** si la animación "se siente bien", si tiene propósito, si la frecuencia de uso la justifica. Eso queda como una sola pregunta de juicio opcional, no como reglas.

### C6. Apple HIG: qué se traslada a la web y qué no

| Se traslada | Cómo |
|---|---|
| Objetivos táctiles (44 pt celular; 28 pt escritorio según dickwu lente 1) | TARGET-01 |
| Tamaños mínimos de letra (cuerpo 17 pt, mínimo 11 pt en celular) | TYPE-01; en web, cuerpo de 16 px y campos de 16 px |
| El texto escala con la preferencia de la persona | Medidas en `rem`; la página no se rompe con zoom de texto (en parte verificable) |
| Jerarquía con peso y tamaño; pocas familias | C1.3, TYPE-02 |
| Deferencia: la marca cede ante el contenido; el color de marca queda para la acción principal | C1.4, J-01 |
| Claridad: nada se comunica solo con color; un color, un significado | J-09; en parte verificable |
| Materiales y profundidad: el desenfoque solo en la capa flotante (barras, hojas), nunca en el contenido | Regla de juicio; en parte verificable (`backdrop-filter` en elementos no fijos) |
| Áreas seguras | `env(safe-area-inset-*)` junto con `viewport-fit=cover` (verificable) |
| Preferencias de menos transparencia y más contraste | `prefers-reduced-transparency`, `prefers-contrast` (verificable por presencia) |
| Alertas escasas; lo destructivo pide confirmación | J-08 |

Solo iOS (fuera de la v1 web): barra de pestañas y sus reglas, SF Symbols, títulos grandes que colapsan, gesto de volver desde el borde, hojas con alturas, Liquid Glass, iPhone Duo, barra de menú de macOS, háptica, Dynamic Type como API, resortes con traspaso de velocidad.

## D. Qué NO adoptar

- **Gusto presentado como ley.** Listas negras de fuentes (`overused-font`), prohibición del fondo crema como regla con checker, "nunca `ease-in`" como bloqueo, la prohibición absoluta del rótulo sobre el título. Pelean con `DESIGN.md`. Si se suman, van como `detalle` o `medio`, admiten "intencional" y callan cuando `DESIGN.md` decide.
- **Notas y calificaciones** (0–4, /20, /40, "Excellent/Good"). La carta del auditor ya las prohíbe y no hay dato de que ayuden.
- **Postura "marcar por defecto"** (Emil) y **personas** (impeccable): más hallazgos y más tokens, sin evidencia; lo contrario de lo que pide RESULTS-ui-hito-4.md.
- **Tono de arenga** ("go all out", "award-winning"): empuja a opciones recargadas; el autor pidió que gane la más simple.
- **Los 24 comandos y los archivos gigantes.** pignolo-ui tiene tres flujos; el vocabulario de direcciones entra como síntomas, no como comandos.
- **Reglas duplicadas.** Ya cubiertas: `transition: all`, movimiento reducido, texto degradado, paleta violeta, emoji, frases de marketing, colores y radios fuera de tokens, contraste, desborde a 320 px.
- **Gestos, resortes, Framer Motion, háptica, texto de HIG copiado.** Fuera de alcance o sin licencia.
- **El detector de impeccable como dependencia.** Binario externo; pignolo no suma dependencias sin decisión del autor. Se reimplementan con código propio las pocas reglas que valgan.
- **Cualquier cosa sin medición.** Ninguna de las tres fuentes publica evals; nada entra a la carta sin pasar por la sección E.

## E. Medición propuesta

**E1. Opciones (`ui-option`).** Mismo brief que RESULTS-lienzo.md (`MOCKUP_BRIEF`, 2 pantallas × 2 opciones, 390×844).

- Brazos: carta de hoy (0.6.2) contra carta + las cinco reglas de C1; en sonnet y en opus. Cuatro brazos, 3 corridas cada uno (la medición anterior tuvo una sola corrida por brazo y lo dice como límite).
- Juicio del autor **a ciegas**: un script mezcla y renombra las carpetas; el autor ordena por preferencia sin saber el brazo; después se abre el mapa.
- Lo que cuenta un script por opción: fallas de `ui-check` y de navegador; objetivos menores a 44 px; contraste mínimo; cantidad de tamaños de letra distintos y razón título/cuerpo; cantidad de colores distintos; patrones de la lista "a evitar" presentes; bytes de HTML; tokens y segundos.
- Criterio de adopción: la carta nueva entra si el autor la prefiere en al menos 2 de 3 tandas y no sube las fallas de script ni el costo más de 10 %.
- Costo estimado: sonnet ≈ 0,09 USD por corrida (dato de RESULTS-ui-hito-4.md) → 6 corridas ≈ 0,6 USD. Opus no tiene dato en USD en los archivos; estimo unas 5 veces → 6 corridas ≈ 3 USD. Total ≈ **3 a 4 USD**. Es estimación, no medición.

**E2. Auditor.** Repetir `clean-2`, `clean-3` y `defect-j-01` (5 corridas cada uno) con la carta de C3. Pasa si las páginas limpias llegan a 4 de 5 sin hallazgos `alto`, y `defect-j-01` sigue hallando el defecto sembrado (que el freno no tape lo real). Costo: 15 corridas × ≈ 0,29 USD ≈ **4,4 USD** (dato de la misma tabla).

Total de la medición: ≈ **8 USD**. Va a `docs/benchmarks.md` con costo, velocidad y calidad.

## F. Decisiones del autor y tamaño

| Id | Decisión | Recomendación |
|---|---|---|
| D-UX-1 | ¿El movimiento entra en la v1? | Sí para auditar (checkers estáticos); en `ui-option`, solo transiciones de estado |
| D-UX-2 | ¿Cambiar el contrato del auditor: J-nn con condición de aplicación, `medio` por defecto, tope de 3? | Sí; es el arreglo más barato para `clean-2` y `clean-3`, y se mide con E2 |
| D-UX-3 | Fuente Apple sin licencia (tema legal) | No copiar nada de `dickwu`; citar Apple HIG con enlace; si hace falta texto reusable, `ehmo` (MIT) o `apple-design` de Emil (MIT) |
| D-UX-4 | ¿Reglas de gusto con checker? | Solo `detalle` o `medio`, con "intencional", y calladas si `DESIGN.md` decide; sin lista negra de fuentes |
| D-UX-5 | ¿Correr la medición E (≈ 8 USD)? | Sí, antes de tocar la carta en `main` |
| D-UX-6 | ¿Dónde va? | Reglas con checker, auditor y síntomas: hito chico propio después de las etapas del lienzo. Reglas de Craft de `ui-option`: dentro de la etapa del lienzo que revise la carta, porque el modelo y las reglas de oficio de `ui-option` ya están pendientes ahí |
| D-UX-7 | Umbral de objetivo táctil | Menor a 24 px `alto` (WCAG AA); menor a 44 px en celular `medio` |
| D-UX-8 | "Sosa / aburrida" en `improve` | Ofrecer el modo explorar en vez de salirse del sistema de diseño por cuenta propia |

**Tamaño estimado del hito chico** (pignolo-ui 0.7.0, con entrada en CHANGELOG y `CREDITS.md`):

| Tarea | Tests |
|---|---|
| 1. TARGET-01 (navegador) | 4 fixtures (pasa, falla 24, aviso 44, control deshabilitado) |
| 2. TYPE-01 y TYPE-02 (navegador) | 6 |
| 3. Salto de niveles de título y borde lateral (estático) | 5 |
| 4. MOTION-05, 06, 08, 09 (estático, un módulo) | 10 |
| 5. FORM-01 (navegador) | 2 |
| 6. Carta del auditor (C3) + contador del tope en `auditor-output` | 4 + evals E2 |
| 7. Síntomas nuevos en `symptoms.json` | 3 |
| 8. Carta de `ui-option` (C1) | test de carta + E1 |
| 9. Créditos, versión, CHANGELOG | test de catálogo |

Unas 9 tareas y unos 35 tests, en sonnet, con una revisión opus al final. Si hay que recortar: tareas 1, 6 y 7 solas dan lo de mayor valor (unas 3 tareas, 11 tests, más E2).

Nota: los tres repos se leyeron clonados en una carpeta temporal fuera del repositorio (material de lectura, no versionado).
