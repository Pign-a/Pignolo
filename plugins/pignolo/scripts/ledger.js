'use strict';
// CLI del ledger de revisión (spec §12). Salida JSON; exit 0; 1 si el ledger no valida o
// el candidato no está congelado; 2 por uso incorrecto.
// Uso:
//   validate <archivo> | plan --level <l> [--profile <p>] | judgment <a.json> <b.json>
//   refute --profile <p> --level <l> <verdicts.json>          (una lista de veredictos)
//   refute --ledger <archivo> <verdicts.json>                 ({ "<id>": [veredictos] })
//   build --sha <sha> --level <l> [--profile <p>] --out <archivo> [--judgment <j.json>] [<informe.json>...]
//   repro --ledger <archivo> --id <id> --red | --no-red
//   round --ledger <archivo> --sha <sha> [--fixed <id>]... [--judgment <j.json>] [<informe.json>...]
//   next --ledger <archivo>
//   frozen --cwd <dir> --sha <sha>
//   save --ledger <archivo> --cwd <dir> [--kind review|judgment]
// Los verbos con --ledger reescriben ese archivo en el lugar (escritura atómica).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const L = require('../lib/ledger');
const { readConfig } = require('../lib/profiles');
const { headSha, workingTree } = require('../lib/changes');
const { gitRun } = require('../lib/git');
const { repoIdFor } = require('../lib/seals');
const { pignoloHome } = require('../lib/home');

const GIT_MS = 60000;
const VALUE = ['level', 'profile', 'sha', 'out', 'ledger', 'id', 'cwd', 'judgment', 'round', 'kind'];
const MULTI = ['fixed'];
const BOOL = ['red', 'no-red'];

class Usage extends Error {}
class Fail extends Error {}

function parse(argv) {
  const o = { pos: [], fixed: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { o.pos.push(a); continue; }
    const k = a.slice(2);
    if (BOOL.includes(k)) { o[k] = true; continue; }
    if (!VALUE.includes(k) && !MULTI.includes(k)) throw new Usage(`opción desconocida: ${a}`);
    i += 1;
    if (argv[i] === undefined) throw new Usage(`${a} necesita un valor`);
    if (MULTI.includes(k)) o[k].push(argv[i]);
    else o[k] = argv[i];
  }
  return o;
}

function readJson(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Fail(`no se pudo leer ${f} como JSON: ${e.message}`);
  }
}

// Los errores de datos de la biblioteca (hallazgo sin id, id repetido...) son un ledger que
// no valida (exit 1), no un uso incorrecto.
function asFail(fn) {
  try {
    return fn();
  } catch (e) {
    throw e instanceof Fail || e instanceof Usage ? e : new Fail(e.message);
  }
}
const print = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Sin --profile, el del usuario (~/.pignolo/config.json; balanced por defecto).
const profileOf = (o) => o.profile || readConfig().profile;

function need(o, ...keys) {
  for (const k of keys) if (o[k] === undefined) throw new Usage(`falta --${k}`);
}

function checked(ledger) {
  const errors = L.validateLedger(ledger);
  if (errors.length) throw new Fail(`el ledger no valida: ${errors.join('; ')}`);
  return ledger;
}

// Congelado (§12): HEAD es el SHA revisado y la copia de trabajo es el árbol de ese commit.
function frozen(cwd, sha) {
  const head = headSha({ cwd, timeoutMs: GIT_MS });
  let headTree = null;
  if (head) headTree = gitRun(['rev-parse', `${head}^{tree}`], cwd, { timeout: GIT_MS });
  const tree = workingTree({ cwd, timeoutMs: GIT_MS });
  const ok = L.isFrozen({ sha }, head, { headTree, workingTree: tree });
  let reason = null;
  if (!ok) reason = head !== sha ? `HEAD es ${head}, no ${sha}` : 'hay cambios sin commitear en la copia de trabajo';
  return { frozen: ok, head, reason };
}

const VERBS = {
  validate(o) {
    if (o.pos.length !== 1) throw new Usage('validate <archivo>');
    const errors = L.validateLedger(readJson(o.pos[0]));
    print({ ok: errors.length === 0, errors });
    return errors.length ? 1 : 0;
  },
  plan(o) {
    need(o, 'level');
    print(L.reviewPlan({ level: o.level, profile: profileOf(o) }));
    return 0;
  },
  judgment(o) {
    if (o.pos.length !== 2) throw new Usage('judgment <a.json> <b.json>');
    print(L.judgment(readJson(o.pos[0]), readJson(o.pos[1])));
    return 0;
  },
  refute(o) {
    if (o.pos.length !== 1) throw new Usage('refute ... <verdicts.json>');
    const verdicts = readJson(o.pos[0]);
    if (!o.ledger) {
      need(o, 'level', 'profile');
      print({ result: L.refutation(verdicts, { profile: o.profile, level: o.level }) });
      return 0;
    }
    const ledger = checked(readJson(o.ledger));
    if (verdicts === null || typeof verdicts !== 'object' || Array.isArray(verdicts)) {
      throw new Usage('con --ledger, verdicts.json es { "<id>": [veredictos] }');
    }
    const results = {};
    const findings = ledger.findings.map((f) => {
      if (!Object.prototype.hasOwnProperty.call(verdicts, f.id)) return f;
      results[f.id] = L.refutation(verdicts[f.id], { profile: ledger.profile, level: ledger.level });
      return results[f.id] === 'refuted' ? { ...f, status: 'refuted' } : f;
    });
    writeJson(o.ledger, { ...ledger, findings });
    print({ results });
    return 0;
  },
  build(o) {
    need(o, 'sha', 'level', 'out');
    const reports = o.pos.map(readJson);
    const j = o.judgment ? readJson(o.judgment) : null;
    const ledger = asFail(() => L.buildLedger({
      sha: o.sha, level: o.level, profile: profileOf(o), round: o.round === undefined ? 0 : Number(o.round), reports, judgment: j,
    }));
    checked(ledger);
    writeJson(o.out, ledger);
    print({ ok: true, file: path.resolve(o.out), findings: ledger.findings.length });
    return 0;
  },
  repro(o) {
    need(o, 'ledger', 'id');
    if (Boolean(o.red) === Boolean(o['no-red'])) throw new Usage('repro necesita --red o --no-red');
    const ledger = checked(readJson(o.ledger));
    const i = ledger.findings.findIndex((f) => f.id === o.id);
    if (i < 0) throw new Fail(`no hay un hallazgo ${o.id} en el ledger`);
    const finding = L.applyRepro(ledger.findings[i], { red: o.red === true });
    ledger.findings[i] = finding;
    writeJson(o.ledger, ledger);
    print({ finding });
    return 0;
  },
  round(o) {
    need(o, 'ledger', 'sha');
    const ledger = checked(readJson(o.ledger));
    if (ledger.round >= 2) throw new Fail('máximo 2 rondas de fix (§12): lo abierto se escala');
    // Un --fixed que no nombra un hallazgo confirmed gastaría la ronda sin arreglar nada.
    for (const id of o.fixed) {
      const f = ledger.findings.find((x) => x.id === id);
      if (!f) throw new Fail(`--fixed ${id}: no hay un hallazgo con ese id en el ledger`);
      if (f.status !== 'confirmed') throw new Fail(`--fixed ${id}: el hallazgo está ${f.status}, no confirmed`);
    }
    const reports = o.pos.map(readJson);
    const j = o.judgment ? readJson(o.judgment) : null;
    const next = checked(asFail(() => L.nextRound(ledger, { sha: o.sha, fixed: o.fixed, reports, judgment: j })));
    writeJson(o.ledger, next);
    print({ ok: true, round: next.round });
    return 0;
  },
  next(o) {
    need(o, 'ledger');
    print({ next: L.nextStep(checked(readJson(o.ledger))) });
    return 0;
  },
  frozen(o) {
    need(o, 'cwd', 'sha');
    const r = frozen(path.resolve(o.cwd), o.sha);
    print(r);
    return r.frozen ? 0 : 1;
  },
  save(o) {
    need(o, 'ledger', 'cwd');
    const kind = o.kind || 'review';
    if (!['review', 'judgment'].includes(kind)) throw new Usage('--kind debe ser review o judgment');
    const ledger = checked(readJson(o.ledger));
    const repoId = repoIdFor({ cwd: path.resolve(o.cwd), timeoutMs: GIT_MS });
    const file = path.join(pignoloHome(), 'reviews', repoId, `${ledger.sha}-${kind}.json`);
    writeJson(file, ledger);
    print({ ok: true, file });
    return 0;
  },
};

try {
  const [verb, ...rest] = process.argv.slice(2);
  if (!VERBS[verb]) throw new Usage('uso: ledger.js validate|plan|judgment|refute|build|repro|round|next|frozen|save [opciones]');
  process.exitCode = VERBS[verb](parse(rest));
} catch (e) {
  process.stderr.write(`pignolo ledger: ${e.message}\n`);
  process.exitCode = e instanceof Fail ? 1 : 2;
}
