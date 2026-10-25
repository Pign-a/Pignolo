/**
 * Mount once in the app layout. Loads Motion features (domMax: animations,
 * gestures, drag and layout animations) through LazyMotion and applies
 * reducedMotion="user": with it, transform and layout animations are disabled
 * and opacity is kept (Motion docs, MotionConfig). `strict` makes a stray
 * `motion.*` component throw, so kit components must use `m.*`.
 *
 * Next.js: put this in a file with "use client" and wrap {children} in layout.tsx.
 */
"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";

export function KitMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
