// Presentation decision (spec §13, D-4c-3, R-18). The canvas is the default format whenever the
// account has the "Design" type; there is NO consent question: every time something is published
// the skill says so in one line (NOTICE) and the user can opt out, before any Artifact call:
//   - the project key `publish: never` (config set --key publish --value never),
//   - the plugin setting presentation = local (an unreadable value counts as local, D-4c-15),
//   - "no publiques" said in the chat for one run (<run>/no-publish).
//
// decidePresentation({ presentation, kind, artifact, designType, optOut }) -> { mode, reasons }
//   canvas only with presentation 'auto', optOut null, kind 'option', the Artifact tool and the "Design" type.
//   reasons, all that apply and in this order: presentation-local, data-unresolved (the data folder is not the real one, so the opt-out cannot be read), project-opt-out, legacy-consent-declined,
//   style-tile-local, no-artifact-tool, no-design-type
// gateDecision({ presentation, projectOptOut, runOptOut, dataUnresolved }) -> { allowed, reasons }   (run.mjs publish-gate)
export const NOTICE = 'Publico en un lienzo y sus archivos, privados de tu cuenta de claude.ai: mockups con marcadores, nunca capturas ni código; las fuentes se piden a Google Fonts al abrir el lienzo. Para no publicar: decímelo o `config set --key publish --value never`.';

export function decidePresentation({ presentation, kind, artifact, designType, optOut = null, dataUnresolved = false }) {
  const reasons = [];
  if (presentation !== 'auto') reasons.push('presentation-local');
  if (dataUnresolved) reasons.push('data-unresolved');
  if (optOut === 'project-opt-out' || optOut === 'legacy-consent-declined') reasons.push(optOut);
  if (kind !== 'option') reasons.push('style-tile-local');
  if (artifact !== true) reasons.push('no-artifact-tool');
  if (designType !== true) reasons.push('no-design-type');
  return { mode: reasons.length === 0 ? 'canvas' : 'local', reasons };
}

export function gateDecision({ presentation, projectOptOut = null, runOptOut = false, dataUnresolved = false }) {
  const reasons = [];
  if (presentation !== 'auto') reasons.push('presentation-local');
  if (dataUnresolved) reasons.push('data-unresolved');
  if (projectOptOut === 'project-opt-out' || projectOptOut === 'legacy-consent-declined') reasons.push(projectOptOut);
  if (runOptOut) reasons.push('run-opt-out');
  return { allowed: reasons.length === 0, reasons };
}
