// Pestaña UI: recomendaciones por reglas, sin modelo (D-U4). Puro. También son el respaldo cuando la IA falla o está topada.
// Una recomendación es { action, target, why, priority, context }; `context` lo calculan las reglas (nunca el modelo, D-U3).

const OPTIONAL = ['Tone', 'Not wanted', 'Do not touch']
const REQUIRED = ['Audience', 'First look']
const MAX_RECS = 3
export const CONTEXT_MAX = 160

const sev = (a) => (a ? a.bloquea * 2 + a.alto : 0)

// "la última auditoría dejó 2 hallazgos altos (CONTRAST-02, J-1)." Solo para improve/audit de una pantalla conocida con auditoría.
export function contextFor(action, target, input) {
  if (action !== 'improve' && action !== 'audit') return ''
  const s = input.screens.find((x) => x.name === target)
  if (!s || !s.audit) return ''
  const a = s.audit
  const parts = []
  if (a.bloquea) parts.push(a.bloquea + (a.bloquea === 1 ? ' hallazgo que bloquea' : ' hallazgos que bloquean'))
  if (a.alto) parts.push(a.alto + (a.alto === 1 ? ' hallazgo alto' : ' hallazgos altos'))
  if (parts.length === 0) return ''
  const ids = a.ids.length ? ' (' + a.ids.join(', ') + ')' : ''
  return ('la última auditoría dejó ' + parts.join(' y ') + ids + '.').slice(0, CONTEXT_MAX)
}

const rec = (action, target, why, input) => ({ action, target, why, priority: 0, context: contextFor(action, target, input) })

export function rulesFor(input) {
  const missing = []
  if (!input.product.exists) missing.push('PRODUCT.md')
  if (!input.design.exists || !input.design.decided) missing.push('DESIGN.md')
  const gaps = input.product.exists ? REQUIRED.filter((s) => input.product.undecided.includes(s)) : []
  if (missing.length || gaps.length) {
    const why = missing.length ? 'Falta ' + missing.join(' y ') + (gaps.length ? ' y decidir: ' + gaps.join(', ') : '') + '.' : 'Falta decidir: ' + gaps.join(', ') + '.'
    return { recs: [{ action: 'define', target: '', why, priority: 1, context: '' }], onlyDefine: true, fixed: false }
  }
  if (input.screens.length === 0 && input.recent.length === 0) return { recs: [], onlyDefine: false, fixed: true }

  const out = []
  // (1) hallazgos que bloquean o altos en la última auditoría
  const bad = input.screens.filter((s) => sev(s.audit) > 0).sort((a, b) => sev(b.audit) - sev(a.audit) || (a.name < b.name ? -1 : 1))
  for (const s of bad) out.push(rec('improve', s.name, 'Auditoría: ' + (s.audit.bloquea ? s.audit.bloquea + ' que bloquea · ' : '') + s.audit.alto + ' alto' + (s.audit.alto === 1 ? '' : 's') + '.', input))
  // (2) pantalla sin auditoría
  for (const s of input.screens.filter((x) => !x.audit && (x.flow || x.lastRun))) {
    out.push(rec('audit', s.name, unauditedWhy(s), input))
  }
  // (3) secciones opcionales de PRODUCT.md sin decidir
  const open = OPTIONAL.filter((s) => input.product.undecided.includes(s))
  if (open.length) out.push(rec('define', '', 'Se puede completar: ' + open.join(', ') + '.', input))
  // (4) una pantalla nueva
  out.push(rec('new', '', 'Ninguna recomendación más fuerte: podés armar una pantalla nueva.', input))
  const recs = out.slice(0, MAX_RECS).map((r, i) => ({ ...r, priority: i + 1 }))
  return { recs, onlyDefine: false, fixed: false }
}

function unauditedWhy(s) {
  return s.flow ? 'Está aprobada y nunca se auditó.' : 'Se rehízo y no se midió con una auditoría.'
}
