# Resultados del checklist manual — hito 2

Primera corrida parcial en una sesión real de Claude Code, 2026-09-29. Windows 11, plugin 0.2.0 instalado desde GitHub, repo de prueba descartable (sin git al empezar; se inicializó durante la corrida).

| Punto | Resultado | Nota |
|---|---|---|
| 1. `/pignolo:setup` | OK, con dos detalles | Corrió `check` (único aviso: superpowers presente), preguntó perfil, presentación e idioma y escribió `~/.pignolo/config.json` (`balanced`, `artifact`, idioma). Mostró la vista previa de permisos sin escribir; con el sí explícito ("proyecto únicamente") escribió solo el `settings.json` del proyecto (96 deny, 25 ask) y no tocó el del usuario. Sin respaldo porque el archivo no existía (esperado). Listó dos conflictos de reglas con cita de ambas partes; el autor resolvió "primero pignolo y después lo local", con la seguridad del humano por encima. **Detalles:** el modelo dijo 97 deny cuando eran 96 (contó a mano) y el resumen no nombró la ruta de la config; arreglado en 0.2.1 (la skill usa los conteos del JSON y nombra las rutas). La resolución de conflictos no se guarda en ningún archivo: pendiente para el hito 3. |
| 1b. Legibilidad de `/pignolo:setup` | Mejorado en 0.2.1 | El autor la encontró confusa: mucho texto y sin orden. Se reescribió: un paso por mensaje, primero en pocas palabras y debajo el detalle técnico (spec §4.6). |
| 2 | Sin probar | |
| 3. `Explore` sin `project.md` | OK | El despacho pasó y el agente corrió en segundo plano. |
| 4. Negar fuera de la allowlist | OK (parcial) | Con `project.md`, `Explore` y `general-purpose` se niegan con el mensaje de pignolo. El mensaje sugería `pignolo:explorer` también para `general-purpose`: arreglado en 0.2.2 (la alternativa depende del agente). `fork` y el despacho sin tipo quedan sin probar en vivo (cubiertos por tests). |
| 5. `/pignolo:off` y `/pignolo:on` | OK tras un bug | **Bug:** el modelo había entrado a `.claude/` y el cwd persistió; `/pignolo:off` guardó el flag en `.claude/.pignolo/.disabled` y la allowlist, que mira la raíz, siguió negando. Arreglado en 0.2.2 (el flag se resuelve a la raíz del proyecto). Repitiendo `/pignolo:off` desde la raíz, `general-purpose` pasó; `/pignolo:on` lo volvió a encender. |
| 6. `pignolo:explorer` | OK (parcial) | Pasa con el proyecto activo y devolvió un inventario del repo. No se verificó el modelo. El hilo principal no lo usó por su cuenta ("solo para skills de pignolo"): la frase fija de `description` funciona contra la delegación espontánea. |
| 10. `pignolo:researcher` | OK (parcial) | Pasa, investigó en la web y marcó los datos poco firmes con su fuente. No se verificó que no reciba el CLAUDE.md. |
| Decisión | Cambio de contrato | El autor encontró lenta la fricción: cada pedido de agente chocaba con el bloqueo y Claude preguntaba. Tras un debate (A mantener, B solo en flujos, C quitar) eligió B: la allowlist rige solo con `.pignolo/run.json` vigente (0.2.2). Los puntos 4 y 5 pasan a verificarse con esa marca. |
| 2, 7, 8, 9, 11, 12 | Sin probar todavía | |

## Pendiente

Los puntos 2 a 12, con `.pignolo/project.md` creado a mano en el repo de prueba.
