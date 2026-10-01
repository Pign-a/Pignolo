# Estructura de carpetas recomendada: investigación y propuesta

_2026-10-01. Propuesta de diseño, sin código ni cambios en el repo. Todas las páginas web se consultaron el 2026-10-01; las citas pasaron por un resumidor, así que el texto es casi literal, no literal._

> **Nota del 2026-10-01 (posterior a esta investigación).** El autor decidió algo más fuerte que la recomendación D de abajo: esqueleto siempre (proyecto nuevo y existente) solo para lo que no es código, y en un proyecto existente `init` valida lo que hay y propone adaptarlo (adoptar, mover con vista previa o dejar), con movimientos seguros y deshacibles. La investigación (variables, fuentes, ataques y fallas) sigue vigente como base; las decisiones y el diseño final están en `docs/plans/2026-10-01-hito-8d-estructura-de-carpetas.md`.

## 0. En pocas palabras

- Hoy pignolo no dice dónde va cada cosa. `init` deduce rutas que ya existen (`test-paths`, `high-risk-paths`, `visible-paths`) y la skill `plan` escribe en `docs/specs/` y `docs/plans/` con la ruta fija en su texto.
- Recomendación: **un mapa, no un molde**. `init` propone "qué tipo de archivo va en qué carpeta", armado con lo que el repo ya tiene, y lo guarda en `project.md`. No crea carpetas vacías ni mueve nada. Un script contesta "¿dónde va esto?" y otro lista los archivos sueltos. Avisa, no bloquea.
- La única carpeta que ofrece crear es una **privada, fuera de git**, para el material del cliente.

## 1. Las variables

| Variable | Cómo cambia la respuesta |
|---|---|
| Proyecto nuevo o existente | Nuevo: se puede proponer un mapa por defecto. Existente: el mapa describe lo que hay; no se propone un árbol nuevo. |
| Tipo (web, API, librería, CLI, móvil, monorepo, datos, sitio estático, sin código) | Cambia dónde vive el código, y eso lo decide el framework. Lo que no es código (specs, planes, material del cliente) es casi igual en todos. |
| Framework con layout propio | Next.js, Django, Rails, Go, Flutter reservan nombres. pignolo no puede opinar sobre esas carpetas. |
| Equipo o una sola persona | En equipo, lo compartido va en git y lo personal en `.git/info/exclude` o `settings.local.json`. `init` ya trabaja así (paso `auto-memory-off`). |
| Repo público o privado | En público, el material del cliente no entra nunca. En privado puede entrar el que no sea secreto ni pesado. |
| Con UI (pignolo-ui) | Ya ocupa `DESIGN.md` en la raíz, `design/approved/<flujo>/` (versionado) y `.pignolo-ui/runs/` (ignorado). El mapa los lista, no los redefine. |
| Material del cliente (briefs, referencias, imágenes, exports, contratos) | Dos destinos: versionable (referencias chicas y no privadas) y privado (contratos, exports con datos, archivos pesados). |
| Lo que nunca entra a git | Secretos (`.env*`), binarios grandes, archivos privados del cliente. |

Lo que pignolo ya pone en un proyecto (leído del repo):

- `.pignolo/project.md`, `.pignolo/state/{work,decisions,issues,learnings,sessions,metrics,plans,archive}/`, `INDEX.md` (spec §10.1).
- `.pignolo/tmp/`, `.pignolo/worktrees/`, `run.json`, `.disabled`: ignorados por `.pignolo/.gitignore` (`lib/pignolo-gitignore.js`).
- `docs/specs/<fecha>-<plan>-design.md` y `docs/plans/` (`skills/plan/SKILL.md`, líneas 22 y 26).
- `SECURITY.md` y `.gitattributes` en la raíz, si se aprueban (`lib/init-actions.js`).
- Las claves de `project.md` son una lista cerrada (`lib/project-md.js`, `KEYS`): ninguna habla de dónde dejar archivos.

## 2. Qué es buena práctica reconocida y qué es costumbre

### Reconocido, con fuente

**Instrucciones para agentes: cortas y sin describir carpetas.**
- Claude Code pide menos de 200 líneas por `CLAUDE.md`: "Longer files consume more context and reduce adherence" (https://code.claude.com/docs/en/memory).
- Sus buenas prácticas dicen que hay que excluir "File-by-file descriptions of the codebase" e "Information that changes frequently", y que un `CLAUDE.md` inflado hace que Claude ignore instrucciones (https://code.claude.com/docs/en/best-practices).
- `/doctor` recorta "directory layouts, dependency lists, and architecture overviews" (https://code.claude.com/docs/en/memory).
- Un estudio sobre AGENTS.md concluye que los archivos de contexto no mejoran en general la tasa de éxito, suben el costo más de 20 % y que los resúmenes del repositorio "are not helpful"; recomienda poner solo lo que no está ya en el código (https://arxiv.org/abs/2602.11988, enviado 2026-02-12, revisado 2026-09-29). Las cifras del cuerpo del artículo se leyeron de la versión HTML resumida: conviene confirmarlas en el PDF antes de publicarlas.
- Cursor: no duplicar lo que ya está en el código; "Add rules only when you notice Agent making the same mistake repeatedly" (https://cursor.com/docs/context/rules).

**Instrucciones por carpeta, cargadas a demanda.**
- Los `CLAUDE.md` de subcarpetas se cargan cuando Claude lee archivos ahí; `.claude/rules/*.md` con `paths:` se cargan solo al leer archivos que coinciden (https://code.claude.com/docs/en/memory).
- Para repos grandes: reglas generales en la raíz y un `CLAUDE.md` por área (https://code.claude.com/docs/en/large-codebases).
- AGENTS.md en monorepos: gana el archivo más cercano (https://agents.md/).
- Anthropic: "Folder hierarchies, naming conventions, and timestamps all provide important signals", y conviene cargar el contexto justo a tiempo, por rutas (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

**Qué va en git y qué no, en `.claude/`.**
- Se versionan `CLAUDE.md`, `.claude/settings.json`, `rules/`, `skills/`, `agents/`. `settings.local.json` y `CLAUDE.local.md` quedan fuera (https://code.claude.com/docs/en/claude-directory, https://code.claude.com/docs/en/memory).

**El código lo ordena el framework.**
- Next.js reserva `app/`, `pages/`, `public/`, `src/` y nombres de archivo, y fuera de eso es "unopinionated" (https://nextjs.org/docs/app/getting-started/project-structure).
- Rails y Django generan su árbol (https://guides.rubyonrails.org/getting_started.html, https://docs.djangoproject.com/en/5.2/intro/tutorial01/).
- Go: `cmd/` e `internal/` son convención oficial, y un paquete básico vive en la raíz (https://go.dev/doc/modules/layout).
- Python: pytest sugiere "strongly" el layout `src/` (https://docs.pytest.org/en/stable/explanation/goodpractices.html).
- Monorepos: `apps/` y `packages/` (https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository).
- Tests: no hay una regla única. Jest y Vitest encuentran tests al lado del código; Go los pone al lado; Rust separa unitarios (en el archivo) e integración (`tests/`); pytest prefiere fuera del código (https://jestjs.io/docs/configuration, https://vitest.dev/config/include, https://pkg.go.dev/cmd/go, https://doc.rust-lang.org/book/ch11-03-test-organization.html).

**Archivos con lugar fijo.**
- `README`, `SECURITY`, `CONTRIBUTING` se buscan en `.github/`, la raíz y `docs/`; `LICENSE` va en la raíz (https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file, https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
- Decisiones de arquitectura: MADR propone `docs/decisions/NNNN-titulo.md`; Nygard, `doc/arch/adr-NNN.md` y documentos cortos (https://adr.github.io/madr/, https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

**Lo que no entra a git.**
- Un secreto subido hay que revocarlo: reescribir la historia no alcanza, porque sigue en clones y forks (https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
- GitHub avisa a los 50 MiB y bloquea a los 100 MiB (https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).
- Lo compartido se ignora en `.gitignore`; lo personal de un clon, en `.git/info/exclude` (https://git-scm.com/docs/gitignore).
- Datos: Cookiecutter Data Science trata `data/raw` como inmutable e ignora `data/` por defecto (https://cookiecutter-data-science.drivendata.org/opinions/).

**Lo que se sabe que no funciona.**
- Carpetas vacías "por si acaso". Diátaxis: no crear "empty structures... with nothing in them"; "Good structure develops from within" (https://diataxis.fr/how-to-use-diataxis/). Diátaxis clasifica documentos, no manda carpetas.
- Git no guarda carpetas vacías: el índice solo lista archivos (https://archive.kernel.org/oldwiki/git.wiki.kernel.org/index.php/GitFaq.html). `.gitkeep` no aparece en la documentación de git: es costumbre.
- Plantillas que se pudren: quedan como código copiado sin forma de actualizarlo (https://cruft.github.io/cruft/). Cookiecutter mismo dice "If it's in the template but you don't need it, delete it!".
- Layouts "estándar" que no lo son: Russ Cox sobre golang-standards/project-layout, "this is not a standard Go project layout" (https://github.com/golang-standards/project-layout/issues/117, 2021-04-09).
- Windows: rutas de más de 260 caracteres, nombres reservados (`CON`, `NUL`, `AUX`...) y sistema de archivos que no distingue mayúsculas (https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation, https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file, https://git-scm.com/docs/gitfaq).

### Solo costumbre (no hay fuente que lo mande)

- Los nombres `docs/`, `scripts/`, `assets/`, `design/` como carpetas de primer nivel.
- Dónde guardan sus papeles las metodologías para agentes. Cada una eligió distinto:
  - superpowers: `docs/superpowers/specs/` y `docs/superpowers/plans/` (https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md, https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md).
  - spec-kit: `specs/NNN-feature/` y `.specify/` (https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md).
  - OpenSpec: `openspec/specs/` y `openspec/changes/`, con `archive/` (https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/README.md).
  - BMAD: `_bmad/` y `_bmad-output` (https://docs.bmad-method.org/start/install-bmad/).
- Conclusión: no hay un lugar "correcto" para specs y planes. Lo que sí se repite es que cada herramienta usa **un** lugar y lo dice.

### Sin verificar

- No encontré un estudio que mida si los archivos chicos o las ubicaciones predecibles mejoran el trabajo de los agentes. Se afirma mucho; no lo doy por probado.
- Un árbol paralelo `ai/` que duplica la documentación: no hallé fuente que lo evalúe. El argumento en contra sale del estudio de arXiv (lo redundante con la documentación existente no ayuda).

## 3. Alternativas

### A. Esqueleto de lo que no es código

`init` crea carpetas para lo que no es código; el framework decide el resto.

```
docs/
  specs/        diseños
  plans/        planes
  decisions/    decisiones de arquitectura
  references/   material del cliente que sí se versiona
design/
  approved/     (de pignolo-ui)
local/          privado, fuera de git
.pignolo/
```

- A favor: el cliente ve las carpetas desde el primer día; no toca el código.
- En contra: crea carpetas vacías (necesita `.gitkeep`, que es ruido); `docs/decisions/` duplica `.pignolo/state/decisions/`; en un repo existente choca con lo que ya hay.

### B. Plantillas completas por tipo de proyecto

Un árbol entero por tipo (web, API, librería, CLI, móvil, monorepo, datos...).

```
apps/web/  apps/api/  packages/ui/  packages/config/
docs/  design/  scripts/  tests/  local/  .pignolo/
```

- A favor: un proyecto nuevo arranca "completo".
- En contra: compite con `create-next-app`, `rails new`, `cargo new`, que ya lo hacen y se mantienen solos; son muchas plantillas para mantener; se pudren; es alcance nuevo de producto.

### C. Solo un mapa, sin crear carpetas

Una sección en `project.md` que dice dónde va cada tipo de archivo, y un chequeo que lista lo mal ubicado.

```
places:
  spec: docs/specs/
  plan: docs/plans/
  research: docs/research/
  reference: docs/references/
  private: local/
  script: scripts/
```

- A favor: sirve igual en un proyecto nuevo y en uno existente; nada que mantener por framework; un script lo puede consultar.
- En contra: el cliente no "ve" carpetas hasta que se usan; un mapa que nadie mira se desactualiza.

### D. C más lo mínimo de A (la recomendada)

El mapa de C, las carpetas se crean recién cuando se guarda el primer archivo, y `init` ofrece crear una sola carpeta desde el inicio: la privada.

```
.pignolo/project.md     places: (el mapa)
local/                  creada por init si se aprueba
  .gitignore            contiene "*": la carpeta se ignora sola
docs/specs/  docs/plans/   aparecen con el primer spec o plan
```

- A favor: sin carpetas vacías, sin `.gitkeep`, sin tocar el `.gitignore` compartido; resuelve el caso más riesgoso (material privado) desde el primer minuto.
- En contra: dos mecanismos (mapa y una carpeta); hay que cambiar la skill `plan` para que lea el mapa.

## 4. Ataque a cada alternativa

| Ataque | A (esqueleto) | B (plantillas) | C (mapa) | D (mapa + `local/`) |
|---|---|---|---|---|
| Repo existente con otro layout (`doc/`, `documentation/`, `openspec/`) | **Grave**: crea `docs/` al lado de `doc/`; dos lugares para lo mismo | **Grave**: no aplica sin mover código | Aguanta: el mapa apunta a lo que hay | Aguanta |
| Framework que reserva nombres (`app/`, `public/`, `pages/`) | Leve: `design/` y `docs/` no suelen chocar | **Grave**: la plantilla envejece con cada versión del framework | Aguanta: no nombra carpetas de código | Aguanta |
| El cliente deja archivos en la raíz | No lo ve | No lo ve | Lo lista, si alguien corre el chequeo | Lo lista y tiene adónde mandarlo |
| Monorepo | Medio: ¿un `docs/` por paquete o uno solo? | **Grave**: plantilla por combinación | Medio: un solo mapa en la raíz; no sabe de paquetes | Medio, igual que C |
| Windows: mayúsculas, rutas largas, nombres reservados | Medio: `Docs/` y `docs/` son la misma carpeta en Windows y dos en Linux | Medio | Medio: el mapa puede decir `Docs/` y el disco `docs/` | Medio, igual que C |
| Carpetas vacías en git | **Falla**: no se versionan; hace falta `.gitkeep` | **Falla**, igual | No aplica | No aplica: `local/` nunca está vacía (tiene su `.gitignore`) |
| Material privado en repo público | Medio: `local/` depende de editar el `.gitignore` compartido | Medio | **Grave**: el mapa dice `local/`, pero nada la ignora | Leve: se ignora sola. Queda un hueco: un archivo privado dejado **fuera** de `local/` |
| La estructura se pudre | Carpetas vacías para siempre | La plantilla queda vieja | El mapa queda viejo si se renombra una carpeta | Igual que C; el chequeo detecta rutas del mapa que ya no existen |
| El agente escribe en otro lado igual | No lo detecta | No lo detecta | Lo detecta después, no lo impide | Igual que C |

Fallas propias de D, sin maquillar:

- **`local/` es por clon.** Su `.gitignore` se ignora a sí mismo, así que no viaja con el repo. Otro integrante que clona no tiene la carpeta ni la protección hasta que corre `init`. En equipo conviene además la línea en el `.gitignore` compartido, y eso es decisión del humano.
- **Si `local/` ya existe y tiene archivos versionados**, el `.gitignore` nuevo no los saca de git (https://git-scm.com/docs/gitignore: lo ya versionado no se ve afectado). `init` tiene que negarse y avisar.
- **El reporte de archivos sueltos da falsos positivos.** Un `Makefile` o un `vercel.json` en la raíz son correctos. Solo se puede listar lo que git no conoce (sin versionar y sin ignorar) en la raíz, y aun así es un aviso.
- **No impide nada.** Un agente puede escribir el spec en otra carpeta. Se ve recién en el reporte.
- **El privado sigue en el disco.** Fuera de git no es fuera del alcance del agente: puede leerlo y citarlo en un archivo versionado. Lo frena solo lo que ya existe (`pii-patterns`, el hook de egreso), no esta propuesta.

## 5. Recomendación: alternativa D

Encaja con los principios: es lo más simple que funciona, no inventa alcance, no mueve ni borra, se ofrece y se arma con hechos del repo.

**Dónde vive**

- Una clave nueva en `project.md`: `places`, un mapa de tipo de archivo a carpeta. Sería una entrada más de `KEYS`, de tipo `map` (el mismo que usa `gates`).
- Un paso nuevo en `/pignolo:init`, entre "Paths" y "Sensitive data", con el mismo formato (en pocas palabras, detalle técnico, una pregunta).
- Un paso con id `private-folder` en el plan de `init`, que pasa por `preview` y `apply` como los demás. Sin él en `approved`, no corre.

**Tipos del mapa (cerrados, en inglés)**

| Tipo | Por defecto en proyecto nuevo | Nota |
|---|---|---|
| `spec` | `docs/specs/` | Lo que hoy usa la skill `plan` |
| `plan` | `docs/plans/` | Ídem |
| `research` | `docs/research/` | Investigaciones y auditorías |
| `reference` | `docs/references/` | Material del cliente que sí se versiona |
| `private` | `local/` | Fuera de git |
| `script` | `scripts/` | Solo si existe o si se pide |

No entran en el mapa: el código y los tests (los decide el framework; ya están en `test-paths` y `visible-paths`), las decisiones (ya viven en `.pignolo/state/decisions/`; no se duplica un `docs/decisions/`), y `DESIGN.md` y `design/approved/` (son de pignolo-ui).

**En un proyecto existente**

- `detect` busca carpetas que ya cumplen cada papel: `doc/`, `docs/`, `documentation/`, `specs/`, `docs/superpowers/specs/`, `openspec/`, `docs/adr/`, `docs/decisions/`, `scripts/`, `bin/`, `tools/`, `local/`, `private/`.
- Propone el mapa con lo que encontró y su fuente ("ruta que existe en el repo"), igual que hoy con `high-risk-paths`.
- Dos candidatas para el mismo tipo: las muestra y pregunta. Ninguna: propone el valor por defecto y dice que la carpeta se crea con el primer archivo.
- Nunca mueve, renombra ni borra. Si hay archivos sueltos, los lista y nada más.

**Qué se puede hacer cumplir por script y qué es solo guía**

| Pieza | Tipo | Qué hace |
|---|---|---|
| `scripts/places.js where <tipo>` | Script | Devuelve la carpeta del mapa. Lo usan las skills en vez de una ruta fija. |
| `scripts/places.js report` | Script | Lista: archivos en la raíz que git no conoce, rutas del mapa que no existen, y dos rutas que solo difieren en mayúsculas. Sale siempre 0. |
| Validación del mapa | Script | Rechaza rutas absolutas, con `..`, con `\`, con nombres reservados de Windows o que apuntan dentro de `.pignolo/` o `.git/`. |
| Paso `private-folder` | Script | Crea `local/.gitignore` con `*`. Se niega si la carpeta ya tiene archivos versionados. |
| "El material privado va en `local/`" | Guía | Nadie lo puede forzar: depende de dónde lo deje el cliente. |
| "Archivos chicos, una cosa por archivo" | Guía | Sin chequeo. |

- El reporte aparece en `/pignolo:status` como una línea ("3 archivos sueltos en la raíz: ver `places report`") y en `close-session`. No entra al contexto caliente salvo que haya algo que avisar.
- Relación con lo que existe: `local/` no hace falta en `high-risk-paths` (git no la ve). Lo que sí conviene es que el reporte marque como **alto** un archivo suelto que coincida con `.env*` o con un `pii-pattern`.

**Cómo se les dice a los agentes**

- No se agrega un árbol a `CLAUDE.md` ni al contexto caliente: la evidencia dice que los resúmenes de estructura no ayudan y cuestan.
- La skill que va a escribir un archivo pregunta a `places.js where` y pone esa ruta en la tarjeta de tarea. El agente recibe una ruta, no un mapa.
- El texto de `init` sugiere al humano, como opcional, una línea en su `CLAUDE.md`: "Dónde va cada archivo: `.pignolo/project.md`, clave `places`". `init` no edita `CLAUDE.md`.

**Cómo lo cambia el usuario**

- Edita `places` en `project.md` o vuelve a correr `init` (fusiona, no pisa).
- Quitar un tipo del mapa lo deja sin declarar: las skills usan el valor por defecto y lo dicen.

## 6. Decisiones del autor

| Id | Decisión | Recomendación |
|---|---|---|
| D-FS-1 | Alcance: ¿solo lo que no es código, o también el código? | Solo lo que no es código. El código lo ordena el framework. |
| D-FS-2 | ¿Crea carpetas o solo documenta? | Solo documenta. Las carpetas nacen con el primer archivo. Excepción: `local/`, si se aprueba. |
| D-FS-3 | Archivos mal ubicados: ¿avisa o bloquea? | Avisa. Bloquear daría falsos positivos y trabaría al usuario. |
| D-FS-4 | Idioma de los nombres de carpeta | Inglés por defecto (`docs/specs`, `local`), como los nombres del plugin. En un proyecto existente se respeta el nombre que haya, en el idioma que esté. |
| D-FS-5 | Material privado: ¿`local/` con `.gitignore` propio, o línea en el `.gitignore` compartido? | `.gitignore` propio (no toca archivos versionados, igual que `.pignolo-ui/`). En equipo, `init` muestra la línea para el `.gitignore` compartido y la agrega el humano. |
| D-FS-6 | ¿La skill `plan` pasa a leer el mapa en vez de `docs/specs` y `docs/plans` fijos? | Sí, con los valores actuales por defecto. Es un cambio de contrato: por eso es tuyo. |
| D-FS-7 | ¿`reference` (material del cliente versionado) entra en el mapa por defecto? | Sí en repo privado. En repo público, sin declarar y con aviso. `init` no sabe si el repo es público: lo pregunta. |
| D-FS-8 | ¿Se suma al hito 8c o va como hito aparte (8d)? | 8d aparte y corto. 8c ya tiene dos tareas que dependen de los hitos 6 y 7; mezclarlas lo atrasa. |
| D-FS-9 | ¿Hace falta un A/B antes? | Uno chico: misma tarea con y sin la ruta en la tarjeta, midiendo si el archivo queda en su lugar. Es el único punto donde no hay evidencia publicada. |

## 7. Tamaño (estimación, no medición)

| Tarea | Qué | Tests |
|---|---|---|
| 1 | Clave `places` en `project-md.js` y `project-config.js`, con validación de rutas | 8 |
| 2 | Detección de carpetas existentes en `init-detect.js` (candidatas, conflictos, fuente) | 7 |
| 3 | `scripts/places.js` (`where`, `report`) | 8 |
| 4 | Paso `private-folder` en `init-actions.js` e `init.js` (`preview`, `apply`, negativa si hay versionados) | 6 |
| 5 | Textos: paso nuevo en la skill `init`, `plan` usa `where`, línea en `status`; versión y CHANGELOG | 2 más el checklist manual |

- Cinco tareas, unos 30 tests, un ejecutor sonnet en serie y una revisión opus.
- No borra ni mueve nada, así que no pide auditoría previa. El paso `private-folder` escribe un `.gitignore`: conviene que la revisión final mire ese caso. Depende de 8a (ya en `main`), no de los hitos 6 ni 7.
