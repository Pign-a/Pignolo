#!/usr/bin/env node
'use strict';
// Registro de estado del panel (R-P1, R-P5). Uso: node panel.js <verbo> [--cwd <dir>] [opciones]
//   show [--json|--text]      el registro (por defecto JSON; --text: texto llano, nada si no hay nada)
//   refresh                   recalcula plan, ramas, tarjetas y siguiente paso
//   ask (--question <texto> | --question-file <f>) [--key <clave>] --option <texto> [--pros <texto>] ... [--recommended <texto>] [--context-file <f>] [--kind user|budget]
//   answer (--id Q-1 | --key <clave>) --answer <texto>   (la skill la llama cuando el autor contesta por el chat)
//   postpone --id Q-1         (la llama close-session para las que el usuario dejó sin responder)
//   reopen                    pospuestas -> abiertas (close-session y SessionStart)
//   park                      abiertas -> pospuestas (close-session, al cerrar)
//   waiting --branch <rama> [--off]   la cola marca una rama que espera al autor
//   evidence --card <id> [--red <línea>] [--green <línea>] [--title <texto>]
//   budget --hito <h> --spent <usd> [--cap <usd>]   (cap solo la primera vez)
// Exit 0 salvo uso incorrecto (2). Con un fallo del registro sale 0 y avisa por stderr (R-P6).
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const panel = require('../lib/panel-state');

const VALUE = ['cwd', 'id', 'key', 'answer', 'question', 'branch', 'question-file', 'context-file', 'recommended', 'kind', 'card', 'red', 'green', 'title', 'hito', 'spent', 'cap'];

function usage(msg) {
  process.stderr.write(`pignolo panel: ${msg}\nuso: panel.js show|refresh|ask|answer|postpone|reopen|park|waiting|evidence|budget [--cwd <dir>] [opciones]\n`);
  process.exit(2);
}

function parse(argv) {
  const o = { options: [], flags: {} };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) usage(`argumento inesperado: ${a}`);
    const k = a.slice(2);
    if (k === 'json' || k === 'text' || k === 'off') { o.flags[k] = true; continue; }
    if (k !== 'option' && k !== 'pros' && !VALUE.includes(k)) usage(`opción desconocida: ${a}`);
    if (argv[i + 1] === undefined) usage(`falta el valor de ${a}`);
    const v = argv[i + 1];
    i += 1;
    if (k === 'option') o.options.push({ label: v });
    else if (k === 'pros') { if (!o.options.length) usage('--pros va después de --option'); o.options[o.options.length - 1].pros_contras = v; } else o[k] = v;
  }
  return o;
}

const readText = (f) => {
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return usage(`no se pudo leer ${f}: ${e.message}`); }
};

const verb = process.argv[2];
if (!['show', 'refresh', 'ask', 'answer', 'postpone', 'reopen', 'park', 'waiting', 'evidence', 'budget'].includes(verb)) usage(`verbo desconocido: ${verb || '(ninguno)'}`);
const o = parse(process.argv.slice(2));
const main = mainRoot(path.resolve(o.cwd || process.cwd()));
const out = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);

try {
  if (verb === 'show') {
    const { state, problems } = panel.read(main);
    if (o.flags.text) { const t = panel.toText(state); if (t) process.stdout.write(`${t}\n`); } else out({ ...state, problems });
  } else if (verb === 'refresh') {
    const s = panel.refresh(main);
    out({ ok: true, wrote: s.wrote, next: s.next });
  } else if (verb === 'ask') {
    if (o.question === undefined && !o['question-file']) usage('ask necesita --question o --question-file');
    out({ ok: true, ...panel.ask(main, {
      question: o.question !== undefined ? o.question : readText(o['question-file']), options: o.options, recommended: o.recommended || '',
      context: o['context-file'] ? readText(o['context-file']) : '', kind: o.kind || 'user', key: o.key,
    }) });
  } else if (verb === 'answer') {
    if ((!o.id && !o.key) || o.answer === undefined) usage('answer necesita --id (o --key) y --answer');
    out(panel.answer(main, { id: o.id, key: o.key, answer: o.answer }));
  } else if (verb === 'postpone') {
    if (!o.id) usage('postpone necesita --id');
    out(panel.postpone(main, { id: o.id }));
  } else if (verb === 'reopen') {
    out({ ok: true, reopened: panel.reopenPostponed(main) });
  } else if (verb === 'park') {
    out({ ok: true, parked: panel.parkOpen(main) });
  } else if (verb === 'waiting') {
    if (!o.branch) usage('waiting necesita --branch');
    out(panel.setWaiting(main, { branch: o.branch, waiting: !o.flags.off }));
  } else if (verb === 'evidence') {
    if (!o.card) usage('evidence necesita --card');
    out(panel.evidence(main, { card: o.card, red: o.red, green: o.green, title: o.title }));
  } else if (verb === 'budget') {
    if (!o.hito || o.spent === undefined) usage('budget necesita --hito y --spent');
    out(panel.setBudget(main, { hito: o.hito, spent: o.spent, cap: o.cap }));
  }
} catch (e) {
  // R-P6: un fallo del registro no hace fallar a quien lo llama.
  process.stderr.write(`pignolo panel: el registro falló (${e.message}); no se cambió nada.\n`);
  out({ ok: false, error: e.message });
}
