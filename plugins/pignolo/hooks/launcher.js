'use strict';
// Launcher endurecido (spec §8.3). Todo error propio sale con 2 para que el hook
// bloquee en vez de dejar pasar. El handler corre en un worker: el hilo principal
// solo vigila un plazo interno y, si vence, NIEGA (exit 2) sin esperar al handler.
// El `timeout` de hooks.json es holgado a propósito: si vence el del host, Claude
// Code NO bloquea (doc oficial de hooks), así que el que decide es este plazo.
// Límite declarado: si este proceso no arranca, el hook no bloquea.
const fs = require('node:fs');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const DEFAULT_DEADLINE_MS = 3000;
// SessionStart no es una compuerta (no puede bloquear) y corre el canario: más plazo.
const DEADLINES_MS = { 'session-start': 25000 };

function deadlineFor(name) {
  return DEADLINES_MS[name] || DEFAULT_DEADLINE_MS;
}

function runInWorker() {
  const { name, input, env } = workerData;
  let sent = false;
  const send = (msg) => { if (!sent) { sent = true; parentPort.postMessage(msg); } };
  const failW = (msg) => { sent = false; send({ error: msg }); };
  process.on('uncaughtException', (e) => failW(`error interno del hook (${e && e.message})`));
  process.on('unhandledRejection', (e) => failW(`error interno del hook (${e && e.message})`));

  let handler;
  try {
    handler = require(path.join(__dirname, 'handlers', `${name}.js`));
  } catch (e) {
    return send({ error: `no se pudo cargar el hook ${name} (${e.message})` });
  }
  if (!handler || typeof handler.run !== 'function') return send({ error: `el hook ${name} no exporta run()` });

  let result;
  try {
    result = handler.run(input, { env, deadline: workerData.deadline });
  } catch (e) {
    return send({ error: `el hook ${name} falló (${e.message})` });
  }
  if (!result || typeof result.then === 'function' || typeof result.exit !== 'number') {
    return send({ error: `el hook ${name} devolvió un resultado inválido` });
  }
  // setImmediate: un rechazo sin manejar que el handler dejó pendiente se emite
  // antes, y gana (fuerza el 2).
  setImmediate(() => send({ result: { exit: result.exit, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') } }));
}

function main() {
  let done = false;
  function fail(msg) {
    if (done) return;
    done = true;
    try { process.stderr.write(`pignolo: ${msg}\n`); } catch (_) { /* nada más que hacer */ }
    process.exit(2);
  }
  process.on('uncaughtException', (e) => fail(`error interno del hook (${e && e.message})`));
  process.on('unhandledRejection', (e) => fail(`error interno del hook (${e && e.message})`));

  const name = process.argv[2];
  if (!name || !/^[a-z_][a-z0-9_-]*$/.test(name)) fail('nombre de hook inválido');

  let input;
  try {
    // PowerShell 5.1 antepone un BOM al texto que pasa por el pipe.
    const raw = fs.readFileSync(0, 'utf8');
    input = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (e) {
    fail(`entrada JSON inválida (${e.message})`);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('entrada JSON inválida (se esperaba un objeto)');

  const ms = deadlineFor(name);
  const timer = setTimeout(() => fail(`se venció el plazo interno de ${ms} ms; se niega por las dudas`), ms);
  const worker = new Worker(__filename, {
    workerData: { name, input, env: { ...process.env }, deadline: Date.now() + ms },
    env: process.env,
    stdout: false,
    stderr: false,
  });
  worker.on('message', (msg) => {
    if (done) return;
    if (msg.error) return fail(msg.error);
    done = true;
    clearTimeout(timer);
    const r = msg.result;
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    process.exitCode = r.exit;
    // Un rechazo tardío del handler ya no puede cambiar la decisión escrita.
    worker.terminate();
  });
  worker.on('error', (e) => fail(`error interno del hook (${e && e.message})`));
  worker.on('exit', () => { if (!done) fail('el hook terminó sin devolver resultado'); });
}

if (isMainThread) main();
else runInWorker();
