# CLAUDE.md — pignolo

Plugin de Claude Code con una metodología de desarrollo con agentes: autonomía acotada, verificación real (rojo demostrado, refutador, nada de "debería andar") y guardia de git. Repo público `Pign-a/Pignolo`, licencia MIT.

**Al retomar, leer primero `docs/STATE.md`**: estado, decisiones pendientes y qué sigue.

## Documentos

- Spec v1: `docs/specs/2026-09-26-pignolo-v1-design.md` (fuente de verdad del diseño).
- Tarjeta de alcance: `docs/specs/2026-09-26-pignolo-v1-scope-card.md`.
- Plan del hito 1: `docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md`.
- Auditorías: `docs/audits/`. Investigaciones: `docs/research/`.
- `local/` está fuera de git: material de trabajo no revisado para publicar.

## Convenciones

- Nombres de elementos del plugin en inglés (`review`, `project.md`, `implementer`...). Texto interno de skills, agentes y reglas en inglés. Mensajes al autor, commits y docs en español.
- Commits en español, Conventional Commits.
- Todo cambio publicado de un plugin sube su `version` en `plugin.json` y suma su entrada al CHANGELOG: sin eso, `/plugin update` no lo toma.
- Node ≥ 22, sin dependencias npm; tests con `node:test` vía `npm test` (no `node --test tests/`).
- Método liviano (decisión del autor, 2026-09-30, para gastar menos y avanzar más rápido): planes en tarjetas (archivos, interfaces, casos de test literales), sin construir el hito en una copia al escribir el plan; el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Planes e implementación en sonnet; una sola revisión opus por hito al final, con una pasada de arreglos; auditoría previa del plan solo en hitos de riesgo (guardia, borrados, respaldos). Uno o dos frentes a la vez.
- Revisores y auditores siempre en opus.
- Decisiones del autor (el agente nunca las toma solo): identidad y alcance del producto, costos, dependencias, push, publicar, borrar, cambiar un contrato, temas legales. Lo técnico lo decide el agente y lo deja registrado.
- El repo es público: nada de datos del proyecto donde se usa pignolo, personas ni credenciales en lo versionado.
