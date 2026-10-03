'use strict';
// Las elecciones del asistente de inicio del panel (etapa 3, D-W5, D-W6). Un JSON compacto de una línea, de valores enumerados:
// ningún texto libre del usuario llega por acá. El panel arma la línea (plugins/pignolo-panel/hooks/wizard-model.js) y esta es la
// única validación del lado del núcleo; `tests/wizard-contract.test.js` mantiene a los dos alineados. Puro: no lee el disco.
const { PLACE_KINDS } = require('./places');

const VERSION = 1;
const MAX_CHARS = 700;
const KEYS = ['v', 'id', 'project', 'profile', 'perms', 'places', 'ui', 'blank'];
const ENUM = {
  project: ['confirm', 'review'],
  profile: ['balanced', 'economy', 'max'],
  perms: ['user', 'project', 'none'],
  ui: ['now', 'later'],
};
const DECISIONS = ['adopt', 'move', 'leave'];
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u;
const BREAKS = new RegExp('[\r\n\u2028\u2029]');

const bad = (reason) => ({ ok: false, reason });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// parseChoices(line) -> { ok: true, choices } | { ok: false, reason }. Cualquier clave o valor fuera de lo previsto invalida TODO:
// no se descarta en silencio solo una parte.
function parseChoices(line) {
  if (typeof line !== 'string' || line === '') return bad('empty');
  if (line.length > MAX_CHARS) return bad('too-long');
  if (BREAKS.test(line)) return bad('line-break');
  if (HIDDEN.test(line)) return bad('hidden-char');
  let c;
  try { c = JSON.parse(line); } catch (_) { return bad('not-json'); }
  if (!isObj(c)) return bad('not-an-object');
  if (c.v !== VERSION) return bad('unknown-version');
  for (const k of Object.keys(c)) if (!KEYS.includes(k)) return bad(`unknown-key:${k}`);
  if (typeof c.id !== 'string' || !/^[0-9a-f]{12}$/.test(c.id)) return bad('bad-id');
  if (c.blank !== undefined && c.blank !== true) return bad('bad-blank');
  for (const [k, list] of Object.entries(ENUM)) if (c[k] !== undefined && !list.includes(c[k])) return bad(`bad-value:${k}`);
  if (c.places !== undefined) {
    if (!isObj(c.places)) return bad('bad-places');
    for (const [kind, d] of Object.entries(c.places)) {
      if (!PLACE_KINDS.includes(kind)) return bad(`bad-place-kind:${kind}`);
      if (!DECISIONS.includes(d)) return bad(`bad-place-decision:${kind}`);
    }
  }
  if (!c.blank) for (const k of ['project', 'profile', 'perms']) if (c[k] === undefined) return bad(`missing:${k}`);
  return { ok: true, choices: c };
}

// toAnswers(choices, { summary }) -> { approved, answers, extras }. `summary` es el de `init.js detect`. Lo no elegido toma lo recomendado.
function toAnswers(choices, { summary }) {
  if (choices.blank) return { approved: [...summary.recommended], answers: {}, extras: { blank: true, perms: null, ui: null, review: false } };
  const places = {};
  for (const [kind, rec] of Object.entries(summary.recommendedPlaces || {})) places[kind] = { ...rec };
  for (const [kind, decision] of Object.entries(choices.places || {})) {
    const from = places[kind] && places[kind].from;
    places[kind] = from !== undefined && decision !== 'leave' ? { decision, from } : { decision };
  }
  return {
    approved: [...summary.recommended],
    answers: { profile: choices.profile, ...(Object.keys(places).length ? { places } : {}) },
    extras: { blank: false, perms: choices.perms, ui: choices.ui || null, review: choices.project === 'review' },
  };
}

// compareId(choices, currentId) -> { same, note }. Si la detección de ahora no es la que vio el asistente, `init` lo dice.
function compareId(choices, currentId) {
  const same = choices.id === currentId;
  return { same, note: same ? null : 'la detección cambió desde que viste el asistente: revisá la pantalla final' };
}

module.exports = { VERSION, MAX_CHARS, KEYS, ENUM, parseChoices, toAnswers, compareId };
