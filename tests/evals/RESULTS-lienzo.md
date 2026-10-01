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
