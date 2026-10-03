# Checklist manual del hito 4i: todo en el lienzo y un brief corto

Quitar lo no elegido, afinar sobre el lienzo, seguir con otra pantalla, el brief corto y el tablero de `define` en el lienzo son comportamiento del modelo y de la herramienta de artifacts: se comprueban corriéndolos, con una cuenta que tenga el tipo "Design". Hacer cada caso en un proyecto de prueba y anotar "pasa" o "falla" y qué se vio.

## `new`: el brief corto

- [ ] `/pignolo-ui:new <pantalla>`: el chat muestra una línea `Armo: ...`, la lista de pantallas (una línea cada una), a lo sumo 4 supuestos con su fuente y a lo sumo 3 preguntas con la recomendada primero. Ni línea de versión ni el inventario completo. Qué se vio: ______
- [ ] `<run>/brief.md` tiene todo (qué es, quién la usa, inventario, orden de lectura, `## First look`, `## Do not touch`) y el chat dijo una sola línea con su ruta. Qué se vio: ______
- [ ] `First look` y `Do not touch` solo se muestran en el chat si esta pantalla difiere de `PRODUCT.md`. Qué se vio: ______
- [ ] Los avisos previos (valor por defecto, sin navegador, línea de `context`) salen juntos en una sola línea, y solo si hay alguno. Qué se vio: ______

## `new`: elegir, quitar y afinar

- [ ] Elegir una opción: el lienzo pierde las otras **antes** de afinar, y el chat dice `saqué del lienzo las opciones A y C; lo que moviste o agregaste sigue`. Qué se vio: ______
- [ ] Un marco que el usuario movió y una nota que agregó en el lienzo siguen ahí después de elegir. Qué se vio: ______
- [ ] Mover a mano una opción no elegida antes de elegir: igual se quita. Editarla a mano (cambiar su contenido en el lienzo): pregunta antes de quitarla (`artboard-edited-by-hand`). Qué se vio: ______
- [ ] Una nota de fila de una opción no elegida cuyo texto cambió el usuario se conserva. Qué se vio: ______
- [ ] Pedir un cambio tras elegir: se ve en el lienzo (misma dirección), no solo en el HTML local. Qué se vio: ______
- [ ] Después de cada ronda de afinado, una sola línea ofrece terminar; no hay tope fijo (probar 4 rondas). Qué se vio: ______
- [ ] `approve.mjs save` se corre después de la última ronda: lo aprobado coincide con el estado final del lienzo. Qué se vio: ______
- [ ] Pedir un cambio de aspecto después de aprobar: repite afinar y guarda `<flow>-v2` (no edita lo aprobado). Qué se vio: ______

## `new`: otra pantalla

- [ ] Al cerrar la pantalla pregunta (AskUserQuestion) si se arma otra, con "Sí, otra" primero cuando el brief listaba más pantallas sin armar. Qué se vio: ______
- [ ] Con sí: corrida nueva, aparece una página nueva en el mismo lienzo (mismo enlace) y vuelve al brief corto para lo nuevo; reutiliza `PRODUCT.md` y `DESIGN.md`. Qué se vio: ______
- [ ] Con no: el lienzo queda con una opción por pantalla. Qué se vio: ______

## Sin publicar

- [ ] Con `publish: never` (o `presentation = local`, o "no publiques"): nada se publica; el afinado se hace sobre `<run>/option-<X>/` y `compare.html`, y no se llama a Artifact. Qué se vio: ______

## `define`: el tablero en el lienzo

- [ ] Cuenta con el tipo "Design": el tablero aparece en el lienzo del proyecto como una página, con la nota "Tablero"; el chat cita la URL del lienzo. Qué se vio: ______
- [ ] Cuenta sin el tipo "Design": el tablero va a un artifact privado aparte, como antes; nunca a los dos lugares. Qué se vio: ______
- [ ] Al elegir una dirección, el tablero se reescribe con solo la elegida y se republica en el mismo lugar. Qué se vio: ______
- [ ] Con `presentation = local` o `publish: never`: página local, ninguna llamada a Artifact. Qué se vio: ______

## Comentarios

- [ ] Un aviso de comentario sobre el lienzo que llega solo no dispara cambios: se cita y se espera el sí del usuario en el chat. Qué se vio: ______
