// Pestaña UI: recomendaciones de haiku con respaldo por reglas (D-U4, D-U6, D-U7, D-U8).
// Este archivo NO llama al modelo por sí mismo: register.js le pasa `io = { complete, usage }`, funciones que cierran sobre
// `$.model.complete` y `$.session.usage` (el motor no deja pasar `$` a otro archivo). `get` nunca tira ni devuelve un error.
import { hashInput, knownScreen, safeName } from './ui-input.js'
import { rulesFor, contextFor } from './ui-rules.js'
import { UI_SYSTEM, buildPrompt } from './ui-prompt.js'
import { hasHiddenChars } from './state.js'

export const MAX_CALLS = 6
export const MAX_TOKENS = 400
export const TIMEOUT_MS = 15000
export const ESTIMATE_USD = 0.01
const ACTIONS = ['new', 'improve', 'audit', 'define']
const WHY_MAX = 120
const TARGET_MAX = 60

// Corta a la primera llave y la última (haiku a veces envuelve en un bloque de código), parsea y valida a mano.
export function parseRecs(text, input) {
  let json = null
  if (typeof text === 'string') {
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try {
        json = JSON.parse(text.slice(a, b + 1))
      } catch {
        json = null
      }
    }
  }
  const list = json && Array.isArray(json.recs) ? json.recs : []
  const seen = new Set()
  const recs = []
  let rejected = 0
  for (const r of list) {
    const ok = validRec(r, input) && !seen.has(r.priority)
    if (!ok || recs.length >= 3) {
      rejected += 1
      continue
    }
    seen.add(r.priority)
    const target = typeof r.target === 'string' ? r.target : ''
    recs.push({ action: r.action, target, why: r.why.trim(), priority: r.priority, context: contextFor(r.action, target, input) })
  }
  recs.sort((x, y) => x.priority - y.priority)
  return { recs, rejected }
}

function validRec(r, input) {
  if (!r || typeof r !== 'object' || !ACTIONS.includes(r.action)) return false
  if (!Number.isInteger(r.priority) || r.priority < 1 || r.priority > 3) return false
  if (typeof r.why !== 'string') return false
  const why = r.why.trim()
  if (!why || why.length > WHY_MAX || /[\r\n\u2028\u2029]/.test(why) || hasHiddenChars(why) || /[\\/]/.test(why)) return false
  const target = r.target === undefined || r.target === null ? '' : r.target
  if (typeof target !== 'string') return false
  if (r.action === 'define') return target === ''
  if (r.action === 'new') return target === '' || (target === safeName(target, TARGET_MAX) && target.length > 0)
  return target !== '' && target === safeName(target, TARGET_MAX) && knownScreen(input, target)
}

export function createRecommender({ model = 'haiku', maxCalls = MAX_CALLS } = {}) {
  const byKey = new Map() // hash de las entradas -> resultado guardado (sirve también para los fallos: no se reintenta solo)
  let calls = 0
  let inflight = null

  const fallback = (rules, key, reason, extra = {}) => ({ recs: rules.recs, source: 'rules', mode: 'normal', reason, key, ...extra })

  async function run(io, input, rules, key) {
    calls += 1
    let before = null
    try {
      const u = await io.usage()
      before = u && u.cost && typeof u.cost.usd === 'number' ? u.cost.usd : null
    } catch {
      before = null
    }
    let reply = null
    let failed = false
    try {
      reply = await io.complete({ model, system: UI_SYSTEM, prompt: buildPrompt(input), maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS })
    } catch {
      failed = true
    }
    if (failed || !reply || reply.isAnswered !== true || typeof reply.text !== 'string') return fallback(rules, key, 'error')
    const { recs } = parseRecs(reply.text, input)
    if (recs.length === 0) return fallback(rules, key, 'invalid')
    let cost = { usd: ESTIMATE_USD, measured: false }
    try {
      const u = await io.usage()
      const after = u && u.cost && typeof u.cost.usd === 'number' ? u.cost.usd : null
      if (before !== null && after !== null && after - before > 0) cost = { usd: after - before, measured: true }
    } catch {
      // sin lectura de uso: queda la estimación
    }
    return { recs, source: 'ai', mode: 'normal', cost, key }
  }

  return {
    // retry: la tecla `r`. Solo repite una consulta que falló; una respuesta buena y vigente se reutiliza. Siempre obedece el tope.
    async get(io, input, { retry = false } = {}) {
      const rules = rulesFor(input)
      const key = await hashInput(input)
      if (rules.onlyDefine) return { recs: rules.recs, source: 'rules', mode: 'define', key }
      if (rules.fixed) return { recs: rules.recs, source: 'rules', mode: 'fixed', key }
      if (inflight) return inflight
      const stored = byKey.get(key)
      if (stored && !(retry && stored.source === 'rules')) return { ...stored, reused: true }
      if (calls >= maxCalls) return fallback(rules, key, 'cap')
      inflight = run(io, input, rules, key)
        .catch(() => fallback(rules, key, 'error'))
        .then((res) => {
          byKey.set(key, res)
          return res
        })
        .finally(() => {
          inflight = null
        })
      return inflight
    },
    stats() {
      return { calls, maxCalls, inflight: inflight !== null }
    },
  }
}
