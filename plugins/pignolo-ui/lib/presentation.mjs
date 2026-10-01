// Presentation decision (spec §13): the Design canvas only when the setting is auto, the session
// has the Artifact tool, an artifact type titled "Design" exists AND the project consented.
// Anything else is a local compare.html, and nothing is ever published.
export function decidePresentation({ presentation, artifact, designType, canvasConsent }) {
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
