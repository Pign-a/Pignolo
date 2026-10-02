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

- J-01: one primary action per screen and it is the most prominent element. Applies when: the screen is for completing a task (a form, a decision, a purchase), not a list or a reading page.
- J-02: the text hierarchy (title, heading, body, caption) is visible at a glance, so with the detail blurred the action reads first and then the groups. Applies when: there is more than one level of text.
- J-03: the reading order of the markup matches the visual order. Applies when: the layout uses columns, grid areas, `order` or absolute positioning.
- J-04: the screen states what it is and what the user can do within the first viewport, so it answers where I am, where I can go, what is here and how I leave. Applies when: the screen is a page of a flow, not a dialog or a fragment.
- J-05: related items are grouped by proximity and unrelated items are separated. Applies when: there are two or more groups of content.
- J-06: system status is visible (loading, saved, error) and not left implicit (Nielsen 1). Applies when: an action takes time, saves or changes data.
- J-07: wording uses the user's language, not internal terms (Nielsen 2); each control's label names what happens and the action keeps its name across the flow. Applies when: there are buttons, links or fields with text.
- J-08: the user can undo, cancel or leave without losing work (Nielsen 3); a destructive, irreversible action asks for confirmation with a Cancel. Applies when: there is a form, an edit or a destructive action.
- J-09: the same thing looks and is called the same everywhere (Nielsen 4); one color means one thing. Applies when: color marks a state or there are repeated elements.
- J-10: errors say what happened and how to fix it (Nielsen 9). Applies when: an error state can be reached (validation, a request that can fail).
- J-11: choices that matter are explicit decisions, not leftovers of a default. Applies when: the run shows framework defaults (THEME-01, THEME-02) or `DESIGN.md` marks tokens as `extracted`.
- J-12: density and spacing fit the register (product or brand). Applies when: `DESIGN.md` or the brief of the flow declares a `register`.

A `J-nn` finding exists only if its "Applies when" holds on this screen; otherwise there is no finding and no `notVerified` entry. At most 3 per screen, the ones with the most effect.

Severity of a `J-nn` finding: `medio` or `detalle`. It can be `alto` only when it cites a failing script or browser entry.
