'use strict';
// Reglas del "siguiente paso" en un solo lugar (R-P7). Puras: reciben los hechos del `refresh` y devuelven
// datos. Solo recomienda cuando sale de una regla clara del estado; la sugerencia solo llena el cuadro del
// prompt, nunca se envía. Niveles: decision < merge < review < push < card < close-session.
//
// No sugiere (`none`): algo corre ('busy'); algo anda mal ('attention'); dos candidatos en el mismo nivel
// ('ambiguous'); el único paso cuesta plata sin OK ('cost'); sin evidencia ('nothing').

// Texto de la respuesta que se envía desde el panel y que el hook `panel-answer` reconoce. UNA sola forma: el mod la
// arma igual (pregunta de una línea, sin comillas dobles, recortada a 120 caracteres).
function cleanQuestion(q) {
  const one = String(q === null || q === undefined ? '' : q).replace(/[\r\n\p{Zl}\p{Zp}]+/gu, ' ').replace(/"/g, '').replace(/\s{2,}/g, ' ').trim();
  return one.length > 120 ? `${one.slice(0, 119).trimEnd()}…` : one;
}
const answerPrefix = (d) => `Respuesta a la decisión ${d.id} ("${cleanQuestion(d.question)}"): `;
const answerText = (d, option) => `${answerPrefix(d)}${option}.`;

const TIER = { decision: 1, merge: 2, review: 3, push: 4, card: 5, 'close-session': 6 };

const isApprove = (b) => b.review === 'APPROVE';
const isGreen = (b) => b.suite === 'green';
const unreviewed = (b) => !b.review || b.review === 'none';

// Costo de un paso: costOk ausente = se muestra igual, con la nota "sin OK de costo" si el paso cuesta plata (RP-07: nunca
// se oculta ni se ejecuta); costOk.ok falso bloquea; con OK lo dice en la nota.
function costOf(branch, base) {
  const c = branch && branch.costOk;
  if (!c) return { ok: true, note: base ? `${base} · sin OK de costo` : null };
  if (c.ok !== true) return { ok: false, note: null };
  const usd = typeof c.usd === 'number' ? `~${c.usd} USD, ya aprobado` : 'costo ya aprobado';
  return { ok: true, note: base ? `${base} · ${usd}` : usd };
}

// La rama principal del proyecto tal como la registró el panel; sin dato no hay nombre (y no se sugiere unir).
const principal = (f) => (f.main && f.main.name) || null;

const RULES = [
  {
    id: 'decision',
    find: (f) => f.decisions.filter((d) => d.status === 'open').map((d) => ({
      rule: 'decision', key: `d:${d.id}`, text: d.question,
      // el mismo texto que arma el botón del panel: el hook lo reconoce y cierra la decisión (RP-04). Sin una recomendada que sea
      // una de las opciones solo llena el comienzo; la opción la escribe el usuario.
      prompt: (d.options || []).some((o) => (o && o.label !== undefined ? o.label : o) === d.recommended) && d.recommended ? answerText(d, d.recommended) : answerPrefix(d).trim(),
      why: `Hay una decisión tuya pendiente${d.recommended ? `; la recomendada es "${d.recommended}"` : ''}.`,
    })),
  },
  {
    id: 'merge',
    find: (f) => (principal(f) ? f.branches : []).filter((b) => !b.merged && isApprove(b) && isGreen(b) && !b.waiting).map((b) => ({
      rule: 'merge', key: `m:${b.name}`, text: `uní ${b.name} a ${principal(f)}`, prompt: `uní ${b.name} a ${principal(f)}`, why: 'Revisión APPROVE y suite verde registradas.', branch: b,
    })),
  },
  {
    id: 'review',
    find: (f) => f.branches.filter((b) => !b.merged && b.commits > 0 && unreviewed(b) && !b.waiting).map((b) => ({
      rule: 'review', key: `r:${b.name}`, text: `revisá ${b.name}`, prompt: `revisá ${b.name}`,
      why: `La rama tiene ${b.commits} commit${b.commits === 1 ? '' : 's'} sin revisión.`, branch: b, baseNote: 'usa una revisión opus',
    })),
  },
  {
    id: 'push',
    // Solo con la rama principal real (nunca "main" fijo), parado en ella, sin cambios sin commitear y con remoto. Un dato que falta
    // (registro viejo) no cuenta como "mal": `dirty`, `onMain` y `remote` solo frenan cuando son explícitamente true/false.
    find: (f) => {
      const m = f.main;
      if (!m || !(m.ahead > 0) || !m.name || m.dirty === true || m.remote === false || m.onMain === false) return [];
      const text = `hacé push de ${m.name}`;
      return [{ rule: 'push', key: `p:${m.name}`, text, prompt: text, why: `${m.name} está adelantado a origin/${m.name} y no hay nada corriendo.` }];
    },
  },
  {
    id: 'card',
    find: (f) => {
      const cards = f.cards || [];
      const i = cards.findIndex((c) => c.status === 'todo');
      if (i < 0 || cards.slice(0, i).some((c) => c.status === 'failed')) return [];
      const c = cards[i];
      return [{ rule: 'card', key: `c:${c.id}`, text: `seguí con ${c.id}`, prompt: `seguí con ${c.id}`, why: `El plan ${f.plan ? f.plan.slug : ''} tiene tarjetas abiertas y nada pendiente antes.`.replace('  ', ' ') }];
    },
  },
];

// facts: { busy, attention[], decisions[], branches[], main, plan, cards[] }
// -> { main: paso|null, alternatives[≤2], none: motivo|null }
function nextStep(facts) {
  const f = { busy: false, attention: [], decisions: [], branches: [], main: null, plan: null, cards: [], ...facts };
  if (f.busy || f.cards.some((c) => c.status === 'running')) return { main: null, alternatives: [], none: 'busy' };
  if (f.attention.length) return { main: null, alternatives: [], none: 'attention' };

  const all = [];
  let blockedByCost = false;
  for (const rule of RULES) {
    for (const cand of rule.find(f)) {
      const cost = cand.branch ? costOf(cand.branch, cand.baseNote) : { ok: true, note: cand.baseNote || null };
      if (!cost.ok) { blockedByCost = true; continue; }
      all.push({ ...cand, tier: TIER[rule.id], costNote: cost.note });
    }
  }
  if (!all.length) {
    // cierre de sesión: nada corre, no queda un paso de rama, push o tarjeta, y lo que falta es solo del usuario
    const userOnly = f.decisions.some((d) => d.status === 'postponed') || f.branches.some((b) => !b.merged && b.waiting);
    if (!blockedByCost && userOnly) {
      return { main: { rule: 'close-session', key: 'x:close', text: 'cerrá la sesión', prompt: '/pignolo:close-session', costNote: null, why: 'No queda nada que corra y lo pendiente es tuyo: conviene cerrar la sesión.', tier: TIER['close-session'] }, alternatives: [], none: null };
    }
    return { main: null, alternatives: [], none: blockedByCost ? 'cost' : 'nothing' };
  }
  const top = Math.min(...all.map((x) => x.tier));
  const atTop = all.filter((x) => x.tier === top);
  if (atTop.length > 1) return { main: null, alternatives: [], none: 'ambiguous' };
  const rest = all.filter((x) => x.tier !== top).sort((a, b) => a.tier - b.tier).slice(0, 2);
  return { main: atTop[0], alternatives: rest, none: null };
}

// Texto para el cuadro del prompt (con el costo si lo hay)
function suggestionText(step) {
  return step.costNote ? `${step.prompt} (${step.costNote})` : step.prompt;
}

// Forma del registro (`next` de pignolo-panel-state/1)
function toRegistry(step) {
  if (!step.main) return { none: step.none || 'nothing' };
  const one = (x) => ({ rule: x.rule, key: x.key, text: x.text, prompt: x.prompt, costNote: x.costNote || null, why: x.why || '' });
  return { ...one(step.main), alternatives: step.alternatives.map(one) };
}

module.exports = { TIER, nextStep, suggestionText, toRegistry, cleanQuestion, answerPrefix, answerText };
