// Asistente de inicio (etapa 3): dibujo. Funciones puras que devuelven lineas de texto de exactamente WIDTH caracteres (marco redondeado,
// barra de progreso, opciones con letra en columnas fijas, pie con las teclas) y, aparte, el arbol de Box/Text/Button que las usa.
// Todo el asistente es texto con caracteres de UNA celda (╭─╮│╰╯ ▰▱ ← → ▸ …): sin `Raster`, asi que Desktop lo dibuja igual.
// El criterio visual del autor (bordes redondeados, todo ordenado, mismo ancho en todos los pasos) esta fijado en tests/wizard-view.test.ts.
import { oneLine } from './state.js'

export const WIDTH = 70
const INNER = WIDTH - 4 // contenido entre '│ ' y ' │'
const COL2 = 28 // columna 2 de las opciones (la 3 ocupa el resto)
const REC = ' · recomendado'
const COL3 = INNER - 4 - COL2 // sangria 1 + letra 1 + 2 espacios
const FOOT_L = 44 // el pie: a la izquierda las teclas de volver y cerrar, a la derecha (columna fija) la de seguir
export const TITLE = 'Empezar con pignolo'

const cp = (s) => [...String(s)]
export const len = (s) => cp(s).length
// Recorta a n puntos de codigo, con '…' si no entra.
export function fit(s, n) {
  const a = cp(s)
  if (a.length <= n) return a.join('')
  if (n <= 0) return ''
  return a.slice(0, n - 1).join('') + '…'
}
export const pad = (s, n) => {
  const t = fit(s, n)
  return t + ' '.repeat(n - len(t))
}
const line = (v) => oneLine(v)

// ---- piezas ----------------------------------------------------------------------------------------------------------

// Una barra con un glifo por paso: ▰ los hechos (hasta el actual), ▱ los que faltan.
export function progressBar(i, n) {
  const done = Math.max(0, Math.min(n, i + 1))
  return '▰'.repeat(done) + '▱'.repeat(n - done)
}

// El borde de arriba: ╭─ titulo ──────── derecha ─╮, siempre de WIDTH caracteres.
export function topBorder(title, right) {
  const r = right ? ' ' + fit(right, 24) : ''
  const maxTitle = WIDTH - 3 - 1 - 1 - len(r) - 3 // '╭─ ' + titulo + ' ' + al menos un '─' + r + ' ─╮'
  const t = fit(title, Math.max(1, maxTitle))
  const k = WIDTH - 3 - len(t) - 1 - len(r) - 3
  const fill = ' ' + '─'.repeat(Math.max(1, k))
  return { left: '╭─ ', title: t, fill, right: r, end: ' ─╮', text: '╭─ ' + t + fill + r + ' ─╮' }
}

// Filas de opciones (opciones: { letter, label, text, recommended }): sangria 1, letra, 2 espacios, columna 2 de 28 (recortada con …,
// con al menos un espacio antes de la 3), columna 3 con el resto. Marcar la fila elegida no mueve nada: la marca es de estilo, no de caracteres.
export function optionRows(options) {
  return options.map((o) => {
    // la marca de recomendada siempre se ve: si el nombre no entra, se recorta el nombre y no la marca
    const c2 = o.recommended ? fit(o.label, COL2 - 1 - len(REC)) + REC : o.label
    const text = ' ' + o.letter + '  ' + pad(c2, COL2 - 1) + ' ' + pad(o.text || '', COL3)
    return text
  })
}

// Marco completo: devuelve las lineas (todas de WIDTH caracteres).
export function frame({ title, right, body, footerL, footerR }) {
  const top = topBorder(title, right)
  const side = (s) => '│ ' + pad(s, INNER) + ' │'
  const out = [top.text, ...body.map(side)]
  out.push(side(pad(footerL || '', FOOT_L) + pad(footerR || '', INNER - FOOT_L)))
  out.push('╰' + '─'.repeat(WIDTH - 2) + '╯')
  return out
}

// ---- contenido de cada paso -------------------------------------------------------------------------------------------

const STACK = { node: 'Node', python: 'Python', go: 'Go', rust: 'Rust', flutter: 'Flutter', docs: 'Documentos', script: 'Script' }
const KIND = { spec: 'specs', plan: 'planes', research: 'investigaciones', reference: 'referencias', design: 'diseño', private: 'privada' }
const DECISION = { adopt: 'adoptar', move: 'mover', leave: 'dejar' }
const PERMS = [
  { value: 'user', label: 'para todos', text: 'todos tus proyectos, de una vez' },
  { value: 'project', label: 'este proyecto', text: 'queda en este repositorio' },
  { value: 'none', label: 'ninguno', text: 'lo decidís luego en /pignolo:setup' },
]
const PERMS_SUMMARY = { user: 'para todos tus proyectos', project: 'solo este proyecto', none: 'ninguno por ahora' }
const CREATES = 'docs/specs, docs/plans, docs/research, design y local'

const LABEL = 16
const detail = (label, value) => {
  const w = wrap(value, INNER - 2 - LABEL)
  return w.map((t, i) => ({ type: 'body', parts: [{ t: '  ' + pad(i === 0 ? label : '', LABEL), dim: true }, { t }] }))
}
const text = (t, o = {}) => ({ type: 'body', parts: [{ t: line(t), ...o }] })
const gap = () => ({ type: 'body', parts: [{ t: '' }] })

// Parte un texto largo en lineas de hasta n caracteres (por palabras).
function wrap(s, n) {
  const out = []
  let cur = ''
  for (const w of line(s).split(' ')) {
    if (len(cur) + (cur ? 1 : 0) + len(w) > n && cur) { out.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) out.push(cur)
  return out
}

const optionRow = (letter, label, desc, rec, picked) => ({ type: 'option', letter, text: optionRows([{ letter, label, text: desc, recommended: rec }])[0], picked })

function projectStep(data, st) {
  const p = data.project
  const lang = p.stacks.length ? p.stacks.map((s) => STACK[s] || s).join(' + ') : 'sin detectar'
  const tests = p.tests.state === 'declared' && p.tests.cmd ? p.tests.cmd : 'sin declarar'
  return {
    question: '¿Es así tu proyecto?',
    rows: [
      gap(), ...detail('Lenguaje', lang), ...detail('Tests', tests), ...detail('Rama principal', p.main || 'sin detectar'), gap(),
      optionRow('a', 'sí, es así', 'lo dejo como está detectado', true, st.picks.project === 'confirm'),
      optionRow('b', 'quiero corregir algo', 'te lo pregunto en el chat', false, st.picks.project === 'review'),
    ],
  }
}

function profileStep(data, st) {
  return {
    question: '¿Qué perfil de modelos usamos?',
    rows: [gap(), ...data.profiles.map((pr, i) => optionRow('abc'[i], pr.label, pr.line, pr.recommended, st.picks.profile === pr.id))],
  }
}

function permsStep(data, st) {
  const g = (id) => (data.permissions.groups.find((x) => x.id === id) || { line: '' }).line
  const rows = [gap()]
  if (g('blocks')) rows.push(...detail('Bloquea', g('blocks')))
  if (g('asks')) rows.push(...detail('Pregunta', g('asks')))
  rows.push(...detail('No pregunta', g('free') || 'push y merge normales'), gap())
  PERMS.forEach((o, i) => rows.push(optionRow('abc'[i], o.label, o.text, o.value === 'user', st.picks.perms === o.value)))
  return { question: 'Permisos: lo que pignolo agrega a Claude Code', rows }
}

function placesStep(data, st) {
  const rows = [gap(), text('Carpetas que ya tenés (el número cambia la decisión de cada una)', { dim: true }), gap()]
  data.places.candidates.forEach((c, i) => {
    const cur = st.picks.places[c.kind]
    const desc = cur === 'move' ? c.from + ' → ' + c.to : cur === 'leave' ? KIND[c.kind] + ': no la toco' : KIND[c.kind] + ': uso ' + c.from + ' tal cual'
    rows.push(optionRow(String(i + 1), DECISION[cur], desc, cur === c.decision, true))
  })
  return { question: '¿Qué hacemos con ellas?', rows }
}

function uiStep(data, st) {
  return {
    question: 'Interfaz: producto y diseño de tu proyecto',
    rows: [gap(), optionRow('a', 'más tarde', 'luego te ofrezco definir el diseño', true, st.picks.ui === 'later'), optionRow('b', 'definir ahora', '/pignolo-ui:define al terminar', false, st.picks.ui === 'now')],
  }
}

function summaryStep(data, st, uiInstalled) {
  const cands = data.places.candidates
  const rows = [
    gap(),
    ...detail('Proyecto', st.picks.project === 'review' ? 'lo corregimos en el chat' : 'como está detectado'),
    ...detail('Perfil', (data.profiles.find((p) => p.id === st.picks.profile) || { label: st.picks.profile }).label),
    ...detail('Permisos', PERMS_SUMMARY[st.picks.perms] || st.picks.perms),
  ]
  if (cands.length) {
    const n = (d) => cands.filter((c) => st.picks.places[c.kind] === d).length
    rows.push(...detail('Carpetas', 'adoptar ' + n('adopt') + ' · mover ' + n('move') + ' · dejar ' + n('leave')))
  } else {
    rows.push(...detail('Carpetas', 'creo ' + CREATES))
  }
  if (uiInstalled) rows.push(...detail('Interfaz', st.picks.ui === 'now' ? 'definir producto y diseño al terminar' : 'más tarde'))
  rows.push(gap(), ...wrap('Enter aplica: manda tus elecciones a /pignolo:init, que muestra la vista previa y pide tu sí antes de escribir.', INNER).map((t) => text(t, { dim: true })))
  return { question: 'Resumen', rows }
}

function blankStep() {
  return {
    question: 'Este proyecto está en blanco',
    rows: [
      gap(), ...wrap('No hay código ni configuración todavía. Solo puedo crear la estructura de carpetas.', INNER).map((t) => text(t)), gap(),
      optionRow('a', 'estructura', 'crea solo las carpetas de pignolo', true, true),
      optionRow('b', 'más tarde', 'cuando haya código, /pignolo:init', false, false),
    ],
  }
}

const STEP_VIEW = { project: projectStep, profile: profileStep, perms: permsStep, places: placesStep, ui: uiStep, summary: summaryStep, blank: blankStep }

// stepView({ step, state, data, uiInstalled }) -> { lines, rows, back, last }. `lines` son las lineas de texto (todas de WIDTH caracteres);
// `rows` describe cada una para el arbol (cuerpo con estilo, opcion con su letra, pie).
export function stepView({ step, state, data, uiInstalled, busy = false }) {
  const n = state.steps.length
  const s = (STEP_VIEW[step] || summaryStep)(data, state, uiInstalled)
  const isBlank = step === 'blank'
  const first = state.i === 0
  const last = state.i === n - 1
  const right = isBlank ? '' : 'paso ' + (state.i + 1) + ' de ' + n
  const footerL = first ? 'Esc cierra' : '← p atrás   Esc cierra'
  const footerR = busy ? 'enviando…' : isBlank ? 'Enter crear →' : last ? 'Enter aplicar →' : 'Enter siguiente →'
  const rows = []
  if (!isBlank) rows.push({ type: 'progress', done: state.i + 1, total: n, text: progressBar(state.i, n) })
  rows.push({ type: 'body', parts: [{ t: line(s.question), bold: true }] }, ...s.rows)
  rows.push(gap())
  const body = rows.map((r) => (r.type === 'option' ? r.text : r.type === 'progress' ? r.text : r.parts.map((p) => p.t).join('')))
  const lines = frame({ title: TITLE, right, body, footerL, footerR })
  return { lines, rows, top: topBorder(TITLE, right), footerL, footerR, back: !first, last, blank: isBlank }
}

// ---- arbol ------------------------------------------------------------------------------------------------------------

// wizardTree({ Box, Text, Button }, view, h): el simbolo de dolar no cruza imports, asi que el que llama (register.js) resuelve los elementos con
// la API de interfaz y los pasa. h = { pick(letra), next(), back(), color }. Cada linea es el texto de `view.lines`: el marco, las filas y el
// pie son Text; las opciones y los dos botones del pie son Button (la letra elige, `p` vuelve, Enter sigue). Sin Raster.
export function wizardTree({ Box, Text, Button }, view, h) {
  const color = h.color
  const dimT = (key, t) => Text({ key, dimColor: true, children: [t] })
  const out = []
  const t = view.top
  out.push(Box({
    key: 'wz-top',
    flexDirection: 'row',
    children: [dimT('wz-top-l', t.left), Text({ key: 'wz-top-t', bold: true, children: [t.title] }), dimT('wz-top-f', t.fill), dimT('wz-top-r', t.right + t.end)],
  }))
  view.rows.forEach((r, i) => {
    const key = 'wz-r' + i
    if (r.type === 'option') {
      const body = r.text.slice(4) // lo que sigue a ' a  ': el Button pone su letra (hotkey) delante
      out.push(Box({
        key,
        flexDirection: 'row',
        children: [
          dimT(key + '-l', '│  '),
          Box({ key: key + '-c', width: INNER - 1, flexShrink: 0, children: [Button({ key: 'wz-opt-' + r.letter, hotkey: r.letter, label: body, plain: true, dimColor: !r.picked, onPress: () => h.pick(r.letter) })] }),
          dimT(key + '-r', ' │'),
        ],
      }))
    } else if (r.type === 'progress') {
      out.push(Box({
        key,
        flexDirection: 'row',
        children: [dimT(key + '-l', '│ '), Text({ key: key + '-f', color, children: ['▰'.repeat(r.done)] }), dimT(key + '-u', '▱'.repeat(r.total - r.done) + ' '.repeat(INNER - r.total)), dimT(key + '-r', ' │')],
      }))
    } else {
      const used = r.parts.reduce((n, p) => n + len(p.t), 0)
      out.push(Box({
        key,
        flexDirection: 'row',
        children: [dimT(key + '-l', '│ '), ...r.parts.map((p, j) => Text({ key: key + '-p' + j, bold: p.bold || undefined, dimColor: p.dim || undefined, wrap: 'truncate-end', children: [fit(p.t, INNER)] })), Text({ key: key + '-s', children: [' '.repeat(Math.max(0, INNER - used))] }), dimT(key + '-r', ' │')],
      }))
    }
  })
  // pie: a la izquierda volver y cerrar, a la derecha (columna fija) seguir; Enter presiona el boton que tiene el foco
  const left = view.back
    ? Box({ key: 'wz-foot-lb', flexDirection: 'row', columnGap: 2, width: FOOT_L, flexShrink: 0, children: [Button({ key: 'wz-back', hotkey: 'p', label: '← atrás', plain: true, dimColor: true, onPress: () => h.back() }), dimT('wz-esc', 'Esc cierra')] })
    : Box({ key: 'wz-foot-lb', width: FOOT_L, flexShrink: 0, children: [dimT('wz-esc', 'Esc cierra')] })
  out.push(Box({
    key: 'wz-foot',
    flexDirection: 'row',
    children: [dimT('wz-foot-l', '│ '), left, Box({ key: 'wz-foot-rb', width: INNER - FOOT_L, flexShrink: 0, children: [Button({ key: 'wz-next', label: view.footerR, plain: true, autoFocus: true, onPress: () => h.next() })] }), dimT('wz-foot-r', ' │')],
  }))
  out.push(dimT('wz-bottom', view.lines[view.lines.length - 1]))
  return Box({ key: 'wz-box', flexDirection: 'column', width: WIDTH, children: out })
}
