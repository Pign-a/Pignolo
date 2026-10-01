// Widths and themes of a browser run (spec §11.3, A-04, A-16).
// shotPlan({ platform, dark }) -> { widths: [{ width, height, capture }], themes }
//   capture: true = screenshot and measures; false = measured by script only (no image).
// planFromProject({ project, design }) -> { platform, dark }
//   platform from DESIGN.md pignolo.platform (default both); dark when DESIGN.md has
//   pignolo.themes.dark or the project CSS has .dark, [data-theme] or prefers-color-scheme: dark.
import fs from 'node:fs';
import { validateDesign } from './design-doc.mjs';
import { readTokenSources } from './token-sources.mjs';

const WIDTHS = {
  desktop: [[1440, 900, true], [320, 640, false]],
  mobile: [[375, 812, true], [320, 640, false]],
  both: [[1440, 900, true], [375, 812, true], [768, 1024, false], [320, 640, false]],
};

export function shotPlan({ platform = 'both', dark = false } = {}) {
  if (!WIDTHS[platform]) throw new Error(`unknown platform ${JSON.stringify(platform)} (desktop, mobile or both)`);
  return {
    widths: WIDTHS[platform].map(([width, height, capture]) => ({ width, height, capture })),
    themes: dark ? ['light', 'dark'] : ['light'],
  };
}

export function planFromProject({ project, design = null }) {
  let pig = null;
  if (design && fs.existsSync(design)) {
    const v = validateDesign(fs.readFileSync(design, 'utf8'));
    pig = v.data && v.data.pignolo && typeof v.data.pignolo === 'object' ? v.data.pignolo : null;
  }
  const platform = pig && WIDTHS[pig.platform] ? pig.platform : 'both';
  const declaredDark = Boolean(pig && pig.themes && pig.themes.dark && typeof pig.themes.dark === 'object');
  return { platform, dark: declaredDark || readTokenSources(project).darkDetected };
}
