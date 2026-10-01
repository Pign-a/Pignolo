# D-7-3: repetición previa al merge (R1 / R2 / R3)

## Método
- Suite sintética en `exp-repeat/suite/` (generador `gen.js`): 10 archivos × 20 tests deterministas (3 ms) + 5 tests flaky con `Math.random()` (sin semilla), uno en cada archivo 0-4, con probabilidad de falla p = 2, 5, 10, 20, 50 %. Cada corrida es un `node --test` real (≈0,72 s).
- `sim.js`: 600 merges simulados. En cada uno se hacen 3 corridas completas independientes y 3 corridas solo del archivo "tocado" (uno al azar de 10). Cada política se evalúa de forma apareada sobre esas mismas corridas: R1 = corrida 1; R2 = 2 corridas si el merge "toca tests" (la mitad de los merges) y 1 si no; R3 = las 3. Extras: S1 = R1 y, si falla algo, repetir solo el archivo fallado; S2 = R1 + 2 corridas solo del archivo tocado cuando el diff toca tests.
- "Detectado" = el test flaky falló al menos una vez en las corridas de la política (señal visible). Análisis en `an.js`. Máquina con ~37 % de CPU de base, sin otros jobs pesados propios. Sin llamadas a IA.

## Números (600 merges)
| Política | Corridas/merge | Tiempo rel. | p=2 % | p=5 % | p=10 % | p=20 % | p=50 % | Merges con algún flaky detectado |
|---|---|---|---|---|---|---|---|---|
| R1 | 1 | 1,00 | 1,5 % | 5,2 % | 13,0 % | 20,2 % | 52,5 % | 71 % |
| R2 | 1,5 | 1,49 | 1,8 % | 7,0 % | 15,0 % | 27,8 % | 66,0 % | 82 % |
| R3 | 3 | 3,00 | 5,7 % | 13,0 % | 26,0 % | 49,2 % | 88,3 % | 97 % |
| S1 (repetir solo lo fallado) | 1 + parcial | 1,40 | = R1 | = R1 | = R1 | = R1 | = R1 | 71 % |
| S2 (solo tests tocados, x3) | 1 + parcial | 1,55 | 1,8 % | 5,7 % | 13,8 % | 22,0 % | 53,7 % | 73 % |

Teoría 1-(1-p)^k: R1 2/5/10/20/50 %; R3 5,9/14,3/27,1/48,8/87,5 %; R2 = mezcla 50/50 de k=1 y k=2 → 3,0/7,4/14,5/28/62,5 %. Lo medido coincide con la teoría dentro del ruido (n=600; el 2 % tiene solo ~9-34 eventos).

## Dato real
- `cd D:\pignolo && npm test` (una vez): 2047 pasan / 0 fallan / 2 omitidos, 134 s (2,2 min), CPU base ≈37 % al medir (máquina algo cargada; en tranquila podría ser algo menos).
- Minutos extra por merge con la suite real: R2 ≈ +1,1 min en promedio (+2,2 si toca tests); R3 ≈ +4,5 min.
- Tasa de flaky observada en docs: no hay un conteo por corrida. `docs/gaps.md` G8: en 4a y 4b hubo de 3 a 24 fallas por carga en implementadores paralelos, todas pasaron solas. `docs/STATE.md`: "test H13 de PowerShell intermitente bajo carga". Hoy, en la corrida única con carga moderada: 0 fallas. Conclusión: los flaky conocidos dependen de la carga (varias suites en paralelo), no de azar puro en máquina tranquila; la tasa en quieto es ≈0 (1 corrida, no estadística).

## Lectura
- La repetición ciega solo descubre flaky con p alto. Un flaky del 2 % tarda ~50 corridas en mostrarse con 63 %: ninguna política de ≤3 corridas lo cubre (R3 5,9 %). Para p ≥ 20 % R3 detecta ~50-90 %, pero ya con p = 50 % R1 lo ve en la mitad de los merges.
- R3 cuesta 3x (≈4,5 min extra con la suite real) y casi no ayuda a lo raro. R2 cuesta +49 % y mejora la detección de flaky nuevo exactamente donde es más probable que se haya introducido (diff toca tests).
- S1 no detecta más, pero evita falsos rojos (no bloquear el merge por un flaky ya conocido que pasa al repetir solo ese test): ahorra casi todo el costo de repetir y sirve para clasificar, no para descubrir.
- S2 (repetir solo los tests/archivos tocados) domina a R2: detecta ~lo mismo en los tests del diff (que es donde aparece el flaky nuevo) con mucho menos costo real (corrida parcial en vez de suite completa: aquí 0,26 s vs 0,72 s por corrida). En mi simulación S2 tuvo detección global menor que R2 solo porque los flaky de otros archivos no se repiten; para los del archivo tocado la detección es 1-(1-p)^3. No domina a R3 en cobertura bruta, pero R3 es 3x más caro.

## Recomendación
Adoptar R1 como base (una corrida completa, con la máquina tranquila, como ya dice el método de G8) más una política inteligente: (a) si una corrida falla, repetir solo los tests fallados antes de bloquear (S1; si pasan, marcar como flaky sospechoso en lugar de falso rojo); (b) si el diff toca tests, repetir 2 veces extra solo los archivos de test tocados (S2). Esto es R2 con ~el mismo costo o menor y mejor foco, y mucho más barato que R3. R3 no se justifica. Si no se quiere implementar S2 (por simplicidad), R2 tal cual es la mejor de las tres. Límite del experimento: flakiness sintética independiente por corrida; los flaky reales por carga están correlacionados entre corridas simultáneas, y repetir bajo la misma carga detecta menos de lo que la teoría predice.
