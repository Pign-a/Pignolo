# Resultados: opciones de UI como HTML local o como lienzo "Design", con sonnet y con opus

Fecha: 2026-10-01. Windows 11, Claude Code 2.1.285. Pedido del autor: medir cuánto cuesta y cuánto tarda usar el lienzo "Design" de claude.ai frente a HTML local, y poner en la balanza qué da cada uno.

## Caso

El brief de las evals de `ui-option` (`plugins/pignolo-ui/tests/evals/ui-cases.mjs`, `MOCKUP_BRIEF`): un área de cuenta de una app de ahorro, 2 pantallas (inicio y detalle) × 2 opciones (A densidad, B jerarquía), a 390×844, con marcadores para los datos no provistos. El mismo texto para los cuatro brazos.

- **HTML local:** 4 archivos HTML autocontenidos con las reglas de `agents/ui-option.md`, más una página local de comparación con iframes.
- **Lienzo:** 4 artboards `.dc.html` y el índice `canvas.json`, publicados en un lienzo privado nuevo (listar tipos, crear, publicar). El agente recibió las notas de formato y tres archivos de ejemplo de una publicación real previa.

Un agente por brazo, sin subagentes. Tokens y tiempo: lo que informa cada agente al terminar.

## Resultados

| Brazo | Tokens | Tiempo | Usos de herramientas | Resultado |
|---|---|---|---|---|
| HTML local, sonnet | ~76 mil | 67 s | 7 | Completo; un reintento al escribir |
| HTML local, opus | ~84 mil | 145 s (con la repetición) | 8 | Completo al segundo intento: el primero informó "archivos escritos" con la carpeta vacía (un hook le bloqueó el script y no miró el resultado) |
| Lienzo, sonnet | ~91 mil | 53 s | 11 | Publicado sin rechazos, 3 llamadas a Artifact |
| Lienzo, opus | ~106 mil | 170 s | 14 | Publicado sin rechazos, 3 llamadas a Artifact; dejó un script auxiliar de más |

**Comparabilidad:** misma tarea, mismo brief, misma máquina y hora; **una sola corrida por brazo**, así que sirve como orden de magnitud. La calidad del diseño no se midió con un grader: la juzgó el autor mirando los cuatro resultados.

## Qué dicen los datos

1. **El lienzo cuesta ≈ 20 % más tokens que el HTML con sonnet (≈ 15 mil por tanda de 4 pantallas) y ≈ 27 % más con opus.** Viene de leer el formato y de las llamadas de publicación.
2. **En tiempo no pierde:** con sonnet el lienzo fue el más rápido de los cuatro.
3. **Opus gasta 10–17 % más tokens que sonnet y tarda 2 a 3 veces más.**
4. **Juicio del autor sobre la calidad:** las opciones de opus están "levemente mejor estructuradas y son menos genéricas", aunque depende del prompt. Decisión: `ui-option` usa opus en el perfil `max` y sonnet en `balanced` y `economy`, la carta suma reglas de oficio y se repite la prueba con la carta mejorada.
5. **Defecto común a los dos lienzos:** el título de la segunda fila pisa la primera (120 px entre filas; el título necesita ≥ 223 px libres). La posición la tiene que calcular un script, no el modelo (plan del hito 4c: 260 px entre filas).
6. **Un agente informó trabajo que no existía** (gap G23): toda entrega se verifica mirando los archivos, no el informe.

## Funcionalidades

| | HTML local (`compare.html`) | Lienzo "Design" |
|---|---|---|
| Ver opciones lado a lado | Sí, en iframes | Sí, con zoom y paneo |
| Comentar sobre una pantalla | No | Sí |
| Editar a mano (texto, color, espaciado) | Solo tocando el archivo | Sí, con panel de propiedades y ajustes declarados |
| Compartir | Mandando archivos | Con un link (privado hasta compartirlo) |
| Funciona sin conexión | Sí | No |
| El contenido sale de la máquina | No | Sí (claude.ai) |
| Lo leen las mediciones de pignolo-ui (navegador, reglas) | Sí | No directo: hace falta el HTML plano |
| Depende de la cuenta y de la herramienta | No | Sí (tipo "Design") |
| Fuentes de Google | No (regla de `ui-option`) | Sí |
| Quién define el formato | El plugin | Anthropic (puede cambiar) |

## Decisión del autor (2026-10-01)

Pantallas de UI en el lienzo siempre que la cuenta tenga el tipo (aviso de una línea, sin pregunta; un lienzo por proyecto); colores, fuentes y bases en HTML local; `DESIGN.md` publicado además como "Design System". `ui-option` sigue escribiendo HTML plano y un script lo convierte a artboard, así las mediciones y los aprobados leen HTML. Plan: `docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md`.

## Repetición con la carta de `ui-option` mejorada (2026-10-01)

Mismo brief y misma tarea (4 pantallas HTML más la página de comparación), con la carta de la rama `ui/option-craft` (pignolo-ui 0.6.2), que suma una sección de oficio: comprometerse con un estilo nombrable, derivar la jerarquía del contenido y diferenciar las opciones por estructura.

| Brazo | Tokens | Tiempo | Usos de herramientas | HTML escrito | Estilos que declaró |
|---|---|---|---|---|---|
| Sonnet, carta anterior | ~76 mil | 67 s | 7 | 13,2 KB | no se pedía |
| Sonnet, carta mejorada | ~75 mil | 62 s | 9 | 13,7 KB | A "libro de movimientos denso"; B "número protagonista, fondo verde noche" |
| Opus, carta anterior | ~84 mil | 145 s (con repetición) | 8 | 16,2 KB | no se pedía |
| Opus, carta mejorada | ~79 mil | 134 s | 9 | 18,6 KB | A "dense ledger"; B "quiet monument" |

**Lectura:** las reglas de oficio no encarecen (sonnet igual, opus algo menos porque esta vez no hubo repetición). Opus sigue tardando el doble que sonnet. Si la carta mejorada alcanza para que sonnet deje de ser genérico lo decide el autor mirando los resultados; hasta entonces rige opus en `max` y sonnet en `balanced` y `economy`. Una corrida por brazo.

## Juicio del autor tras mirar los seis resultados (2026-10-01)

El que más le gustó fue **el lienzo generado por opus con el brief original** (brazo "Lienzo, opus"). Ese brazo no usó la carta de `ui-option`: siguió las instrucciones del propio tipo "Design" (que traen reglas de oficio y permiten fuentes de Google) y lo escribió opus. La carta mejorada de `ui-option` no cambió su preferencia. Consecuencia para el plan del hito 4c: la calidad que el autor prefirió salió de opus más las reglas del tipo, así que el modelo de `ui-option` y qué reglas de oficio recibe se deciden con ese dato (decisión del autor pendiente al momento de escribir esto).

## Tercera medición: carta candidata, contexto de producto y datos de muestra (2026-10-01)

Mismo brief (4 pantallas HTML locales más la página de comparación), todos con sonnet, un agente por brazo, una corrida. La carta "actual" es la de `main` (pignolo-ui 0.7.2, con la sección de oficio del 0.6.2).

| Brazo | Qué cambia | Tokens | Tiempo | HTML escrito | Estilos que declaró |
|---|---|---|---|---|---|
| Carta actual | línea de base | ~76 mil | 81 s | 14,2 KB | A libro denso (blanco, tinta pizarra); B utilitario fuerte (pizarra oscura, un `[SALDO]` enorme, acción amarilla) |
| Carta candidata | suma las reglas de oficio tomadas de impeccable, de las skills de Emil Kowalski y de la guía de Apple (texto propio) | ~79 mil | 92 s | 20,1 KB | A libro denso (claro, acento verde azulado); B editorial nocturno (tinta oscura, número con serifas, acento ámbar) |
| Carta actual + `PRODUCT.md` | un contexto de producto de 7 líneas (para quién, qué quiere saber primero, tono, qué no se quiere) | ~78 mil | 96 s | 17,2 KB | A libro denso (tipografía condensada, verde azulado); B editorial sereno (un número grande con serifas, márgenes amplios, verde) |
| Carta actual, datos de muestra rotulados | en vez de marcadores, datos de ejemplo con `data-sample` y la línea "Datos de muestra" | ~77 mil | 81 s | 15,8 KB | A libro denso; B número único con serifas, calmo |

**Lo que cuenta un script:** los cuatro brazos entregaron los 5 archivos (verificado mirando las carpetas), ninguno trae recursos remotos, y el costo es el mismo (76 a 79 mil tokens, 81 a 96 s): ni la carta candidata ni el contexto de producto ni los datos de muestra encarecen. La carta candidata escribe ≈ 40 % más HTML.

**Lo que no cuenta un script:** cuál se ve mejor. Lo juzga el autor mirando las cuatro páginas de comparación; hasta entonces no se toca la carta en `main`, no se decide `PRODUCT.md` por esta medición ni la regla de los datos de muestra (D-IM-7). Una corrida por brazo: orden de magnitud.

**Juicio del autor sobre la tercera medición (2026-10-01):** le gustaron mucho más el brazo con `PRODUCT.md` y el de la carta candidata, y prefiere los datos de muestra completos antes que ver solo un marcador como `[SALDO]`. Decisiones: la carta candidata de `ui-option` se adopta; las opciones llevan datos de muestra rotulados (`data-sample` y la línea "Datos de muestra") en lugar de marcadores; `PRODUCT.md` queda confirmado con evidencia (hito 4f).
