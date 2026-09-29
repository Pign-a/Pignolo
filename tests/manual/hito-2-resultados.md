# Resultados del checklist manual — hito 2

Primera corrida parcial en una sesión real de Claude Code, 2026-09-29. Windows 11, plugin 0.2.0 instalado desde GitHub, repo de prueba descartable (sin git al empezar; se inicializó durante la corrida).

| Punto | Resultado | Nota |
|---|---|---|
| 1. `/pignolo:setup` | OK, con dos detalles | Corrió `check` (único aviso: superpowers presente), preguntó perfil, presentación e idioma y escribió `~/.pignolo/config.json` (`balanced`, `artifact`, idioma). Mostró la vista previa de permisos sin escribir; con el sí explícito ("proyecto únicamente") escribió solo el `settings.json` del proyecto (96 deny, 25 ask) y no tocó el del usuario. Sin respaldo porque el archivo no existía (esperado). Listó dos conflictos de reglas con cita de ambas partes; el autor resolvió "primero pignolo y después lo local", con la seguridad del humano por encima. **Detalles:** el modelo dijo 97 deny cuando eran 96 (contó a mano) y el resumen no nombró la ruta de la config; arreglado en 0.2.1 (la skill usa los conteos del JSON y nombra las rutas). La resolución de conflictos no se guarda en ningún archivo: pendiente para el hito 3. |
| 1b. Legibilidad de `/pignolo:setup` | Mejorado en 0.2.1 | El autor la encontró confusa: mucho texto y sin orden. Se reescribió: un paso por mensaje, primero en pocas palabras y debajo el detalle técnico (spec §4.6). |
| 2 | Sin probar | |
| 3. `Explore` sin `project.md` | OK | El despacho pasó y el agente corrió en segundo plano. |
| 4–12 | Sin probar todavía | `.pignolo/project.md` ya creado en el repo de prueba; el proyecto figura activo. |

## Pendiente

Los puntos 2 a 12, con `.pignolo/project.md` creado a mano en el repo de prueba.
