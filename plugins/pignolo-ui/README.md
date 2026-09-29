# Pignolo UI

Plugin opcional de Claude Code, hermano de pignolo y en el mismo marketplace, para crear y mejorar interfaces web con **decisiones de diseño explícitas y verificadas**. Anda sin el núcleo. Estado: v0.1 en construcción (hito 1 de 5: esqueleto y formato).

Diseño: `docs/specs/2026-09-28-pignolo-ui-v1-design.md`.

## Requisitos

- Node ≥ 22 para pignolo-ui (A-12), sin dependencias npm.
- Claude Code ≥ 2.1.271 (`userConfig` con `options`).

## Instalar (desarrollo)

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo-ui

## Tests

    npm test          (todo el repo)
    npm run test:ui   (solo pignolo-ui)
