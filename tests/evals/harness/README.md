# Arnés de medición de Pignolo 2

Corre la misma tarea en dos brazos y junta las métricas que pide la ficha `tests/evals/RESULTS-pignolo2.md`:

- **Brazo A:** Claude Code con solo el plugin `superpowers`.
- **Brazo B:** Claude Code con solo el plugin Pignolo 2 (`plugins/pignolo`).

El arnés es **genérico**: no lleva nombres, código, commits ni rutas de ningún proyecto. Las tareas reales viven en una carpeta privada que se indica en un archivo de configuración fuera de git (`harness.local.json`). Lo único que se versiona de una medición real es `tests/evals/pignolo2-runs.csv` (métricas con ids de tarea genéricos) y, si se quiere, `tests/evals/pignolo2-grades.json` (notas del revisor a ciegas).

Node >= 22, sin dependencias. Necesita `git` y `tar` en el PATH (Windows 10/11 trae `tar`).

## Qué gasta plata y qué no

Solo `run` lanza `claude -p` y gasta tokens. Todo lo demás (`prepare`, `accept`, `row`, `blind`, `unblind`, `summary`) es local y gratis. Las pruebas del arnés (`tests/harness.test.js`) usan un `claude` falso (`tests/fixtures/harness/fake-claude.mjs`) y no gastan nada.

`run` pasa `--max-budget-usd` (tope por corrida, `perRunCapUsd`) y un tiempo máximo (`timeoutMs`). No corras `run` sin el OK del autor para el gasto: la ficha lo exige.

## Configuración

1. Copiá `harness.example.json` a `harness.local.json` (está en `.gitignore`) y completá las rutas absolutas:

| Clave | Qué es |
|---|---|
| `sourceRepo` | repo privado de donde se exporta el commit de partida; de ahí también sale `node_modules` |
| `privateRoot` | carpeta privada con las tareas (ver abajo) y, después, los paquetes a ciegas |
| `workRoot` | dónde se crean las carpetas de corrida `<tarea>-<brazo>-<rep>/` |
| `configDir` | `CLAUDE_CONFIG_DIR` dedicado a la medición (sin plugins instalados ni memoria del autor) |
| `arms.A`, `arms.B` | `pluginName` y `pluginDir` de cada brazo (`--plugin-dir`) |
| `model`, `permissionMode`, `perRunCapUsd`, `timeoutMs` | se pasan tal cual a `claude -p` |
| `copyDirs` | carpetas o archivos ignorados por git que la tarea necesita (por ejemplo el cliente generado de la base) y que se copian de la fuente |
| `weights` | pesos de los tokens, ver "Calibración" |
| `seed` | semilla del mezclado a ciegas (el mismo valor reproduce el mismo orden) |
| `tasks` | `{ "<id>": { "kind": "medium" \| "small" } }`, lo usa `summary` para aplicar la regla de cada tipo |
| `claudeBin`, `claudeArgsPrefix`, `extraArgs` | para apuntar a otro ejecutable o sumar flags sin tocar el código |
| `csvPath`, `gradesPath`, `experiment` | por defecto `tests/evals/pignolo2-runs.csv`, `tests/evals/pignolo2-grades.json` y `pignolo2` |

2. Entrá una sola vez con el `configDir` de la medición (PowerShell):

```powershell
$env:CLAUDE_CONFIG_DIR = "<configDir>"; claude
# dentro: /login
```

Si hay una `ANTHROPIC_API_KEY` en el entorno, `claude` usa esa clave en vez del login: quitala del entorno de la sesión si no querés que la medición se facture por API.

## Carpeta privada

```
<privateRoot>/
  <task>/
    prompt.md          consigna textual que se le pasa a claude -p
    base.txt           commit (o ref) de partida en sourceRepo
    accept/**          tests de aceptación; se copian al repo de la corrida con la misma ruta relativa a accept/
    accept-cmd.txt     un solo comando de shell que corre los tests de aceptación (en la raíz del repo)
    full-cmd.txt       un solo comando de shell que corre la suite completa del proyecto
  blind/<task>/        lo genera `blind` (paquetes, clave, consigna del revisor)
```

En `accept-cmd.txt` y `full-cmd.txt` se puede usar `{json}`: se reemplaza por una ruta entre comillas para que el corredor escriba su reporte JSON (por ejemplo `npx vitest run --reporter=json --outputFile={json} ...`). Con `{json}` el conteo sale de `numPassedTests` / `numFailedTests`. Sin él se lee la línea resumen (vitest, jest o node:test) y, si no se reconoce, se usa el código de salida (1/0 o 0/1) y la fila del CSV lo avisa en `note`.

## Un ciclo completo

```powershell
node tests/evals/harness/run.mjs prepare --task T --arm A --rep 1
node tests/evals/harness/run.mjs run     --task T --arm A --rep 1    # gasta tokens
node tests/evals/harness/run.mjs accept  --task T --arm A --rep 1
node tests/evals/harness/run.mjs row     --task T --arm A --rep 1
```

Intercalá los brazos (A, B, A, B...) como pide la ficha. Todos los comandos aceptan `--config <ruta>`.

| Comando | Qué hace |
|---|---|
| `prepare` | exporta el commit base con `git archive \| tar -x`, borra `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`, `.mcp.json` y cualquier `.claude/` (también anidados), escribe el `CLAUDE.md` neutral (`neutral-claude.md`), enlaza `node_modules` de la fuente como junction, copia `copyDirs`, y hace `git init` con identidad local `eval` y un commit `base` (etiqueta `base`) en `main`. `node_modules` y `copyDirs` quedan en `.git/info/exclude`. No pisa una carpeta existente. |
| `run` | lee `prompt.md`, lanza `claude` con `cwd` en el repo de la corrida y `CLAUDE_CONFIG_DIR`, guarda `stream.jsonl` y `stderr.txt`, mide el tiempo de pared, mata el árbol de procesos al pasar `timeoutMs` y escribe `metrics.json`. No se puede correr dos veces la misma carpeta. |
| `accept` | calcula **primero** el resumen de cambios (`changes.json`, `changes.patch`), **después** copia los tests de aceptación y corre `accept-cmd.txt` y `full-cmd.txt`; escribe `acceptance.json`. Repetirlo conserva el primer resumen. |
| `row` | agrega una fila a `pignolo2-runs.csv`. Rechaza otra fila de la misma tarea/brazo/repetición salvo con `--note rerun`. |
| `blind --task T --reps 1,2,3` | arma `blind/T/pack-<k>/{diff.patch,meta.json}` con etiquetas `X`, `Y`, `Z`... en orden mezclado con la semilla, la clave `key.json` aparte, `grader-prompt.md` y `task-prompt.md`. Quita del diff las carpetas de proceso de `blindExcludePaths` y se detiene si el diff aún nombra a algún plugin (`--allow-leaks` lo fuerza). `--force` regenera. |
| `unblind --task T --input salida.json` | pasa la salida JSON del revisor (una lista de `{label, serious_findings, correctness, quality}`) a `pignolo2-grades.json` usando la clave. |
| `summary [--csv ...] [--grades ...] [--medium a,b] [--small c] [--json] [--include-contaminated]` | mediana y rango por tarea y brazo, y la regla de decisión. |

### Revisor a ciegas

El revisor corre **en Opus, en una corrida aparte** (otra sesión que no ve `key.json` ni el CSV). Se le da `grader-prompt.md`, `task-prompt.md` y los `pack-<k>`; devuelve un JSON por paquete: `{ "label", "serious_findings": [...], "correctness": 0-5, "quality": 0-5 }`. Eso se pasa a `unblind`.

### Regla de decisión que aplica `summary`

- **Tarea mediana (`medium`):** si los rangos de tokens ponderados de A y B se pisan, "sin diferencia demostrada". Si no: B pasa solo si la mediana de tokens de B es menor o igual a 1,5 veces la de A **y** la calidad es igual o mejor (mediana de nota, hallazgos graves y tests de aceptación que pasan, todos no peores que A); si falta `grades.json`, queda "pendiente".
- **Tarea chica (`small`):** la mediana de tiempo de pared y de tokens ponderados de B debe ser menor o igual que la de A y el resultado de B correcto en todas sus corridas. Un exceso con rangos que se pisan es "sin diferencia demostrada" (riesgo abierto); sin pisarse, "no pasa".
- Evidencia: **E2** con menos de 3 repeticiones por brazo, **E3** desde 3. Nunca se imprime una cifra sin su rango.
- Las corridas repetidas (`rerun`) reemplazan a la original en las cifras; las dos quedan en el CSV. Las corridas contaminadas se excluyen y se nombran. Las cortadas por tiempo entran y se nombran.

## Calibración: qué verificar en la primera corrida real

Antes de la primera corrida válida, correr una chica por brazo y comprobar:

1. **Flags de `claude -p`.** Los verificados con `claude --help` (2.1.302): `-p`, `--model`, `--plugin-dir` (repetible, no variádico), `--permission-mode` (con `bypassPermissions`), `--output-format stream-json`, `--verbose`, `--max-budget-usd`, `--no-session-persistence`. No se pasa `--bare` (saltaría los hooks de los plugins, que son parte del brazo). Si alguna versión nueva cambia un flag, se ajusta en `buildArgv` (`execute.mjs`) o con `extraArgs`.
2. **Tokens de subagentes.** `metrics.json` guarda `tokens` (suma de `modelUsage`, que debería incluir subagentes) y `usageMainThread` (campo `usage` del mensaje `result`). Si en una corrida con subagentes ambos son iguales, `modelUsage` no suma los subagentes y hay que sumar el uso desde los mensajes del stream. Si el resultado no trae `modelUsage`, se usa `usage` y la fila lo avisa (`tokens-solo-hilo-principal`).
3. **Cantidad de agentes.** Se cuentan los `tool_use` de nombre `Agent` o `Task` (sin repetir ids) en todo el stream; `agentsMain` cuenta los del hilo principal. Verificar con un stream real que los subagentes aparecen y que los nombres coinciden.
4. **Contaminación.** Se mira el mensaje `system/init` (`plugins`, `skills`, `agents`, `slash_commands`) y los demás mensajes `system` que apunten a la carpeta del otro plugin. Verificar en un stream real que `plugins` lista el plugin del brazo (`ownPluginLoaded: true`) y no el otro. Si `configDir` tiene plugins instalados, van a aparecer ahí.
5. **Pesos.** `weights` (por defecto entrada 1, salida 5, caché leída 0,1, caché escrita 1,25) son una aproximación de los precios relativos. Hay que calibrarlos con la tarifa vigente **antes de la primera corrida válida** y no cambiarlos después. Cada `metrics.json` guarda los pesos usados.
6. **Costo.** `cost_usd` es `total_cost_usd` del mensaje `result`; con login de suscripción puede venir como estimación.
7. **Permisos.** Con `bypassPermissions` el agente corre comandos sin pedir permiso, en la carpeta de la corrida. No lo uses fuera de una carpeta descartable.

## Límites

- Un agente que instale paquetes escribe en el `node_modules` de la fuente (la junction apunta ahí).
- Los cambios dentro de `node_modules` y `copyDirs` no cuentan en el resumen de cambios.
- Los diffs a ciegas excluyen las carpetas de proceso de cada método (`blindExcludePaths`); un método que deje otros rastros distintivos en el código puede delatarse igual. `blind` avisa si el diff nombra a un plugin, no detecta el estilo.
- El revisor ve el diff y la consigna, no el repo completo.
- Para borrar una carpeta de corrida con seguridad: `cmd /c rmdir <run>\repo\node_modules` (quita solo el enlace) y después borrá la carpeta. El arnés nunca borra carpetas de corridas existentes.
- Para repetir una corrida: mové la carpeta vieja (`<tarea>-<brazo>-<rep>` a `...-old`), volvé a `prepare` y anotá `--note rerun` en `row`.
