// Presentation decision (spec §13). R10 (author, 2026-10-01): the Design canvas moved to v1.x, so
// in v1 the answer is always the local compare.html and nothing is ever published. The decision
// logic of the canvas stays, behind canvasAvailable (false in v1): the canvas needs the setting
// auto, the Artifact tool, a type titled "Design" and the project's consent.
export function decidePresentation({ presentation, artifact, designType, canvasConsent, canvasAvailable = false }) {
  if (!canvasAvailable) return { mode: 'local', consentNeeded: false, reasons: ['canvas-not-in-v1'] };
  const reasons = [];
  if (presentation !== 'auto') reasons.push('presentation-local');
  if (artifact !== true) reasons.push('no-artifact-tool');
  if (designType !== true) reasons.push('no-design-type');
  if (reasons.length === 0) {
    if (canvasConsent === true) return { mode: 'canvas', consentNeeded: false, reasons };
    if (canvasConsent === undefined) return { mode: 'local', consentNeeded: true, reasons: ['no-consent'] };
    return { mode: 'local', consentNeeded: false, reasons: ['consent-declined'] };
  }
  return { mode: 'local', consentNeeded: false, reasons };
}
