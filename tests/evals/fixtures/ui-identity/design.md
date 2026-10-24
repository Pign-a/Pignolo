---
version: alpha
name: Calm product
description: A quiet, minimalist identity. Generous white space, one azure accent, neutral grays and the system font. The tokens in this block are the source of truth; the prose cites them and ui-audit compares the screens against them.
colors:
  azure-50: "#EAF3FD"
  azure-600: "#0A6CD8"
  azure-700: "#0A5EBB"
  azure-800: "#084C99"
  azure-900: "#08407F"
  neutral-0: "#FFFFFF"
  neutral-100: "#F5F5F7"
  neutral-200: "#E8E8ED"
  neutral-600: "#6E6E73"
  neutral-700: "#515154"
  neutral-900: "#1D1D1F"
  red-700: "#B3261E"
  primary: "{colors.azure-600}"
  on-primary: "{colors.neutral-0}"
  primary-hover: "{colors.azure-700}"
  primary-pressed: "{colors.azure-800}"
  primary-container: "{colors.azure-50}"
  on-primary-container: "{colors.azure-900}"
  background: "{colors.neutral-0}"
  surface: "{colors.neutral-0}"
  surface-container: "{colors.neutral-100}"
  on-surface: "{colors.neutral-900}"
  on-surface-variant: "{colors.neutral-700}"
  on-surface-muted: "{colors.neutral-600}"
  outline: "#8E8E93"
  outline-variant: "{colors.neutral-200}"
  focus-ring: "{colors.azure-600}"
  error: "{colors.red-700}"
  on-error: "{colors.neutral-0}"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  headline-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 19px
    fontWeight: 600
    lineHeight: 1.35
  body-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  none: 0px
  sm: 8px
  md: 12px
  lg: 16px
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
  "24": 96px
  "32": 128px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 44px
  button-secondary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
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
    level1: "0 0 1px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.08)"
    level2: "0 0 1px rgb(0 0 0 / 0.08), 0 2px 6px rgb(0 0 0 / 0.1)"
    level3: "0 0 1px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.12)"
  states:
    hoverOpacity: 0.06
    focusOpacity: 0.1
    pressedOpacity: 0.1
    draggedOpacity: 0.14
    disabledContentOpacity: 0.38
    disabledContainerOpacity: 0.12
  focus:
    color: "{colors.focus-ring}"
    widthPx: 2
    offsetPx: 2
  motion:
    durationMs:
      fast: 120
      base: 160
      slow: 200
      slower: 220
    easing:
      standard: "cubic-bezier(0.2, 0, 0, 1)"
      decelerate: "cubic-bezier(0, 0, 0, 1)"
      accelerate: "cubic-bezier(0.3, 0, 1, 1)"
    reducedMotion: fade-or-none
  borders:
    subtle: "{colors.outline-variant}"
    strong: "{colors.outline}"
    widthPx: 1
  targets:
    minPx: 44
    recommendedPx: 48
---

# Calm product

The YAML block above is the identity of this product. Screens are checked against it by `/pignolo:ui-audit`, so every color, size and radius a screen uses comes from these tokens.

## Overview

A quiet product interface. A lot of white space, one azure accent and neutral grays; nothing competes with the content. Register {pignolo.register}: restraint first, and a single accent, {colors.primary}.

## Colors

Text is {colors.on-surface} on {colors.surface}; secondary text is {colors.on-surface-variant} and tertiary text {colors.on-surface-muted}. Panels and quiet areas use {colors.surface-container}. The only accent is {colors.primary}, with {colors.on-primary} on top; its soft version for secondary actions is {colors.primary-container} with {colors.on-primary-container}. Functional borders use {colors.outline}; decorative ones {colors.outline-variant}. Errors use {colors.error} with {colors.on-error}.

## Typography

One family: the system font stack. Page titles use {typography.headline-lg}, section titles {typography.headline-md}, body text {typography.body-md}, supporting text {typography.body-sm} and controls {typography.label-md}. Only weights 400, 500 and 600 appear.

## Layout

Spacing follows the scale in {spacing}, on a 4px base and generous: related items sit {spacing.4} apart, sections {spacing.12} or more apart. Content keeps a readable measure and never fills the full width of a large screen.

### Hierarchy and reading order

One primary action per view, using {components.button-primary}; every other action is secondary or a plain text link. Reading order: page title, the primary action, then the content from most to least important.

## Elevation & Depth

Almost flat. Resting cards use {pignolo.elevation.level1}; floating layers use {pignolo.elevation.level3}. Separation comes from space and {colors.surface-container}, not from heavy shadows.

## Shapes

Controls and inputs use {rounded.md} (12px), small chips {rounded.sm} and cards {rounded.lg}.

## Components

Every control has hover, pressed, focus and disabled states. Focus is drawn with {pignolo.focus.color}; disabled states use the opacities in {pignolo.states}. Touch targets are at least {pignolo.targets.minPx}px. Motion is calm: {pignolo.motion.durationMs} between 120 and 220 ms with the standard easing, and a reduced-motion preference turns it into a fade or nothing.

## Do's and Don'ts

- Do cite tokens in this prose, never raw values.
- Do keep a single primary action per view.
- Don't add a second accent color.

## Decisions
