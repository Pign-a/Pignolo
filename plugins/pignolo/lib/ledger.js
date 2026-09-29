'use strict';
// Ledger de revisión (spec §12): lógica determinista, sin I/O.
const { PROFILE_PARAMS } = require('./roles');

const SEVERITIES = ['BLOCKER', 'CRITICAL', 'WARNING', 'SUGGESTION'];
const STATUSES = ['open', 'confirmed', 'unreproduced', 'refuted', 'suspect', 'fixed', 'escalated'];
const LENSES = ['risk', 'resilience', 'readability', 'reliability', 'testability', 'judge-a', 'judge-b'];
const BLOCKING = ['BLOCKER', 'CRITICAL'];
const LINE_DISTANCE = 3;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isText = (x) => typeof x === 'string' && x.trim() !== '';

function parseLocation(loc) {
  const m = typeof loc === 'string' ? /^(.+):(\d+)$/.exec(loc) : null;
  return m ? { file: m[1], line: Number(m[2]) } : null;
}

function validateFinding(f) {
  if (!isObj(f)) return ['hallazgo: no es un objeto'];
  const errs = [];
  const tag = isText(f.id) ? f.id : '?';
  if (!isText(f.id)) errs.push('hallazgo: falta id');
  if (!LENSES.includes(f.lens)) errs.push(`${tag}: lens inválido`);
  if (!parseLocation(f.location)) errs.push(`${tag}: location debe tener la forma ruta:línea`);
  if (!SEVERITIES.includes(f.severity)) errs.push(`${tag}: severity inválida`);
  if (!STATUSES.includes(f.status)) errs.push(`${tag}: status inválido`);
  if (!isText(f.evidence)) errs.push(`${tag}: evidence vacía`);
  if (BLOCKING.includes(f.severity) && (f.repro === undefined || f.repro === null || f.repro === '' ||
      (isObj(f.repro) && Object.keys(f.repro).length === 0))) {
    errs.push(`${tag}: ${f.severity} requiere repro (repro-spec)`);
  }
  return errs;
}

function validateLedger(l) {
  if (!isObj(l)) return ['ledger: no es un objeto'];
  const errs = [];
  if (l.v !== 1) errs.push('ledger: v debe ser 1');
  if (typeof l.sha !== 'string' || !/^[0-9a-f]{40}$/.test(l.sha)) errs.push('ledger: sha debe ser de 40 hex');
  if (!isText(l.level)) errs.push('ledger: falta level');
  if (!isText(l.profile)) errs.push('ledger: falta profile');
  if (![0, 1, 2].includes(l.round)) errs.push('ledger: round debe ser 0, 1 o 2');
  if (!Array.isArray(l.findings)) errs.push('ledger: findings debe ser una lista');
  else l.findings.forEach((f) => errs.push(...validateFinding(f)));
  return errs;
}

function reviewPlan({ level, profile } = {}) {
  if (level === 'high') {
    const p = PROFILE_PARAMS[profile];
    if (!p) throw new Error(`perfil desconocido: ${profile}`);
    return {
      lenses: [...p.lensesHighRisk],
      refuters: p.refutersHighRisk,
      judgmentDay: String(p.judgmentDay).split('+').includes('high-risk'),
    };
  }
  if (level === 'medium') return { lenses: ['reliability', 'testability'], refuters: 0, judgmentDay: false };
  return { lenses: [], refuters: 0, judgmentDay: false };
}

function applyRepro(finding, { red } = {}) {
  if (!BLOCKING.includes(finding.severity)) return finding;
  if (red === true) return { ...finding, status: 'confirmed' };
  return { ...finding, severity: 'WARNING', status: 'unreproduced' };
}

function refutation(verdicts, { profile, level } = {}) {
  if (level === 'high' && !PROFILE_PARAMS[profile]) throw new Error(`perfil desconocido: ${profile}`);
  const expected = level === 'high' ? PROFILE_PARAMS[profile].refutersHighRisk : 1;
  const list = Array.isArray(verdicts) ? verdicts.slice(0, expected) : [];
  const refuted = list.filter((v) => v === 'REFUTED').length;
  return refuted >= (expected === 1 ? 1 : 2) ? 'refuted' : 'stands';
}

// Empareja los hallazgos de los dos jueces por el par más cercano (misma ruta, ≤ 3 líneas),
// de a pares de menor distancia primero, así un par cercano no se pierde por uno anterior.
function judgment(a, b) {
  const out = { fix: [], suspect: [], conflicts: [] };
  const pairs = [];
  a.forEach((fa, i) => {
    const la = parseLocation(fa.location);
    if (!la) return;
    b.forEach((fb, j) => {
      const lb = parseLocation(fb.location);
      const d = lb && lb.file === la.file ? Math.abs(lb.line - la.line) : Infinity;
      if (d <= LINE_DISTANCE) pairs.push([d, i, j]);
    });
  });
  pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const matchOfA = new Map();
  const usedB = new Set();
  for (const [, i, j] of pairs) {
    if (matchOfA.has(i) || usedB.has(j)) continue;
    matchOfA.set(i, j);
    usedB.add(j);
  }
  a.forEach((fa, i) => {
    if (!matchOfA.has(i)) { out.suspect.push(fa); return; }
    const fb = b[matchOfA.get(i)];
    if (BLOCKING.includes(fa.severity) !== BLOCKING.includes(fb.severity)) out.conflicts.push([fa, fb]);
    else out.fix.push(fa);
  });
  b.forEach((fb, j) => { if (!usedB.has(j)) out.suspect.push(fb); });
  return out;
}

function nextStep(ledger, { reopened = [] } = {}) {
  const confirmed = (ledger.findings || []).filter((f) => f.status === 'confirmed');
  const pending = confirmed.length + reopened.length;
  if (pending === 0) return 'done';
  return ledger.round >= 2 ? 'escalate' : 'fix';
}

// Congelado = el HEAD actual sigue siendo el SHA revisado y el árbol de trabajo es el de ese
// commit (`workingTree` = tree-hash de la copia de trabajo, `headTree` = <sha>^{tree});
// cualquier cambio posterior, commiteado o no, invalida (§12). Sin los árboles, no congela.
function isFrozen(ledger, headSha, { headTree, workingTree } = {}) {
  return isObj(ledger) && typeof headSha === 'string' && ledger.sha === headSha
    && typeof headTree === 'string' && headTree !== '' && headTree === workingTree;
}

// Ledger de una ronda a partir de los informes de las lentes, sin reescribir los
// hallazgos: el id pasa a <lente>-<id> (evita choques entre lentes) y el estado a 'open'.
// Con `judgment` (salida de judgment()), `fix` entra 'open', `suspect` entra
// 'suspect' y cada par de `conflicts` entra 'open' con `conflict` = id del otro.
function buildLedger({ sha, level, profile, round = 0, reports = [], judgment: j = null }) {
  const findings = [];
  const add = (f, status, extra = {}) => {
    if (!isObj(f)) throw new Error('un hallazgo no es un objeto');
    if (!isText(f.id)) throw new Error(`un hallazgo de ${isText(f.lens) ? f.lens : '?'} no tiene id`);
    findings.push({ ...f, id: `${f.lens}-${f.id}`, status, ...extra });
  };
  for (const r of reports) {
    if (!Array.isArray(r)) throw new Error('cada informe debe ser una lista de hallazgos');
    r.forEach((f) => add(f, 'open'));
  }
  if (j) {
    (j.fix || []).forEach((f) => add(f, 'open'));
    (j.suspect || []).forEach((f) => add(f, 'suspect'));
    (j.conflicts || []).forEach(([a, b]) => {
      add(a, 'open', { conflict: `${b.lens}-${b.id}` });
      add(b, 'open', { conflict: `${a.lens}-${a.id}` });
    });
  }
  const seen = new Set();
  for (const f of findings) {
    if (seen.has(f.id)) throw new Error(`id repetido: ${f.id}`);
    seen.add(f.id);
  }
  return { v: 1, sha, level, profile, round, findings };
}

// Ronda siguiente tras el fixer (§12: re-revisión sobre ledger + delta): sha nuevo,
// round + 1, los confirmados de `fixed` pasan a 'fixed' y se suman los hallazgos nuevos.
// Con `judgment` (Judgment Day), lo nuevo entra emparejado como en buildLedger.
function nextRound(ledger, { sha, fixed = [], reports = [], judgment: j = null }) {
  if (ledger.round >= 2) throw new Error('máximo 2 rondas de fix (§12): lo abierto se escala');
  const r = `r${ledger.round + 1}-`;
  const fresh = buildLedger({ sha, level: ledger.level, profile: ledger.profile, reports, judgment: j }).findings
    .map((f) => ({ ...f, id: `${r}${f.id}`, ...(f.conflict ? { conflict: `${r}${f.conflict}` } : {}) }));
  const old = ledger.findings.map((f) => (fixed.includes(f.id) && f.status === 'confirmed' ? { ...f, status: 'fixed' } : f));
  return { ...ledger, sha, round: ledger.round + 1, findings: [...old, ...fresh] };
}

module.exports = {
  SEVERITIES, STATUSES, LENSES,
  validateFinding, validateLedger, reviewPlan, applyRepro, refutation, judgment, nextStep, isFrozen, buildLedger, nextRound,
};
