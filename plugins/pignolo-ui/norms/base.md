# Base norms for pignolo-ui

Short written criteria for the agents. Rules that a script checks live in the catalog; this file holds what a script cannot judge.

## Hierarchy

- One primary action per screen, and it is the most prominent element.
- Text sizes step down in a clear scale: title, section heading, body, caption.
- Reading order in the markup matches reading order on screen.
- Spacing groups related things and separates unrelated ones (proximity before borders).

## Accessibility floor

- Text contrast reaches 4.5:1 (3:1 for large text); see COLOR-03.
- Every interactive element has a visible focus style (STATE-04) and a name (A11Y-04).
- Touch targets are at least 24 px (44 px on mobile); the page never scrolls sideways (LAYOUT-11).
- Motion respects the reduced-motion preference (MOTION-04).

## Platform (HIG, Fluent 2)

- Desktop: pointer and keyboard first; density may be higher, hover states exist but never carry meaning alone.
- Mobile: thumb reach, one column, targets of 44 px or more, safe areas respected.
- Follow the platform's navigation pattern before inventing one.

## Tone by register

- product: calm, dense, tool-like; one accent color, neutral surfaces, familiar patterns.
- brand: more expressive type and color are allowed when they serve the message; contrast and hierarchy rules still apply.
- Data the user gave is used literally; missing data is filled with realistic sample values marked `data-sample`, with a visible "Datos de muestra" line on the screen. Never real people, emails, companies or brands, and never invented testimonials, logos or press mentions.

## Judgment criteria

- J-01: one primary action per screen and it is the most prominent element
- J-02: the text hierarchy (title, heading, body, caption) is visible at a glance
- J-03: the reading order of the markup matches the visual order
- J-04: the screen states what it is and what the user can do within the first viewport
- J-05: related items are grouped by proximity and unrelated items are separated
- J-06: system status is visible (loading, saved, error) and not left implicit (Nielsen 1)
- J-07: wording uses the user's language, not internal terms (Nielsen 2)
- J-08: the user can undo, cancel or leave without losing work (Nielsen 3)
- J-09: the same thing looks and is called the same everywhere (Nielsen 4)
- J-10: errors say what happened and how to fix it (Nielsen 9)
- J-11: choices that matter are explicit decisions, not leftovers of a default
- J-12: density and spacing fit the register (product or brand)

Severity of a `J-nn` finding: `medio` or `detalle`. It can be `alto` only when it cites a failing script or browser entry.
