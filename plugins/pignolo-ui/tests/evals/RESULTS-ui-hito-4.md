# Resultados de las evals del hito 4 de pignolo-ui (`ui-auditor`, `ui-option`)

Estado: **corrida frenada en la calibración (freno iii), 2026-10-01.** No hay corrida completa (5 por caso) ni ablación. Gasto: **3,39 USD** de un tope de 22 (D-4-1). Decide el autor cómo seguir.

Casos: `plugins/pignolo-ui/tests/evals/ui-cases.mjs` (8 de `ui-auditor`, 3 de `ui-option`, 3 briefs de ablación). Claude Code 2.1.285, Windows nativo con Git Bash por ruta absoluta (D-4-1), pignolo-ui 0.6.2 (main en 8d4119f). `ui-auditor` en opus, `ui-option` en sonnet. Umbral de la spec: al menos 4 de 5 corridas por caso. `generated/` y `results/` no se versionan; los temporales de `--keep-temp` se borraron tras leerlos.

## Tres problemas de entorno, no de los agentes

1. **`ENAMETOOLONG: name too long, uv_spawn`** con la carpeta del worktree (`C:\Users\pigna\.claude\jobs\17b1dadf\tmp\wt-evui\plugins\pignolo-ui\...`): ninguna corrida arranca, costo 0. Con el plugin copiado a una ruta corta (`C:\w\pu\pignolo-ui`, mismo contenido, sin `generated/`) anda. Desde PowerShell, `bash` es el de WSL y el scaffold falla (C-07); se corrió desde Git Bash.
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
