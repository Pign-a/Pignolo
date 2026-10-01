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
| G18 | Un hook que fuerza experimentos no cuenta los comandos que fallan | Banco M6: un `Bash` con exit distinto de 0 no dispara `PostToolUse`, solo `PostToolUseFailure` | Registrar el contador en los dos eventos (ya hecho en `tests/bench/plans/hooks/require-experiments.js`); el `plan-audit-gate` del hito 5 debe hacer lo mismo | Gratis | hecho en el banco; verificar en el núcleo |

## Ejecución y compuertas

| # | Gap | Evidencia | Propuesta | Costo | Estado |
|---|---|---|---|---|---|
| G7 | Un exit 2 de un script no dice por qué: el orquestador lo lee mal | Revisión 4b: exit 2 de `sabotage.js` sin `greenBefore: false` terminaba en `--no-red` y un test decorativo aprobado | Campos estructurados de razón (`refused: patch`, `greenBefore`, `timedOut`) en toda salida de script que una skill interpreta | Bajo | en curso (0.6.1) |
| G8 | Varias suites en paralelo dan fallas de tiempo que parecen reales | 4a y 4b: 3 a 24 fallas por carga en implementadores paralelos, todas pasaron solas | Implementadores corren solo sus archivos; la suite completa una vez al unir, con la máquina tranquila | Ahorro | hecho (método); sumar `test:quiet` con menos concurrencia |
| G9 | Un agente en segundo plano repite su informe en bucle | Task 1 del 4a: ~40 informes iguales | El brief pide "responder una sola vez y no dejar procesos vivos" | Gratis | hecho (en los briefs) |
| G19 | Una compuerta que solo reconoce algunas formas de un comando falla abierta con las demás | Revisión final 5a: `scope-gate` dejaba llevar el plan a `main` con 8 formas (`rebase` con dos posicionales, `pull x:main`, `branch -M`, `checkout -B`...) y con `Git` en mayúsculas | Al escribir una compuerta, listar en la tarjeta todas las formas del verbo (sinónimos, mayúsculas, flags que cambian el destino) y testear una por forma; lo no reconocido que nombra la rama protegida, negar | Bajo (tests en la tarjeta) | abierto (0.8.2: `scope-gate` resuelve con git lo que lleva cada ref (cp/, sha, `FETCH_HEAD`, `ORIG_HEAD`, mayúsculas, compuestos; un test por forma); la lista de formas del verbo sigue siendo manual | 
| G20 | Un test escrito en la pasada de arreglos puede no discriminar aunque la regla diga "rojo demostrado" | Arreglo 5a: el test "git no disponible falla cerrado" pasa también con el arreglo revertido; lo informó el propio ejecutor | El informe de la pasada de arreglos lista los tests que no se pusieron rojos y el orquestador decide (reescribir o declarar) antes de unir | Gratis | abierto (deuda del 5a) |

## Evals

| # | Gap | Evidencia | Propuesta | Costo | Estado |
|---|---|---|---|---|---|
| G10 | Graders que exigen la redacción literal reprueban trabajo correcto | `wrote-test` (import con `path.join`) y `red-not-verified` ("Red is not verified") | Estricto donde una máquina parsea; tolerante con la redacción donde el texto es una señal (spec §15) | Gratis | hecho (0.6.0) |
| G11 | Un calificador por palabras clave infla el recall | Prueba de planes: 79 aciertos automáticos contra 57 a mano | Límites de palabra y palabras clave específicas; validar a mano una muestra antes de publicar | Bajo | en curso (`fix/plan-check-create`) |
| G12 | El `PATH` de WSL con las carpetas de Windows rompe el sandbox de las evals con Bash | Calibración WSL2: "examining the PATH directories took longer than 5s" | El script de evals en WSL fija un `PATH` mínimo; documentarlo en el setup de WSL2 | Gratis | hecho (script); falta en la doc |
| G13 | WSL borra `/tmp` al reiniciar la sesión y se pierden las trazas | Traza de `implementer-old-test` perdida | Copiar las trazas a una carpeta persistente apenas termina cada corrida | Gratis | hecho (script) |
| G14 | `claude plugin eval` toma solo el último `--case` | Recalibración WSL2 | Una corrida por caso o por etiqueta; anotarlo en el runner | Gratis | abierto |
| G16 | Implementadores en paralelo cuestan mucho más que un ejecutor en serie cuando el plan ya trae el código verificado | pignolo-ui hito 3: 7 tareas por ~145 mil tokens con un solo ejecutor sonnet; hito 4b: 8 tareas por ~780 mil en paralelo | Elegir el modo según el plan: código verificado → un ejecutor en serie; tarjetas que exigen criterio → paralelo | Ahorro | abierto (para el skill de ejecución, hito 5/7) |
| G17 | Una falla de eval sin traza no se puede explicar | `implementer-old-test` con opus falló una vez en la calibración WSL2; WSL vació `/tmp` | El runner de pignolo copia la traza de toda corrida fallada a una carpeta persistente | Gratis | abierto |
| G15 | `no-impl-read` no ve lecturas indirectas (Grep sin ruta, Glob `src/**`) | Revisión final 4b, medido con `grade()` | Calificar la fuga (una línea única de la implementación en los resultados del subagente), no la ruta | Bajo | abierto (no se cambia con evals corriendo) |
