// Final report pieces (spec §12): the first line, the report.json skeleton and the verdict.
//
// firstLine(facts) -> string      facts.canvas: published | local-fallback (+ facts.reasons) adds " · lienzo: ..." to the line
// reportSkeleton({ project, run, implementsPath }) -> { version, implemented, implements?, evidence, claims, candidates }
// verdict({ uiCheck, reportCheck, build }) -> { status: 'terminado' | 'BLOCKED' | 'sin verificar', reasons }
//   uiCheck.stale  (string) ui-check.json no longer matches the files it checked: sin verificar
//   build.declared the project declares typecheck/build/lint: without build.ran it is sin verificar
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { manifestSha } from './approved.mjs';

export function firstLine(facts) {
  const s = facts && facts.subagents;
  if (!facts || typeof facts.pluginVersion !== 'string' || !facts.pluginVersion) throw new Error('facts: falta pluginVersion');
  if (!s || !Number.isInteger(s.requested) || !Number.isInteger(s.launched) || typeof s.model !== 'string' || !s.model) {
    throw new Error('facts: subagents necesita requested y launched (enteros) y model');
  }
  const { pluginVersion, subagents = {}, sequential = false, notIndependentAudit = false } = facts;
  const degraded = [...(facts.degraded || [])];
  if (notIndependentAudit) degraded.push('auditoría no independiente');
  let canvas = '';
  if (facts.canvas === 'published') canvas = ' · lienzo: publicado';
  else if (facts.canvas === 'local-fallback') {
    const why = Array.isArray(facts.reasons) && facts.reasons.length ? facts.reasons.join(', ') : 'sin motivo';
    canvas = ` · lienzo: local (${why})`;
  } else if (facts.canvas !== undefined) throw new Error('facts: canvas debe ser published o local-fallback');
  const version = `pignolo-ui ${pluginVersion} · ${degraded.length ? degraded.join('; ') : 'sin degradaciones'} · subagentes: ${subagents.launched} de ${subagents.requested} (modelo pedido: ${subagents.model})${canvas}`;
  if (!sequential) return version;
  return `opciones generadas en secuencia en el hilo principal: no son independientes; se lanzaron ${subagents.launched} de ${subagents.requested} subagentes\n${version}`;
}

const SOURCES = [['browser', 'browser.json'], ['ui-check', 'ui-check.json']];
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function reportSkeleton({ project, run, implementsPath }) {
  const evidence = {};
  const candidates = [];
  let n = 0;
  const seen = new Set();
  for (const [source, name] of SOURCES) {
    const file = path.join(run, name);
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    evidence[name] = sha256(buf);
    const json = JSON.parse(buf.toString('utf8'));
    for (const e of Array.isArray(json.entries) ? json.entries : []) {
      if (e.status !== 'fail') continue;
      // ui-check.json also carries the browser entries when it ran with --measures: one claim each
      if (source === 'ui-check' && seen.has(e.id + '|' + e.fingerprint)) continue;
      seen.add(e.id + '|' + e.fingerprint);
      n += 1;
      const c = { id: `c${n}`, rule: e.id, status: e.status };
      if (e.measure && typeof e.measure === 'object' && Object.keys(e.measure).length) c.measure = e.measure;
      c.ref = { source, fingerprint: e.fingerprint };
      candidates.push(c);
    }
  }
  const skeleton = { version: 1, implemented: false, evidence, claims: [], candidates };
  if (implementsPath) {
    skeleton.implemented = true;
    skeleton.implements = { path: implementsPath, manifestSha256: manifestSha(project, implementsPath) };
  }
  return skeleton;
}

export function verdict({ uiCheck, reportCheck, build }) {
  const reasons = [];
  const unverified = [];
  if (!uiCheck) unverified.push('ui-check no corrió');
  else if (uiCheck.exitCode === 2) unverified.push('ui-check falló (exit 2)');
  else if (uiCheck.stale) unverified.push(`ui-check.json desactualizado: ${uiCheck.stale}`);
  if (!reportCheck) unverified.push('report-check no corrió');
  else if (reportCheck.exitCode === 2) unverified.push('report-check falló (exit 2)');
  const blocked = [];
  if (uiCheck && uiCheck.exitCode !== 2 && (uiCheck.blockingNew > 0 || uiCheck.exitCode === 1)) {
    blocked.push(`bloquea nuevo en alcance (${uiCheck.blockingNew ?? 0})`);
  }
  if (reportCheck && reportCheck.exitCode === 1) blocked.push(`report-check retiró ${(reportCheck.retired || []).length} afirmaciones`);
  if (build && build.ran && build.ok === false) blocked.push(`build roto (${build.script ?? 'build'})`);
  const noBuild = !build || build.ran === false;
  if (noBuild && build && build.declared) unverified.push('build sin informar: el proyecto declara typecheck, build o lint y falta --build-ok');
  else if (noBuild) reasons.push('no verificado: el proyecto no declara build');
  if (unverified.length) return { status: 'sin verificar', reasons: [...unverified, ...reasons] };
  if (blocked.length) return { status: 'BLOCKED', reasons: [...blocked, ...reasons] };
  return { status: 'terminado', reasons };
}
