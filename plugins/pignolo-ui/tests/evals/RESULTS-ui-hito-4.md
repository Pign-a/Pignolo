# Resultados de las evals del hito 4 de pignolo-ui (`ui-auditor`, `ui-option`)

Estado: **corrida completa frenada (2026-10-01): umbral 4/5 no cumplido en `clean-2` y `clean-3`, y 14 corridas cortadas por el límite de sesión.** Gasto 14,34 USD de 22. La primera calibración se frenó (freno iii); el autor relajó un grader y la recalibración dio 11/11. Ver las secciones siguientes. Decide el autor cómo seguir.

**Actualización (2026-10-01, segunda corrida, pignolo-ui 0.6.3):** con la gravedad de juicio acotada (sección al final) `clean-2` y `clean-3` pasaron 5/5, y los casos de defecto medidos, 5/5 y 3/3. Gasto total 21,85 USD de 22. Quedan sin corrida completa `defect-state-04`, `defect-color-03`, `defect-a11y-16` y `clean-1` (solo calibración 1/1 en esta versión; en la primera corrida color, campo y clean-1 habían dado 5/5).

Casos: `plugins/pignolo-ui/tests/evals/ui-cases.mjs` (8 de `ui-auditor`, 3 de `ui-option`, 3 briefs de ablación). Claude Code 2.1.285, Windows nativo con Git Bash por ruta absoluta (D-4-1), pignolo-ui 0.6.2 (main en 8d4119f). `ui-auditor` en opus, `ui-option` en sonnet. Umbral de la spec: al menos 4 de 5 corridas por caso. `generated/` y `results/` no se versionan; los temporales de `--keep-temp` se borraron tras leerlos.

## Tres problemas de entorno, no de los agentes

1. **`ENAMETOOLONG: name too long, uv_spawn`** con la carpeta del worktree (una ruta profunda de worktree (más de 100 caracteres)): ninguna corrida arranca, costo 0. Con el plugin copiado a una ruta corta (`C:\w\pu\pignolo-ui`, mismo contenido, sin `generated/`) anda. Desde PowerShell, `bash` es el de WSL y el scaffold falla (C-07); se corrió desde Git Bash.
2. **El sandbox de la eval quita `ProgramFiles` y `LOCALAPPDATA`**, así que el `fixture.sh` no encontraba Edge y las corridas de los fixtures salían con todo `unverified` (`no browser: no Chrome or Edge found`). Se corrigió en el generador (no en los graders): el `fixture.sh` exporta `PIGNOLO_UI_BROWSER` con el navegador hallado al generar. Además, el primer arranque de Edge en ese entorno puede perder la ventana de 15 s (`Browser.getVersion: no answer`): el fixture corre `measure` dos veces. Fixtures verificados: con `env -i` los casos `layout-11`, `state-04` y `color-03` dejan `fail` del id sembrado, y `j-01`, `a11y-16` y `clean-1` ninguno de navegador. El test determinista sigue 20/20.
3. **`Write` es una herramienta con permiso del operador**: la primera calibración de `ui-option` no pasó `--allow-tools Write` y el despacho se rechazó ("would be spawned with zero tools"). Costo 0,09 por los tres casos; se repitió con el permiso.

## Etapas

| Etapa | Comando (desde `C:\w\pu\pignolo-ui`, en Git Bash) | Costo (USD) | Resultado |
|---|---|---|---|
| Sonda 1 | `claude plugin eval . --eval-dir tests/evals/generated/ui --case ui-auditor-defect-color-03 --runs 1 --ablation none --scaffold --trust-plugin --keep-temp --no-publish --max-cost-usd 0.6 --json probe.json` | 0,217 | 12/13 graders; 18 eventos SUB (freno i cumplido). Falló `recall-seeded-defect` porque el fixture no tenía navegador (problema 2) |
| Sondas 2 y 3 | la misma, con `PIGNOLO_UI_BROWSER` exportado fuera del scaffold, y luego con el fixture corregido | 0,206 + 0,287 | 1/1 y 1/1. La segunda mostró el primer arranque de Edge fallido (`browser.json` degradado, captura y DOM bien) |
| Calibración (2026-10-01) | `… --tag agents --runs 1 -j 2 --ablation none --scaffold --trust-plugin --keep-temp --no-publish --max-cost-usd 4 --json calib.json` | 2,413 | **Freno iii:** 6 de 8 casos de auditor; los 3 de `ui-option` fallaron por el problema 3 |
| Calibración de `ui-option` | `… --tag option --runs 1 -j 2 … --allow-tools Write --max-cost-usd 1 --json calib-opt.json` | 0,237 | 3/3; archivos de salida verificados en las carpetas temporales |

Costo de las otras dos sondas de arranque (`ENAMETOOLONG`): 0. Antes de la calibración, el SHA de `ui-cases.mjs` (ya con la corrección del fixture) fue `c409b215…`; los graders no se tocaron en toda la corrida.

## Por caso (calibración, 1 corrida)

| Agente | Caso | Aciertos / corridas | USD | Segundos | Grader que falló |
|---|---|---|---|---|---|
| ui-auditor | defect-color-03 | 1/1 | 0,297 | 89 | ninguno |
| ui-auditor | defect-state-04 | 1/1 | 0,296 | 82 | ninguno |
| ui-auditor | defect-layout-11 | 1/1 | 0,328 | 91 | ninguno |
| ui-auditor | defect-j-01 | 1/1 | 0,274 | 85 | ninguno |
| ui-auditor | defect-a11y-16 | 1/1 | 0,288 | 105 | ninguno |
| ui-auditor | clean-1 | 1/1 | 0,281 | 115 | ninguno |
| ui-auditor | clean-2 | 1/1 | 0,263 | 137 | ninguno |
| ui-auditor | **clean-3** | **0/1** (6 de 7 graders) | 0,297 | 109 | `no-false-positive-judgment` |
| ui-option | mockup | 1/1 | 0,097 | 33 | ninguno |
| ui-option | style-tile | 1/1 | 0,084 | 31 | ninguno |
| ui-option | improve | 1/1 | 0,056 | 16 | ninguno |

Los 5 defectos sembrados fueron hallados (recall 5/5 en una corrida cada uno).

## Por qué falló `ui-auditor-clean-3`

La página "Novedades" (tres enlaces de noticias y "Ver todas", sin botón) es limpia para el piso de scripts: ningún `fail` de navegador. El auditor devolvió 4 hallazgos de juicio, entre ellos `J-01` de severidad `medio` ("ninguna acción destaca: 'Ver todas' se ve igual que los enlaces"), y otro `J-04` sobre enlaces `#uno`, `#dos`, `#tres` que no existen. El grader exige que no haya `J-01` en una página limpia. No hubo hallazgos `bloquea` ni `alto`, que es lo que pide la spec para el falso positivo. Es una discrepancia entre el fixture o el grader y la carta del agente (¿"limpia" = sin defecto sembrado, o sin ningún criterio de juicio discutible?), con el mismo patrón que `spec-reviewer-clean` del hito 5b (G10). Una sola corrida no mide la tasa. No se editó el grader (freno). Opciones para el autor: relajar el grader a "sin `J-01` de severidad `bloquea` o `alto`" (coherente con la spec), o rehacer la página con una acción primaria evidente y enlaces reales, y recalibrar.

## Frenos

| Freno | Estado |
|---|---|
| i. Sonda con al menos un evento SUB | cumplido (18) |
| ii. Graders sin cambios desde la calibración | cumplido (solo cambió el fixture, antes de calibrar) |
| iii. Calibración con todos los casos aprobados | **no cumplido: 10 de 11** (`ui-auditor-clean-3`) |
| iv. 5 × calibración ≤ tope restante | no evaluado (5 × 3,39 ≈ 16,9 entraría en los 18,6 restantes) |
| v. Tope por corrida | no se alcanzó |

Sin corrida completa ni ablación. Los 3 briefs de ablación no se corrieron.

## Cambio de grader por decisión del autor (2026-10-01)

Tras el freno iii el autor decidió relajar `no-false-positive-judgment` de los casos `ui-auditor-clean-*`. Motivo: una página sin defecto sembrado puede tener un criterio de juicio discutible (`J-nn`) de severidad media o baja sin que eso sea un falso positivo. Regla nueva: pasa si ningún hallazgo trae un `id` fuera de `J-nn`, `COLOR-02` y `LAYOUT-04` (los dos `fail` que `ui-check` marca de verdad en las tres páginas: colores y radios escritos a mano, sin `DESIGN.md`); `no-false-positive-bloquea-alto` sigue reprobando cualquier hallazgo `alto` o `bloquea`. Test determinista (`tests/eval-ui-cases.test.mjs`): un `J-01` medio pasa, un `J-01` alto o bloqueante reprueba, una regla que la página no tiene (`COLOR-03`) reprueba. Rojo demostrado contra el grader viejo ("one medium J-01 passes"); 20/20 con el nuevo. Commit `53ebe0c`.

## Recalibración del auditor (grader nuevo)

| Corrida | Costo (USD) | Resultado |
|---|---|---|
| `--tag auditor --runs 1 -j 2 --max-cost-usd 4` | 2,035 | 7/8: `defect-a11y-16` sin corrida (`scaffold failed`, 156 s: el arranque del navegador con dos corridas a la vez) |
| `--case ui-auditor-defect-a11y-16 --runs 1` | 0,275 | 1/1 |

Con `ui-option` (3/3 de la primera calibración), la calibración quedó 11/11. Freno iv: 5 × 2,55 = 12,7 ≤ 16,3 restantes. El SHA de `ui-cases.mjs` no cambió entre la recalibración y la completa.

## Completa (5 corridas por caso)

| Etapa | Comando | Costo (USD) |
|---|---|---|
| `ui-option` | `--tag option --runs 5 -j 2 --allow-tools Write --max-cost-usd 1.5` | 1,129 |
| `ui-auditor` | `--tag auditor --runs 5 -j 1 --max-cost-usd 12` | 7,516 |

| Agente | Caso | Aciertos / corridas | USD por corrida | Segundos por corrida | Umbral 4/5 |
|---|---|---|---|---|---|
| ui-option | mockup | 5/5 | 0,088 | 44 | pasa |
| ui-option | style-tile | 5/5 | 0,080 | 41 | pasa |
| ui-option | improve | 5/5 | 0,058 | 19 | pasa |
| ui-auditor | defect-color-03 | 5/5 | 0,309 | 87 | pasa |
| ui-auditor | defect-a11y-16 | 5/5 | 0,269 | 80 | pasa |
| ui-auditor | clean-1 | 5/5 | 0,296 | 85 | pasa |
| ui-auditor | **clean-2** | **1/5** | 0,286 | 95 | **no** |
| ui-auditor | **clean-3** | **3/5** | 0,283 | 82 | **no** |
| ui-auditor | defect-j-01 | 1/1 válida (4 sin servicio) | 0,060 | 38 | sin medir |
| ui-auditor | defect-layout-11 | 0/0 válidas (5 sin servicio) | 0 | 31 | sin medir |
| ui-auditor | defect-state-04 | 0/0 válidas (5 sin servicio) | 0 | 29 | sin medir |

**Corte de entorno:** HTTP 429 "You've hit your session limit" en 14 corridas (`j-01` 4, `layout-11` 5, `state-04` 5), sin despachar nada: no miden al agente. No se reintentó (freno).

**Fallas reales (`no-false-positive-bloquea-alto`, leídas de las trazas):** el auditor marcó un hallazgo de juicio con severidad `alto` en páginas limpias: en `clean-2` (4 de 5 corridas) `J-08:alto` (no se puede deshacer o salir sin perder el trabajo); en `clean-3` `J-04:alto` y `J-11:alto`. El resto de los hallazgos fue medio o detalle, más `COLOR-02` y `LAYOUT-04` medios. Es el mismo patrón que `clean-3` del primer corte: el auditor sube a `alto` criterios de juicio que el fixture no sembró. Decide el autor: bajar el tope de severidad de los `J-nn` en la carta del agente, relajar el grader (aceptar `alto` en `J-nn`) o rehacer las páginas limpias.

## Frenos (corrida completa)

| Freno | Estado |
|---|---|
| iii. Calibración con todos los casos aprobados | cumplido (11/11, con una repetición por timeout del scaffold) |
| iv. 5 × calibración ≤ tope restante | cumplido |
| Entorno: límite de sesión (429) | **cortó** 14 corridas de 3 casos de defecto |
| Umbral 4/5 | **no cumplido** en `clean-2` y `clean-3` |

Gasto total: **14,34 USD** de 22 (3,39 + 2,035 + 0,275 + 1,129 + 7,516). La ablación (3 briefs) no se corrió.

## Segunda corrida, con la gravedad de juicio acotada (pignolo-ui 0.6.3)

**Qué cambió (decisión del autor, 2026-10-01):** un hallazgo de criterio de juicio (`J-nn`) sin evidencia de script o de medida del navegador vale a lo sumo `medio`. Está en la carta del auditor, en `norms/base.md` y en la spec §10, y `auditor-output` lo hace cumplir: un `J-nn` `alto` o `bloquea` sin una entrada `ui-check` o `browser` en `fail` se rechaza (`judgment-without-measure`; se rechaza y no se baja, como los otros incumplimientos). El grader `no-false-positive-judgment` se dejó igual: sigue teniendo sentido (acepta `J-nn` de cualquier gravedad, y `no-false-positive-bloquea-alto` fija el tope), y su test determinista no cambió. Mismo entorno que arriba (Git Bash, copia en ruta corta `C:\w\pu2\pignolo-ui`, `--keep-temp --no-publish --json`, `--max-cost-usd` en cada corrida). Los casos no se tocaron.

| Etapa | Comando (resumen) | Costo (USD) | Resultado |
|---|---|---|---|
| Recalibración | `--tag auditor --runs 1 -j 2 --max-cost-usd 3.5` | 2,310 | 8/8 |
| clean-3 | `--case ui-auditor-clean-3 --runs 5 -j 1` | 1,419 | 5/5 |
| clean-2 | `--case ui-auditor-clean-2 --runs 5 -j 1` | 1,406 | 5/5 |
| defect-j-01 | `--runs 5 -j 1` | 1,455 | 5/5 |
| defect-layout-11 | `--runs 3 -j 1 --max-cost-usd 1.0` | 0,923 | 3/3 |

(Un primer intento con dos `--case` en el mismo comando corrió solo el último; por eso `clean-3` salió antes que `clean-2`.) Total de esta corrida: **7,513 USD** (tope restante 7,66). Gasto acumulado: 21,85 USD de 22. Sin frenos ni cortes de sesión.

| Caso | Aciertos / corridas | USD por corrida | Segundos | Antes |
|---|---|---|---|---|
| clean-2 | **5/5** | 0,281 | 117 | 1/5 |
| clean-3 | **5/5** | 0,284 | 85 | 3/5 |
| defect-j-01 | 5/5 | 0,291 | 92 | sin servicio |
| defect-layout-11 | 3/3 (no se llegó a 5 por el tope) | 0,308 | 98 | sin servicio |
| defect-state-04 | solo calibración 1/1 | 0,292 | 78 | sin servicio |
| color-03, a11y-16, clean-1 | solo calibración 1/1 | 0,265–0,306 | 69–81 | 5/5 |

**Verificado en las trazas** (hallazgos del auditor de cada corrida, leídos de los archivos de salida): en las 10 corridas limpias ningún `J-nn` pasó de `medio` (clean-2: J-05, J-06, J-08, J-10, J-11 en `medio` o `detalle`; clean-3: J-01, J-02, J-04, J-06, J-11 en `detalle` o `medio`), con `COLOR-02` y `LAYOUT-04` medios. En j-01 sigue hallando `J-01` (medio). En layout-11 hay `LAYOUT-11` `bloquea` con evidencia de navegador.

**Pendiente (decide el autor):** la corrida completa de `defect-state-04` (nunca medido en 5), completar `layout-11` a 5, y recorrer 5 veces color-03, a11y-16 y clean-1 si se quiere el umbral formal en esta versión; la ablación no se corrió. Los temporales `claude-eval-*` se borraron tras leerlos.
