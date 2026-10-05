#!/usr/bin/env node
'use strict';
// La receta de tres pasos del plan-auditor, en el orden en que la corre el orquestador
// (hilo principal). JSON por stdout; exit 0; 1 con el motivo en stderr; 2 por uso.
// Uso: node plan-audit.js <verbo> --plan <slug> [opciones] [--cwd <dir>]
//   check --plan-file <md> [--root <dir>] [--plan <slug>]   evidencia para el paso 1 (no entra al veredicto)
//   begin-review --plan-file <md>        abre el modo review (el plan-auditor sin Bash)
//   review-done --report-file <md>       guarda las afirmaciones y hallazgos del paso 1
//   probes                               2a: sondas fijas sobre las afirmaciones
//   begin-verify                         2b: abre el modo verify con las que quedan
//   finish [--report-file <md>]          arma el veredicto, lo registra y borra el modo
//   end                                  limpieza tras un corte
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const ps = require('../lib/plan-state');
const pa = require('../lib/plan-audit');
const { runProbes } = require('../lib/plan-probes');
const { checkPlan, toFindings, isCardPlan, problemCount } = require('../lib/plan-check');

class Usage extends Error {}
class Fail extends Error {}

const SPEC = {
  check: { value: ['plan', 'plan-file', 'root', 'cwd'], need: ['plan-file'] },
  'begin-review': { value: ['plan', 'plan-file', 'cwd'], need: ['plan', 'plan-file'] },
  'review-done': { value: ['plan', 'report-file', 'cwd'], need: ['plan', 'report-file'] },
  probes: { value: ['plan', 'cwd'], need: ['plan'] },
  'begin-verify': { value: ['plan', 'cwd'], need: ['plan'] },
  finish: { value: ['plan', 'report-file', 'cwd'], need: ['plan'] },
  end: { value: ['plan', 'cwd'], need: ['plan'] },
};

function parse(argv) {
  const [verb, ...rest] = argv;
  const spec = SPEC[verb];
  if (!spec) throw new Usage(`uso: plan-audit.js ${Object.keys(SPEC).join('|')} --plan <slug> [opciones]`);
  const o = {};
  for (let i = 0; i < rest.length; i += 1) {
    const name = rest[i].startsWith('--') ? rest[i].slice(2) : null;
    if (!name || !spec.value.includes(name)) throw new Usage(`opción desconocida para ${verb}: ${rest[i]}`);
    i += 1;
    if (rest[i] === undefined) throw new Usage(`--${name} necesita un valor`);
    o[name] = rest[i];
  }
  const missing = spec.need.filter((k) => !o[k]);
  if (missing.length) throw new Usage(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
  if (o.plan !== undefined && !ps.SLUG_RE.test(o.plan)) throw new Usage(`--plan debe cumplir ${ps.SLUG_RE}`);
  return { verb, o };
}

const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);
const read = (f, what) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { throw new Usage(`no se pudo leer ${what} (${f}): ${e.message}`); } };
const sha = (f) => { try { return ps.sha256(fs.readFileSync(f)); } catch (e) { throw new Usage(`no se pudo leer el plan (${f}): ${e.message}`); } };
const writeJson = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`); };
const readJson = (file, what, verbHint) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { throw new Fail(`falta ${what}: corré antes ${verbHint}`); }
};

function run(verb, o, main) {
  const dir = o.plan ? pa.auditDir(main, o.plan) : null;
  switch (verb) {
    case 'check': {
      const planText = read(o['plan-file'], '--plan-file');
      if (!isCardPlan(planText)) return out({ applies: false });
      const root = path.resolve(o.root || process.cwd());
      if (!fs.existsSync(root)) throw new Usage(`la raíz no existe: ${root}`);
      const res = checkPlan({ planText, root, runTests: true });
      return out({ applies: true, problems: problemCount(res), findings: toFindings(res) });
    }
    case 'begin-review': {
      const planSha256 = sha(o['plan-file']);
      const prev = pa.readRound({ main, plan: o.plan });
      if (prev.error) throw new Fail(prev.error);
      if (prev.round === 2) throw new Fail('la auditoría ya tuvo su re-auditoría; decide el humano (para empezar de cero: plan-audit.js end)');
      let round = 1;
      let reaudit = null;
      if (prev.round === 1 && prev.verdict === 'REQUEST_CHANGES') {
        if (prev.planSha256 === planSha256) throw new Fail('el plan no cambió desde la vuelta 1 (mismo sha256): arreglalo antes de re-auditar');
        round = 2;
        reaudit = { diff: path.join(dir, 'reaudit.diff'), findings: path.join(dir, 'reaudit-findings.json') };
        let before;
        try { before = fs.readFileSync(path.join(dir, 'plan-round1.md'), 'utf8'); } catch (_) { throw new Fail('falta la copia del plan de la vuelta 1: corré plan-audit.js end y empezá de cero'); }
        fs.writeFileSync(reaudit.diff, pa.lineDiff(before, read(o['plan-file'], '--plan-file')));
        writeJson(reaudit.findings, prev.findings || []);
      }
      const m = pa.beginMode({ main, plan: o.plan, mode: 'review', claims: [], planSha256 });
      fs.rmSync(path.join(dir, 'review.json'), { force: true });
      fs.rmSync(path.join(dir, 'probes.json'), { force: true });
      fs.copyFileSync(o['plan-file'], path.join(dir, `plan-round${round}.md`));
      pa.writeRound({ main, plan: o.plan, data: { round, phase: 'running', planSha256 } });
      return out({ ok: true, mode: m.mode, expires: m.expires, dir, round, ...(reaudit ? { reaudit: true, diff: reaudit.diff, findings: reaudit.findings } : {}) });
    }
    case 'review-done': {
      const r = pa.parseReview(read(o['report-file'], '--report-file'));
      if (r.error) throw new Fail(`el informe del paso 1 no vale: ${r.error}`);
      let planSha256 = '';
      try { planSha256 = JSON.parse(fs.readFileSync(path.join(dir, 'mode.json'), 'utf8')).planSha256 || ''; } catch (_) { /* sin modo: sin sha */ }
      writeJson(path.join(dir, 'review.json'), { findings: r.findings, claims: r.claims, planSha256 });
      fs.rmSync(path.join(dir, 'probes.json'), { force: true });
      return out({ ok: true, findings: r.findings.length, claims: r.claims.length });
    }
    case 'probes': {
      const review = readJson(path.join(dir, 'review.json'), 'review.json', 'review-done');
      const res = runProbes({ claims: review.claims });
      writeJson(path.join(dir, 'probes.json'), res);
      const remaining = review.claims.map((c) => c.id).filter((id) => !res.closed.includes(id));
      return out({ closed: res.closed, remaining, findings: res.findings.length });
    }
    case 'begin-verify': {
      const review = readJson(path.join(dir, 'review.json'), 'review.json', 'review-done');
      let closed = [];
      try { closed = JSON.parse(fs.readFileSync(path.join(dir, 'probes.json'), 'utf8')).closed || []; } catch (_) { /* sin sondas */ }
      const remaining = review.claims.filter((c) => !closed.includes(c.id));
      if (!remaining.length) return out({ skipped: true, remaining: [] });
      pa.beginMode({ main, plan: o.plan, mode: 'verify', claims: remaining, planSha256: review.planSha256 });
      const scratch = path.join(dir, 'scratch');
      fs.mkdirSync(scratch, { recursive: true });
      return out({ skipped: false, remaining: remaining.map((c) => c.id), scratch });
    }
    case 'finish': {
      const review = readJson(path.join(dir, 'review.json'), 'review.json', 'review-done');
      let probe = { closed: [], findings: [] };
      try { probe = JSON.parse(fs.readFileSync(path.join(dir, 'probes.json'), 'utf8')); } catch (_) { /* sin sondas */ }
      // check.json no se suma al veredicto: el revisor lo recibió como evidencia y repite en sus
      // findings lo que es real (una falsa alarma del heurístico no puede trabar el plan).
      const remaining = review.claims.filter((c) => !probe.closed.includes(c.id));
      if (remaining.length && !o['report-file']) throw new Fail(`faltan los experimentos de ${remaining.map((c) => c.id).join(', ')}: pasá --report-file con el informe del paso 2b`);
      const verification = remaining.length ? pa.parseVerification(read(o['report-file'], '--report-file'), remaining) : { entries: [], missing: [] };
      const counters = pa.readCounters({ main, plan: o.plan });
      // Reclamos sin ningún experimento corrido (el hook cuenta las llamadas a Bash del modo):
      // un informe con `holds` solo de palabra no alcanza para APPROVE.
      const noExperiments = remaining.length > 0 && counters.experiments < remaining.length;
      let built = pa.buildAudit({ review, probe, verification, mode: { incomplete: counters.incomplete || noExperiments } });
      const cur = pa.readRound({ main, plan: o.plan });
      if (cur.error) throw new Fail(cur.error);
      const round = cur.round === 2 ? 2 : 1;
      // Vuelta 2: los hallazgos que frenan van al humano, nunca a otra vuelta (D-2). La compuerta no cambia: solo APPROVE abre audited.
      if (round === 2 && built.verdict === 'REQUEST_CHANGES') built = { ...built, verdict: 'ESCALATE', reason: 'reaudit-findings', incomplete: true };
      const audit = { ...built, round, at: new Date().toISOString(), planSha256: review.planSha256 };
      const rec = ps.recordAudit({ main, plan: o.plan, audit });
      pa.endMode({ main, plan: o.plan });
      pa.writeRound({ main, plan: o.plan, data: { round, phase: 'done', verdict: built.verdict, findings: built.findings, planSha256: review.planSha256 } });
      out({ verdict: built.verdict, round, findings: built.findings, minors: built.minors, incomplete: built.incomplete, reason: built.reason, recorded: rec.ok });
      if (!rec.ok) throw new Fail(`no se pudo registrar la auditoría: ${rec.error}`);
      return undefined;
    }
    default: // end
      pa.endMode({ main, plan: o.plan });
      pa.endRounds({ main, plan: o.plan });
      return out({ ok: true });
  }
}

try {
  const { verb, o } = parse(process.argv.slice(2));
  run(verb, o, mainRoot(o.cwd || process.cwd()));
} catch (e) {
  process.stderr.write(`pignolo plan-audit: ${e.message}\n`);
  process.exitCode = e instanceof Usage ? 2 : 1;
}
