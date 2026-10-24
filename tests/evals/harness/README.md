# Arnés de medición de Pignolo 2

Corre la misma tarea en varios brazos y junta las métricas que pide la ficha `tests/evals/RESULTS-pignolo2.md`. La comparación rigurosa tiene tres brazos (la unidad de análisis es la **tarea** y el prompt es idéntico en los tres):

- **Brazo N:** Claude Code **sin ningún plugin** (el control).
- **Brazo S:** Claude Code con solo el plugin `superpowers`.
- **Brazo P:** Claude Code con solo el plugin Pignolo 2 (`plugins/pignolo`).

Los ids de brazo son libres (`^[A-Z][A-Z0-9]{0,3}$`): las configuraciones y los CSV viejos con `A` y `B` (superpowers y Pignolo 2) siguen funcionando igual.

El arnés es **genérico**: no lleva nombres, código, commits ni rutas de ningún proyecto. Las tareas reales viven en una carpeta privada que se indica en un archivo de configuración fuera de git (`harness.local.json`). Lo único que se versiona de una medición real es `tests/evals/pignolo2-runs.csv` (métricas con ids de tarea genéricos) y, si se quiere, `tests/evals/pignolo2-grades.json` (notas del revisor a ciegas).

Node >= 22, sin dependencias. Necesita `git` y `tar` en el PATH (Windows 10/11 trae `tar`).

## Regla general

Una corrida en la que no se puede confiar se marca **inválida** con su motivo (columnas `invalid` e `invalid_reason` del CSV). Nunca se descarta en silencio ni se cuenta en silencio: `summary` la lista, la deja fuera de las cifras y deja la tarea en `pendiente: <n> corridas inválidas` hasta repetirla (`--note rerun`).

**Una terminación causada por el modelo es un resultado, no una invalidez** (preinscrito en la ficha): una corrida que llega al tope por corrida (`--max-budget-usd`) o se corta por el tiempo máximo mientras el agente seguía trabajando **no es inválida**: cuenta como **no verde** con **costo censurado** y se queda en el análisis. Solo los **fallos de infraestructura** son inválidos, se listan y se repiten (hasta 2 veces por corrida, nunca por un mal resultado). Ver "Cómo termina una corrida".

Motivos de invalidez de infraestructura (se repiten): `crash` (código de salida de caída nativa o muerte por señal que no fue nuestro corte), `no_result` (sin mensaje final y sin corte por tiempo ni por tope), `api_error` (sobrecarga, límite de uso o de tasa, autenticación, red), `execution_error` (`error_during_execution`), `failed_to_start` (el stream no tiene ni el `init`), `corrupt_stream` (más de 3 líneas que no son JSON y sin resultado), `hang` (corte por tiempo después de más de 120 s de silencio), `exit_nonzero` (el resultado dice éxito pero el proceso salió con error). Motivos que **no** se repiten solos (los revisa una persona): `is_error` y `result_not_success` (un resultado de error que el arnés no sabe ubicar), `contaminated`, `own_plugin_not_loaded`, `nm_changed`, `source_nm_changed`, `escaped_cwd`, `no_changes`, `trees_unmeasurable`, `drop_failed` (no se pudo borrar la copia de `node_modules` descartada), `post_run_error` (falló un paso posterior a la corrida; el detalle está en `postRunError` de `metrics.json`). `budget_cap` y `timed_out` ya no son motivos de invalidez: un CSV viejo que los trae en `invalid_reason` se sigue leyendo (siguen inválidos hasta repetirlos).

Después de la corrida paga **nada puede perder `metrics.json`**: cada paso posterior (procesos, manifiestos, árboles, métricas, escapes) está protegido, un fallo se anota en `postRunError` y la corrida queda inválida, pero `metrics.json` se escribe siempre. Si el proceso se corta antes de escribirlo (existe `stream.jsonl` sin `metrics.json`), el ledger la cuenta igual como gastada.

## Cómo termina una corrida

`metrics.json` guarda `termination` y `censored`, y el CSV las columnas `termination` y `censored`. La clasificación sale de los datos de la corrida (`classifyTermination` en `metrics.mjs`, una función pura que prueba una tabla con streams falsos):

| `termination` | Cuándo | ¿Inválida? | `censored` |
|---|---|---|---|
| `ok` | resultado `success` (también si el corte por tiempo llegó después del resultado) | no | `false` |
| `budget_cap` | el mensaje `result` trae un subtipo que contiene `budget` (el tope por corrida) | no, es un resultado | `true` |
| `model_timeout` | corte por el tiempo máximo (`timeoutMs`) y el agente seguía trabajando: sin más de `hangSilenceS` (120 s) de silencio antes del corte, o sin dato de actividad | no, es un resultado | `true` |
| `hang` | corte por tiempo después de más de `hangSilenceS` segundos sin escribir nada | sí (`hang`), se repite | `false` |
| `infra_fault` | cualquier otro fallo: caída nativa (código >= 0xC0000000 en Windows, código negativo o señal que no fue nuestro corte), sin mensaje `result`, error de la API o de la cuenta, `error_during_execution`, no arrancó, stream ilegible, un resultado de error que no se sabe ubicar | sí, con su motivo | `false` |

Una corrida **censurada** (`budget_cap` o `model_timeout`) es **válida** y cuenta como **no verde** aunque los tests ocultos pasen (`accept` igual se corre y su resultado queda en el CSV, para el registro: la columna `censored` es la que manda en el análisis). Su costo es el costo informado, o `perRunCapUsd` cuando falta o es cero (`cost_usd` del CSV; el costo informado original queda en `costReportedUsd` de `metrics.json`). No se le aplica `no_changes` (no terminó su trabajo). La contaminación o un escape la invalidan igual.

**Cómo se mide el silencio.** `runProcess` mira el tamaño de `stream.jsonl` cada `activityPollMs` (500 ms por defecto) y al cortar; `silentTailS` es el tiempo sin bytes nuevos hasta el corte. Un agente que sigue trabajando escribe un mensaje cada pocos segundos; un proceso colgado, nada. Un `stream-json` sin mensajes parciales no escribe mientras una herramienta larga corre (una suite de tests de más de 2 minutos deja silencio): ese caso se clasificaría como `hang` y se repetiría. `hangSilenceS` se puede subir en la configuración si la tarea tiene pasos largos; hay que fijarlo antes de mirar resultados.

**Qué es un error de la API.** El texto de un resultado con `is_error` que nombra sobrecarga (`overloaded`, 529), límite de uso o de tasa (429, `usage limit`, `rate limit`), autenticación (401/403, `authentication`, `/login`, clave inválida), créditos, red (`ECONN*`, `fetch failed`, `network`) o un error 5xx. Es una suposición sobre los textos reales, que solo una corrida real confirma; lo que no coincide queda como `is_error` o `result_not_success` (inválido, listado, **no** se repite solo).

**Un reintento por infraestructura** (`batch --retry-infra`, ver abajo) conserva la misma tarea, brazo y repetición; la cantidad de reintentos de una corrida queda en la columna `note` como `rerun N` (`rerun 1`, `rerun 2`). `row --note rerun` (sin número) sigue siendo la fila corregida a mano. La fila nueva reemplaza a la original en las cifras (las dos siguen en el CSV y las dos gastaron plata).

## Variantes de brazo y pares

Los ids de brazo son una mayúscula y hasta tres mayúsculas o dígitos (`A`, `B`, `AF`, `BF`). La identidad del plugin de un brazo sale de su `pluginName`, no de su id: `AF` y `A` son el mismo plugin. Un brazo puede llevar `promptPrefix` (texto, por defecto vacío): se antepone al prompt de la tarea antes de escribir `prompt.stdin.txt`. El texto vive en la configuración; `metrics.json` lo registra y el CSV lleva solo la columna `prompt_prefix_id` (el id del brazo cuando usó prefijo, vacío si no). Que `claude -p` ejecute un prompt que empieza con `/pignolo:work` como comando de plugin es algo que la primera corrida forzada tiene que confirmar (mirar `ownSkillCalls` y los mensajes de hook).

`pairs` es una lista de `[control, variante]` (por defecto `[["A","B"]]`); `summary` evalúa las reglas **una vez por par**, con el control primero, y rotula cada bloque `[par A contra B]`. Un par sin corridas de la tarea no aparece. El ejemplo trae el par autónomo `A`/`B` y el forzado `AF`/`BF`. El paquete a ciegas mezcla las corridas de **todos** los brazos de una tarea (las etiquetas se barajan entre ellos) y `unblind` las devuelve a brazo y repetición; un brazo que no corrió esa tarea se salta, y `blind --arms A,B` elige cuáles.

## Brazo sin plugin y contrastes

Un brazo puede **omitir** `pluginDir` y `pluginName` (o ponerlos en `null`): es el brazo sin plugin. Los dos van juntos: uno solo de los dos es un error de configuración. En una corrida de ese brazo:

- `claude` se lanza **sin `--plugin-dir`**.
- La activación no aplica: `ownPluginLoaded`, `ownSkillCalls` y `ownHookRan` no se calculan; el CSV trae `activation_via` y `own_hook_ran` en `n/a` y `own_skill_calls` vacío, y `summary` no cuenta al brazo en `activaron el plugin`.
- **Contaminación = cualquier plugin cargado que no sea neutral**: un plugin que aparece en el `init` y no coincide con `neutralPlugins` ni es de `plugins/synced` (el contenido sincronizado de la cuenta) contamina, y también las skills, agentes o comandos de los plugins de los otros brazos. En los brazos con plugin pasa lo mismo con los plugins de **todos** los demás brazos.
- El chequeo previo de `configDir` (sin `CLAUDE.md`, sin plugins instalados, sin hooks...) corre igual.

`contrasts` es la lista de comparaciones que hace el análisis, `{ "control": "N", "test": "S", "label": "..." }` o `["N", "S", "etiqueta"]`; los brazos tienen que existir y ser distintos. El arnés solo las expone: las lee `summary` (campo `contrasts` del JSON, y una línea `contrastes:` en el texto) y el análisis estadístico. Si la configuración no trae `pairs`, los pares de `summary` salen de los contrastes (control primero). Los pares pueden nombrar cualquier brazo, también el que no tiene plugin.

Ejemplo de configuración de tres brazos (rutas de ejemplo; el archivo completo es `harness.example.json`):

```json
{
  "arms": {
    "N": { "pluginName": null, "pluginDir": null },
    "S": { "pluginName": "superpowers", "pluginDir": "/path/to/the/superpowers/plugin" },
    "P": { "pluginName": "pignolo", "pluginDir": "/path/to/the/pignolo/plugin" }
  },
  "contrasts": [
    { "control": "N", "test": "S", "label": "superpowers contra nada" },
    { "control": "N", "test": "P", "label": "pignolo contra nada" },
    { "control": "S", "test": "P", "label": "pignolo contra superpowers" }
  ],
  "tasks": {
    "task-1": { "kind": "medium", "set": "dev" },
    "task-2": { "kind": "medium", "set": "validation" }
  }
}
```

## Tareas de fixture (detección de frentes)

Una tarea de configuración `{ "kind": "fixture", "fixture": "<carpeta de tests/evals/fixtures>", "prompt": "<texto>", "arms": ["B"] }` mide la medición 3 de la ficha. Solo corren los brazos de `arms` (los demás se rechazan con un mensaje claro). No usa la carpeta privada, el repo fuente, `node_modules` ni `copyDirs`:

- `prepare` copia el fixture (archivos planos) a la carpeta de la corrida y sigue la receta de `tests/evals/fixtures/README.md`: `git init` con identidad local, un commit base con archivos sin relación y el `CLAUDE.md` neutral en `main`, y una rama `trabajo` que sale de ahí con el fixture como segundo commit, dejada activa (se fuerza el `git add` para que un `.gitignore` global no descarte `*.log`).
- `run` usa el `prompt` de la configuración (con el `promptPrefix` del brazo, si lo tiene) y guarda el texto final **completo** en `<corrida>/final.txt`. Validar no cambia el código, así que `no_changes` no se aplica.
- `run` guarda además `<corrida>/assistant-text.txt` (en todas las tareas): el texto de **todos** los mensajes del asistente de primer nivel (los de subagentes, con `parent_tool_use_id`, se saltan), en orden, separados por una línea `----- mensaje N -----`. Hace falta porque una skill puede imprimir su línea `Frentes:` en un mensaje **intermedio**, antes de lanzar sus agentes, y no repetirla en el informe final.
- `accept` no copia tests. **Criterio de decisión (decisión del autor, 2026-10-23): los frentes realmente delegados, medidos por los agentes lanzados** (ver el punto siguiente). La línea `Frentes:` pasó a ser una cifra informativa porque el modelo no la imprime de forma confiable (ronda 1 de la detección: 5 de 9 corridas; ronda 2: 3 de 9) y la skill `validate` ya no la pide. Lo que sigue describe cómo `accept` la sigue leyendo, para corridas de versiones de la skill que aún la imprimían: busca la línea `Frentes:` (una línea común al principio de línea) en `assistant-text.txt` y en `final.txt` (el resultado final cuenta como el último mensaje); **gana la última de toda la conversación**. Si falta `assistant-text.txt` (corridas hechas antes de que existiera) lo reconstruye desde `stream.jsonl`, sin volver a correr claude; sin stream cae a `final.txt`. Compara con `tests/evals/fronts-expected.json` (`compare-fronts.js`) y escribe `fronts.json` (`ok`, `reason`, `got`, `expected`, `foundIn` con la fuente y el número de mensaje, `agents`, `agentsMain`). Una línea con formato (`**Frentes:** security`, viñeta, cita) **no se acepta**, pero el motivo dice `línea Frentes con formato (markdown): <línea>` para distinguir un error de formato de una línea ausente (`sin línea de frentes`). Columnas del CSV: `fronts_ok`, `fronts_got` (ids separados por `;`, vacío si no hay), `fronts_message` (número de mensaje, o `final`) y `fronts_reason`; `summary` ya no detalla la línea por corrida: solo imprime la cifra informativa (ver abajo).
- **Criterio principal: frentes delegados.** El modelo a veces describe los frentes en prosa en vez de imprimir la línea `Frentes:`, pero los agentes que lanza muestran la selección. `metrics.json` guarda `agentTypes` (los `subagent_type` de cada `Agent`/`Task` del **hilo principal**, solo nombres; `remetric` los recalcula en corridas viejas) y el CSV `agent_types` (separados por `;`). Para tareas de fixture, `accept` deriva `frontsByAgents`: los ids de los tipos `<pluginName>:review-<id>` con `<id>` en security, database, code, tests, hygiene, docs (el prefijo es el `pluginName` del brazo; otros plugins y otros nombres no cuentan), y `frontsByAgentsOk` contra `fronts-expected.json`; van a `fronts.json` y al CSV (`fronts_by_agents`, `fronts_by_agents_ok`; vacíos si la métrica es vieja: correr `remetric` y después `accept`). **Es la fuente del veredicto de `summary`** (se eligió reutilizar `fronts_by_agents_ok` en vez de agregar una columna `detected_ok`, que habría duplicado el dato y obligado a migrar el CSV): una corrida acierta si `fronts_by_agents_ok` es `true`; `false` es una corrida con frentes distintos y vacío es "sin dato" (métrica vieja: la tarea queda `pendiente` hasta correr `remetric`, `accept` y `row`). `fronts_ok` conserva su significado original: la línea `Frentes:` coincidió con lo esperado. `summary` rotula el acierto como "k/n corridas con los frentes esperados [...] (medido por los agentes lanzados)" y lista, de cada corrida que no acierta, `agentes → [obtenido] esperaba [esperado]`. Las corridas inválidas y los topes de agentes por repo no cambian. La línea se informa aparte y **solo si al menos una corrida la imprimió**, como "línea Frentes (criterio original, ya no decide): k/n corridas con los frentes esperados; la imprimieron p/n". El criterio es posterior a ver las primeras corridas (ver `RESULTS-pignolo2.md`, "Decisión del autor (2026-10-23)").
- `summary` imprime por fixture las corridas con los frentes esperados (`k/n`, por agentes lanzados), el obtenido contra esperado de las que no coinciden, los agentes (total, que incluye los de comandos nativos como pide la ficha, y los lanzados por el hilo principal) y aplica la regla de la ficha: `cli-script` cero agentes en total, `landing-form` como máximo 2 agentes de frente y `app-db` no más de 5. Los agentes "de frente" se toman como los lanzados por el hilo principal: un agente que un comando nativo lance desde el hilo principal no se distingue en el stream, así que es una cota superior. Las corridas inválidas dejan la tarea `pendiente`, como en el resto.

## Estudio B: tareas de revisión con defectos sembrados

Una tarea `{ "kind": "review", "item": "rev-NN", "set": "validation" | "dev" }` mide si un brazo encuentra los defectos que se inyectaron en un commit. No tiene tests ocultos, ni comando de aceptación, ni panel de calidad (tsc, eslint y el resto quedan en blanco).

**Carpeta del ítem:** `<privateRoot>/review/<item>/` con:

| Archivo | Qué es |
|---|---|
| `base.txt` | commit padre (en `sourceRepo`) |
| `change.patch` | diff del padre al árbol con los defectos (LF); se aplica con `git apply` |
| `change.crlf.patch` | el mismo diff para un árbol exportado con CRLF (un `git archive` en Windows puede exportar CRLF); opcional, pero si existe también se hashea |
| `defects.json` | lista (vacía en un control limpio) de `{ id, category, subtype, file, startLine, endLine, description, keywords: [...], catchableByTests, severity }`; los números de línea son los del archivo MUTADO. `subtype` es un dato más: se desglosa en `review_score.json` y no cambia el puntaje |
| `preexisting.json` | opcional: lista de `{ file, startLine, endLine }` con problemas reales que ya estaban en el código y se descuentan de los hallazgos sin coincidencia |

Otros archivos de la carpeta (`notes.md`, `clean.patch`...) son privados y no se leen ni se hashean.

**`prepare`.** Exporta el commit base como una tarea común (CLAUDE.md neutral, enlace a la copia de `node_modules`, `copyDirs`), hace el commit `base` (etiqueta `base`) y aplica el parche con `git apply --index`; lo commitea como `cambios`. `HEAD` es el árbol mutado y `HEAD~1` el base; rama `main`, misma identidad `eval`. Qué parche aplica: se mira si el árbol exportado usa CRLF en el primer archivo que toca el parche; en ese caso se prueba primero `change.crlf.patch` y después `change.patch`, y al revés en un árbol LF; si ninguno aplica, último recurso `--ignore-whitespace`. Cómo aplicó queda en `prepare.json` y `metrics.json` (`patchMode`: `patch`, `crlf.patch` o `<nombre>+ignore-whitespace`) y en la columna `patch_mode` del CSV. Si no aplica ninguno, falla con un mensaje que dice qué se probó y no deja la carpeta.

**El pedido de cada brazo.** Cada brazo puede llevar `reviewPrompt` (texto). En una tarea de revisión el prompt de `prompt.stdin.txt` es el `reviewPrompt` del brazo (con su `promptPrefix`, si lo hay), no un archivo de consigna; un brazo sin `reviewPrompt` se rechaza antes de gastar y `batch` lo avisa en los chequeos previos. El ejemplo trae cuatro brazos: N (pedido llano de revisar el último commit), S (la skill de revisión de superpowers), P (validar el código del último commit) y C (`/code-review HEAD~1..HEAD`, sin plugin). Los textos son marcadores: se fijan antes del congelado.

**Comando nativo.** Si el pedido empieza con un comando sin `plugin:` (como `/code-review`), tiene que figurar en `slash_commands` del `init`; si no, la corrida queda con la advertencia `slash_command_unknown` y es **inválida** (`native_command_missing`). Un comando de plugin (`/pignolo:work`) sigue como siempre (activación por comando).

**Puntaje (`score.mjs`, `run.mjs score --task T --arm X --rep N`).** Determinista, sin modelo, sobre `assistant-text.txt` (el texto de primer nivel; si falta se reconstruye de `stream.jsonl`). `accept` lo corre solo en una tarea de revisión. Un defecto está **ENCONTRADO** si el texto menciona el nombre base de su archivo (sin distinguir mayúsculas; `a.js` no está en `a.jsx` ni en `xa.js`) **y** (a) un número de línea de ese archivo cae en `[startLine - 5, endLine + 5]`, o (b) al menos 2 de sus `keywords` aparecen a menos de 300 caracteres de una mención del archivo. Un número de línea de un archivo es `ruta:12`, `ruta:12-30` (se miran los dos extremos), `ruta#L12`, `ruta (line 12)` / `(lines 12-30)` / `(línea 12)`, con o sin comillas, o `line(s) N` / `línea(s) N` en los 300 caracteres que siguen a la mención. `findings_total` son las referencias `archivo:línea` **distintas** (por nombre base, un rango por su inicio; las menciones libres de "line N" no cuentan acá) y `findings_unmatched` las que no caen a menos de 5 líneas de un defecto del mismo archivo ni dentro de un rango de `preexisting.json` (inclusive); en un control limpio toda referencia es sin coincidencia. Escribe `review_score.json` (`defects_total`, `defects_found`, `found_ids`, `missed_ids`, `found_by_category`, `found_by_severity`, `found_by_subtype`, `found_by_tests`, `findings_total`, `findings_unmatched`, `unmatched_refs`) y las columnas del CSV `defects_total, defects_found, found_by_category` (`categoría=encontrados/total|otra=...`, categorías ordenadas), `findings_total`, `findings_unmatched`. Limitaciones: dos archivos con el mismo nombre base no se distinguen; una referencia sin extensión conocida (`SOURCE_EXTENSIONS`) no se ve.

**Sonda (`run.mjs probe --arm X`).** Corre UNA sesión mínima de `claude -p` (`responde solo: ok`, tope 0,30 USD, mismas banderas, entorno y `configDir` que una corrida real, en una carpeta de trabajo que se borra) y lee el `init`: imprime y escribe `<workRoot>/probe-<brazo>.json` con plugins, cantidad de skills, los `slash_commands` que coinciden con `code-review`, agentes, modelo, versión, el costo y los requisitos de activación del brazo (el plugin cargó; el comando con el que empieza su pedido de revisión figura en el `init`). Gasta centavos, y el costo se suma al registro de gasto (`grader-spend.csv`) que lee el ledger. **El controlador la corre una vez por brazo antes del congelado** (sobre todo el brazo C: si `/code-review` no figura, sus corridas serían inválidas).

**Congelado.** Además de lo de siempre hashea, por cada ítem de revisión de validación, `base.txt`, `change.patch`, `change.crlf.patch` y `defects.json` y `preexisting.json` si existen (también el commit al que resuelve `base.txt`); el `reviewPrompt` y el `promptPrefix` de cada brazo (solo su hash va a `freeze.json`); el `neutral-claude.md`; `score.mjs`; y los archivos de `freezeExtraFiles` (rutas relativas a la raíz del repositorio o absolutas: la ficha, los scripts de análisis y de selección, los calendarios). Un archivo de esa lista que no existe hace fallar el congelado. `freeze --check` imprime `changedCategories`: `items de revision`, `tareas`, `reviewPrompt`, `promptPrefix`, `plugin`, `brazos`, `neutral CLAUDE.md`, `score.mjs`, `freezeExtraFiles`, `claudeVersion`, `model`, `effort`, `preregCommit`.

**Calendario y batch.** Un calendario puede mezclar tareas de trabajo y de revisión. Una entrada de revisión corre `prepare`, `run`, `score` y `row`; las de trabajo, como siempre. `batch --retry-infra` repite también las revisiones con fallo de infraestructura. `--dry-run` muestra, por entrada de revisión, el hash (sha256, 12 caracteres) del pedido del brazo, nunca el texto. Su línea de resultado dice `revisión defectos f/t, hallazgos n (u sin coincidencia)` en vez de la aceptación. `summary` lista por brazo los defectos encontrados y los hallazgos de una tarea de revisión, sin regla de decisión (la toma el análisis de revisión).

**Supuestos que solo una corrida real confirma.** Que `/code-review` figure en `slash_commands` con ese nombre (la sonda lo muestra); que el texto de primer nivel (`assistant-text.txt`) sea donde el brazo escribe sus hallazgos (una revisión que solo deja su informe en un archivo o en el mensaje de un subagente no se vería); que las referencias vengan con el nombre del archivo y la línea en alguna de las formas de arriba.

## Qué gasta plata y qué no

Solo `run` lanza `claude -p` y gasta tokens (y `batch`, que lo llama una vez por corrida; `batch --dry-run` no gasta; `probe` gasta centavos, ver arriba). Todo lo demás (`prepare`, `accept` con su panel de calidad, `quality`, `score`, `row`, `freeze`, `schedule`, `blind`, `unblind`, `summary`) es local y gratis. Las pruebas del arnés (`tests/harness.test.js` y `tests/harness-quality.test.js`) usan un `claude` falso (`tests/fixtures/harness/fake-claude.mjs`) y no gastan nada.

`run` pasa `--max-budget-usd` (tope por corrida, `perRunCapUsd`) y un tiempo máximo (`timeoutMs`). Además hay un **tope total** (`totalCapUsd`): `run` no lanza nada si lo ya gastado más 1,25 veces `perRunCapUsd` (el margen cubre lo que una corrida puede pasarse del tope) supera `totalCapUsd`. Lo gastado es la suma de `cost_usd` de **todas** las filas del CSV (de cualquier experimento, la calibración incluida), más las corridas que ya gastaron y todavía no tienen fila (`metrics.json` sin fila), más las interrumpidas (`stream.jsonl` sin `metrics.json`), más el registro de gasto fuera de `run` (abajo). Una corrida sin costo conocido (cortada por tiempo, interrumpida, sin resultado) cuenta como `perRunCapUsd`, lo máximo que pudo costar.

El revisor a ciegas y cualquier otro gasto que no pase por `run` se anotan en `<privateRoot>/grader-spend.csv` (o la ruta de `graderSpendPath`), un CSV con encabezado `date,usd,note` al que se le agrega una línea por gasto; el ledger lo suma. No corras `run` sin el OK del autor para el gasto: la ficha lo exige.

## Configuración

1. Copiá `harness.example.json` a `harness.local.json` (está en `.gitignore`) y completá las rutas absolutas:

| Clave | Qué es |
|---|---|
| `sourceRepo` | repo privado de donde se exporta el commit de partida; de ahí también sale `node_modules` (una sola vez, como copia) |
| `privateRoot` | carpeta privada con las tareas (ver abajo), los paquetes a ciegas y sus claves |
| `workRoot` | dónde se crean las carpetas de corrida `<tarea>-<brazo>-<rep>/` y la copia `_nm` |
| `configDir` | `CLAUDE_CONFIG_DIR` dedicado a la medición (sin plugins instalados, sin `CLAUDE.md`, sin hooks) |
| `arms.<id>.reviewPrompt` | el pedido de revisión que recibe el brazo en las tareas `review` (ver "Estudio B") |
| `freezeExtraFiles` | archivos extra que hashea el congelado (la ficha, los scripts de análisis y de selección, los calendarios); rutas relativas a la raíz del repositorio o absolutas; si falta uno el congelado falla |
| `arms.<id>` | `pluginName` y `pluginDir` de cada brazo (`--plugin-dir`); el `name` de `.claude-plugin/plugin.json` tiene que coincidir con `pluginName`. Sin los dos (o en `null`) es el brazo sin plugin |
| `contrasts` | comparaciones del análisis: `{ control, test, label }` o `[control, test, etiqueta]`; definen los `pairs` por defecto (ver "Brazo sin plugin y contrastes") |
| `model`, `permissionMode`, `perRunCapUsd`, `timeoutMs` | se pasan tal cual a `claude -p` |
| `effort` | nivel de esfuerzo que se pasa con `--effort` (`low`, `medium`, `high`, `xhigh`, `max`); por defecto `medium`, el mismo en los dos brazos |
| `totalCapUsd` | tope de gasto de toda la medición (obligatorio) |
| `neutralPlugins` | patrones (`*` es cualquier texto) de plugins que Claude Code carga en toda sesión y que **no** son contaminación; por defecto `["cc-plugin-*"]`. Se registran en `metrics.json` (`neutralPluginsLoaded`) y en la columna `neutral_plugins`. Un plugin que no es del brazo ni coincide con esta lista sí contamina. Cargan igual en los dos brazos, así que no sesgan la comparación |
| `neutralConfigPaths` | rutas de `configDir` con contenido que Claude Code sincroniza de la cuenta y que se declara en vez de bloquear; por defecto `["skills/synced", "plugins/synced", "plugins/data"]` (ver "Contenido sincronizado de la cuenta") |
| `extraEnvAllow` | nombres de variables de entorno extra que el hijo puede heredar (ver "Entorno del hijo") |
| `copyDirs` | carpetas o archivos ignorados por git que la tarea necesita (por ejemplo el cliente generado de la base) y que se copian de la fuente; rutas relativas, sin `.`, `..` ni vacías |
| `weights`, `modelFactor` | pesos de los tokens y factor por familia de modelo, ver "Calibración" |
| `seed` | semilla del mezclado a ciegas (el mismo valor reproduce el mismo orden) |
| `tasks` | `{ "<id>": { "kind": "medium" \| "small", "set": "dev" \| "validation" } }`: `kind` lo usa `summary` para aplicar la regla de cada tipo; `set` (por defecto `dev`) separa las tareas de desarrollo de las de validación, que exigen un freeze (ver "Desarrollo, validación y freeze") |
| `hangSilenceS`, `activityPollMs` | segundos de silencio de `claude` antes de un corte por tiempo a partir de los cuales la corrida es un `hang` (fallo de infraestructura) y no un `model_timeout` (por defecto 120), y cada cuántos ms se mira el tamaño del stream (por defecto 500); ver "Cómo termina una corrida" |
| `qualityTimeoutMs`, `mutationTimeoutMs` | tiempo máximo de cada herramienta del panel de calidad (tsc, eslint, coverage) y del comando de mutación; por defecto 300000 y 1800000 |
| `tscCmd`, `eslintCmd` | reemplazan a `npx tsc --noEmit --pretty false` y `npx eslint --format json` (un texto, que corre por el shell, o una lista `[ejecutable, ...argumentos]`); sirven para las pruebas con herramientas falsas |
| `preregRepo` | repo donde tiene que existir el commit de la ficha que se pasa a `freeze --prereg`; por defecto este repo |
| `blindExcludePaths` | notas de proceso y documentos del proyecto que se sacan del diff a ciegas y de los conteos de código (ver "Revisor a ciegas"); el ejemplo trae la lista por defecto |
| `nmIgnore` | carpetas de herramientas dentro de `node_modules` que no cuentan como cambio (por defecto `.vite`, `.vitest`, `.cache`, `.turbo`, `.parcel-cache`, `.eslintcache`) |
| `claudeBin`, `claudeArgsPrefix`, `extraArgs` | para apuntar a otro ejecutable o sumar flags sin tocar el código |
| `trackProcesses` | `false` apaga el listado de procesos antes y después (por defecto `true`) |
| `graderSpendPath` | CSV `date,usd,note` con el gasto fuera de `run` (revisor a ciegas); por defecto `<privateRoot>/grader-spend.csv` |
| `csvPath`, `gradesPath`, `experiment` | por defecto `tests/evals/pignolo2-runs.csv`, `tests/evals/pignolo2-grades.json` y `pignolo2` |

Al cargar la configuración se rechaza: un `totalCapUsd` o `perRunCapUsd` que no sea mayor que 0, un `effort` desconocido, un `%` en `workRoot` (el shell de Windows lo expande en los comandos de aceptación), un `workRoot`, `privateRoot` o `sourceRepo` metido dentro de otro (el agente podría llegar a la fuente o a la carpeta privada desde la corrida) y un `copyDirs` vacío, absoluto o con `.`/`..`.

2. Entrá una sola vez con el `configDir` de la medición (PowerShell):

```powershell
$env:CLAUDE_CONFIG_DIR = "<configDir>"; claude
# dentro: /login
```

`run` revisa `configDir` antes de gastar: tiene que existir y no puede tener `CLAUDE.md`, plugins instalados (`plugins/installed_plugins.json` con entradas, o `plugins/cache` con contenido; el archivo vacío o ausente está bien, y los registros de marketplaces y `plugins/data` se permiten y, si cambian, aparecen en `config_dir_delta`), `skills/` (salvo `skills/synced`), `agents/`, `commands/` o `hooks/` con contenido, ni `settings.json` / `settings.local.json` con `hooks` o `enabledPlugins`. Y que el `name` del plugin de cada brazo coincida con el `pluginName` configurado.

## Contenido sincronizado de la cuenta

Cuando Claude Code corre con sesión iniciada **descarga contenido de la cuenta al directorio de configuración** en el primer inicio: skills de la cuenta en `<configDir>/skills/synced/<bucket>/...` (cientos de archivos), un plugin de la cuenta con sus skills y su `.mcp.json` en `<configDir>/plugins/synced/<bucket>/...`, y una carpeta de datos por plugin en `<configDir>/plugins/data/<plugin>-inline/` (también para el plugin del brazo). Lo crea Claude Code solo, lo administra la cuenta y **los dos brazos ven lo mismo**: es una condición realista (las sesiones reales del autor lo tienen) que suma el mismo contexto a ambos. Por eso es neutral: se **declara**, no se bloquea.

- El chequeo previo de `configDir` deja pasar exactamente `neutralConfigPaths` (por defecto esas tres rutas). Cualquier otra cosa en `skills/`, plugins instalados (`installed_plugins.json`, `plugins/cache`), hooks, `enabledPlugins` o un `CLAUDE.md` en `configDir` sigue bloqueando.
- Bloquea igual si ese contenido trae una skill, un plugin (carpeta o `name` de un `plugin.json`) que se llame como el plugin de un brazo (`superpowers` o `pignolo`, o con prefijo `superpowers-` / `pignolo-`): sería contaminación, con un mensaje que lo dice. Si aparece durante la corrida, la corrida queda `contaminated`.
- `metrics.json` guarda `neutralConfigContent` (solo nombres y conteos: archivos y carpetas de skills sincronizadas, archivos y nombres de plugin de `plugins/synced`, carpetas de `plugins/data`) **antes** y **después** de la corrida y si la creó la corrida (`createdByRun`). El CSV lo resume en la columna `neutral_config`, por ejemplo `skills_synced=322;plugins_synced=77;plugins_data=1` (más `creado_en_la_corrida` si lo creó esa corrida).
- Un plugin que figura en el `init` y es uno de los `name` de `plugins/synced` es neutral (se anota en `neutralPluginsLoaded`); uno que no es del brazo, ni coincide con `neutralPlugins`, ni está en ese contenido, sigue contaminando.
- La ficha lo declara entre las amenazas a la validez.

## Entorno del hijo

`claude` **no** hereda el entorno del proceso padre. Se arma desde una lista blanca: `PATH`, `PATHEXT`, `SystemRoot`, `SystemDrive`, `WINDIR`, `ComSpec`, `TEMP`, `TMP`, `USERPROFILE`, `USERNAME`, `HOME`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramData`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `OS`, más lo que listes en `extraEnvAllow`, más `CLAUDE_CONFIG_DIR=<configDir>` y `DISABLE_AUTOUPDATER=1`. Todo lo demás (`CLAUDECODE`, `CLAUDE_CODE_*`, `ANTHROPIC_*`, `GITHUB_TOKEN`, cualquier `*_TOKEN`, `*_KEY`, `*_SECRET`) no llega. En `metrics.json` quedan los **nombres** (nunca los valores) de **todas** las variables descartadas (`droppedEnvNames`). Los comandos de `accept-cmd.txt` y `full-cmd.txt` corren con la misma lista blanca (sin `CLAUDE_CONFIG_DIR` ni `DISABLE_AUTOUPDATER`): si la suite del proyecto necesita una variable, agregala a `extraEnvAllow`.

Como el entorno no pasa, una `ANTHROPIC_API_KEY` del padre no se usa: la medición corre con el login de `configDir`. Si Claude Code no encuentra su shell en Windows y hace falta, agregá el nombre de la variable que lo resuelve (por ejemplo la del ejecutable de git bash) a `extraEnvAllow`.

El prompt de la tarea no va como argumento: se escribe en `prompt.stdin.txt` de la carpeta de corrida y es la entrada estándar de `claude -p`, así un prompt que empiece con `-` nunca se lee como opción. (`claude --help` documenta `-p` para tuberías; no se probó `--` porque probarlo gasta una llamada, ver "Calibración".)

## Carpeta privada

```
<privateRoot>/
  tasks.json           opcional pero necesario para las tareas chicas: { "<task>": { "baselineFull": { "fail": N } } }
  <task>/
    prompt.md          consigna textual que se le pasa a claude -p
    base.txt           commit (o ref) de partida en sourceRepo
    accept/**          tests de aceptación; se copian al árbol medido con la misma ruta relativa a accept/
    accept-cmd.txt     un solo comando de shell que corre los tests de aceptación (en la raíz del árbol medido)
    full-cmd.txt       un solo comando de shell que corre la suite completa del proyecto
    gold-files.txt     (opcional) las rutas que tocó la solución real, una por línea; mide el alcance (ver "Panel de calidad automático")
    coverage-cmd.txt   (opcional) comando que escribe el JSON de cobertura en {json}
    mutation-cmd.txt   (opcional) comando que escribe el JSON de mutación en {json}
  freeze.json          lo escribe `freeze` (ver "Desarrollo, validación y freeze")
  blind/<task>/        lo genera `blind`: paquetes, consigna del revisor (la carpeta que se le da al revisor)
  blind-keys/<task>.json   la clave (etiqueta a brazo y repetición), FUERA de lo que lee el revisor
```

`baselineFull.fail` es cuántos tests de la suite completa ya fallan en el commit base (el piso). La regla de la tarea chica exige `full_fail <= piso`. Sin piso, la tarea queda `pendiente`.

En `accept-cmd.txt` y `full-cmd.txt` se puede usar `{json}`: se reemplaza por una ruta entre comillas para que el corredor escriba su reporte JSON (por ejemplo `npx vitest run --reporter=json --outputFile={json} ...`). Con `{json}` el conteo sale de `numPassedTests` / `numFailedTests` / `numFailedTestSuites`. Sin él se lee la línea resumen (vitest, jest o node:test: `Test Files` / `Test Suites` dan las suites fallidas) y, si no se reconoce, se usa el código de salida (1/0 o 0/1) y la fila del CSV lo avisa en `note`.

**Verde** = código de salida 0, cero suites fallidas (un archivo de test que no se puede importar es una suite fallida), cero tests fallidos y más de cero tests pasados. Contar solo los tests no alcanza.

## node_modules

El agente corre con permisos libres, así que no se le da el `node_modules` de la fuente. `prepare` hace **una** copia, en `<workRoot>/_nm/node_modules` (se crea sola si falta), y cada corrida (también `measured/` y los worktrees) enlaza su `node_modules` a esa carpeta como junction.

**Por qué la copia está dentro de una carpeta llamada `node_modules`.** Node resuelve un import de paquete subiendo desde la ruta *real* del archivo que importa hasta encontrar una carpeta que se llame literalmente `node_modules`; una copia en `_nm/vitest/...` nunca encuentra a `_nm/@vitest/utils` (`ERR_MODULE_NOT_FOUND`: así falló la primera corrida real). Una copia del diseño viejo (`_nm` con los paquetes directamente adentro, o con un manifiesto sin `layout: 2`) se detecta como vieja, se borra con el borrado seguro y se vuelve a copiar, gratis y antes de gastar. Una prueba arma una copia mínima con un paquete `a` que hace `require('b')`, un `@scope/d` y un `.bin`, la enlaza con la misma función del arnés y comprueba que se resuelven. Antes y después de cada corrida se calcula un manifiesto (nombres de los paquetes de primer nivel ordenados, cantidad de entradas y hash de `.package-lock.json`; las carpetas de `nmIgnore` no cuentan). Si la copia cambió, la corrida es inválida (`nm_changed`) y la copia se borra con el borrado seguro (nunca recorre una junction), así la próxima preparación copia de nuevo desde la fuente. Si cambió el `node_modules` de la fuente, la corrida es inválida (`source_nm_changed`) y se avisa por stderr. Una copia que ya no coincide con su manifiesto (alguien la tocó entre corridas) se descarta y se vuelve a copiar sola, gratis y antes de gastar, siempre que el `node_modules` de la fuente siga siendo el que se copió; si la fuente cambió, `run` se niega y no gasta.

Borrar la copia es a prueba de bloqueos: primero se renombra a `_nm.trash-<marca>` (así el nombre `_nm` queda libre al instante) y después se borra con el borrado seguro; si un archivo está bloqueado (EBUSY/EPERM) la carpeta renombrada queda, la corrida se marca `drop_failed` y el próximo `prepare` la borra cuando ya no esté bloqueada.

`prepare` y `run` se niegan, antes de copiar y de gastar, si el `node_modules` de la fuente (o un `copyDirs`) tiene enlaces simbólicos o junctions que salen de la carpeta o están rotos: se miran las entradas de primer nivel, todo `@scope/*` y los hijos de `.pnpm` en `node_modules`, y todo el árbol en `copyDirs` (en Windows una copia sigue las junctions y traería contenido de afuera, o un enlace dejaría al agente escribir fuera de la copia). Hay que resolver esos enlaces antes de medir.

## Árbol medido

Un método puede dejar su código en la carpeta de la corrida, en un worktree de git o en una rama (superpowers crea worktrees). Después de cada corrida se registran `git worktree list`, las ramas adelantadas al commit base y qué árboles tienen cambios contra el base. **El árbol medido es el de mayor cambio contra el base entre la carpeta, los worktrees y las ramas** (empate: la carpeta de la corrida). Todos los candidatos quedan en `changes.json`; si más de uno tiene cambios se marca `multiple_trees` (aparece en `note` del CSV y en las notas de `summary`, para revisar a mano). `accept` corre en el árbol medido: le enlaza `node_modules`, copia los `copyDirs` que falten y copia ahí los tests de aceptación. Si el código está solo en una rama, `accept` la saca a un worktree propio (`<corrida>/measured`).

`run` marca `no_changes` (inválida) cuando ningún árbol tiene cambios contra el base: cubre las corridas que terminan con una pregunta. Para decidir esto cuenta **todo** cambio (también en nombres de `blindExcludePaths`): una tarea cuyo archivo objetivo esté excluido no se marca `no_changes`; las exclusiones solo valen para el diff a ciegas y para los conteos de código. Si todas las corridas de un brazo terminan sin cambios, `summary` lo escribe como resultado ("el brazo X termina sin cambios en todas las corridas: n/n") en vez de dejar la tarea pendiente.

Un worktree cuya carpeta ya no existe (el agente lo borró) se poda (`git worktree prune`) y se ignora; si el código estaba solo ahí, la corrida queda `no_changes`. Las últimas líneas (~1 KB) del texto final están en `metrics.json` (`finalText`), nunca en el CSV.

Los conteos de `changes.json` (`filesChanged`, `linesAdded`, `linesRemoved`, `files`) son de **código**: se excluyen con pathspec de git las entradas de `blindExcludePaths`. `rawFilesChanged` es el total sin excluir, y `changes.patch` conserva el parche completo.

## Un ciclo completo

```powershell
node tests/evals/harness/run.mjs prepare --task T --arm A --rep 1
node tests/evals/harness/run.mjs run     --task T --arm A --rep 1    # gasta tokens
node tests/evals/harness/run.mjs accept  --task T --arm A --rep 1
node tests/evals/harness/run.mjs row     --task T --arm A --rep 1
```

Intercalá los brazos (A, B, A, B...) como pide la ficha. Todos los comandos aceptan `--config <ruta>`. `prepare`, `run`, `accept`, `row`, `clean` y `summary` aceptan `--experiment <nombre>` (hay que pasar el mismo en todos los pasos de una corrida); `row` se niega si el experimento no es el de la corrida. Las corridas del experimento de la configuración viven en `<workRoot>/<tarea>-<brazo>-<rep>`; las de cualquier otro experimento (la calibración, `pignolo2-calib`) en `<workRoot>/<experimento>/<tarea>-<brazo>-<rep>`, así una corrida de calibración nunca ocupa la carpeta de una real.

| Comando | Qué hace |
|---|---|
| `prepare` | exporta el commit base con `git archive \| tar -x`, borra `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`, `.mcp.json` y cualquier `.claude/` (también anidados), escribe el `CLAUDE.md` neutral (`neutral-claude.md`), enlaza `node_modules` a la copia `_nm/node_modules` como junction, copia `copyDirs`, y hace `git init` con identidad local `eval` y un commit `base` (etiqueta `base`) en `main`. `node_modules` y `copyDirs` quedan en `.git/info/exclude`. No pisa una carpeta existente. |
| `run` | revisa plugin, `configDir` y tope total (gratis), lee `prompt.md`, lanza `claude` con `cwd` en el repo de la corrida, guarda `stream.jsonl` y `stderr.txt`, mide el tiempo de pared, mata el árbol de procesos al pasar `timeoutMs` y escribe `metrics.json`. No se puede correr dos veces la misma carpeta. Registra los procesos que sobran (`leftover_processes`, sin matarlos), los nombres que aparecen o desaparecen en `configDir` (`config_dir_delta`), la versión de Claude Code y el modelo resuelto (`init`), y marca `escaped_cwd` si una herramienta nombra la fuente, la carpeta privada u otra corrida (el primer comando, 200 caracteres, queda en `metrics.json`). |
| `accept` | calcula **primero** el resumen de cambios (`changes.json`, `changes.patch`, `changes.blind.patch`), **después** copia los tests de aceptación y corre `accept-cmd.txt` y `full-cmd.txt` en el árbol medido; escribe `acceptance.json` (código de salida, suites fallidas y piso de la suite completa) y al final corre el panel de calidad (`quality`). Repetirlo conserva el primer resumen. |
| `score --task T --arm X --rep N` | puntúa una corrida de revisión (estudio B) sobre `assistant-text.txt` y escribe `review_score.json`; `accept` lo hace solo. Gratis (ver "Estudio B"). |
| `probe --arm X` | UNA sesión mínima de `claude` (tope 0,30 USD) que lee el `init` del brazo y escribe `<workRoot>/probe-<brazo>.json`; gasta centavos, se corre antes del congelado (ver "Estudio B"). |
| `quality --task T --arm X --rep N` | calcula el panel de calidad automático de una corrida ya aceptada (necesita `changes.json`) y lo escribe en `quality.json`. Gratis: no gasta tokens (ver "Panel de calidad automático"). |
| `freeze --prereg <hash> [--force]` / `freeze --check` | escribe `<privateRoot>/freeze.json` con el hash de las tareas de validación y la identidad de los brazos / verifica sin escribir nada (ver "Desarrollo, validación y freeze"). |
| `schedule --tasks a,b,c --arms N,S,P --seed K [--reps R] [--force]` | imprime y escribe `<workRoot>/schedule-K.json`, un orden aleatorio de corridas (ver "Orden aleatorio y batch"). |
| `batch --schedule archivo [--dry-run] [--retry-infra [--max-retries 2]]` | recorre un calendario ejecutando prepare, run, accept (con el panel de calidad) y row de cada entrada; `--dry-run` solo muestra el plan y los chequeos; `--retry-infra` repite al final los fallos de infraestructura, hasta 2 veces cada uno (ver "Orden aleatorio y batch"). |
| `clean [--force]` | borra la carpeta de una corrida con el borrado seguro: toda junction o enlace (`node_modules` de la corrida, de `measured/` o de cualquier worktree dentro de la carpeta) se quita como enlace antes de seguir, sin recorrerlo. Se niega si la corrida tiene datos que no están en el CSV (corré `row` antes, o `--force`). Es la única forma prevista de borrar una corrida: no se borra a mano. |
| `remetric` | recalcula desde el `stream.jsonl` existente los campos de `metrics.json` que salen de leer el stream (costos, tokens por modelo, agentes, activación, contaminación, escapes, `init`, motivos de invalidez) con la configuración actual, **sin correr claude** y sin tocar nada más (cambios, árboles, `node_modules`, tiempos y registro de `configDir` quedan como estaban). Guarda una vez `metrics.json.bak` y muestra qué campos cambiaron. Después, `row --note rerun` escribe la fila corregida (la original sigue en el CSV; el ledger cuenta una sola vez cada corrida aunque tenga dos filas con la misma marca de tiempo). |
| `row` | agrega una fila a `pignolo2-runs.csv`. Si el archivo existente tiene un encabezado de una versión anterior (columnas de menos, o en otro orden), lo reescribe una vez con el encabezado actual: mapea las columnas viejas por nombre, deja vacías las nuevas, conserva todas las filas y antes guarda una copia `pignolo2-runs.csv.bak` (ignorada por git); si el archivo trae una columna que no existe en el esquema actual, se niega y no toca nada. Rechaza otra fila de la misma tarea/brazo/repetición salvo con `--note rerun`. |
| `blind --task T --reps 1,2,3` | arma `blind/T/pack-<k>/{diff.patch,meta.json}` con etiquetas `X`, `Y`, `Z`... en orden mezclado con la semilla, `grader-prompt.md` y `task-prompt.md`, y deja la clave en `blind-keys/T.json`. Se detiene si el diff aún nombra a algún plugin (`--allow-leaks` lo fuerza). `--force` regenera. |
| `unblind --task T --input salida.json` | pasa la salida JSON del revisor (una lista de `{label, serious_findings, correctness, quality}`) a `pignolo2-grades.json` usando la clave; cada nota recuerda la marca de tiempo de la corrida que calificó. |
| `summary [--csv ...] [--grades ...] [--experiment ...] [--medium a,b] [--small c] [--json] [--include-contaminated]` | mediana y rango por tarea y brazo, y la regla de decisión. Por defecto solo cuenta el experimento de la configuración. |

### Columnas del CSV

`experiment, task, arm, rep, timestamp, model, model_resolved, claude_version, cost_usd, weighted_tokens, input, output, cache_read, cache_write, model_tokens, wall_s, duration_ms, turns, agents, agents_main, agent_types, prompt_prefix_id, skill_calls, own_skill_calls, own_hook_ran, activation_via, result_subtype, is_error, exit_code, timed_out, invalid, invalid_reason, termination, censored, accept_exit, accept_pass, accept_fail, accept_suites_failed, full_pass, full_fail, full_baseline_fail, contamination, neutral_plugins, neutral_config, fronts_ok, fronts_got, fronts_message, fronts_reason, fronts_by_agents, fronts_by_agents_ok, files_changed, lines_added, lines_removed, eol_only_files, eol_converted_files, set, freeze_hash, prereg_commit, tsc_base_errors, tsc_result_errors, tsc_new_errors, eslint_new_errors, eslint_new_warnings, out_of_scope_files, out_of_scope_lines, diff_files, diff_lines, new_test_files, tests_added, coverage_lines_covered, coverage_lines_total, mutation_killed, mutation_survived, mutation_timeout, quality_note, defects_total, defects_found, found_by_category, findings_total, findings_unmatched, patch_mode, note`.

Las columnas desde `set` hasta `quality_note`, `termination` y `censored`, y las del estudio B (`defects_total` a `patch_mode`), son de ampliaciones posteriores: un CSV viejo se migra solo al próximo `row` (con la copia `.bak`) y esas celdas quedan vacías. `termination` es `ok`, `budget_cap`, `model_timeout`, `infra_fault` o `hang`; `censored` es `true` (terminada por tope o tiempo, no verde, costo censurado) o `false`; las filas viejas las traen vacías y se leen como no censuradas.

`skill_calls` cuenta todas las llamadas a la herramienta `Skill`; `own_skill_calls` las de una skill del propio plugin del brazo (su nombre o `plugin:skill`; `superpowers-extra:x` o `pignolo:work` en el brazo de superpowers no); los nombres distintos quedan en `metrics.json` (`ownSkillNames`). `own_hook_ran` es `true` si algún mensaje de hook (`hook_started` / `hook_response`) nombra al plugin, `false` si hubo hooks, ninguno lo nombra y el plugin declara `hooks/hooks.json`, y `unknown` en cualquier otro caso (por ejemplo un plugin sin hooks).

`wall_s` es el tiempo de pared del proceso: incluye el arranque de Claude Code, la carga de los plugins y los hooks. `duration_ms` es el que informa Claude Code en su mensaje final. `agents` cuenta todos los subagentes y `agents_main` los lanzados por el hilo principal. `model_tokens` son los tokens crudos por modelo (`modelo=entrada/salida/cache leída/cache escrita`, separados por `|`): `summary` recalcula con ellos los tokens ponderados con la configuración actual, y el `weighted_tokens` del CSV es el que se calculó al correr.

### Fin de línea (CRLF y LF)

Los archivos de un proyecto pueden usar CRLF y un agente puede reescribir un archivo entero como LF: cada línea "cambia" y los números de líneas agregadas y quitadas se inflan con puro ruido (en la primera corrida mediana real un brazo informó unas 2.000 líneas de más). Por eso:

- Los conteos de código de `changes.json` (`filesChanged`, `linesAdded`, `linesRemoved`, `files`) y las columnas `files_changed`, `lines_added`, `lines_removed` del CSV se calculan con `git diff --ignore-cr-at-eol`: un archivo que solo cambió su fin de línea no cuenta y uno que cambió unas líneas cuenta esas líneas.
- `changes.json` conserva `rawLinesAdded` / `rawLinesRemoved` (los mismos conteos de código sin ignorar el fin de línea), `eolOnlyFiles` (archivos cuyo único cambio es el fin de línea: están en el diff sin ignorar y no en el que lo ignora) y `eolConvertedFiles` (archivos cambiados cuyo fin de línea dominante pasó de uno a otro respecto de la base), solo nombres, con sus cuentas. El CSV trae las cuentas en `eol_only_files` y `eol_converted_files`.
- `changes.blind.patch` y los paquetes a ciegas se arman con `--ignore-cr-at-eol`: el ruido de fin de línea nunca llega al revisor, y la consigna del revisor dice que las diferencias de fin de línea no son parte de la revisión. `meta.json` y los paquetes no llevan nada de esto (delataría al brazo); `eolConvertedFiles` y `eolOnlyFiles` quedan solo en la clave (`blind-keys/<tarea>.json`), para que el autor los pondere **después** de calificar, como nota de calidad (convertir un archivo entero de fin de línea ensucia el diff de un proyecto real) y no como parte de la nota a ciegas.
- `changes.patch` (el parche completo) no ignora nada.

### Activación del plugin

Se activa por dos caminos, y los dos cuentan en `own_skill_calls` y en `activaron el plugin: n/m`:

- **Herramienta `Skill`:** la corrida llamó a una skill del propio plugin (`skill_tool`).
- **Comando de barra:** el prompt (con el prefijo del brazo) empieza con `/<pluginName>:<skill>`, el `system/init` lista ese comando (en `slash_commands` o `skills`) y la corrida terminó con un resultado sin error (`slash_command`). Un comando así expande la skill dentro del prompt: **no hay ninguna llamada a `Skill` en el stream** (la primera corrida forzada de Pignolo 2 lo mostró: sin `tool_use` de `Skill`, pero con el vocabulario de su skill `work` en el primer mensaje). Se detecta por el texto del prefijo y por el `init`, no por el texto del asistente. Si el prompt empieza con un comando del plugin que el `init` no lista, no se cuenta y la advertencia `slash_command_unknown` queda en `metrics.json` y en `note`; un comando de otro plugin no cuenta ni advierte.
- `metrics.json` guarda `slashActivations` (nombres) y `activationVia` (`skill_tool`, `slash_command`, `both` si fueron las dos o `none`); el CSV, `activation_via`. `skill_calls` sigue contando solo las llamadas a la herramienta; `own_skill_calls` suma la herramienta y el comando.

Un brazo solo pone a prueba su plugin si el modelo lo usa. `summary` imprime, por tarea y brazo, `activaron el plugin: n/m` (corridas que llamaron al menos a una skill propia sobre las que tienen el dato; el hook propio se muestra aparte) y, si ninguna corrida de ningún brazo activó su plugin, la línea "ningún corrida activó el plugin: la comparación de esta tarea mide al modelo base"; si solo un brazo no lo activó, nombra al brazo.

### Revisor a ciegas

El revisor corre **en Opus, en una corrida aparte** (otra sesión que no ve `blind-keys/` ni el CSV). Se le da la carpeta `blind/T/` (`grader-prompt.md`, `task-prompt.md` y los `pack-<k>`); devuelve un JSON por paquete: `{ "label", "serious_findings": [...], "correctness": 0-5, "quality": 0-5 }`. Eso se pasa a `unblind`.

El diff que ve el revisor sale de `accept` ya filtrado con pathspecs de git (no con expresiones regulares sobre el texto del diff, así los nombres con espacios funcionan) y sin las entradas de `blindExcludePaths`: `.claude/`, `.superpowers/`, `.pignolo/`, `docs/superpowers/`, `docs/pignolo/`, `docs/sessions/`, `docs/research/`, `roadmap.md`, `security.md`, `design.md`, `CLAUDE.md`, `.gitignore`, `.worktrees/` (un nombre sin barra coincide en cualquier carpeta). La consigna del revisor aclara que las notas de proceso y los documentos del proyecto están fuera de alcance y no se penalizan.

### Regla de decisión que aplica `summary`

- **Tarea mediana (`medium`), no inferioridad:** B pasa si la mediana de tokens ponderados de B es menor o igual a 1,5 veces la de A **y** el máximo de B es menor o igual a 1,5 veces el máximo de A **y** la calidad es igual o mejor (mediana de nota, hallazgos graves y proporción de corridas verdes, todos no peores que A). Que los rangos se pisen **no** impide pasar: solo impide afirmar que B es mejor que A, y entonces el resumen escribe "no se afirma superioridad". Sin notas a ciegas de todas las corridas válidas: `pendiente`.
- **Tarea chica (`small`):** la mediana de tiempo de pared y de tokens ponderados de B debe ser menor o igual que la de A, el resultado de B correcto (verde) en todas sus corridas y `full_fail <= piso` en todas. Un exceso con rangos que se pisan es "sin diferencia demostrada" (riesgo abierto); sin pisarse, "no pasa". Sin aceptación o sin piso: `pendiente`.
- Fin de línea (nota informativa, fuera de la regla): por brazo se imprime cuántos archivos convirtieron su fin de línea (por ejemplo CRLF a LF) y en cuántas corridas; ver "Fin de línea".
- Evidencia: **E3** con 3 o más repeticiones válidas por brazo, **E2** con 2, "sin evidencia" con 1 o menos. Nunca se imprime una cifra sin su rango. El costo en USD se imprime al lado de los tokens ponderados.
- Las corridas repetidas (`rerun`) reemplazan a la original en las cifras; las dos quedan en el CSV. Las inválidas (fallos de infraestructura, con error, contaminadas, con `escaped_cwd`...) se listan y dejan la tarea en `pendiente: <n> corridas inválidas`. Las **terminadas por tope o tiempo** (censuradas) **no** son inválidas: entran en las cifras como válidas pero no verdes (`isGreen` es falso aunque los tests ocultos pasen), con su costo censurado; `summary` las nombra en una línea por brazo (`terminadas por tope o tiempo: n`) y en una nota con la corrida. En una tarea mediana no se les pide nota a ciegas (puede no haber resultado que calificar); en un fixture cuentan como un no acierto. Un CSV viejo con `budget_cap` o `timed_out` en `invalid_reason` sigue siendo inválido y se nombra aparte como antes ("superó el tope", "cortadas por tiempo"). Las notas a ciegas cuentan solo para las corridas usadas: una nota de una corrida que se rehízo no se hereda.
- Las filas de otro experimento (por ejemplo `pignolo2-calib`) se ignoran y se nombran.

## Panel de calidad automático

`accept` termina corriendo `quality` (también se puede correr solo: `run.mjs quality --task T --arm X --rep N`, después de `accept`). No gasta tokens. Usa las herramientas del propio proyecto sobre **dos árboles**: el árbol medido y el commit base. El base es una exportación desechable de la etiqueta `base` de la corrida (`git archive`, dentro de `<corrida>/quality-base`), con `node_modules` enlazado a la misma copia y los `copyDirs`; se borra al terminar. La fuente nunca se toca. El detalle crudo queda en `<corrida>/quality.json` y las cifras en las columnas del CSV.

Una herramienta que falta nunca rompe `accept`: la cifra queda **vacía (null)** y `quality_note` dice por qué (por ejemplo `tsc:sin_tsconfig`, `tsc:tsc_no_instalado`, `eslint:sin_config_eslint`, `scope:sin_gold_files`, `tsc:resultado_tiempo_agotado`, `coverage:sin_json_valido`).

| Cifra (columna) | Cómo se calcula |
|---|---|
| `tsc_base_errors`, `tsc_result_errors`, `tsc_new_errors` | `npx tsc --noEmit --pretty false` (con tope `qualityTimeoutMs`, por defecto 300000) en el base y en el resultado; hace falta `tsconfig.json` y `node_modules/.bin/tsc`. Cada error se reduce a `archivo(código,mensaje)` **sin número de línea** (las líneas se corren cuando el agente agrega código). `tsc_new_errors` es la diferencia de multiconjuntos: lo que el resultado tiene de más que el base. Los errores de los archivos de aceptación que `accept` copia al árbol no cuentan (son los tests de la tarea, no la solución). |
| `eslint_new_errors`, `eslint_new_warnings` | `npx eslint --format json` sobre los archivos de **código** agregados o modificados (solo los que existen en el resultado) con la configuración del propio proyecto, en el base (solo los que ya existían) y en el resultado. Por regla y archivo, diferencia de multiconjuntos. `null` si el proyecto no tiene configuración de eslint o no está instalado. |
| `out_of_scope_files`, `out_of_scope_lines` | archivos cambiados (sin `blindExcludePaths`) que no figuran en `gold-files.txt` de la carpeta de la tarea, y cuántas líneas (agregadas más quitadas, sin fin de línea) sumaron. `gold-files.txt` lista una ruta por línea (relativa a la raíz del repo, con `/`; se ignoran líneas vacías y las que empiezan con `#`). `null` si el archivo no está. |
| `diff_files`, `diff_lines` | archivos cambiados y líneas agregadas más quitadas, de código y sin contar fin de línea (los mismos conteos de `changes.json`). |
| `new_test_files`, `tests_added` | archivos de test agregados (rutas en `test/`, `tests/`, `__tests__/`, `spec/`, o nombres `*.test.*`, `*.spec.*`, `*_test.py`, `*_test.go`, `test_*.py`) y apariciones nuevas de `it(`, `test(` (con `.only`, `.skip`, `.each`...), `def test_` y `func Test` en las líneas agregadas. Es un indicador descriptivo barato, **no** una medida de la calidad de los tests. |
| `coverage_lines_covered`, `coverage_lines_total` | opcional: `coverage-cmd.txt` en la carpeta de la tarea. |
| `mutation_killed`, `mutation_survived`, `mutation_timeout` | opcional: `mutation-cmd.txt` en la carpeta de la tarea. |

**Cobertura y mutación (opcionales).** El arnés no sabe leer ninguna herramienta en particular: el comando de la tarea tiene que escribir un archivo JSON simple en la ruta que recibe en `{json}` (como `accept-cmd.txt`), con exactamente estos campos numéricos:

```json
{ "linesCovered": 80, "linesTotal": 100 }
{ "killed": 7, "survived": 2, "timeout": 1 }
```

El primero es para `coverage-cmd.txt` y el segundo para `mutation-cmd.txt`. El comando corre en el árbol medido (con los tests de aceptación ya copiados) y el código de salida no importa si el JSON está bien. Con tope `qualityTimeoutMs` (cobertura) y `mutationTimeoutMs` (mutación, por defecto 30 minutos). Sin el archivo de comando la cifra queda `null` sin nota; con el comando pero sin un JSON válido queda `null` con la nota `coverage:sin_json_valido` (o `mutation:...`). Si una herramienta real imprime otra cosa, el propio comando de la tarea tiene que traducirla a ese JSON.

`summary` imprime, por tarea y brazo, la mediana y el rango de `tsc_new_errors`, `eslint_new_errors`, `out_of_scope_files`, `diff_lines` y `tests_added`, y al final **el costo por tarea resuelta** de cada brazo: el gasto total de sus corridas válidas dividido por las tareas que resolvió. Una tarea cuenta como resuelta por un brazo cuando **más de la mitad** de las corridas válidas de ese brazo (con datos de aceptación) son verdes; la unidad es la tarea, no la corrida. Se desglosa por conjunto (`dev` / `validation`) cuando hay de los dos.

## Desarrollo, validación y freeze

Las tareas de la configuración llevan `set: "dev"` (por defecto) o `set: "validation"`. Las de desarrollo sirven para ajustar el arnés y los métodos; las de validación son las que cuentan para la conclusión y **no se pueden tocar después de pre-registrar** la ficha.

`run.mjs freeze --prereg <hash del commit de la ficha>` escribe `<privateRoot>/freeze.json` (fuera de git):

- `freezeHash`: sha256 del JSON canónico (claves ordenadas) del contenido que sigue. Más `preregCommit` (el hash completo del commit de la ficha; tiene que existir en `preregRepo`) y la fecha.
- Por cada tarea de validación: sha256 de `prompt.md`, `base.txt` (y el commit al que resuelve en la fuente), `accept/**` en orden, `accept-cmd.txt`, `full-cmd.txt`, y `gold-files.txt`, `coverage-cmd.txt` y `mutation-cmd.txt` si existen. (Una tarea de fixture hashea su carpeta de fixture y el prompt de la configuración.)
- Por cada brazo: el plugin, el hash del texto de su `promptPrefix`, y la salida de `claude --version`, el modelo y el esfuerzo de la configuración.
- **Identidad del plugin.** Dentro de un repo git, el hash del árbol git de la **carpeta del plugin** en `HEAD` (cambia solo si cambia el plugin; el hash del commit de todo el repo se mueve con cualquier commit ajeno, como el de los resultados, y rompería el freeze). El commit del repo queda anotado en `freeze.json` (`info`) para trazabilidad, sin entrar en el hash. Un plugin con cambios sin commitear no se congela ni se acepta. Fuera de git: un hash del contenido de la carpeta.

`run` de una tarea de validación **se niega, antes de gastar**, si no existe `freeze.json`, si su `freezeHash` no coincide con su contenido, si algo recalculado ya no coincide (el mensaje dice qué: `cambió accept/x`, `el contenido del plugin cambió`, `claudeVersion cambió`, `la tarea T es de validación pero no figura en el freeze`...), o si la tarea no figura. Si todo coincide, `metrics.json` y el CSV guardan `freeze_hash` y `prereg_commit` (y `set`). Las tareas de desarrollo no piden nada.

`freeze --check` imprime la verificación (`ok`, `problems`, `freezeHash`, `preregCommit`) sin escribir nada y sale con código distinto de cero si algo cambió. `freeze` se niega a pisar un `freeze.json` existente; con `--force` el anterior pasa a `freeze.json.<fecha>.bak` y se escribe uno nuevo.

## Orden aleatorio y batch

`run.mjs schedule --tasks a,b,c --arms N,S,P --seed K [--reps R]` arma un orden aleatorio reproducible: las tareas se barajan, cada tarea es un **bloque** con los brazos barajados dentro (cada brazo una vez por bloque), con una semilla propia por barajado, así la misma `--seed` y los mismos argumentos dan siempre el mismo orden. Con `--reps R` se repite la pasada completa R veces (cada una con su propio orden). Imprime una línea por corrida y escribe `<workRoot>/schedule-K.json` (`seed`, `reps`, `tasks`, `arms`, `entries` con `index`, `block`, `task`, `arm`, `rep`); no pisa un archivo con otro contenido sin `--force`. Una tarea que limita sus brazos (un fixture) solo recibe los suyos. `run` **no** exige seguir el calendario.

`run.mjs batch --schedule schedule-K.json [--dry-run] [--experiment E]` ejecuta, en serie y por entrada, `prepare`, `run`, `accept` (que corre el panel de calidad) y `row`, y escribe **una línea por corrida**: `[i/n] tarea brazo rep r | costo ... USD | pared ... s | turnos ... | agentes ... | activación ... | aceptación pasa/falla | válida / inválida: motivos`.

- Se detiene en el **primer error del arnés** (un paso que lanza una excepción: falta un archivo, tope total de gasto, freeze que no se cumple, una corrida interrumpida...). Una corrida inválida no es un error: se registra con su motivo y el batch sigue.
- Se puede volver a lanzar con el mismo calendario: salta lo que ya tiene su fila en el CSV y termina lo que quedó a medias (preparada, corrida sin aceptar...). Una carpeta con `stream.jsonl` y sin `metrics.json` (corrida interrumpida) frena el batch: su gasto ya cuenta en el ledger y hay que revisarla o limpiarla a mano con `clean --force`.
- Antes de empezar verifica los plugins, el `configDir` y, si hay tareas de validación, el freeze. El ledger y los topes son los de siempre: cada `run` revisa `totalCapUsd` y `perRunCapUsd`.
- **`--retry-infra [--max-retries 2]`.** Después de la pasada principal, repite cada entrada cuya **última fila** sea un fallo de infraestructura que se repite solo (`termination` `infra_fault` o `hang` con un motivo de la lista de "Regla general": `crash`, `no_result`, `api_error`, `execution_error`, `corrupt_stream`, `failed_to_start`, `hang`, `exit_nonzero`): `clean`, `prepare`, `run`, `accept` y `row --note "rerun N"`, a lo sumo `--max-retries` veces por entrada (2 por defecto; la ficha fija 2 como máximo y el arnés rechaza más). Imprime una línea por reintento (`reintento por infraestructura: tarea brazo rep r | intento k de n | motivo: ...`), después la línea normal de la corrida repetida, y `reintentos agotados: ...` si al llegar al máximo sigue fallando (queda inválida y se informa). Un reintento **conserva la misma tarea, brazo y repetición**; el número de reintentos de la entrada queda en la columna `note` como `rerun 1`, `rerun 2` y la fila nueva reemplaza a la original en las cifras. **Nunca repite** un tope por corrida ni un corte por tiempo con el agente activo (son resultados censurados), un mal resultado, una contaminación ni un resultado de error que el arnés no sabe ubicar. El ledger y los topes (`perRunCapUsd`, `totalCapUsd`) valen para cada reintento como para cualquier `run`: si no entra, el batch se detiene con el error de siempre. Se puede volver a lanzar el batch con `--retry-infra` para retomar reintentos pendientes (cuenta los `rerun N` ya hechos). Un reintento cortado a medias retoma como `rerun N`; una entrada que ya tiene fila y cuya carpeta se borró (con `clean`) cuenta como registrada, nunca se vuelve a correr sola.
- `--dry-run` imprime el plan (qué paso falta de cada entrada), el gasto acumulado, el peor caso de las corridas por lanzar (`perRunCapUsd` por corrida), si ese peor caso entra en el tope total, si la próxima corrida pasa el chequeo del ledger, el estado del freeze y los chequeos previos. No prepara, no corre ni gasta nada. Con `--retry-infra` agrega los reintentos pendientes (cada uno con su motivo) y el peor caso con reintentos.

## Calibración: qué verificar en la primera corrida real

Antes de la primera corrida válida, correr una chica por brazo con `--experiment pignolo2-calib` (en `run` y en `row`): queda en el mismo CSV, cuenta para el tope total y nunca se mezcla en el resumen real. Comprobar:

1. **Flags de `claude -p`.** Los verificados con `claude --help` (2.1.302): `-p`, `--model`, `--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--plugin-dir` (repetible, no variádico), `--permission-mode` (con `bypassPermissions`), `--output-format stream-json`, `--verbose`, `--max-budget-usd`, `--no-session-persistence`. No se pasa `--bare` (saltaría los hooks de los plugins, que son parte del brazo). Si alguna versión nueva cambia un flag, se ajusta en `buildArgv` (`execute.mjs`) o con `extraArgs`.
2. **El prompt por stdin.** `-p` sin prompt posicional lee la entrada estándar (`claude --help` lo describe para tuberías). No se verificó contra un `claude` real porque probarlo gasta; la calibración tiene que confirmar que el prompt llega completo y que `stream.jsonl` trae un mensaje `result`.
3. **Campos del stream.** El formato exacto se tomó de lo conocido de stream-json y de las pruebas con el stub: `system/init` con `plugins` (lista de objetos con `name`), `model` y `claude_code_version`; `result` con `subtype`, `is_error`, `result`, `total_cost_usd`, `usage`, `modelUsage` (claves camelCase por modelo), `duration_ms`, `num_turns`; `parent_tool_use_id` en los mensajes de subagentes. Si un nombre difiere, la métrica queda en `null` o 0 y la corrida sale inválida (`no_result`, `own_plugin_not_loaded`...), nunca con un valor inventado. El subtipo exacto de un corte por presupuesto se asume que contiene `budget` (por ejemplo `error_max_budget_usd`): confirmarlo (es lo que decide `budget_cap`, un resultado censurado, y no un fallo). Lo mismo con los textos de error de la API y de la cuenta que deciden `api_error` (ver "Cómo termina una corrida"), con que un stream real escriba al menos un mensaje cada 120 s mientras el agente trabaja (si una herramienta larga deja más silencio, el corte por tiempo se leería como `hang`), y con el código de salida real de un corte por nuestro tiempo en Windows (`taskkill` deja 1; no se mira cuando `timedOut` es verdadero).
4. **Tokens de subagentes.** `metrics.json` guarda `tokens` (suma de `modelUsage`, que debería incluir subagentes), `tokensByModel` y `usageMainThread` (campo `usage` del mensaje `result`). Si en una corrida con subagentes ambos son iguales, `modelUsage` no suma los subagentes y hay que sumar el uso desde los mensajes del stream. Si el resultado no trae `modelUsage`, se usa `usage` y la fila lo avisa (`tokens-solo-hilo-principal`).
5. **Cantidad de agentes.** Se cuentan los `tool_use` de nombre `Agent` o `Task` (sin repetir ids) en todo el stream; `agents_main` cuenta los del hilo principal. Verificar con un stream real que los subagentes aparecen y que los nombres coinciden.
6. **Contaminación.** Contaminada = el plugin del brazo no figura cargado en `system/init`, **o** figura cargado cualquier plugin que no sea el del brazo (también por skills, agentes y comandos del otro). Verificar en un stream real que `plugins` lista el plugin del brazo con un nombre que coincide con `pluginName` (puede venir como `nombre@marketplace`), y que los plugins incorporados de Claude Code estén cubiertos por `neutralPlugins` (la primera corrida real listó tres, ver "Primera corrida real"). Si `configDir` tiene plugins instalados, van a aparecer ahí.
7. **Pesos y factores por modelo.** `weights` (entrada 1, salida 5, caché leída 0,1, caché escrita 1,25) son una aproximación de los precios relativos de un modelo, y `modelFactor` (`opus` 5, `sonnet` 1, `haiku` 0,33, buscado como subcadena del id del modelo en `modelUsage`) los escala por familia. **Son marcadores a calibrar** contra `cost_usd` en las primeras corridas: comparar el ponderado con el costo de cada modelo y ajustar antes de la primera corrida válida; `summary` recalcula siempre con la configuración actual desde los tokens crudos, así que ajustar después no obliga a rehacer corridas, pero hay que fijar los valores antes de mirar resultados. Un modelo sin familia conocida usa factor 1 y queda en `metrics.json` (`unknownModels`).
8. **Costo.** `cost_usd` es `total_cost_usd` del mensaje `result`; con login de suscripción puede venir como estimación.
9. **Permisos.** Con `bypassPermissions` el agente corre comandos sin pedir permiso. No lo uses fuera de una carpeta descartable (ver "Límites").
10. **`configDir`.** `config_dir_delta` de la primera corrida muestra qué escribe Claude Code en el directorio de configuración (solo nombres). Si crea algo en `plugins/` que el chequeo previo toma por contaminación, ajustar `checkConfigDir` en `execute.mjs`.
11. **Árbol medido.** En una corrida de superpowers real, mirar `changes.json`: dónde dejó el código (worktree, rama, carpeta), y que `accept` corra en ese árbol. Si usa una carpeta de worktrees fuera de `workRoot`, el chequeo `escaped_cwd` no la toma por un escape (solo mira la fuente, la carpeta privada y las demás corridas).
12. **Conteos de aceptación.** Que `{json}` / el resumen del corredor de tests de la tarea real produzcan fuente `json` o `summary` (no `exit-code`) y que traigan las suites fallidas.
13. **Export.** Que `git archive | tar` funcione con el repo real (symlinks, submódulos, `.gitattributes export-ignore`), y que `copyDirs` cubra lo que la suite necesita (por ejemplo el cliente generado de la base y los `.env` ignorados, si hicieran falta).
14. **Diff a ciegas.** Revisar a mano un `pack-*/diff.patch` real antes de entregarlo al revisor: que no queden rastros del método.

## Primera corrida real

Una corrida de calibración del brazo A en una tarea chica (sin datos privados en lo que sigue). Hechos:

- Los campos del stream eran los supuestos: `system/init` con `plugins[].name`, `model` y `claude_code_version`; `result` con `subtype` `success`, `modelUsage` por modelo y `usage`.
- El prompt por stdin funcionó.
- Costo (`total_cost_usd`): 0,26 USD para una tarea chica de unos 74 s, 14 turnos y 0 subagentes.
- El subtipo del corte por presupuesto **sigue sin verificarse** (no se llegó al tope).
- El `node_modules` copiado pesaba unos 970 MB: la copia única es cara en disco y en tiempo la primera vez.
- `init.plugins` listó, además del plugin del brazo, tres plugins incorporados que Claude Code carga en toda sesión sin importar la configuración: `cc-plugin-agents-md`, `cc-plugin-telemetry` y `cc-plugin-plugin-authoring`. Se cargan igual en los dos brazos (no sesgan la comparación), y por eso `neutralPlugins` los deja pasar y los anota.
- Tercer par de calibración: en **los dos brazos** no hubo ninguna llamada a la herramienta `Skill` (solo `Read`, `Grep`, `Glob`, `Edit` y `Bash`); el plugin bajo prueba no se ejerció. El brazo de superpowers sí mostró mensajes `hook_started` / `hook_response` de `SessionStart` (campos `hook_name`, `hook_event`, `output`, `stdout`, `exit_code`, `outcome`) cuyo texto nombra al plugin; el de Pignolo 2 no tiene hooks. Por eso el arnés cuenta la activación y la muestra.
- Falló la suite del proyecto con `ERR_MODULE_NOT_FOUND` porque la copia de `node_modules` no estaba dentro de una carpeta llamada `node_modules` (arreglado, ver "node_modules").

## Límites

- Con `bypassPermissions` el agente puede hacer lo que haga el usuario de Windows: borrar o escribir fuera de la carpeta de la corrida. El arnés no lo impide. Lo que sí hace: entorno sin credenciales, `node_modules` aislado, `configDir` y plugin verificados, y detección posterior (`escaped_cwd`, `nm_changed`, `source_nm_changed`, `leftover_processes`). `escaped_cwd` mira las herramientas del stream; un script que escriba fuera sin nombrar la ruta no se ve. La única defensa real es correr en una máquina o usuario descartable.
- Los comandos de `accept-cmd.txt` y `full-cmd.txt` corren con la lista blanca de entorno más `extraEnvAllow`; una variable que el proyecto necesite hay que permitirla a mano.
- Cachés de herramientas compartidas (la de npm, las de `%LOCALAPPDATA%`, `~/.cache`) viven fuera de la corrida y pasan de una corrida a otra: pueden dar ventaja a la segunda corrida de un brazo. El arnés no las aísla; se mitiga intercalando los brazos y se declara como amenaza.
- Los cambios dentro de `node_modules` y `copyDirs` no cuentan en el resumen de cambios.
- Los diffs a ciegas excluyen las notas de proceso conocidas (`blindExcludePaths`); un método que deje otros rastros distintivos en el código puede delatarse igual. `blind` avisa si el diff nombra a un plugin, no detecta el estilo.
- El revisor ve el diff y la consigna, no el repo completo.
- La detección de escapes mira las herramientas del stream: compara en el borde de la ruta (`X/app` no coincide con `X/app-runs`), entiende `C:\`, `C:/`, `/c/`, `/mnt/c/` y barras dobles, y marca los `..` que salen de la carpeta de la corrida. Para eso solo analiza la línea de comandos: ignora los cuerpos de heredoc (`<<'E' ... E`), los textos entre comillas con espacios (código, expresiones regulares, mensajes) y los puntos suspensivos `...`, y sigue los `cd` del propio comando (un `cd` absoluto adentro de la corrida y después `cd ../../../..` se resuelve desde donde está, no desde el repo). Un `..` cuenta solo si es una ruta real que empieza con `../`, contiene `/../` o termina en `/..` y sale de la carpeta de la corrida. No ve lo que un script haga por dentro.
- Un worktree que el agente cree fuera de la carpeta de la corrida y que `clean` no alcance queda donde está (se registra en `changes.json` / `metrics.json`).
- Para repetir una corrida: `run.mjs clean --task T --arm A --rep 1` (borra la carpeta de esa corrida; sus métricas ya están en el CSV), volvé a `prepare` y anotá `--note rerun` en `row`. No se borra nada a mano. Los fallos de infraestructura de un calendario los repite solo `batch --retry-infra` (con `--note "rerun N"`).
