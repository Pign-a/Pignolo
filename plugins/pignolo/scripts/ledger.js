'use strict';
// CLI del ledger de revisión. Salida JSON; exit 0, 1 si validate encuentra errores, 2 uso.
// Uso: validate <archivo> | plan --level <l> --profile <p> | judgment <a.json> <b.json>
//      | refute --profile <p> --level <l> <verdicts.json>
const fs = require('node:fs');
const L = require('../lib/ledger');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = () => {
  const out = [];
  for (let i = 1; i < args.length; i += 1) {
    if (args[i].startsWith('--')) i += 1;
    else out.push(args[i]);
  }
  return out;
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const usage = () => {
  process.stderr.write('uso: ledger.js validate <archivo> | plan --level <l> --profile <p> | judgment <a.json> <b.json> | refute --profile <p> --level <l> <verdicts.json>\n');
  process.exitCode = 2;
};
const print = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);

try {
  const cmd = args[0];
  const pos = positional();
  if (cmd === 'validate' && pos.length === 1) {
    const errors = L.validateLedger(readJson(pos[0]));
    print({ ok: errors.length === 0, errors });
    process.exitCode = errors.length ? 1 : 0;
  } else if (cmd === 'plan' && opt('level') && opt('profile')) {
    print(L.reviewPlan({ level: opt('level'), profile: opt('profile') }));
  } else if (cmd === 'judgment' && pos.length === 2) {
    print(L.judgment(readJson(pos[0]), readJson(pos[1])));
  } else if (cmd === 'refute' && opt('level') && opt('profile') && pos.length === 1) {
    print({ result: L.refutation(readJson(pos[0]), { profile: opt('profile'), level: opt('level') }) });
  } else usage();
} catch (e) {
  process.stderr.write(`pignolo ledger: ${e.message}\n`);
  process.exitCode = 2;
}
