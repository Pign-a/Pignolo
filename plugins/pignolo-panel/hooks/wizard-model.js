// Asistente de inicio (etapa 3): modelo puro. Sin `$`, sin disco, sin efectos: lee el resumen que deja pignolo en
// `.git/pignolo/wizard-detect.json` (`pignolo-wizard-detect/1`), lleva la cuenta de los pasos y las elecciones, y arma el unico mensaje
// que el panel envia. El panel no escribe nada: quien escribe es `init` del nucleo, con sus controles de siempre.
// El formato de las elecciones lo valida el nucleo (plugins/pignolo/lib/init-choices.js); tests/wizard-contract.test.js los mantiene alineados.
import { oneLine, hasHiddenChars } from './state.js'

export const SCHEMA = 'pignolo-wizard-detect/1'
export const CHOICES_VERSION = 1
export const MAX_CHOICES_CHARS = 700
// el nucleo no escribe mas de 64 KB (lib/wizard-detect.js): un archivo mas grande no es el suyo y no se parsea
export const MAX_FILE_CHARS = 64 * 1024
// `prompt.submit` rechaza un texto que empieza con `/` (sonda W1, 2026-10-03): el mensaje no es el comando sino la frase fija que activa
// la skill `init` por lenguaje natural (su paso 0 pregunta confirmacion).
export const MESSAGE_PREFIX = 'Activá pignolo en este proyecto con estas elecciones: --choices '
// "No usar pignolo acá" (RW-02): frase fija, sin datos; `init` la reconoce por `--decline` y solo escribe una marca bajo `.git/pignolo/`.
export const DECLINE_MESSAGE = 'No quiero usar pignolo en este proyecto: --decline'

const PROFILES = ['balanced', 'economy', 'max']
const PERMS = ['user', 'project', 'none']
const KINDS = ['spec', 'plan', 'research', 'reference', 'design', 'private']
const DECISIONS = ['adopt', 'move', 'leave']
const GROUPS = ['blocks', 'asks', 'free']
const TESTS_STATE = ['declared', 'none', 'placeholder']

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v, max) => {
  const s = oneLine(v)
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}
const fail = (reason) => ({ ok: false, reason })

// readWizardDetect(texto) -> { ok: true, data } | { ok: false, reason }. Nunca tira: JSON invalido, otra schema, id ausente o una forma
// imposible dan ok:false. Los textos salen en una sola linea y recortados.
export function readWizardDetect(raw) {
  let j
  try {
    const s = String(raw)
    if (s.length > MAX_FILE_CHARS) return fail('too-big')
    j = JSON.parse(s)
  } catch {
    return fail('not-json')
  }
  if (!isObj(j)) return fail('not-an-object')
  if (j.schema !== SCHEMA) return fail('schema')
  if (typeof j.id !== 'string' || !/^[0-9a-f]{12}$/.test(j.id)) return fail('id')
  if (typeof j.blank !== 'boolean') return fail('blank')
  const offer = j.offer === true
  if (j.blank) return { ok: true, data: { schema: SCHEMA, id: j.id, blank: true, offer, project: null, profiles: [], permissions: { groups: [] }, places: { candidates: [] } } }
  const p = j.project
  if (!isObj(p) || !isObj(p.tests) || !TESTS_STATE.includes(p.tests.state)) return fail('project')
  if (!Array.isArray(p.stacks)) return fail('project')
  if (!Array.isArray(j.profiles) || j.profiles.length === 0) return fail('profiles')
  const profiles = []
  for (const x of j.profiles) {
    if (!isObj(x) || !PROFILES.includes(x.id) || typeof x.recommended !== 'boolean') return fail('profiles')
    profiles.push({ id: x.id, label: text(x.label, 24), line: text(x.line, 60), recommended: x.recommended })
  }
  if (new Set(profiles.map((x) => x.id)).size !== profiles.length) return fail('profiles')
  if (profiles.filter((x) => x.recommended).length !== 1) return fail('profiles')
  if (!isObj(j.permissions) || !Array.isArray(j.permissions.groups)) return fail('permissions')
  const groups = []
  for (const g of j.permissions.groups) {
    if (!isObj(g) || !GROUPS.includes(g.id)) return fail('permissions')
    groups.push({ id: g.id, line: text(g.line, 80) })
  }
  if (!isObj(j.places) || !Array.isArray(j.places.candidates)) return fail('places')
  const candidates = []
  for (const c of j.places.candidates) {
    if (!isObj(c) || !KINDS.includes(c.kind) || !DECISIONS.includes(c.decision)) return fail('places')
    if (!Array.isArray(c.options) || c.options.length === 0 || !c.options.every((o) => DECISIONS.includes(o)) || !c.options.includes(c.decision)) return fail('places')
    candidates.push({
      kind: c.kind,
      from: text(c.from, 40),
      to: text(c.to, 40),
      decision: c.decision,
      options: [...c.options],
      moves: Array.isArray(c.moves) ? c.moves.filter(isObj).map((m) => ({ from: text(m.from, 40), to: text(m.to, 40) })) : [],
      note: typeof c.note === 'string' ? text(c.note, 60) : null,
    })
  }
  return {
    ok: true,
    data: {
      schema: SCHEMA,
      id: j.id,
      blank: false,
      offer,
      project: {
        type: typeof p.type === 'string' ? text(p.type, 24) : null,
        stacks: p.stacks.filter((s) => typeof s === 'string').map((s) => text(s, 16)),
        tests: { cmd: typeof p.tests.cmd === 'string' ? text(p.tests.cmd, 60) : null, state: p.tests.state },
        main: typeof p.main === 'string' ? text(p.main, 40) : null,
      },
      profiles,
      permissions: { groups },
      places: { candidates },
    },
  }
}

// Los pasos, en orden. Con pignolo-ui hay uno mas; sin carpetas candidatas no hay paso de carpetas; en un repo en blanco, una sola pantalla.
export function stepsFor({ data, uiInstalled }) {
  if (data.blank) return ['blank']
  const steps = ['project', 'profile', 'perms']
  if (data.places.candidates.length > 0) steps.push('places')
  if (uiInstalled) steps.push('ui')
  steps.push('summary')
  return steps
}

// Las opciones recomendadas ya marcadas.
export function initialState(steps, data) {
  const rec = data.profiles.find((p) => p.recommended)
  const places = {}
  for (const c of data.places.candidates) places[c.kind] = c.decision
  return {
    steps: [...steps],
    i: 0,
    closed: null,
    done: false,
    picks: { project: 'confirm', profile: rec ? rec.id : 'balanced', perms: 'user', places, ui: 'later' },
  }
}

const LETTER = (arg) => (typeof arg === 'string' ? arg.toLowerCase() : '')

// El valor de una letra en un paso, o undefined si no existe.
export function optionFor(step, letter, data) {
  const l = LETTER(letter)
  if (step === 'project') return { a: 'confirm', b: 'review' }[l]
  if (step === 'profile') {
    const i = 'abc'.indexOf(l)
    return l.length === 1 && i >= 0 && data.profiles[i] ? data.profiles[i].id : undefined
  }
  if (step === 'perms') return { a: 'user', b: 'project', c: 'none' }[l]
  if (step === 'ui') return { a: 'later', b: 'now' }[l]
  return undefined
}

// move(state, 'next' | 'back' | 'pick', arg, data) -> state nuevo (puro). `back` en el primer paso cierra (`closed: 'dismiss'`); `next` en el
// ultimo termina (`done: true`). Elegir una letra que no existe devuelve el mismo estado. En el paso de carpetas `arg` es el numero de fila
// ('1'..'n') y cada pulsacion pasa a la decision siguiente de esa carpeta.
export function move(state, what, arg, data) {
  if (state.closed || state.done) return state
  const step = state.steps[state.i]
  if (what === 'next') return state.i >= state.steps.length - 1 ? { ...state, done: true } : { ...state, i: state.i + 1 }
  if (what === 'back') return state.i === 0 ? { ...state, closed: 'dismiss' } : { ...state, i: state.i - 1 }
  if (what !== 'pick') return state
  // paso 1 (el de proyecto o el de repo en blanco): "no usar pignolo acá" cierra con `decline` y el panel manda el mensaje fijo de abajo
  if (what === 'pick' && state.i === 0 && LETTER(arg) === 'c' && (step === 'project' || step === 'blank')) return { ...state, closed: 'decline' }
  if (step === 'blank') {
    const l = LETTER(arg)
    if (l === 'a') return { ...state, done: true }
    if (l === 'b') return { ...state, closed: 'later' }
    return state
  }
  if (step === 'places') {
    const row = Number(arg) - 1
    const c = Number.isInteger(row) ? data.places.candidates[row] : undefined
    if (!c) return state
    const cur = state.picks.places[c.kind]
    const next = c.options[(c.options.indexOf(cur) + 1) % c.options.length]
    return { ...state, picks: { ...state.picks, places: { ...state.picks.places, [c.kind]: next } } }
  }
  const value = optionFor(step, arg, data)
  if (value === undefined) return state
  return { ...state, picks: { ...state.picks, [step]: value } }
}

// Las elecciones con el esquema del nucleo (init-choices.js). `places` solo lleva lo que se cambio de lo recomendado.
export function choicesOf(state, data, { uiInstalled }) {
  if (data.blank) return { v: CHOICES_VERSION, id: data.id, blank: true }
  const out = { v: CHOICES_VERSION, id: data.id, project: state.picks.project, profile: state.picks.profile, perms: state.picks.perms }
  const places = {}
  for (const c of data.places.candidates) if (state.picks.places[c.kind] !== c.decision) places[c.kind] = state.picks.places[c.kind]
  if (Object.keys(places).length > 0) out.places = places
  if (uiInstalled) out.ui = state.picks.ui
  return out
}

const ENUMS = { project: ['confirm', 'review'], profile: PROFILES, perms: PERMS, ui: ['now', 'later'] }
const KEYS = ['v', 'id', 'project', 'profile', 'perms', 'places', 'ui', 'blank']

// Las mismas reglas que valida el nucleo (init-choices.js): solo enumerados, ninguna clave de mas.
function validChoices(c) {
  if (!isObj(c) || c.v !== CHOICES_VERSION || typeof c.id !== 'string' || !/^[0-9a-f]{12}$/.test(c.id)) return false
  if (Object.keys(c).some((k) => !KEYS.includes(k))) return false
  if (c.blank !== undefined && c.blank !== true) return false
  for (const [k, list] of Object.entries(ENUMS)) if (c[k] !== undefined && !list.includes(c[k])) return false
  if (c.places !== undefined) {
    if (!isObj(c.places)) return false
    for (const [kind, d] of Object.entries(c.places)) if (!KINDS.includes(kind) || !DECISIONS.includes(d)) return false
  }
  return c.blank === true || (c.project !== undefined && c.profile !== undefined && c.perms !== undefined)
}

// El mensaje que se envia (una sola linea): frase fija + JSON de enumerados. null si no es valido (mas de 700 caracteres de JSON,
// salto de linea, caracter invisible o valores fuera de lo previsto): entonces no se envia nada.
export function choicesMessage(choices) {
  if (!validChoices(choices)) return null
  let json
  try {
    json = JSON.stringify(choices)
  } catch {
    return null
  }
  if (typeof json !== 'string' || json.length > MAX_CHOICES_CHARS) return null
  const msg = MESSAGE_PREFIX + json
  if (/[\r\n\u2028\u2029]/.test(msg) || hasHiddenChars(msg)) return null
  return msg
}

// El JSON de un mensaje (para los tests de contrato con el nucleo).
export function jsonOf(message) {
  return typeof message === 'string' && message.startsWith(MESSAGE_PREFIX) ? message.slice(MESSAGE_PREFIX.length) : null
}
