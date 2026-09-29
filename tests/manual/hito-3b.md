# Checklist manual — hito 3b

Correr en una sesión INTERACTIVA de Claude Code, en Windows nativo, con el plugin 0.4.0 instalado (`/plugin marketplace update pignolo`), en un repo de prueba con `.pignolo/project.md` commiteado y `type` y `gates.on-done` definidos. Registrar fecha, versión de Claude Code y resultado de cada punto en `tests/manual/hito-3b-resultados.md`. Sin datos de proyectos reales en el repo de pignolo: si hace falta una cifra, solo la cifra. Los puntos 1, 10 y 11 miden las hipótesis y límites que el código asume sin haberlos visto en vivo.

1. [ ] Con un pedido de una línea: ¿Claude invoca `pignolo:entry` sin que se lo pidan, y `entry` elige `trivial`? Anotar si hubo que nombrarla. Con un pedido ambiguo ("¿qué te parece este archivo?"): `entry` queda en solo lectura y pregunta (D-3b-2). ¿Claude invoca `trivial` o `daily` directo, sin pasar por `entry`? Anotar.
2. [ ] `trivial` completo: commit con trailers, `run.json` borrado al final, `git status` limpio (sin `.pignolo/.gitignore` a la vista).
3. [ ] `daily` completo: worktree en `.pignolo/worktrees/`, `test-writer` sin Bash, rojo mostrado por el orquestador, `implementer` que corre `gate.js --task`, `run.js status` después de cada escritor, merge con pregunta `irreversible`.
4. [ ] Un `implementer` que dice `DONE` sin sello: el handback-gate lo frena, y el orquestador lo trata como `BLOCKED` por `run.js status` aunque el informe diga `DONE`.
5. [ ] Un subagente que intenta `node .../scripts/run.js end`: la guardia lo niega (regla `pignolo-run`).
6. [ ] Riesgo `medium`: dos lentes en paralelo, sus bloques `json` copiados tal cual, ledger guardado en `~/.pignolo/reviews/`.
7. [ ] Riesgo `high` con perfil `max`: 3 refuters, reproducción, un fixer y Judgment Day; resumen con los refutados listados.
8. [ ] Cada mensaje al humano de los puntos 1 a 7 en dos capas, un paso por mensaje y con categoría. Anotar los que fallen.
9. [ ] Abandonar un `daily` a mitad: la skill corre `run.js end` y `Explore` vuelve a pasar.
10. [ ] Un repo con `.pignolo/.gitignore` **ya versionado** sin `tmp/` ni `worktrees/`: tras `run.js start`, ¿`git status` lo muestra modificado y `trivial` sube a `daily`? Probar también `/pignolo:off` y `/pignolo:on` (`toggle.js`) sobre ese archivo. Anotar (límite a del ruling del worktree).
11. [ ] Un repo con vitest o jest (recorren el árbol) y un `daily` abierto con su worktree en `.pignolo/worktrees/`: correr la compuerta en `<main>` (un `trivial` en paralelo o `gate.js` a mano) y mirar si el runner levanta los tests de la worktree. Anotar (límite b del ruling del worktree).
12. [ ] Pedir una revisión con cambios sin commitear en el checkout principal: `review` avisa que cubre solo el último commit y para, sin commitear nada.
