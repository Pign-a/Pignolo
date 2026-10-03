# Pestaña UI del panel: recomendaciones de haiku contra reglas

Ficha según `docs/protocolo-de-pruebas.md`. **Se escribe antes de correr y no se corrió** (etapa 2 del panel, plan `docs/plans/2026-10-03-panel-pestana-ui.md`). El gasto lo aprueba el autor antes de correr.

## Ficha

1. **Pregunta e hipótesis:** ¿las 3 recomendaciones de haiku son mejores que las de reglas (`rulesFor`)? Hipótesis: a igual entrada, haiku sube la calidad percibida al menos 0,5 puntos (mediana, escala 1 a 5) sin subir el costo por encima de 0,02 USD por consulta ni superar 8 s de pared.
2. **Variable:** quién genera las recomendaciones (reglas contra haiku). Fijo: las entradas, el prompt de `ui-prompt.js` en un commit dado, `maxTokens` 400, la máquina.
3. **Brazos:** A (control) reglas, método vigente de respaldo; B haiku (`$.model.complete` con el prompt real).
4. **Entradas:** 4 resúmenes sintéticos: pocos datos (1 pantalla); con deuda (varias auditorías con hallazgos altos); con producto a medias (secciones opcionales en `undecided`); proyecto grande (12 pantallas). Los resúmenes pasan por `readUiInput` desde árboles sintéticos del repo (partir de `plugins/pignolo-panel/sample/ui/`).
5. **Métricas:** calidad a ciegas (relevancia, accionabilidad, orden, una escala de 1 a 5 cada una; califica el autor o un juez opus que no sabe de qué brazo viene cada conjunto, con nombres neutros y orden mezclado); costo (USD medido por la diferencia de `usage().cost` o por los tokens de la respuesta); tiempo de pared; tasa de salida válida (D-U6) y de caída al respaldo; recomendaciones descartadas por pantalla desconocida.
6. **Repeticiones:** B 3 por entrada (12 corridas, cuestan menos de 300 mil tokens: nivel E3); A es determinista, 1 por entrada.
7. **Regla de decisión:** haiku gana si la mediana de calidad supera a la de reglas en ≥ 0,5 puntos **y** los rangos no se pisan **y** la tasa válida es ≥ 95 % **y** el costo mediano ≤ 0,02 USD. Si los rangos se pisan: "sin diferencia demostrada" y se decide por lo más simple (**reglas**, `uiRecommendations` por defecto en `false` en 0.2.1). Resultados negativos también se publican.
8. **Presupuesto:** ≈ 0,15 USD de haiku (12 corridas) + ≈ 1 a 2 USD del juez opus; **tope 3 USD**; si se agota, se reportan las entradas completas hasta ahí. **El gasto lo aprueba el autor antes de correr.**
9. **Amenazas a la validez:** entradas sintéticas (no un proyecto real), cuatro tareas, juez de la familia del modelo (por eso el autor es el calificador preferido), `usage().cost` puede no ser fino a este costo (ver sondas: no cambió).

## Resultados

Sin correr.

## Sondas de la ejecución (Task 0, 2026-10-03, Claude Code 2.1.288; nivel de evidencia E3 salvo lo marcado)

Hechas con un mod de prueba cargado con `--plugin-dir` y el comando `/pignolo-panel` en modo `-p` (sin tocar el repo).

- **U1 `$.settings.read()`:** devuelve **el objeto de configuración mezclado, sin envoltorio** (`{ permissions, model, enabledPlugins, … }`). `enabledPlugins` es un mapa `"<plugin>@<marketplace>": true|false`; con pignolo-ui instalado figura `"pignolo-ui@pignolo": true`. **`$.command.list()`** devuelve un arreglo de `{ name, description, source }`; los comandos de pignolo-ui figuran con nombre `pignolo-ui:new`, `pignolo-ui:improve`, `pignolo-ui:audit`, `pignolo-ui:define`. La detección (D-U5) usa esas formas y cada lectura va en try/catch.
- **U1b `$.fs.list(ruta)`:** devuelve `[{ name, kind: 'file'|'dir', size, mtimeMs, isLink }]`; **tira (ENOENT) si la carpeta no existe**. `isLink` permite no seguir enlaces. (La etapa 1 no usaba `fs.list`; el plan no lo nombraba y se sumó a la lista permitida.)
- **U2 `claude plugin validate`:** con `model.complete`, `settings.read`, `command.list` y `fs.list` en el código pasa y los imprime en la línea `calls:` (`$.model.complete (via enterUiTab)`); no pide nada. **Restricción del motor:** `$` no puede pasarse a una función de otro archivo (`$ is followed only into a function declared in this same file`), por eso las funciones con `$` (`enterUiTab`, `submitText`, `submitUiRequest`, `uiReader`) viven en `register.js` y los módulos puros reciben lectores y `io` como funciones que cierran sobre `$`. Lo que el plan ubicaba en `ui-recs.js` y `answer.js` (llamadas con `$`) queda así repartido; el test de confianza lo verifica sobre `register.js`.
- **U3 `$.model.complete({ model: 'haiku' })` real:** una llamada de 14 tokens de salida devolvió `{ isAnswered: true, text, usage: { input_tokens, output_tokens, cache_* } }`; **el texto vino envuelto en un bloque de código** (un bloque de código marcado json), por eso el parseo corta a la primera y la última llave. **`$.session.usage().cost.usd` no cambió** (0 antes y 0 después): el costo mostrado es la estimación rotulada "≈ 0,01 USD" mientras la diferencia medida no sea positiva. En `claude plugin test` los métodos se simulan con `on('model.complete', …)` devolviendo `{ value: … }`. Gasto de las sondas: dos llamadas mínimas de haiku (< 0,01 USD) más dos corridas de `claude -p` sin modelo propio del comando; **no probado**: el comportamiento con el modelo bloqueado por la organización y con un mod anterior que niegue `model.complete`.
