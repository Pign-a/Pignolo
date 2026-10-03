# Comprobaciones manuales de la pestaña UI

Las hace el autor cuando cierre la v1 (con `claude` real, en su terminal). Marcar cada una con fecha y resultado.

- [ ] **Con pignolo-ui instalado** la pestaña `4 UI` aparece; **sin él** (o con `pignolo-ui` deshabilitado) no aparece y no hay ninguna consulta.
- [ ] **Sin `PRODUCT.md`** (o con `Audience` / `First look` en `undecided`) la única recomendación es `d  Definir producto y diseño` y no hay consulta (sin "haiku" ni costo a la derecha del título).
- [ ] **Con datos** (una pantalla aprobada o una auditoría), las recomendaciones llegan y la esquina del título dice `haiku · 1 consulta · ≈ 0,01 USD`. Comparar el gasto real de `/cost` antes y después: ¿≈ 0,01 USD? (la sonda U3 mostró que `session.usage().cost` no cambia con esta consulta, así que la cifra es una estimación rotulada).
- [ ] **Sin red** (o con el modelo bloqueado): abrir la pestaña muestra las recomendaciones por reglas y la marca "por reglas", sin texto de error.
- [ ] **Pulsar `a`** envía el pedido (por ejemplo `Mejorá la pantalla login. Contexto: …`) y la skill de pignolo-ui correspondiente se activa; pulsarlo dos veces seguidas con Claude trabajando envía un solo mensaje.
- [ ] **Pulsar `n`** envía `Quiero armar una pantalla nueva.` y la skill `new` pregunta qué pantalla; `m` y `u` lo mismo con mejorar y auditar; `d` envía `Definí el producto y el diseño.`.
- [ ] **`uiRecommendations` en `false`** (configuración del plugin): la pestaña muestra solo reglas y nunca consulta.
- [ ] **Abrir y cerrar la pestaña diez veces sin cambios** gasta una consulta (ver `/cost`); cambiar una pantalla o correr una auditoría y volver a la pestaña gasta una más.
- [ ] **Un nombre de pantalla raro** (con espacios, mayúsculas o signos en `design/approved/<flujo>/`) aparece filtrado (solo `a-z0-9._-`) y el pedido que se envía lleva el nombre filtrado.
- [ ] **El abrir solo** (decisión nueva) con la pestaña UI como última pestaña no consulta al modelo; recién `4` o `/pignolo-panel` lo hacen.
- [ ] **Colores y alineación**: el bloque se ve igual de prolijo que los demás (marco redondeado, título a la izquierda y costo a la derecha, recomendación en negrita y su porqué atenuado debajo, atajos al pie).
