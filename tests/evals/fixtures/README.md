# Repos de juguete para medir la detección de frentes

Tres carpetas de archivos planos (sin `.git` anidado). Cada una tiene un resultado esperado en `../fronts-expected.json`:

| Carpeta | Qué es | Frentes esperados |
|---|---|---|
| `landing-form/` | Landing estática con formulario de contacto y basura (captura, traza) | `security, hygiene` |
| `app-db/` | Esquema de ORM con migración, ruta autenticada, tests y trazas sueltas; supera el límite de diff chico | `security, database, code, tests, hygiene` |
| `cli-script/` | Script chico con README, sin formulario ni basura | ninguno (`Frentes:` vacío) |

Los valores con forma de credencial son marcadores obvios, nunca claves reales. Los archivos de test de `app-db` se llaman `*.spec.js` para que `npm test` del repositorio no los corra.

## Preparar una corrida

1. Copiar la carpeta a un directorio temporal fuera de este repositorio.
2. `git init` y un commit base con un archivo sin relación (por ejemplo `NOTES.txt`), para que haya un "antes".
3. Copiar el contenido del fixture y hacer un segundo commit. Ese es el diff que `validate` revisa como "los últimos commits".
4. Con el plugin del brazo activo, decir "validá" sin más contexto y guardar la salida en un archivo.
5. Comparar: `node tests/evals/compare-fronts.js <fixture> <archivo-de-salida>`.
