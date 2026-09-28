# Estado de pignolo

_Última actualización: 2026-09-27._ Leer esto primero al retomar.

## Dónde estamos

- **Diseño:** spec v1 aprobado (`docs/specs/2026-09-26-pignolo-v1-design.md`), revisado en dos rondas por IA; tarjeta de alcance aprobada por el autor (`docs/specs/2026-09-26-pignolo-v1-scope-card.md`).
- **Plan del hito 1** (`docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md`): 9 tareas. La Task 9 (`rules/core.md` + test de tamaño) se agregó el 2026-09-27 (`f5648ed`, **commit local sin pushear**).
- **Auditoría independiente ronda 2** (`docs/audits/2026-09-27-auditoria-plan-hito-1.md`): `REQUEST_CHANGES`. El replay coincide con el plan en las 9 tareas, pero la guardia deja pasar 45 de 119 comandos destructivos. El más grave (F1) borra `.git` y con él las instantáneas, que hoy viven dentro del repo.
- **El plugin nunca corrió dentro de Claude Code**: todo lo probado son módulos y el launcher como subproceso. Los puntos 7 y 8 del checklist manual (payload real de `UserPromptExpansion` para una skill de plugin; si `systemMessage` se muestra) siguen sin verificar.

## Investigaciones terminadas (2026-09-27)

- **Ciega** (sin contexto del proyecto): cómo resuelven otras herramientas la protección contra comandos destructivos, la recuperación y la revisión entre agentes. Informe en `docs/research/2026-09-27-seguridad-agentes-ciego.md` (movido con el ok del autor tras revisar que no tiene datos privados).
- **Con contexto**: `docs/research/2026-09-27-seguridad-agentes-contexto.md` (tabla F1–F12 → arreglo, mediciones propias en un repo sintético de 20.000 archivos).

**En qué coinciden las dos:**
- Ninguna guardia de texto publicada (dcg, cc-safety-net, la de Trail of Bits, las reglas deny de Claude Code) se declara barrera contra un atacante: todas son "best-effort". Claude Code (CVE-2025-66032) y Cursor abandonaron sus denylists tras evasiones publicadas.
- La red real es la recuperación **fuera del repo**; un respaldo dentro de `.git` muere con `.git`. Codex es el único que deja `.git` en solo lectura por defecto, y el único con sandbox nativo en Windows. El sandbox de Claude Code no existe en Windows nativo y sus checkpoints no cubren lo que hace Bash.
- Ante lo que no se puede analizar: bloquear (fail-closed).

**Propuesta que sale de cruzarlas** (**aprobada por el autor el 2026-09-27**, tal cual):
1. **Modelo de amenaza escrito:** agente útil pero falible, no atacante. Lo adversarial (prompt injection, modos `auto`/`bypass`) se deriva a WSL2 con sandbox o a un devcontainer.
2. **Instantáneas en un repo sombra** `~/.pignolo/shadow/<repo-id>.git`, sembrado en SessionStart, índice persistente (medido: 0,22 s por instantánea incremental; 2,1 s sembrado con `fetch`; 60 s sin sembrar). No `git bundle` (el incremental depende de objetos del `.git` que se quiere proteger) ni alternates. Las refs WIP dentro del repo quedan como segunda copia mientras la sombra no esté sembrada.
3. **Conjunto catastrófico siempre activo:** `rm`/`Remove-Item`/`find -delete`/`mv` sobre `.git` o `~/.pignolo`, o con glob/variable en la raíz del repo → bloqueo.
4. **Guardia bash estructural:** el disparador no es "menciona git" sino "hay ejecución que no se ve como argv literal" (comando dinámico, `eval`, `source <(…)`, stdin, `-c/-e`, `awk system`, `sed e`, wrappers desconocidos con `git`, subcomandos de git que lanzan shell). Parseo fallido o tope alcanzado: bloqueo siempre.
5. **PowerShell con el AST nativo** (`powershell.exe`, medido 205–253 ms por comando) en vez del tokenizador propio.
6. **Reglas de git:** bloquear lo no recuperable (`send-pack`, mirror, `+refspec`, `--no-verify`); preguntar por lo recuperable por reflog.
7. **Hook de Edit/Write** sobre `.git/**`, `.claude/**` y `~/.pignolo/**`; aliases de git resueltos en SessionStart.
8. **Launcher** con plazo interno que niega (~3 s) y timeout del hook de 30–60 s.
9. **Interruptor declarado como falsificable** (no es un límite de seguridad; ya no apaga la guardia).
10. **Corpus de tests:** lo que debe bloquearse y lo que debe pasar (sacado de transcripciones reales), registro de riesgo residual y un canario por familia.

## Decisiones del autor (2026-09-27)

1. Propuesta de 10 puntos: **aprobada tal cual**.
2. Ante lo no verificable: **según el modo**, `deny` en `auto`/`bypass`/`dontAsk`, `ask` en interactivo.
3. El conjunto catastrófico **no** se apaga con `PIGNOLO_DISABLED`.
4. Se pagan **~0,2 s por comando PowerShell** por el AST nativo.
5. El repo sombra **no** captura archivos ignorados.
6. WSL2 con sandbox (o devcontainer) para `auto`/`bypass` adversariales: **se documenta como recomendación**, no se exige por código.
7. Push: **todavía no**; los commits locales quedan sin subir hasta que el autor diga.

8. Retención del repo sombra: **14 días ajustada** (spec §11.6).
9. Umbral de falsos positivos: **síntesis** (núcleo en 0, deny ≤ 2 comandos distintos, ask ≤ 1 % interactivo, deny+ask ≤ 1 % en modos autónomos; spec §15).
10. Método: toda pregunta de decisión pasa antes por un debate con un agente opus por opción; 8 y 9 se decidieron así.

11. El autor pide que pignolo sea **simple** de entender y de usar, y delega lo técnico ("fijate vos"). Solo se le pregunta lo reservado en `CLAUDE.md`.

## Decisiones técnicas del agente

- Ejecución del hito 1: **con subagentes**, un implementador por tarea y un revisor opus por tarea. Motivo: cada tarea es larga y autocontenida, y el revisor independiente es parte del método. Queda en una sola rama local, sin push.
- Simplificaciones decididas el 2026-09-28 (pasada sobre §11.6): (1) el `git bundle --all` se reemplaza por traer todas las refs al repo sombra: un solo almacén externo en vez de dos; (2) los aliases de git no se leen en SessionStart: un subcomando de git desconocido se trata como no verificable (ask/deny según el modo). Los agentes proponen más recortes con evidencia del corpus; nunca se afloja el conjunto catastrófico ni el fail-closed estructural.
- Antes de reescribir el plan, una **pasada de simplificación** sobre §11.6 con lo que mida el agente de la guardia: se recorta lo que agrega complejidad sin frenar nada en el corpus.

## Decisiones pendientes del autor

1. Pushear los commits locales a `Pign-a/Pignolo` (repo público).

## En curso

- 2026-09-28: el agente de la guardia de la sesión anterior no dejó informe (la sesión se cortó). Se relanzó partido en dos agentes opus en paralelo, cada uno en su copia con git propio dentro de `local/guard-fix-2026-09-28/` (fuera del scratchpad, para que sobreviva):
  - `guard/`: conjunto catastrófico, guardia bash estructural, PowerShell por AST, reglas de git, F1–F12, corpus y medición de falsos positivos con las transcripciones. Informe en `INFORME-guard.md`.
  - `backup/`: repo sombra, fallback en el repo, respaldo de refs, retención, plazo interno del launcher. Informe en `INFORME-backup.md`.
  - Cada informe se actualiza paso a paso; si la sesión se corta, se retoma desde ahí.
  - `backup/` **terminado** (359/359 verificado, 6 commits). Recortes: gc con heurística y rehacer el índice al cerrar sesión, al hito 6; respaldo de refs antes de cada despacho, al hito 2; el fallback en el repo se mantiene (la primera siembra tarda ~3 s).
  - Decisiones técnicas tomadas al cerrar `backup/`: `refs/pignolo/backup/*` sigue la misma regla de 14 días (se implementa al unir); git ≥ 2.31 como requisito declarado; el spec (§2, §11.6) se actualiza al unir para reflejar la sombra en lugar del bundle y el gc diferido.
- Después: unir las dos copias, pasar el código a las Tasks 2, 3a, 3b, 4, 5 y 7 del plan y pedir la tercera auditoría.
- Pedido nuevo del autor (2026-09-28): módulo de UI opcional (design.md, 3 opciones por decisión con artifacts y un subagente por opción, auditor de jerarquía y buenas prácticas contra Apple HIG, mejora de una pantalla puntual, normas de diseño base). En definición (brainstorming): aprobado plugin hermano independiente `pignolo-ui`, web agnóstico de framework, 3 subagentes por decisión ajustable a 1, formato DESIGN.md de Google Labs con extensión `pignolo:`, partes 1 y 2 del diseño aprobadas. Investigación técnica de normas UI en `local/research-ui-2026-09-28/INFORME.md` (sin revisar para publicar).

**Fuera de alcance a declarar** (según la investigación con contexto): prompt injection, contenido de scripts invocados, aliases y funciones de `~/.bashrc`, expansión exacta de globs, strings reconstruidos dentro de intérpretes, hooks que vencen, archivos ignorados y submódulos en las instantáneas, rutas 8.3 y enlaces simbólicos, falsificación del interruptor.

## Siguiente paso después de decidir

1. ~~Rehacer el diseño de la guardia y las instantáneas en el spec~~ (hecho el 2026-09-27, `19bc9f3`: §0b, §1.9, §3.3, §8.3, §8.4, §11.6, §15, §18). Falta reescribir las tareas afectadas del plan (3a, 3b, 4, 5, 7 y probablemente 2 por el plazo interno del launcher). Un agente opus corrige F1–F12 en una copia de trabajo (partiendo de la réplica de `local/audits/2026-09-27-auditoria-2/repo/`), con rojo y verde demostrados, y recién ahí pasa el código al plan.
2. Tercera auditoría independiente del plan corregido.
3. Ejecutar el hito 1 y correr el checklist manual `tests/manual/hito-1.md` en una sesión real.

## Material fuera de git (`local/`, en `.gitignore`)

No se versiona porque el repo es público y ese material no se revisó para publicar (algunas investigaciones mencionan el proyecto donde nació pignolo).

- `local/research-2026-09-25/`: investigaciones de orquestación que dieron origen a pignolo.
- `local/research-2026-09-26/`: investigaciones de tests, ramas, continuidad, perfiles de agentes, las cuatro validaciones del borrador y los borradores de reglas.
- `local/audits/2026-09-27-auditoria-2/`: réplica del plan (`repo/`), herramientas de caza (`_tools/`) y documentación oficial descargada (`docs/`).
