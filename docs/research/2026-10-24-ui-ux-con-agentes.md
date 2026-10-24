# Investigación: cómo lograr una buena primera versión de UI de app con un agente

Fecha: 2026-10-24
Pregunta: qué hacen los plugins y skills más usados para mejorar la UI/UX que genera un agente, qué evidencia medida hay, cómo se diseñaban las interfaces antes de la IA y qué de eso se puede traer a la velocidad de un agente. Foco: apps (paneles, formularios, tablas, navegación), no landings.

Credibilidad: **alta** (fuente primaria o confirmada por otra independiente, vigente), **media** (fuente secundaria seria o algo vieja), **baja** (sin fuente clara, interesada o sin confirmar). Anotá el criterio usado.
Tipo: **dato** (se puede comprobar), **opinión** (juicio de alguien), **supuesto** (se asume, no se comprobó).

Método: cuatro agentes de solo lectura (Sonnet, esfuerzo medio) con WebSearch y WebFetch, más lectura local de las skills ya instaladas. Las estrellas de GitHub son de la página del repo; la fecha del último commit no se pudo ver en ningún caso. Lo marcado "no verificado" salió del conocimiento previo del agente y no se abrió.

## Skills, plugins y paquetes de reglas

| Afirmación | Fuente | Credibilidad | Tipo | Fecha |
|---|---|---|---|---|
| `impeccable` tiene 86,2k estrellas, un detector CLI de 62 reglas sin modelo y un hook que lo corre tras cada edición; no tiene specs por componente | github.com/pbakaus/impeccable | media: página del repo y lectura local, estrellas sin fecha de verificación | dato | 2026-10-24 |
| `ui-ux-pro-max-skill` (139,9k estrellas) es una base CSV de estilos, paletas y guías Do/Don't con severidad, consultada por BM25; son reglas de página y estilo, no de componente | github.com/nextlevelbuilder/ui-ux-pro-max-skill | media: README y lectura local | dato | 2026-10-24 |
| `Hallmark` (31,9k) corre un linter en 8 anchos en un navegador real, con compuertas por nivel; su evaluación propia da 0 fallos con el pack completo y 96 y 30 con solo la base | github.com/Nutlope/hallmark (carpeta `eval/`) | baja: autoevaluación contra su propio linter, sin juez publicado | dato | 2026-07-23 |
| `frontend-design` de Anthropic (SKILL.md de 9,4 KB) planifica tokens y un boceto ASCII antes de codificar y revisa contra lo genérico; sin evidencia publicada | lectura local del plugin; claude.com/blog/improving-frontend-design-through-skills | media: es del proveedor y no tiene método ni cifras | opinión | 2025-11-12 |
| `emil-design-eng` es concreto en animación y microinteracciones, no en layout ni jerarquía | lectura local | media | dato | 2026-10-24 |
| Ninguna skill popular define specs por elemento (por ejemplo card con acciones: máximo de líneas, ubicación de acciones) | los cuatro anteriores | media: ausencia en lo leído, no revisé todo el catálogo | dato | 2026-10-24 |
| No existe un A/B ciego independiente de estas skills; solo autoclaims, comparaciones de una tarea en blogs y la evaluación de Hallmark | búsqueda sin resultados | media: ausencia de evidencia en una búsqueda acotada | dato | 2026-10-24 |
| Los prompts de v0, Lovable y otros se apoyan en shadcn/ui y Tailwind; no se leyeron sus reglas de diseño | simonwillison.net/2024/Nov/25/leaked-system-prompts-from-vercel-v0 | media | dato | 2024-11-25 |
| `DESIGN.md` de Google Stitch es un formato casi estándar: tokens en YAML, secciones fijas (Colors, Typography, Components, Do's and Don'ts) y un linter de contraste | github.com/google-labs-code/design.md | media: guías de terceros, sin cifras | dato | 2026-04 |

## Evidencia medida

| Afirmación | Fuente | Credibilidad | Tipo | Fecha |
|---|---|---|---|---|
| Una rúbrica específica de la consulta gana 17 puntos de victorias frente a una genérica; iterar suma 14 y una representación estructurada, 4; con usuarios reales la ventaja se reduce (50,8 % contra 41,1 %) | arxiv.org/abs/2508.19227 | media: resumen y HTML, juez LLM con 69 % de acuerdo con humanos, solo HTML/JS | dato | 2025-08 |
| Con 3.059 críticas de diseñadores como ejemplos, los LLM mejoran 55 % su crítica de UIs, sin igualar a humanos; mide críticas, no UIs generadas, y solo móvil | arxiv.org/abs/2407.08850 (UICrit, UIST 2024) | alta: paper con método | dato | 2024-07 |
| Un bucle de crítica visual mejora hasta 17,8 % en 3 ciclos con costo alto; destilarlo en una pasada recupera ~25 % de la ganancia | arxiv.org/abs/2604.05839 | media: abstract | dato | 2026-04-07 |
| Algunos modelos empeoran al iterar sin ancla visual; conviene acotar las pasadas | arxiv.org/pdf/2602.05998 (VisRefiner) | baja: según reseñas, cifras no leídas | dato | 2026-02 |
| Un juez MLLM con capturas coincide 94,4 % con el ranking de WebDev Arena; sirve para comparar variantes, no como verdad | arxiv.org/abs/2507.04952 (ArtifactsBench) | media: abstract | dato | 2025-07 |
| No se encontró ningún estudio que aísle fichas por componente o tokens en el prompt frente a un prompt general | búsqueda sin resultados | media: ausencia en una búsqueda acotada de 8 consultas | dato | 2026-10-24 |
| El patrón "cargar guía solo cuando hace falta" y la fijación de los diseños "seguros" por el entrenamiento son afirmaciones del proveedor | claude.com/blog/improving-frontend-design-through-skills | media: del proveedor, sin método | opinión | 2025-11-12 |

## Cómo se diseñaban las interfaces antes de la IA

| Afirmación | Fuente | Credibilidad | Tipo | Fecha |
|---|---|---|---|---|
| El diseño pasaba por investigación y trabajo a resolver, flujos y arquitectura, wireframes de baja fidelidad, especificación de estados, mockups y prototipos, sistema de diseño, crítica, evaluación heurística, test de usabilidad, accesibilidad, QA de diseño y A/B | IBM Enterprise Design Thinking; GV Design Sprint; GOV.UK Service Manual | media: fuentes primarias leídas, varias etapas por práctica estándar sin fuente | dato | vigente |
| El Design Sprint de GV son 5 días: mapa, boceto, decisión, prototipo y test con 5 usuarios | mural.co/blog/design-sprint | media: fuente secundaria | dato | 2016 |
| NN/g recomienda 3 a 5 evaluadores independientes de 1 a 2 horas para la evaluación heurística; los porcentajes (35 % por evaluador, 75 % con 5) vienen de resúmenes secundarios | nngroup.com/articles/how-to-conduct-a-heuristic-evaluation | media: artículo leído, cifras de segunda mano | dato | 2023 |
| 5 usuarios encuentran casi tantos problemas como muchos más, y conviene repartirlos en varios estudios chicos; 31 % y 85 % de resúmenes secundarios | nngroup.com/articles/how-many-test-users | media | dato | 2012 |
| GDS pide al menos 5 usuarios por sprint y usó tests "guerrilla" | userresearch.blog.gov.uk (PDF); gds.blog.gov.uk/2012/10/05 | media | dato | 2012-2014 |
| Lean UX cambia entregables por colaboración, design studio con bocetos y críticas, y MVPs que prueban hipótesis | oreilly.com/radar/what-is-lean-ux | media | opinión | vigente |
| No hay comparación directa de qué atrapa más problemas por hora entre heurística y test | búsqueda sin resultados | media | dato | 2026-10-24 |
| Double Diamond, Atlassian, Fluent, HIG, Polaris y Material no se verificaron | informe del agente | baja: de memoria | supuesto | — |

## Conclusión

- **Lo que ya hacen otros** (dato): linters con reglas verificables que corren tras cada edición (`impeccable`, `Hallmark`), un plan de tokens antes de codificar (`frontend-design`), bases de reglas de estilo (`ui-ux-pro-max-skill`).
- **Lo que no hace nadie** (dato): especificaciones numéricas por elemento, y un A/B propio y ciego. Es el hueco que pignolo puede ocupar.
- **Lo que mejor respaldan los estudios** (dato): rúbrica específica de la consulta, crítica con ejemplos y pocas pasadas con criterios fijos.
- **Lo que se hacía antes de la IA** y previene los síntomas del autor (opinión): ficha de pantalla y trabajo del usuario (paneles sin propósito), flujo y arquitectura (sobrecarga), wireframe en grises (jerarquía de acciones), matriz de estados (hover y foco ausentes) y sistema de diseño (controles nativos).
- **Qué se comprime a velocidad de agente** (supuesto): especificar y revisar. No se comprimen la investigación con personas ni el test con usuarios reales.
- **Para decidir qué aplicar, medir** (supuesto): ningún estudio prueba que estas etapas funcionen con agentes; hay que probarlas con las pantallas del autor y su voto a ciegas.
