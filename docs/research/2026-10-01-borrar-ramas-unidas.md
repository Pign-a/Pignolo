# D-7-7: cómo borrar ramas `task/<plan>/<id>` unidas a `int/<plan>` (y sus worktrees)

Fecha: 2026-10-01. git 2.52.0.windows.1, Windows 11, NTFS (insensible a mayúsculas). Experimentos en `<scratch>\exp-d77\` (scripts `setup.sh`, `base.sh`, `att1.sh` a `att8.sh`, `guard.js`; cada repo `r-*` quedó para inspección). No se tocó `D:\pignolo` (solo lectura, y `require` de `lib/git-guard.js` para clasificar comandos).

**Recomendación corta:** mantener `git branch -d` literal (alternativa A, lo que ya dice el plan: `not-in-head` informada) y sumar a la Task 9 una regla nueva: **no proponer ninguna rama cuyo nombre choque con otro al pasar a minúsculas** (ataque T5b: en Windows, con refs empaquetadas, `branch -d` borra commits sin unir de otra rama). Si el autor quiere borrar antes de que `int/<p>` llegue a HEAD, la única variante segura es **B+** (transacción `verify int/<p>` + `delete task/...` con valores esperados y cuatro chequeos previos); la alternativa tal como está escrita hoy en D-7-7 (B simple) **pierde trabajo o rompe el repo en 4 de 9 ataques**.

---

## 1. Investigación

| Fuente (consultada 2026-10-01) | Qué dice |
|---|---|
| Claude Code, "Run parallel sessions with worktrees", <https://code.claude.com/docs/en/worktrees> | Worktrees en `.claude/worktrees/<name>/`, rama `worktree-<name>`. Al salir de una sesión: si la worktree está limpia (sin cambios, sin archivos sin seguimiento, sin commits nuevos) y la sesión no tiene nombre, "Claude removes the worktree and its branch automatically"; si tiene trabajo, pregunta keep/remove, y "Removing deletes the worktree directory and its branch, along with all the work in them". Subagentes con `isolation: worktree`: "temporary worktree that Claude Code removes automatically when the subagent finishes without changes"; con cambios queda hasta el barrido periódico (`cleanupPeriodDays`), que **no** borra si hay "changed or untracked files, or unpushed commits", ni worktrees sin la marca de Claude Code (las de un hook `WorktreeCreate` o `git worktree add` manual). Mientras corre un agente mantiene `git worktree lock`. Con hook `WorktreeCreate`, la limpieza es del hook `WorktreeRemove`. No documenta el comando git exacto para la rama. |
| superpowers 6.4.1, `finishing-a-development-branch/SKILL.md` (<https://github.com/obra/superpowers>, copia local en `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/`) | Opción "merge local": `git checkout <base>` → `git merge <feature>` → tests → `git worktree remove "$WORKTREE_PATH"` → `git worktree prune` → `git branch -d <feature>`. Es decir: **une en la rama sacada (HEAD) y recién entonces `-d`**, que por eso siempre funciona. `-D` solo tras escribir literalmente "discard". Nunca `--force` en `worktree remove` por iniciativa propia; solo limpia worktrees que creó (`.worktrees/`, `worktrees/`). `using-git-worktrees`: preferir la herramienta nativa (`EnterWorktree`), que "owns placement, branching, and cleanup". |
| git-branch, <https://git-scm.com/docs/git-branch> | `-d`: "The branch must be fully merged in its upstream branch, or in HEAD if no upstream was set with --track or --set-upstream-to." `-D` = `--delete --force`: "irrespective of its merged status". |
| git-update-ref, <https://git-scm.com/docs/git-update-ref> | "With -d, it deletes the named <ref> after verifying that it still contains <old-oid>." Con `--stdin`, "If all <ref>s can be locked with matching <old-oid>s simultaneously, all modifications are performed. Otherwise, no modifications are performed" (y el comando `verify`). `--no-deref`: actúa sobre la ref misma, no sobre a quién apunta. |
| git-worktree, <https://git-scm.com/docs/git-worktree> | `remove`: "Only clean worktrees (no untracked files and no modification in tracked files) can be removed"; bloqueada → `-f -f`. `prune`: limpia registros de worktrees cuyo directorio ya no existe. No dice nada de la rama. |
| githooks, `reference-transaction`, <https://git-scm.com/docs/githooks> | Usado para medir qué valor viejo pasa cada comando a la transacción (T1a). |

**Convención de facto (Claude Code + superpowers + git):** borrar solo lo unido a la rama sacada, con `-d`; nunca `-D` ni `remove --force` sin un humano; la worktree se quita antes que la rama. Nadie en ese ecosistema borra ramas unidas a una rama que no es HEAD; el caso de pignolo (`int/<p>` no sacada) no tiene convención externa.

## 2. Alternativas

| | Mecanismo | Seguridad | Carreras | Windows | Guardia | Recuperación | Simpleza |
|---|---|---|---|---|---|---|---|
| **A** `branch -d` literal (plan actual) | git compara con HEAD (o upstream) | Git protege solo: rama sacada en otra worktree, HEAD, nombres raros | El chequeo de pignolo y el de git son independientes; dentro de git el borrado **no** lleva valor esperado (T1a), ventana de microsegundos | Pierde trabajo con choque de mayúsculas + ref empaquetada (T5b) | `ask` (`branch-delete`) si lo tipea un agente; dentro de `cleanup.js` la guardia no ve el git | Reflog de la rama se borra con ella; queda `refs/pignolo/backup/*` | Máxima. Pero no borra las unidas solo a `int/` (`not-in-head`) |
| **B** `merge-base --is-ancestor S int/p` + `update-ref --no-deref -d refs/heads/<b> S` (texto actual de D-7-7) | pignolo chequea; git solo compara S | Git **no** protege rama sacada ni HEAD; nombre mal armado borra `.git/HEAD` | CAS sobre la rama (T1b ok); **no** sobre `int/p` (T2b pierde) | Seguro si S sale de `for-each-ref`; pierde si sale de `rev-parse` | `ask` (`ref-move`) si lo tipea un agente | Igual que A | Media; mucho que validar a mano |
| **B+** transacción `update-ref --no-deref --stdin`: `verify refs/heads/int/p T` + `delete refs/heads/<b> S`, con S y T de `for-each-ref`, nombre validado (`^refs/heads/task/<p>/…$` + `check-ref-format`), rama no sacada en ninguna worktree (`worktree list --porcelain`), sin choque de mayúsculas, `backupRefs` antes | atómica sobre rama **y** destino | Cubre lo que B no | Ambas refs con valor esperado y bloqueadas juntas | Seguro | La guardia **deniega** `update-ref --stdin` tipeado (`update-ref-stdin`); dentro del script no lo ve, pero contradice el espíritu de esa regla | Igual que A | Baja: cuatro chequeos propios más la transacción |
| **C** `branch -d` desde una worktree temporal con HEAD desacoplado en `int/p` (o desde la worktree de la cola) | git compara con el HEAD de esa worktree | Git protege como en A | El HEAD desacoplado es una foto: si `int/p` retrocede, compara contra la foto (T2b pierde). Usar la worktree de la cola compara con `queue/p`, que puede tener merges no aceptados (como T9b) | Pierde con mayúsculas (T5b) | `ask` | Igual que A | Baja; y una worktree `--no-checkout` solo se quita con `--force` (prohibido por D-7-5) o hay que hacer checkout completo (costo) |
| **D** upstream `task/...` → `int/p` (al crearla) + `branch -d` | git compara con el upstream | Git protege como en A | Chequeo y borrado en el mismo proceso | Pierde con mayúsculas (T5b) | `git branch -u` / `--set-upstream-to` es `allow`: un agente puede cambiar el upstream (T9b) | Igual que A; la config `branch.<b>.*` se borra sola | Media; agrega config por rama y depende de que nadie la toque |
| **E** `branch -D` tras chequeo propio | ninguno en git | — | Pierde si la rama avanza (T1b) | — | `ask` | — | Excluida por D-7-5 (nunca `-D`); se atacó solo como línea de base |

Común a todas, la worktree: `git worktree remove` sin `--force` (la guardia lo deja, y deniega `--force`). Rechaza modificados, sin seguimiento y bloqueadas (T7, T12), pero **borra los ignorados** sin aviso (T7b; ya medido en el plan, A7-14), así que el chequeo `status --porcelain --ignored` previo sigue siendo obligatorio. `git worktree prune` (permitido por la guardia) solo hace falta para registros huérfanos (`prunable`), nunca como sustituto de `remove`.

## 3. Ataques (comandos en los scripts; salida observada resumida)

Base (`base.sh`): repo con `main`, `int/p` = merge `--no-ff` de `task/p/01-a`, HEAD en `main`. A: `branch -d` → `error: the branch 'task/p/01-a' is not fully merged` (exit 1). B: borra (exit 0). C: borra. D: `warning: deleting branch ... merged to 'refs/heads/int/p', but not yet merged to HEAD` y borra.

| Ataque | Cómo (resumen) | A | B | B+ | C | D | E |
|---|---|---|---|---|---|---|---|
| T1a CAS interno | hook `reference-transaction`, línea `prepared` | old=000… (sin valor esperado) | old=S | old=S, T | old=000… | old=000… | — |
| T1b la rama avanza tras el chequeo | commit nuevo en la rama, después borrar | rechaza `not fully merged` | `cannot lock ref ... is at X but expected S` | rechaza (prepare) | rechaza | rechaza | **borra; commit nuevo inalcanzable** |
| T2 `int/p` no sacado (HEAD=main) | base | no borra (`not-in-head`, funcional) | borra | borra | borra | borra | — |
| T2b `int/p` retrocede entre chequeo y borrado | `update-ref refs/heads/int/p main` en medio | rechaza | **borra; S inalcanzable** (solo el respaldo) | `cannot lock ref 'refs/heads/int/p': is at … but expected …`, nada se toca | **borra; S inalcanzable** (HEAD desacoplado viejo) | rechaza | — |
| T3 rama sacada en otra worktree (con cambios) | no se quita `wt/01-a` | `cannot delete branch ... used by worktree` | **borra; la worktree queda en "No commits yet on task/p/01-a", todo como `A`** (commits siguen en `int/p`, los cambios sin commitear quedan en disco) | sin chequeo, igual que B; con `worktree list --porcelain` se detecta y no se borra (carrera residual) | rechaza | rechaza | — |
| T4 HEAD desacoplado en `main` | `checkout --detach main` | rechaza | borra (correcto) | borra | borra | borra | — |
| T4b HEAD del checkout principal en la propia rama | `checkout task/p/01-a` | `used by worktree` | **borra la rama actual: HEAD sin commit, todo en `A`** | detectado por el chequeo de worktrees | rechaza | rechaza | — |
| T5b mayúsculas: `01-a` empaquetada sin unir (X), `01-A` suelta unida (Y); se borra `01-a` | `pack-refs --all` + `branch task/p/01-A int/p`; `rev-parse 01-a` devuelve Y (sombra) | **borra las dos; X inalcanzable** | con S de `rev-parse`: **pierde X**; con S de `for-each-ref`: el chequeo dice no unida, no borra (T5c: el CAS rechaza `is at Y but expected X`) | seguro (S de `for-each-ref` + chequeo de colisión) | **pierde X** | **pierde X** | — |
| T5d igual que T5b con respaldo previo | `backupRefs` vía `for-each-ref` antes | X recuperable desde `refs/pignolo/backup/T/task/p/01-a` | | | | | |
| T5e igual con `--ref-format=reftable` | | rechaza (`not fully merged`): el problema es del backend `files` | | | | | |
| T5f ambas sueltas | `branch task/p/01-A` | `fatal: a branch named 'task/p/01-A' already exists`: el choque solo aparece cuando una está empaquetada (lo que `gc --auto` hace solo) | | | | | |
| T6 ref empaquetada | `pack-refs --all` | rechaza (HEAD=main); con HEAD en `int/p` borra y limpia `packed-refs` | borra, 0 entradas | borra | borra | borra | — |
| T7 worktree sucia / sin seguimiento | `worktree remove` | `contains modified or untracked files` (exit 128): igual para todas | | | | | |
| T7b solo un ignorado (`.env`, `.gitignore` versionado) | `status --porcelain` vacío | `worktree remove` exit 0 y **`.env` borrado**: igual para todas | | | | | |
| T8 nombre mal armado | `update-ref --no-deref -d HEAD <sha>` | `branch -d HEAD` → `not found` | **borra `.git/HEAD`: `fatal: not a git repository`**; sin `--no-deref` borra `main`; `int/p` sin `refs/heads/` → `bad name` | validación de nombre lo impide | como A | como A | — |
| T9a upstream = la propia rama | `--set-upstream-to` se niega (`not setting ... as its own upstream`); escrito en config a mano | — | — | — | — | **borra; trabajo sin unir inalcanzable** | — |
| T9b upstream = `queue/p` con un merge rojo | `branch -u queue/p` (la guardia: `allow`), `-d`, luego la cola se resetea | — | — | — | (C con la worktree de la cola: mismo riesgo, razonado, no medido) | **borra; trabajo inalcanzable** | — |
| T10 recuperación tras borrar | `reflog show refs/heads/task/p/01-a` | reflog de la rama **borrado con la rama** (backend `files`), en todas; lo único que queda es `int/p` y `refs/pignolo/backup/*` | | | | | |
| T12 worktree bloqueada | `worktree lock` | `cannot remove a locked working tree`: igual para todas | | | | | |

**Recuento (ataques de seguridad sobre la rama: T1b, T2b, T3, T4b, T5b, T6, T8, T9a, T9b):**

- **A:** 1 pérdida (T5b), mitigable. Más una ventana interna sin CAS (T1a), cubierta por el respaldo.
- **B (texto actual de D-7-7):** 4 fallas (T2b pérdida de alcance, T3 worktree rota, T4b rama actual borrada, T8 repo roto) y T5b si usa `rev-parse`.
- **B+:** 0 pérdidas; queda la carrera de T3 (una worktree creada sobre esa rama entre el chequeo y la transacción: la deja huérfana, sin perder commits).
- **C:** 2 pérdidas (T2b, T5b), más `--force` o un checkout completo para la worktree temporal.
- **D:** 3 pérdidas (T5b, T9a, T9b).
- **E:** 1 pérdida en el ataque base de carreras (T1b); excluida por D-7-5.

## 4. Guardia de pignolo (`plugins/pignolo/lib/git-guard.js`, `evaluate`)

- `git branch -d/-D/--delete --force` → `ask`, regla `branch-delete`. `git update-ref -d refs/heads/...` → `ask`, `ref-move`. `git update-ref --stdin` → deny (`update-ref-stdin`). `update-ref -d refs/pignolo/...` → deny (`pignolo-ref`). `git worktree remove` → allow; con `--force` → block. `git worktree prune` → allow. `git branch -u/--set-upstream-to` → allow. `node …/cleanup.js apply --proposal …` → allow.
- La guardia solo ve lo que tipea un agente; el git que lanza `cleanup.js` no pasa por ella. Por eso la seguridad del borrado está en el script y en el "un solo sí", no en la guardia.
- Hallazgos de paso (para el autor, fuera de D-7-7): (1) el texto de `branch-delete` y `ref-move` dice "recuperable por reflog", pero T10 muestra que el reflog de la rama se borra con ella; lo recuperable es el reflog de `HEAD` de alguna worktree o el respaldo. (2) `git update-ref --no-deref -d HEAD <sha>` es solo `ask` y deja el repo sin `HEAD` (T8): candidato a deny.

## 5. Recomendación

**A: mantener `git branch -d` literal** (lo que ya dice D-7-5 y la Task 9: lo unido solo a `int/<p>` se informa como `not-in-head` y se limpia cuando `int/<p>` llega a la rama de HEAD), **más una regla nueva en `findCandidates`**: si dos refs de `refs/heads/` coinciden al pasarlas a minúsculas, ninguna de las dos se propone y salen en `informed` como `case-collision` (test literal: T5b; rojo demostrado: sin la regla, `branch -d task/p/01-a` borra un commit sin unir).

Por qué:

1. Es la convención de Claude Code, superpowers y git: borrar con `-d` lo unido a la rama sacada, nunca forzar. Git ya protege la rama sacada en cualquier worktree, HEAD y los nombres raros (T3, T4b, T8); con `update-ref` esas protecciones hay que reescribirlas a mano, y B muestra qué pasa si falta una.
2. Es la de menos superficie: 1 falla de 9, y esa falla (T5b) afecta también a B, C y D; la regla de colisión la cierra para todas.
3. Borrar antes no protege nada: las `task/*` ya unidas no ocupan lugar ni bloquean nada, y `int/<p>` llega a la rama de HEAD al cerrar el plan. Lo que cuesta esperar es solo una lista más larga en `cleanup report` (`not-in-head`).
4. Simpleza (preferencia del autor): A no agrega chequeos propios; B+ agrega cinco (validación de nombre, `worktree list`, colisión, valor de `int/<p>`, transacción) y una excepción a la regla `update-ref-stdin` de la guardia.

Si el autor igual quiere limpiar durante el plan: **no** adoptar el texto actual de D-7-7 (B simple). Adoptar B+ (transacción `start / verify refs/heads/int/<p> <T> / delete refs/heads/task/<p>/<id> <S> / prepare / commit` vía `git update-ref --no-deref --stdin`, con S y T leídos con `for-each-ref`, nombre validado contra `^refs/heads/task/<p>/[^/]+$` y `git check-ref-format`, rama ausente de `git worktree list --porcelain`, sin colisión de mayúsculas y `backupRefs` antes). Medido: B+ sobrevive T1b, T2b, T4b, T5 y T8, y en T3 solo queda una carrera sin pérdida de commits.
