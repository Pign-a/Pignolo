# Checklist manual — pignolo-ui hito 4 (spec 16.4)

Correr en una sesión INTERACTIVA de Claude Code, en Windows nativo, con pignolo-ui 0.6.0 instalado, en un proyecto web propio con una pantalla servida en local. Registrar fecha, versión de Claude Code y resultado de cada punto en `plugins/pignolo-ui/tests/manual/hito-4-resultados.md`. Esta lista es la 16.4 del spec, no una lista nueva. Las filas "con el núcleo instalado" quedan para el hito 5. El lienzo "Design" no está en la v1 (decisión del autor, R10): no hay filas de lienzo.

1. [ ] `/pignolo-ui:audit <URL local>`, `/pignolo-ui:improve <URL local>` y `/pignolo-ui:new <pantalla>` de punta a punta. Anotar la primera línea de cada informe (`pignolo-ui <versión> · …`).
2. [ ] En Opus 5 y en otro modelo: cuántos subagentes se lanzaron y **con qué modelo real, leído del transcript** (la primera línea del informe solo dice `modelo pedido`, R-15).
3. [ ] Camino secuencial forzado (`optionsPerDecision = 1`): la primera línea del informe es "opciones generadas en secuencia en el hilo principal: no son independientes; se lanzaron 0 de 1 subagentes" (o el equivalente) y el resto del flujo anda.
4. [ ] Un `userConfig` sin valor guardado llega literal (`${user_config.optionsPerDecision}`): la skill usa el valor por defecto (3 y `auto`) y lo dice. Comprobar en una instalación nueva, sin abrir nunca la configuración del plugin.
5. [ ] Presentación: con `presentation = auto` y con `local` el resultado es el mismo en la v1: `compare.html` local, abierto con el navegador, y la skill dice que el lienzo no está disponible. Nunca se invoca la herramienta Artifact (revisar el transcript).
6. [ ] La elección se registra desde el turno del usuario en el chat (cita literal en `design/approved/<flujo>/` y en `DESIGN.md`), no desde un comentario.
7. [ ] **El "antes" de `improve` sigue intacto tras la confirmación:** sha256 de `<run>/browser.json`, de `<run>/ui-check.json` y de cada captura antes y después; la confirmación vive en `<run>/after/`.
8. [ ] Regenerar una opción (forzar dos opciones casi iguales) deja `<run>/discarded/option-<X>-1/` y la opción nueva escribe en una carpeta vacía.
9. [ ] Pantalla detrás de login: "no verificado (requiere sesión)", sin intento de login.
10. [ ] Sin navegador ni MCP de navegador: flujo degradado dicho en la primera línea.
11. [ ] Claude Code por debajo de 2.1.271: aviso y camino secuencial.
12. [ ] Instalación y actualización reales: `/plugin update` cambia la versión impresa en la primera línea.
13. [ ] `${CLAUDE_PLUGIN_DATA}` con una ruta con espacios: `run.mjs config get` y `config set` andan.
14. [ ] `node` con permiso negado: mensaje claro, sin stack.
15. [ ] En modo de permisos `default`, las escrituras de los subagentes `ui-option` piden permiso; con `acceptEdits` no.
16. [ ] `npm test` y el pipe de `browser.mjs` en Node 22.
17. [ ] Prueba con un lector de pantalla sobre una pantalla generada (A11Y-40; recomendada, nunca compuerta).
18. [ ] "Terminado": en `improve`, forzar un build roto o un `bloquea` nuevo y comprobar que el informe dice `BLOCKED` y no "terminado" (la palabra sale de `run.mjs verdict`).
