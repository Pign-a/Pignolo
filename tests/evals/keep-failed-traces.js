'use strict';
// G17: una falla de eval sin traza no se puede explicar (WSL vacía /tmp al reiniciar la sesión).
// Copia la traza de toda corrida fallada del JSON de `claude plugin eval ... --keep-temp --json <f>` a
// una carpeta persistente (tests/evals/generated/traces/<corrida>/, fuera de git). Lo usan las evals
// de los hitos 7 y 8. No borra nada: los temporales %TEMP%\claude-eval-* se limpian aparte.
//
// Forma del JSON (claude 2.1.285, verificada contra resultados reales): cases[].name y
// cases[].arms.<brazo>[] con { passed, error, tracePath, ... } por corrida; `with` es el brazo normal.
// Una corrida falló si passed !== true o trae error.
//
// Uso: node tests/evals/keep-failed-traces.js <resultados.json> [--temp-root <dir>] [--out <dir>]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EVAL_TMP_RE = /claude-eval-[^\\/]+[\\/].*$/;

// Dónde está hoy la traza: tracePath si existe; si no, el mismo `claude-eval-*/...` bajo tempRoot
// (el JSON puede venir de otro sistema de rutas, p. ej. WSL leído desde Windows).
function locate(tracePath, tempRoot) {
  if (typeof tracePath !== 'string' || !tracePath) return null;
  if (fs.existsSync(tracePath)) return tracePath;
  const m = EVAL_TMP_RE.exec(tracePath);
  if (!m) return null;
  const alt = path.join(tempRoot, ...m[0].split(/[\\/]+/));
  return fs.existsSync(alt) ? alt : null;
}

// { copied: [archivo destino], missing: ['<caso>-<n>'] }
function persistFailedTraces({ resultsJson, tempRoot = os.tmpdir(), outDir }) {
  if (!outDir) throw new Error('persistFailedTraces: falta outDir');
  const results = typeof resultsJson === 'string' ? JSON.parse(fs.readFileSync(resultsJson, 'utf8')) : resultsJson;
  if (!results || !Array.isArray(results.cases)) throw new Error('persistFailedTraces: el JSON no trae cases[]');
  const copied = [];
  const missing = [];
  for (const c of results.cases) {
    for (const [arm, runs] of Object.entries(c.arms || {})) {
      (Array.isArray(runs) ? runs : []).forEach((run, i) => {
        if (run && run.passed === true && !run.error) return;
        const label = `${c.name}${arm === 'with' ? '' : `-${arm}`}-${i + 1}`;
        const src = locate(run && run.tracePath, tempRoot);
        if (!src) { missing.push(label); return; }
        fs.mkdirSync(outDir, { recursive: true });
        const dest = path.join(outDir, `${label}.jsonl`);
        fs.copyFileSync(src, dest);
        copied.push(dest);
      });
    }
  }
  return { copied, missing };
}

function main(argv) {
  const file = argv[0];
  if (!file || file.startsWith('--')) { process.stderr.write('uso: keep-failed-traces.js <resultados.json> [--temp-root <dir>] [--out <dir>]\n'); return 2; }
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const outDir = opt('--out') || path.join(__dirname, 'generated', 'traces', path.basename(file, '.json'));
  const r = persistFailedTraces({ resultsJson: file, tempRoot: opt('--temp-root') || os.tmpdir(), outDir });
  process.stdout.write(`${JSON.stringify({ outDir, ...r })}\n`);
  return r.missing.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { persistFailedTraces };
