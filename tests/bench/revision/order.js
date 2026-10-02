'use strict';
// Prints the shuffled run order fixed by the cards.
//   node tests/bench/revision/order.js lentes [--stage A|B]
//   node tests/bench/revision/order.js momento [--include-reused]
// The run list is sorted alphabetically and shuffled with mulberry32(seed) (see lib.js).
const { loadCases, shuffle, parseArgs } = require('./lib');

function lentesRuns(cases, stage = 'B') {
  const l = cases.lentes;
  const ids = stage === 'A' ? l.stageA.cases : l.cases.map((c) => c.id);
  const lenses = stage === 'A' ? l.stageA.lenses : l.lenses;
  const reps = stage === 'A' ? l.stageA.runs : l.reps;
  const out = [];
  for (const c of ids) for (const lens of lenses) for (let r = 1; r <= reps; r += 1) out.push(`${c}|${lens}|${r}`);
  return out.sort();
}

function momentoRuns(cases, { includeReused = false } = {}) {
  const m = cases.momento;
  const out = [];
  for (const b of m.blocks) {
    for (const run of b.runs) {
      if (run.reusedFrom && !includeReused) continue;
      for (let r = 1; r <= m.reps; r += 1) out.push(`${b.id}|${run.id}|${r}`);
    }
  }
  return out.sort();
}

function lentesOrder(cases, stage = 'B') {
  const list = lentesRuns(cases, stage);
  // Stage A runs under `claude plugin eval -j 2` in case order; the card fixes no shuffle for it.
  return stage === 'A' ? list : shuffle(list, cases.lentes.seed);
}
function momentoOrder(cases, opts) {
  return shuffle(momentoRuns(cases, opts), cases.momento.seed);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const which = args._[0];
  const cases = loadCases();
  let list;
  if (which === 'lentes') list = lentesOrder(cases, args.stage || 'B');
  else if (which === 'momento') list = momentoOrder(cases, { includeReused: Boolean(args['include-reused']) });
  else {
    process.stderr.write('uso: node order.js lentes [--stage A|B] | momento [--include-reused]\n');
    process.exit(2);
  }
  list.forEach((id, i) => process.stdout.write(`${i + 1}\t${id}\n`));
}

module.exports = { lentesRuns, momentoRuns, lentesOrder, momentoOrder };
