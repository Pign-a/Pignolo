'use strict';
// Reglas del "siguiente paso" en un solo lugar (R-P7). Puras: reciben los hechos del `refresh` y devuelven
// datos. Solo recomienda cuando sale de una regla clara del estado; la sugerencia solo llena el cuadro del
// prompt, nunca se envía. Niveles: decision < merge < review < push < card < close-session.
//
// No sugiere (`none`): algo corre ('busy'); algo anda mal ('attention'); dos candidatos en el mismo nivel
// ('ambiguous'); el único paso cuesta plata sin OK ('cost'); sin evidencia ('nothing').

const TIER = { decision: 1, merge: 2, review: 3, push: 4, card: 5, 'close-session': 6 };

const isApprove = (b) => b.review === 'APPROVE';
const isGreen = (b) => b.suite === 'green';
const unreviewed = (b) => !b.review || b.review === 'none';

// Costo de un paso: costOk ausente = sin dato (no bloquea; la regla dice su costo base); costOk.ok falso bloquea;
// con OK lo dice en la nota.
function costOf(branch, base) {
  const c = branch && branch.costOk;
  if (!c) return { ok: true, note: base || null };
  if (c.ok !== true) return { ok: false, note: null };
  const usd = typeof c.usd === 'number' ? `~${c.usd} USD, ya aprobado` : 'costo ya aprobado';
  return { ok: true, note: base ? `${base} · ${usd}` : usd };
}

const RULES = [
  {
    id: 'decision',
    find: (f) => f.decisions.filter((d) => d.status === 'open').map((d) => ({
      rule: 'decision', key: `d:${d.id}`, text: d.question, prompt: `Decisión ${d.id}: ${d.recommended || ''}`.trim(),
      why: `Hay una decisión tuya pendiente${d.recommended ? `; la recomendada es "${d.recommended}"` : ''}.`,
    })),
  },
  {
    id: 'merge',
    find: (f) => f.branches.filter((b) => !b.merged && isApprove(b) && isGreen(b) && !b.waiting).map((b) => ({
      rule: 'merge', key: `m:${b.name}`, text: `uní ${b.name} a main`, prompt: `uní ${b.name} a main`, why: 'Revisión APPROVE y suite verde registradas.', branch: b,
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
    find: (f) => (f.main && f.main.ahead > 0
      ? [{ rule: 'push', key: 'p:main', text: 'hacé push de main', prompt: 'hacé push de main', why: 'main está adelantado a origin/main y no hay nada corriendo.' }]
      : []),
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

module.exports = { TIER, nextStep, suggestionText, toRegistry };
