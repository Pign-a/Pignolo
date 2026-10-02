# Validación de seis cambios al ciclo ejecutar → revisar → arreglar

_2026-10-01. No es un A/B: tres agentes opus validaron la propuesta, uno contra los datos medidos del repo y de las transcripciones, uno como atacante y uno con fuentes externas. Marcas: (M) medido, (I) inferido, (S) supuesto. "Ciclo" = ejecutar + revisar + arreglar, en tiempo de pared._

## Lo medido del ciclo actual

- Ejecutar es el 51 a 65 % del ciclo en hitos grandes (M); los arreglos, el 18 a 43 % (M).
- La suite completa corre 3 a 5 veces por ciclo, 3,3 a 11,8 min cada una bajo carga contra 1,7 a 1,8 min con la máquina tranquila (M): 10 a 20 % del ciclo y 20 a 40 % de revisión más arreglos.
- Una revisión opus tiene un piso de ≈ 150 a 160 mil tokens y 8 a 20 min aunque el diff sea de ~400 líneas; suma ≈ 35 a 40 mil tokens por cada 1.000 líneas (8 revisiones, M; ajuste I).
- Los tests son el 60 a 89 % de las líneas que agrega una pasada de arreglos (8 pasadas, mediana ≈ 69 %) (M).
- Un arreglador nuevo tarda 1,4 a 8,3 min (mediana ≈ 4) hasta su primera edición (M). Un ejecutor termina con 248 a 770 mil tokens de contexto contra 137 a 293 mil de un arreglador nuevo (M).
- De 48 hallazgos críticos e importantes en 8 revisiones, 12 (25 %) caen en clases que se repiten; "formas que saltan la guardia" volvió en cuatro hitos después de anotarse como G19 (M).
- La revisión escrita es el 1,7 a 4 % del contexto del arreglador (M).

## Veredicto por punto

| # | Cambio | Ahorro estimado del ciclo | Atacante | Fuentes externas | Resultado |
|---|---|---|---|---|---|
| 1 | El revisor entrega cada hallazgo importante como test que falla | 2 a 10 % de pared; tokens ≈ neutro (I) | con resguardo | apoyan, indirecto | adoptar con resguardo |
| 2 | Arregla el ejecutor original, retomado | 0 a 4 % de pared; **empeora los tokens** (I) | no adoptar | solo para tareas chicas | no adoptar (salvo cambio chico) |
| 3 | Suite completa una sola vez, al unir | 8 a 15 % de pared (I) | con resguardo | apoyan la selección | adoptar con resguardo |
| 4 | Una revisión por grupo de hitos chicos | 20 a 30 % del ciclo de esos hitos (I) | con resguardo | mixto: seguro en cientos de líneas | adoptar con resguardo |
| 5 | Lista de clases de hallazgo repetidas en el encargo | 2 a 5 % (S) | con resguardo | apoyan, evidencia floja | adoptar con resguardo |
| 6 | Informes entre agentes en formato telegráfico | 0,5 a 1,5 % de tokens (I) | no adoptar | el ahorro está en pasar archivos, no en la sintaxis | no adoptar |

Resguardos: (1) solo importantes deterministas y sin decisión del autor; el que arregla no edita el test; el rojo se comprueba antes del arreglo. (3) una corrida completa por rama, ya unida con `main` y tras los arreglos, con la máquina quieta; un test nuevo que falla bajo carga es un hallazgo. (4) tope de 3 hitos y ~1.500 líneas, exclusión por rutas de lo de riesgo, hallazgos por hito. (5) máximo 5 ítems, respondidos con evidencia.

**"El ciclo baja a la mitad": no sostenido.** Estimación: 15 a 25 % de pared en un hito grande, 25 a 40 % en un grupo de chicos, 5 a 15 % de tokens (I/S). Casi todo viene del punto 3. Solo revisión más arreglos: 30 a 45 % menos de pared.

## Ideas extra de las fuentes

1. Paquete de revisión como archivo (un script arma el diff) y una sola re-revisión acotada al diff del arreglo, en un modelo más barato.
2. Acotar qué cuenta como hallazgo: solo lo que afecta la corrección o los requisitos; el resto es opcional.
3. Chequeos deterministas (test, script, hook) antes de la revisión con modelo.

Fuentes externas citadas: SWT-Bench (arXiv 2406.12952), Cheng et al. (arXiv 2601.19066), Machalica et al. (arXiv 1810.05286), Ekstazi (ISSTA 2015), SmartBear/Cisco (2006), Sadowski et al. (ICSE-SEIP 2018), documentación de Claude Code y dos posts de ingeniería de Anthropic (2025). Ninguna mide el ciclo completo.

## Costo de la validación

Atacante: ≈ 126 mil tokens, 3 min. Fuentes externas: ≈ 120 mil tokens, 3 min. Datos medidos: ≈ 169 mil tokens, 8 min.

## Decisión del autor (2026-10-01)

Aplicar las mejoras validadas a los planes que siguen y como estrategia de desarrollo del plugin: puntos 1, 3, 4 y 5 con sus resguardos y las tres ideas extra. Los puntos 2 y 6 no se adoptan. Quedó en `CLAUDE.md`. El ahorro real se mide en los próximos hitos contra `docs/benchmarks.md` §2d.
