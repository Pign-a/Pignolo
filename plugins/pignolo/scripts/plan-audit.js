#!/usr/bin/env node
'use strict';
// La receta de tres pasos del plan-auditor, en el orden en que la corre el orquestador
// (hilo principal). JSON por stdout; exit 0; 1 con el motivo en stderr; 2 por uso.
// Uso: node plan-audit.js <verbo> --plan <slug> [opciones] [--cwd <dir>]
//   check --plan-file <md> [--root <dir>] [--plan <slug>]   evidencia para el paso 1 (no entra al veredicto)
//   begin-review --plan-file <md> [--extra-round]   abre el modo review (el plan-auditor sin Bash); --extra-round abre
//                                        una vuelta acotada más tras ESCALATE reaudit-findings (cada una con su flag)
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
  'begin-review': { value: ['plan', 'plan-file', 'cwd'], flag: ['extra-round'], need: ['plan', 'plan-file'] },
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
    if (name && (spec.flag || []).includes(name)) { o[name] = true; continue; }
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
      const wantExtra = o['extra-round'] === true;
      const extraOk = prev.round === 2 && prev.phase === 'done' && prev.verdict === 'ESCALATE' && prev.reason === 'reaudit-findings';
      if (prev.round === 2 && !(wantExtra && extraOk)) {
        throw new Fail(`la auditoría ya tuvo su re-auditoría; decide el humano (para empezar de cero: plan-audit.js end${extraOk ? '; otra vuelta acotada solo con el sí del humano: begin-review --extra-round' : ''})`);
      }
      if (wantExtra && prev.round !== 2) throw new Fail('--extra-round solo vale tras una re-auditoría que terminó en ESCALATE reaudit-findings');
      let round = 1;
      let extra = 0;
      let reaudit = null;
      let carry = [];
      if (prev.round === 2 || (prev.round === 1 && prev.verdict === 'REQUEST_CHANGES')) {
        const label = prev.round === 2 ? `la vuelta 2${prev.extra ? ` (extra ${prev.extra})` : ''}` : 'la vuelta 1';
        if (prev.planSha256 === planSha256) throw new Fail(`el plan no cambió desde ${label} (mismo sha256): arreglalo antes de re-auditar`);
        let before;
        try { before = fs.readFileSync(path.join(dir, `plan-round${prev.round}.md`), 'utf8'); } catch (_) { throw new Fail('falta la copia del plan de la vuelta anterior: corré plan-audit.js end y empezá de cero'); }
        const diff = pa.lineDiff(before, read(o['plan-file'], '--plan-file'));
        const flat = (s) => String(s).replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
        if (diff.trim() === '' || flat(before) === flat(read(o['plan-file'], '--plan-file'))) throw new Fail(`el plan no cambió desde ${label} (el diff queda vacío o solo cambian el BOM, el fin de línea o los espacios al final): arreglalo antes de re-auditar`);
        round = 2;
        extra = wantExtra ? (prev.extra || 0) + 1 : 0;
        carry = prev.carry;
        reaudit = { diff: path.join(dir, 'reaudit.diff'), findings: path.join(dir, 'reaudit-findings.json') };
        fs.writeFileSync(reaudit.diff, diff);
        writeJson(reaudit.findings, pa.withIds(prev.findings));
      }
      const m = pa.beginMode({ main, plan: o.plan, mode: 'review', claims: [], planSha256 });
      fs.rmSync(path.join(dir, 'review.json'), { force: true });
      fs.rmSync(path.join(dir, 'probes.json'), { force: true });
      fs.copyFileSync(o['plan-file'], path.join(dir, `plan-round${round}.md`));
      pa.writeRound({ main, plan: o.plan, data: { round, extra, phase: 'running', planSha256, carry } });
      return out({ ok: true, mode: m.mode, expires: m.expires, dir, round, ...(reaudit ? { reaudit: true, extra, carried: carry.map((c) => c.id), diff: reaudit.diff, findings: reaudit.findings } : {}) });
    }
    case 'review-done': {
      const r = pa.parseReview(read(o['report-file'], '--report-file'));
      if (r.error) throw new Fail(`el informe del paso 1 no vale: ${r.error}`);
      const cur = pa.readRound({ main, plan: o.plan });
      if (cur.error) throw new Fail(cur.error);
      // R-9: el sha del plan auditado sale siempre del modo o, si ya se cerró, de round.json; sin ninguno no se guarda nada.
      let planSha256 = '';
      try { planSha256 = JSON.parse(fs.readFileSync(path.join(dir, 'mode.json'), 'utf8')).planSha256 || ''; } catch (_) { /* sin modo: round.json */ }
      if (!planSha256 && typeof cur.planSha256 === 'string') planSha256 = cur.planSha256;
      if (!planSha256) throw new Fail('no hay un plan auditado registrado (ni modo ni round.json): corré antes plan-audit.js begin-review');
      // R-8: las afirmaciones de la vuelta anterior que quedaron sin verificar se verifican ahora (o el veredicto es ESCALATE).
      const carried = cur.round === 2 ? cur.carry.filter((c) => c && typeof c === 'object' && typeof c.id === 'string') : [];
      const carriedIds = new Set(carried.map((c) => c.id));
      // RR-02: el renombrado no puede chocar con un id del revisor ni con otro ya asignado.
      const taken = new Set([...carriedIds, ...r.claims.map((c) => c.id)]);
      const fresh = r.claims.map((c) => {
        if (!carriedIds.has(c.id)) return c;
        let id = `${c.id}-new`;
        while (taken.has(id)) id += '-new';
        taken.add(id);
        return { ...c, id };
      });
      const claims = [...carried.map((c) => ({ ...c, carried: true })), ...fresh];
      writeJson(path.join(dir, 'review.json'), { findings: r.findings, claims, closed: r.closed, planSha256 });
      fs.rmSync(path.join(dir, 'probes.json'), { force: true });
      return out({ ok: true, findings: r.findings.length, claims: claims.length, carried: carried.length });
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
      const cur = pa.readRound({ main, plan: o.plan });
      if (cur.error) throw new Fail(cur.error);
      // RR-01: finish solo sirve con una vuelta abierta; ya cerrada, no puede cambiar el veredicto guardado.
      const round = cur.round === 2 ? 2 : 1;
      const extra = round === 2 ? cur.extra : 0;
      // check.json no se suma al veredicto: el revisor lo recibió como evidencia y repite en sus
      // findings lo que es real (una falsa alarma del heurístico no puede trabar el plan).
      const remaining = review.claims.filter((c) => !probe.closed.includes(c.id));
      // Las afirmaciones arrastradas de la vuelta anterior sin informe del paso 2b quedan sin verificar (ESCALATE), no son un error de uso.
      if (remaining.some((c) => !c.carried) && !o['report-file']) throw new Fail(`faltan los experimentos de ${remaining.map((c) => c.id).join(', ')}: pasá --report-file con el informe del paso 2b`);
      const verification = remaining.length && o['report-file'] ? pa.parseVerification(read(o['report-file'], '--report-file'), remaining) : { entries: [], missing: remaining.map((c) => c.id) };
      const counters = pa.readCounters({ main, plan: o.plan });
      // Reclamos sin ningún experimento corrido (el hook cuenta las llamadas a Bash del modo):
      // un informe con `holds` solo de palabra no alcanza para APPROVE.
      const noExperiments = remaining.length > 0 && counters.experiments < remaining.length;
      const incomplete = counters.incomplete || noExperiments;
      // R-11: los hallazgos de la vuelta anterior que el informe no da por cerrados siguen frenando.
      let reopened = [];
      if (round === 2) {
        let previous;
        try { previous = JSON.parse(fs.readFileSync(path.join(dir, 'reaudit-findings.json'), 'utf8')); } catch (_) { throw new Fail('falta reaudit-findings.json: corré plan-audit.js end y empezá de cero'); }
        if (!Array.isArray(previous)) throw new Fail('reaudit-findings.json no es una lista: corré plan-audit.js end y empezá de cero');
        reopened = pa.notClosed({ previous, closed: review.closed, findings: review.findings });
      }
      // RR-04: el kind not-closed solo lo pone el script.
      const own = review.findings.map((f) => (f && f.kind === 'not-closed' ? { ...f, kind: 'reviewer' } : f));
      let built = pa.buildAudit({ review: { ...review, findings: [...own, ...reopened] }, probe, verification, mode: { incomplete } });
      built = { ...built, findings: pa.assignIds(built.findings, pa.roundPrefix(round, extra)) };
      // R-8: lo que no quedó verificado (y no es falso) pasa a la vuelta siguiente.
      const carry = remaining.filter((c) => {
        const e = verification.entries.find((x) => x.id === c.id);
        if (e && e.verdict === 'false') return false;
        return incomplete || !e || e.verdict === 'inconclusive';
      }).map(({ carried, ...c }) => c);
      // Vuelta 2: los hallazgos que frenan van al humano, nunca a otra vuelta (D-2). La compuerta no cambia: solo APPROVE abre audited.
      if (round === 2 && built.verdict === 'REQUEST_CHANGES') built = { ...built, verdict: 'ESCALATE', reason: 'reaudit-findings', incomplete: true };
      if (cur.phase === 'done' && built.verdict !== cur.verdict) throw new Fail(`la vuelta ya terminó con ${cur.verdict}; un finish repetido no puede cambiarlo a ${built.verdict}: abrí otra vuelta con begin-review`);
      const audit = { ...built, round, at: new Date().toISOString(), planSha256: review.planSha256 };
      const rec = ps.recordAudit({ main, plan: o.plan, audit });
      pa.endMode({ main, plan: o.plan });
      pa.writeRound({ main, plan: o.plan, data: { round, extra, phase: 'done', verdict: built.verdict, reason: built.reason, findings: built.findings, carry, planSha256: review.planSha256 } });
      out({ verdict: built.verdict, round, extra, findings: built.findings, minors: built.minors, incomplete: built.incomplete, reason: built.reason, carried: carry.map((c) => c.id), recorded: rec.ok });
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
