# Pignolo

Plugin de Claude Code con una metodología de desarrollo con agentes. Estado: v0.6 en construcción (hitos 1 a 4 de 8 en el núcleo: guardia, respaldos, agentes, compuertas, revisión, carriles, sabotaje, holdout y tests verificados).

## Qué está medido

Pignolo no le cree a un agente que dice "anda": lo verifica. Aplicamos lo mismo a pignolo: cada cifra de esta tabla sale de una corrida real, publicada con el comando, el costo y los casos que fallaron. Las malas también.

| Qué | Resultado | Evidencia |
|---|---|---|
| Guardia de git contra comandos destructivos | De 186 comandos destructivos o indirectos (bash y PowerShell) del corpus de una auditoría independiente: 173 negados, 1 pedido de confirmación, 12 que pasan, todos declarados en el registro de riesgo residual | [auditoría 3](docs/audits/2026-09-29-auditoria-3-plan-hito-1.md), [riesgo residual](tests/guard/residual-risk.md) |
| Guardia sin molestar | Sobre 5.981 comandos reales de uso diario: 0 bloqueos falsos en los comandos de todos los días (`git status/diff/log/add/commit`, `npm test`, `grep`); 0,65 % de confirmaciones de más en modo interactivo | [spec §15](docs/specs/2026-09-26-pignolo-v1-design.md) |
| Revisores de código | 60 de 60 corridas aprobadas con opus y 58 de 60 con sonnet (5 corridas por caso); los dos encontraron 30 de 30 defectos plantados y no bloquearon ningún cambio limpio (0 de 30) | [RESULTS-hito-3.md](tests/evals/RESULTS-hito-3.md) |
| Agentes de lectura e investigación | explorer 5/5 y researcher 5/5 | [RESULTS.md](tests/evals/RESULTS.md) |
| Agente que escribe tests (`test-writer`) | 20 de 20 corridas con opus y sonnet: escribe el test desde el requisito, con el esperado literal, sin leer la implementación y sin afirmar un rojo que no corrió | [RESULTS-hito-4.md](tests/evals/RESULTS-hito-4.md) |
| Agentes que corren comandos (`implementer`, `review-testability`, `refuter`, `fixer`) | 35 de 35 corridas en el sandbox de Linux (WSL2): el implementer no toca un test viejo, review-testability detecta un test que no puede fallar, el refuter descarta un hallazgo falso | [RESULTS-hito-4.md](tests/evals/RESULTS-hito-4.md) |
| Validación de planes antes de construir | En un plan real con 14 errores conocidos, el método de pignolo (dos pasos, con verificación obligada) encuentra 38–45 % con opus, contra 33 % de un revisor común, por 1 a 1,5 USD y 2 a 5 minutos, sin construir el plan dos veces | [RESULTS-planes.md](tests/evals/RESULTS-planes.md), [investigación](docs/research/2026-09-30-validar-planes-sin-implementar-dos-veces.md) |
| Revisión independiente de cada hito | Cada hito pasa por una revisión final opus antes de unirse. La del hito 4a encontró 1 problema crítico y 4 importantes; se arreglaron con un test que falla sin el arreglo, y una re-revisión lo confirmó | [CHANGELOG 0.5.0](CHANGELOG.md), [plan del hito 4](docs/plans/2026-09-30-hito-4-tests-sabotaje-holdout.md) |
| Suite propia | 2.047 tests en verde, sin dependencias npm; todo test nuevo se ve fallar antes rompiendo lo que protege | `npm test` |

Para comparar con Claude Code sin plugins o con otros plugins de metodología, con cuánto cuesta y cuánto rinde cada forma de trabajar: [`docs/benchmarks.md`](docs/benchmarks.md).

**Lo que todavía no está medido:** los casos de las evals son chicos y sintéticos, así que no dicen cómo les va con cambios grandes; los checklists manuales en una sesión real están pendientes.

Diseño: `docs/specs/2026-09-26-pignolo-v1-design.md`.

## Requisitos

- Node ≥ 22 (sin dependencias npm).
- git ≥ 2.31 (el repo sombra usa `rev-parse --path-format=absolute` y `fetch --no-write-fetch-head`).
- En Windows, PowerShell (`powershell.exe`) para leer comandos de PowerShell por su AST; sin él, esos comandos quedan como no verificables.

## Instalar

Desde la terminal:

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo@pignolo
    claude plugin install pignolo-ui@pignolo   # opcional: interfaces web

O dentro de Claude Code: `/plugin marketplace add Pign-a/Pignolo` y `/plugin install pignolo@pignolo`. Para tomar cambios nuevos: `/plugin marketplace update pignolo`.

## Tests

    npm test

## Agentes y setup

El plugin trae 19 agentes con herramientas, esfuerzo y modelo fijados por rol (`plugins/pignolo/lib/roles.js`). Los despachan las skills con una tarjeta de tarea; no se usan directo.

**Configurar.** Dentro de Claude Code, una vez por máquina: `/pignolo:setup`. Solo lo dispara el humano. Verifica el entorno (node, git ≥ 2.31, `gh`, PowerShell, superpowers, agent teams, y si `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` o `availableModels` anulan el perfil), pide el perfil de modelos (`max`, `balanced` o `economy`; se guarda en `~/.pignolo/config.json`), propone la plantilla de permisos con el detalle de lo que suma y, solo con tu sí, la aplica. Nunca quita ni reordena reglas tuyas y respalda el archivo (`.pignolo-bak-<fecha>`) antes de escribir. Los revisores corren en opus en todos los perfiles, `economy` incluido.

**Activar pignolo en un proyecto.** Hasta que exista `/pignolo:init` (hito 8), se activa a mano: crear `.pignolo/project.md` en la raíz del repo (puede tener solo una línea de notas). Con ese archivo, el hook de `Agent` respalda el trabajo antes de cada despacho. Mientras corre un flujo de pignolo (`.pignolo/run.json` vigente, que escriben las skills de los flujos desde el hito 3) y no escribiste `/pignolo:off`, además niega cualquier subagente que no sea `pignolo:*` (también `fork` y el despacho sin tipo). En los pedidos sueltos, Claude usa sus agentes normales. Para desactivar: borrar el archivo, o `/pignolo:off` (apaga la restricción, no los respaldos).

## Compuertas y revisión (hito 3a)

Scripts que usan las skills de los carriles (ver "Carriles" más abajo). Todo actúa solo durante un flujo de pignolo (`.pignolo/run.json` vigente); en un pedido suelto no cambia nada.

- `scripts/risk.js`: mira qué archivos o qué diff se van a tocar y da un piso de riesgo y de carril (`trivial`, `daily`, `plan`), con la categoría de decisión reservada cuando salta un tripwire. El modelo puede subir el piso, nunca bajarlo.
- `scripts/gate.js`: corre las compuertas de `project.md` (`on-done`, `pre-merge`) fuera de los hooks y deja un sello del árbol de trabajo en `~/.pignolo/seals/`. Si el árbol cambia después, el sello ya no vale.
- `scripts/run.js`: abre y cierra el flujo (`start`, `renew`, `end`), registra la tarea del escritor (`task`) y muestra el estado (`status`).
- Un hook nuevo, el handback-gate, frena el `DONE` de `implementer`, `fixer` y `test-writer` si no hay sello o si tocaron tests que no eran suyos; tras 8 rechazos deja pasar y marca la tarea como `BLOCKED`.
- `scripts/ledger.js` lleva el ledger de hallazgos de la revisión y el Judgment Day.
- Checklist manual: `tests/manual/hito-3a.md`.

## Carriles (hito 3b)

**En pocas palabras.** Le pedís un cambio a Claude en un proyecto con pignolo activo y pignolo elige cuánto cuidado poner. Si el cambio es una línea o algo mecánico, lo hace directo y lo verifica. Si es más, lo hace en una copia de trabajo aparte, primero con una prueba que falla, y te pide el OK antes de unirlo. Según el riesgo, además lo hace revisar. Si tu pedido es una pregunta o no queda claro que autorizás un cambio, solo lee y te pregunta.

**Detalle técnico.**

- Requisito: `.pignolo/project.md` **commiteado**, con `type` y `gates.on-done`. Sin eso un flujo no arranca.
- `pignolo:entry` se dispara sola por su descripción (no hay hook que la fuerce) y decide dos cosas: si el pedido autoriza un cambio y el carril, a partir de `scripts/risk.js`. El modelo puede subir el carril, nunca bajarlo. Las cinco skills de flujo (`entry`, `trivial`, `daily`, `review`, `judgment`) son invocables por el modelo (decisión del autor, spec §2); `setup`, `on`, `off`, `status` e `init` solo las dispara el humano.
- `trivial`: cambia en el checkout principal y en la rama actual, corre la compuerta `on-done`, re-chequea el riesgo del diff real y commitea. Sin revisión. Si el riesgo sube, deshace su cambio, no commitea y te pregunta si pasarlo a `daily`. Si tenés cambios sin commitear en el checkout principal, no lo usa (los mezclaría con los suyos): pasa a `daily` o te pregunta.
- `daily`: rama y worktree en `.pignolo/worktrees/<slug>`; `test-writer` escribe la prueba y el orquestador demuestra el rojo; `implementer` cambia y sella la compuerta; revisión según riesgo; merge a la rama de origen solo con tu confirmación. Cada escritor cuenta como terminado únicamente si `run.js status` lo acepta (sello y tests intactos), no por lo que diga su informe.
- `review`: lentes por riesgo (medio: dos; alto: según el perfil), `refuter` antes de la reproducción, reproducción con test en rojo, `fixer` en un máximo de 2 rondas. `judgment` (Judgment Day, perfil `max` en riesgo alto o a pedido): dos jueces ciegos sobre el mismo SHA. El ledger queda en `~/.pignolo/reviews/<repo-id>/`, también vacío. Una revisión o un Judgment Day que pedís vos es solo de lectura (sin `test-writer` ni `fixer`, no commitea) salvo que digas explícitamente que querés cambios.
- Límite declarado: la compuerta `live-check` (spec §9) todavía no existe (llega en un hito posterior). Si `project.md` la declara, `daily` mergea sin correrla y lo avisa en la pregunta del merge.
- `.pignolo/worktrees/` y `.pignolo/tmp/` son de pignolo: `run.js start` los agrega a `.pignolo/.gitignore` (que se ignora a sí mismo) y git no los ve. Si `.pignolo/.gitignore` ya está versionado sin esas líneas, queda modificado y puede subir un `trivial` a `daily`. Un runner que recorre el árbol (vitest, jest) puede levantar los tests de `.pignolo/worktrees/`.
- Checklist manual: `tests/manual/hito-3b.md`.

## Métricas de las evals

**En pocas palabras.** Pignolo mide si sus revisores encuentran un defecto plantado, si dejan pasar un cambio limpio sin inventar problemas y si el resto de los agentes de revisión hace su parte. Los resultados se publican tal como salgan, buenos o malos. **Medición del 2026-09-30 (Windows):** cada caso corrió 5 veces con los revisores en opus y otras 5 con los revisores en sonnet. En opus aprobaron las 60 corridas. En sonnet aprobaron 58: en dos, el revisor llegó a la conclusión correcta pero no entregó su respuesta en el formato que pignolo necesita para leerla. Los dos modelos encontraron todos los defectos plantados y ninguno bloqueó un cambio limpio. Sonnet costó alrededor de un 35 % menos. Dos agentes (refuter y fixer) necesitan WSL2 y todavía no se midieron. Son casos chicos y sintéticos: no dicen cómo les va con cambios grandes.

**Detalle técnico.** Umbral de la spec (§0 d): al menos 4 aciertos de 5 corridas por caso. Claude Code 2.1.285, Windows nativo, agentes 0.4.2, sesión principal en sonnet.

| Agente | Caso | Opus: aciertos / corridas | Opus: USD por corrida | Sonnet: aciertos / corridas | Sonnet: USD por corrida | Umbral 4/5 |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | defecto | 5/5 | 0,080 | 5/5 | 0,057 | pasa en los dos |
| review-reliability | limpio | 5/5 | 0,089 | 5/5 | 0,060 | pasa en los dos |
| review-resilience | defecto | 5/5 | 0,105 | 5/5 | 0,061 | pasa en los dos |
| review-resilience | limpio | 5/5 | 0,116 | 5/5 | 0,068 | pasa en los dos |
| review-risk | defecto | 5/5 | 0,087 | 5/5 | 0,056 | pasa en los dos |
| review-risk | limpio | 5/5 | 0,091 | **3/5** (sin el bloque `json`) | 0,064 | **sonnet no pasa** |
| review-readability | defecto | 5/5 | 0,086 | 5/5 | 0,057 | pasa en los dos |
| review-readability | limpio | 5/5 | 0,087 | 5/5 | 0,056 | pasa en los dos |
| judge-a | defecto | 5/5 | 0,078 | 5/5 | 0,052 | pasa en los dos |
| judge-a | limpio | 5/5 | 0,090 | 5/5 | 0,059 | pasa en los dos |
| judge-b | defecto | 5/5 | 0,077 | 5/5 | 0,052 | pasa en los dos |
| judge-b | limpio | 5/5 | 0,082 | 5/5 | 0,057 | pasa en los dos |
| refuter | falso hallazgo | no medido (WSL2 sin preparar) | — | — | — | — |
| fixer | hallazgo confirmado | no medido (WSL2 sin preparar) | — | — | — | — |

Antes de la medición, la primera calibración dio 9/12 y llevó a ajustar los agentes (0.4.2); la recalibración dio 12/12. Gasto total de las evals del hito 3: 11,49 USD de un tope de 54. Comandos, frenos, calibraciones y lo que dijo el agente en cada corrida fallada, en [`tests/evals/RESULTS-hito-3.md`](tests/evals/RESULTS-hito-3.md).

## Métricas de las evals del modo plan

**En pocas palabras.** Los tres agentes del modo `plan` que faltaban medir son el `spec-reviewer` (¿detecta lo que se agregó sin pedirlo y arma bien la tarjeta?), el `plan-auditor` (¿encuentra los defectos de un plan y hace un experimento por afirmación?) y el `validator` (¿frena una tanda con un archivo de más o con un informe falso?). **Medición parcial del 2026-10-01:** solo se corrió la etapa de `spec-reviewer` (Windows, 1 corrida por caso, 0,28 USD). El caso con alcance agregado pasó; el caso limpio no: el agente señaló huecos del spec (muy corto) y pidió cambios en vez de aprobar, algo que el calificador no admite. Se frenó para que el autor decida si se ajusta el calificador o el caso. `plan-auditor` y `validator` (WSL2) todavía no se corrieron.

**Detalle técnico.** Casos en `tests/evals/plan-cases.js`, calificadores probados en `tests/eval-plan-cases.test.js`. Todo en opus, Claude Code 2.1.285.

| Agente | Caso | Aciertos / corridas | USD por corrida | Estado |
| --- | --- | --- | --- | --- |
| spec-reviewer | alcance agregado | 1/1 (calibración) | 0,086 | pasa; falta la corrida completa |
| spec-reviewer | limpio | 0/1 (calibración) | 0,085 | **freno:** falló `verdict-approve` |
| plan-auditor | 3 casos | no medido | — | pendiente (WSL2) |
| validator | 2 casos | no medido | — | pendiente (WSL2) |

Comandos, frenos y el motivo de la falla en [`tests/evals/RESULTS-hito-5.md`](tests/evals/RESULTS-hito-5.md).

## Validación de planes

**En pocas palabras.** Medimos cuánto encuentra y cuánto cuesta cada forma de revisar un plan antes de construirlo (2026-09-30, 28,50 USD). En un plan real con 14 errores conocidos, un revisor que solo lee encuentra un tercio con opus y una quinta parte con sonnet. Lo que más ayudó fue separar el trabajo en dos pasos: el revisor anota qué cosas solo se pueden comprobar ejecutándolas, y después otro paso las comprueba de verdad, con pruebas fijas o con experimentos que un hook obliga a hacer. Así opus llegó a 38–45 %, por 1 a 1,5 USD y 2 a 5 minutos por plan, sin construir el plan dos veces. Sonnet, más barato, se queda corto para esto. Esa receta ya la implementa el agente real: el `plan-auditor` (modos `review` y `verify`, con hooks que lo fuerzan a un experimento por afirmación) y la skill `plan`; la medición de la combinación completa sobre un plan nuevo está pendiente.

**Detalle técnico.** Caso real (plan 4a v1), recall contado a mano: revisor opus 33 % (1,10 USD, 2,4 min); dos pasos + experimentos forzados por un hook `Stop`, opus 38 % (1,45 USD, 4,6 min) y sonnet 29 % (0,62 USD); dos pasos + sondas fijas, opus 45 % (0,92 USD, 2,4 min; parte viene de sondas armadas con errores ya conocidos) y sonnet 24 % (0,31 USD). El calificador automático inflaba el recall y se reemplazó por conteo a mano. Tablas, método y límites en [`tests/evals/RESULTS-planes.md`](tests/evals/RESULTS-planes.md).

## Guardia de shell

Capa contra errores honestos, no frontera de seguridad (spec §1.9). Analiza cada comando de Bash (tokenizador propio) y de PowerShell (AST nativo, ~0,3 s por comando) sobre su argv literal:

- **Conjunto catastrófico**, siempre activo (también con `PIGNOLO_DISABLED=1` y `/pignolo:off`): borrar o mover `.git`, `.claude`, `~/.pignolo`, `~` o la raíz del repo, o un comodín o variable en esos lugares (no se expanden globs: `rm *.log` en la raíz también se niega; en PowerShell, un borrado que recibe las rutas por el pipeline cuenta como comodín); escribir con Edit/Write en `.git/**`, `.claude/**` (salvo `.claude/worktrees/`), `.gitconfig`, `~/.pignolo/**`, `~/.claude/settings*.json` o `~/.claude/plugins/**`, y desde la shell en los mismos lugares salvo el `.claude/**` del proyecto. El resto de `~/.claude` (memoria, planes, `CLAUDE_JOB_DIR`, skills) no se protege.
- **Directorio actual**: un `cd` mueve el directorio de lo que sigue por `&&`; después de `;`, `||`, `&`, un salto de línea, un subshell o un pipeline, el directorio queda desconocido y un comodín o una variable en un borrado se niega (`cd dist; rm -rf *` sin `dist` borraría la raíz).
- **Git**: deny a lo que pierde trabajo sin commitear o no se recupera localmente; confirmación para lo recuperable por reflog (push, borrado de ramas, `update-ref`, `checkout -B`).
- **No verificable** (parseo fallido, programa o código que sale de una variable, `eval`, `source <(…)`, pipes a un intérprete, `node -e`/`python -c` que lanzan procesos, subcomandos de git que corren shell, alias de git, una sustitución `` `…` `` o `$(…)` dentro de un argumento entre comillas dobles de `-c`/`-e`/`-m`/`--message`, salvo `$(cat <<'EOF' … EOF)`): deny en `auto`, `bypassPermissions` y `dontAsk`; confirmación en los demás modos.
- Diagnóstico: `node plugins/pignolo/lib/git-guard.js --explain "<comando>" [--shell powershell] [--mode <modo>]`.
- Riesgo residual declarado: `tests/guard/residual-risk.md`.

## Hito 1: qué protege y qué no

- Protege (best-effort): el conjunto catastrófico y los comandos git destructivos directos e indirectos conocidos (ver "Guardia de shell": Bash con tokenizador propio, PowerShell con su AST nativo; lo que no se puede verificar se niega o pide confirmación según el modo). Antes de cada comando de shell que la guardia deja pasar o manda a confirmar toma una instantánea del trabajo sin commitear y al arrancar respalda las refs (`refs/pignolo/backup/*`).
- Las instantáneas van al **repo sombra** `~/.pignolo/shadow/<repo-id>.git`, fuera del repo: sobreviven a borrar `.git`. SessionStart lo siembra en segundo plano (copia HEAD, ramas y tags a `refs/pignolo/refs/<fecha>/` y toma la primera instantánea). Mientras no está sembrado, la instantánea queda dentro del repo (`refs/pignolo/wip/*`), y esa copia **no** sobrevive a borrar `.git`; la siembra siguiente la copia a la sombra.
- La instantánea captura los archivos modificados, borrados y nuevos **no ignorados**; lo que está en `.gitignore` o `.git/info/exclude` no se guarda. Los submódulos y repos anidados quedan como referencia, sin contenido. Si el árbol no cambió desde la última instantánea, no se crea otra ref. Una instantánea que falla se muestra y queda en `~/.pignolo/logs/backup-failures.log`.
- Retención: se borra lo que tiene más de 14 días (instantáneas de la sombra, `refs/pignolo/wip/*`, juegos de refs de la sombra y respaldos de refs del repo `refs/pignolo/backup/*`), salvo la última de cada una de las 3 sesiones previas. Del repo solo se borra lo que la sombra ya tiene: nunca la única copia. Aviso al arrancar si la sombra de un repo pasa 1 GB.
- Declarado: en Windows nativo no hay sandbox; un hook que no arranca o vence su timeout NO bloquea. La capa autoritativa es la plantilla de permisos (`templates/permissions.json`), que `/pignolo:setup` propone (ver "Agentes y setup").
- Declarado: la protección del interruptor contra el modelo es best-effort. `/pignolo:off` y `/pignolo:on` solo cambian el estado si el evento es `UserPromptExpansion` y el texto tipeado empieza con `/pignolo:`; la guardia bloquea invocar el launcher de pignolo por shell con la ruta escrita literal (salvo la forma exacta de `/pignolo:status`; una ruta armada con una variable, una sustitución o un comodín no se reconoce) y escribir los flags con `touch`, `rm`, `New-Item`, `Set-Content`, redirecciones o código inline. Una escritura armada de otra forma (p. ej. un script propio) no se detecta.
- Borrados que no pasan por git (`rm`, `Remove-Item`, `Write`) solo quedan cubiertos por las instantáneas previas.
- Scripts fuera de los hooks: `node plugins/pignolo/scripts/wip-snapshot.js [--cwd <dir>] [--reason <texto>] [--session <id>]`, `node plugins/pignolo/scripts/backup-ref.js [--cwd <dir>]` y `node plugins/pignolo/scripts/shadow-seed.js [--cwd <dir>] [--session <id>]`.

## Recuperar desde el repo sombra

La sombra de cada repo es `~/.pignolo/shadow/<repo-id>.git`; su archivo `pignolo/origin` dice de qué carpeta es. Las instantáneas están en `refs/pignolo/wip/<sesión>/<fecha>` y las refs copiadas en `refs/pignolo/refs/<fecha>/`.

    S=~/.pignolo/shadow/<repo-id>.git
    git --git-dir "$S" for-each-ref --sort=-creatordate refs/pignolo/wip/     # instantáneas, la más nueva arriba
    git --git-dir "$S" for-each-ref --sort=-refname refs/pignolo/refs/        # juegos de refs, el más nuevo arriba
    git --git-dir "$S" show <ref>:<archivo>                                   # ver un archivo

**Atención:** el `checkout … -- .` de la receta sobrescribe los archivos que hay ahora en la carpeta con los de la instantánea. Si en la carpeta hay trabajo más nuevo que la instantánea, guardalo antes: copiá la carpeta a otro lado, o commitealo justo después del `git init` (`git add -A` y `git commit -m "estado actual"`: queda en la rama `pignolo-rescate`). Sin `.git` no hay stash; con un repo sano, commiteá o usá `git stash push -m "<etiqueta>"` antes de tocar nada.

Si se borró `.git`, se rearma el repo desde la sombra, parado en la carpeta del repo (`<rama>` es la rama en la que estabas):

    git init -b pignolo-rescate
    git fetch "$S" 'refs/pignolo/refs/<fecha>/heads/*:refs/heads/*' '<ref-de-instantánea>:refs/heads/pignolo-rescate-wip'
    git symbolic-ref HEAD refs/heads/<rama>
    git -c core.autocrlf=false checkout pignolo-rescate-wip -- .
    git reset -q

Queda `HEAD` en `<rama>`, las ramas como estaban en esa fecha y el trabajo sin commitear de la instantánea en el árbol, sin commitear, byte a byte (`core.autocrlf=false`: la sombra guarda los bytes exactos). `git init -b` evita que el fetch choque con la rama inicial (`init.defaultBranch=main`). La configuración del repo (remotos, hooks) no se guarda en la sombra: hay que volver a ponerla. `pignolo-rescate-wip` se puede borrar al terminar.
