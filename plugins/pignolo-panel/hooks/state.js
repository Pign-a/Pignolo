// Funciones puras del mod: lectura del registro `pignolo-panel-state/1` (lo escribe pignolo, el mod solo lo lee),
// etapas, barras, minigrafico y el texto de la respuesta. El mod no tiene reglas del siguiente paso: las trae el registro.

export const SCHEMA = 'pignolo-panel-state/1'
export const STAGES = ['plan', 'execution', 'review', 'fixes', 'suite', 'merge']
export const STAGE_LABEL = { plan: 'plan', execution: 'ejecución', review: 'revisión', fixes: 'arreglos', suite: 'suite', merge: 'unión' }
// ● hecho, ◐ en curso, ○ falta, ⚑ espera al usuario
export const MARK = { done: '●', current: '◐', todo: '○', waiting: '⚑' }

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))
// Una sola linea: saltos de linea y separadores Unicode pasan a espacio (igual que `sanitize` del nucleo).
// Los caracteres de control que quedan se dibujan como `?` (el motor se niega a dibujarlos) y marcan la linea como invalida.
// Control, formato (ancho cero, RTL, "tag"), uso privado y sin asignar: invisibles o ilegibles, nunca viajan como palabras del usuario (RR-01).
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u
const HIDDEN_ALL = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu
export const oneLine = (v) => str(v).replace(/[\r\n\t\p{Zl}\p{Zp}]+/gu, ' ').replace(HIDDEN_ALL, '?').replace(/\s{2,}/g, ' ').trim()
// Caracteres de control (salvo los saltos, que oneLine aplana) o pasado del tope: no se envia como palabras del usuario.
export const QUESTION_MAX = 300
export const OPTION_MAX = 80
export const hasHiddenChars = (v) => HIDDEN.test(str(v).replace(/[\r\n\t]/g, ' '))
const badLine = (v, max) => hasHiddenChars(v) || str(v).length > max
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)

// ---- registro ------------------------------------------------------------------

function emptySnap() {
  return { plan: null, decisions: [], branches: [], cards: [], main: null, next: { none: 'nothing' }, agents: [], activity: [] }
}

// Devuelve { kind, snap }. kind: 'ok' | 'none' (sin registro) | 'unknown' (otra schema) | 'newer' (schema mayor: hay que
// actualizar el panel). Acepta cualquier JSON; lo que no tiene la forma se descarta. Nunca tira.
export function readState(raw) {
  const r = obj(raw)
  if (!r) return { kind: 'none', snap: emptySnap() }
  const schema = str(r.schema)
  if (schema !== SCHEMA) {
    const m = /^pignolo-panel-state\/(\d+)$/.exec(schema)
    return { kind: m && Number(m[1]) > 1 ? 'newer' : 'unknown', snap: emptySnap() }
  }
  const snap = emptySnap()
  const plan = obj(r.plan)
  if (plan && str(plan.slug)) snap.plan = { slug: str(plan.slug), stage: str(plan.stage) || '?', request: str(plan.request) }
  snap.decisions = arr(r.decisions)
    .filter((d) => obj(d) && str(d.id) && str(d.question))
    .map((d) => ({
      id: str(d.id),
      // Lo que se muestra es lo que se envia: una sola linea (los saltos pasan a espacio). Lo que ademas trae caracteres de
      // control o pasa del tope no se envia (RP-03): `bad` en la decision y en cada opcion.
      question: oneLine(d.question),
      bad: badLine(d.question, QUESTION_MAX),
      options: arr(d.options)
        .map((o) => (obj(o) ? { raw: str(o.label), pros: str(o.pros_contras) } : { raw: str(o), pros: '' }))
        .filter((o) => o.raw)
        .slice(0, 4)
        .map((o) => ({ label: oneLine(o.raw), pros: o.pros, bad: badLine(o.raw, OPTION_MAX) })),
      recommended: str(d.recommended),
      context: str(d.context),
      kind: d.kind === 'budget' ? 'budget' : 'user',
      status: ['open', 'answered', 'postponed'].includes(d.status) ? d.status : 'open',
      shown: d.shown === true,
    }))
  snap.branches = arr(r.branches)
    .filter((b) => obj(b) && str(b.name))
    .map((b) => ({
      name: str(b.name),
      stage: STAGES.includes(str(b.stage)) ? str(b.stage) : 'plan',
      review: str(b.review) || 'none',
      suite: str(b.suite) || 'none',
      commits: Number.isFinite(Number(b.commits)) ? Number(b.commits) : 0,
      waiting: b.waiting === true,
      merged: b.merged === true,
      sha: /^[0-9a-f]{7,40}$/.test(str(b.sha)) ? str(b.sha) : '',
    }))
  snap.cards = arr(r.cards)
    .filter((c) => obj(c) && str(c.id))
    .map((c) => ({
      id: str(c.id),
      title: str(c.title),
      status: ['todo', 'running', 'done', 'failed'].includes(str(c.status)) ? str(c.status) : 'todo',
      red: str(c.red),
      green: str(c.green),
      evidence: str(c.evidence),
    }))
  const main = obj(r.main)
  snap.main = main && main.ahead !== null && Number.isFinite(Number(main.ahead)) ? { ahead: Number(main.ahead) } : null
  snap.next = readNext(r.next)
  // solo para el modo demo (el registro real no los trae)
  snap.activity = arr(r.activity).map(Number).filter(Number.isFinite).slice(-48)
  snap.agents = arr(r.agents)
    .filter((a) => obj(a) && str(a.type))
    .map((a) => ({ type: str(a.type), description: str(a.description), model: str(a.model), minutes: Number(a.minutes) || 0, tokens: Number(a.tokens) || 0, status: 'done' }))
  return { kind: 'ok', snap }
}

function readNext(n) {
  const o = obj(n)
  if (!o) return { none: 'nothing' }
  if (typeof o.none === 'string') return { none: o.none }
  if (!str(o.text)) return { none: 'nothing' }
  const step = (x) => ({ rule: str(x.rule), key: str(x.key), text: str(x.text), prompt: str(x.prompt), costNote: str(x.costNote), why: str(x.why) })
  return { ...step(o), alternatives: arr(o.alternatives).filter((a) => obj(a) && str(a.text)).slice(0, 2).map(step) }
}

// Texto para el cuadro del prompt (dice el costo cuando lo hay)
export function suggestionText(step) {
  return step.costNote ? step.prompt + ' (' + step.costNote + ')' : step.prompt
}

// La respuesta que se envia (D-P2, R-P9): pregunta recortada a 120 caracteres, sin saltos de linea ni comillas dobles.
export function cleanQuestion(q) {
  const one = str(q).replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/"/g, '').replace(/\s{2,}/g, ' ').trim()
  return one.length > 120 ? one.slice(0, 119).trimEnd() + '…' : one
}
export function answerPrefix(d) {
  return 'Respuesta a la decisión ' + d.id + ' ("' + cleanQuestion(d.question) + '"): '
}
export function answerText(d, option) {
  return answerPrefix(d) + option + '.'
}
// `true` si ESTA respuesta no puede enviarse: la pregunta o la opcion traen caracteres de control o pasan del tope.
export function answerInvalid(d, option) {
  const o = d.options.find((x) => x.label === option)
  return Boolean(d.bad) || !o || Boolean(o.bad)
}

// Color de tema con respaldo: si el tema expone sus claves y no trae `key`, usa `fallback`.
export function pickColor(theme, key, fallback) {
  const t = obj(theme)
  const keys = t ? (obj(t.colors) ? Object.keys(t.colors) : Array.isArray(t.keys) ? t.keys : null) : null
  return keys && !keys.includes(key) ? fallback : key
}

// ---- progreso y etapas -----------------------------------------------------------

export function progress(cards) {
  const total = cards.length
  const done = cards.filter((c) => c.status === 'done').length
  return { done, total, frac: total ? done / total : 0 }
}

// barra con bloques: ████░░░░
export function bar(frac, width) {
  const w = Math.max(1, width)
  const f = Math.max(0, Math.min(1, frac))
  const filled = Math.round(f * w)
  return '█'.repeat(filled) + '░'.repeat(w - filled)
}

// Linea de etapas de una rama: [{ stage, label, mark }]
export function stageLine(b) {
  const idx = STAGES.indexOf(b.stage)
  return STAGES.map((stage, i) => {
    let mark = b.merged || i < idx ? MARK.done : i === idx ? MARK.current : MARK.todo
    if (i === idx && b.waiting) mark = MARK.waiting
    return { stage, label: STAGE_LABEL[stage], mark }
  })
}

// ---- minigrafico ---------------------------------------------------------------

const BLOCKS = ' ▁▂▃▄▅▆▇█'

// samples -> niveles 0..16 (2 filas de 8 niveles)
export function levels(samples, n) {
  const s = samples.slice(-n)
  const max = Math.max(1, ...s)
  const out = new Array(n - s.length).fill(0)
  for (const v of s) out.push(v <= 0 ? 0 : Math.max(1, Math.round((v / max) * 16)))
  return out
}

// version texto (desktop, o respaldo): una fila de bloques
export function sparkText(samples, n) {
  return levels(samples, n)
    .map((l) => BLOCKS[Math.min(8, Math.ceil(l / 2))])
    .join('')
}

export function b64(bytes) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (i + 1 < bytes.length ? abc[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? abc[n & 63] : '=')
  }
  return out
}

// Celdas de un Raster de 2 filas: [codePoint, fg, bg] little-endian u32, base64.
export function sparkCells(samples, n, fg) {
  const lv = levels(samples, n)
  const words = new Uint32Array(n * 2 * 3)
  const DEFAULT = 0x01000000
  const put = (row, col, level) => {
    const o = (row * n + col) * 3
    words[o] = level <= 0 ? 0x20 : BLOCKS.codePointAt(Math.min(8, level))
    words[o + 1] = fg
    words[o + 2] = DEFAULT
  }
  lv.forEach((l, col) => {
    put(1, col, Math.min(l, 8)) // fila de abajo
    put(0, col, Math.max(l - 8, 0)) // fila de arriba
  })
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((w, i) => {
    bytes[i * 4] = w & 255
    bytes[i * 4 + 1] = (w >> 8) & 255
    bytes[i * 4 + 2] = (w >> 16) & 255
    bytes[i * 4 + 3] = (w >>> 24) & 255
  })
  return b64(bytes)
}
