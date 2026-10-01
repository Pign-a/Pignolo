# Gaps de mejora detectados al ejecutar

Archivo vivo (pedido del autor, 2026-09-30): lo que aprendemos ejecutando los planes de pignolo y que pignolo podría hacer mejor para sus usuarios. Objetivo: ejecutar planes con baja probabilidad de error **sin que cueste mucho más**. Cada gap lleva la evidencia medida, una propuesta y su costo. Cuando un gap entra en un hito, se anota a cuál.

Estados: **abierto** · **en plan** (hito) · **hecho** (versión).

## Planes y su validación

| # | Gap | Evidencia | Propuesta | Costo | Estado |
|---|---|---|---|---|---|
| G1 | Construir el hito en una copia para validar el plan duplica el trabajo | Plan 4b con replay: ~459 mil tokens, 45 min; plan del hito 5 con tarjetas: ~273 mil (≈ 40 % menos) | Planes en tarjetas; validar con el método medido (G2) | Ahorro | hecho (método liviano, CLAUDE.md) |
| G2 | Un revisor que solo lee encuentra un tercio de los errores de un plan real | `tests/evals/RESULTS-planes.md`: opus 33 %, dos pasos con verificación obligada 38–45 % | `plan-auditor` en dos pasos: supuestos estructurados, sondas fijas y experimentos forzados por hook | ~1,5–2,5 USD por plan | en plan (hito 5) |
| G3 | Las sondas fijas se disparan con supuestos que no tienen que ver | Auditoría del plan 4b: 4 "hallazgos" de sondas, todos falsos (la sonda de `npm` sin shell se disparó con `node --test`) | Disparadores precisos (por API y argumento, no por palabra suelta) y sonda que diga "no aplica" | Bajo | en plan (hito 5) |
| G4 | `plan-check` da falsas alarmas con lo que el plan va a crear | 20 falsas alarmas en el plan 4a v1 | Ignorar lo marcado `Create` en las tarjetas | Gratis | en curso (`fix/plan-check-create`) |
| G5 | Un plan escrito antes de una pasada de arreglos se desfasa del código | Plan 4b: parte del diff de la Task 11 ya no aplicaba y un test ya pasaba (C1) | Antes de ejecutar, revalidar el plan contra `main` (la misma auditoría en dos pasos) | Incluido en G2 | hecho en 4b; automatizar en el `plan-auditor` |
| G6 | La auditoría previa atrapa errores que, si no, aparecen en la revisión final | Revisión final del 4a: 1 crítico + 4 importantes; del 4b (plan auditado en dos pasos): 0 + 2 | Mantener la auditoría en dos pasos antes de ejecutar | ~0,4 millones de tokens | hecho |

## Ejecución y compuertas

| # | Gap | Evidencia | Propuesta | Costo | Estado |
|---|---|---|---|---|---|
| G7 | Un exit 2 de un script no dice por qué: el orquestador lo lee mal | Revisión 4b: exit 2 de `sabotage.js` sin `greenBefore: false` terminaba en `--no-red` y un test decorativo aprobado | Campos estructurados de razón (`refused: patch`, `greenBefore`, `timedOut`) en toda salida de script que una skill interpreta | Bajo | en curso (0.6.1) |
| G8 | Varias suites en paralelo dan fallas de tiempo que parecen reales | 4a y 4b: 3 a 24 fallas por carga en implementadores paralelos, todas pasaron solas | Implementadores corren solo sus archivos; la suite completa una vez al unir, con la máquina tranquila | Ahorro | hecho (método); sumar `test:quiet` con menos concurrencia |
| G9 | Un agente en segundo plano repite su informe en bucle | Task 1 del 4a: ~40 informes iguales | El brief pide "responder una sola vez y no dejar procesos vivos" | Gratis | hecho (en los briefs) |

## Evals

| # | Gap | Evidencia | Propuesta | Costo | Estado |
|---|---|---|---|---|---|
| G10 | Graders que exigen la redacción literal reprueban trabajo correcto | `wrote-test` (import con `path.join`) y `red-not-verified` ("Red is not verified") | Estricto donde una máquina parsea; tolerante con la redacción donde el texto es una señal (spec §15) | Gratis | hecho (0.6.0) |
| G11 | Un calificador por palabras clave infla el recall | Prueba de planes: 79 aciertos automáticos contra 57 a mano | Límites de palabra y palabras clave específicas; validar a mano una muestra antes de publicar | Bajo | en curso (`fix/plan-check-create`) |
| G12 | El `PATH` de WSL con las carpetas de Windows rompe el sandbox de las evals con Bash | Calibración WSL2: "examining the PATH directories took longer than 5s" | El script de evals en WSL fija un `PATH` mínimo; documentarlo en el setup de WSL2 | Gratis | hecho (script); falta en la doc |
| G13 | WSL borra `/tmp` al reiniciar la sesión y se pierden las trazas | Traza de `implementer-old-test` perdida | Copiar las trazas a una carpeta persistente apenas termina cada corrida | Gratis | hecho (script) |
| G14 | `claude plugin eval` toma solo el último `--case` | Recalibración WSL2 | Una corrida por caso o por etiqueta; anotarlo en el runner | Gratis | abierto |
| G15 | `no-impl-read` no ve lecturas indirectas (Grep sin ruta, Glob `src/**`) | Revisión final 4b, medido con `grade()` | Calificar la fuga (una línea única de la implementación en los resultados del subagente), no la ruta | Bajo | abierto (no se cambia con evals corriendo) |
