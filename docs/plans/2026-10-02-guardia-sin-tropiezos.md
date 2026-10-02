# Plan: guardia sin tropiezos (núcleo 0.16.0)

Fecha: 2026-10-02. Rama del plan: `plan/guardia-sin-tropiezos`, sobre `core/guard-sin-confirmar-push` (62bde34: ya quitó la confirmación de push y merge y agregó `subagent-main`). La ejecución sale de una rama nueva desde ese mismo commit.
Auditoría que lo motiva: [`docs/audits/2026-10-02-reglas-de-la-guardia.md`](../audits/2026-10-02-reglas-de-la-guardia.md) (181 llamadas bloqueadas en una sesión de desarrollo, ninguna frenó un daño real; 166 siguen bloqueadas con el código de la base).
Spec: `docs/specs/2026-09-26-pignolo-v1-design.md` (§8.1 plantilla, §8.3 plazo del launcher, §11.6 guardia y respaldos).
Método (CLAUDE.md): tarjetas con archivos, interfaces y casos literales; un solo ejecutor sonnet en serie; sin repetir el código en el plan; el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege; una revisión opus al final con una pasada de arreglos. Es la guardia (área de riesgo): auditoría previa del plan en opus (§10).

## 1. Alcance

**Entra** (decisiones D-G1 a D-G4 del autor, §3):

- Angostar las reglas de la guardia que frenan actividad común: `inline-code`, `pignolo-launcher`, `dynamic-redirect`, `catastrophic-delete` (solo el disparador), `dynamic-argument`, `protected-flag`, `unparseable`, `dynamic-command`.
- Dejar pasar lo recuperable con la instantánea tomada antes: `checkout <ref> -- <archivos>`, `checkout -- <archivos>`, `restore <archivos>`, `stash` / `push` / `pop` / `apply` (reglas `checkout-path`, `restore`, `stash`, `git-C`).
- Plazo del launcher: al vencer, pasa lo que es de solo lectura por estructura.
- Instantánea WIP solo antes de los comandos que pueden descartar trabajo.
- Plantilla `permissions.json`: sin la familia "el texto menciona git" y alineada con lo que la guardia deja pasar.
- Medir: reevaluar los 181 comandos registrados con el código nuevo y el costo por comando del hook antes y después.
- Versión 0.16.0, CHANGELOG, spec, README, registro de riesgo residual.

**No entra:**

- Todo lo de la lista "no tocar" de la auditoría (§5 de la auditoría): núcleo de `catastrophic-delete` y `protected-path` (`.git`, `~`, `~/.pignolo`, la raíz, `*` suelto), `reset-hard`, `clean`, `worktree-remove-force`, `push-force`, `send-pack`, `push-delete`, `gc-prune`, `reflog-expire`, `pignolo-ref`, `update-ref-stdin`, `no-verify`, `git-config-override`, `git-env-config`, `config-write` (hooks y alias), `quoted-substitution`, las reglas de rol de subagente (`pignolo-run`, `pignolo-plan`, `pignolo-init`, `pignolo-holdout`, `pignolo-queue`, `pignolo-worktree-tools`, `pignolo-protected-refs`, `subagent-main`, `sabotage-lock`) y la familia "git irreversible" de la plantilla.
- Lo que el autor no decidió (§9): `git branch -d` sin confirmación, `*navigate*` en el ask de MCP, `--force-with-lease` sobre la rama propia, y los otros puntos de §9.
- Ningún cambio en `pignolo-ui`, en los agentes ni en las skills (la skill `trivial` sigue diciendo que se deshace con Edit; es método, no guardia).

## 2. Restricciones globales

1. Después de cada tarjeta la suite completa pasa (`npm test`, nunca `node --test tests/`). Cada tarjeta cambia en el mismo commit el código, sus tests y las filas del corpus que cambian de veredicto.
2. Un commit por tarjeta, en español, Conventional Commits. La versión (0.16.0) y el CHANGELOG se tocan una sola vez, en T12.
3. Node >= 22, sin dependencias npm. Nada de red ni de pagos.
4. Los tests de la guardia no tocan el `~/.pignolo` real (usan `tests/helpers.js`) y no dependen del reloj: el plazo de 3 s se prueba bajando el plazo con `PIGNOLO_DEADLINE_MS` (R-7), no esperando.
5. El repo es público: la fixture de T1 no lleva rutas absolutas, usuarios, ids de agente ni nombres de proyectos privados.
6. Nada se relaja si no está en una tabla de este plan. Si el ejecutor encuentra una forma que le parece segura y no está, no la agrega: la anota en `docs/gaps.md`.
7. Ninguna tarjeta cambia el comportamiento de `ctx.subagent` (ver "Foco de revisión", punto 4).
8. Con `PIGNOLO_DISABLED=1` y con `/pignolo:off` solo rige el conjunto catastrófico, como hoy; las formas nuevas que exigen instantánea pasan sin ella (la guardia está apagada).

Autochequeo del ejecutor al cerrar **cada** tarjeta (5 puntos): (1) `npm test` completo en verde; (2) cada fila "debe seguir negado" de la tarjeta se evaluó y sigue negada, con su regla; (3) el rojo de cada test nuevo se mostró rompiendo lo indicado en "Rojo" y se restauró; (4) ninguna regla de la lista "no tocar" cambió de veredicto (la fixture de T1 y los corpus lo cubren); (5) spec y README de la tarjeta al día.

## 3. Decisiones del autor (2026-10-02), citadas

Principio: "la guardia frena al agente en los comandos realmente peligrosos y no lo frena en la actividad común". Dos preguntas para toda regla: ¿se pierde algo que no se puede recuperar? ¿la guardia puede saberlo con certeza? Si no, no frena.

- **D-G1:** todos los ajustes técnicos de la auditoría (sus cambios 1, 2, 4, 7, 8 y 9): `inline-code` se niega solo cuando el código inline llama a git o borra algo protegido o calculado; leer el launcher (`pignolo-launcher`) deja de bloquearse, solo se bloquea ejecutarlo; `dynamic-redirect` se permite salvo que la parte literal nombre `.git` o `.pignolo`; `catastrophic-delete` resuelve `mktemp`, las variables de un `for`, los comodines con prefijo literal y `find -delete` sobre rutas temporales; `dynamic-argument`, `protected-flag`, `unparseable` (`case`) y `dynamic-command` se angostan como dice la auditoría; la plantilla de permisos pierde la familia "el texto menciona git" y la entrada `git restore *`, que además niega `--staged`.
- **D-G2:** lo recuperable pasa, con la instantánea tomada antes: `git checkout <ref> -- <archivos literales>`, `git checkout -- <archivos>`, `git restore` de archivos concretos (y `--ours` / `--theirs`), `git stash` / `stash push` / `pop` / `apply`. Siguen negados `stash drop` y `stash clear`, y las formas no literales o de árbol entero que la auditoría deja cerradas.
- **D-G3:** plazo del launcher: cuando vence el plazo de 3 s, un comando de solo lectura POR ESTRUCTURA pasa; lo que escribe, borra o no se puede clasificar sigue negado.
- **D-G4:** la instantánea se toma solo antes de los comandos que pueden descartar trabajo (checkout, restore, stash, reset, clean, rm y similares, como lista cerrada derivada de la clasificación de la propia guardia), no antes de todo comando. Un comando que la guardia no puede clasificar sigue teniendo instantánea.

## 4. Decisiones técnicas que toma este plan

Cada una es del agente (CLAUDE.md) y queda registrada acá; si el autor las discute, se ajusta la tarjeta indicada.

| Id | Decisión | Tarjeta |
|---|---|---|
| R-1 | `evaluate` devuelve un campo nuevo `snapshot`: `'none'`, `'before'` (instantánea de mejor esfuerzo, como hoy: si falla se avisa con `systemMessage`) o `'required'` (la forma solo pasa si la instantánea sale bien). Se calcula también cuando el veredicto es block (no se usa). `guard.js` lo usa. Lo no clasificable (cualquier regla de clase `unverifiable` o `ask`, incluso en un modo interactivo) da `'before'`. | T2 |
| R-2 | Regla nueva `snapshot-required` (clase deny): una forma `'required'` cuya instantánea lanza error o sale con `partial` se niega. Una instantánea que devuelve `null` (árbol limpio o no es un repo) cuenta como buena: no hay nada que perder. Con `PIGNOLO_CANARY=1` (no toma instantánea) una forma `'required'` se niega. | T2, T11 |
| R-3 | Las formas que HOY pasan (`stash push -m <x>`, `stash apply <sha>`, `stash list/show/create`) siguen en `'before'`: no se les agrega una condición nueva. Las formas que pasan por D-G2 son `'required'`. | T11 |
| R-4 | "Archivo literal" (D-G2): palabra sin variable ni sustitución, sin `* ? [ \ :`, que no sea `.`, `..` ni termine en `/`, y que en disco no sea una carpeta. Se mira el disco con el cwd real del hook, o con la costura `opts.statPath` (T1). Sin cwd real ni costura no se relaja nada (la evaluación pura sigue negando como hoy). | T1, T11 |
| R-5 | `stash` que pasa: sin argumentos, `push` (con `-m`, `-u`/`--include-untracked`, `-k`, `-q`, `--` y rutas literales), `pop`, `apply` con cero o una referencia literal (`stash@{N}` o un sha). Siguen negados: `drop`, `clear`, `save`, `branch`, `store`, `-a`/`--all` (arrastra los ignorados), `-p`/`--patch`, `--pathspec-from-file`, cualquier argumento dinámico y todo lo desconocido. | T11 |
| R-6 | `git -C <dir literal>` entra en D-G2 (3 de los 21 casos medidos de `checkout-path`/`restore`/`git-C` eran `-C`): se resuelve el directorio contra el cwd real, las reglas de checkout se evalúan sobre ese directorio y la instantánea se toma en él, no en el cwd del hook. `-C` con variable, `--git-dir` y `--work-tree` siguen en `git-C`. | T11 |
| R-7 | D-G3 rige para los hooks `guard` y `scope-gate` (ambos deciden sobre un comando); `private-reads` y `plan-audit-gate` siguen negando al vencer (limitan lo que lee o ejecuta un subagente: un `cat` del holdout es de solo lectura y justo lo que `private-reads` niega). Bash se clasifica con el tokenizador de la guardia; PowerShell con una lista cerrada por texto, sin AST (el AST es lo que tarda). La variable `PIGNOLO_DEADLINE_MS` solo BAJA el plazo (nunca lo sube) y existe para probarlo sin esperar. El aviso sale por `systemMessage`. | T3 |
| R-8 | Polaridad de D-G4: la lista cerrada es la de lo que descarta; un programa desconocido (`npm`, `node x.js`, `make`) es neutro y no lleva instantánea. Es el costo declarado de D-G4: un script propio que borre archivos ya no deja respaldo previo (registro de riesgo residual). | T2 |
| R-9 | `inline-code`: se buscan llamadas a proceso FUERA de los literales de cadena (un `spawnSync('git'...)` escrito dentro de una cadena que se va a guardar en un archivo no es una llamada). Si el escáner no puede tokenizar (comillas sin cerrar, plantilla con `${`), cae a la búsqueda ingenua y niega. | T7 |
| R-10 | `dynamic-redirect`: la parte literal nombra `.git`, `.pignolo` o un nombre base `disabled` / `.disabled` (el flag) => se niega (`protected-path` o `protected-flag`); si no, pasa. | T5 |
| R-11 | `protected-flag`: la rama de "comodín o variable con el texto pignolo/disabled" mira solo programas que escriben o borran (`WRITE_CMDS`) y, de `cp`/`mv`/`install`/`ln`, solo el destino; y solo si el patrón puede alcanzar `.pignolo/disabled` o `~/.pignolo/disabled`, comparando segmento por segmento (un comodín no cruza `/`; un tramo variable cuenta como `**`; un comodín puede casar un nombre con punto, a propósito). | T6 |
| R-12 | `catastrophic-delete`: (a) `$(mktemp ...)` y `` `mktemp ...` `` con solo las opciones `-d`, `-q`, `-t` y una plantilla sin `/` ni `..` valen una ruta temporal; un valor que, ya sustituido, tenga un segmento `..` sigue siendo dinámico. (b) la variable de un `for` con lista literal se evalúa una vez por valor. (c) comodín con prefijo literal no vacío que no empieza con punto (`^[A-Za-z0-9_][A-Za-z0-9_.-]*`) antes del primer comodín, sin segmentos `..` y sin nombrar `.git`/`.pignolo` en el resto: pasa (`rm -f build-*.log`); `*.log`, `.g*`, `*/build` siguen negados. (d) `find <inicio...> -delete` pasa solo si todos los inicios resuelven bajo una ruta temporal (`$TEMP`, `$TMPDIR`, `/tmp`, una variable de `mktemp`): `find` entra en `.git`, así que `find . -name "*.pack" -delete` sigue negado aunque el patrón no case con `.git`. (e) PowerShell: `$_`, `$_.FullName`, `$_.PSPath` y `$PSItem.*` como operando de un borrador dentro de un `ForEach-Object` valen las rutas que produce el `Get-ChildItem`/`Get-Item` de arriba, si su raíz es literal y temporal. | T9 |
| R-13 | `dynamic-argument`: la variable en posición de ref o ruta se permite solo en `merge`, `fetch` (sin `-u`/`--update-head-ok`) y `worktree add`, y solo en el hilo principal. Más estricto que la auditoría §6.1 en dos puntos: `branch` y `tag` quedan como hoy (una variable al principio sigue negada, porque puede valer `-D`; con prefijo literal, como `"task/$ID"`, ya pasa), y un subagente conserva la regla de hoy (si no, `fetch origin "$B"` con `B=x:int/p` escribiría `int/p` sin que `pignolo-protected-refs` lo vea). La expansión del `for` con lista literal vale para todos. | T10 |
| R-14 | `dynamic-command`: la variable con un literal asignada en el mismo comando (`R="node x.mjs"; $R a`) ya se resuelve en la base (se verificó): solo se agrega el test de regresión. Lo que falta es la función definida en el mismo comando, que se analiza por su cuerpo con `"$@"` reemplazado por los argumentos de la llamada; si el parser no delimita el cuerpo, se deja negado y se anota (tarjeta T10, parte b, la primera que se recorta). | T10 |
| R-15 | `unparseable`: se arregla `case ... esac`. Si el texto igual no parsea, se niega solo si nombra git (`mentionsGit`), un borrador (`TEXT_DELETE`) o un sumidero (`eval`, `source`, `\| sh`, `\| bash`, `bash -c`, `sh -c`, `node -e`, `python -c`, `-EncodedCommand`, `Invoke-Expression`, `iex`); si no, pasa. `ps-unavailable` queda como está. | T8 |
| R-16 | Plantilla: sale la familia `bash -c *git *`, `sh -c *git *`, `node -e *git *`, `python -c *git *`, `python3 -c *git *`, `cmd /c *git *`, `cmd.exe /c *git *`, `xargs *git *`, `find * -exec *git *`, `alias *git*` (se queda `eval *`); salen `git stash`, `git stash pop *`, `git checkout -- *`, `git checkout * -- *` y `git restore *` (Bash y PowerShell) y entran las formas de árbol entero (`git checkout -- .`, `git checkout * -- .`, `git restore .`, `git restore -- .`, y las mismas en PowerShell). Se quedan `git stash drop *`, `git stash clear *`, `git checkout .`, `git checkout -f *` y todo lo demás. La capa 1 no puede expresar "con instantánea": es más estricta a propósito en `git checkout -- .`. | T11 |
| R-17 | La medición de T13 se hace sobre la base de la fixture saneada con el cwd y la costura de disco de T1, no sobre el disco de la sesión original: el número reportado es "de N que la fixture niega en la base, M siguen negados", más la comparación con los 166 de 181 de la auditoría. | T1, T13 |
| R-18 | `node --check <launcher>` (solo sintaxis) pasa, como ya pasa para `run.js` (G21). | T4 |

## 5. Foco de revisión (Review Focus)

Los cuatro modos de falla que más probablemente muerdan. El revisor opus los ataca primero.

1. **Un comando destructivo que ahora pasa.**
   - Formas relajadas, las que más: la variable de un `for` con valores que se vuelven peligrosos al expandirse (`.git`, `../..`, `*`, `--force`); `mktemp` con `..` o con `-p`; el comodín con prefijo literal en la raíz del repo (`rm -rf s*` borra `src/`: recuperable por git y por la instantánea, declarado); `find <temp> -delete`; un `inline-code` que arma el comando por partes (pasa, igual que hoy con escribirlo en un archivo); el escáner de cadenas del R-9 (una comilla mal contada esconde una llamada); `git merge "$B"` con `B=--abort` (la auditoría acepta que `merge` no pierde trabajo); `git checkout -- <archivo>` cuyo contenido previo nació en la misma línea de comando (la instantánea se toma antes de la línea: lo que se pierde es lo que el propio agente hizo en esa línea, decisión aceptada).
   - La capa 3 es mejor esfuerzo y la capa 1 (plantilla) es la única viva si el hook no arranca: al sacar `bash -c *git *` de la plantilla, `bash -c "git stash drop"` queda sin freno si el hook no corre. La auditoría lo acepta.
2. **Una instantánea que se saltea antes de un comando destructivo mal clasificado.**
   - La polaridad de R-8 hace que todo lo que no figura en la lista cerrada corra sin instantánea. Hay que recorrer todos los caminos que llaman a `analyze`: `bash -c`, `eval`, `xargs`, `find -exec`, `env`, `sudo`, `npx`, `cmd /c`, `Start-Process`, `powershell -Command`, `ForEach-Object -MemberName Delete`, `.Delete()`. El indicador va en `ctx` (compartido en la recursión), no en el estado `st`, que se copia.
   - Un script propio (`node limpiar.js`, `npm run clean`, `make clean`, `sh x.sh`) borra sin respaldo: declarado (R-8).
   - Un comando que no parsea o no se clasifica debe dar `'before'`, nunca `'none'`.
3. **Una clasificación de solo lectura equivocada bajo el plazo.**
   - Un comando que escribe y el clasificador toma por lectura corre sin análisis ni respaldo en la máquina cargada. Por eso la lista es cerrada y por estructura (no por texto) en Bash: opciones que escriben (`git diff --output=`, `sort -o`, `find -fprint`, `rg --pre`, `git -c`, `--ext-diff`), redirecciones, sustituciones, variables, subshells, segundo plano.
   - PowerShell se clasifica por texto: la lista tiene que ser muy corta y rechazar `$`, comillas invertidas, `;`, `&`, `|`, `>`, `(`, `{`.
   - Un plazo vencido en `private-reads` o `plan-audit-gate` no debe pasar nunca.
4. **Las reglas de rol de subagente debilitadas sin querer.**
   - Tocan código compartido: `checkLauncher` (el patrón `executes` de `checkRunScript` no se toca), `analyzeGit` (el `-C` resuelto no puede cambiar el `st` que se le pasa a `protectsRefs`/`touchesMain`, solo el `inner`), `gitRules` (los extras `pignolo-protected-refs` y `subagent-main` se agregan después de la base y no se tocan), el relajamiento de `dynamic-argument` (solo hilo principal, R-13) y la expansión de `for` (más precisa para todos).
   - `git stash pop` y `apply` pasan también para un subagente; el stash es común a los worktrees de tarea: un `pop` puede traer el de otro agente. No pierde trabajo (queda aplicado en otro árbol), pero lo mueve: declarado en el registro de riesgo residual.
   - Test de guarda en T11: la matriz de roles de `tests/guard-subagent-main.test.js` y `tests/guard-queue.test.js` sigue igual de verde sin tocar una sola fila.

## 6. Orden y dependencias

| Tarjeta | Título | Regla(s) / decisión | Tamaño | Depende de |
|---|---|---|---|---|
| T1 | Fixture saneada de los 181, costura de disco, línea base | (sin cambio de comportamiento) | M | - |
| T2 | La instantánea solo antes de lo que descarta | D-G4 | M | T1 |
| T3 | Plazo vencido: pasa lo de solo lectura | D-G3 | L | - |
| T4 | Leer el launcher deja de bloquearse | `pignolo-launcher` | S | T1 |
| T5 | Redirección a una variable | `dynamic-redirect` | S | T1 |
| T6 | Comodines con el texto "pignolo" o "disabled" | `protected-flag` | M | T1 |
| T7 | Código inline que llama a git de verdad | `inline-code` | L | T1 |
| T8 | `case` y `for` en el parser; lo que no parsea | `unparseable` | L | T1 |
| T9 | Borrados de temporales | `catastrophic-delete` | L | T5, T8 |
| T10 | Variables en `merge`/`fetch`/`worktree add`; funciones | `dynamic-argument`, `dynamic-command` | M | T8 |
| T11 | Lo recuperable pasa con instantánea; plantilla | D-G2, `checkout-path`, `restore`, `stash`, `git-C` | L | T1, T2 |
| T12 | Versión 0.16.0, CHANGELOG, spec, README, riesgo residual | - | S | T1 a T11 |
| T13 | Medir: los 181 con el código nuevo y el costo por comando | - | M | T12 |

T3, T4, T5, T6 y T7 no dependen entre sí: el orden de la tabla es el de ejecución en serie (CLAUDE.md: un solo ejecutor en serie por defecto).

## 7. Tarjetas

### T1. Fixture saneada, costura de disco y línea base

**Reglas tocadas:** ninguna. Es la red de todo lo que sigue.

**Archivos**
- `plugins/pignolo/lib/git-guard.js`: costura `opts.statPath` (ver Interfaz).
- `tests/guard/medidos.json` (nuevo): los 181 comandos.
- `tests/guard-medidos.test.js` (nuevo).
- `local/guard/sanitize-events.js` (en `local/`, fuera de git: lo escribe el ejecutor, no se versiona; lee el `events.json` de la auditoría que le pasa el autor por argumento).
- `local/guard/denylist.txt` (fuera de git): nombres privados, uno por línea, que el test de fuga usa si existe.

**Interfaz**
- `evaluate(command, { ..., statPath })`: `statPath(valor)` devuelve `'file'`, `'dir'` o `null`. Por defecto resuelve `valor` contra `realDirs(st)` en disco (`'dir'` si es carpeta, `'file'` si existe, `null` si no). El chequeo actual de `checkout` (`fs.existsSync` sobre `realDirs`) pasa a usar `statPath`; trata `'file'` y `'dir'` igual que hoy: sin cambio de comportamiento.
- Fila de `medidos.json`: `{ id: "ev-000".."ev-180", shell, cmd, files?: [rutas relativas que eran archivos], audit: "block:<regla>" | "allow", base: "block:<regla>" | "allow", expect: "block:<regla>" | "allow" }`. `audit` es el veredicto que midió la auditoría (campo `now` de su `events.json`); `base` es lo que la fixture da con el código de la base (se anota corriendo, en T1); `expect` arranca igual a `base` y cada tarjeta lo mueve para las filas que libera.
- Saneado (en `local/`): rutas absolutas del usuario, de `tmp/` y de worktrees pasan a rutas relativas genéricas (`wt/`, `repo/`, `/tmp/x`); ids de agente, ids de sesión y hashes largos se quitan; `cd` a rutas privadas se reduce a `cd wt`; los nombres privados de la denylist se reemplazan por `proj`. Se conserva la forma del comando (comillas, `for`, heredocs, redirecciones, funciones).

**Tests (todos verdes en la base)**
1. `medidos.json` tiene 181 filas, ids únicos y todos los campos.
2. Para cada fila, `evaluate(cmd, { shell, mode: 'bypassPermissions', statPath: (p) => (files||[]).includes(p) ? 'file' : null, psTimeoutMs: 30000 })` da `base` (veredicto y regla).
3. Cuenta: en la base, bloqueadas + permitidas = 181; se imprime cuántas difieren de `audit` (la auditoría usó el disco real) y se exige que sean <= 10; si son más, se revisa el saneado.
4. Fuga: ninguna fila (ni `cmd` ni `files`) trae una letra de unidad de Windows seguida de `:` y una barra, ni una carpeta de usuario de Windows, Linux o macOS, ni la de datos de aplicación, ni la carpeta de trabajos de Claude, ni un hash de 16 o más caracteres hexadecimales, ni un correo; y ninguna línea de `local/guard/denylist.txt` si el archivo existe (si no existe, se anota y se sigue). Son expresiones regulares genéricas: el test no lleva ningún nombre privado.
5. La costura: `evaluate('git checkout x.js', { statPath: () => 'file' }).rule === 'checkout-path'` y con `statPath: () => null` es `allow`.

**Rojo:** el test 2 se muestra rompiendo una regla a mano (por ejemplo, vaciando `RULES['dynamic-redirect']` de la lista que corta en `checkWriteTarget`: las filas de esa regla cambian de `base` y el test lo dice). El test 4 se muestra pegando una ruta absoluta de Windows en una fila.

**Docs:** `docs/gaps.md` registra G-guardia-1: "los 181 bloqueos de una sesión; la fixture los versiona". Nada en spec ni README.

### T2. La instantánea solo antes de lo que descarta (D-G4)

**Reglas:** ninguna cambia de veredicto; cambia cuándo se toma la instantánea. Reglas nuevas: `snapshot-required` (se declara acá, se usa en T11).

**Archivos**
- `plugins/pignolo/lib/git-guard.js`: `evaluate` devuelve `snapshot` y `snapshotDirs`; el indicador `ctx.discard` se levanta en los puntos de la lista cerrada; entra `RULES['snapshot-required']` (deny, razón: "este comando sobrescribe trabajo sin commitear y solo pasa con una instantánea previa; la instantánea falló", alternativa: "reintentá, o commiteá el trabajo como WIP antes").
- `plugins/pignolo/hooks/handlers/guard.js`: usa `v.snapshot`.
- `tests/guard-snapshot-scope.test.js` (nuevo); se ajustan `tests/guard-handler.test.js` y `tests/permissions.test.js` (`NOT_EXPRESSIBLE['snapshot-required']`: "depende de que la instantánea de esta llamada salga bien").

**Interfaz**
- `evaluate(...).snapshot`: `'none' | 'before' | 'required'` (R-1). `snapshotDirs`: lista de directorios reales a respaldar (vacía = el cwd del hook; T11 la llena para `-C`).
- Flujo de `guard.js`: evalúa; si block, exit 2 sin instantánea (como hoy); si la guardia está apagada, exit 0; si `snapshot === 'none'`, no llama a `snapshotWip` (ni su `rev-parse`); si `'before'`, como hoy (un fallo se avisa por `systemMessage` y no cambia la decisión); si `'required'`, un fallo, un `partial` o `PIGNOLO_CANARY=1` dan exit 2 con la razón de `snapshot-required` (R-2).
- Lista cerrada de lo que descarta (R-8), derivada de las propias estructuras de la guardia; `DISCARD` se exporta para los tests:
  - programas: `DELETE_CMDS` (rm, rmdir, unlink, shred, del, erase, rd, Remove-Item, ri, mv, move, Move-Item, mi, ren, rename, Rename-Item, rni, rimraf, del-cli, trash), más `cp copy copy-item cpi tee install truncate ln set-content sc out-file clear-content clc tee-object new-item ni dd robocopy xcopy rsync`, y los de `FILE_WRITERS` (curl, wget, unzip, 7z, patch);
  - formas: redirección de salida con `>` o `>|` (no `>>`, no `>&`, no a `/dev/null`); `sed -i`, `perl -i`, `ruby -i`; `tar` que extrae; `find` con `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`; código inline con una API de borrado (`inlineDeletes` encontró llamadas);
  - git: `checkout`, `switch`, `restore`, `reset`, `clean`, `stash` (salvo `list`/`show`/`create`), `rm`, `read-tree`, `checkout-index`, `worktree`, `rebase`, `merge`, `pull`, `cherry-pick`, `revert`, `am`, `apply`, `mv`. Se quedan fuera (no tocan archivos del árbol): `status log diff show add commit push fetch branch tag remote config rev-parse ls-files` y los demás de lectura;
  - no clasificable: parseo fallido, `hidden-code`, `dynamic-command`, `unknown-git-subcommand`, `ps-unavailable` y cualquier regla de clase `unverifiable` o `ask` => `'before'`.
  - Las envolturas (`env`, `sudo`, `timeout`, `xargs`, `bash -c`, `eval`, `cmd /c`, `Start-Process`, `powershell -Command`, `find -exec`) ya reevalúan lo envuelto con el mismo `ctx`: el indicador sale solo.

**Tabla: instantánea (antes: siempre; después: la de la tabla)**

| Comando | Antes | Después |
|---|---|---|
| `ls -la` | sí | `none` |
| `git status` | sí | `none` |
| `git log --oneline -5` | sí | `none` |
| `git diff HEAD` | sí | `none` |
| `git add a.txt` | sí | `none` |
| `git commit -m "feat: x"` | sí | `none` |
| `git push origin task/x` | sí | `none` |
| `git fetch origin` | sí | `none` |
| `git branch task/x` | sí | `none` |
| `git stash list` | sí | `none` |
| `npm test` | sí | `none` |
| `node --test tests/` | sí | `none` |
| `node scripts/x.js` | sí | `none` (declarado, R-8) |
| `mkdir -p out/x` / `touch f.txt` | sí | `none` |
| `echo hi >> log.txt` | sí | `none` |
| `npm test > /dev/null 2>&1` | sí | `none` |
| PowerShell `Get-ChildItem src`, `git status` | sí | `none` |
| `rm a.txt` / `rm -rf build` | sí | `before` |
| `mv a.txt b.txt` / `cp a.txt b.txt` | sí | `before` |
| `echo x > a.txt` / `npm test > out.log 2>&1` | sí | `before` |
| `sed -i s/a/b/ a.txt` / `tar -xf x.tgz` / `curl -o f.txt http://x` | sí | `before` |
| `find build -name "*.o" -delete` | sí | `before` |
| `git checkout main` / `git switch main` | sí | `before` |
| `git merge task/x` / `git pull --rebase` / `git rebase main` | sí | `before` |
| `git reset --soft HEAD~1` / `git apply p.diff` / `git mv a.txt b.txt` / `git rm a.txt` | sí | `before` |
| `git clean -n` (pasa; es el dry-run) | sí | `before` (la lista es por subcomando) |
| `bash -c "rm a.txt"` / `xargs rm < lista.txt` | sí | `before` |
| PowerShell `Remove-Item a.txt` / `Set-Content a.txt x` / `Out-File a.txt` | sí | `before` |
| modo interactivo: `eval "$X"` (ask) / `git lg` (ask) | sí | `before` |

**Debe seguir igual (no se toca):** un comando bloqueado sigue sin instantánea; con la guardia apagada no hay instantánea; `agent-gate` (instantánea y respaldo de refs antes de cada despacho) no cambia.

**Tests (nuevos)**
1. Tabla de `none`: cada fila da `snapshot: 'none'`; tabla de `before`: cada fila da `'before'`. Se corren en `bash` y, para las filas de PowerShell, con `shell: 'powershell'`.
2. Meta-test: una muestra por cada regla de pérdida de trabajo (`stash`, `checkout-path`, `checkout-force`, `switch-force`, `restore`, `reset-hard`, `clean`, `rm-force`, `read-tree-update`, `checkout-index-force`, `worktree-remove-force`, `catastrophic-delete`) da `snapshot !== 'none'` aunque el veredicto sea block. Si alguien agrega una regla de pérdida de trabajo sin la lista, falla.
3. Handler: con la instantánea inyectada (`ctx.snapshot` de `tests/helpers.js`), `ls` no la llama; `rm tmp.txt` la llama una vez; un block no la llama; una instantánea que lanza error en `'before'` deja exit 0 con `systemMessage`.
4. `PIGNOLO_CANARY=1` no toma instantánea (como hoy).

**Rojo:** el test 1 se rompe cambiando `DISCARD` para que no incluya `rm` (la fila `rm a.txt` pasa a `none`); el meta-test, vaciando la rama de `reset` de la lista; el handler, haciendo que `guard.js` ignore `v.snapshot`.

**Tests existentes que cambian:** `tests/guard-handler.test.js` (los que esperan una instantánea antes de un comando inocuo, "takes a WIP snapshot before an allowed shell command in a dirty repo", "work destroyed by an allowed command is recoverable from refs/pignolo/wip" y el de `systemMessage` por fallo) pasan a usar un comando de la lista (`rm a.txt`, con el archivo ya creado) en vez de `echo`/`ls`.

**Docs:** spec §11.6: reescribir el punto "`scripts/wip-snapshot` toma la instantánea antes de todo comando de Bash/PowerShell, sin clasificarlo" => "antes de los comandos que pueden descartar trabajo (lista cerrada) y de los que la guardia no puede clasificar; el resto de los comandos corre sin instantánea (decisión del autor, 2026-10-02, D-G4)"; el costo medido (0,25–0,35 s) se cita como el que se ahorra, con el dato real de T13. README: la frase de "Borrados que no pasan por git" aclara que un script propio no deja respaldo previo. `docs/gaps.md`: G22 y G42 pasan a "parcialmente cerrado".

### T3. Plazo vencido: pasa lo de solo lectura (D-G3)

**Reglas:** ninguna de `git-guard`; cambia el launcher.

**Archivos**
- `plugins/pignolo/lib/read-only.js` (nuevo): `isReadOnlyByStructure(command, shell)`. Solo depende de `./shell-parse`.
- `plugins/pignolo/hooks/launcher.js`: al vencer el plazo, para `guard` y `scope-gate` con un payload de Bash o PowerShell con `tool_input.command` de texto, consulta el clasificador; si da true, sale 0 con `systemMessage`; si no, niega como hoy. Lee `PIGNOLO_DEADLINE_MS` (solo si es un entero menor que el plazo vigente, mínimo 1).
- `tests/guard-deadline.test.js` (nuevo); `tests/launcher.test.js` (el test del plazo sigue igual).

**Definición de "solo lectura por estructura" (conservadora, cerrada)**
Bash (con `parseBash`; un `ParseError` => false):
1. Todos los comandos simples, unidos por `&&`, `||`, `;`, `|` o salto de línea. Sin subshell `( )`, sin `{ }`, sin `&` al final, sin sustitución `$( )` ni `` ` ``, sin `<( )`, sin heredoc ni here-string, sin asignaciones al frente, sin palabra dinámica (`$x`, `${x}`): todo `dyn` => false.
2. Redirecciones: solo `2>&1`, `>&2`, `>/dev/null`, `2>/dev/null`, `&>/dev/null` y `<` de entrada. Cualquier otro `>` o `>>` => false.
3. Programa (tras `progName`) en la lista: `ls pwd cat head tail wc stat file du tree basename dirname realpath readlink echo printf true false test [ cd grep egrep fgrep rg sort cut tr nl column diff cmp md5sum sha1sum sha256sum od hexdump strings jq which find`. Excepciones por programa: `rg` sin `--pre`, `--pre-glob`, `--hostname-bin`, `-z`, `--search-zip`; `sort` sin `-o` ni `--output`, `--compress-program`; `find` sin `-delete -exec -execdir -ok -okdir -fprint -fprint0 -fprintf -fls`.
4. `git` (sin `-c`, `-C`, `--git-dir`, `--work-tree`; solo `--no-pager` como opción global) con subcomando en `status log diff show rev-parse rev-list ls-files ls-tree cat-file blame shortlog describe merge-base show-ref name-rev diff-tree diff-index diff-files grep`, o en las formas exactas `branch` (con argumentos solo de `-a -r -v -vv --show-current --list`), `tag` (solo `-l`/`--list`), `stash list`, `stash show`, `worktree list`, `remote -v`. Ningún argumento que empiece con `--output`, `--ext-diff`, `--textconv`, `--exec`, `--open-files-in-pager` ni sea `-O`.
PowerShell (sin AST, solo texto): el comando entero casa con `^\s*(CMD)(\s+ARG)*\s*$`, donde `CMD` es `Get-ChildItem`, `Get-Content`, `Get-Item`, `Get-Location`, `Test-Path`, `Select-String`, `Resolve-Path`, `Write-Output`, `Write-Host`, o `git` con un subcomando de la lista de Bash; `ARG` es `[-A-Za-z0-9_.:/\\*?=,@%+~#]+` o una cadena entre comillas simples sin `$` ni `` ` ``, o entre comillas dobles sin `$` ni `` ` ``. Sin `|`, `;`, `&`, `>`, `<`, `(`, `{`, `$` fuera de comillas simples.

**Tabla: plazo vencido (comando de Bash salvo que diga PowerShell)**

| Comando | Antes | Después |
|---|---|---|
| `ls -la src` | deny | pasa (con aviso) |
| `git status` | deny | pasa |
| `git log --oneline -5 \| head -3` | deny | pasa |
| `cat a.txt \| grep -n foo \| wc -l` | deny | pasa |
| `cd sub && ls && pwd` | deny | pasa |
| `grep -rn "deadline" plugins/ \| head -20` | deny | pasa |
| `git diff HEAD -- src/` / `git show HEAD:a.txt \| head` | deny | pasa |
| `find . -name "*.js" -not -path "./node_modules/*"` | deny | pasa |
| `git branch --show-current` / `git stash list` / `git worktree list` | deny | pasa |
| `rg -n foo src` | deny | pasa |
| PowerShell `Get-ChildItem src` / `Get-Content a.txt -Tail 5` / `Test-Path a.txt` | deny | pasa |
| PowerShell `Select-String -Path a.txt -Pattern foo` / `git status` | deny | pasa |
| `rm a.txt` / `echo x > a.txt` / `cat a.txt > b.txt` | deny | deny |
| `git status; rm a.txt` / `git status && git stash` | deny | deny (un tramo no es de lectura) |
| `git checkout -- a.txt` / `git add a.txt` / `git commit -m x` / `git push` | deny | deny |
| `npm test` / `node x.js` | deny | deny |
| `ls $(rm a.txt)` / `ls "$d"` / `FOO=1 ls` / `env ls` / `xargs ls` | deny | deny |
| `ls; (rm a.txt)` / `ls &` / `echo hi >> log.txt` | deny | deny |
| `find . -delete` / `find . -exec rm {} +` / `find . -fprint out.txt` | deny | deny |
| `git diff --output=out.patch` / `git log --ext-diff` / `git -c core.pager=less log` | deny | deny |
| `git branch x` / `git branch -D x` / `git tag v1` | deny | deny |
| `rg --pre ./f foo` / `sort -o a.txt a.txt` / `sed -i s/a/b/ a.txt` | deny | deny |
| `ls "unclosed` (no parsea) | deny | deny |
| PowerShell `Remove-Item a.txt` / `Get-Content a.txt \| Set-Content b.txt` | deny | deny |
| PowerShell `Get-ChildItem $env:TEMP` / `Get-ChildItem > out.txt` / `& git status` | deny | deny |
| PowerShell `git status; Remove-Item a` | deny | deny |

**Tests (nuevos)**
1. Clasificador: tabla de "pasa" y tabla de "deny" (Bash y PowerShell), cada fila con su valor esperado.
2. Launcher, con `PIGNOLO_DEADLINE_MS=1` y el `guard` real: `ls` => exit 0 y `systemMessage` que menciona el plazo; `rm a.txt` => exit 2 con "plazo interno"; `PowerShell` con `Get-ChildItem src` => exit 0.
3. Launcher, `scope-gate` con `git log main..branch` (casa con el prefiltro) => exit 0; `git merge x` => exit 2.
4. Launcher, `private-reads` con `agent_id` y un `Bash` de lectura (`cat a.txt`) => exit 2 con el plazo en 1 ms (no pasa). `plan-audit-gate` igual.
5. `PIGNOLO_DEADLINE_MS=99999` no sube el plazo: el handler lento de `tests/launcher.test.js` sigue negado antes de 6 s.
6. Sin `PIGNOLO_DEADLINE_MS`, el comportamiento y el mensaje de hoy no cambian.

**Rojo:** el test 1 se rompe agregando `rm` a la lista de programas (una fila de "deny" pasa); el 2 y el 3, haciendo que el launcher consulte el clasificador para todos los hooks (el 4 falla); el 5, quitando el "solo si es menor".

**Docs:** spec §8.3: el punto "tiene un plazo interno (~3 s) que, al vencer, niega" => "...al vencer, niega salvo que el hook sea `guard` o `scope-gate` y el comando sea de solo lectura por estructura (lista cerrada, `lib/read-only.js`); entonces pasa con un aviso (decisión del autor, 2026-10-02, D-G3)". README, sección Guardia: una línea.

### T4. Leer el launcher deja de bloquearse (`pignolo-launcher`)

**Reglas tocadas:** `pignolo-launcher` (angostar a la ejecución).

**Archivos:** `plugins/pignolo/lib/git-guard.js` (`checkLauncher`); `tests/git-guard.test.js`, `tests/guard-toggle-paths.test.js`, `tests/guard/must-allow.json`, `tests/guard/must-block.json`.

**Comportamiento:** hay ejecución cuando (a) el programa mismo (`words[0]` tras quitar envoltorios) es el launcher, o (b) el programa es un intérprete (`INTERP`) o una shell (`SHELLS`) y alguno de sus operandos es el launcher. Leerlo con `cat`, `sed`, `grep`, `head`, `git diff`, `git show`, `cp` (como fuente), `wc`, un `for f in ...` o pasárselo a cualquier otro programa no cuenta. `node --check <launcher>` pasa (R-18). Se mantiene la excepción `node <launcher> session-start`. La detección de palabras dinámicas que terminan en `launcher.js` (`$L`) se mantiene para el caso de ejecución.

**Tabla**

| Comando | Antes | Después |
|---|---|---|
| `cat -n plugins/pignolo/hooks/launcher.js` | deny `pignolo-launcher` | pasa |
| `sed -n 1,60p hooks/launcher.js` | deny `pignolo-launcher` | pasa |
| `grep -n "deadlineFor" -A12 plugins/pignolo/hooks/launcher.js` | deny `pignolo-launcher` | pasa |
| `git diff main..HEAD -- plugins/pignolo/hooks/launcher.js` | deny `pignolo-launcher` | pasa |
| `git show HEAD:plugins/pignolo/hooks/launcher.js \| head` | deny `pignolo-launcher` | pasa |
| `wc -l hooks/launcher.js; head -5 hooks/launcher.js` | deny `pignolo-launcher` | pasa |
| `for f in hooks/launcher.js hooks/handlers/guard.js; do wc -l $f; done` | deny `pignolo-launcher` | pasa |
| `cp hooks/launcher.js /tmp/l.bak` | deny `pignolo-launcher` | pasa |
| `node --check hooks/launcher.js` | deny `pignolo-launcher` | pasa |
| PowerShell `Get-Content plugins\pignolo\hooks\launcher.js \| Select-String deadline` | deny `pignolo-launcher` | pasa |
| `node hooks/launcher.js session-start` | pasa | pasa (sin cambio) |

**Debe seguir negado** (todas `pignolo-launcher`, antes y después)

| Comando |
|---|
| `node hooks/launcher.js guard` |
| `echo '{}' \| node plugins/pignolo/hooks/launcher.js toggle` |
| `cd plugins/pignolo/hooks && node launcher.js toggle` |
| `L=x/hooks/launcher.js; echo {} \| node "$L" toggle` |
| `bash hooks/launcher.js` / `python hooks/launcher.js` |
| `./hooks/launcher.js guard` |
| `timeout 5 node hooks/launcher.js toggle` |
| PowerShell `node plugins\pignolo\hooks\launcher.js toggle` |

**Corpus:** los 35 ids de `medidos.json` con `base: block:pignolo-launcher` (ev-009, 011, 015, 032, 036, 039, 040, 041, 046, 053, 054, 057, 058, 075, 076, 078, 082, 086, 087, 091, 097, 103, 107, 108, 113, 114, 120, 121, 122, 123, 124, 134, 150, 151, 166) pasan a `expect: allow` (todas son lecturas: `cat -n`, `sed -n`, `grep -n`, `git diff`). Si alguna sigue negada por otra regla, el ejecutor la anota con su regla en `expect` y lo explica en el commit. Se suman a `must-allow.json` las filas de "pasa" de la tabla (Bash y PowerShell).

**Rojo:** las filas de "pasa" fallan en la base (`pignolo-launcher`); las de "debe seguir negado" se muestran rompiendo `checkLauncher` para que solo mire `words[0]` (`bash hooks/launcher.js` pasa y el test lo dice).

**Docs:** spec §11.6 (la regla ya dice "solo cuando se ejecuta" para los scripts de pignolo; se suma el launcher); README sin cambio.

### T5. Redirección a una variable (`dynamic-redirect`)

**Reglas tocadas:** `dynamic-redirect` (se permite), `protected-flag` y `protected-path` (la rama de destino dinámico de `checkWriteTarget` se angosta, R-10).

**Archivos:** `plugins/pignolo/lib/git-guard.js` (`checkWriteTarget`); `tests/guard-toggle-paths.test.js`, `tests/permissions.test.js` (`dynamic-redirect` ya está en `NOT_EXPRESSIBLE`; la razón cambia), `tests/guard/must-allow.json`, `tests/guard/must-block.json`.

**Comportamiento:** un destino con variable o sustitución que, tras sustituir lo conocido, sigue siendo dinámico: se niega solo si la parte literal nombra `.git` (`protected-path`), `.pignolo` o un nombre base `disabled` / `.disabled` (`protected-flag`); en cualquier otro caso pasa. Se mantiene la resolución del prefijo literal que ya hay (si resuelve a una ruta protegida, se niega). Se saca la prueba `/pignolo|disabled/i` sobre el texto entero. La regla `dynamic-redirect` queda en `RULES` (sin uso desde acá, para no romper `permissions.test.js`), o se retira junto con su entrada de `NOT_EXPRESSIBLE`: el ejecutor elige lo más simple y lo deja anotado.

**Tabla**

| Comando | Antes | Después |
|---|---|---|
| `echo x > $OUT` | deny `dynamic-redirect` | pasa |
| `npm test > "$LOG" 2>&1` | deny `dynamic-redirect` | pasa |
| `D=$(mktemp -d); echo x > $D/a` | deny `dynamic-redirect` | pasa |
| `for f in a b; do git show HEAD:$f > $f; done` | deny `dynamic-redirect` | pasa |
| `echo x > "$OUT/pignolo-notes.txt"` | deny `protected-flag` | pasa |
| `node build.js > "$ROOT/out/build.log" 2>&1` | deny `dynamic-redirect` | pasa |
| `echo x >> $LOG` | deny `dynamic-redirect` | pasa |
| PowerShell `git status > $log` | deny `dynamic-redirect` | pasa |
| medido (ev-100, saneado): `cd repo && nproc; for i in 1 2 3 4; do node probe2.mjs kill > ../p$i.txt 2>&1 & done; wait; cat ../p1.txt ../p2.txt` | deny `dynamic-redirect` | pasa |

**Debe seguir negado**

| Comando | Regla (antes y después) |
|---|---|
| `echo x > "$D/.git/config"` | `protected-path` |
| `echo x > ".git/$f"` | `protected-path` |
| `echo {} > "$D/.pignolo/state.json"` | `protected-flag` |
| `echo x > "$D/disabled"` / `echo x > "$D/.disabled"` | `protected-flag` |
| `echo x > "$HOME/.pignolo/disabled"` | `protected-flag` |

**Corpus:** los 13 ids con `base: block:dynamic-redirect` (ev-012, 022, 096, 100, 119, 125, 135, 137, 140, 142, 147, 154, 155) pasan a `expect: allow` salvo los que otra regla siga negando. Se suman a `must-allow.json` las filas de "pasa" y a `must-block.json` las de "debe seguir negado" que no estén.

**Rojo:** las filas de "pasa" fallan en la base; las de "debe seguir negado" se muestran haciendo que el destino dinámico pase siempre (`echo x > "$D/.git/config"` pasa y el test lo dice).

**Docs:** spec §11.6 (la lista de lo no verificable ya no incluye "redirección a una variable"); README, línea de "No verificable": quitar el caso. Residual: una variable que valga `.git/config` sin que el texto lo nombre pisa un archivo recuperable de la sombra.

### T6. Comodines con el texto "pignolo" o "disabled" (`protected-flag`)

**Reglas tocadas:** `protected-flag` (solo la rama de palabra dinámica o con comodín de `checkPathArgs`).

**Archivos:** `plugins/pignolo/lib/git-guard.js` (`checkPathArgs`, una función `flagReachable(word, ctx)`); `tests/git-guard.test.js`, `tests/guard-toggle-paths.test.js`, `tests/guard/must-allow.json`.

**Comportamiento (R-11):** la rama `if (w.dyn || w.glob)` solo corre si el programa está en `WRITE_CMDS`; en `cp`/`mv`/`install`/`ln` mira solo el destino (las fuentes se leen). Dentro, se niega solo si el patrón puede alcanzar `.pignolo/disabled`, `.pignolo/.disabled`, `<home>/.pignolo/disabled` o `<pignoloHome>/disabled` (comparación por segmentos; un tramo variable cuenta como `**`). La rama de rutas literales (`isFlag`, nombre base `.disabled`, borrar `.pignolo`) no cambia. `sed`, `pytest`, `for`, intérpretes y programas desconocidos con un comodín que nombra "pignolo" o "disabled" pasan.

**Tabla**

| Comando | Antes | Después |
|---|---|---|
| `sed -n 1,5p .pignolo/state/*.md` | deny `protected-flag` | pasa |
| `cp .pignolo/tmp/task-*.md /tmp/` | deny `protected-flag` | pasa |
| `pytest tests/test_disabled*` | deny `protected-flag` | pasa |
| `for f in src/disabled-*.tsx; do wc -l $f; done` | deny `protected-flag` | pasa |
| `touch *disabled*` | deny `protected-flag` | pasa (un solo tramo: no llega a `.pignolo/disabled`) |
| `sed -n 1,60p plugins/pignolo/scripts/$(ls plugins/pignolo/scripts \| head -1)` | deny `protected-flag` | pasa |
| PowerShell `Copy-Item .pignolo\tmp\task-*.md ..\out` (la fuente solo se lee) | deny `protected-flag` | pasa |

**Debe seguir negado**

| Comando | Regla (antes y después) |
|---|---|
| `touch .pignolo/.dis*` | `protected-flag` |
| `touch */disabled` | `protected-flag` |
| `cp /dev/null .pig*/.disabled` | `protected-flag` |
| `touch "$D/.pignolo/disabled"` | `protected-flag` |
| PowerShell `Remove-Item .pignolo\.dis*` / `Set-Content .pignolo\.dis* x` | `protected-flag` |
| `touch .pignolo/.disabled` / `rm .pignolo/.disabled` / `mv x.txt .pignolo/disabled` | `protected-flag` |
| `claude plugin disable pignolo` | `protected-flag` |
| `cd .pig*; touch .disabled` / `F=.pignolo/.disabled; echo x > $F` (filas existentes de `must-block.json`) | `protected-flag` |

**Corpus:** los 5 ids `base: block:protected-flag` (ev-026, 027, 089, 109, 178) pasan a `expect: allow` salvo los que otra regla siga negando.

**Rojo:** las filas de "pasa" fallan en la base; se rompe `flagReachable` para que devuelva true siempre (`touch *disabled*` vuelve a negarse) y para que devuelva false siempre (`touch */disabled` pasa y `must-block` lo dice).

**Docs:** spec §11.6 (regla del flag: "solo programas que escriben o borran y solo si el comodín alcanza el flag"); README sin cambio.

### T7. Código inline que llama a git de verdad (`inline-code`)

**Reglas tocadas:** `inline-code`. `catastrophic-delete` y `protected-path` de `inlineDeletes` no se tocan (siguen igual: son parte del núcleo).

**Archivos:** `plugins/pignolo/lib/inline-calls.js` (nuevo: escáner de llamadas a proceso fuera de literales); `plugins/pignolo/lib/git-guard.js` (`inlineCheck`, `analyzeAwk`); `tests/inline-calls.test.js` (nuevo); `tests/guard-structural.test.js` (14 menciones: se revisan una por una), `tests/guard-catastrophic.test.js`, `tests/git-guard.test.js`, `tests/guard/must-allow.json`, `tests/guard/must-block.json`.

**Interfaz:** `inlineCallsGit(text, lang)` devuelve `{ deny: boolean, why }`. Niega si: (a) hay una llamada a proceso FUERA de literales de cadena cuyo primer argumento literal es `git` (`spawn('git'...)`, `execFileSync('git', ...)`, `subprocess.run(['git', ...])`, `os.system('git ...')`) o una cadena de shell que empieza con `git ` o lo trae tras `&&`, `;`, `|` (`execSync('npm test && git stash drop')`); en perl y ruby, backticks, `system`, `exec`, `qx`, `%x` con la misma prueba; (b) hay una llamada a proceso con comando no literal (`execSync(cmd)`, `spawnSync(process.execPath, ...)`) Y el texto nombra git (`mentionsGit`); (c) `inlineDeletes` (como hoy). El escáner recorre el texto salteando literales de cadena (`'`, `"`, backtick, triple comilla de Python) y comentarios (`//`, `#`); si no puede (comillas sin cerrar, plantilla con `${`), usa la búsqueda ingenua de hoy (`SPAWN_RE` + `mentionsGit`) y niega (R-9). Una llamada a proceso con comando literal que no es git (`spawnSync('node', ...)`, `execSync('npm test')`, `subprocess.run(['npm','test'])`) pasa. En awk, `print ... |` cuenta solo fuera de comillas; `system(` y `| getline` siguen negando. `sedExecutes` no cambia.

**Tabla**

| Comando | Antes | Después |
|---|---|---|
| `node -e "const fs=require('fs');let s=fs.readFileSync('README.md','utf8');s=s.replace('use git status','use git status -sb');fs.writeFileSync('README.md',s)"` (el texto solo menciona git) | deny `inline-code` | pasa |
| `node - <<'EOF'` con un cuerpo que lee un archivo y reemplaza una cadena que contiene `spawnSync('git', ['log'])`, y lo reescribe | deny `inline-code` | pasa (la llamada está dentro de un literal) |
| `python3 - <<'EOF'` con `s=s.replace('const x = git','const x = git2')` y `open(p,'w').write(s)` | deny `inline-code` | pasa |
| `node -e "const {spawnSync}=require('child_process'); const r=spawnSync(process.execPath,['-e','console.log(1)'],{encoding:'utf8'});console.log(r.stdout)"` | deny `inline-code` | pasa |
| `node -e "require('child_process').spawnSync('node',['x.js'],{stdio:'inherit'})"` | deny `inline-code` | pasa |
| `node -e "require('child_process').execSync('npm test',{stdio:'inherit'})"` | deny `inline-code` | pasa |
| `python3 -c "import subprocess; subprocess.run(['npm','test'])"` | deny `inline-code` | pasa |
| `awk -F'\|' '{print $2 "\|" $3}' file.txt` | deny `inline-code` | pasa |
| PowerShell `node -e "const fs=require('fs');fs.writeFileSync('a.txt','use git status')"` | deny `inline-code` | pasa |
| medido (ev-069, saneado): `sed -n 13,28p r.md \| awk -F'\|' '{print $2 "\|" $(NF-3) "\|" $(NF-2)}' \| cut -c1-300` | deny `inline-code` | pasa |

**Debe seguir negado** (todas `inline-code` salvo la indicada, antes y después)

| Comando |
|---|
| `node -e "require('child_process').execSync('git reset --hard')"` |
| `node -e "require('child_process').spawnSync('git',['reset','--hard'])"` |
| `node -e "const {execSync}=require('child_process');execSync('git status')"` (llamar a git está negado aunque sea de lectura: no se clasifica) |
| `python -c "import os; os.system('git clean -fdx')"` |
| `node -e "const c=['git','reset','--hard'].join(' ');require('child_process').execSync(c)"` (b) |
| `node -e "require('child_process').execSync('npm test && git stash drop')"` |
| `perl -E 'system("git reset --hard")'` / `ruby -e` con backticks de `git reset --hard` |
| `node -e` con una plantilla de JavaScript (comillas invertidas) que contiene `${require("child_process").execSync("git reset --hard")}`: el escáner no puede tokenizarla y cae a la búsqueda ingenua |
| `awk 'BEGIN{system("git reset --hard")}'` / `sed -n '1e git reset --hard' a.txt` |
| `node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "$TEMP/x"` (borrado calculado) |
| `node -e "require('fs').rmSync(require('os').homedir(),{recursive:true})"` => `catastrophic-delete` |

**Corpus:** los 51 ids `base: block:inline-code`. La auditoría estima ≈ 35 liberados; el resto (6 de borrado calculado y hasta 9 que lanzan procesos y nombran git) sigue negado. El ejecutor clasifica cada una a mano, leyéndola, y escribe `expect` y una razón de una línea ANTES de correr (no se llena corriendo el código). Se suman a `must-allow.json` las filas de "pasa" y a `must-block.json` las de "debe seguir negado" que falten.

**Tests nuevos (`inline-calls.test.js`):** una tabla de ≈ 12 textos para el escáner (llamada fuera de literal con git literal => deny; la misma dentro de una cadena => pasa; comentario `//` con la llamada => pasa; comillas sin cerrar => cae a ingenua y niega; plantilla con `${` => niega; Python triple comilla con la llamada adentro => pasa; Ruby backticks fuera de literal => deny).

**Rojo:** las filas de "pasa" fallan en la base; la fila `execSync('git status')` se muestra rompiendo (a) para que solo mire `spawn` (pasa y el test lo dice); la de plantilla con `${`, haciendo que el fallback devuelva false.

**Docs:** spec §11.6, punto "Código inline (I1)": "con una API de borrado..." queda y se agrega que `inline-code` por llamada a proceso solo niega si llama a git (literal o no literal con git en el texto); README, línea de "No verificable": `node -e`/`python -c` "que llaman a git". Residual: un script inline que arma el comando por partes pasa (hoy pasa igual si está en un archivo).

### T8. `case` y `for` en el parser; lo que no parsea (`unparseable`)

**Reglas tocadas:** `unparseable` (se angosta y se arregla el parser). Prepara la expansión de `for` que usan T9 y T10.

**Archivos:** `plugins/pignolo/lib/shell-parse.js`; `plugins/pignolo/lib/git-guard.js` (`script`, ramas de `ParseError`); `tests/shell-parse.test.js`, `tests/guard-structural.test.js`, `tests/git-guard.test.js`, `tests/guard-powershell.test.js`, `tests/guard/must-block.json`, `tests/guard/must-allow.json`.

**Interfaz**
- `parseBash` entiende `case WORD in PATRON) lista ;; ... esac`: los patrones no son comandos, el cuerpo de cada rama es una lista de comandos separados por `;;` o `;`. Las filas existentes de `must-block.json` (`case x in x) git reset --hard;; esac` y la de `g''it`) cambian de regla: `unparseable` => `reset-hard`.
- Cada comando que sale de `parseBash` lleva `loops`: lista (de afuera hacia adentro) de `{ name, values }` de los `for NAME in ...; do ... done` que lo contienen; `values` es la lista de valores si todas las palabras de la lista son literales (sin `dyn`; un `*` es un valor con comodín, que se evalúa como tal) y `null` si no (`$(ls)`, `$f`, `"$@"`). Un `for` sin `in` o con la lista dinámica da `values: null`.
- `script()` evalúa un comando con `loops` una vez por cada combinación de valores (tope: 32 combinaciones; si se pasa, `values: null` para ese comando), con la variable asignada al valor en `st.vars`; los valores con `..`, `.git`, comodines o que empiezan con `-` se evalúan tal cual (el valor expandido pasa por las mismas reglas: `for b in --force x; do git push origin $b; done` da `push-force`).
- Si el parseo igual falla: se niega (`unparseable`) solo si el texto nombra git (`mentionsGit`), un borrador (`TEXT_DELETE`) o un sumidero (R-15); si no, pasa. El conjunto catastrófico por texto (`TEXT_DELETE` + `TEXT_TARGET`) sigue igual y rige siempre. `ps-unavailable` no cambia.

**Tabla**

| Comando | Antes | Después |
|---|---|---|
| `for x in a.test.js b.test.js; do case $x in *.test.js) echo t;; *) echo o;; esac; done` | deny `unparseable` | pasa |
| `case "$1" in start) npm start;; stop) npm stop;; esac` | deny `unparseable` | pasa |
| `f=$(grep -rl "x" tests 2>/dev/null \| head -3); for x in $f; do case $x in *.js) wc -l $x;; esac; done` (medido, ev-006 saneado) | deny `unparseable` | pasa |
| `echo "abc` (comilla sin cerrar, sin git, borrador ni sumidero) | deny `unparseable` | pasa |
| `case x in x) git reset --hard;; esac` | deny `unparseable` | deny `reset-hard` |
| `case x in x) g''it reset --hard;; esac` | deny `unparseable` | deny `reset-hard` |

**Debe seguir negado**

| Comando | Regla (antes y después) |
|---|---|
| `rm -rf "$(` | `catastrophic-delete` (texto no analizable) |
| `git status "` / `git reset --hard "` | `unparseable` |
| PowerShell `git status && git reset --hard` (PowerShell 5.1 no entiende `&&`) | `unparseable` |
| `eval "$(` | `unparseable` (el texto nombra `eval`) |
| `for b in --force x; do git push origin $b; done` | `push-force` desde T8 (antes: `dynamic-argument`) |

**Tests nuevos:** parser: 8 filas (`case` con varios patrones y `\|`, `case` anidado en `for`, `;;&` no soportado => `ParseError`, `esac` suelto => `ParseError`, `for` con lista literal => `loops.values`, lista dinámica => `null`, `for` anidado, tope de 32 combinaciones). Guardia: las filas de la tabla; el for-expansión con valores peligrosos (`for d in a ../..; do rm -rf "$d"; done` queda en `catastrophic-delete`: lo cierra T9, acá solo se comprueba que el valor expandido llega a la regla con la variable sustituida).

**Corpus:** los 4 ids `base: block:unparseable` (ev-006, 055, 073, 099). La auditoría estima ≈ 4 de 6 liberados entre `unparseable` y `dynamic-command`; los que nombran `node -e`/`python -c` en el texto no parseable siguen negados por el fallback (R-15). Se clasifican a mano antes de correr.

**Rojo:** las filas de `case` fallan en la base; el fallback se muestra rompiéndolo para que siempre niegue (`echo "abc` vuelve a negarse) o para que nunca niegue (`git status "` pasa).

**Docs:** spec §11.6: "parseo fallido" deja de ser fail-closed por estructura: "si el parseo falla, se niega solo si el texto nombra git, un borrador o un sumidero"; README, línea de "No verificable". `docs/gaps.md`: si el parser no delimita bien algún caso, se anota.

### T9. Borrados de temporales (`catastrophic-delete`)

**Reglas tocadas:** `catastrophic-delete` (solo el disparador; el núcleo no se toca: `.git`, `~`, `~/.pignolo`, la raíz, `*` suelto y `.claude` entero siguen negados). `protected-path` no se toca.

**Archivos:** `plugins/pignolo/lib/git-guard.js` (`recordAssignments`, `isCatastrophicOperand`, `analyzeFind`, `pipedPaths`, el tratamiento de `$_` en PowerShell); `tests/guard-catastrophic.test.js`, `tests/guard-powershell.test.js`, `tests/guard/must-allow.json`, `tests/guard/must-block.json`.

**Comportamiento (R-12):** (a) mktemp; (b) variable de `for` (usa los `loops` de T8); (c) comodín con prefijo literal; (d) `find` bajo temporales; (e) PowerShell con `$_`. Todo el resto, igual.

**Tabla**

| Comando | Antes | Después |
|---|---|---|
| `f=$(mktemp) && rm -f "$f"` | deny `catastrophic-delete` | pasa |
| `f=$(mktemp) && mv "$f.bak" "$f"` | deny `catastrophic-delete` | pasa |
| `D=$(mktemp -d) && rm -rf "$D"` | deny `catastrophic-delete` | pasa |
| `T=$(mktemp -d) && touch $T/a.bak && find "$T" -name "*.bak" -delete` | deny `catastrophic-delete` | pasa |
| `msg=$(mktemp) && cat > $msg <<'EOF'` + cuerpo + `EOF` + `git commit -q -F $msg && rm -f $msg` (medido, ev-079) | deny `catastrophic-delete` | pasa |
| `rm -f build-*.log` | deny `catastrophic-delete` | pasa |
| `rm -rf dist-* tmp-*` / `rm -rf node_m*` | deny `catastrophic-delete` | pasa |
| `rm -rf s*` (borra `src/` en la raíz: recuperable; residual declarado) | deny `catastrophic-delete` | pasa |
| `for d in c5-a c5b-b; do rm -rf "$d"; done` | deny `catastrophic-delete` | pasa |
| `cd $TEMP && for d in 3qAp5L 650Mc7; do rm -rf "pignolo-ui-browser-$d"; done` (medido, ev-050) | deny `catastrophic-delete` | pasa |
| `for d in c5b-*; do rm -rf "$d"; done` | deny `catastrophic-delete` | pasa (valor `c5b-*`: prefijo literal) |
| PowerShell `Get-ChildItem $env:TEMP -Directory -Filter 'x-*' \| ForEach-Object { Remove-Item -Recurse -Force $_.FullName }` (medido, ev-018) | deny `catastrophic-delete` | pasa |
| `rm -rf src/*` | pasa | pasa (sin cambio) |

**Debe seguir negado** (todas `catastrophic-delete`, antes y después)

| Comando | Qué prueba |
|---|---|
| `rm -rf .git` / `rm -rf ~` / `rm -rf *` | el núcleo |
| `rm -rf .g*` | prefijo que empieza con punto |
| `rm *.log` | comodín al principio (README: "`rm *.log` en la raíz se niega") |
| `rm -rf */build` | comodín al principio de un segmento |
| `rm -rf s*/..` / `rm -rf s*/.git` | `..` o `.git` después del comodín |
| `rm -rf "$d"` | variable sin `for` |
| `for d in $(ls); do rm -rf "$d"; done` | lista no literal |
| `for d in a ../..; do rm -rf "$d"; done` | un valor sube a la raíz |
| `for d in .git x; do rm -rf "$d"; done` | un valor es `.git` |
| `for d in "*" x; do rm -rf $d; done` | un valor es `*` |
| `f=$(mktemp -p ..); rm "$f"` | mktemp con opción no permitida |
| `D=$(mktemp -d); rm -rf "$D/.."` | `..` tras sustituir |
| `find . -name "*.bak" -delete` / `find . -name "*.pack" -delete` | inicio en la raíz: `find` entra en `.git` |
| `find "$D" -delete` | inicio desconocido |
| PowerShell `Get-ChildItem . \| ForEach-Object { Remove-Item -Recurse -Force $_.FullName }` | raíz no temporal |
| PowerShell `Get-ChildItem $HOME \| ForEach-Object { Remove-Item -Recurse -Force $_.FullName }` | raíz en `~` |

**Corpus:** los 15 ids `base: block:catastrophic-delete` (ev-018, 033, 050, 079, 081, 083, 102, 105, 106, 112, 133, 136, 146, 169, 171). La auditoría estima ≈ 10 de 12 liberados. Se clasifican a mano antes de correr; los que quedan negados llevan su razón (`rm -rf` de un directorio de un repo de prueba, un `cp` con destino calculado, etc.).

**Rojo:** las filas de "pasa" fallan en la base; las de "debe seguir negado" se muestran rompiendo cada pata: (a) que mktemp no excluya `..` (`"$D/.."` pasa), (c) que el prefijo acepte el punto (`.g*` pasa), (d) que `find` mire solo el patrón (`find . -name "*.pack" -delete` pasa), (b) que `for` no revalide el valor (`for d in .git x` pasa).

**Docs:** spec §11.6 (conjunto catastrófico: el glob con prefijo literal que no empieza con punto pasa; mktemp, `for` y `find -delete` en temporales se resuelven); README, sección Guardia, primera viñeta: reemplazar "no se expanden globs: `rm *.log` en la raíz también se niega" por la regla nueva (`rm *.log` se sigue negando; `rm build-*.log` pasa). Registro de riesgo residual: `rm -rf s*` en la raíz.

### T10. Variables en `merge`/`fetch`/`worktree add`; funciones (`dynamic-argument`, `dynamic-command`)

**Reglas tocadas:** `dynamic-argument`, `dynamic-command`.

**Archivos:** `plugins/pignolo/lib/git-guard.js` (`analyzeGit`: la condición `o.dynSlot && DESTRUCTIVE.has(sub)`; `runWords`/`dispatch` para funciones); `tests/git-guard.test.js`, `tests/guard-structural.test.js`, `tests/guard-queue.test.js`, `tests/guard-subagent-main.test.js` (solo se comprueba que no cambian), `tests/guard/must-allow.json`, `tests/guard/must-block.json`.

**Comportamiento**
- Parte a (`dynamic-argument`, R-13): en el hilo principal, la variable al principio de un argumento de `merge`, `fetch` (sin `-u` ni `--update-head-ok`) y `worktree add` no cuenta como `dynamic-argument`. Todo subcomando de `DESTRUCTIVE` fuera de esos tres sigue como hoy. Con `ctx.subagent` nada cambia. La expansión de `for` (T8) hace el resto: `for b in a b; do git merge $b; done` evalúa `git merge a` y `git merge b`.
- Parte b (`dynamic-command`, R-14): una función definida en el mismo comando (`nombre(){ ...; "$@"; ...; }` o `function nombre { ... }`) se analiza por su cuerpo, con `"$@"` / `$@` / `$1` reemplazados por los argumentos de cada llamada `nombre args`. Si el parser no delimita el cuerpo, se deja el `dynamic-command` de hoy y se anota en `docs/gaps.md` (la fila de la fixture queda con `expect` de bloqueo y su razón). La variable literal (`R="node x.mjs"; $R a`) ya pasa en la base: se agrega un test de regresión, sin código.

**Tabla (hilo principal)**

| Comando | Antes | Después |
|---|---|---|
| `for b in feat/a feat/b; do git merge --no-ff $b; done` | deny `dynamic-argument` | pasa |
| `for b in a b; do git push origin $b; done` | deny `dynamic-argument` | pasa (valores literales; `push` común pasa) |
| `git fetch origin "$B"` | deny `dynamic-argument` | pasa |
| `git worktree add "$J/wt" main` | deny `dynamic-argument` | pasa |
| `git merge --no-ff "$B" -m "merge: $B"` | deny `dynamic-argument` | pasa |
| `git worktree add "$J/wt-$N" -b "task/$N" main` | deny `dynamic-argument` | pasa |
| medido (ev-176, saneado): `git status --short \| head -3; for b in plan/a plan/b; do git merge --no-ff $b -m "merge: $b" 2>&1 \| tail -1; done; git log --oneline -4` | deny `dynamic-argument` | pasa |
| `run(){ "$@"; }; run git status` | deny `dynamic-command` | pasa (si el parser delimita el cuerpo) |
| `R="node x.mjs"; $R tests/a.test.mjs` | pasa | pasa (regresión) |
| PowerShell `$exe = 'node'; & $exe --version` | pasa | pasa (regresión) |
| `git branch "task/$ID" main` / `git tag "v$N"` / `git add "$F"` / `git commit -m "$M"` | pasa | pasa (sin cambio) |

**Debe seguir negado**

| Comando | Regla (antes y después) |
|---|---|
| `git push origin $B` / `git checkout $B` / `git reset "$R"` / `git rm $F` / `git config $K $V` | `dynamic-argument` |
| `git clean $F` | `clean` |
| `git stash $A` | `stash` (o `dynamic-argument`: el test mira solo la decisión) |
| `git fetch -u origin "$B"` | `dynamic-argument` |
| `git branch -D "$B"` | `dynamic-argument` |
| `git branch "$NAME" main` / `git tag "$T"` (variable al principio) | `dynamic-argument` (R-13: puede valer `-D`) |
| `for b in --force x; do git push origin $b; done` | `push-force` |
| `run(){ "$@"; }; run git reset --hard` | `reset-hard` |
| `$R "$S" a` (R sin asignar) | `dynamic-command` |
| subagente (`subagent: true`): `git fetch origin "$B"` / `git merge --no-ff "$B"` | `dynamic-argument` (sin cambio para roles) |

**Corpus:** ids `base: block:dynamic-argument` (ev-132, 173, 175, 176) y `base: block:dynamic-command` (ev-007, 148). La auditoría estima ≈ 3 de 5 y ≈ 4 de 6 junto con `unparseable`. ev-132 es de un subagente: sigue negado.

**Rojo:** las filas de "pasa" fallan en la base; la de subagente se muestra haciendo que el relajamiento ignore `ctx.subagent` (`git fetch origin "$B"` pasa para un subagente y el test lo dice); `git branch "$NAME" main` rompiendo la lista para incluir `branch`.

**Docs:** spec §11.6 (lista de `dynamic-argument`: "variable en ref o ruta de `merge`, `fetch` y `worktree add`, en el hilo principal"); README, línea de "No verificable".

### T11. Lo recuperable pasa con la instantánea tomada antes (D-G2); plantilla

**Reglas tocadas:** `checkout-path`, `restore`, `stash`, `git-C` (se angostan); regla nueva `snapshot-required` (T2). No se tocan `checkout-force`, `switch-force`, `reset-hard`, `clean`, `rm-force`, `read-tree-update`, `checkout-index-force`, `worktree-remove-force`.

**Archivos:** `plugins/pignolo/lib/git-guard.js` (`gitRulesBase`: ramas `checkout`, `restore`, `stash`; `analyzeGit`: `-C` literal; función `literalFiles`); `plugins/pignolo/hooks/handlers/guard.js` (`snapshotDirs`); `plugins/pignolo/templates/permissions.json`; `tests/permissions.test.js`; `tests/guard-recoverable.test.js` (nuevo: repos reales con `makeRepo`); `tests/git-guard.test.js`, `tests/guard-git-rules.test.js`, `tests/guard/must-block.json`, `tests/guard/must-allow.json`.

**Comportamiento (R-3 a R-6)**
- Fixture de los tests: repo con `a.txt` (archivo), `sub/b.txt` (la carpeta `sub`) y un hermano `../wt` (otro repo con `a.txt`).
- `checkout`: pasa con `'required'` si hay `--` y todos los argumentos tras él son archivos literales (R-4), con o sin `<ref>` antes, con o sin `--ours`/`--theirs`; o sin `--`, si todos los posicionales existen en disco como archivo. `-p`, `--patch`, `--pathspec-from-file`, `.`, carpetas, comodines, variables, sin ruta (`checkout --ours`) y un `<ref> <ruta>` sin `--` donde la ruta no existe como archivo siguen en `checkout-path`.
- `restore`: pasa con `'required'` con archivos literales, con `--source`, `--staged --worktree`, `--ours`/`--theirs`; `--staged` solo ya pasaba. `restore .`, `restore -- .`, `restore sub`, `restore :/`, `-p` siguen en `restore`.
- `stash` (R-5).
- `git -C <dir literal>` (R-6): el directorio se resuelve contra el cwd real; las reglas de `checkout`/`restore`/`stash` se evalúan sobre él (la comprobación de archivo y carpeta mira ese directorio); `checkout <rama>` ya no cae en `git-C`; `snapshotDirs` lleva ese directorio. `-C "$X"`, `--git-dir`, `--work-tree` siguen en `git-C` si el subcomando es `checkout` con posicionales. Para `protectsRefs`/`touchesMain` se sigue pasando el `st` real (el `inner` es solo para las reglas de archivos).
- Plantilla (R-16): ver la lista en §4. `permissions.test.js`: `BLOCK_SAMPLES.stash` => `git stash drop`; `checkout-path` => `git checkout -- .`; `restore` => `git restore .`; se sacan de `SAMPLE_OVERRIDES` las entradas de la familia quitada; `NOT_EXPRESSIBLE['snapshot-required']`.

**Tabla (con cwd del repo de prueba; PowerShell donde se indica)**

| Comando | Antes | Después |
|---|---|---|
| `git checkout -- a.txt` | deny `checkout-path` | pasa, `required` |
| `git checkout HEAD -- a.txt` | deny `checkout-path` | pasa, `required` |
| `git checkout main -- a.txt sub/b.txt` | deny `checkout-path` | pasa, `required` |
| `git checkout a.txt` (existe) | deny `checkout-path` | pasa, `required` |
| `git checkout --ours -- a.txt` / `git checkout --theirs a.txt` | deny `checkout-path` | pasa, `required` |
| `git checkout a.txt && sed -i 's/x/y/' a.txt` (medido, ev-000 saneado) | deny `checkout-path` | pasa, `required` |
| `git restore a.txt` / `git restore -SW a.txt` / `git restore --staged --worktree a.txt` | deny `restore` | pasa, `required` |
| `git restore --source=HEAD~1 a.txt` / `git restore --ours a.txt` | deny `restore` | pasa, `required` |
| `git stash` / `git stash push` / `git stash push -- a.txt` | deny `stash` | pasa, `required` |
| `git stash pop` / `git stash apply` / `git stash apply stash@{0}` / `git stash -u` | deny `stash` | pasa, `required` |
| `git stash push -m wip` | pasa | pasa, `before` (sin condición nueva, R-3) |
| `git -C ../wt checkout -- a.txt && git -C ../wt status --short` (medido, ev-164 saneado) | deny `git-C` | pasa, `required` en `../wt` |
| `git -C ../wt checkout main` | deny `git-C` | pasa, `before` |
| `git -C ../wt checkout a.txt` | deny `git-C` | pasa, `required` en `../wt` |
| `cd ../wt && git stash -q && node --test tests/a.test.js 2>&1 \| tail -1; git stash pop -q` (medido, ev-072 saneado) | deny `stash` | pasa, `required` |
| PowerShell `git checkout -- a.txt` / `git restore a.txt` / `git stash pop` | deny | pasa, `required` |

**Debe seguir negado**

| Comando | Regla (antes y después) |
|---|---|
| `git checkout -- .` / `git checkout .` / `git checkout HEAD~1 -- .` | `checkout-path` |
| `git checkout -- sub` / `git checkout -- sub/` | `checkout-path` |
| `git checkout -- '*.js'` | `checkout-path` (git expande pathspecs aunque estén entre comillas) |
| `git checkout -p` / `git checkout --patch -- a.txt` / `git checkout --pathspec-from-file=list.txt` | `checkout-path` |
| `git checkout main src/x.js` (la ruta no existe en el fixture) / `git checkout lib/nonexist.js other.js` | `checkout-path` |
| `git checkout -- $F` | `checkout-path` (la palabra dinámica no es literal) |
| `git checkout -f` | `checkout-force` |
| `git switch -f main` | `switch-force` |
| `git restore .` / `git restore -- .` / `git restore sub` / `git restore :/` / `git restore -p a.txt` | `restore` |
| `git stash drop` / `git stash drop stash@{0}` / `git stash clear` | `stash` |
| `git stash save x` / `git stash -a` / `git stash branch x` | `stash` |
| `git stash apply $S` | `stash` o `dynamic-argument` (el test mira la decisión) |
| `git -C "$D" checkout -- a.txt` | `git-C` |
| `git reset --hard HEAD~1` / `git clean -fd` / `git worktree remove --force ../wt` | `reset-hard` / `clean` / `worktree-remove-force` |

**Handler (tests con la instantánea inyectada y real)**
- Instantánea que lanza error en `git checkout -- a.txt` => exit 2, razón `snapshot-required`; con `partial` => exit 2; con `null` (árbol limpio) => exit 0; con `PIGNOLO_CANARY=1` => exit 2.
- Camino real: en un repo con `a.txt` modificado sin commitear, `git checkout -- a.txt` pasa y la versión previa del archivo está en `refs/pignolo/wip` (se recupera con el procedimiento del README); `git -C ../wt checkout -- a.txt` deja la instantánea del repo `../wt`, no la del cwd.
- Guardia apagada (`PIGNOLO_DISABLED=1`): `git checkout -- a.txt` pasa sin instantánea (como todo lo demás).
- Roles: las suites de `tests/guard-subagent-main.test.js` y `tests/guard-queue.test.js` pasan sin tocar una fila; un subagente en `main` con `git checkout -- a.txt` pasa (no es una regla de rol) y con `git stash pop` también.

**Plantilla (tests de `permissions.test.js`)**
- Todas las reglas deny restantes siguen negadas por la guardia en modo autónomo con su muestra.
- Cada regla de clase deny de la guardia tiene una entrada de plantilla o una razón declarada.
- Entran como filas: `Bash(git checkout -- .)`, `Bash(git checkout * -- .)`, `Bash(git restore .)`, `Bash(git restore -- .)`, y sus gemelas de PowerShell; se mantienen `git stash drop *` y `git stash clear *`.

**Corpus:** ids `base: block:checkout-path` (16: ev-000, 003, 020, 024, 035, 049, 064, 067, 092, 094, 104, 126, 139, 141, 143, 177), `block:restore` (ev-165), `block:git-C` (ev-101, 162, 164) y `block:stash` (14: ev-005, 016, 021, 052, 063, 066, 072, 077, 084, 085, 116, 118, 128, 129). La auditoría estima ≈ 19 de 21 y 14 de 14. Los que siguen negados llevan su razón (por ejemplo `git checkout lib/a.mjs scripts/b.mjs` con archivos que la fixture marca como existentes pasa; con `files` vacío no). La fixture marca en `files` los archivos de cada `checkout`/`restore` sin `--` que en la sesión original existían.

**Rojo:** las filas de "pasa" fallan en la base; se muestra rompiendo `literalFiles` para que acepte `.` (`git checkout -- .` pasa y el test lo dice) y para que no mire el disco (`git checkout -- sub` pasa); se rompe `guard.js` para que ignore el fallo de la instantánea en `'required'` (el test de error falla); se rompe la expansión del `-C` para que tome la instantánea del cwd (el test del `../wt` falla); se saca una entrada de plantilla y el test de cobertura falla.

**Docs:** spec §8.1 (plantilla: sale la familia de texto, stash y checkout de archivos; entran las de árbol entero), spec §11.6 (la línea "*Reglas de git.* deny (pierde trabajo sin commitear): stash/pop/drop sin etiqueta..." => "pasan con la instantánea tomada antes: checkout y restore de archivos literales, stash/pop/apply; siguen negados drop, clear, y las formas de árbol entero o no literales (decisión del autor, 2026-10-02, D-G2)"), README (viñeta "Git"), `docs/gaps.md`. Registro de riesgo residual: la instantánea guarda el árbol de trabajo, no el índice (un cambio en stage y distinto en el árbol pierde la versión del stage con `checkout HEAD -- f`); lo que se crea y se deshace en la misma línea no tiene instantánea; el stash es común a los worktrees.

### T12. Versión 0.16.0, CHANGELOG, spec, README, riesgo residual

**Archivos:** `plugins/pignolo/.claude-plugin/plugin.json` (0.14.1 => 0.16.0); `CHANGELOG.md`; `docs/specs/2026-09-26-pignolo-v1-design.md`; `README.md`; `tests/guard/residual-risk.md`; `docs/STATE.md`; `docs/gaps.md`.

**Contenido**
- CHANGELOG, entrada `## 0.16.0 — 2026-10-0x` arriba de 0.14.1 (0.15.0 la usa otra rama: al integrar puede haber un conflicto de orden en este archivo; se resuelve conservando las dos entradas). Secciones: "Pasan ahora" (por regla), "Siguen negando" (los vecinos peligrosos), "Plazo del launcher", "Instantánea", "Plantilla", "Decisiones del autor (D-G1 a D-G4)", "Límites declarados".
- Spec: las ediciones que cada tarjeta dejó anotadas más el principio (texto del autor, §3) al principio de §11.6, con su fecha; se agrega la frase de la auditoría "una regla que frena más de dos veces por sesión sin haber evitado un daño se angosta o se saca" como criterio de §15 si el autor la confirma (no se agrega sin su OK: queda en §9).
- `residual-risk.md`: filas nuevas (cada una con el comando y por qué pasa): `rm -rf s*` en la raíz, `node -e` que arma el comando por partes, `bash x.sh`/`npm run clean` sin instantánea, `git merge "$B"` con `B=--abort`, `stash pop` de otro worktree, `checkout HEAD -- f` con cambios en stage, un `find` bajo temporales con rutas calculadas. El test `the residual-risk register names every audit command that still passes` suma esas filas.
- `docs/STATE.md`: el estado y la decisión del 2026-10-02; `docs/gaps.md`: G22 y G42 parcialmente cerrados, G-guardia-1, y los puntos de §9.

**Rojo:** el test de manifiesto (`tests/manifest.test.js`) falla si la versión de `plugin.json` y la entrada superior del CHANGELOG no coinciden; el registro de riesgo residual falla si una fila nueva no está en la tabla.

### T13. Medir: los 181 con el código nuevo y el costo por comando

**Archivos:** `tests/guard-medidos.test.js` (se completa); `tests/guard/medidos.json` (el `expect` final); `tests/bench/guard-cost/run.js` (nuevo, no corre con `npm test`); `tests/evals/RESULTS-guardia-costo.md` (nuevo: la ficha primero); `docs/benchmarks.md` (una fila).

**Parte A: los 181 con el código nuevo (corre con `npm test`)**
- Cada fila ya tiene su `expect` (lo fue moviendo cada tarjeta). El test evalúa los 181 con el código final y exige: cada fila da su `expect`; el total de bloqueadas es exactamente el de las filas con `expect: block*`; y esa lista de ids bloqueados es la de un archivo escrito a mano (`tests/guard/medidos-siguen-negados.md`: id, regla, una línea de por qué sigue negado) que el ejecutor escribe leyendo las filas, antes de correr, tomando como punto de partida las estimaciones de la auditoría (§4: ≈ 155 de 181 liberados, o sea ≈ 26 siguen negados; con la base de la fixture, R-17). La diferencia entre lo escrito y lo corrido se investiga fila por fila y se explica en el informe: no se ajusta el archivo para que coincida.
- Se imprime: bloqueadas antes (base, de la fixture) y después, por regla; cuántas de las que siguen negadas lo estaban por `hidden-code`, `pignolo-protected-refs`, `quoted-substitution` (esperadas) y cuántas por borrado calculado o llamada real a git (esperadas); cualquier regla de la lista "no tocar" que haya cambiado de veredicto en alguna fila es un fallo.
- Segunda mitad del test: las 15 filas con `base: allow` (13 de plazo) siguen pasando.

**Parte B: costo por comando del hook, antes y después (se corre a mano, con la máquina quieta)**
Sigue `docs/protocolo-de-pruebas.md`. La ficha se escribe y se commitea en `RESULTS-guardia-costo.md` ANTES de la primera corrida, con:
1. Pregunta e hipótesis: "D-G4 baja el costo del hook `guard` en un comando que no descarta (`ls`, `git status`, `git add`, `node --version`) al menos 40 % de mediana y de 4–6 procesos `git` a 0; en un comando que descarta (`rm a.txt`) no lo sube más de 10 %; D-G3 no cambia nada con la máquina quieta".
2. Variable que cambia: el commit del plugin (brazo A: la base `core/guard-sin-confirmar-push` 62bde34; brazo B: la rama final). Fijo: máquina, repo de prueba (un repo temporal de ~200 archivos con 5 modificados), el payload, la versión de node, git, sin sombra sembrada (corrida 1) y con la sombra sembrada por `scripts/shadow-seed.js` (corrida 2).
3. Brazos A y B, intercalados (A, B, A, B...).
4. Métricas: milisegundos de pared del launcher `guard` (`spawnSync(process.execPath, [launcher, 'guard'])` con el payload en stdin, como `runLauncher` de `tests/helpers.js`); procesos `git` por comando (variable de entorno `GIT_TRACE2_EVENT=<archivo>` en el entorno del hook: se cuentan los eventos `version`, uno por proceso git); procesos `node` por comando (se leen de `hooks.json` y del atajo de `lib/hook-fastpath.js`: 4 launchers por Bash en los dos brazos; no cambia en este plan, queda anotado para la auditoría §7.4).
5. Comandos (cada uno con su clase): `ls` (lectura), `git status` (lectura de git), `git add a.txt` (neutro), `node --version` (neutro, no es de git), `rm a.txt` (descarta), `git checkout -- a.txt` (D-G2, solo brazo B: en A se niega y no hay instantánea que medir), PowerShell `git status` (lectura, +parseo).
6. Repeticiones: 10 por brazo y por comando (cada corrida cuesta décimas de segundo y ningún token).
7. Regla de decisión: la mejora cuenta si supera el umbral de la hipótesis Y los rangos (mín–máx) de A y B no se pisan; si se pisan, "sin diferencia demostrada" y se decide por lo más simple. Se informa mediana y rango por brazo y comando; nunca un solo número.
8. Presupuesto: ninguno en USD; unos 10 minutos de máquina. Se anota cuántos agentes más había en la máquina (cero) y la carga.
- Amenazas a la validez (en el informe): una sola máquina y un solo repo de prueba; la instantánea con sombra sembrada y sin sembrar; los tiempos de PowerShell dependen del arranque en frío; nivel de evidencia E2 (una corrida por brazo y comando, con repeticiones).

**Rojo:** la parte A falla si se cambia a mano un `expect` o si se rompe una regla de las tarjetas anteriores. La parte B es una medición, no un test: su "rojo" es que la ficha esté commiteada antes de la primera corrida (se muestra con `git log`).

**Docs:** `docs/benchmarks.md`: una fila con el resultado y el nivel; spec §11.6: el costo medido real en lugar de "0,25–0,35 s por hook".

## 8. Estimación y recorte

**Pruebas nuevas (estimación):** ≈ 60 bloques `test()` nuevos (T1: 5, T2: 6, T3: 9, T4: 3, T5: 3, T6: 3, T7: 6, T8: 5, T9: 4, T10: 4, T11: 8, T12: 1, T13: 3) y ≈ 270 filas escritas a mano en tablas, más las 181 filas de la fixture. Cambian de lugar unas 20 filas de los corpus existentes (`stash`, `checkout-path`, `restore`, `unparseable` por `case`) y se revisan a mano las 14 menciones de `inline-code` de `tests/guard-structural.test.js`.

**Esfuerzo (estimación, supuesto S, no medido):** tamaños S ≈ 30 mil tokens del ejecutor, M ≈ 70 mil, L ≈ 130 mil: 3 S + 5 M + 5 L ≈ 1,1 millones de tokens de ejecutor sonnet en serie (T1, T2, T6, T10 y T13 en M; T3, T7, T8, T9 y T11 en L; T4, T5 y T12 en S), unas 8 a 10 horas de pared. Más una auditoría previa del plan en opus (≈ 150 mil tokens, §10) y una revisión opus final con una pasada de arreglos (≈ 250 mil). Un solo ejecutor en serie, como pide CLAUDE.md.

**Qué se recorta primero, en este orden, si hay que achicar** (cada paso deja la suite verde y el producto coherente):
1. T10 parte b (funciones definidas en el mismo comando): 1 a 2 filas medidas.
2. T9 parte (e) (PowerShell con `$_.FullName`): 2 filas medidas; PowerShell sigue negando como hoy.
3. La expansión de `for` (T8 `loops`, T9 b, parte de T10): es lo que más parser toca; libera ≈ 5 filas medidas. Sin ella, `for d in a b; do rm -rf "$d"; done` y `for b in a b; do git merge $b; done` siguen negados.
4. `git -C` dentro de D-G2 (R-6): 3 filas medidas.
5. El fallback de texto de `unparseable` (T8): se deja solo `case`.
6. La parte B de T13 con la sombra sembrada (se mide solo sin sembrar) y el brazo de PowerShell.

**No se recorta nunca:** T1 (la red), T2 (D-G2 la necesita), T3 (D-G3), el núcleo de T11 (checkout, restore y stash de archivos) con la plantilla alineada (sin eso la capa 1 niega lo que la guardia deja pasar y D-G2 no sirve), T12 y la parte A de T13.

## 9. Pendiente del autor

No se decidió y el plan no lo toca:

- `git branch -d` sin confirmación (y `-D` con chequeo): `branch-delete`, y la plantilla (`Bash(git branch -d *)` en ask).
- `*navigate*` en el ask de MCP de la plantilla.
- `--force-with-lease` sobre la rama propia de la tarea (`push-force`).

Además, el plan encontró cuatro puntos de la auditoría que ninguna decisión cubre y que quedan fuera:

- Cortar el plazo en cuanto hay un veredicto `allow` y respaldar después (auditoría §7, punto 1): D-G3 solo cubre el plazo vencido antes de que haya veredicto.
- Un solo proceso `node` por evento para `guard`, `private-reads`, `scope-gate` y `plan-audit-gate` (auditoría §7, punto 4): 4 arranques de node por cada Bash; la medición de T13 lo deja cuantificado.
- Los ajustes técnicos de la auditoría §8 que no están en sus cambios 1 a 9 (`-B`/`-C` sobre una rama inexistente en `ref-move`, `subagent-main` solo en el repo del proyecto, las lecturas de `places.js where`, `config-write` por la lista de claves protegidas, `git-shell` con `-x` literal).
- Agregar a la spec la frase de la auditoría "una regla que frena más de dos veces por sesión sin haber evitado un daño se angosta o se saca" (§9 de la auditoría): el principio sí es del autor y entra; la regla de las dos veces espera su OK.

## 10. Para la auditoría previa

Las cinco preguntas que un auditor (opus, con acceso al código de la base) debe atacar antes de ejecutar. Para cada una, debe producir comandos concretos (bash y PowerShell) que lo rompan, no opiniones.

1. **¿Algún comando destructivo llega a `allow` por una forma relajada?** Atacar, en este orden: la expansión del `for` (valores que se vuelven peligrosos al sustituirse, listas con llaves `{a,b}`, valores con comillas o espacios, `for` anidados que superan el tope de 32), `mktemp` (opciones, plantillas con `..` o con `/`, `$(mktemp)` concatenado), el comodín con prefijo literal (nombres cortos 8.3, `rm -rf s*` con cwd desconocido tras un `cd` que pudo fallar, `rm -rf s*/../..`), `find` bajo temporales (un temporal que sea un enlace a la raíz, `-L`), el destino dinámico de una redirección (`> "$D"` con `D=.git/config` asignado en otro comando), el escáner de cadenas del `inline-code` (comillas mal contadas, `eval` dentro de la cadena, `Function()` o `vm.runInNewContext` que no son llamadas a proceso), `merge`/`fetch` con variables y los límites de R-13. Para cada fallo: el comando, la regla que debía atraparlo y por qué no.
2. **¿La polaridad de D-G4 (lista cerrada de lo que descarta) deja sin instantánea un comando que pierde trabajo?** Recorrer cada camino que llama a `analyze` y a `runWords` (envolturas, `bash -c`, `eval`, `cmd /c`, `Start-Process`, `powershell -Command`, `find -exec`, `xargs`, `.Delete()`, `ForEach-Object -MemberName Delete`, `git` con alias, funciones del mismo comando) y comprobar que el indicador `discard` llega a `ctx` y que lo no clasificable da `'before'`. Buscar un comando de la lista de la auditoría A.1/A.2 (cada regla de pérdida de trabajo) que dé `'none'`. Evaluar si dejar sin instantánea a `node x.js` y `npm run clean` es aceptable frente a la promesa del README ("los borrados que no pasan por git solo quedan cubiertos por las instantáneas previas").
3. **¿El clasificador de solo lectura de D-G3 deja pasar algo que escribe, borra o ejecuta?** Atacar la lista de programas y de subcomandos de git (opciones que escriben: `--output`, `-o`, `--textconv`, `-O`, `--exec`; `core.pager` y `core.fsmonitor` en el repo; `git diff` con un driver externo en `.gitattributes`; `git grep -O`; `find` con `-fprint`/`-fls`; `sort -o`; `rg --pre`; `column`, `tr`, `cut` con redirecciones; `cat` de un FIFO); la forma en que `parseBash` marca `dyn` (¿se escapa un `$'...'`, un `${x:-y}`, un `$((...))`?); y el texto de PowerShell (alias, `-Path` con comodines que borran, comillas dobles con `$`). Probar también que `private-reads` y `plan-audit-gate` no heredan el pase, y que `PIGNOLO_DEADLINE_MS` no se puede usar para subir el plazo ni lo toma un `env` del proyecto del usuario sin querer.
4. **¿La instantánea previa de D-G2 es una garantía real o solo una apariencia?** Casos: la instantánea guarda el árbol, no el índice; los archivos ignorados no se guardan; un `partial`; la instantánea del `-C` (¿se toma realmente en ese directorio y en su repo, o en el cwd?); un `checkout` que sigue a un `rm`, a un `sed -i` o a un `>` en la misma línea (¿qué se pierde y qué no?); el `reused` de una instantánea idéntica a la anterior; el modo sin sombra sembrada (el fallback dentro del repo, que devuelve `null` si el árbol está limpio) y la carrera entre la instantánea y el comando; qué pasa si el plazo de 2 s de la instantánea vence en una forma `'required'` (¿deny con razón clara?) y si ese deny reaparece como una molestia nueva medible en la sesión de origen.
5. **¿Se debilitó una regla de rol de subagente, o la capa 1 y la capa 3 quedaron incoherentes?** Comparar, fila por fila, la matriz de `tests/guard-subagent-main.test.js`, `tests/guard-queue.test.js` y `tests/guard-pignolo-plan.test.js` antes y después; revisar que el `-C` resuelto de T11 no cambia el `st` de `protectsRefs`/`touchesMain`; que la expansión del `for` no deja pasar `git merge int/x` a un subagente; que `fetch origin "$B"` sigue negado para un subagente; que `checkLauncher` angostado no abre un hueco para ejecutar el launcher por `xargs node`, `env node`, `npx` o un `source`. Y en la plantilla: sin la familia "el texto menciona git", ¿qué forma que hoy frena la capa 1 queda sin freno si el hook no arranca, y es una de la lista "no tocar" (`git reset --hard` dentro de `bash -c`, `git push --force` dentro de `sh -c`)? Si lo es, hay que decidir con el autor entre dejar esa entrada o aceptar el límite declarado.
