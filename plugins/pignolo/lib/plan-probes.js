'use strict';
// Sondas fijas (R-3): experimentos deterministas de Windows y Node que el orquestador corre,
// sin IA, sobre las afirmaciones que marcó el revisor. UNA SONDA SOLO REFUTA: `falsified: true`
// cierra la afirmación como hallazgo; cualquier otra cosa la deja para el paso 2b.
//
// LÍMITE DECLARADO: salen de errores ya vistos en planes reales; miden cobertura de
// riesgos conocidos, no el caso general. La lista crece con cada error nuevo.
// Cada sonda: { id, keywords, triggers: RegExp (contra el texto de la afirmación, sin el de
// su tarea), run() -> { falsified, evidence } }.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Corre un script de Node en una carpeta temporal y devuelve su salida JSON.
function runScript(code, timeout = 30000) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-probe-'));
  try {
    const file = path.join(dir, 'probe.js');
    fs.writeFileSync(file, code);
    const r = spawnSync(process.execPath, [file], { cwd: dir, encoding: 'utf8', timeout, windowsHide: true });
    return JSON.parse(String(r.stdout).trim().split('\n').pop());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function npmWithoutShell() {
  const parts = [];
  let falsified = false;
  for (const cmd of ['npm', 'npx']) {
    const r = spawnSync(cmd, ['--version'], { shell: false, encoding: 'utf8', timeout: 30000, windowsHide: true });
    const got = r.error ? `error ${r.error.code}` : `exit ${r.status}`;
    if (r.error || r.status !== 0) falsified = true;
    parts.push(`spawnSync('${cmd}', ['--version'], { shell: false }) → ${got}`);
  }
  return {
    falsified,
    evidence: `${parts.join('; ')} (${process.platform}).${falsified ? ' Without a shell the npm/npx .cmd shims do not launch.' : ''}`,
  };
}

// Como lanza un comando un test runner o un hook: spawn(..., { shell: true }). El hijo es
// la shell (cmd.exe en Windows) y el nieto un node que anota su pid. El padre hace
// child.kill() y mira si el nieto sigue vivo; después lo mata. El nieto se cierra solo a
// los 30 s por las dudas.
const KILL_TREE = `
const { spawn } = require('child_process');
const fs = require('fs');
fs.writeFileSync('grandchild.js', "require('fs').writeFileSync('gpid', String(process.pid)); setTimeout(() => process.exit(0), 30000); setInterval(() => {}, 1000);");
const c = spawn('"' + process.execPath + '" grandchild.js', { shell: true, stdio: 'ignore', windowsHide: true });
const t0 = Date.now();
const wait = setInterval(() => {
  if (!fs.existsSync('gpid') || !fs.readFileSync('gpid', 'utf8')) {
    if (Date.now() - t0 > 15000) { clearInterval(wait); try { c.kill(); } catch (e) {} console.log(JSON.stringify({ error: 'timeout' })); }
    return;
  }
  clearInterval(wait);
  const g = Number(fs.readFileSync('gpid', 'utf8'));
  c.kill();
  setTimeout(() => {
    let alive = true;
    try { process.kill(g, 0); } catch (e) { alive = e.code === 'EPERM'; }
    try { process.kill(g); } catch (e) {}
    console.log(JSON.stringify({ child: c.pid, grandchild: g, alive }));
  }, 700);
}, 50);
`;

function killLeavesGrandchild() {
  const r = runScript(KILL_TREE);
  if (r.error) return { falsified: false, evidence: `probe failed: ${r.error}` };
  return {
    falsified: r.alive,
    evidence: `spawn('node grandchild.js', { shell: true }) then child.kill() on the shell (pid ${r.child}) left the grandchild node (pid ${r.grandchild}) `
      + `${r.alive ? 'alive' : 'dead'} 700 ms later (${process.platform})${r.alive ? ': child.kill() does not kill the process tree; the test process survives a timeout.' : '.'}`,
  };
}

const SPAWNSYNC_BLOCKS = `
const { spawnSync } = require('child_process');
const t0 = Date.now();
let fired = null;
setTimeout(() => { fired = Date.now() - t0; console.log(JSON.stringify({ firedMs: fired, childMs })); }, 50);
spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 600)']);
const childMs = Date.now() - t0;
`;

function spawnSyncBlocksLoop() {
  const r = runScript(SPAWNSYNC_BLOCKS);
  const falsified = r.firedMs >= r.childMs;
  return {
    falsified,
    evidence: `a 50 ms setTimeout scheduled before spawnSync fired at ${r.firedMs} ms, after the child ended at ${r.childMs} ms`
      + `${falsified ? ': spawnSync blocks the event loop, so no timer, heartbeat or signal handler runs in the parent while it waits.' : '.'}`,
  };
}

function gitApplyNumstat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-probe-git-'));
  try {
    const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
    git(['init', '-q']);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
    fs.writeFileSync(path.join(dir, 'p.diff'), 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n-uno\n+one\n dos\n');
    const numstat = git(['apply', '--numstat', 'p.diff']);
    const check = git(['apply', '--check', 'p.diff']);
    const falsified = numstat.status === 0 && check.status !== 0;
    return {
      falsified,
      evidence: `on a patch whose context does not match, \`git apply --numstat\` exits ${numstat.status} (${String(numstat.stdout).trim()}) and \`git apply --check\` exits ${check.status}`
        + `${falsified ? ': --numstat only reads the patch; it does not prove it applies.' : '.'}`,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function kill0Eperm() {
  if (process.platform !== 'win32') return { falsified: false, evidence: 'skipped: not win32' };
  let code = 'no error';
  try { process.kill(4, 0); } catch (e) { code = e.code; }
  const falsified = code === 'EPERM';
  return {
    falsified,
    evidence: `process.kill(4, 0) on win32 (the System process) → ${code}`
      + `${falsified ? ': EPERM means the process exists but is not ours; code that treats any throw as "dead" misreads a live pid.' : '.'}`,
  };
}

// Disparadores: dos condiciones a la vez (lookahead) donde una sola palabra dispararía de más.
const PROBES = [
  { id: 'npm-without-shell', keywords: ['npm', 'npx', 'shell: false', 'ENOENT'],
    triggers: /^(?=[\s\S]*\bnp[mx]\b)(?=[\s\S]*\b(spawn\w*|execFile\w*|child_process|shell\s*:\s*false|without (a )?shell|sin shell)\b)/i, run: npmWithoutShell },
  { id: 'kill-leaves-grandchild', keywords: ['child.kill', 'grandchild', 'process tree'],
    triggers: /^(?=[\s\S]*\bkill\w*)(?=[\s\S]*\b(grandchild|nieto|descendants?|process tree|árbol de procesos)\b)/i, run: killLeavesGrandchild },
  { id: 'spawnsync-blocks-loop', keywords: ['spawnSync', 'event loop'],
    triggers: /^(?=[\s\S]*\b(spawnSync|execSync|execFileSync)\b)(?=[\s\S]*\b(setTimeout|setInterval|timers?|heartbeat|event loop|watchdog|SIGINT|SIGTERM)\b)/i, run: spawnSyncBlocksLoop },
  { id: 'git-apply-numstat', keywords: ['--numstat', 'apply --check'],
    triggers: /git apply[\s\S]{0,40}--numstat|--numstat[\s\S]{0,60}\b(apply|applies|aplica)\b/i, run: gitApplyNumstat },
  { id: 'kill0-eperm', keywords: ['EPERM', 'pid'],
    triggers: /kill\(\s*\w+\s*,\s*0\s*\)|\bEPERM\b/, run: kill0Eperm },
];

// Lo único que mira un disparador: el texto de la afirmación (no el de su tarea).
function triggerText(claim) {
  return `${claim.claim || ''}\n${claim.how || ''}`;
}

// Corre las sondas que dispara cada afirmación (cada sonda a lo sumo una vez por llamada).
// closed: ids de afirmaciones donde una sonda dio falsified: true.
function runProbes({ claims, probes = PROBES }) {
  const cache = new Map();
  const results = [];
  const closed = [];
  const findings = [];
  const seen = new Set();
  for (const claim of claims || []) {
    const text = triggerText(claim);
    for (const probe of probes) {
      if (!probe.triggers.test(text)) continue;
      if (!cache.has(probe.id)) {
        let res;
        try { res = probe.run(); } catch (e) { res = { falsified: false, evidence: `probe failed: ${e.message}` }; }
        cache.set(probe.id, res);
      }
      const res = cache.get(probe.id);
      results.push({ claimId: claim.id, probe: probe.id, falsified: res.falsified === true, evidence: res.evidence });
      if (res.falsified !== true) continue;
      if (!closed.includes(claim.id)) closed.push(claim.id);
      const key = `${claim.task}|${probe.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        task: claim.task, kind: `probe ${probe.id}`,
        evidence: `Claim ${claim.id || '?'} ("${claim.claim}") is contradicted by a fixed probe run on this machine: ${res.evidence}`,
        keywords: probe.keywords,
      });
    }
  }
  return { results, closed, findings };
}

module.exports = { PROBES, triggerText, runProbes };
