'use strict';
// Resumen de `init.js detect` para la vista rápida (decisión del autor D-2, 2026-10-02): los hechos que la skill necesita
// para mostrar una sola pantalla sin interpretar la detección cruda. Solo ids, códigos y valores; el texto llano es de la
// skill (habla el idioma del humano). Puro: no lee el disco ni ejecuta nada.
const { BLANK_STEPS } = require('./init-blank');
const { proposeAdaptation } = require('./init-adapt');

const PROPOSAL_KEYS = ['type', 'gates', 'testPaths', 'protectedTestConfig', 'highRiskPaths', 'contracts', 'serialPaths', 'costPaths', 'visiblePaths', 'depsInstall', 'domainRules'];

const filled = (v) => {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return String(v).trim() !== '';
};

// Una decisión por tipo, siempre `adopt` (nada se mueve); con dos candidatas del mismo tipo no se adivina: `leave`.
function placesFor(placesDetection, isPublic) {
  const out = {};
  for (const it of proposeAdaptation({ detection: placesDetection, answers: { public: isPublic } }).items) {
    out[it.kind] = it.ambiguous ? { decision: 'leave' } : { decision: 'adopt', from: it.candidate.path };
  }
  return out;
}

function attentionOf({ detection, existing, places }) {
  const out = [];
  if (detection.type === null) out.push('no-type');
  if (detection.type === 'code-untested') out.push('untested');
  if (detection.warnings.some((w) => /placeholder del instalador/.test(w))) out.push('test-placeholder');
  if (typeof detection.sources.testScript === 'string' && /sin runner reconocido/.test(detection.sources.testScript)) out.push('unrecognized-runner');
  if (detection.mutation) out.push('mutation-config');
  if (detection.runnerExcludes.some((r) => r.file && r.walksDotDirs !== 'no')) out.push('runner-excludes');
  if (detection.stacks.length > 1) out.push('several-stacks');
  if (existing.projectMd) out.push('existing-project-md');
  if (places.candidates.length) out.push('places-candidates');
  return out;
}

function buildSummary({ blank, detection, existing, memory, places }) {
  if (blank) {
    return {
      mode: 'blank',
      recommended: [...BLANK_STEPS],
      recommendedPlaces: {},
      recommendedPlacesIfPrivate: {},
      proposal: {},
      found: {},
      ask: [{ id: 'create-skeleton', kind: 'yes-no', default: true }],
      optional: [],
      attention: [],
    };
  }
  const proposal = {};
  for (const k of PROPOSAL_KEYS) if (filled(detection[k])) proposal[k] = detection[k];
  const recommended = ['ignores', 'gitattributes', 'reflog'];
  if (places.candidates.length) recommended.push('adapt');
  recommended.push('skeleton', 'project-md');
  if (!existing.securityMd) recommended.push('security-md');
  const ask = [{ id: 'public', kind: 'yes-no', default: true }, { id: 'piiPatterns', kind: 'free-text', default: [] }];
  if (!existing.securityMd) ask.push({ id: 'channel', kind: 'free-text', default: null });
  return {
    mode: 'existing',
    recommended,
    recommendedPlaces: placesFor(places, true),
    recommendedPlacesIfPrivate: placesFor(places, false),
    proposal,
    found: {
      type: detection.type,
      stacks: [...detection.stacks],
      runners: [...detection.runners],
      gates: Object.keys(detection.gates),
      domainRules: detection.domainRules.length,
      projectMd: existing.projectMd,
    },
    ask,
    optional: memory.found && memory.files > 0 ? ['auto-memory-off'] : [],
    attention: attentionOf({ detection, existing, places }),
  };
}

module.exports = { buildSummary, PROPOSAL_KEYS };
