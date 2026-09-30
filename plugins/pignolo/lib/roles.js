'use strict';
// Tabla de roles (spec v1 §6 y §7) y vocabulario de escalamiento (§6.1).

const VOCABULARY = Object.freeze({
  writer: Object.freeze(['DONE', 'BLOCKED', 'NEEDS_CONTEXT']),
  reviewer: Object.freeze(['APPROVE', 'REQUEST_CHANGES', 'ESCALATE']),
  researcher: Object.freeze(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE']),
  reader: Object.freeze(['DONE', 'BLOCKED', 'NEEDS_CONTEXT']),
});

const RO = ['Read', 'Grep', 'Glob'];
const ROB = [...RO, 'Bash'];

function role(tools, effort, max, balanced, economy, vocabulary, extra = {}) {
  return Object.freeze({
    tools: Object.freeze(tools),
    effort,
    models: Object.freeze({ max, balanced, economy }),
    vocabulary,
    ...extra,
  });
}

const ROLES = Object.freeze({
  explorer: role(RO, 'low', 'sonnet', 'sonnet', 'sonnet', 'reader'),
  researcher: role(['WebSearch', 'WebFetch'], 'medium', 'opus', 'opus', 'sonnet', 'researcher', { omitClaudeMd: true }),
  'spec-reviewer': role(RO, 'high', 'opus', 'opus', 'opus', 'reviewer'),
  'plan-auditor': role(ROB, 'high', 'opus', 'opus', 'opus', 'reviewer'),
  'test-writer': role([...RO, 'Edit', 'Write'], 'medium', 'opus', 'sonnet', 'sonnet', 'writer'),
  implementer: role([...RO, 'Edit', 'Write', 'Bash'], 'medium', 'opus', 'sonnet', 'sonnet', 'writer'),
  'review-risk': role(RO, 'high', 'opus', 'opus', 'sonnet', 'reviewer'),
  'review-resilience': role(RO, 'high', 'opus', 'opus', 'sonnet', 'reviewer'),
  'review-readability': role(RO, 'high', 'opus', 'opus', 'sonnet', 'reviewer'),
  'review-reliability': role(RO, 'high', 'opus', 'opus', 'sonnet', 'reviewer'),
  'review-testability': role(ROB, 'high', 'opus', 'opus', 'opus', 'reviewer'),
  refuter: role(ROB, 'high', 'opus', 'opus', 'opus', 'researcher'),
  'judge-a': role(RO, 'high', 'opus', 'opus', 'sonnet', 'reviewer'),
  'judge-b': role(RO, 'high', 'opus', 'opus', 'sonnet', 'reviewer'),
  fixer: role(['Read', 'Edit', 'Write', 'Bash'], 'high', 'opus', 'sonnet', 'sonnet', 'writer'),
  validator: role(ROB, 'high', 'opus', 'opus', 'opus', 'reviewer'),
  integrator: role(['Read', 'Bash'], 'low', 'sonnet', 'sonnet', 'sonnet', 'writer'),
  'learning-validator': role(RO, 'medium', 'opus', 'sonnet', 'sonnet', 'reader'),
  debugger: role(ROB, 'high', 'opus', 'opus', 'opus', 'writer'),
});

const ALL_LENSES = ['risk', 'resilience', 'readability', 'reliability', 'testability'];
const PROFILE_PARAMS = Object.freeze({
  max: Object.freeze({ parallel: 3, refutersHighRisk: 3, judgmentDay: 'high-risk+plan-close', lensesHighRisk: ALL_LENSES }),
  balanced: Object.freeze({ parallel: 2, refutersHighRisk: 1, judgmentDay: 'plan-close', lensesHighRisk: ALL_LENSES }),
  economy: Object.freeze({ parallel: 1, refutersHighRisk: 1, judgmentDay: 'on-request', lensesHighRisk: ['risk', 'testability'] }),
});

module.exports = { ROLES, VOCABULARY, PROFILE_PARAMS };
