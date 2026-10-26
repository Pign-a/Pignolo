# CLAUDE.md — pignolo

Pignolo 2 (1.0.0): un solo plugin de Claude Code, `pignolo`, que reemplaza a superpowers con pocas reglas y nada que bloquee. Seis skills (`start`, `work`, `validate`, `session`, `ui`, `ui-audit`) y ocho agentes, más un único hook de `SessionStart` que solo recuerda qué skill usar (`plugins/pignolo/hooks/`, no bloquea). Repo público `Pign-a/Pignolo`, licencia MIT. El plugin anterior vive en la etiqueta local `legacy`.

**Al retomar, leer primero `docs/STATE.md`**: estado, decisiones pendientes y qué sigue.

## Documentos

- Diseño (fuente de verdad): `docs/specs/2026-10-23-pignolo-2-design.md`; las decisiones están en su §8.
- Plan: `docs/plans/2026-10-23-pignolo-2.md`.
- Historial del plugin anterior: `docs/history/`, `docs/specs/2026-09-26-*`, `docs/gaps.md` (la sección de Pignolo 2 es la vigente).
- `local/` está fuera de git: material de trabajo no revisado para publicar.

## Convenciones

- Nombres de elementos del plugin en inglés (`review-code`, `ui-option`...). Texto interno de skills y agentes en inglés. Mensajes al autor, commits y docs en español.
- Commits en español, Conventional Commits.
- Todo cambio publicado del plugin sube su `version` en `plugins/pignolo/.claude-plugin/plugin.json` y suma su entrada al CHANGELOG: sin eso, `/plugin update` no lo toma.
- Node ≥ 22, sin dependencias npm; tests con `node:test` vía `npm test` (no `node --test tests/`). Los tests de navegador necesitan `PIGNOLO_UI_BROWSER` apuntando a Chrome en las máquinas donde Edge cierra el pipe de CDP.
- Pocas reglas, con su razón; nada de ceremonia que el riesgo del cambio no pida.
- El repo es público: nada de datos del proyecto donde se usa pignolo, personas ni credenciales en lo versionado.
- Decisiones del autor (el agente nunca las toma solo): identidad y alcance del producto, costos, dependencias, push, publicar, borrar, cambiar un contrato, temas legales. Lo técnico lo decide el agente y lo deja registrado.
