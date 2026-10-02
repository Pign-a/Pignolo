# impeccable, segunda pasada: flujos y artefactos que la primera no miró

Fecha de lectura: **2026-10-01**. Fuente: clon local de `pbakaus/impeccable` (commit `4adabaf`, versión 4.4.0, Apache-2.0, "Copyright 2025 Paul Bakaus" en `LICENSE` línea 179). Solo investigación: no se tocó el repo de pignolo, no se corrió ningún script ni binario de impeccable. Las rutas citadas son relativas al clon (`uxsrc/impeccable/`). Citas en inglés, de dos líneas como mucho.

**Leído completo:** `skill/SKILL.src.md`, y de `skill/reference/`: `new-work.md`, `init.md`, `shape.md`, `document.md`, `extract.md`, `harden.md`, `onboard.md`, `adapt.md`, `optimize.md`, `clarify.md`, `component-review.md`, `live.md`, `live-setup.md`, `generate.md`, `visualize.md`, `hooks.md`, `operate.md`, `routing.md`, `region-map.md`, `polish.md`, `craft-floor.md`, `craft.md`, `doctor.md`; los agentes `impeccable-finish-reviewer`, `-documenter`, `-asset-producer`; `PRODUCT.md`, `NOTICE.md`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`.
**Leído en parte (lo digo para no vender de más):** `impeccable-manual-edit-applier.md` (los primeros 22 pasos de 103 líneas), `DESIGN.md` del repo (el frontmatter y los títulos y "Named Rules" del cuerpo, no las 534 líneas), `README.md` (cortado a 500 caracteres por línea; la sección de hooks quedó truncada). No leí `skill/reference/degraded/`, ni el código de `skill/scripts/`, ni iOS/Android (fuera de alcance).
**De pignolo-ui (main, 0.6.2):** las tres skills, `reference/*.md`, los dos agentes, `norms/base.md`, `catalog/rules.json` y `symptoms.json`, `templates/DESIGN.md`, cabeceras de `compare.mjs` y `lib/design-extract.mjs`, la spec §0, §4, §5, §6 a §13 y §18 (por secciones, no línea a línea), y del plan 4c las etapas, D-4c-1 a 22 y R-20. `docs/STATE.md` no nombra un "hito 4e"; lo tomo como el nombre que le pone quien encarga esto.

Respuesta corta a la pregunta del autor: **sí hay más para traer, y casi todo es de flujo, no de reglas.** Lo mejor de impeccable fuera del detector son cinco ideas: separar "qué es el producto" de "cómo se ve", guardar el brief de cada pantalla, probar la pantalla con datos feos, variantes de un solo elemento, y un revisor final que primero desconfía de la evidencia. Lo peor (y no se trae): la maquinaria de imágenes generadas, el servidor en vivo, los hooks y el sorteo de "mundos visuales".

## 1. Mapa: flujos y artefactos no cubiertos por la primera pasada

| # | Qué es | Mecanismo (cita, archivo) | Problema del usuario que resuelve |
|---|---|---|---|
| 1 | **`PRODUCT.md`** (comando `init`) | Entrevista corta y un archivo con usuarios, propósito, posicionamiento, contexto de uso, restricciones, compromisos de marca y "evidencia disponible". "`init` captures durable product truth in PRODUCT.md. It does not invent a visual world" (`reference/init.md`). Prohíbe preguntar por estética ahí. | No repetir en cada pedido quién usa esto y para qué; que el diseño no invente clientes, precios ni testimonios ("State absences that future work must not fabricate"). |
| 2 | **Brief por pantalla y "contrato de dirección"** | Un archivo por ruta en `.impeccable/surfaces/` con seis bloques cortos (tesis, mundo, historia, primera vista, forma, cierre). "If a block reads like a mood, the direction is not decided yet" (`reference/new-work.md` §5). El revisor final audita contra ese contrato. | Que lo acordado no se pierda entre sesiones y que haya algo escrito contra qué revisar. |
| 3 | **Disciplina de preguntas** (`shape`) | Dos o tres preguntas por ronda; pide rangos reales de contenido y qué no tocar. "What would make the result feel wrong even if it looked polished?" (`reference/shape.md`). "Never ask for CSS values or canned aesthetic lanes." | Briefs flojos que producen opciones genéricas. |
| 4 | **Modo por pantalla**, no por producto | Cuatro modos (Persuade, Operate, Read, Experience). "A tool's landing page is still Persuade; a fashion house's documentation is still Read" (`SKILL.src.md`). `operate.md` da números para pantallas de trabajo: escala 1,125 a 1,2; transiciones de 150 a 250 ms. | Que la landing de una herramienta no salga apagada como un panel, ni el panel recargado como una landing. |
| 5 | **`harden`**: resistencia a datos reales | Lista de pruebas: texto muy largo y muy corto, vacío, 1000 ítems, errores de red, alemán 30 % más largo, RTL, zoom 200 %. "Designs that only work with perfect data aren't production-ready" (`reference/harden.md`). Todo prosa y recetas CSS; ningún script. | La pantalla se rompe con el primer nombre largo o la primera lista vacía. |
| 6 | **`onboard`**: primera vez y estados vacíos | Cinco tipos de vacío (primer uso, lo borró el usuario, sin resultados, sin permiso, error) y qué lleva cada uno: qué va a haber, por qué importa, cómo empezar (`reference/onboard.md`). | Listas vacías que dicen "no hay nada". |
| 7 | **`clarify`**: textos de interfaz | "An actionable error answers: what failed; why, when known and useful; how to recover" y nombrar la acción en el botón "instead of using `Yes`, `No`, `OK`, or `Submit`" (`reference/clarify.md`). Pide permiso antes de cambiar afirmaciones de hecho. | Botones y errores que no dicen qué pasa. |
| 8 | **`adapt`**: otro tamaño o dispositivo | "Adaptation is rethinking the experience for the new context, not scaling pixels"; "Hide core functionality on mobile" está en su lista de nunca (`reference/adapt.md`). Suma `@media (pointer: coarse)`, `hover`, áreas seguras. | El celular como "escritorio achicado" o con funciones que desaparecen. |
| 9 | **`optimize`**: rendimiento | Medir antes y después (LCP, INP, CLS), imágenes, fuentes, bundle (`reference/optimize.md`). Prosa. | Pantalla lenta. |
| 10 | **`document` y el agente documentador** | Extrae `DESIGN.md` del código en orden de fuentes (variables CSS, Tailwind, tema en JS, tokens, componentes, página renderizada) y lo escribe **después** de construir: "a rulebook written before the build gets defended against reality instead of describing it" (`agents/impeccable-documenter.md`). Modo semilla para proyectos vacíos. | Tener `DESIGN.md` en un proyecto que ya existe, sin inventar tokens. |
| 11 | **`extract`**: consolidar | "only extract things used 3+ times with the same intent. Premature abstraction is worse than duplication" (`reference/extract.md`). | Valores sueltos repetidos que deberían ser un token. |
| 12 | **`live` y `generate`**: variantes de UN elemento en el navegador | Se inyecta un script en la app en desarrollo; el usuario marca un elemento y el agente escribe 3 variantes que se cambian en caliente. Primero fija la identidad en una frase con valores reales y después "Three variants, three DIFFERENT axes: the same brand at three angles" (`reference/live.md` §4). Perillas (0 a 4 por variante) y "carbonizar" lo aceptado al código. `generate` lo dispara con una frase: "the user names an element, a direction, and a count" (`reference/generate.md`). | Probar alternativas de un botón o una tarjeta sin rehacer la pantalla. |
| 13 | **Revisor final (`finish-reviewer`)** | Agente sin navegador ni historial del constructor. Paso 0: ¿la evidencia sirve? "a verdict derived from a broken capture launders the breakage into an approval". Cuatro palabras de veredicto (recapture, rebuild, fix, ship), tope de 8 arreglos y una línea `keep` con lo que no hay que diluir. Segunda pasada solo puntúa cada arreglo "resolved, partial, or unresolved" (`agents/impeccable-finish-reviewer.md`). | Que el que construyó no se apruebe solo, y que "listo" signifique algo. |
| 14 | **Validez de capturas** | "A capture is evidence only when it is valid, and you validate before you send": sin zonas negras o vacías, desde el tope, animaciones de entrada asentadas (`reference/new-work.md` §7). Además suma el ancho real del usuario: "the width that breaks is the one the user sees first". | Auditar una captura a medio cargar y "arreglar" algo que no estaba roto. |
| 15 | **Hooks** | `PostToolUse` sobre `Edit\|Write` corre el detector en cada edición; solo lo mecánico interrumpe y el resto va a una pasada en `Stop` (`reference/hooks.md`, `plugin/hooks/hooks.json`). Excepciones lo más angostas posible, con motivo y quién decidió: "Never add an ignore to skip a fix". | Enterarse del defecto al escribirlo, no al final. |
| 16 | **`doctor`** | Informe de desajustes entre los archivos del proyecto y lo que la versión instalada lee. Separa versión, esquema y verdad: "A commit count is not a contradiction" (`reference/doctor.md`). "Never repair drift as a side effect of a design task" (`SKILL.src.md`). | Archivos viejos que siguen dirigiendo el resultado sin que nadie lo note. |
| 17 | **Menú sin argumento (`routing`)** | Un script devuelve señales del proyecto y la skill sugiere 2 o 3 comandos: "Never auto-run a command; the recommendation is a suggestion the user confirms" (`reference/routing.md`). | No saber qué comando toca. |
| 18 | **Sorteo de direcciones (`concept-seed`)** | Siete candidatos ordenados y un script que sortea cuál se muestra, "breaking the ranking rut while the user keeps a real choice"; siempre queda la "salida estándar" de la categoría, "the user's door, never yours" (`reference/new-work.md` §3). | Que todas las corridas caigan en la misma idea. |
| 19 | **Construcción guiada por imagen** (`visualize`, `region-map`, `component-review`) | Imagen generada del diseño, mapa de regiones medido, recursos regenerados, y una compuerta numérica de parecido (72 %) (`reference/new-work.md` §6, `reference/visualize.md`). Revisión humana con recibo: "Never submit the page or write a receipt on the user's behalf" (`reference/component-review.md`). | Composiciones más audaces que las que salen escribiendo código directo. |
| 20 | **Verdad contra demostración** | "Truth binds claims, not demonstrations": el contenido de muestra se escribe completo y rotulado como sintético; lo que no se inventa son precios, clientes, cifras (`reference/new-work.md` §3). | Mockups vacíos que no se pueden juzgar, sin caer en inventar hechos. |
| 21 | **`polish`**: clasificar el desvío antes de arreglar | Cuatro causas: falta el token, implementación suelta, desajuste de concepto, defecto local; orden de arreglo: tarea rota, estados, sistema, estética, limpieza (`reference/polish.md`). Reusa la última crítica mientras el archivo no cambió (huella del contenido). | Arreglar el síntoma y no la causa; pagar dos veces la misma auditoría. |
| 22 | **Empaquetado para Claude Code** | `plugin.json` con una sola skill; tres hooks protegidos con `[ ! -f … ] \|\|`; agentes con `effort` y `max-turns`; un lanzador que baja un binario la primera vez (`SKILL.src.md` Setup; `plugin/`). Bloques `<claude>`, `<codex>`, `<gemini>` con manías medidas por modelo. | Distribución a muchos arneses. |

## 2. Qué hace hoy pignolo-ui y cómo sería la versión propia

"Script" es lo que se puede medir o impedir sin modelo; "prosa" es lo que queda como texto para el agente.

**1. Contexto de producto.** *Hoy: a medias.* El brief de `new` pide qué es, quién la usa y la acción principal (`skills/new/SKILL.md` paso 3), pero se arma de nuevo en cada corrida y no hay nada en `run.mjs` que lo guarde; `improve` no tiene brief; el auditor recibe solo la carpeta del run y nunca sabe para quién es la pantalla. `DESIGN.md` guarda `register` y `platform`, nada más.
*Versión propia:* un `PRODUCT.md` corto en la raíz, al lado de `DESIGN.md`, con secciones cerradas: Usuarios y situación, Para qué sirve, Tareas principales, Voz (tres palabras), Contenido real disponible (y qué no existe todavía), Anti-referencias confirmadas por el usuario. Se crea la primera vez con una ronda de hasta tres preguntas y se muestra como diff, igual que `DESIGN.md`.
- Script: `product-md.mjs validate` (secciones presentes, tope de 60 líneas, sin datos personales con el mismo chequeo de fuga, "sin decidir" explícito donde falte); `run.mjs` lo copia al run para que entre en el brief de `ui-option` y en `norms.md` del auditor; un test fija que el brief lo incluya.
- Prosa: las preguntas; cómo usa el auditor ese contexto para decidir si un J-nn aplica.
- Encaje fino: "Contenido real disponible" es la misma lista que hoy alimenta los marcadores `‹…›` y CONTENT-01.

**2. Brief guardado.** *Hoy: no.* La elección queda sellada en `design/approved/<flow>` con cita y sha256, pero el brief que la originó no viaja con ella.
*Versión propia:* `brief.md` dentro de la carpeta aprobada, con dos campos tomados de la idea del contrato: "primera vista" (qué se ve sin desplazar y dónde está la acción principal) y "qué no se toca".
- Script: `approve.mjs save` exige el archivo y sus campos; un chequeo de navegador nuevo: el elemento `data-primary` cae dentro de la primera vista en cada ancho medido.
- Prosa: nada más. No se traen "tesis", "mundo" ni "historia": son gusto con nombre de contrato.

**3. Preguntas del brief.** *Hoy: a medias.* *Versión propia:* tres campos más en el brief: rangos de contenido (mínimo, típico, máximo), estados que importan, y "qué haría que quede mal aunque se vea prolijo". Script: presencia de los campos. Prosa: el resto.

**4. Registro por pantalla.** *Hoy: por proyecto* (`pignolo.register`, spec §4.3). Una landing dentro de una app de producto recibe contención. *Versión propia:* el brief puede declarar `register` para ese flujo; `DESIGN.md` no cambia. Script: `options.md` ya ramifica los ejes por registro. **Importa para la primera pasada:** TYPE-02 proponía una razón mínima de 1,25 entre título y cuerpo, y `reference/operate.md` dice que en pantallas de trabajo lo normal es 1,125 a 1,2; el umbral tiene que depender del registro o va a marcar tableros sanos.

**5. Prueba de estrés ("harden").** *Hoy: poco.* LAYOUT-11 mide desborde a 320 px con el contenido que haya; los estados vacío, cargando y error quedan "no verificado" (spec §11.2, A-18).
*Versión propia:* un paso `browser.mjs stress` que, **solo en la página abierta en el navegador y sin tocar archivos**, alarga los textos de títulos, botones, rótulos y celdas (×3 y +35 %), vacía listas y tablas, sube el texto al 200 %, y vuelve a correr el chequeo de desborde. Hallazgos nuevos (ids provisorios): STRESS-01 texto largo desborda o tapa, STRESS-02 lista vacía deja un hueco sin mensaje, STRESS-03 se rompe con texto al 200 %. Estático: STRESS-04, ancho fijo en px sobre un control con texto.
- Script: todo lo anterior, con fixtures. Es justo lo que impeccable deja en prosa.
- Prosa: una línea en `ui-option` (el contenido de muestra incluye el caso largo que diga el brief) y un síntoma nuevo en `improve`: "se rompe con datos reales". RTL e idiomas: fuera de la v1 (`web.locales` está reservada en el esquema).

**6. Estados vacíos.** *Hoy: no.* *Versión propia:* si el brief declara `estados: vacío`, `ui-option` escribe una pantalla más (`<pantalla>-vacio.html`) con las tres partes (qué va a haber, por qué, cómo empezar). Script: `options-check` exige el archivo cuando el brief lo pide. Lo demás de `onboard` (tours, tooltips, librerías, métricas de abandono) no entra: es estrategia de producto y trae dependencias.

**7. Claridad de textos.** *Hoy: COPY-01 (relleno de marketing), J-07 y J-10.* *Versión propia:* (a) regla COPY-02, rótulo genérico en un botón (Aceptar, Enviar, OK, Sí/No, Submit) con severidad `detalle` y "intencional" permitido; (b) en `improve`, un eje "solo textos": las versiones cambian palabras y nada más.
- Script: COPY-02 por lista; para el eje, `compare.mjs` ya saca huellas de estructura, así que puede comprobar que la estructura es idéntica y solo cambió el texto.
- Prosa: las tres partes de un error; no cambiar afirmaciones de hecho sin preguntar.

**8. Adaptación a otros anchos.** *Hoy: bastante.* Se mide a varios anchos y se guarda un DOM por ancho (`reference/prepare-run.md`); LAYOUT-10 y 11. *Versión propia:* RESP-01, "algo que se puede usar en escritorio no está en celular": comparar los elementos interactivos visibles entre el DOM más ancho y el más angosto. Script: sí, con los archivos que ya existen. Prosa: síntoma nuevo "en el celular falta algo". Sumar el ancho real del usuario como ancho extra opcional.

**9. Rendimiento.** *Hoy: no, y la spec lo deja fuera* (§18: LCP/INP). Sin versión propia en la v1.

**10. `DESIGN.md` desde un proyecto existente.** *Hoy: sí, y mejor resuelto.* `design-md.mjs extract` lee la configuración que existe y, si no hay, cuenta frecuencias y marca "extraídos, no decididos" (`lib/design-extract.mjs`); impeccable lo hace con el modelo. Brecha chica: cuando los tokens viven donde el script no lee (CSS-in-JS), hoy no propone nada; se podría leer de la página renderizada (`browser.json`). Script: sí. v1.x. La regla del documentador ("no registrar un valor para que un hallazgo desaparezca") ya la cumple la lista `extracted`.

**11. Consolidar valores repetidos.** *Hoy: COLOR-02, LAYOUT-04 y DEPTH-01 marcan literales, sin decir qué hacer.* *Versión propia:* cada hallazgo dice si **ya hay un token cercano** ("usar `{colors.x}`") o **falta el token** (el literal aparece 3 veces o más). Script: distancia de color en OKLCH y conteo; no encontré en `lib/rules/` nada que hoy sugiera el token más cercano. Es la idea 21 aplicada a la 11. Sin refactor de componentes.

**12. Opciones para UN elemento.** *Hoy: no dentro del sistema.* El plan 4c lo prevé solo como exploración ciega **fuera** del sistema (R-20, etapa 4). *Versión propia, sin servidor ni inyección:* `improve` acepta un elemento (selector o descripción).
- Script: `browser.mjs element` saca del DOM ya capturado el elemento, sus estilos calculados, el ancho y el fondo del contenedor; si el selector da varios, lista los candidatos y frena (la idea del veredicto `ambiguous` de `reference/generate.md`). Arma la "frase de identidad" con valores medidos, no con prosa del modelo. Después verifica cada variante: una sola raíz con la misma etiqueta, solo tokens de `DESIGN.md` (reglas que ya existen), y distancia entre variantes con `compare.mjs`.
- Prosa: tres ejes distintos de una lista de seis (jerarquía, disposición, tipografía con las fuentes que hay, qué rol de color manda, densidad, partir o unir).
- No se traen: recarga en caliente, bucle de espera, parches de CSP, perillas, "carbonizar", edición de textos en la página.

**13 y 14. Revisor final y validez de capturas.** *Hoy: lo central ya está.* El auditor es un agente aparte que recibe solo una ruta; el veredicto lo imprime un script; nunca hay nota. Cuatro brechas chicas:
- **Captura inválida.** Script `captures-check`: imagen casi de un solo color, tamaño que no coincide con el ancho pedido, página sin terminar de cargar → "no verificado: captura inválida", nunca un hallazgo. No encontré ningún chequeo así en `browser.mjs` ni `lib/browser-run.mjs`.
- **Pase de veredicto.** En `improve`, los hallazgos de script se cierran solos con la segunda lectura; los de juicio (J-nn) que el usuario eligió no los vuelve a mirar nadie (el paso 7 no lanza al auditor). Versión propia: una segunda pasada del auditor que **solo** puntúa esos J-nn (resuelto, parcial, sin resolver) sin buscar nada nuevo. Script: valida que la salida solo nombre los ids recibidos.
- **Línea `keep`.** El auditor nombra una cosa que funciona y no hay que perder; entra al brief de las versiones de `improve`. Script: campo opcional validado. Prosa: una línea.
- **Evidencia del usuario reabre.** Si después de "terminado" el usuario muestra una captura que lo contradice, corre una auditoría nueva; nunca un parche a mano con autoaprobación. Prosa, una línea en las skills.

**15. Hooks.** *Hoy: prohibidos por diseño* (spec §0: "sin hooks"; el linter del plugin lo verifica). *Versión propia en la v1: ninguna.* La idea que sí sirve es la excepción angosta: hoy `intentional` vale para todo el proyecto y D-4c-18 dejó fuera las excepciones por elemento; v1.x podría sumar alcance por archivo, con motivo y quién decidió.

**16. `doctor`.** *Hoy: partes sueltas* (`design-md.mjs validate`, DRIFT-01, `approve.mjs verify`). *Versión propia:* `run.mjs doctor`, solo lectura: esquema de `DESIGN.md`, sha de cada aprobado, patrones de rechazo válidos, cuántos tokens siguen "extraídos, no decididos", aprobados cuya pantalla ya no existe. Todo script. v1.x.

**17. Menú.** Tres comandos no necesitan menú. No adoptar.

**18. Sorteo.** *Hoy: ejes fijos A, B, C y diversidad medida.* *Versión propia mínima:* en el modo explorar (etapa 4, ids E1 a E6), que un script elija qué direcciones salen, con semilla anotada en el run, para que dos corridas no repitan. Script: sí. v1.x, después de medir si de verdad se repiten.

**19. Construcción por imagen.** No adoptar (sección 3). Lo único rescatable ya existe: aprobación con cita literal del turno del usuario.

**20. Datos de muestra.** *Hoy: lo contrario.* Todo lo que el brief no da es un marcador `‹…›` (`agents/ui-option.md`, regla 1). Eso protege de inventos pero deja mockups con huecos, más difíciles de juzgar a ojo. *Versión propia posible:* permitir filas y textos de muestra escritos, siempre con `data-sample`, y mantener prohibidos los hechos (precios, clientes, cifras, testimonios, personas). Script: CONTENT-01 ya bloquea todo `data-sample` al pasar a código; se suma una lista "qué reemplazar" al aplicar. **Cambia un contrato: decide el autor, y solo después de medir.**

**21. Reusar la última auditoría.** *Hoy: `improve` siempre vuelve a auditar.* *Versión propia:* si hay un run de `audit` de la misma pantalla y el sha de sus archivos y de `DESIGN.md` no cambió, se reusa. Script puro; ahorra una corrida de opus por vez.

**22. Empaquetado.** Nada que copiar: binario descargado, hooks y 20 arneses van en contra de la spec. Dos detalles: (a) el aviso de presupuesto de lectura del revisor ("by roughly the tenth turn stop reading and write") sirve como una línea para `ui-auditor`, que también puede cortarse antes de escribir el JSON; (b) `max-turns` en el frontmatter: **no verifiqué** que Claude Code lo respete en agentes de plugin.

## 3. Valor, costo, riesgo y ranking

Costo: bajo = prosa o un campo; medio = script con fixtures; alto = flujo nuevo.

| # | Ítem | Valor | Costo | Riesgo |
|---|---|---|---|---|
| 1+2+3 | `PRODUCT.md` y brief guardado | Alto: alimenta a `ui-option` y le da al auditor con qué decidir si un criterio aplica | Medio | Un archivo más para mantener; que se llene de adjetivos |
| 5 | Prueba de estrés por script | Alto: defectos reales que hoy nadie mira | Medio | Falsos positivos al alargar textos que nunca crecen |
| 12 | Opciones de un elemento | Alto: lo pidió el autor | Alto | Selector ambiguo; variantes que no encajan en el contexto |
| 13+14 | Capturas válidas, veredicto acotado, `keep` | Medio-alto | Medio | La segunda pasada suma una corrida de opus |
| 8 | RESP-01 | Medio | Bajo | Menús colapsados cuentan como "falta" si no se detecta el botón que los abre |
| 4 | Registro por pantalla | Medio | Bajo | Ninguno serio |
| 7 | COPY-02 y eje "solo textos" | Medio | Bajo-medio | Lista de palabras por idioma |
| 11+21 | "Usar token" o "falta token"; reusar auditoría | Medio | Bajo-medio | Umbral de cercanía de color |
| 20 | Datos de muestra rotulados | Medio, incierto | Bajo en código | Afloja la regla de no inventar |
| 6 | Pantalla de estado vacío | Medio | Bajo | Más tokens por opción |
| 16, 18, 10 | `doctor`, sorteo, extraer del render | Bajo-medio | Medio | — |
| 15 | Hooks | Medio | Alto | Rompe "sin hooks"; interrumpe al usuario |
| 9, 17, 19, 22 | Rendimiento, menú, imagen, empaquetado | Bajo o negativo | Alto | Dependencias y costo |

**Top 5 para adoptar ahora** (en este orden):
1. **Contexto de producto y brief guardado** (ítems 1, 2 y 3). Es la pieza que le falta al auditor y lo más barato de sostener.
2. **Prueba de estrés por script** (ítem 5). Determinista, sin modelo.
3. **Opciones de un elemento dentro del sistema** (ítem 12), reusando la infraestructura de la etapa 4.
4. **Capturas válidas, pase de veredicto acotado y línea `keep`** (ítems 13 y 14).
5. **RESP-01 y registro por pantalla** (ítems 8 y 4), con el umbral de TYPE-02 atado al registro.

**Para v1.x:** COPY-02 y eje de textos; "usar token / falta token"; reusar auditoría; pantalla de estado vacío; `doctor`; sorteo con semilla; extraer del render; excepciones por archivo; datos de muestra rotulados (si el A/B lo respalda).

**No adoptar, y por qué:**
- **Construcción por imagen, regiones, recursos y compuerta del 72 %.** Necesita generación de imágenes y su binario; ellos mismos lo llaman "a frontier-tier job" (`reference/new-work.md` §6). Tamaño, costo y dependencia.
- **Modo `live`.** Servidor local, inyección en la app, parches de CSP y un bucle de espera de 10 minutos. 36 KB de protocolo. Contra "lo más simple" y contra "sin nada remoto en ejecución".
- **Hooks en la v1.** La spec los excluye a propósito.
- **Sorteo de "mundos", retadores, veredictos y donaciones** (`new-work.md` §3). Ceremonia de gusto; además empuja a salirse del sistema, y en pignolo eso solo pasa en el modo explorar.
- **Listas de gusto como ley:** las 16 fuentes "que significan que dejaste de buscar", la calibración contra crema y serif, la "Creative North Star" y las "Named Rules" de `document.md`. Pelean con cualquier `DESIGN.md` que las elija.
- **El revisor que "calibra contra un director de diseño"** y el tono "zero hedging" de su `PRODUCT.md`: empuja a marcar de más, justo lo que ya falló en `clean-2` y `clean-3`.
- **`onboard` completo, `optimize`, menú y `craft`.** Fuera de alcance o sin problema que resolver.
- **Un archivo de 59 KB.** `new-work.md` mezcla seis flujos; pignolo-ui carga referencias de 3 a 5 KB.

## 4. Cómo se mide cada ítem adoptado

Nada entra sin un test determinista o una medición. Costos estimados con los datos de `RESULTS-ui-hito-4.md` que usó la primera pasada (≈ 0,09 USD por corrida de `ui-option` en sonnet; ≈ 0,29 por corrida del auditor); son estimaciones.

| Ítem | Test determinista | Medición con modelo | Qué juzga el autor a ojo | Costo |
|---|---|---|---|---|
| Contexto y brief | Validador con 6 fixtures; el brief generado incluye el contexto; `approve` rechaza sin `brief.md` | A/B de `ui-option` sobre `MOCKUP_BRIEF`, 3 corridas con contexto y 3 sin; auditor en `clean-2` y `clean-3` con contexto, 5 corridas cada uno (pasa con 4 de 5 sin `alto`) | Orden de preferencia a ciegas | ≈ 3,5 USD; ≈ 0,6 si se junta con la medición E2 de la primera pasada |
| Prueba de estrés | 8 fixtures: título largo que desborda y que no, lista vacía con y sin mensaje, zoom 200 %, ancho fijo; cada uno demostrado en rojo | Ninguna | Una pasada sobre una pantalla real: ¿los hallazgos son reales o ruido? | 0 USD |
| Opciones de un elemento | Selector único, ambiguo y sin resultado; variante con dos raíces; variante con color fuera de tokens | Eval `element-options`: 1 caso, 3 corridas; script cuenta fallas de tokens y distancia entre variantes | ¿Parecen la misma marca? ¿Son tres ideas o una en tres tonos? | ≈ 0,3 USD |
| Capturas válidas | Fixtures: imagen en blanco, negra, ancho equivocado, válida | Ninguna | — | 0 USD |
| Pase de veredicto | La salida solo nombra ids recibidos | 2 casos (defecto arreglado y sin arreglar) × 3 corridas: tiene que decir "resuelto" y "sin resolver" | — | ≈ 1,7 USD |
| Línea `keep` | Campo validado | Sale gratis de las corridas anteriores | ¿Lo nombrado es lo que él conservaría? | 0 USD |
| RESP-01 y registro | Fixtures: enlace oculto en 320, menú colapsado con botón (no es falta); umbral de TYPE-02 por registro | Ninguna | — | 0 USD |
| Datos de muestra (solo A/B) | — | 3 corridas con marcadores y 3 con muestra rotulada; script cuenta `data-sample` y busca hechos inventados | ¿Cuál se juzga mejor? | ≈ 0,6 USD |

Total estimado: **≈ 6 USD** (≈ 3 si se comparte con las evals ya previstas). Va a `docs/benchmarks.md` con costo, velocidad y calidad.

## 5. Licencia

- impeccable es **Apache-2.0** (`LICENSE`; `package.json` línea 20). Si se redistribuye texto o código suyo, o algo derivado, hay que: incluir una copia de la licencia; marcar en cada archivo modificado que se cambió; conservar los avisos de copyright, patentes, marcas y atribución; y, si la obra trae un archivo de avisos, reproducir los que correspondan a lo usado. El nombre "Impeccable" no se puede usar como marca propia.
- Su `NOTICE.md` solo declara que `ios.md` y `android.md` derivan de `ehmo/platform-design-skills` (MIT). Como lo nativo queda fuera, ese aviso no alcanzaría a nada de lo propuesto. **No verifiqué** si un `NOTICE.md` cuenta como el archivo "NOTICE" que nombra la licencia; lo prudente es tratarlo como tal.
- pignolo es MIT. Meter archivos Apache-2.0 es legal, pero el repo pasa a tener dos licencias y avisos por archivo.
- **Práctica recomendada: no copiar texto ni código.** Todo lo de este informe son ideas (separar producto de diseño, estresar con datos feos, puntuar arreglos), y las ideas no tienen copyright. Se escriben con palabras propias, en el estilo de pignolo, y se suma una línea a `plugins/pignolo-ui/CREDITS.md`: repo, licencia, commit `4adabaf`, fecha, y qué ideas se tomaron. Los títulos de sección de `PRODUCT.md` no se copian: se usan los propios.
- Usar el nombre de archivo `PRODUCT.md` no es copiar; conviene un lector tolerante (ignora secciones que no conoce), así un proyecto que ya lo tenga no rompe nada.

## 6. Decisiones del autor, dónde cae cada cosa y tamaño

| Id | Decisión | Recomendación |
|---|---|---|
| D-IM-1 | ¿Un archivo nuevo de contexto de producto, y con qué nombre? (alcance y contrato) | Sí: `PRODUCT.md` en la raíz, opcional, tope de 60 líneas, secciones propias. Si falta, el flujo sigue y lo dice |
| D-IM-2 | ¿El brief se guarda dentro de lo aprobado? (contrato de `design/approved/`) | Sí, `brief.md` con "primera vista" y "qué no se toca" |
| D-IM-3 | ¿La prueba de estrés entra a la v1, y con qué severidad? | Sí; `alto`, fuera del piso, sin "intencional" para el desborde y con "intencional" para el ancho fijo |
| D-IM-4 | ¿Opciones de un elemento dentro del sistema? (alcance) | Sí, dentro de `improve`, sin servidor ni inyección |
| D-IM-5 | ¿Segunda pasada del auditor para puntuar los J-nn elegidos? (costo: ≈ 0,3 USD por corrida de `improve`) | Sí, solo cuando el usuario eligió al menos un J-nn; si no, no corre |
| D-IM-6 | ¿Registro por pantalla en el brief? (contrato) | Sí; `DESIGN.md` sigue siendo el valor por defecto |
| D-IM-7 | ¿Datos de muestra escritos y rotulados, en vez de solo marcadores? (contrato) | No decidir todavía: correr el A/B (≈ 0,6 USD) y decidir con el resultado |
| D-IM-8 | ¿Hooks? | No en la v1. Revisar en v1.x como opción que el usuario activa |
| D-IM-9 | Presupuesto de medición (≈ 6 USD) | Aprobar, juntándolo con las evals pendientes de `ui-option` |
| D-IM-10 | Crédito y licencia (tema legal) | Palabras propias, cero texto copiado, una línea en `CREDITS.md` |
| D-IM-11 | ¿Dónde cae cada cosa? | Ver tabla de abajo |

| Ítem | Dónde | Tamaño estimado |
|---|---|---|
| RESP-01, registro por pantalla y umbral de TYPE-02 por registro | Hito 4e "oficio y chequeos", junto a las reglas de la primera pasada | 2 tareas, ≈ 8 tests |
| Capturas válidas, línea `keep`, "la evidencia del usuario reabre" | Hito 4e | 2 tareas, ≈ 8 tests |
| Prueba de estrés (STRESS-01 a 04) | Hito 4e si entra; si hay que recortar, hito propio enseguida después | 2 tareas, ≈ 12 tests |
| `PRODUCT.md` y `brief.md` | Hito propio corto, antes o junto con la etapa 2 del lienzo (toca `approve.mjs` y los textos de las tres skills) | 3 tareas, ≈ 14 tests, más la medición |
| Pase de veredicto | Con el hito del contexto (cambia el contrato del auditor una sola vez) | 1 tarea, ≈ 4 tests, más eval |
| Opciones de un elemento | Después de la etapa 4 del lienzo (reusa sus ids, el prefijo de carpetas y `compare-html`) | 4 tareas, ≈ 20 tests, más eval |
| COPY-02, eje de textos, "usar token / falta token", reusar auditoría, estado vacío, `doctor`, sorteo, extraer del render, excepciones por archivo | v1.x | — |

Total para "ahora" (los cinco primeros): unas 14 tareas y 66 tests, en sonnet, con una revisión opus por hito. Recorte mínimo con más valor: contexto y brief, capturas válidas y RESP-01 (≈ 6 tareas, 26 tests).

Riesgo de plan: el hito 4c ya suma ≈ 381 tests en cuatro etapas. Con "uno o dos frentes a la vez", lo de arriba no debería abrirse en paralelo con las etapas 1 y 2 del lienzo, salvo el hito 4e.
