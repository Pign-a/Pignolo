# Estado de pignolo

_Última actualización: 2026-09-27._ Leer esto primero al retomar.

## Dónde estamos

- **Diseño:** spec v1 aprobado (`docs/specs/2026-09-26-pignolo-v1-design.md`), revisado en dos rondas por IA; tarjeta de alcance aprobada por el autor (`docs/specs/2026-09-26-pignolo-v1-scope-card.md`).
- **Plan del hito 1** (`docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md`): 9 tareas. La Task 9 (`rules/core.md` + test de tamaño) se agregó el 2026-09-27 (`f5648ed`, **commit local sin pushear**).
- **Auditoría independiente ronda 2** (`docs/audits/2026-09-27-auditoria-plan-hito-1.md`): `REQUEST_CHANGES`. El replay coincide con el plan en las 9 tareas, pero la guardia deja pasar 45 de 119 comandos destructivos. El más grave (F1) borra `.git` y con él las instantáneas, que hoy viven dentro del repo.
- **El plugin nunca corrió dentro de Claude Code**: todo lo probado son módulos y el launcher como subproceso. Los puntos 7 y 8 del checklist manual (payload real de `UserPromptExpansion` para una skill de plugin; si `systemMessage` se muestra) siguen sin verificar.

## En curso

Dos investigaciones en opus, lanzadas el 2026-09-27 desde una sesión de Claude Code abierta en el repo de MARA (sus avisos llegan a esa sesión):

- **Ciega (terminada):** cómo resuelven otras herramientas y plugins la protección contra comandos destructivos, la recuperación y la revisión entre agentes. Informe en `C:\Users\pigna\AppData\Local\Temp\pignolo-research\blind.md` (el agente no tuvo permiso para escribir en este repo; pendiente moverlo a `docs/research/2026-09-27-seguridad-agentes-ciego.md` con el ok del autor).
- **Con contexto:** para cada hallazgo F1–F12, la solución con más respaldo, y veredicto sobre las dos propuestas de abajo. Informe: `docs/research/2026-09-27-seguridad-agentes-contexto.md`.

Si al retomar los informes no están, las investigaciones no terminaron o se perdieron: relanzarlas con el mismo objetivo.

## Decisiones pendientes del autor

1. **Instantáneas fuera del repo** (`~/.pignolo/`, p. ej. `git bundle` o repo sombra), para que borrar `.git` no se lleve el respaldo. Cierra F1 de verdad.
2. **En bash, git solo en forma simple y directa** (como ya se hace en PowerShell): cualquier otra forma que mencione o pueda ejecutar git, y cualquier error de parseo, bloquea. Cierra F2–F5 a cambio de más falsos positivos.
3. **Pushear `f5648ed`** a `Pign-a/Pignolo` (repo público).
4. **Cómo ejecutar el hito 1:** subagentes (recomendado) o ejecución directa.

Esperan a los dos informes de investigación: con ellos se cruza evidencia y se propone el cambio concreto.

## Siguiente paso después de decidir

1. Un agente opus corrige F1–F12 en una copia de trabajo (partiendo de la réplica de `local/audits/2026-09-27-auditoria-2/repo/`), con rojo y verde demostrados, y recién ahí pasa el código al plan.
2. Tercera auditoría independiente del plan corregido.
3. Ejecutar el hito 1 y correr el checklist manual `tests/manual/hito-1.md` en una sesión real.

## Material fuera de git (`local/`, en `.gitignore`)

No se versiona porque el repo es público y ese material no se revisó para publicar (algunas investigaciones mencionan el proyecto donde nació pignolo).

- `local/research-2026-09-25/`: investigaciones de orquestación que dieron origen a pignolo.
- `local/research-2026-09-26/`: investigaciones de tests, ramas, continuidad, perfiles de agentes, las cuatro validaciones del borrador y los borradores de reglas.
- `local/audits/2026-09-27-auditoria-2/`: réplica del plan (`repo/`), herramientas de caza (`_tools/`) y documentación oficial descargada (`docs/`).
