// Pestaña UI: el texto que se envía al pulsar un atajo (D-U3, D-U9). Puro. Sale de una plantilla fija por acción; el modelo
// solo elige la acción y la pantalla, nunca escribe el mensaje, y el porqué que dibuja la pestaña no entra acá.
import { hasHiddenChars } from './state.js'

export const CONTEXT_MAX = 160
const TARGET = /^[a-z0-9][a-z0-9._-]{0,59}$/

// Una sola línea, sin caracteres invisibles: si trae alguno, el contexto se descarta entero.
function cleanContext(context) {
  if (typeof context !== 'string') return ''
  const one = context.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (hasHiddenChars(one)) return ''
  return one.length > CONTEXT_MAX ? one.slice(0, CONTEXT_MAX - 1).trimEnd() + '…' : one
}

// uiRequestText(action, target, context) -> string | null. null: la acción o el objetivo no son válidos y no se envía nada.
export function uiRequestText(action, target, context = '') {
  const t = target === undefined || target === null ? '' : target
  if (typeof t !== 'string' || (t !== '' && !TARGET.test(t))) return null
  let base = null
  if (action === 'improve') base = t ? 'Mejorá la pantalla ' + t + '.' : 'Quiero mejorar una pantalla.'
  else if (action === 'audit') base = t ? 'Auditá la pantalla ' + t + '.' : 'Quiero auditar una pantalla.'
  else if (action === 'new') base = t ? 'Hagamos la pantalla ' + t + '.' : 'Quiero armar una pantalla nueva.'
  else if (action === 'define' && t === '') base = 'Definí el producto y el diseño.'
  if (base === null) return null
  const ctx = cleanContext(context)
  return ctx ? base + ' Contexto: ' + ctx : base
}
