'use strict';
// Tarjeta de alcance (spec §4.5): ocho secciones fijas y ejemplos de aceptación que
// citan literalmente el pedido del humano. Pura: no lee ni escribe archivos.

const SECTIONS = [
  'Goal', 'Acceptance examples', 'Request to spec', 'Not included or reinterpreted',
  'Added without being asked', 'Out of scope', 'Reserved decisions', 'Cost estimate',
];

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const items = (body) => String(body || '').split('\n').map((l) => /^\s*-\s+(.*\S)\s*$/.exec(l)).filter(Boolean).map((m) => m[1]);
const QUOTE_RE = /(?:"([^"]*)"|“([^”]*)”)/g;

function quotesOf(text) {
  return [...String(text).matchAll(QUOTE_RE)].map((m) => (m[1] !== undefined ? m[1] : m[2]));
}

// { sections: { [nombre]: texto }, examples: [{ text, quote }], added: [{ id, text }], errors }
function parseScopeCard(text) {
  const errors = [];
  const sections = {};
  const order = [];
  let cur = null;
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = h[1];
      if (Object.prototype.hasOwnProperty.call(sections, cur)) errors.push(`el encabezado "## ${cur}" está repetido`);
      else { sections[cur] = ''; order.push(cur); }
    } else if (cur !== null) {
      sections[cur] += `${line}\n`;
    }
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].trim();
  for (const s of SECTIONS) if (!(s in sections)) errors.push(`falta la sección "## ${s}"`);
  for (const k of order) if (!SECTIONS.includes(k)) errors.push(`sección desconocida "## ${k}"`);
  const known = order.filter((k, i) => SECTIONS.includes(k) && order.indexOf(k) === i);
  if (!errors.length && known.join('|') !== SECTIONS.join('|')) errors.push(`las secciones van en este orden: ${SECTIONS.join(', ')}`);

  const examples = items(sections['Acceptance examples']).map((t) => ({ text: t, quote: quotesOf(t)[0] }));
  const added = [];
  for (const t of items(sections['Added without being asked'])) {
    const m = /^(A\d+):\s*(.*)$/.exec(t);
    if (m) added.push({ id: m[1], text: m[2] });
  }
  return { sections, examples, added, errors };
}

// Errores de la tarjeta frente al pedido original (vacío = válida).
function validateScopeCard(text, { request = '', decisions = [] } = {}) {
  const p = parseScopeCard(text);
  const errs = [...p.errors];
  const s = p.sections;
  if ('Goal' in s) {
    const lines = s.Goal.split('\n').filter((l) => l.trim());
    if (lines.length !== 1) errs.push('Goal debe ser una línea no vacía');
  }
  if ('Acceptance examples' in s) {
    const list = items(s['Acceptance examples']);
    if (list.length < 3 || list.length > 7) errs.push(`Acceptance examples necesita de 3 a 7 ítems (hay ${list.length})`);
    const req = norm(request);
    // Segunda fuente: las decisiones del autor registradas; solo su cita literal respalda un ejemplo.
    const sources = (Array.isArray(decisions) ? decisions : []).map((d) => norm((d && d.quote) || '')).filter(Boolean);
    list.forEach((t, i) => {
      const qs = quotesOf(t);
      if (qs.length !== 1) { errs.push(`ejemplo ${i + 1}: debe tener exactamente una cita entre comillas ("${t.slice(0, 40)}")`); return; }
      const q = norm(qs[0]);
      if (!q || !(req.includes(q) || sources.some((s) => s.includes(q)))) errs.push(`ejemplo ${i + 1}: la cita "${qs[0]}" no aparece en el pedido ni en una decisión registrada`);
    });
  }
  if ('Added without being asked' in s) {
    const list = items(s['Added without being asked']);
    const none = list.filter((t) => t.toLowerCase() === 'none');
    if (!list.length) errs.push('Added without being asked: usá "- none" o ítems "A1: ..."');
    else if (none.length) {
      if (list.length !== 1) errs.push('Added without being asked: "none" no puede convivir con otros ítems');
    } else {
      list.forEach((t, i) => {
        const m = /^A(\d+):\s*\S/.exec(t);
        if (!m || Number(m[1]) !== i + 1) errs.push(`Added without being asked: el ítem ${i + 1} debe ser "A${i + 1}: <texto>" (ids consecutivos desde A1)`);
      });
    }
  }
  return errs;
}

module.exports = { SECTIONS, parseScopeCard, validateScopeCard };
