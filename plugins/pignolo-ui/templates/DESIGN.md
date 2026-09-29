---
version: alpha
name: Project name
description: Design decisions of this project. Tokens are the source of truth; the prose cites them.
colors:
  blue-50: "#E6F0FB"
  blue-600: "#0B6BCB"
  blue-700: "#095BAD"
  blue-800: "#084F96"
  blue-900: "#07467F"
  neutral-0: "#FFFFFF"
  neutral-100: "#F5F5F5"
  neutral-600: "#6E6E6E"
  neutral-700: "#5C5C5C"
  neutral-900: "#1A1A1A"
  red-700: "#C4291C"
  primary: "{colors.blue-600}"
  on-primary: "{colors.neutral-0}"
  primary-hover: "{colors.blue-700}"
  primary-pressed: "{colors.blue-800}"
  primary-container: "{colors.blue-50}"
  on-primary-container: "{colors.blue-900}"
  background: "{colors.neutral-0}"
  surface: "{colors.neutral-0}"
  surface-container: "{colors.neutral-100}"
  on-surface: "{colors.neutral-900}"
  on-surface-variant: "{colors.neutral-700}"
  on-surface-muted: "{colors.neutral-600}"
  outline: "#8F8F8F"
  focus-ring: "{colors.blue-600}"
  error: "{colors.red-700}"
  on-error: "{colors.neutral-0}"
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "6": 24px
  "8": 32px
  "12": 48px
  "16": 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.md}"
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    height: 40px
  input-hover:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  text-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-variant}"
  text-muted:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface-muted}"
  error-banner:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
  focus-indicator:
    backgroundColor: "{colors.focus-ring}"
pignolo:
  schema: 1
  platform: both
  register: product
  elevation:
    level0: "none"
    level1: "0 0 2px rgb(0 0 0 / 0.12), 0 1px 2px rgb(0 0 0 / 0.14)"
    level2: "0 0 2px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.14)"
    level3: "0 0 2px rgb(0 0 0 / 0.12), 0 8px 16px rgb(0 0 0 / 0.14)"
    level4: "0 0 8px rgb(0 0 0 / 0.12), 0 32px 64px rgb(0 0 0 / 0.14)"
  states:
    hoverOpacity: 0.08
    focusOpacity: 0.12
    pressedOpacity: 0.12
    draggedOpacity: 0.16
    disabledContentOpacity: 0.38
    disabledContainerOpacity: 0.12
  focus:
    color: "{colors.focus-ring}"
    widthPx: 2
    offsetPx: 2
  motion:
    durationMs:
      fast: 120
      base: 200
      slow: 300
      slower: 450
    easing:
      standard: "cubic-bezier(0.2, 0, 0, 1)"
      decelerate: "cubic-bezier(0, 0, 0, 1)"
      accelerate: "cubic-bezier(0.3, 0, 1, 1)"
    reducedMotion: fade-or-none
  borders:
    subtle: "{colors.surface-container}"
    strong: "{colors.outline}"
    widthPx: 1
  targets:
    minPx: 24
    recommendedPx: 44
---

# Project name

## Overview

What the product is, who uses it and the tone. Register {pignolo.register}: restraint, neutral surfaces and a single accent, {colors.primary}.

## Colors

Text is {colors.on-surface} on {colors.surface}; secondary text is {colors.on-surface-variant} and tertiary text {colors.on-surface-muted}. The only accent is {colors.primary}, with {colors.on-primary} on top. Functional borders use {colors.outline}; decorative ones {colors.surface-container}. Errors use {colors.error} with {colors.on-error}.

## Typography

One family. Page titles use {typography.headline-lg}, section titles {typography.headline-md}, body text {typography.body-md} and controls {typography.label-md}.

## Layout

Spacing follows the scale in {spacing}. Content stays within a readable measure.

### Hierarchy and reading order

One primary action per screen, using {components.button-primary}. Reading order: page title, the primary action, then the content from most to least important.

## Elevation & Depth

Resting cards use {pignolo.elevation.level1}; floating layers use {pignolo.elevation.level3}. Hover raises one level.

## Shapes

Controls use {rounded.md}, inputs {rounded.sm} and cards {rounded.lg}.

## Components

Every control has hover, pressed, focus and disabled states. Focus is drawn with {pignolo.focus.color}; disabled states use the opacities in {pignolo.states}.

## Do's and Don'ts

- Do cite tokens in this prose, never raw values.
- Don't add a second accent color.

## Decisions
