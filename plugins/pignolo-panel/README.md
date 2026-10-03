# pignolo-panel

Panel visual **opcional** para pignolo. Es un mod de Claude Code (**2.1.287 o más nuevo**) que **solo lee y dibuja**: no aprueba, niega, edita ni ejecuta nada, y no toca lo que dibuja Claude Code. Se instala aparte (`/plugin install pignolo-panel@pignolo`); sin él, pignolo anda igual (la guardia de git, el registro y `/pignolo:status` no dependen del panel).

## Qué muestra

- **Banda** arriba del prompt: plan, progreso, agentes corriendo, decisiones tuyas, costo de la sesión y el siguiente paso. La tecla `0` (con el prompt vacío) abre el panel.
- **Panel `/pignolo-panel`** (`Esc` cierra, `1` Ahora, `2` Ramas, `3` Costo), con cada bloque en un marco redondeado:
  - **Siguiente**: el paso que pignolo recomienda (sale del registro; el mod no tiene reglas propias). Sus botones **llenan** el prompt, nunca lo envían.
  - **Te toca**: las decisiones que son tuyas, numeradas, con las opciones en letras (`a`, `b`, `d`...; la recomendada primero). Apretar una letra **envía** como mensaje tuyo `Respuesta a la decisión Q-1 ("<pregunta>"): <opción>.`; `Otra…` solo llena el prompt para que escribas. `p` despliega bajo cada opción lo que gana y pierde; `z` deja la primera decisión para después (solo se oculta en la sesión; `close-session` la persiste y la vuelve a mostrar).
  - **En curso**: tarjetas del plan con barra fina, hilo entre tarjetas y la evidencia rojo/verde.
  - **Trabajando**: agentes corriendo y su actividad.
  - **Ramas**: tabla alineada con las etapas de cada rama sin unir. `Tab` y `Enter` eligen una fila; `c` copia la rama (o la ruta del informe de una tarjeta) y `h` el hash.
  - **Costo**: costo y contexto de la sesión y, por agente, minutos y tokens (la API no da costo por agente).
- **Abrir solo**: con `autoOpen` prendido (por defecto) el panel se abre una vez cuando aparece una decisión nueva tuya, si la terminal tiene 144 columnas o más (110 después de la primera vez). Nunca en bucle. Se apaga en la configuración del plugin.
- **Modo demo**: `/pignolo-panel demo` (o la opción `demo`) muestra datos de muestra.

## De dónde saca los datos

De un solo archivo: `.pignolo/panel-state.json` (formato `pignolo-panel-state/1`), que escribe el núcleo `pignolo` y no va a git. El mod no lee `.git`, ni `run.json`, ni los planes. Sin ese archivo dibuja una sola línea ("pignolo no está activo en este proyecto"); con un registro de una versión más nueva pide actualizar el panel.

## Qué puede hacer el mod (y nada más)

`fs.read`/`fs.exists` del registro, `clock`, dibujar (`ui.*`, incluido copiar con `ui.copy`), `session.cwd`/`session.usage`, `command.register` (el comando `/pignolo-panel`), `prompt.suggest`/`prompt.fill` y **un solo** `prompt.submit` (la respuesta de una decisión, desde el botón de una opción). `tests/panel-trust.test.js` lo verifica sobre `claude plugin validate`.

## Probarlo

```
claude --plugin-dir plugins/pignolo-panel
claude plugin validate plugins/pignolo-panel
claude plugin test plugins/pignolo-panel        # corre sin sesión ni red y no gasta tokens
npm run test:panel                               # estáticos de confianza + validate + test
```

La lista de comprobaciones manuales (terminal ancha y angosta, colores del tema, responder una decisión, versión vieja) está en `tests/manual/panel.md`.

## Sin resolver

- **Color `warning`**: el mod usa la clave `warning` del tema y cae a `claude` solo si el tema dice que no la tiene; Claude Code no expone las claves del tema a un mod, así que en la práctica siempre se pide `warning`. Falta ver el color real en una terminal.
- **Tab sobre la sugerencia**: no se pudo verificar que Tab acepte la sugerencia del prompt; por eso la banda no lo promete (dice "tecla 0 abre el panel").
- **`?`**: el hotkey de un botón es un dígito o una letra minúscula; `?` no es válido, así que pros y contras van en `p`.
- **Costo por agente**: la API no lo informa; el panel muestra minutos y tokens.
- **Otra**: una respuesta libre escrita tras `Otra…` no es una de las opciones registradas, así que el hook no marca la decisión como respondida (el agente la ve igual como cita literal tuya).
- Recargar el mod en una sesión real y el abrir solo en una terminal real no están probados fuera del motor de pruebas.
