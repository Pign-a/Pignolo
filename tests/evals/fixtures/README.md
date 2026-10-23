# Repos de juguete para medir la detección de frentes

Tres carpetas de archivos planos (sin `.git` anidado). Cada una tiene un resultado esperado en `../fronts-expected.json`:

| Carpeta | Qué es | Frentes esperados |
|---|---|---|
| `landing-form/` | Landing estática con formulario de contacto y basura (captura, traza) | `security, hygiene` |
| `app-db/` | Esquema de ORM con migración, ruta autenticada, tests y trazas sueltas; supera el límite de diff chico | `security, database, code, tests, hygiene` |
| `cli-script/` | Script chico con README, sin formulario ni basura | ninguno (ningún agente de frente) |

Los valores con forma de credencial son marcadores obvios, nunca claves reales. Los archivos de test de `app-db` se llaman `*.spec.js` para que `npm test` del repositorio no los corra.

## Preparar una corrida

1. Copiar la carpeta a un directorio temporal fuera de este repositorio.
2. `git init -b main` y un commit base con un archivo sin relación (por ejemplo `NOTES.txt`), para que haya un "antes".
3. Pasar a una rama aparte que sale de ese commit base (`git switch -c trabajo`), copiar el contenido del fixture y hacer un segundo commit allí. `validate` toma como base el merge-base de `HEAD` con `main`, que es siempre el commit base, así que revisa exactamente el fixture y no depende de cuántos commits haya.
   Entre `git add -A` y `git commit` correr `git status`: un `.gitignore` global puede descartar archivos como `*.log` (la basura que el fixture necesita), y sin ellos el diff cambia.
4. Con el plugin del brazo activo, decir "validá" sin más contexto y guardar la salida en un archivo.
5. Comparar los frentes delegados (los agentes `pignolo:review-<id>` que lanzó el hilo principal) con `../fronts-expected.json`; el arnés lo hace solo (`fronts_by_agents_ok`). Desde el 2026-10-23 la skill `validate` no imprime la línea `Frentes:` y ese criterio no decide; `node tests/evals/compare-fronts.js <fixture> <archivo-de-salida>` queda como lector de esa línea para salidas de versiones anteriores de la skill.
