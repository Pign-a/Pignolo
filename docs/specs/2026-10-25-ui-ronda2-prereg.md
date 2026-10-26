# Ronda 2 de pantallas: flujo de `ui` con kit contra el resto

**Estado: preinscrita, se commitea antes de congelar y de correr.** Cierra la etapa "flujo de interfaz con kit" (rama `ui-flujo`). Sigue a la piloto de 3 pantallas (`docs/sessions/2026-10-25.md`), que fue de desarrollo y una repetición por celda.

## Pregunta

Cuando el autor pide una pantalla con sus propias palabras, ¿qué brazo deja la que el autor elige a ciegas y la que menos cambios le pide?

## Brazos (los cuatro con invocación forzada de `/pignolo:ui` menos N)

| Brazo | Qué lleva |
|---|---|
| N | Sin plugin. |
| U0 | El plugin sin la sección de construcción de pantallas (equivale a la `ui` de la 1.0.0). |
| U3 | Ficha de pantalla, ficha de patrón y crítica, sin kit ni guía de stacks. |
| U3K | Lo anterior más el kit de 24 componentes y la guía de stacks (el flujo tal como está en `ui-flujo`). |

**Limitación del montaje.** El repositorio de prueba está en blanco y el pedido exige HTML estático sin build, igual en todos los brazos. La skill manda usar el kit en un proyecto React con Radix y, en cualquier otro caso, leer `references/stacks.md` y construir con lo que haya. Entonces U3K no instala el kit: lo tiene a mano como referencia de comportamiento y de movimiento. Lo que esta ronda mide es el flujo completo con esos materiales disponibles; si el kit se usa se mide aparte (abajo). Medir el kit instalado en su entorno (un proyecto React) necesita otro montaje y queda como pendiente.

Los brazos se arman con `tests/evals/ui-arms.mjs` desde el commit de esta ficha. La identidad de la app de prueba es la de `tests/evals/fixtures/ui-identity/design.md`; el texto de cada pedido vive en la carpeta privada y no entra al repositorio.

## Pantallas y repeticiones

- Compromisos (s4) y Ahorro (s5): conjunto de validación, no se usaron para ajustar nada.
- Simulador (s3): era de desarrollo y el flujo anterior perdió ahí; se repite con el flujo nuevo, y su resultado se lee aparte, como desarrollo.
- Una repetición por celda: 12 corridas. Si el resultado queda dentro del ruido (ver abajo), se suma una segunda repetición de las celdas afectadas antes de concluir.

## Qué se mide

1. **Voto a ciegas del autor** por pantalla: orden de preferencia entre los 4 resultados y cantidad de cambios que pediría para cada uno. El orden de las etiquetas lo baraja el arnés con la semilla de la configuración.
2. Medidas del arnés (gratis, mismas en todos los brazos): widgets nativos, estados de hover y foco, botones principales, tamaños de letra, hallazgos de `ui-check`, pantallas entregadas.
3. Costo y duración por corrida (descriptivo; el autor corre bajo el límite de su suscripción).

## Cómo se decide

- **Hipótesis principal:** U3K queda primero en al menos 2 de las 3 pantallas Y su media de cambios pedidos es la menor de los cuatro brazos.
- **Hipótesis secundaria (los materiales del kit suman):** U3K pide menos cambios que U3 en la media.
- **Uso del kit (descriptivo):** por corrida de U3K, cuántos archivos de `kit/` y de `references/stacks.md` leyó el agente, contados del `stream.jsonl`. Si no los leyó, la comparación U3K contra U3 no dice nada del kit.
- **Ruido:** con una repetición por celda, una diferencia de media de cambios menor de 1,0 no se lee como diferencia.
- **Si la principal falla:** se informa tal cual, con las pantallas donde perdió y por qué lo dicen los cambios pedidos; no se ajusta nada del flujo mirando s4 y s5 como si siguieran siendo de validación.
- Con una repetición por celda y un solo votante, lo medido son **indicios**, no una demostración; así se escribe en la ficha de resultados.

## Qué no cubre

Cómo se siente el movimiento a mano, lector de pantalla, otros navegadores y táctil: el voto mira capturas y el HTML abierto en el navegador de escritorio.
