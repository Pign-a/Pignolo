# Ronda 2 del flujo de pantallas de `ui`: resultado

**Estado: cerrada el 2026-10-26.** Ficha previa: `docs/specs/2026-10-25-ui-ronda2-prereg.md` (commit `3286b8b`, congelada con `freezeHash fe0087ca02d4`). Un votante (el autor), una repetición por celda, voto a ciegas. Son indicios, no demostración.

## Qué se corrió

12 corridas en serie (4 brazos por 3 pantallas), Sonnet, tope de 3 USD por corrida, costo total 12,6 USD según el registro. Brazos: N (sin plugin), U0 (la `ui` de la 1.0.0), U3 (flujo de fichas y crítica), U3K (U3 más kit y guía de stacks). Registro: `tests/evals/pignolo2-runs.csv`, experimento `ui-flujo-ronda2`.

- Compromisos (s4) y Ahorro (s5): validación, 4 corridas válidas cada una.
- Simulador (s3): desarrollo; las corridas de N y U0 quedaron inválidas por `escaped_cwd` (pruebas hechas en `/tmp` y en una carpeta vecina; el detector es laxo, ver P2-36) y se votaron solo U3 y U3K.

## Voto a ciegas

Posición (1 es la mejor) y cambios pedidos:

| Pantalla | N | U0 | U3 | U3K |
|---|---|---|---|---|
| s4 Compromisos | 1 (1 cambio) | 2 (2) | 4 (10) | 3 (2) |
| s5 Ahorro | 1 (1) | 2 (4) | 4 (5) | 3 (4) |
| s3 Simulador | inválida | inválida | 1 (2) | 2 (4) |

Media de cambios pedidos: N 1,0 (2 pantallas), U0 3,0 (2), U3 5,7 (3), U3K 3,3 (3).

## Contra lo preinscrito

- **Hipótesis principal** (U3K primero en al menos 2 de 3 y con la menor media de cambios): **no se cumplió**. U3K no quedó primero en ninguna; sin plugin quedó primero en las dos de validación.
- **Hipótesis secundaria** (U3K pide menos cambios que U3): 3,3 contra 5,7 de media, pero por una sola pantalla (s4: 2 contra 10). En s3 fue al revés (4 contra 2). Con el mismo flujo, la diferencia entre dos corridas llega a 8 cambios: el ruido de una repetición por celda es mayor que cualquier efecto buscado.
- **Uso del kit:** ninguna corrida de U3K abrió un archivo de `kit/` ni `references/stacks.md`. El repositorio de prueba está en blanco y pide HTML estático, así que U3K no se distingue de U3 y esta ronda no mide el kit (P2-51). El votante lo notó en todas las pantallas.

## Lectura

- Las etiquetas de sobrecarga y de jerarquía de acciones aparecen solo en pantallas de brazos con flujo (3 de los 6 votos de U3 y U3K); las del brazo sin plugin, mucho más chicas, recibieron solo "otro". La identidad pedida es minimalista: el flujo parece empujar a agregar cosas, y su crítica no lo corrige. Es una hipótesis, no un hecho: no se midió qué parte del flujo lo causa.
- Quedan fallas comunes a todos los brazos que ningún paso detectó: botones sin función (registrar ahorro, agregar cuenta), un modal que no cierra al hacer clic afuera, una lista desplegable nativa.
- Contra la piloto (flujo primero en 2 de 3, media de cambios 2,3 contra 3,7 sin plugin), esta ronda dice lo contrario con otras pantallas. Seis pantallas y un votante no alcanzan para afirmar que el flujo mejora ni que empeora; lo único que se sostiene es que no se ve una ventaja.

## No se ajustó el flujo

Como pide la ficha previa, s4 y s5 no se usan para tocar el flujo como si siguieran siendo de validación. Lo que se aprendió queda como hipótesis para la próxima iteración en un conjunto de desarrollo nuevo (gaps P2-52 y P2-51).
