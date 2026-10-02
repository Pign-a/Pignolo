# Benchmarks: cuánto cuesta y cuánto rinde trabajar con agentes

Datos medidos al construir pignolo, pensados como referencia para quien trabaja con Claude Code sin plugins o con plugins de metodología como [superpowers](https://github.com/obra/superpowers). Cada fila dice **contra qué** se compara y **qué tan comparable** es. Lo que todavía no se midió figura como pendiente; no se completa con estimaciones.

Entorno de todas las mediciones: Windows 11, Claude Code 2.1.285, modelos Opus 5.5 y Sonnet 5.5, 2026-09-30. Los costos en USD son los que informa `claude plugin eval` o `claude -p`; los tokens de agentes salen de lo que informa cada subagente al terminar.

## 1. Revisar un plan antes de construirlo

Un plan real de pignolo (el del hito 4a, primera versión) con 14 errores conocidos, revisado por distintos métodos. Recall contado a mano.

| Método | Equivale a | Opus | Sonnet | USD por plan | Tiempo |
|---|---|---|---|---|---|
| Un revisor que lee el plan y el código | Pedirle a Claude Code "revisá este plan" | 33 % | 21 % | 1,10 / 0,45 | 2,4 / 1,3 min |
| Dos pasos: el revisor lista los supuestos a verificar y un segundo agente los prueba, obligado por un hook | El `plan-auditor` de pignolo (hito 5) | **38 %** | 29 % | 1,45 / 0,62 | 4,6 / 2,7 min |
| Dos pasos con sondas fijas de riesgos conocidos | Idem, con pruebas deterministas | **45 %**\* | 24 % | 0,92 / 0,31 | 2,4 / 1,2 min |
| Construir el plan entero en una copia para validarlo (replay) | Lo que hacíamos antes; superpowers pide planes con el código completo, sin exigir el replay | — | — | ~450 mil tokens | 45–80 min |

| Dos pasos en despachos separados (revisor, después un agente que solo experimenta) vs un solo agente que hace las dos cosas | A/B del diseño del `plan-auditor` | 46 % vs 32 % | 18 % vs 4 % | 2,09 vs 1,74 / 0,47 vs 0,35 | ~8 vs ~5 min |

\* Parte de ese 45 % viene de sondas armadas con errores ya conocidos de este mismo caso; sin esas, ~38 %.

**Comparabilidad:** alta entre las filas 1 a 3 (mismo plan, mismo código, mismas reglas de conteo). La fila 4 se midió en planes distintos. Detalle y límites: [`tests/evals/RESULTS-planes.md`](../tests/evals/RESULTS-planes.md).

**Lectura práctica:** para revisar planes, opus encuentra entre 1,5 y 3 veces más que sonnet. Obligar a verificar con experimentos encuentra errores que ninguna lectura vio, como `npm` sin shell en Windows. Ningún método de una sola pasada se acerca a una auditoría con tiempo para experimentar.

## 2. Escribir y ejecutar un hito

Dos hitos de pignolo de tamaño parecido, 8 tareas cada uno, con implementadores en paralelo y una revisión final opus.

| Fase | Hito 4a (método anterior) | Hito 4b (método liviano) | Diferencia |
|---|---|---|---|
| Escribir el plan | escrito a mano por el orquestador | ~459 mil tokens (todavía con replay) | — |
| Escribir el plan siguiente (hito 5, 19 tareas) | — | **~273 mil tokens, en tarjetas y sin replay** | ≈ 40 % menos que el plan 4b con replay |
| Validar el plan | 1 auditor opus, ~190 mil | 2 pasos con experimentos, ~413 mil, más ~239 mil para corregirlo | más caro, pero atrapa antes |
| Ejecutar las 8 tareas | ~1,01 millones | ~0,78 millones | **≈ 23 % menos** |
| Revisión final: hallazgos | 1 crítico, 4 importantes | **0 críticos, 2 importantes** | menos problemas llegan al final |

| Ejecutar un hito cuyo plan ya trae el código verificado (pignolo-ui hito 3, 7 tareas) | — | **~145 mil tokens con un solo ejecutor en serie** (el plan costó ~405 mil) | frente a ~0,78 millones del 4b en paralelo |

**Comparabilidad:** media. Los hitos no son idénticos y el 4b se benefició de lo aprendido en el 4a. Sirve como tendencia, no como A/B.

## 2b. Ejecutar en serie o en paralelo (A/B con un plan real)

Las mismas 4 tareas reales (hito 4a, ola 1), misma base y mismas tarjetas, calificadas con los tests finales que dejó la revisión (180):

| Forma | Tiempo de pared | Tokens | Calidad |
|---|---|---|---|
| 4 implementadores sonnet en paralelo | ~28 min | ~531 mil | 148/180 |
| 1 ejecutor sonnet en serie | ~32 min | ~272 mil | 151/180 |
| Ejecución original (paralelo, opus en las 2 tareas difíciles) | ~22 min | ~0,58 millones | 150/180 |

**Lectura práctica:** el paralelo es ≈ 15 % más rápido y cuesta ≈ 2 veces más, con la misma calidad. El modelo del implementador tampoco cambió la calidad: los defectos que quedan son huecos del plan que solo encuentra la revisión. Conviene ejecutar en serie con sonnet y poner opus en validar el plan y revisar. Detalle: [`RESULTS-ejecucion.md`](../tests/evals/RESULTS-ejecucion.md).

## 2c. Cuántas veces correr los tests antes de unir

600 merges simulados con tests inestables de probabilidad conocida, node:test real (coincide con 1−(1−p)^k):

| Política | Tiempo | Detecta un test que falla el 5 % / 20 % / 50 % de las veces |
|---|---|---|
| 1 corrida | 1,0× | 5 % / 20 % / 53 % |
| 2 si el cambio toca tests | 1,5× | 7 % / 28 % / 66 % |
| Siempre 3 | 3,0× | 13 % / 49 % / 88 % |
| 1 corrida + repetir solo lo que falló + 3 corridas de los tests tocados | ~1,5× | como 3 corridas en lo que cambiaste, sin rojos falsos por tests viejos inestables |

## 2d. Costo por tipo de trabajo con el método liviano (2026-09-30 y 2026-10-01)

Tokens y tiempo que informa cada subagente al terminar, sobre trabajo real de pignolo. Son mediciones de una sola corrida, no A/B: sirven para presupuestar.

| Trabajo | Modelo | Tokens | Tiempo | Herramientas |
|---|---|---|---|---|
| Ejecutar una parte de hito (5b: 5 tareas, cartas, 2 skills, plantillas, casos de eval), un ejecutor en serie | sonnet | ~276 mil | 16 min | 90 |
| Escribir un plan en tarjetas (hito 8, 14 tareas, 20 rulings) | sonnet | ~251 mil | 12 min | 24 |
| Escribir un plan de banco (comparación con Claude Code solo, 8 tarjetas) | sonnet | ~108 mil | 3 min | 10 |
| Corregir un plan con su auditoría (hito 6: 3 tareas; hito 7: 21 hallazgos) | sonnet | ~157 mil / ~176 mil | 5 / 7 min | 30 / 23 |
| Sumar una función nueva a un plan con su propuesta de spec (hito 7, 4 tareas) | sonnet | ~210 mil | 7,5 min | 31 |
| Auditoría paso 1, revisor que lista hallazgos y supuestos (plan UI4 / plan hito 8) | opus | ~250 mil / ~181 mil | 10 / 6 min | 36 / 30 |
| Auditoría paso 2, experimentos sobre 17 supuestos (plan hito 7) | opus | ~117 mil | 3,6 min | 25 |
| Revisión final de una parte de hito (5a, 14 tareas) | opus | ~188 mil | 6,6 min | 42 |
| Pasada de arreglos de esa revisión (9 hallazgos, cada uno con rojo) | sonnet | ~152 mil | 8 min | 53 |
| Investigar una decisión: convención, alternativas y un atacante por alternativa (D-7-7, 9 ataques reales) | opus | ~161 mil | 8,3 min | 34 |
| Ejecutar un hito de flujos con agentes y skills (pignolo-ui hito 4, 12 tareas), un ejecutor en serie | sonnet | ~494 mil | 68 min | 201 |
| Ejecutar una parte de hito que escribe en el repo del usuario (hito 8a, 12 tareas) | sonnet | ~419 mil | 53 min | 175 |
| Terminar un hito desde la Task 8 (hito 6, 4 tareas más dos cierres) | opus | ~311 mil | 38 min | 141 |
| Revisión final de un hito (hito 6 / pignolo-ui 4 / hito 8a) | opus | ~215 mil / ~263 mil / ~198 mil | 15 / 17 / 21 min | 51 / 73 / 34 |
| Pasada de arreglos (hito 6: 1 crítico y 11 más / pignolo-ui 4: 1 crítico y 13 más) | sonnet | ~254 mil / ~210 mil | 38 / 19 min | 109 / 81 |
| Poner una rama al día con `main` resolviendo conflictos (hito 8a sobre el hito 6) | sonnet | ~91 mil | 6 min | 14 |
| Auditoría independiente de buenas prácticas de todo el proyecto, con fuentes | fable | ~399 mil | 10 min | 70 |
| Debate a favor y en contra sobre esa auditoría (dos agentes) | opus | ~194 mil + ~206 mil | 5 min cada uno | 23 + 23 |
| Evals pagas de tres agentes (hito 5: 35 corridas, 7 casos) | opus | 6,07 USD | — | — |
| Ejecutar la etapa 1 del lienzo de pignolo-ui (8 tareas, ~183 tests, conversor, índice y publicación con filtro) | sonnet | ~567 mil | 68 min | 204 |
| Revisión final de esa etapa (1 crítico, 6 importantes, 15 menores) y su pasada de arreglos | opus / sonnet | ~359 mil / ~295 mil | 29 / 36 min | 70 / 112 |
| Ejecutar el hito 8b (casos de eval del `debugger`, contrato con el banco, cierre) con sus evals pagas | sonnet | ~264 mil | 58 min | 101 |
| Retomar un hito cortado por límite desde trabajo sin commitear (hito 8d: 5 tareas que faltaban; hito 7a: 4 tareas y la unión con `main`) | sonnet | ~250 mil / ~119 mil | 41 / 58 min | 111 / 39 |
| Cambio chico con contrato (reglas del brainstorming en `plan`, verbo de decisiones, segunda fuente del `spec-reviewer`): implementar, revisar y arreglar | sonnet / opus / sonnet | ~201 mil / ~166 mil / ~138 mil | 13 / 20 / 25 min | 73 / 30 / 42 |
| **Un plan que cambió de alcance cuatro veces mientras se escribía** (lienzo 4c: escribir, corregir, auditar en dos pasos, corregir, segunda auditoría, corregir, partir en etapas) | sonnet y opus | **~2,0 millones** en total (escritura 225 mil; correcciones 182 + 281 + 281 + 347 mil; auditorías 207 + 159 + 325 mil) | ≈ 2 h de agentes | — |
| Plan de riesgo completo (hito 8d: escribir, auditar en dos pasos con experimentos reales, corregir y recortar de ~172 a ~120 tests) | sonnet y opus | ~822 mil (176 + 217 + 194 + 235 mil) | ≈ 39 min | — |
| Investigación con fuentes y propuesta (estructura de carpetas / tres skills de diseño / impeccable a fondo / diseño del brainstorming) | opus | ~128 mil / ~230 mil / ~302 mil / ~158 mil | 6 / 6 / 11 / 5 min | 14 / 39 / 38 / 23 |
| Evals pagas del día: agentes de pignolo-ui (25 casos-corrida útiles, dos rondas), `debugger`, A/B del brainstorming (8 corridas) | opus y sonnet | 21,85 + 2,77 + 9,28 USD | — | — |

**Lectura práctica:** un hito completo con el método liviano (plan ~250 mil, auditoría en dos pasos ~370 mil, corrección ~170 mil, ejecución ~280 mil por parte, revisión ~190 mil, arreglos ~150 mil) ronda 1,4 a 1,7 millones de tokens, contra los ~2,5 a 3 millones del método anterior con replay y revisión por tarea (sección 2). La revisión final del 5a, con el plan auditado antes, encontró 0 críticos y 3 importantes; la del 4a, sin auditoría con experimentos, 1 crítico y 4 importantes.

## 2e. Opciones de UI: HTML local o lienzo "Design", sonnet u opus (2026-10-01)

Cuatro pantallas con el mismo brief, un agente por brazo, una corrida cada uno. Detalle y tabla de funcionalidades: [`tests/evals/RESULTS-lienzo.md`](../tests/evals/RESULTS-lienzo.md).

| Brazo | Tokens | Tiempo | Resultado |
|---|---|---|---|
| HTML local, sonnet | ~76 mil | 67 s | Completo, un reintento |
| HTML local, opus | ~84 mil | 145 s | Completo al segundo intento (el primero informó archivos que no existían) |
| Lienzo publicado, sonnet | ~91 mil | 53 s | Publicado sin rechazos |
| Lienzo publicado, opus | ~106 mil | 170 s | Publicado sin rechazos |

**Lectura práctica:** publicar en el lienzo cuesta ≈ 20–27 % más tokens que el HTML local y no tarda más; opus gasta 10–17 % más y tarda 2–3 veces más que sonnet, con opciones que el autor encontró algo mejor estructuradas. Una corrida por brazo: orden de magnitud.

## 2f. Brainstorm antes del spec: el paso de hoy o una skill con árbol de decisiones (2026-10-01)

Un pedido real con verdad conocida (el lienzo "Design" de pignolo-ui y 10 decisiones que el autor tomó después), un autor simulado que solo contesta lo que se le pregunta, opus, 3 corridas por brazo; el borrador corregido, 2 corridas contra la misma línea de base.

| Brazo | Preguntas al autor | Palabras del autor | Decisiones posteriores cubiertas (de 10) | Contrarias sin marcar | USD por corrida | Minutos |
|---|---|---|---|---|---|---|
| Paso 2 de hoy (una línea) | 4,3 | 88 | 5,0 (4 a 6) | 0,3 | 0,95 | 3,1 |
| Borrador de la skill `brainstorm` (55 líneas) | 2,7 | 72 | 3,3 (1 a 6) | 1,7 | 1,28 | 3,9 |
| Borrador corregido (un "ok" no confirma supuestos; las decisiones viejas se vuelven a preguntar), 2 corridas | 5,0 | 55 | 4,5 (3 a 6) | 0 | 1,27 | 4,9 |

**Lectura:** el borrador no ganó: cubrió menos decisiones y costó ≈ 35 % más. Tomó un "ok" a su resumen como confirmación y trató decisiones viejas del repo como hechos; su lote de supuestos fue lo que más rindió. Ningún brazo preguntó algo que el repo ya contestaba. El borrador corregido arregló las dos fallas (0 decisiones contrarias en silencio, menos palabras del autor) y subió a 4,5, pero no cubre más que el paso de hoy y cuesta ≈ 34 % más: con la regla fijada antes de correr, tampoco gana. Se queda el paso de hoy más las reglas baratas.

**Comparabilidad:** un solo pedido, un autor simulado y 3 corridas por brazo, con una dispersión mayor que la diferencia: orden de magnitud. El paso de hoy no se volvió a correr para la segunda medición. Conteo validado a mano. Gasto: 9,28 USD. Evidencia: [`RESULTS-brainstorm.md`](../tests/evals/RESULTS-brainstorm.md).

## 2g. Dónde se va el tiempo del ciclo ejecutar → revisar → arreglar (2026-10-01)

Validación de seis cambios de método con tres agentes opus (datos del repo, atacante, fuentes externas). No es un A/B. Detalle: `tests/evals/RESULTS-metodo.md`.

| Qué | Medido |
|---|---|
| Parte del ciclo que es ejecutar (hitos grandes) | 51 a 65 % |
| Parte del ciclo que es arreglar | 18 a 43 % |
| Corridas de la suite completa por ciclo | 3 a 5, de 3,3 a 11,8 min bajo carga (1,7 a 1,8 min con la máquina tranquila): 10 a 20 % del ciclo |
| Piso de una revisión opus | ≈ 150 a 160 mil tokens y 8 a 20 min, aunque el diff sea de ~400 líneas |
| Tests en lo que agrega una pasada de arreglos | 60 a 89 % de las líneas |
| Hallazgos graves que caen en clases repetidas | 12 de 48 (25 %) |

Adoptado con resguardos: suite completa una vez por rama, hallazgos como tests que fallan, revisión por grupo de hitos chicos, lista de autochequeo. No adoptado: retomar al ejecutor para los arreglos (gasta más tokens) y un formato telegráfico (0,5 a 1,5 %). Ahorro estimado, sin medir: 15 a 25 % de pared en un hito grande y 25 a 40 % en un grupo de chicos. Costo de la validación: ≈ 415 mil tokens, 14 min de agentes.
## 3. Agentes que revisan código

Defectos plantados en diffs chicos y sintéticos, 5 corridas por caso.

| Agente | Opus | Sonnet | Costo por corrida | Velocidad |
|---|---|---|---|---|
| Revisores (4 lentes y 2 jueces) | 60/60 corridas, 30/30 defectos, 0 falsas alarmas | 58/60, 30/30, 0 | 0,08–0,12 / 0,05–0,07 USD | sonnet ≈ 37 % más rápido |
| Agente que escribe tests | 10/10 | 10/10 | 0,08 / 0,06 USD | 23–26 s / 16–22 s |
| Agente que busca la causa de un fallo (`debugger`), en el sandbox de Linux, 3 casos con defecto plantado | 9/15 por los graders (3/5 por caso); las 6 reprobadas leídas a mano eran informes correctos que el grader rechazó por la redacción (sin medición válida hasta recalibrar) | no medido | 0,14–0,16 USD | 31–50 s |
| Agentes que corren comandos (implementer, review-testability, refuter, fixer), en el sandbox de Linux | 25/25 | 10/10 | 0,09–0,17 / 0,09 USD | 26–52 s / 20 s |

**Comparabilidad:** mide si los agentes cumplen su contrato, no si pignolo mejora a Claude Code. Evidencia: [`RESULTS-hito-3.md`](../tests/evals/RESULTS-hito-3.md), [`RESULTS-hito-4.md`](../tests/evals/RESULTS-hito-4.md), [`RESULTS-hito-8.md`](../tests/evals/RESULTS-hito-8.md) (debugger).

## 3b. Agentes de pignolo-ui (`ui-auditor`, `ui-option`) (2026-10-01)

Fixtures sintéticos, 5 corridas por caso; `ui-auditor` en opus y `ui-option` en sonnet. Dos corridas: la primera quedó parcial (el límite de sesión cortó 14 corridas); la segunda, con la gravedad de juicio acotada (pignolo-ui 0.6.3), cerró las páginas limpias y dos de los tres casos cortados.

| Agente | Corridas | Costo por corrida | Velocidad |
|---|---|---|---|
| `ui-option` (mockup, style tile, mejora) | 15/15 | 0,06–0,09 USD | 19–44 s |
| `ui-auditor`, defectos sembrados (color, foco, ancho a 320 px, acción primaria, campo sin etiqueta) | color y campo 5/5 (primera corrida); acción primaria 5/5 y ancho a 320 px 3/3 (segunda); foco sin corrida completa (1/1) | 0,27–0,31 USD | 69–98 s |
| `ui-auditor`, páginas limpias | primera corrida 9/15 (5/5, 1/5, 3/5): marcaba `alto` un criterio de juicio que el fixture no sembró; con la regla "`J-nn` sin medida vale a lo sumo `medio`" (carta y validador) 10/10 en las dos páginas que fallaban | 0,28–0,30 USD | 82–117 s |

**Comparabilidad:** mide si cumplen su contrato, no si mejoran a Claude Code. Falta la corrida completa de un caso de defecto (`state-04`). Gasto: 21,85 USD de 22. Evidencia: [`RESULTS-ui-hito-4.md`](../plugins/pignolo-ui/tests/evals/RESULTS-ui-hito-4.md).

## 4. Guardia de comandos destructivos

| Medida | Resultado |
|---|---|
| Comandos destructivos o indirectos de una auditoría independiente (bash y PowerShell) | 186: 173 negados, 1 confirmado, 12 que pasan, todos declarados |
| Comandos reales de uso diario | 5.981: 0 bloqueos falsos en los de todos los días; 0,65 % de confirmaciones de más en modo interactivo |

Claude Code sin plugins pide permiso según su modo, pero no analiza el comando. La guardia de pignolo sí lo analiza: bash estructural y PowerShell por su árbol de sintaxis.

## 5. Pendiente: pignolo contra Claude Code solo

La comparación directa (los mismos pedidos, con y sin pignolo, midiendo defectos que llegan al final, costo y tiempo) es una decisión del autor del 2026-09-29: se corre al terminar el plugin y se publica acá, sea cual sea el resultado.
