# Comprobaciones manuales del panel

Las hace el autor cuando cierre la v1 (con `claude` real, en su terminal). Marcar cada una con fecha y resultado.

- [ ] **Terminal ancha** (144 columnas o más): aparece una decisión nueva (`node plugins/pignolo/scripts/panel.js ask ...`) y el panel se abre solo, una vez; cerrarlo con `Esc` no lo reabre; una segunda decisión nueva lo abre de nuevo con 110 columnas o más.
- [ ] **Terminal angosta** (menos de 110 columnas): el panel no se abre solo; `0` o `/pignolo-panel` lo abre y los bloques no se pegan al borde.
- [ ] **Colores del tema**: el color de "trabajando" y de lo que espera una decisión (`warning`) se ve; con un tema sin esa clave no se rompe.
- [ ] **Responder una decisión desde "Te toca"**: al apretar una letra llega el mensaje `Respuesta a la decisión Q-<n> ("<pregunta>"): <opción>.`, el agente lo trata como la respuesta y la decisión desaparece del panel.
- [ ] **`p` y `z`**: `p` despliega y pliega lo que gana y pierde cada opción; `z` oculta la decisión y reaparece en la sesión siguiente si no se respondió; tras `/pignolo:close-session` figura como pospuesta y se lista.
- [ ] **Copiar**: `Tab` hasta una rama, `Enter`, `c` copia el nombre; `h` el hash; en una tarjeta con informe, `c` copia la ruta.
- [ ] **Con Claude Code anterior a 2.1.287** el panel no aparece y la guardia sigue funcionando (`git push --force` a `main` se niega igual).
- [ ] **Con `--safe-mode`** no hay panel y la guardia sigue.
- [ ] **`/pignolo:status`** muestra el estado en texto.
- [ ] **Con `autoOpen` apagado** el panel no se abre solo.
- [ ] **Sin pignolo en el proyecto**: la banda dice una sola línea, "pignolo no está activo en este proyecto".
