# Checklist manual del hito 4h: definición inicial

La compuerta y `/pignolo-ui:define` son texto de skills: que el modelo los respete solo se comprueba corriéndolos. Hacer cada caso en un proyecto de prueba y anotar "pasa" o "falla" con lo que se vio.

## Compuerta

- [ ] Proyecto vacío, `/pignolo-ui:audit <ruta>`: frena antes de medir nada, dice qué falta y ofrece "Definir ahora (recomendado)" primero.
- [ ] Proyecto con una v1 de pantallas y sin `DESIGN.md` ni `PRODUCT.md`, `/pignolo-ui:improve <ruta>`: frena igual; no propone un `DESIGN.md` extraído.
- [ ] Contestar "ok" o "dale" a la compuerta: no saltea, vuelve a preguntar.
- [ ] Elegir "Seguir sin definir": aparece la segunda pregunta, que dice qué se pierde.
- [ ] Confirmar la segunda: muestra el diff de `CLAUDE.md` con la sección `## pignolo-ui: pendientes` y una línea por archivo faltante; no toca el resto del archivo.
- [ ] El informe de esa corrida empieza con `sin definición inicial` y, en `audit`, los `J-nn` van aparte.
- [ ] Segunda corrida con el pendiente ya anotado: lo recuerda con una sola pregunta y no duplica la línea.
- [ ] `DESIGN.md` con la línea "extraídos, no decididos": la compuerta lo trata como no definido.
- [ ] Con los dos archivos definidos: ninguna pregunta de la compuerta.

## `/pignolo-ui:define`

- [ ] Lee README, `CLAUDE.md` y `package.json` antes de preguntar; no pregunta lo que ya está.
- [ ] Preguntas de producto con opciones (a lo sumo dos tandas); `PRODUCT.md` se crea solo tras confirmar el diff.
- [ ] Una tanda de diseño en palabras; nada de color o tipografía se pregunta en texto.
- [ ] El tablero muestra las direcciones con la misma muestra en cada una; con pantallas existentes aparece "lo que ya hay".
- [ ] Con `presentation = auto` y la herramienta: avisa en una línea y publica un artifact privado; cita la URL.
- [ ] Con `presentation = local` o `publish: never`: página local, ninguna llamada a Artifact.
- [ ] Elegir una dirección: `design/approved/direction`, diff de `DESIGN.md`, confirmación, archivo creado y `design-md.mjs validate` en verde.
- [ ] Elegir "lo que ya hay": `DESIGN.md` sale sin la marca.
- [ ] Al terminar borra las líneas de `## pignolo-ui: pendientes` (con diff) y dice qué correr después.
- [ ] Correr `define` con todo definido: lo dice y termina sin reabrir nada.
