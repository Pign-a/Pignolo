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

**Comparabilidad:** media. Los hitos no son idénticos y el 4b se benefició de lo aprendido en el 4a. Sirve como tendencia, no como A/B.

## 3. Agentes que revisan código

Defectos plantados en diffs chicos y sintéticos, 5 corridas por caso.

| Agente | Opus | Sonnet | Costo por corrida | Velocidad |
|---|---|---|---|---|
| Revisores (4 lentes y 2 jueces) | 60/60 corridas, 30/30 defectos, 0 falsas alarmas | 58/60, 30/30, 0 | 0,08–0,12 / 0,05–0,07 USD | sonnet ≈ 37 % más rápido |
| Agente que escribe tests | 10/10 | 10/10 | 0,08 / 0,06 USD | 23–26 s / 16–22 s |

**Comparabilidad:** mide si los agentes cumplen su contrato, no si pignolo mejora a Claude Code. Evidencia: [`RESULTS-hito-3.md`](../tests/evals/RESULTS-hito-3.md), [`RESULTS-hito-4.md`](../tests/evals/RESULTS-hito-4.md).

## 4. Guardia de comandos destructivos

| Medida | Resultado |
|---|---|
| Comandos destructivos o indirectos de una auditoría independiente (bash y PowerShell) | 186: 173 negados, 1 confirmado, 12 que pasan, todos declarados |
| Comandos reales de uso diario | 5.981: 0 bloqueos falsos en los de todos los días; 0,65 % de confirmaciones de más en modo interactivo |

Claude Code sin plugins pide permiso según su modo, pero no analiza el comando. La guardia de pignolo sí lo analiza: bash estructural y PowerShell por su árbol de sintaxis.

## 5. Pendiente: pignolo contra Claude Code solo

La comparación directa (los mismos pedidos, con y sin pignolo, midiendo defectos que llegan al final, costo y tiempo) es una decisión del autor del 2026-09-29: se corre al terminar el plugin y se publica acá, sea cual sea el resultado.
