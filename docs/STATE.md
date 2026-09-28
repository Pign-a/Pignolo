# Estado de pignolo

_Última actualización: 2026-09-27._ Leer esto primero al retomar.

## Dónde estamos

- **Diseño:** spec v1 aprobado (`docs/specs/2026-09-26-pignolo-v1-design.md`), revisado en dos rondas por IA; tarjeta de alcance aprobada por el autor (`docs/specs/2026-09-26-pignolo-v1-scope-card.md`).
- **Plan del hito 1** (`docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md`): 9 tareas. La Task 9 (`rules/core.md` + test de tamaño) se agregó el 2026-09-27 (`f5648ed`, **commit local sin pushear**).
- **Auditoría independiente ronda 2** (`docs/audits/2026-09-27-auditoria-plan-hito-1.md`): `REQUEST_CHANGES`. El replay coincide con el plan en las 9 tareas, pero la guardia deja pasar 45 de 119 comandos destructivos. El más grave (F1) borra `.git` y con él las instantáneas, que hoy viven dentro del repo.
- **El plugin nunca corrió dentro de Claude Code**: todo lo probado son módulos y el launcher como subproceso. Los puntos 7 y 8 del checklist manual (payload real de `UserPromptExpansion` para una skill de plugin; si `systemMessage` se muestra) siguen sin verificar.

## Investigaciones terminadas (2026-09-27)

- **Ciega** (sin contexto del proyecto): cómo resuelven otras herramientas la protección contra comandos destructivos, la recuperación y la revisión entre agentes. Informe en `C:\Users\pigna\AppData\Local\Temp\pignolo-research\blind.md`: el agente no tuvo permiso para escribir en este repo; **pendiente moverlo a `docs/research/2026-09-27-seguridad-agentes-ciego.md` con el ok del autor** (si se perdió, relanzarla).
- **Con contexto**: `docs/research/2026-09-27-seguridad-agentes-contexto.md` (tabla F1–F12 → arreglo, mediciones propias en un repo sintético de 20.000 archivos).

**En qué coinciden las dos:**
- Ninguna guardia de texto publicada (dcg, cc-safety-net, la de Trail of Bits, las reglas deny de Claude Code) se declara barrera contra un atacante: todas son "best-effort". Claude Code (CVE-2025-66032) y Cursor abandonaron sus denylists tras evasiones publicadas.
- La red real es la recuperación **fuera del repo**; un respaldo dentro de `.git` muere con `.git`. Codex es el único que deja `.git` en solo lectura por defecto, y el único con sandbox nativo en Windows. El sandbox de Claude Code no existe en Windows nativo y sus checkpoints no cubren lo que hace Bash.
- Ante lo que no se puede analizar: bloquear (fail-closed).

**Propuesta que sale de cruzarlas** (a confirmar por el autor):
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

## Decisiones pendientes del autor

1. Aprobar la propuesta de arriba (o ajustarla).
2. `deny` o `ask` ante lo no verificable, según `permission_mode` (recomendación: `deny` en `auto`/`bypass`/`dontAsk`, `ask` en interactivo).
3. Umbral aceptable de falsos positivos (nadie publica tasas; medir con transcripciones propias).
4. Disco y retención del repo sombra; si captura archivos ignorados (recomendación: no).
5. Si el conjunto catastrófico se apaga con `PIGNOLO_DISABLED` (recomendación: no).
6. Si se pagan ~0,2 s por comando PowerShell por el AST nativo.
7. Si se exige WSL2 con sandbox para los modos `auto`/`bypass`.
8. Pushear `f5648ed` y `918ced3` a `Pign-a/Pignolo` (repo público).
9. Cómo ejecutar el hito 1: subagentes (recomendado) o ejecución directa.

**Fuera de alcance a declarar** (según la investigación con contexto): prompt injection, contenido de scripts invocados, aliases y funciones de `~/.bashrc`, expansión exacta de globs, strings reconstruidos dentro de intérpretes, hooks que vencen, archivos ignorados y submódulos en las instantáneas, rutas 8.3 y enlaces simbólicos, falsificación del interruptor.

## Siguiente paso después de decidir

1. Rehacer el diseño de la guardia y las instantáneas en el spec (§8, §11.6) según lo aprobado, y reescribir las tareas afectadas del plan. Un agente opus corrige F1–F12 en una copia de trabajo (partiendo de la réplica de `local/audits/2026-09-27-auditoria-2/repo/`), con rojo y verde demostrados, y recién ahí pasa el código al plan.
2. Tercera auditoría independiente del plan corregido.
3. Ejecutar el hito 1 y correr el checklist manual `tests/manual/hito-1.md` en una sesión real.

## Material fuera de git (`local/`, en `.gitignore`)

No se versiona porque el repo es público y ese material no se revisó para publicar (algunas investigaciones mencionan el proyecto donde nació pignolo).

- `local/research-2026-09-25/`: investigaciones de orquestación que dieron origen a pignolo.
- `local/research-2026-09-26/`: investigaciones de tests, ramas, continuidad, perfiles de agentes, las cuatro validaciones del borrador y los borradores de reglas.
- `local/audits/2026-09-27-auditoria-2/`: réplica del plan (`repo/`), herramientas de caza (`_tools/`) y documentación oficial descargada (`docs/`).
