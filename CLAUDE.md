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
- Método liviano (decisión del autor, 2026-09-30, para gastar menos y avanzar más rápido): planes en tarjetas (archivos, interfaces, casos de test literales), sin construir el hito en una copia al escribir el plan; el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Planes e implementación en sonnet, con un solo ejecutor en serie por defecto (A/B del 2026-09-30, tests/evals/RESULTS-ejecucion.md: el paralelo fue ≈ 15 % más rápido con ≈ 2 veces más tokens y la misma calidad; paralelo solo si el tiempo de pared importa más que el costo); una sola revisión opus por hito al final, con una pasada de arreglos; auditoría previa del plan solo en hitos de riesgo (guardia, borrados, respaldos). Uno o dos frentes a la vez.
- Ciclo ejecutar → revisar → arreglar (decisión del autor, 2026-10-01, validada en `tests/evals/RESULTS-metodo.md`):
  - **Suite completa una sola vez por rama**, la corre el controlador con la máquina quieta, sobre la rama ya unida con `main` y después de los arreglos. Cada agente corre solo los archivos de test que toca y los de los módulos que dependen de lo que cambió. Un test nuevo que falla bajo carga es un hallazgo.
  - **El revisor entrega cada hallazgo importante determinista como test que falla** (parche o commit aparte), con la causa en una línea. El que arregla no edita esos tests; el rojo se comprueba antes del arreglo. Los hallazgos que dependen de una decisión del autor van en prosa.
  - **Qué cuenta como hallazgo:** solo lo que afecta la corrección, los datos o los requisitos. La pasada de arreglos cubre críticos e importantes; los menores van a `docs/gaps.md` salvo que cuesten una línea.
  - **Una revisión opus por grupo de hitos chicos** (hasta 3 hitos y ~1.500 líneas, hallazgos separados por hito). Lo que toca guardia, borrados, movimientos o privacidad tiene revisión propia.
  - **El revisor recibe el diff como archivo** armado por script; tras los arreglos hay una sola re-revisión acotada al diff del arreglo, en sonnet.
  - **Lista de autochequeo en el encargo del ejecutor** (máximo 5 ítems, cada uno respondido con evidencia): formas de git que saltan la guardia; rutas con otra capitalización, junctions y symlinks; archivos que no son UTF-8; lectores que quedaron con la forma vieja de un dato; cada afirmación del informe marcada "probado" o "no probado".
  - Los arreglos los hace un agente nuevo (retomar al ejecutor gasta más tokens); solo se retoma para un cambio chico sin cortes. Los informes entre agentes siguen en markdown, a un archivo, sin pegar historial.
- Pruebas y mediciones: siguen `docs/protocolo-de-pruebas.md` (ficha con hipótesis, métricas y regla de decisión antes de correr; brazo de control; repeticiones; calidad a ciegas; mediana y rango; nivel de evidencia E0 a E3 en cada cifra).
- Revisores y auditores siempre en opus.
- Decisiones del autor (el agente nunca las toma solo): identidad y alcance del producto, costos, dependencias, push, publicar, borrar, cambiar un contrato, temas legales. Lo técnico lo decide el agente y lo deja registrado.
- El repo es público: nada de datos del proyecto donde se usa pignolo, personas ni credenciales en lo versionado.
