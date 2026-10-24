# Resultado del estudio A: la skill `work` con invocación forzada (2026-10-24)

Registro público del estudio A de la comparación preinscrita de 3 brazos. El diseño, las reglas de análisis y las limitaciones previstas están en [`RESULTS-comparacion-3-brazos.md`](RESULTS-comparacion-3-brazos.md) (secciones del estudio A, 6.1, 7.1 y 8.1, y las aclaraciones fechadas del 2026-10-24); acá no se repiten. Filas crudas: [`pignolo2-runs.csv`](pignolo2-runs.csv) (experimento `pignolo2-a`).

## Qué se corrió

- 16 tareas de validación de una app privada, cada una una vez por brazo: 3 brazos x 16 tareas = 48 corridas, en un solo lote.
- Brazos: **PF** (Pignolo 2, `work` invocada a propósito con el comando de la skill), **SF** (superpowers, su skill invocada a propósito) y **N** (el mismo pedido, sin plugin). La invocación es forzada: esto no mide si la skill se activa sola.
- Congelado `e5f364110627` (commit de preinscripción `f22e011`); `freeze --check` limpio antes del lote. Semilla del calendario 20261025. Activación verificada: PF 15 de 15 corridas válidas por comando, SF 14 de 14 por la herramienta de skills.
- Costo del lote: unos 25,6 USD (acumulado de la comparación 43,6 a 69,2 USD sobre el tope de 100 USD; tope del lote 86,3 USD).
- Éxito = pruebas de aceptación ocultas. Calidad determinista: errores nuevos de tsc y eslint, archivos fuera de alcance y líneas de diff. Análisis: `node tests/evals/analysis-cli.mjs` con la configuración del estudio A; salida literal al final.

## Corridas inválidas y limitación del arnés

El detector del arnés marcó 4 corridas como inválidas por `escaped_cwd`: val-06 PF, val-06 SF, val-04 N y val-08 SF. La revisión manual de sus llamadas a herramientas, hecha por el autor, mostró solo guiones temporales escritos en `/tmp`, rutas relativas dentro del repo (`cd src/...`, `../../../styles`) y el listado de la instantánea compartida de `node_modules` del propio arnés. No hubo acceso al repo de origen ni a la carpeta privada, y las 4 pasaron la aceptación. La regla `relativeEscape` del detector es más laxa que su propósito; se declara como limitación del arnés y no se editó.

Se aplicó la regla preinscrita (inválida, se excluye), de modo que una tarea con un brazo faltante sale de ese contraste: **PF:N n = 14, PF:SF n = 14, SF:N n = 13**. Como sensibilidad se repitió el análisis contando las 4 como válidas (n = 16 en todos los contrastes); las conclusiones no cambian. No se repitieron esas corridas: la ficha solo repite las fallas de infraestructura.

## Contrastes (unidad de análisis: la tarea; razón = prueba / control, media geométrica por tarea)

Primario (regla preinscrita), con ajuste de Holm en los dos primarios:

| Contraste | n | Razón de costo | IC 95 % | Cota sup. unilateral 95 % (bootstrap; t) | p ajustado | No inferioridad (margen 1,5) |
|---|---|---|---|---|---|---|
| PF:N | 14 | 1,055 | [0,985; 1,132] | 1,120; 1,125 | 0,169 | demostrada (ambas cotas bajo 1,5) |
| PF:SF | 14 | 0,752 | [0,672; 0,853] | 0,836; 0,843 | 0,004 | demostrada; costo menor en PF |
| SF:N (exploratorio) | 13 | 1,415 | [1,241; 1,611] | 1,576; 1,600 | sin ajuste (p = 0,001) | no demostrada |

Sensibilidad (las 4 corridas `escaped_cwd` cuentan como válidas):

| Contraste | n | Razón de costo | IC 95 % | Cota sup. unilateral 95 % (bootstrap; t) | p ajustado | No inferioridad (margen 1,5) |
|---|---|---|---|---|---|---|
| PF:N | 16 | 1,044 | [0,968; 1,125] | 1,111; 1,119 | 0,288 | demostrada |
| PF:SF | 16 | 0,749 | [0,680; 0,856] | 0,837; 0,833 | 0,001 | demostrada; costo menor en PF |
| SF:N (exploratorio) | 16 | 1,393 | [1,238; 1,560] | 1,530; 1,548 | sin ajuste (p < 0,001) | no demostrada |

La no inferioridad se declara solo si las dos cotas (bootstrap y t) quedan bajo el margen. PF:N es además equivalente en costo según el criterio descriptivo [0,80; 1,25]; PF:SF y SF:N no.

## Aceptación (pruebas ocultas)

47 de las 48 corridas pasan; la única falla es SF en val-10. El éxito está en el techo y no discrimina entre brazos: ningún contraste de aceptación es significativo (McNemar exacto p = 1,000 en todos). Con las 4 corridas contadas: PF 16/16, N 16/16, SF 15/16.

## Métricas secundarias (descriptivas, sin prueba formal; razón geométrica prueba / control)

| Métrica | PF:N primario (n = 14) | PF:N sensibilidad (n = 16) | PF:SF primario (n = 14) | SF:N primario (n = 13) |
|---|---|---|---|---|
| Tiempo | 0,855 | 0,872 | 0,692 | 1,262 |
| Turnos | 0,858 | 0,825 | 0,588 | 1,522 |
| Tokens ponderados | 1,062 | 1,050 | 0,701 | 1,537 |
| Errores nuevos de tsc, razón de (x + 1) | 1,122 | 1,106 | 1,213 | 0,919 |
| Errores nuevos de eslint, razón de (x + 1) | 1,000 | 1,000 | 1,000 | 1,000 |
| Archivos fuera de alcance, razón de (x + 1) | 1,492 | 1,419 | 0,856 | 1,818 |
| Líneas de diff, razón de (x + 1) | 1,374 | 1,330 | 0,920 | 1,562 |

Costo por tarea resuelta (primario): PF 0,488 USD frente a N 0,465 (PF:N); PF 0,501 frente a SF 0,693 (PF:SF).

- PF gasta aproximadamente los mismos tokens que N, con menos turnos y algo menos de tiempo. SF gasta alrededor de 1,5 veces los tokens y los turnos de N.
- Calidad determinista: PF deja más archivos fuera de alcance (razón de (x + 1) de 1,42 a 1,49 frente a N) y diffs más grandes (1,33 a 1,37) que N; frente a SF, menos (0,87 y 0,91). Los errores nuevos de tsc son parecidos entre brazos (medianas de 0 en todos) y los de eslint son 0 en todos.
- val-07 con N tardó 737 s de pared con 1 turno y costo normal: probable cuelgue o espera inactiva. Es válida según las reglas y aparece como valor atípico de tiempo (es el máximo del rango de N).

## Interpretación

- **Costo.** Pignolo 2 con `work` cuesta lo mismo que no usar plugin (razón 1,055; la no inferioridad al margen 1,5 queda demostrada por las dos cotas, la peor en 1,125) y alrededor de un cuarto menos que superpowers (razón 0,752, el IC excluye 1). SF contra N es exploratorio: cuesta unas 1,4 veces más y no se demuestra no inferioridad al margen 1,5.
- **Aceptación en el techo.** Con 47 de 48 aciertos no hay contraste posible sobre éxito.
- **Calidad.** No se ve ganancia de calidad con `work`; los diffs son algo más anchos que los de N.
- No hay regla de decisión más allá de las preinscritas; este registro no agrega ninguna.

## Qué respalda y qué no

- **Sí respalda**, en este conjunto, que `work` invocada a propósito cuesta aproximadamente lo mismo que no usar plugin y alrededor de un cuarto menos que superpowers, sin pérdida de éxito en la aceptación.
- **No muestra** una mejora de calidad ni de éxito respecto de N. Muestra diffs algo más anchos y más archivos fuera de alcance que N.
- **No dice nada** de la activación espontánea de `work`: se invocó a propósito.

## Limitaciones

- Techo en la aceptación: los pedidos de las tareas revelan buena parte de la solución y las pruebas ocultas verifican cadenas y firmas exactas, así que esto mide ejecución de una especificación cerrada.
- Una repetición por celda; una sola app, un solo modelo y un solo nivel de esfuerzo.
- Invocación forzada de la skill (ver arriba).
- **El panel de jueces con modelo y la verificación por muestreo del autor (ficha 6.1) NO se corrieron.** La rúbrica concretizada por tarea que la ficha exigía antes del congelado no se produjo, y el calificador de la fase de desarrollo usó una escala 0 a 5 en lugar de los 5 criterios binarios, de modo que cualquier resultado de jueces se desviaría de la preinscripción. Quedan pendientes; lo que existe es el panel determinista y la aceptación.
- Limitación del arnés: el detector `escaped_cwd` marcó 4 corridas que el autor verificó como válidas (ver arriba); el primario las excluye por regla.

## Salida del análisis (literal, primario: corridas inválidas excluidas)

```
Análisis de contrastes (margen de no inferioridad 1.5, equivalencia 1.25, semilla 20261026, 10000 remuestreos)
Unidad de análisis: la tarea. Razones = prueba / control. Con menos de 8 tareas el resultado es exploratorio.
No inferioridad: se declara solo si las dos cotas superiores unilaterales del 95 % (bootstrap y t) quedan bajo el margen 1.5.
Contrastes primarios (Holm): PF:N, PF:SF; los demás son exploratorios y sin ajuste.
Se analiza solo el conjunto de tareas "validation": 16 listadas; 0 corridas de otras tareas descartadas.

=== Contraste PF:N (prueba PF, control N) — primario ===
  -- ITT (todas las corridas válidas) -- n = 14 tareas (confirmatorio)
  tareas: val-01, val-02, val-07, val-08, val-09, val-10, val-12, val-14, val-15, val-16, val-17, val-18, val-19, val-20
  tarea excluida val-04: falta el brazo N
  tarea excluida val-06: falta el brazo PF
  activación PF: 15 de 15 corridas (100.0 %)
  activación N: sin concepto de activación (siempre incluido)
  corridas censuradas: PF 0 de 15, N 0 de 15 (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)
  costo (razón PF/N, media geométrica por tarea): 1.055  IC 90 % [0.995; 1.120]  IC 95 % [0.985; 1.132]  cota sup. unilateral 95 % (percentile) 1.120  cota t unilateral 95 % 1.125
    p (permutación de signos, exacto) = 0.169; p ajustado (Holm) = 0.169; intervalo: percentile
    no inferioridad: no inferioridad demostrada (las dos cotas bajo el margen): cota superior unilateral 95 % percentil 1.120 < margen 1.5 y cota t 1.125 < margen 1.5; limita la cota t
    equivalencia (IC 90 % dentro de [0.800; 1.250]): sí (descriptivo)
    interpretación: sin diferencia demostrada en costo (IC 95 % [0.985; 1.132] contiene 1)
    sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón 1.055)
    sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón 1.055)
  éxito de la aceptación (n = 14 tareas, regla "majority"):
    discordantes: solo N 0, solo PF 0, ambos 14, ninguno 0; McNemar exacto p = 1.000
    PF: tareas 14/14 Wilson 95 % [0.785; 1.000]; corridas 14/14 [0.785; 1.000]; pass^1 = 1.000
    N: tareas 14/14 Wilson 95 % [0.785; 1.000]; corridas 14/14 [0.785; 1.000]; pass^1 = 1.000
    interpretación: sin diferencia demostrada en el éxito de la aceptación (p = 1.000)
  jueces: sin notas (usar --grades)
  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):
    tiempo (s) (n = 14): PF 124.14 [28.71–207.19], N 127.49 [34.29–737.25]; razón geométrica 0.855
    turnos (n = 14): PF 15.50 [3.00–31.00], N 22.50 [1.00–46.00]; razón geométrica 0.858
    tokens ponderados (n = 14): PF 227255.97 [70757.45–480590.75], N 218283.70 [74590.85–452512.40]; razón geométrica 1.062
    errores nuevos de tsc (n = 14): PF 0.00 [0.00–4.00], N 0.00 [0.00–2.00]; razón geométrica de (x + 1) 1.122
    errores nuevos de eslint (n = 14): PF 0.00 [0.00–0.00], N 0.00 [0.00–0.00]; razón geométrica de (x + 1) 1.000
    archivos fuera de alcance (n = 14): PF 2.00 [1.00–7.00], N 1.00 [0.00–7.00]; razón geométrica de (x + 1) 1.492
    líneas de diff (n = 14): PF 261.50 [46.00–993.00], N 196.00 [12.00–1098.00]; razón geométrica de (x + 1) 1.374
  costo por tarea resuelta: PF 0.488 USD (14 resueltas); N 0.465 USD (14 resueltas)
  -- PP (solo corridas con el plugin activado) -- n = 14 tareas (confirmatorio)
  tareas: val-01, val-02, val-07, val-08, val-09, val-10, val-12, val-14, val-15, val-16, val-17, val-18, val-19, val-20
  tarea excluida val-04: falta el brazo N
  tarea excluida val-06: falta el brazo PF
  activación PF: 15 de 15 corridas (100.0 %)
  activación N: sin concepto de activación (siempre incluido)
  corridas censuradas: PF 0 de 15, N 0 de 15 (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)
  costo (razón PF/N, media geométrica por tarea): 1.055  IC 90 % [0.995; 1.120]  IC 95 % [0.985; 1.132]  cota sup. unilateral 95 % (percentile) 1.120  cota t unilateral 95 % 1.125
    p (permutación de signos, exacto) = 0.169; p ajustado (Holm) = 0.169; intervalo: percentile
    no inferioridad: no inferioridad demostrada (las dos cotas bajo el margen): cota superior unilateral 95 % percentil 1.120 < margen 1.5 y cota t 1.125 < margen 1.5; limita la cota t
    equivalencia (IC 90 % dentro de [0.800; 1.250]): sí (descriptivo)
    interpretación: sin diferencia demostrada en costo (IC 95 % [0.985; 1.132] contiene 1)
    sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón 1.055)
    sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón 1.055)
  éxito de la aceptación (n = 14 tareas, regla "majority"):
    discordantes: solo N 0, solo PF 0, ambos 14, ninguno 0; McNemar exacto p = 1.000
    PF: tareas 14/14 Wilson 95 % [0.785; 1.000]; corridas 14/14 [0.785; 1.000]; pass^1 = 1.000
    N: tareas 14/14 Wilson 95 % [0.785; 1.000]; corridas 14/14 [0.785; 1.000]; pass^1 = 1.000
    interpretación: sin diferencia demostrada en el éxito de la aceptación (p = 1.000)
  jueces: sin notas (usar --grades)
  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):
    tiempo (s) (n = 14): PF 124.14 [28.71–207.19], N 127.49 [34.29–737.25]; razón geométrica 0.855
    turnos (n = 14): PF 15.50 [3.00–31.00], N 22.50 [1.00–46.00]; razón geométrica 0.858
    tokens ponderados (n = 14): PF 227255.97 [70757.45–480590.75], N 218283.70 [74590.85–452512.40]; razón geométrica 1.062
    errores nuevos de tsc (n = 14): PF 0.00 [0.00–4.00], N 0.00 [0.00–2.00]; razón geométrica de (x + 1) 1.122
    errores nuevos de eslint (n = 14): PF 0.00 [0.00–0.00], N 0.00 [0.00–0.00]; razón geométrica de (x + 1) 1.000
    archivos fuera de alcance (n = 14): PF 2.00 [1.00–7.00], N 1.00 [0.00–7.00]; razón geométrica de (x + 1) 1.492
    líneas de diff (n = 14): PF 261.50 [46.00–993.00], N 196.00 [12.00–1098.00]; razón geométrica de (x + 1) 1.374
  costo por tarea resuelta: PF 0.488 USD (14 resueltas); N 0.465 USD (14 resueltas)

=== Contraste PF:SF (prueba PF, control SF) — primario ===
  -- ITT (todas las corridas válidas) -- n = 14 tareas (confirmatorio)
  tareas: val-01, val-02, val-04, val-07, val-09, val-10, val-12, val-14, val-15, val-16, val-17, val-18, val-19, val-20
  tarea excluida val-08: falta el brazo SF
  activación PF: 15 de 15 corridas (100.0 %)
  activación SF: 14 de 14 corridas (100.0 %)
  corridas censuradas: PF 0 de 15, SF 0 de 14 (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)
  costo (razón PF/SF, media geométrica por tarea): 0.752  IC 90 % [0.683; 0.836]  IC 95 % [0.672; 0.853]  cota sup. unilateral 95 % (percentile) 0.836  cota t unilateral 95 % 0.843
    p (permutación de signos, exacto) = 0.002; p ajustado (Holm) = 0.004; intervalo: percentile
    no inferioridad: no inferioridad demostrada (las dos cotas bajo el margen): cota superior unilateral 95 % percentil 0.836 < margen 1.5 y cota t 0.843 < margen 1.5; limita la cota t
    equivalencia (IC 90 % dentro de [0.800; 1.250]): no (descriptivo)
    interpretación: costo menor en el brazo de prueba (razón 0.752, IC 95 % [0.672; 0.853])
    sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón 0.752)
    sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón 0.752)
  éxito de la aceptación (n = 14 tareas, regla "majority"):
    discordantes: solo SF 0, solo PF 1, ambos 13, ninguno 0; McNemar exacto p = 1.000
    PF: tareas 14/14 Wilson 95 % [0.785; 1.000]; corridas 14/14 [0.785; 1.000]; pass^1 = 1.000
    SF: tareas 13/14 Wilson 95 % [0.685; 0.987]; corridas 13/14 [0.685; 0.987]; pass^1 = 0.929
    interpretación: sin diferencia demostrada en el éxito de la aceptación (p = 1.000)
  jueces: sin notas (usar --grades)
  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):
    tiempo (s) (n = 14): PF 128.87 [28.71–207.19], SF 174.61 [62.26–282.68]; razón geométrica 0.692
    turnos (n = 14): PF 15.50 [3.00–31.00], SF 25.50 [13.00–47.00]; razón geométrica 0.588
    tokens ponderados (n = 14): PF 237702.47 [70757.45–480590.75], SF 355906.08 [142680.35–542356.90]; razón geométrica 0.701
    errores nuevos de tsc (n = 14): PF 0.00 [0.00–4.00], SF 0.00 [0.00–1.00]; razón geométrica de (x + 1) 1.213
    errores nuevos de eslint (n = 14): PF 0.00 [0.00–0.00], SF 0.00 [0.00–0.00]; razón geométrica de (x + 1) 1.000
    archivos fuera de alcance (n = 14): PF 2.00 [1.00–7.00], SF 4.00 [1.00–7.00]; razón geométrica de (x + 1) 0.856
    líneas de diff (n = 14): PF 261.50 [46.00–993.00], SF 297.50 [45.00–1053.00]; razón geométrica de (x + 1) 0.920
  costo por tarea resuelta: PF 0.501 USD (14 resueltas); SF 0.693 USD (13 resueltas)
  -- PP (solo corridas con el plugin activado) -- n = 14 tareas (confirmatorio)
  tareas: val-01, val-02, val-04, val-07, val-09, val-10, val-12, val-14, val-15, val-16, val-17, val-18, val-19, val-20
  tarea excluida val-08: falta el brazo SF
  activación PF: 15 de 15 corridas (100.0 %)
  activación SF: 14 de 14 corridas (100.0 %)
  corridas censuradas: PF 0 de 15, SF 0 de 14 (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)
  costo (razón PF/SF, media geométrica por tarea): 0.752  IC 90 % [0.683; 0.836]  IC 95 % [0.672; 0.853]  cota sup. unilateral 95 % (percentile) 0.836  cota t unilateral 95 % 0.843
    p (permutación de signos, exacto) = 0.002; p ajustado (Holm) = 0.004; intervalo: percentile
    no inferioridad: no inferioridad demostrada (las dos cotas bajo el margen): cota superior unilateral 95 % percentil 0.836 < margen 1.5 y cota t 0.843 < margen 1.5; limita la cota t
    equivalencia (IC 90 % dentro de [0.800; 1.250]): no (descriptivo)
    interpretación: costo menor en el brazo de prueba (razón 0.752, IC 95 % [0.672; 0.853])
    sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón 0.752)
    sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón 0.752)
  éxito de la aceptación (n = 14 tareas, regla "majority"):
    discordantes: solo SF 0, solo PF 1, ambos 13, ninguno 0; McNemar exacto p = 1.000
    PF: tareas 14/14 Wilson 95 % [0.785; 1.000]; corridas 14/14 [0.785; 1.000]; pass^1 = 1.000
    SF: tareas 13/14 Wilson 95 % [0.685; 0.987]; corridas 13/14 [0.685; 0.987]; pass^1 = 0.929
    interpretación: sin diferencia demostrada en el éxito de la aceptación (p = 1.000)
  jueces: sin notas (usar --grades)
  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):
    tiempo (s) (n = 14): PF 128.87 [28.71–207.19], SF 174.61 [62.26–282.68]; razón geométrica 0.692
    turnos (n = 14): PF 15.50 [3.00–31.00], SF 25.50 [13.00–47.00]; razón geométrica 0.588
    tokens ponderados (n = 14): PF 237702.47 [70757.45–480590.75], SF 355906.08 [142680.35–542356.90]; razón geométrica 0.701
    errores nuevos de tsc (n = 14): PF 0.00 [0.00–4.00], SF 0.00 [0.00–1.00]; razón geométrica de (x + 1) 1.213
    errores nuevos de eslint (n = 14): PF 0.00 [0.00–0.00], SF 0.00 [0.00–0.00]; razón geométrica de (x + 1) 1.000
    archivos fuera de alcance (n = 14): PF 2.00 [1.00–7.00], SF 4.00 [1.00–7.00]; razón geométrica de (x + 1) 0.856
    líneas de diff (n = 14): PF 261.50 [46.00–993.00], SF 297.50 [45.00–1053.00]; razón geométrica de (x + 1) 0.920
  costo por tarea resuelta: PF 0.501 USD (14 resueltas); SF 0.693 USD (13 resueltas)

=== Contraste SF:N (prueba SF, control N) — exploratorio, sin ajuste ===
  -- ITT (todas las corridas válidas) -- n = 13 tareas (confirmatorio)
  tareas: val-01, val-02, val-07, val-09, val-10, val-12, val-14, val-15, val-16, val-17, val-18, val-19, val-20
  tarea excluida val-04: falta el brazo N
  tarea excluida val-06: falta el brazo SF
  tarea excluida val-08: falta el brazo SF
  activación SF: 14 de 14 corridas (100.0 %)
  activación N: sin concepto de activación (siempre incluido)
  corridas censuradas: SF 0 de 14, N 0 de 15 (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)
  costo (razón SF/N, media geométrica por tarea): 1.415  IC 90 % [1.268; 1.576]  IC 95 % [1.241; 1.611]  cota sup. unilateral 95 % (percentile) 1.576  cota t unilateral 95 % 1.600
    p (permutación de signos, exacto) = 0.001; p ajustado (Holm) = no aplica (contraste exploratorio); intervalo: percentile
    no inferioridad: no inferioridad no demostrada (se exigen las dos cotas bajo el margen): cota superior unilateral 95 % percentil 1.576 >= margen 1.5 y cota t 1.600 >= margen 1.5; limita la cota t
    equivalencia (IC 90 % dentro de [0.800; 1.250]): no (descriptivo)
    interpretación: costo mayor en el brazo de prueba (razón 1.415, IC 95 % [1.241; 1.611])
    sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón 1.415)
    sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón 1.415)
  éxito de la aceptación (n = 13 tareas, regla "majority"):
    discordantes: solo N 1, solo SF 0, ambos 12, ninguno 0; McNemar exacto p = 1.000
    SF: tareas 12/13 Wilson 95 % [0.667; 0.986]; corridas 12/13 [0.667; 0.986]; pass^1 = 0.923
    N: tareas 13/13 Wilson 95 % [0.772; 1.000]; corridas 13/13 [0.772; 1.000]; pass^1 = 1.000
    interpretación: sin diferencia demostrada en el éxito de la aceptación (p = 1.000)
  jueces: sin notas (usar --grades)
  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):
    tiempo (s) (n = 13): SF 167.63 [62.26–282.68], N 128.90 [34.29–737.25]; razón geométrica 1.262
    turnos (n = 13): SF 26.00 [13.00–47.00], N 22.00 [1.00–46.00]; razón geométrica 1.522
    tokens ponderados (n = 13): SF 340816.10 [142680.35–542356.90], N 237640.15 [74590.85–452512.40]; razón geométrica 1.537
    errores nuevos de tsc (n = 13): SF 0.00 [0.00–1.00], N 0.00 [0.00–2.00]; razón geométrica de (x + 1) 0.919
    errores nuevos de eslint (n = 13): SF 0.00 [0.00–0.00], N 0.00 [0.00–0.00]; razón geométrica de (x + 1) 1.000
    archivos fuera de alcance (n = 13): SF 4.00 [1.00–7.00], N 1.00 [0.00–7.00]; razón geométrica de (x + 1) 1.818
    líneas de diff (n = 13): SF 310.00 [45.00–1053.00], N 199.00 [12.00–1098.00]; razón geométrica de (x + 1) 1.562
  costo por tarea resuelta: SF 0.692 USD (12 resueltas); N 0.472 USD (13 resueltas)
  -- PP (solo corridas con el plugin activado) -- n = 13 tareas (confirmatorio)
  tareas: val-01, val-02, val-07, val-09, val-10, val-12, val-14, val-15, val-16, val-17, val-18, val-19, val-20
  tarea excluida val-04: falta el brazo N
  tarea excluida val-06: falta el brazo SF
  tarea excluida val-08: falta el brazo SF
  activación SF: 14 de 14 corridas (100.0 %)
  activación N: sin concepto de activación (siempre incluido)
  corridas censuradas: SF 0 de 14, N 0 de 15 (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)
  costo (razón SF/N, media geométrica por tarea): 1.415  IC 90 % [1.268; 1.576]  IC 95 % [1.241; 1.611]  cota sup. unilateral 95 % (percentile) 1.576  cota t unilateral 95 % 1.600
    p (permutación de signos, exacto) = 0.001; p ajustado (Holm) = no aplica (contraste exploratorio); intervalo: percentile
    no inferioridad: no inferioridad no demostrada (se exigen las dos cotas bajo el margen): cota superior unilateral 95 % percentil 1.576 >= margen 1.5 y cota t 1.600 >= margen 1.5; limita la cota t
    equivalencia (IC 90 % dentro de [0.800; 1.250]): no (descriptivo)
    interpretación: costo mayor en el brazo de prueba (razón 1.415, IC 95 % [1.241; 1.611])
    sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón 1.415)
    sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón 1.415)
  éxito de la aceptación (n = 13 tareas, regla "majority"):
    discordantes: solo N 1, solo SF 0, ambos 12, ninguno 0; McNemar exacto p = 1.000
    SF: tareas 12/13 Wilson 95 % [0.667; 0.986]; corridas 12/13 [0.667; 0.986]; pass^1 = 0.923
    N: tareas 13/13 Wilson 95 % [0.772; 1.000]; corridas 13/13 [0.772; 1.000]; pass^1 = 1.000
    interpretación: sin diferencia demostrada en el éxito de la aceptación (p = 1.000)
  jueces: sin notas (usar --grades)
  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):
    tiempo (s) (n = 13): SF 167.63 [62.26–282.68], N 128.90 [34.29–737.25]; razón geométrica 1.262
    turnos (n = 13): SF 26.00 [13.00–47.00], N 22.00 [1.00–46.00]; razón geométrica 1.522
    tokens ponderados (n = 13): SF 340816.10 [142680.35–542356.90], N 237640.15 [74590.85–452512.40]; razón geométrica 1.537
    errores nuevos de tsc (n = 13): SF 0.00 [0.00–1.00], N 0.00 [0.00–2.00]; razón geométrica de (x + 1) 0.919
    errores nuevos de eslint (n = 13): SF 0.00 [0.00–0.00], N 0.00 [0.00–0.00]; razón geométrica de (x + 1) 1.000
    archivos fuera de alcance (n = 13): SF 4.00 [1.00–7.00], N 1.00 [0.00–7.00]; razón geométrica de (x + 1) 1.818
    líneas de diff (n = 13): SF 310.00 [45.00–1053.00], N 199.00 [12.00–1098.00]; razón geométrica de (x + 1) 1.562
  costo por tarea resuelta: SF 0.692 USD (12 resueltas); N 0.472 USD (13 resueltas)

Corridas inválidas excluidas: 4
  pignolo2-a val-06/PF/1: escaped_cwd (terminación: ok)
  pignolo2-a val-06/SF/1: escaped_cwd (terminación: ok)
  pignolo2-a val-04/N/1: escaped_cwd (terminación: ok)
  pignolo2-a val-08/SF/1: escaped_cwd (terminación: ok)
```
