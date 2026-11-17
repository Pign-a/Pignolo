# Registry of findings

Default path: `docs/research/hallazgos-decisiones.md`, unless the project's `CLAUDE.md` names another. Written in Spanish. Create it with this header if absent.

| Fecha | Decisión | Hallazgo | Fuente (URL, fecha, estado) | Tipo (DATO/INFERENCIA/SUPUESTO) | Verificación | Estado |
|---|---|---|---|---|---|---|

One row per finding. `Verificación`: `[abierto por mí]`, `[ejecuté]` or `[agente]`. `Estado`: `confirmado`, `refutado`, `riesgo aceptado (<quién>, <fecha>)`, `corregido`, `sin verificar`.

## Métricas (end of the file, updated every batch)

- Hallazgos abiertos por severidad y antigüedad.
- Reincidencias: reglas automáticas que volvieron a fallar.
- Tasa de acierto de los agentes: afirmaciones que sobrevivieron la verificación.
- Decisiones sin fuente oficial.
- Fuentes con más de 90 días sin reabrir.
