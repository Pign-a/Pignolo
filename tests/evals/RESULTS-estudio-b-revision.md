# Resultado del estudio B: revisión con defectos sembrados (2026-10-24)

Registro público del estudio B de la comparación preinscrita de 3 brazos. El diseño, las reglas de análisis y las limitaciones previstas están en [`RESULTS-comparacion-3-brazos.md`](RESULTS-comparacion-3-brazos.md) (secciones del estudio B, 6.2, 7.2 y 8.2, y las aclaraciones fechadas del 2026-10-24); acá no se repiten. Filas crudas: [`pignolo2-runs.csv`](pignolo2-runs.csv) (experimento `pignolo2-b`).

## Qué se corrió

- 10 ítems de una app privada: 8 con defectos sembrados (2 a 3 cada uno, 20 en total) y 2 controles limpios. Cada ítem se revisó una vez por brazo: 4 brazos x 10 ítems = 40 corridas.
- Brazos: **P** (`validate` de Pignolo 2), **N** (pedido de revisión en lenguaje llano, sin plugin), **C** (`/code-review` nativo de Claude Code), **S** (superpowers). Cada brazo recibió el pedido natural de su herramienta.
- Congelado `e5f364110627` (commit de preinscripción `f22e011`); `freeze --check` limpio después del lote. Semilla del calendario 20261029; semilla del análisis 20261030.
- 40 corridas válidas, 0 inválidas, 0 censuradas. Costo total aproximado: 11,3 USD (P 3,35; N 2,20; C 1,46; S 4,25).
- Puntaje determinista (nombre de archivo más línea a 5 de distancia, o 2 palabras clave), sin juez con modelo. Análisis: `node tests/evals/analysis-cli.mjs --study review`, con la salida literal al final.

## Contrastes (unidad de análisis: el ítem; n = 8 ítems con defectos)

Primarios, con ajuste de Holm:

| Contraste | Recall medio por ítem | Diferencia | p ajustado (Holm) | Gana / empata / pierde |
|---|---|---|---|---|
| P:N | P 0,958; N 0,938 | 0,021 | 1,000 | 1 / 6 / 1 |
| P:C | P 0,958; C 0,854 | 0,104 | 1,000 | 3 / 4 / 1 |
| P:S | P 0,958; S 0,938 | 0,021 | 1,000 | 1 / 6 / 1 |

Veredicto impreso para los tres: sin diferencia demostrada; no es equivalencia, porque con 8 ítems la ausencia de diferencia demostrada no prueba que sean iguales.

Exploratorios, sin ajuste y sin regla de decisión:

| Contraste | Recall medio por ítem | Diferencia | p sin ajuste | Gana / empata / pierde |
|---|---|---|---|---|
| C:N | C 0,854; N 0,938 | -0,083 | 0,625 | 1 / 4 / 3 |
| S:N | S 0,938; N 0,938 | 0,000 | 1,000 | 1 / 6 / 1 |

## Descriptivo por brazo

| Brazo | Defectos encontrados | Costo por corrida, mediana [rango] (USD) | Costo por defecto encontrado (USD) | Sin coincidencia, ítems con defectos (media; mediana) | Sin coincidencia, controles limpios (mediana [rango]) |
|---|---|---|---|---|---|
| P | 19/20 (0,950) | 0,27 [0,23 a 0,59] | 0,176 | 2,13; 2,0 | 7,5 [7 a 8] |
| N | 19/20 (0,950) | 0,22 [0,17 a 0,26] | 0,116 | 0,63; 0,5 | 0 [0 a 0] |
| C | 17/20 (0,850) | 0,14 [0,09 a 0,19] | 0,086 | 5,00; 4,5 | 6,0 [4 a 8] |
| S | 19/20 (0,950) | 0,42 [0,36 a 0,49] | 0,224 | 1,00; 1,0 | 2,0 [2 a 2] |

El costo por defecto es el costo total del brazo (incluye los controles limpios) dividido por los defectos encontrados. Tiempo mediano por corrida: P 55,9 s; N 30,0 s; C 26,7 s; S 87,9 s. La skill se activó en 10 de 10 corridas de P y en 10 de 10 de S; en N y C no hay dato de activación.

Los hallazgos sin coincidencia en los controles limpios no son falsos positivos demostrados: pueden ser problemas reales del código previo, y los preexistentes no se descuentan. Los intervalos de Wilson del análisis (P, N y S: [0,764; 0,991]; C: [0,640; 0,948]) son solo descriptivos y optimistas, porque los defectos de un mismo ítem no son independientes.

## Recall por categoría (descriptivo, pocos defectos por categoría)

| Categoría | P | N | C | S |
|---|---|---|---|---|
| async-error | 3/3 | 3/3 | 3/3 | 2/3 |
| authorization | 1/1 | 1/1 | 1/1 | 1/1 |
| boundary-comparison | 4/5 | 5/5 | 5/5 | 5/5 |
| hygiene | 1/1 | 1/1 | 1/1 | 1/1 |
| input-validation | 1/1 | 1/1 | 1/1 | 1/1 |
| money-float | 1/1 | 1/1 | 1/1 | 1/1 |
| n-plus-one | 1/1 | 1/1 | 1/1 | 1/1 |
| sensitive-data | 1/1 | 1/1 | 1/1 | 1/1 |
| stale-state | 3/3 | 2/3 | 3/3 | 3/3 |
| test-quality | 3/3 | 3/3 | 0/3 | 3/3 |

C no encontró ninguno de los 3 defectos de calidad de tests (exploratorio).

## Interpretación

- **Efecto techo.** Tres de los cuatro brazos encontraron 19 de 20 defectos y C encontró 17. Con casi todo encontrado, el benchmark no discrimina entre los brazos en recall. Ningún contraste primario es significativo, y con 8 ítems la ausencia de diferencia no es equivalencia.
- **Lo que sí se ve son diferencias de costo y de ruido.** Costo mediano por corrida: C 0,14 USD, N 0,22, P 0,27, S 0,42. En hallazgos sin coincidencia, N produce los menos (0,63 por ítem con defectos; 0 en los controles) y C los más entre los ítems con defectos (5,00); en los controles limpios P (7,5) y C (6,0) superan a S (2,0) y N (0). Estos números mezclan problemas reales del código previo con ruido; no se separaron.
- **C y los tests.** C quedó en 0/3 en calidad de tests; con 3 defectos es una observación exploratoria, no una propiedad establecida de `/code-review`.
- No hay regla de decisión para el estudio B más allá de los veredictos impresos; este registro no agrega ninguna.

## Qué respalda y qué no

- **No muestra** que `validate` mejore la detección: en recall quedó igual que N y S, y la diferencia con C (0,104) no es significativa.
- **Sí muestra**, en este conjunto, que `validate` no detectó menos que superpowers (19/20 contra 19/20) y no costó más (mediana 0,27 contra 0,42 USD por corrida), y que costó más que un pedido de revisión llano (0,22) y que `/code-review` nativo (0,14).
- No dice nada de otras apps, lenguajes, modelos ni niveles de esfuerzo.

## Limitaciones

- Una sola app, un solo modelo y un solo nivel de esfuerzo; 1 repetición por celda; 8 ítems con defectos y 2 controles.
- Los defectos los sembró un agente constructor (un LLM): pueden ser más fáciles de encontrar que los reales. El efecto techo es coherente con eso.
- El puntaje determinista (nombre de archivo más línea a 5, o 2 palabras clave) puede ser indulgente y no detecta explicaciones equivocadas del defecto.
- N es un pedido de revisión en lenguaje llano; el modelo base ya es fuerte en esa tarea, así que el piso de comparación es alto.
- La diferencia de pedido entre brazos queda confundida con la herramienta (declarado en la ficha).
- Los hallazgos sin coincidencia no se revisaron a mano para este registro; no se los llama falsos positivos.

## Salida del análisis (literal)

```
Estudio de revisión con defectos sembrados (semilla 20261030). Unidad de análisis: el ítem. Recall del ítem = defectos encontrados / sembrados; razones y diferencias = prueba - control.
Con menos de 8 ítems con defectos el resultado es exploratorio y no hay veredicto. Los controles limpios se reportan aparte y no cambian el veredicto de recall.
Contrastes primarios (Holm): P:N, P:C, P:S; los demás son exploratorios y sin ajuste.
Se analiza solo el conjunto de ítems "validation": 10 listados; 0 corridas de otros ítems descartadas.
Ítems con defectos (8): rev-01, rev-02, rev-03, rev-04, rev-05, rev-06, rev-07, rev-08; controles limpios (2): rev-09, rev-10

=== Contraste P:N (prueba P, control N) — primario ===
  n = 8 ítems con defectos (confirmatorio)
  recall medio por ítem: P 0.958, N 0.938; diferencia media (P - N) 0.021; gana/empata/pierde 1/6/1
  permutación de signos (exacto, bilateral) p = 1.000; p ajustado (Holm) = 1.000
  sensibilidades: Wilcoxon (exacto, n efectivo 2) p = 1.000; prueba del signo (exacto (ceros descartados)) p = 1.000
  hallazgos sin coincidencia por ítem con defectos: P 2.13, N 0.63
  veredicto: sin diferencia demostrada entre P y N (diferencia media de recall por ítem (P - N) 0.021, p ajustado (Holm) = 1.000); no es equivalencia: con 8 ítems la ausencia de diferencia demostrada no prueba que sean iguales

=== Contraste P:C (prueba P, control C) — primario ===
  n = 8 ítems con defectos (confirmatorio)
  recall medio por ítem: P 0.958, C 0.854; diferencia media (P - C) 0.104; gana/empata/pierde 3/4/1
  permutación de signos (exacto, bilateral) p = 0.500; p ajustado (Holm) = 1.000
  sensibilidades: Wilcoxon (exacto, n efectivo 4) p = 0.500; prueba del signo (exacto (ceros descartados)) p = 0.625
  hallazgos sin coincidencia por ítem con defectos: P 2.13, C 5.00
  veredicto: sin diferencia demostrada entre P y C (diferencia media de recall por ítem (P - C) 0.104, p ajustado (Holm) = 1.000); no es equivalencia: con 8 ítems la ausencia de diferencia demostrada no prueba que sean iguales

=== Contraste P:S (prueba P, control S) — primario ===
  n = 8 ítems con defectos (confirmatorio)
  recall medio por ítem: P 0.958, S 0.938; diferencia media (P - S) 0.021; gana/empata/pierde 1/6/1
  permutación de signos (exacto, bilateral) p = 1.000; p ajustado (Holm) = 1.000
  sensibilidades: Wilcoxon (exacto, n efectivo 2) p = 1.000; prueba del signo (exacto (ceros descartados)) p = 1.000
  hallazgos sin coincidencia por ítem con defectos: P 2.13, S 1.00
  veredicto: sin diferencia demostrada entre P y S (diferencia media de recall por ítem (P - S) 0.021, p ajustado (Holm) = 1.000); no es equivalencia: con 8 ítems la ausencia de diferencia demostrada no prueba que sean iguales

=== Contraste C:N (prueba C, control N) — exploratorio, sin ajuste ===
  n = 8 ítems con defectos (confirmatorio)
  recall medio por ítem: C 0.854, N 0.938; diferencia media (C - N) -0.083; gana/empata/pierde 1/4/3
  permutación de signos (exacto, bilateral) p = 0.625; p ajustado (Holm) = no aplica (contraste exploratorio)
  sensibilidades: Wilcoxon (exacto, n efectivo 4) p = 0.750; prueba del signo (exacto (ceros descartados)) p = 0.625
  hallazgos sin coincidencia por ítem con defectos: C 5.00, N 0.63
  veredicto: exploratorio, sin regla de decisión: diferencia media de recall por ítem (C - N) -0.083, p sin ajuste = 0.625

=== Contraste S:N (prueba S, control N) — exploratorio, sin ajuste ===
  n = 8 ítems con defectos (confirmatorio)
  recall medio por ítem: S 0.938, N 0.938; diferencia media (S - N) 0.000; gana/empata/pierde 1/6/1
  permutación de signos (exacto, bilateral) p = 1.000; p ajustado (Holm) = no aplica (contraste exploratorio)
  sensibilidades: Wilcoxon (exacto, n efectivo 2) p = 1.000; prueba del signo (exacto (ceros descartados)) p = 1.000
  hallazgos sin coincidencia por ítem con defectos: S 1.00, N 0.63
  veredicto: exploratorio, sin regla de decisión: diferencia media de recall por ítem (S - N) 0.000, p sin ajuste = 1.000

Por brazo (descriptivo):
  P: 10 corridas (censuradas 0 de 10)
    recall agregado por defecto: 19/20 = 0.950, Wilson 95 % [0.764; 0.991] (solo descriptivo: los defectos de un mismo ítem están agrupados y no son independientes, el intervalo es optimista)
    hallazgos sin coincidencia: controles limpios (falsos positivos del diff limpio, con la salvedad de que pueden ser problemas reales; n = 2) mediana 7.5 [7–8]; ítems con defectos (n = 8) media 2.13, mediana 2.0 [0–7]
    costo por defecto encontrado: 0.176 USD (costo total 3.35 USD de 10 corridas, incluye los controles limpios)
    costo 0.27 [0.23–0.59] USD; tiempo 55.9 [27.1–834.1] s; turnos 7.5 [1.0–10.0]; agentes 0.0 [0.0–2.0] (mediana [rango] por corrida)
    activación: 10 de 10 corridas
  N: 10 corridas (censuradas 0 de 10)
    recall agregado por defecto: 19/20 = 0.950, Wilson 95 % [0.764; 0.991] (solo descriptivo: los defectos de un mismo ítem están agrupados y no son independientes, el intervalo es optimista)
    hallazgos sin coincidencia: controles limpios (falsos positivos del diff limpio, con la salvedad de que pueden ser problemas reales; n = 2) mediana 0.0 [0–0]; ítems con defectos (n = 8) media 0.63, mediana 0.5 [0–2]
    costo por defecto encontrado: 0.116 USD (costo total 2.20 USD de 10 corridas, incluye los controles limpios)
    costo 0.22 [0.17–0.26] USD; tiempo 30.0 [23.4–54.1] s; turnos 4.0 [2.0–7.0]; agentes 0.0 [0.0–0.0] (mediana [rango] por corrida)
    activación: sin dato de activación
  C: 10 corridas (censuradas 0 de 10)
    recall agregado por defecto: 17/20 = 0.850, Wilson 95 % [0.640; 0.948] (solo descriptivo: los defectos de un mismo ítem están agrupados y no son independientes, el intervalo es optimista)
    hallazgos sin coincidencia: controles limpios (falsos positivos del diff limpio, con la salvedad de que pueden ser problemas reales; n = 2) mediana 6.0 [4–8]; ítems con defectos (n = 8) media 5.00, mediana 4.5 [3–9]
    costo por defecto encontrado: 0.086 USD (costo total 1.46 USD de 10 corridas, incluye los controles limpios)
    costo 0.14 [0.09–0.19] USD; tiempo 26.7 [19.7–33.5] s; turnos 0.0 [0.0–0.0]; agentes 0.0 [0.0–0.0] (mediana [rango] por corrida)
    activación: sin dato de activación
  S: 10 corridas (censuradas 0 de 10)
    recall agregado por defecto: 19/20 = 0.950, Wilson 95 % [0.764; 0.991] (solo descriptivo: los defectos de un mismo ítem están agrupados y no son independientes, el intervalo es optimista)
    hallazgos sin coincidencia: controles limpios (falsos positivos del diff limpio, con la salvedad de que pueden ser problemas reales; n = 2) mediana 2.0 [2–2]; ítems con defectos (n = 8) media 1.00, mediana 1.0 [0–3]
    costo por defecto encontrado: 0.224 USD (costo total 4.25 USD de 10 corridas, incluye los controles limpios)
    costo 0.42 [0.36–0.49] USD; tiempo 87.9 [59.9–120.5] s; turnos 5.5 [1.0–7.0]; agentes 1.0 [1.0–1.0] (mediana [rango] por corrida)
    activación: 10 de 10 corridas

Recall por categoría (descriptivo, defectos sumados sobre los ítems con defectos; pocos defectos por categoría):
  categoría async-error: P 3/3, N 3/3, C 3/3, S 2/3
  categoría authorization: P 1/1, N 1/1, C 1/1, S 1/1
  categoría boundary-comparison: P 4/5, N 5/5, C 5/5, S 5/5
  categoría hygiene: P 1/1, N 1/1, C 1/1, S 1/1
  categoría input-validation: P 1/1, N 1/1, C 1/1, S 1/1
  categoría money-float: P 1/1, N 1/1, C 1/1, S 1/1
  categoría n-plus-one: P 1/1, N 1/1, C 1/1, S 1/1
  categoría sensitive-data: P 1/1, N 1/1, C 1/1, S 1/1
  categoría stale-state: P 3/3, N 2/3, C 3/3, S 3/3
  categoría test-quality: P 3/3, N 3/3, C 0/3, S 3/3

Corridas inválidas excluidas: 0
```
