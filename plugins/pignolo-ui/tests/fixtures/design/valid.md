---
version: alpha
name: Fixture
description: Complete DESIGN.md for the validator tests.
colors:
  blue-600: "#0B6BCB"
  primary: "{colors.blue-600}"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  on-surface: "#1A1A1A"
  outline: "#8F8F8F"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: 8px
spacing:
  "4": 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
pignolo:
  schema: 1
  platform: both
  register: product
  elevation:
    level0: "none"
    level1: "0 1px 2px rgb(0 0 0 / 0.14)"
  states:
    hoverOpacity: 0.08
    focusOpacity: 0.12
    pressedOpacity: 0.12
    draggedOpacity: 0.16
    disabledContentOpacity: 0.38
    disabledContainerOpacity: 0.12
  focus:
    color: "{colors.primary}"
    widthPx: 2
    offsetPx: 2
  motion:
    durationMs:
      fast: 120
      base: 200
    easing:
      standard: "cubic-bezier(0.2, 0, 0, 1)"
    reducedMotion: fade-or-none
---

## Overview

Fixture used by the tests.

## Layout

### Hierarchy and reading order

Title, then the primary action, then the list.

## Decisions
