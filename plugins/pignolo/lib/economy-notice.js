'use strict';
// Aviso de §7 para el perfil economy. Las cifras salen de una sola tabla: se actualizan con la próxima eval
// (fuente: tests/evals/RESULTS-hito-3.md).
const MEASURED = {
  date: '2026-09-30',
  platform: 'Windows',
  claudeCode: '2.1.285',
  runsPerCase: 5,
  found: 30,
  planted: 30,
  falseAlarms: 0,
  cleanRuns: 30,
  fasterPct: 37,
  cheaperPct: 35,
};

function economyNotice(m = MEASURED) {
  return {
    plain: 'En economy las cuatro lentes de revisión y los dos jueces corren en sonnet, que es más barato y rápido que opus. '
      + 'En la medición encontró todos los defectos plantados y no dio falsas alarmas, pero se probó solo con casos chicos.',
    technical: `Medido el ${m.date} (${m.platform}, Claude Code ${m.claudeCode}, ${m.runsPerCase} corridas por caso, casos sintéticos chicos): `
      + `sonnet encontró ${m.found}/${m.planted} defectos plantados con ${m.falseAlarms}/${m.cleanRuns} falsas alarmas, `
      + `~${m.fasterPct} % más rápido y ~${m.cheaperPct} % más barato que opus. `
      + 'review-testability, refuter, validator, spec-reviewer, plan-auditor y debugger siguen en opus (la re-auditoría acotada del plan va en sonnet). '
      + 'Los diffs grandes no están medidos.',
  };
}

module.exports = { MEASURED, economyNotice };
