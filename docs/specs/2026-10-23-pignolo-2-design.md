# Pignolo 2: diseño

_Borrador para aprobación del autor. 2026-10-23. Reemplaza el diseño de `2026-09-26-pignolo-v1-design.md` y el de pignolo-ui (`2026-09-28-pignolo-ui-v1-design.md`) cuando se apruebe._

## 1. Intención

El autor trabaja con Claude Code y los modelos actuales (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1). Usó pignolo 0.x y lo desactivó: una primera tarea tardó una hora y gastó 583 mil tokens, 87 % en revisión (`docs/STATE.md`, cierre del 2026-10-05), en proyectos y tareas chicas. Volvió a superpowers porque es dinámico, y lo que hacía a mano con él era validar: código, seguridad, buenas prácticas, archivos basura, investigación.

Pignolo 2 es un reemplazo mejorado de superpowers: **seguro y rápido, sin tropiezos**. Una caja de herramientas de skills que el modelo usa con criterio. El usuario no tiene que explicar qué validar ni cuántos agentes lanzar; el plugin lo sabe según el proyecto.

Por qué ahora: los modelos actuales razonan bien solos. La guía oficial de Opus 5 pide sacar los pasos de verificación forzada y el andamiaje anti-pereza, porque sobre-verifican y gastan tokens sin mejorar la calidad (ver §10, fuentes).

## 2. Metas, no-metas, anti-metas

**Metas**
- De una idea a un proyecto con `CLAUDE.md`, `security.md`, `design.md` y un roadmap, en una conversación.
- Planes a medida: completos, por fases, o la interfaz primero.
- Una identidad visual y un catálogo de componentes que las pantallas reutilizan.
- Validación que elige sola los frentes según el proyecto.
- Registro de sesión con puntos abiertos e investigaciones con fuente y credibilidad.
- Lo chico se hace directo, casi sin costo.

**No-metas**
- Guardia, bloqueos, registro de tareas, lotes, auditoría de planes, panel, hooks.
- Duplicar lo nativo de Claude Code (§4).
- Publicar al lienzo o artifact de claude.ai.

**Anti-metas (sería un fracaso aunque funcione)**
- Que una tarea chica tarde más que con superpowers.
- Que "validá" repita el patrón de los 583 mil tokens.
- Que el autor tenga que repetir reglas o explicar qué revisar.

## 3. Principios de diseño

1. **Explicar el porqué, no ordenar.** Las skills dicen para qué sirve cada paso. Los modelos actuales generalizan a partir del motivo.
2. **Ceremonia proporcional al riesgo y a lo irreversible**, no a las líneas de código.
3. **Nada bloquea.** El plugin avisa, propone y deja constancia. Sin hooks, salvo uno solo (decisión del autor, 2026-10-25): un `SessionStart` que solo inyecta un recordatorio de qué skill usar (`plugins/pignolo/hooks/`), porque con las skills solas un agente con un plan ajeno no las invocaba. No bloquea ni escribe nada.
4. **Solo markdown, con una excepción.** Sin scripts propios del plugin, salvo las mediciones de `ui-audit` (§5.4) y el generador del recordatorio de sesión (`hooks/build-context.mjs`, que no corre al usar el plugin), que se conservan porque dan evidencia medida. Cada skill apunta a unas 600 palabras; si no entra, son dos skills.
5. **Cada documento tiene un lector.** `security.md` lo lee `validate`; `design.md` lo leen las pantallas; `CLAUDE.md` se carga solo en cada sesión.
6. **Lo chico en el hilo principal.** Un subagente se lanza solo con una razón nombrable: exploración larga (más de unas 3 lecturas o 10 mil tokens), escritores en paralelo sobre archivos distintos, alivio de contexto, o un verificador independiente en riesgo alto.

## 4. Lo nativo que no se duplica

`/init`, `/code-review` (bugs de corrección), `/security-review` (el diff), `/simplify`, `/verify`, memoria automática, `/recap`, `/goal`. Pignolo los usa donde alcanzan. No cubren base de datos, accesibilidad, código muerto ni archivos basura, dependencias sin uso, documentación desactualizada, tests faltantes ni licencias: ese es el hueco de `validate`.

Una skill de plugin no reemplaza a `/code-review`; convive como `/pignolo:…`. Ninguna skill del plugin se llama `code-review`.

## 5. Las piezas

Cinco skills de usuario más los agentes que usan. Nombres en inglés (convención del repo); mensajes al autor en español.

### 5.1 `start`: de la idea al proyecto
Conversación laxa, no un cuestionario. El agente desarrolla la idea con el usuario, ofrece investigar en internet (buenas prácticas, escalado) y pregunta solo lo que cambia una decisión: si es interno o externo, si se comercializa, escala esperada, infraestructura, sensibilidad de los datos. Entiende el contexto del proyecto.

Siempre deja, con contenido que escala al proyecto (un script interno puede tener un `security.md` de cinco líneas):
- `CLAUDE.md` del proyecto.
- `security.md`: datos, usuarios, superficie, qué se protege. Es la memoria de riesgo que lee `validate`.
- `design.md`: identidad y reglas de interfaz (§5.4). Sin interfaz, tres líneas que lo dicen.
- `roadmap.md`: de las bases a cada feature, MVP y siguientes. Completo en alcance, detallado solo en la fase que viene, con fecha y origen.

**Proyecto que ya existe.** `start` también adopta un repo existente: lee el código y los documentos que haya, escribe a partir de eso los que falten y pregunta solo lo que el repo no responde. Un `DESIGN.md` o `PRODUCT.md` de pignolo-ui se lee y se conserva (en Windows `design.md` y `DESIGN.md` son el mismo archivo; se mantiene el nombre que ya exista). Los `project.md` de pignolo 0.x se ignoran. Ni `work` ni `validate` exigen haber pasado por `start`: si falta `security.md`, `validate` se apoya en la evidencia del repo y ofrece crear uno mínimo.

Después pregunta cómo quiere el plan: punta a punta, por fases, o interfaz primero. En la instalación puede sugerir reglas `deny` nativas de permisos para lo irreversible (borrados masivos, force-push); las aplica el autor, el plugin no bloquea.

### 5.2 `work`: ceremonia proporcional
- **Chico** (bug, script, una frase): directo, un chequeo real que ejercite el cambio, evidencia a la vista. Sin spec ni plan.
- **Feature**: tarjeta breve (archivos, casos de prueba, criterio de "hecho"). Prueba primero solo donde hay un test ejecutable relevante. Un solo ejecutor. Una revisión al final.
- **Grande o riesgo alto**: spec corta que el autor revisa, hitos chicos que se re-planifican con lo aprendido, revisión independiente por hito.
- **Piso fijo, explicado:** si se tocan migraciones, autenticación, secretos o borrado de datos, el nivel nunca es "chico". Todo lo demás lo juzga el modelo.
- Si hay trabajo previo sin guardar, avisa y sugiere un commit antes de un cambio grande. No lo impone.

### 5.3 `validate`: validar sin explicar qué
Se pide con "validá" (o `/pignolo:validate`), o en un hito acordado del roadmap. Nunca por tarea.
1. Lee `security.md`, el diff y la evidencia del repo (esquema y migraciones, dependencias, formularios, autenticación, qué archivos hay).
2. Muestra en una línea qué frentes va a lanzar y por qué ("Detecté Prisma y un formulario público: base de datos, seguridad, limpieza"), con una estimación de costo, y sigue salvo que el usuario ajuste.
3. Lanza un agente por frente, **solo si hay evidencia** del frente en el repo, con tope de agentes. Un diff chico se revisa en el hilo principal, sin subagentes.

| Frente | Qué mira | Modelo sugerido |
|---|---|---|
| Corrección | Bugs del diff (usa `/code-review`) | el de la sesión |
| Seguridad | Autenticación, autorización, secretos, datos personales en logs (usa `/security-review`) | Opus si hay datos sensibles |
| Base de datos | Migraciones, índices, consultas, rendimiento, seguridad por tenant | Sonnet |
| Calidad de código | Funciones sin uso, código inútil, duplicados, dependencias sin uso | Sonnet |
| Limpieza del repo | Capturas de Playwright, trazas, documentos obsoletos, archivos huérfanos | Haiku |
| Pruebas | Tests faltantes, tests tautológicos | Sonnet |
| Documentación | Docs que ya no reflejan el código | Haiku |

La auditoría de interfaz **no** forma parte de `validate` (§5.4).

**Base del diff.** Es el commit validado por última vez, que `validate` anota en una línea del registro de sesión (§5.5); si no hay, el punto de unión con la rama principal; si tampoco, los últimos commits. No es estado del plugin: es una línea en un documento del proyecto, que el autor puede leer y corregir.

### 5.4 `ui`: identidad, componentes, opciones y auditoría
Se parte de lo que ya existe en pignolo-ui (los flujos `define`, `new`, `improve`, `audit`, los agentes `ui-option` y `ui-auditor`, el catálogo de reglas y las mediciones en navegador), unificado con el resto del plugin.

**Fase de identidad (primero, si el proyecto tiene interfaz).** El agente diseña la base visual:
- Paleta de colores, estilo de los elementos (redondeado o recto, referencias que le gusten al usuario), tipografía.
- Reglamento de animaciones según lo que el usuario quiera (sobrio, juguetón, casi nada).
- Elementos base con **todos sus estados**: botones (reposo, hover, activo, foco, deshabilitado, cargando), listas desplegables con sus interacciones, calendario con sus estados, tablas desplegables, etc.
- Navegación: superior clásica, flotante, lateral, colapsable o no.
- Iconos, si los hay: estilo, colores, animaciones, estados.
- El usuario da su gusto con links o capturas de referencia, o el agente propone desde cero y el usuario reacciona; vale cualquiera de las dos.
- Qué elementos se diseñan lo deduce el agente del roadmap (sin calendario en la app, no se diseña un calendario).

**Opciones.** Tres, en archivos HTML separados, solo para piezas grandes: la identidad visual, pantallas completas, nav, modal, sidebar, tabla con datos. Un botón o un título se resuelven sin opciones. Las opciones y su estado de decisión se navegan desde un `index.html` generado (decidido / pendiente).

**Catálogo.** Una carpeta de componentes con sus estados, que las pantallas reutilizan (nunca el calendario o el selector nativo del navegador). Por defecto crece con cada componente que hace falta; en la ruta "interfaz primero" se arma entero a propósito. "Obligatorio" se cumple por convención, porque `design.md` explica el motivo; no se bloquea nada.

**Auditoría (`ui-audit`).** Solo si el usuario pide auditar la interfaz. Reutiliza el auditor, el catálogo de reglas actual y las mediciones por script que pignolo-ui ya hace (decisión del autor: se mantienen tal cual). Para abrir la página usa la herramienta de navegador que haya disponible (Playwright por MCP, el propio código de pignolo-ui, etc.). Los módulos de medición viven aislados en la carpeta de `ui-audit`; el resto del plugin no depende de ellos. No se lanza desde `validate`.

Estructura en el proyecto del usuario (propuesta):
```
design/
  index.html        navegador: decidido / pendiente (datos embebidos, abre con doble clic)
  identity/         paleta, tipografía, formas, animaciones
  components/       un HTML por elemento, con todos sus estados
  options/<pieza>/  a.html b.html c.html
```

### 5.5 `session`: documentar la sesión
Parte de la skill `document-session` actual, recortada. Funciona con repo de GitHub y con un proyecto solo local; no se frena si no hay remoto.
- Un registro por día en `docs/sessions/`: qué se hizo, decisiones, **puntos abiertos** (seguimiento entre sesiones) y comentarios.
- Próximo paso explícito para retomar.
- **Investigaciones** hechas por agentes: quedan en `docs/research/`, cada afirmación con su fuente, su **credibilidad** (alta, media, baja, con el criterio usado) y si es **dato, opinión o supuesto**, más la fecha.
- Mantiene al día `CLAUDE.md` y `roadmap.md` sin reescribirlos enteros: solo lo que cambió.

## 6. Qué se reutiliza del plugin actual y qué se descarta

- **Se rescata:** `ui-option`, `ui-auditor`, el catálogo de reglas (`catalog/`), los módulos de medición del auditor (`browser-*`, `cdp-pipe`, `css-walk`, `color`, `catalog` y lo que necesiten, con sus tests), la skill `document-session`, los créditos (`CREDITS.md`, `LICENSE`). Qué módulos exactos entran lo define el plan tras mirar sus dependencias.
- **Se descarta:** la guardia y todos los hooks, el registro de tareas y de planes, los lotes, las auditorías de plan, los jueces y refutador, el panel (`pignolo-panel`), la publicación al lienzo y sus módulos (`canvas-*`, `leak-*`, `link-guard`, `remote-*`), `init`/`setup` actuales.
- **Archivado:** el plugin actual queda en una etiqueta `legacy` del mismo repo (propuesta: sobre el último commit de `main`; las ramas sin unir 0.25 a 0.27 quedan como ramas).
- El `CLAUDE.md` del repo describe el método liviano actual (ejecutores en serie, revisión opus por hito, etc.) y contradice esta filosofía: se reescribe junto con el plugin.

## 7. Restricciones técnicas del plugin (de la documentación oficial)
- Un `CLAUDE.md` en la raíz del plugin no se carga; las instrucciones van como skills.
- Los subagentes de plugin ignoran `hooks`, `permissionMode` y `mcpServers`.
- `SKILL.md` bajo 500 líneas; el detalle va en archivos aparte que la skill menciona.
- La activación automática de skills no está garantizada: la prueba de activación del plugin anterior dio 2, 1 y 2 de 10 frases por ronda (`tests/evals/RESULTS-activacion.md`). Las piezas caras (`validate`, `session`, `ui`) tienen comando explícito `/pignolo:…`; las descripciones traen frases naturales en español e inglés.
- Cada subagente se lanza con `model` y `effort` explícitos según el rol.

## 8. Decisiones

**Del autor (esta conversación)**
- Reemplazo mejorado de superpowers, sin guardia ni nada que bloquee.
- Siempre `security.md`, `CLAUDE.md` y `design.md`; roadmap completo; plan completo, por fases o interfaz primero.
- `ui audit` solo si se pide; opciones de a tres solo para piezas grandes; fase de identidad previa; opciones en HTML local con navegación (no artifact).
- Referencias del gusto por links o capturas, o propuesta desde cero.
- Reescribir en limpio, con el actual archivado como `legacy`.
- Un solo plugin `pignolo` 1.0.0: `pignolo-ui` y `pignolo-panel` salen del marketplace; la interfaz pasa a `/pignolo:ui`.
- Las mediciones de `ui-audit` y su catálogo de reglas se mantienen como están, con la herramienta de navegador que haya.
- La medición contra superpowers (§9) es condición para publicar la 1.0.0, con el OK del autor para el gasto.

**Del agente (marcadas, el autor puede cambiarlas)**
- Cinco skills con esos nombres; la auditoría de interfaz es `ui-audit`.
- Los frentes de `validate` y los modelos de la tabla; tope de agentes; línea de costo antes de lanzar.
- Piso fijo de riesgo (migraciones, autenticación, secretos, borrados).
- `index.html` con datos embebidos para abrir con doble clic.
- Roadmap completo en alcance pero detallado solo en la fase próxima.
- Sugerencia (no imposición) de reglas `deny` nativas.
- `start` adopta repos existentes; `work` y `validate` no exigen documentos previos (§5.1).
- Base del diff de `validate`: último commit validado anotado en el registro de sesión (§5.3).
- Pignolo 2 reemplaza a superpowers: se usa uno u otro, no los dos activos a la vez (sus skills "obligatorias" compiten por la activación). Las mediciones corren con uno solo activo por brazo.

**Reservadas al autor y todavía abiertas:** cuándo se publica (después de la medición de §9), con su CHANGELOG, y el monto del gasto de esa medición, que se aprueba antes de correrla.

## 9. Cómo se mide
1. **Feature mediana, superpowers contra Pignolo 2**, mismo repo y misma consigna, dos repeticiones por brazo. Se miden tokens, tiempo de pared y calidad a ciegas por un revisor Opus. Regla propuesta: como máximo 1,5 veces los tokens de superpowers y calidad igual o mejor.
2. **Detección de frentes** en tres repos de juguete (una landing con formulario, una app con base de datos y varios usuarios, un script de línea de comandos): decir "validá" sin más contexto. Funciona si elige los frentes escritos de antemano y el script no lanza más de un agente.
3. **Tarea chica** (un bug y un cambio de una frase) en los dos brazos: no debe tardar ni gastar más que con superpowers. Es la anti-meta principal.
4. Siguen `docs/protocolo-de-pruebas.md` y se documentan en `tests/evals/RESULTS-*.md` y `docs/benchmarks.md`. Corren solo con el OK del autor para el gasto, y son condición para publicar la 1.0.0 (decisión del autor). Si se pasa de la regla de tokens, se recorta antes de publicar.

## 10. Fuera de la v1
Panel, hooks, medición de licencias y dependencias, catálogo precargado, soporte de otras herramientas además de Claude Code, y cualquier estado propio del plugin.

## 11. Evidencia y credibilidad

Datos de investigaciones hechas con subagentes el 2026-10-23. Las páginas no fueron releídas por quien escribe este documento.

| Afirmación | Fuente | Credibilidad |
|---|---|---|
| El thinking no se apaga; se regula con effort. Sacar verificación forzada y andamiaje anti-pereza | Documentación oficial: code.claude.com/docs/en/model-config.md y platform.claude.com …/prompting-claude-opus-5.md | Alta, dato |
| Un `CLAUDE.md` en la raíz del plugin no se carga; subagentes de plugin sin hooks | code.claude.com/docs/en/plugins/components.md | Alta, dato |
| Alcance de `/code-review`, `/security-review`, `/simplify`, `/verify`; qué no cubren | code.claude.com/docs/en/code-review-local.md y commands.md | Alta para lo declarado; "no cubre" es inferencia del agente |
| SDD completo es pesado para tareas chicas | Böckeler, martinfowler.com (2025-10) | Alta, opinión con experiencia directa |
| Dar contexto de qué tests correr rinde más que prescribir TDD | arXiv 2603.17973 | Media-baja, preprint de un autor |
| Gentle-ai abandonó su SDD de 9 fases por un flujo proporcional; su capa de revisión concentra los bugs | github.com/Gentleman-Programming/gentle-ai (issue 2471, docs) | Alta como dato del propio proyecto; sin opiniones independientes |
| La velocidad percibida con IA engaña | METR 2025, vía resumen | Media, estudio chico |
