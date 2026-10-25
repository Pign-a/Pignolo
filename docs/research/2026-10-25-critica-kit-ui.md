# Investigación: crítica independiente del kit de componentes de UI

Fecha: 2026-10-25
Pregunta: ¿qué defectos tienen los 21 componentes del kit de `ui` desde la accesibilidad y el comportamiento, y desde el diseño, la experiencia y el movimiento? Dos críticos independientes (Sonnet, esfuerzo alto, solo lectura), cada uno con su enfoque.

Credibilidad: **alta** (norma o fuente primaria explícita y defecto verificado en el código), **media** (fuente secundaria seria o paso de interpretación), **baja** (inferencia). El número es el porcentaje de confianza que dio el crítico con su criterio.
Tipo: **dato**, **opinión**, **supuesto**.

Regla aplicada (2026-10-25, decisión del autor): se arreglaron los hallazgos de confianza alta y las decisiones del autor; el resto queda anotado aquí y en `docs/gaps.md` (P2-39 a P2-47).

## Hallazgos de accesibilidad y comportamiento

| ID | Hallazgo | Fuente | Confianza | Estado |
|---|---|---|---|---|
| A1 | Reordenar solo con arrastre o flechas en el asa; falta alternativa de puntero único | WCAG 2.2, 2.5.7 Dragging Movements | 92 | Arreglado: botones subir y bajar |
| A2 | Tooltip con `disableHoverableContent` incumple 1.4.13 | WCAG 2.2, 1.4.13 | 85 | Arreglado |
| A3 | Tooltip describe pero no nombra: un botón de ícono sin `aria-label` queda sin nombre | WCAG 4.1.2 | 75 | Arreglado: doc y aviso en desarrollo |
| A4 | Pista del interruptor apagado a 1,41:1 | WCAG 1.4.11 | 80 | Arreglado: borde de 1,5 px |
| A5 | Sin soporte de colores forzados (alto contraste de Windows) | MDN forced-colors | 70 | Arreglado en todos los componentes afectados |
| A6 | Desplegable con rol de menú en vez de select; `aria-required` y `aria-invalid` en un botón; `required` solo visual | APG menu button y select-only combobox; MDN; HTML Standard | 75 y 85 | Arreglado: Radix Select |
| A7 | Aviso con "deshacer" que se cierra a los 5 s; hotkey sin anunciar | WCAG 2.2.1; Radix Toast | 68 a 75 | Arreglado |
| A8 | Región viva insertada con su contenido | Soueidan, 2024 | 55 | Arreglado (regiones persistentes) |
| A9 | Barra lateral: etiqueta de botón que cambia con el estado; `title` nativo sin teclado ni táctil; controles invisibles enfocables | APG button; HTML Standard | 55 a 85 | Arreglado |
| A10 | Pestañas sin panel con rol `tab` | APG tabs | 62 | Arreglado: grupo de opciones |
| A11 | Reordenar con flechas sobre un botón puede no funcionar con lectores en modo exploración | APG keyboard interface | 45 | Documentado (P2-43) |
| A12 | Selector de mes sin región viva, sin `name`, sin escritura | WCAG 4.1.3 | 62 | Arreglado: rediseño completo |
| A13 | Cifra que rueda: copiar da 0123456789 y el anuncio no tiene contexto | Inferencia | 50 | Arreglado |
| A14 | Gráfico de barras: una parada de tabulador por barra; tooltip no se cierra con Esc | WCAG 1.4.13 | 65 | Arreglado |
| A15 | Solo un spinner respeta movimiento reducido | Inferencia de código | 55 | Arreglado |
| A16 | Borrar fila con Supr sin deshacer ni `aria-keyshortcuts` | Inferencia | 45 | Arreglado parcial: `onRemove` y atajos |
| A17 | Retraso del desplegable sin tope; se expulsa un error persistente al pasar `max`; casilla de 20 px | Código | 55 a 70 | Arreglado |

## Hallazgos de diseño, experiencia y movimiento

| ID | Hallazgo | Fuente | Confianza | Estado |
|---|---|---|---|---|
| D1 | Selector de mes sin escritura, contra la propia ficha | NN/g Date-Input Form Fields (2017) | 90 | Arreglado |
| D2 | Rebote 0,15 en controles contra "empezar sin rebote" de Apple; imperceptible | WWDC23 y WWDC18 | 80 | Decisión del autor: rebote 0 |
| D3 | Desplegable con resorte de peso y retraso por ítem, unos 0,5 s | NN/g, duración de animación (2020); Kowalski | 70 | Decisión del autor: nivel directo, sin retraso |
| D4 | Regla de teclado sin animación no implementada | Kowalski | 65 | Documentado (P2-40) |
| D5 | Avisos: valores distintos de la ficha | Código | 90 | Arreglado: ficha actualizada con la razón |
| D6 | Tooltip sin retraso | Kowalski | 65 | Decisión del autor (voto): se mantiene |
| D7 | Elevación al pasar el mouse no es patrón de Apple | Inferencia | 50 | Decisión del autor: quitada |
| D8 | Barras sin animar al cambiar datos; barrido de 1,35 s con 18 barras | Código | 60 | Arreglado |
| D9 | Cifra de 8 dígitos tarda unos 0,8 s; valores intermedios parecen reales | NN/g | 65 | Arreglado parcial |
| D10 | Esqueleto sin retraso aunque la doc lo pide | NN/g, skeleton screens (2023) | 85 | Arreglado |
| D11 | Campo de 56 px con etiqueta flotante contra la ficha de formularios | Ficha del kit | 80 | Decisión del autor: etiqueta dentro que sube y agranda |
| D12 | Áreas táctiles de 28 a 36 px en varios controles | WCAG 2.5.8; Apple HIG (no cargó) | 70 | Arreglado: 44 px en táctil |
| D13 | Hoja inferior como losa a 1280 px; barra lateral sin drawer; sin persistencia | Capturas | 75 | Arreglado |
| D14 | Series 2 y 3 en grises distinguidos por el ángulo del rayado; sin paleta categórica | Capturas | 60 | Arreglado: `chart-tokens.css` |
| D15 | Método: una persona, sin táctil, demos lado a lado | Inferencia | 55 | Documentado (P2-39) |
| D16 | Comentarios y lista de verificación que no coinciden con el código | Código | 90 | Arreglado |
| D17 | Constante 0,55 y proyección 0,2 s atribuidas a WWDC | Viblo; Kivy; WWDC18 | 85 | Arreglado: ficha aclara que son valores por ingeniería inversa |
| D18 | Salidas de 80 a 130 ms frente a 200 a 250 ms de NN/g | NN/g | 55 | Documentado (P2-42); overlays grandes a 160 ms |
| D19 | Faltan componentes: tabla de datos, validación de formularios, combobox, rango de fechas, banner y otros | Inferencia | 55 | Documentado (P2-44) |

## Qué no se pudo verificar
- Comportamiento con NVDA, JAWS o VoiceOver; Firefox y Safari; arrastre táctil.
- Las páginas de Apple HIG y de Material 3 cargaron solo con el título.
- WCAG 1.4.13 y 2.5.5 se citaron de memoria en parte y se releyeron en la corrección.
- Los críticos vieron unas 20 de 143 capturas (diseño); la accesibilidad se calculó con tokens, sin herramienta.

## Conclusión
- Los defectos objetivos (norma explícita, verificados en el código) eran sobre todo de accesibilidad y de coherencia entre fichas, comentarios y código. Se arreglaron.
- Los hallazgos de movimiento que chocaban con los votos del autor se le devolvieron como decisión. Eligió rebote 0, desplegable más corto, sin elevación y un campo con la etiqueta dentro.
- El resto es de confianza media o baja y está anotado como pendiente de medición con personas.
