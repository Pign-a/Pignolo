// Funciones puras del panel (sin $): formato y estado de agentes de la sesion.
// Nada aca toca el disco ni la sesion; register.js hace el I/O con $ y llama a estas.

export const SYMBOL = { running: '●', done: '✓', error: '✗', todo: '○', failed: '✗' }
// Claves del tema de Claude Code (no colores fijos)
export const COLOR = { running: 'warning', done: 'success', error: 'error', todo: 'inactive', failed: 'error' }

export function shortModel(m) {
  if (!m) return '—'
  return String(m).replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

export function minutes(ms) {
  if (!(ms >= 0)) return '—'
  return (ms / 60000).toFixed(1) + ' min'
}

export function tokens(u) {
  if (!u) return '—'
  const n = (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0)
  if (n === 0) return '—'
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

export function usd(n) {
  return typeof n === 'number' ? n.toFixed(2) : '—'
}

export function pad(s, w) {
  s = String(s)
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length)
}

export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many)
}

// ---- registro de agentes -------------------------------------------------

export function newRegistry() {
  return { byId: new Map(), byToolUse: new Map() }
}

export function addAgent(reg, a) {
  const rec = {
    id: a.id,
    toolUseId: a.toolUseId,
    type: a.type || 'agent',
    description: a.description || '',
    model: a.model || '',
    background: Boolean(a.background),
    startedAt: a.startedAt,
    endedAt: null,
    status: 'running',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
  reg.byId.set(rec.id, rec)
  if (rec.toolUseId) reg.byToolUse.set(rec.toolUseId, rec)
  return rec
}

export function addUsage(rec, u) {
  if (!rec || !u) return
  rec.usage.input += u.input_tokens || 0
  rec.usage.output += u.output_tokens || 0
  rec.usage.cacheRead += u.cache_read_input_tokens || 0
  rec.usage.cacheWrite += u.cache_creation_input_tokens || 0
  if (u.model) rec.model = u.model
}

export function finish(rec, now, failed) {
  if (!rec) return
  rec.endedAt = now
  rec.status = failed ? 'error' : 'done'
}

// un agente que vuelve a pedir al modelo (SendMessage) vuelve a correr
export function reopen(rec) {
  if (rec && rec.status !== 'running') {
    rec.status = 'running'
    rec.endedAt = null
  }
}

export function running(reg) {
  let n = 0
  for (const r of reg.byId.values()) if (r.status === 'running') n += 1
  return n
}

export function elapsed(rec, now) {
  return (rec.endedAt ?? now) - rec.startedAt
}

// corriendo primero, despues el mas reciente
export function sorted(reg) {
  return [...reg.byId.values()].sort(
    (a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.startedAt - a.startedAt,
  )
}

export function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
