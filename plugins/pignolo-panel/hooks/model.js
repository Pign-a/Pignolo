// Funciones puras del panel (sin $): formato y estado de agentes de la sesion.
// Nada aca toca el disco ni la sesion; register.js hace el I/O con $ y llama a estas.
import { oneLine } from './state.js'

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
    // detalle por agente (solo se dibuja): quien lo lanzo, pasos dados, cuando termino el ultimo, que hizo y cuanto contexto tiene
    parentId: a.parentId || null,
    steps: 0,
    lastAt: null,
    last: null,
    ctx: 0,
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

// Un paso del agente (resultado de turn.step): cuenta el paso, anota cuando termino, lo ultimo que hizo y el tamaño de su contexto
// (entrada + cache leida + cache escrita del ULTIMO paso). Nada de esto se escribe a disco ni sale del dibujo.
export function noteStep(rec, result, now) {
  if (!rec || !result || typeof result !== 'object') return
  rec.steps += 1
  rec.lastAt = now
  const u = result.usage
  if (u && typeof u === 'object') rec.ctx = (Number(u.input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0)
  const uses = Array.isArray(result.toolUses) ? result.toolUses : []
  const t = uses[uses.length - 1]
  if (t && typeof t === 'object' && typeof t.name === 'string' && t.name) rec.last = { kind: 'tool', name: clean(t.name).slice(0, 40), target: toolTarget(t.name, t.input) }
  else rec.last = { kind: 'text' }
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

// ---- detalle por agente -----------------------------------------------------------

export const STALL_MS = 60000 // sin un paso hace mas de esto: parado
export const CTX_HIGH = 150000 // contexto de este tamaño o mas: alto
export const TARGET_MAX = 80
export const ROOMY_COLS = 60 // ancho interior desde el que entran todas las columnas
export const TOKENS_COLS = 54
export const AGO_COLS = 48

const text = (v) => (typeof v === 'string' ? v : '')
// Una linea, sin control ni invisibles (oneLine) y sin sustitutos sueltos (un texto que no es UTF-8 valido): lo que sobra se dibuja como ?.
const clean = (v) => oneLine(text(v)).replace(/\p{Cs}/gu, '?')
const cap = (s, n) => {
  const cs = Array.from(s)
  return cs.length > n ? cs.slice(0, n - 1).join('') + '…' : s
}
const tail2 = (p) => clean(p).split(/[\\/]+/).filter(Boolean).slice(-2).join('/')

// A que apunta una herramienta, en una linea de hasta 80 caracteres ('' si no hay nada que mostrar). Se dibuja y nada mas.
export function toolTarget(name, input) {
  try {
    const i = input && typeof input === 'object' ? input : {}
    let t = ''
    switch (name) {
      case 'Read': case 'Edit': case 'Write': t = tail2(i.file_path); break
      case 'NotebookEdit': t = tail2(i.notebook_path); break
      case 'Bash': case 'PowerShell': t = clean(i.command); break
      case 'Grep': t = (clean(i.pattern) ? '"' + clean(i.pattern) + '"' : '') + (text(i.path) ? ' en ' + tail2(i.path) : ''); break
      case 'Glob': t = clean(i.pattern) + (text(i.path) ? ' en ' + tail2(i.path) : ''); break
      case 'Agent': t = clean(i.description); break
      case 'WebFetch': t = clean(i.url); break
      case 'WebSearch': t = clean(i.query); break
      default: t = ''
    }
    return cap(t.trim(), TARGET_MAX)
  } catch {
    return ''
  }
}

// 'hace 3 s', 'hace 2 min 10 s'
export function ago(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
  if (s < 60) return 'hace ' + s + ' s'
  const m = Math.floor(s / 60)
  const r = s % 60
  return 'hace ' + m + ' min' + (r ? ' ' + r + ' s' : '')
}

// '6,1 min' (con coma, como se lee en el panel)
export function minutesEs(ms) {
  return ms >= 0 ? (ms / 60000).toFixed(1).replace('.', ',') + ' min' : '—'
}

// 14k, 239k; menos de mil, el numero; cero, raya
export function kilo(n) {
  if (!(n > 0)) return '—'
  return n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n))
}

export function totalTokens(u) {
  return u ? (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0) : 0
}

// Lo que se dibuja de un agente del registro de la sesion
export function agentView(r) {
  return { id: r.id, parentId: r.parentId, type: r.type, description: r.description, model: shortModel(r.model), startedAt: r.startedAt, lastAt: r.lastAt, steps: r.steps, last: r.last, ctx: r.ctx, tokens: totalTokens(r.usage), status: r.status }
}

// Lo que se dibuja de un agente de los datos de muestra (modo demo): los tiempos salen del reloj, y sin 'idleSec' no esta parado.
export function demoView(a, now, i) {
  const idle = Number.isFinite(a.idleSec) ? a.idleSec : 0
  return {
    id: a.id || 'demo-' + i, parentId: a.parentId || null, type: a.type, description: a.description, model: shortModel(a.model),
    startedAt: now - a.minutes * 60000, lastAt: now - idle * 1000, steps: a.last ? 1 : 0, last: a.last || null, ctx: a.ctx || 0, tokens: a.tokens || 0, status: a.status,
  }
}

export function agentFlags(a, now) {
  const stalled = now - (a.lastAt ?? a.startedAt) > STALL_MS
  const ctxHigh = (a.ctx || 0) >= CTX_HIGH
  return { stalled, ctxHigh, attention: stalled || ctxHigh }
}

// Primero los que piden atencion, despues el mas reciente; cada hijo justo despues de su padre.
export function orderAgents(list, now) {
  const ids = new Set(list.map((a) => a.id))
  const flag = new Map(list.map((a) => [a, agentFlags(a, now).attention]))
  const cmp = (x, y) => (flag.get(y) - flag.get(x)) || y.startedAt - x.startedAt
  const kids = (p) => list.filter((a) => a.parentId === p.id && a !== p).sort(cmp)
  const out = []
  const seen = new Set()
  const put = (a) => {
    if (seen.has(a)) return
    seen.add(a)
    out.push(a)
    for (const k of kids(a)) put(k)
  }
  for (const a of list.filter((x) => !x.parentId || x.parentId === x.id || !ids.has(x.parentId)).sort(cmp)) put(a)
  for (const a of [...list].sort(cmp)) put(a) // un ciclo de padres: nadie queda sin dibujar
  return out
}

// Que columnas entran segun el ancho interior del bloque: primero se va el modelo, despues los tokens, despues el "hace n s".
export function columnsFor(cols) {
  return { model: cols >= ROOMY_COLS, tokens: cols >= TOKENS_COLS, ago: cols >= AGO_COLS }
}

// Filas que ocupa el bloque (con sus bordes): holgado = 8 + 3 por agente; compacto = 6 + lineas + huecos + la linea del resto.
export const roomyRows = (n) => 8 + 3 * n
export function compactRows(entries, rest) {
  let rows = 6 + (rest > 0 ? 1 : 0)
  entries.forEach((en) => { rows += en.lines + (en.gapAfter ? 1 : 0) })
  return rows
}

// list: los agentes corriendo (agentView/demoView). { rows (del bloque, con bordes), cols (ancho interior), now }.
// -> { mode: 'roomy' | 'compact', entries: [{ agent, flags, nested, lines, gapAfter }], rest, columns, summary: { count, tokens, longest } }
export function layoutAgents(list, { rows, cols, now }) {
  const ordered = orderAgents(list, now)
  const flags = new Map(ordered.map((a) => [a, agentFlags(a, now)]))
  const summary = { count: ordered.length, tokens: ordered.reduce((n, a) => n + (a.tokens || 0), 0), longest: ordered.reduce((m, a) => Math.max(m, now - a.startedAt), 0) }
  const columns = columnsFor(cols)
  const make = (shown, mode) => {
    const ids = new Set(shown.map((a) => a.id))
    return shown.map((a, i) => {
      const f = flags.get(a)
      const nextAtt = shown[i + 1] ? flags.get(shown[i + 1]).attention : null
      return {
        agent: a, flags: f, nested: Boolean(a.parentId) && a.parentId !== a.id && ids.has(a.parentId),
        lines: mode === 'roomy' || f.attention ? 2 : 1,
        gapAfter: mode === 'roomy' || (f.attention && nextAtt === false),
      }
    })
  }
  if (rows >= roomyRows(ordered.length)) return { mode: 'roomy', entries: make(ordered, 'roomy'), rest: 0, columns, summary }
  const others = ordered.filter((a) => !flags.get(a).attention)
  let chosen = null
  for (let k = others.length; k >= 0; k -= 1) {
    const keep = new Set(others.slice(0, k))
    const shown = ordered.filter((a) => flags.get(a).attention || keep.has(a))
    chosen = { entries: make(shown, 'compact'), rest: others.length - k }
    if (compactRows(chosen.entries, chosen.rest) <= rows) break
  }
  return { mode: 'compact', entries: chosen.entries, rest: chosen.rest, columns, summary }
}

export function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
