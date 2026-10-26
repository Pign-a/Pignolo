# Flujo de pantallas de `ui`, pausado

Tres pasos que corrían antes de construir una pantalla nueva: ficha de pantalla (`brief.md`), ficha de patrón (`patterns.md`) y crítica de 8 ítems (`critique.md`). Se midieron dos veces con voto a ciegas del autor y no mostraron ventaja sobre no usar plugin (`tests/evals/RESULTS-ui-flujo-ronda2.md`, gap P2-52), así que la 1.1.0 no los publica. El diseño sigue en `docs/specs/2026-10-24-ui-flujo-design.md`.

## Qué se quitó del plugin

- La sección "5. Building screens" de `plugins/pignolo/skills/ui/SKILL.md` (queda "5. Pieces for a screen": kit, fichas de patrón y guía de stacks).
- La línea de `work` que mandaba a esa sección.
- Los tres archivos de esta carpeta, que vivían en `plugins/pignolo/skills/ui/references/`.

Las 15 fichas de patrón (`references/patterns/`), el kit y `references/stacks.md` sí se publican: son el material de los componentes.

## Cómo reactivarlo

Revertir el commit que lo pausó (`git log --grep "flujo de pantallas pausado"`). Vuelven la sección, la línea de `work` y las tres referencias, y las pruebas del flujo (`tests/ui.test.js`, `tests/ui-arms.test.js`, una de `tests/work.test.js`) dejan de saltarse solas, porque `tests/flow-pausado.js` mira si la sección existe. Antes de reactivarlo, iterarlo con pantallas nuevas y medirlo de nuevo (hipótesis en P2-52).
