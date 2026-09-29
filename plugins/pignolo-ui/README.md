# Pignolo UI

Plugin opcional de Claude Code, hermano de pignolo y en el mismo marketplace, para crear y mejorar interfaces web con **decisiones de diseño explícitas y verificadas**. Anda sin el núcleo. Estado: v0.1 en construcción (hito 1 de 5: esqueleto y formato).

Diseño: `docs/specs/2026-09-28-pignolo-ui-v1-design.md`.

## Requisitos

- Node ≥ 22 para pignolo-ui (A-12), sin dependencias npm.
- Claude Code ≥ 2.1.271 (`userConfig` con `options`).

## Alias de nombres semánticos

Lo que genera pignolo-ui usa los nombres semánticos de Material 3 (`primary`, `on-surface`…). Al **leer** un `DESIGN.md` existente, estos nombres cuentan como su equivalente MD3, siempre que el nombre MD3 no esté definido también; `pignolo.aliases` completa o pisa este mapa. Cada alias usado sale como hallazgo `DESIGN-ALIAS` (`detalle`).

- `accent` → `primary`, `brand` → `primary`
- `on-accent` → `on-primary`, `accent-foreground` → `on-primary`, `primary-foreground` → `on-primary`
- `text` → `on-surface`, `label` → `on-surface`, `foreground` → `on-surface`, `fg` → `on-surface`, `card-foreground` → `on-surface`, `surface-foreground` → `on-surface`
- `secondary-foreground` → `on-secondary`
- `bg` → `background`, `card` → `surface`
- `muted-foreground` → `on-surface-variant`, `text-muted` → `on-surface-variant`
- `border` → `outline-variant`
- `danger` → `error`, `destructive` → `error`, `on-danger` → `on-error`, `destructive-foreground` → `on-error`

## Instalar (desarrollo)

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo-ui

## Tests

    npm test          (todo el repo)
    npm run test:ui   (solo pignolo-ui)
