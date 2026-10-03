# Comprobaciones manuales del asistente de inicio

Las hace el autor cuando cierre la v1 (con `claude` real, en su terminal, con pignolo 0.20.0 y pignolo-panel 0.3.0 instalados). Marcar cada una con fecha y resultado ("probado" o "no probado").

Lo que ya se probó con `claude` real (sondas del Task 0, 2026-10-03, un proyecto de prueba sin interfaz): `$.fs.read` y `$.fs.exists` leen dentro de `.git/`, `$.fs.stat` distingue carpeta de archivo, `prompt.submit` con un texto que empieza con `/` **se rechaza** ("a text beginning with / would run a command as the user"). Lo demás se leyó de la doc de mods y se probó con el motor de tests, no en una terminal.

- [ ] Proyecto nuevo sin `.pignolo/project.md`, pignolo y pignolo-panel instalados: al abrir Claude Code el asistente aparece solo, con el marco redondeado y el paso 1 con lo detectado (puede tardar unos segundos: la detección corre aparte tras el arranque).
- [ ] **Cómo se ve un botón con tecla**: el motor antepone la tecla al texto (`a: …`). Mirar que las filas de opciones queden alineadas y el borde derecho no se corra; si se ve mal, ajustar `wizardTree` (el resto del marco es texto).
- [ ] Cerrar y abrir de nuevo Claude Code en el mismo proyecto: **no** se abre solo; `/pignolo-panel wizard` sí (y retoma el paso donde quedó).
- [ ] Recorrer con `Enter`, `p` y las letras: 5 pasos (6 con pignolo-ui), la barra avanza, la opción recomendada viene marcada y nada se desalinea en una terminal de 144 columnas y en una de 100 (con menos de 72 columnas el panel dice cuánto falta).
- [ ] `Enter` sigue de verdad (el botón de seguir tiene el foco al abrir el paso y después de elegir una letra); `Esc` cierra el panel y el asistente no se reabre solo en la sesión.
- [ ] Paso de carpetas (en un proyecto con `specs/` o `plans/` sueltos): el número de la fila cambia entre adoptar, mover y dejar.
- [ ] Aplicar: llega **un** mensaje (`Activá pignolo en este proyecto con estas elecciones: --choices {…}`), la skill `init` se activa, pregunta el paso 0 y muestra la pantalla de confirmación con la vista previa; Cancelar deja el proyecto igual (`git status` limpio y sin `.pignolo/`).
- [ ] Aplicar y aceptar: aparece `.pignolo/project.md`, el perfil y los permisos elegidos (en `~/.pignolo/config.json` y `~/.claude/settings.json` o `.claude/settings.json`) y la estructura de carpetas; el panel vuelve a ser el de siempre.
- [ ] Repo en blanco: el asistente lo dice y ofrece solo la estructura; en Desktop (sin `Raster`) todo se ve igual.
- [ ] Borrar `.git/pignolo/wizard-detect.json` o dejarlo con basura: el asistente no se abre y no hay errores.
- [ ] `autoOpen` en `false`: no se abre solo; `/pignolo-panel wizard` sí.
- [ ] En una worktree enlazada: no se abre solo (la detección se deja en el checkout principal; el asistente queda en `/pignolo:init`).
- [ ] `git status` del proyecto, antes y después del arranque con el asistente: igual (el archivo de detección y el marcador viven en `.git/`).
