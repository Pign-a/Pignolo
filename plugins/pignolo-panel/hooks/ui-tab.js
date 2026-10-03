// Pestaña UI: el modelo de la vista (qué filas, qué letras, qué se lee a la derecha del título). Puro; register.js lo dibuja.
// Las letras de las recomendaciones son a, b y c; las de los atajos fijos n, m, u y d. No chocan con 0 a 4, r ni Esc.
import { rulesFor } from './ui-rules.js'

export const REC_LETTERS = ['a', 'b', 'c']
export const SHORTCUTS = [
  { key: 'n', label: 'nueva pantalla', action: 'new' },
  { key: 'm', label: 'mejorar', action: 'improve' },
  { key: 'u', label: 'auditar', action: 'audit' },
  { key: 'd', label: 'definir', action: 'define' },
]

export const usdEs = (n) => n.toFixed(2).replace('.', ',')

export function recLabel(r) {
  if (r.action === 'improve') return r.target ? 'Mejorar "' + r.target + '"' : 'Mejorar una pantalla'
  if (r.action === 'audit') return r.target ? 'Auditar "' + r.target + '"' : 'Auditar una pantalla'
  if (r.action === 'new') return r.target ? 'Crear "' + r.target + '"' : 'Crear una pantalla nueva'
  return 'Definir producto y diseño'
}

// tabModel({ project, input, key, result, pending, canAsk, calls }) -> { title, right, mode, rows, shortcuts }
//   result: lo último que devolvió el recomendador; solo vale si es de las mismas entradas (`result.key === key`).
export function tabModel({ project, input, key, result, pending, canAsk, calls }) {
  const rules = rulesFor(input)
  const mine = result && result.key === key ? result : null
  const recs = (mine ? mine.recs : rules.recs).slice(0, 3)
  const mode = rules.onlyDefine ? 'define' : rules.fixed ? 'fixed' : 'normal'
  let right = ''
  if (mode === 'normal') {
    if (pending) right = 'pensando…'
    else if (mine && mine.source === 'ai') right = 'haiku · ' + calls + (calls === 1 ? ' consulta' : ' consultas') + ' · ' + (mine.cost && mine.cost.measured ? '' : '≈ ') + usdEs(mine.cost ? mine.cost.usd : 0.01) + ' USD'
    else if (mine && mine.reason === 'cap') right = 'tope de consultas de la sesión'
    else right = 'por reglas'
    if (!canAsk && !pending) right = 'por reglas'
  }
  return {
    title: 'UI · ' + project,
    right,
    mode,
    rows: recs.map((r, i) => ({ letter: REC_LETTERS[i], action: r.action, target: r.target, label: recLabel(r), why: r.why, context: r.context })),
    shortcuts: SHORTCUTS,
  }
}
