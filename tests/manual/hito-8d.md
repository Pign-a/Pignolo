# Checklist manual — hito 8d (estructura de carpetas)

Sesión real de Claude Code, Windows nativo, en proyectos de prueba sin datos del autor. Cada punto: anotar fecha, versión de Claude Code y resultado; en los que mueven carpetas, hacer antes una copia del proyecto para comparar con `diff -r`. Nada de esto se corrió al cerrar el hito (cuesta tokens de una sesión real y toca archivos de verdad).

1. **Proyecto real nuevo.** Correr `/pignolo:init` con el esqueleto. Abrir `local/` y comprobar que `git status` no la muestra y que un archivo de prueba ahí no se versiona. En un repo público (o sin contestar) comprobar que `docs/references/` no se crea.
2. **Proyecto real existente con `docs/` o `doc/`.** Correr `init`; en el paso Layout elegir `move` en un ítem, mirar la lista de referencias, aplicar con el `--expect` que da el preview, abrir a mano los enlaces markdown reescritos y correr la compuerta del proyecto. Luego `places.js undo --record <registro>` (sin commitear) y comprobar `git status` y un `diff -r` contra la copia; repetir el `undo` y comprobar que no cambia nada.
3. **Junctions reales.** Con un junction a una carpeta de afuera como `docs/` (padre del destino) y otro como la carpeta candidata: `init` se niega o no la ve, y la carpeta de afuera no cambió (comparar antes y después).
4. **Sueltos.** Dejar un `.env` y un `…-design.md` sueltos en la raíz: `/pignolo:status` muestra la línea; `close-session` ofrece mover el `-design.md` y solo avisa del `.env`.
5. **Proyecto con Next.js, Django o Go.** Comprobar que `init` no propone mover `src/`, `app/`, `public/` ni nada de código.
6. **Dos clones del mismo repo.** Confirmar que `local/` no viaja y que la línea `/local/` para el `.gitignore` compartido se muestra y no se escribe sola.
7. **Archivo abierto en otro programa.** Con un archivo de la carpeta a mover abierto sin compartir (un editor, o PowerShell con el archivo abierto): `init` se detiene, dice qué archivo, no sigue y ofrece el undo; cerrar el programa y reintentar o deshacer deja el árbol idéntico. (Los tests automáticos no pueden reproducirlo: Node abre con share-all en Windows.)
8. **Ignorados.** Una carpeta con un `.pdf` ignorado por una regla del `.gitignore` de la raíz (`doc/specs/*.pdf`): `init` se niega a mover y cita la regla. Un `private/` ignorado por una línea de la raíz: `init` solo ofrece adoptarla.
9. **`test-paths` declarado.** Un proyecto cuyo `project.md` ya declara `test-paths: [*spec*]`: `init` dice qué patrón casa los documentos y no mueve; acotar el patrón y repetir.
10. **Mayúsculas y submódulos.** Un repo con `Docs/` en el disco (Windows): `init` se niega a crear `docs/specs/` con `case-collision`. Un repo con un submódulo dentro de la carpeta candidata: se niega con `nested-repo`.
11. **Worktree enlazada.** Correr `init` desde una worktree enlazada con un movimiento: se mueve y escribe en el checkout principal y la nota dice que la worktree conserva su layout hasta actualizarla.
12. **Guardia.** Desde un subagente real, pedirle que ejecute `places.js where spec`: se niega con `Alternativa:`; pedirle que lea el script con `cat` o `grep`: pasa.
