// pignolo-panel: solo lee y dibuja. Lee UN archivo (.pignolo/panel-state.json, que escribe pignolo) y lo muestra; la pestaña UI
// (solo con pignolo-ui) lee ademas PRODUCT.md, DESIGN.md y la carpeta .pignolo-ui del proyecto; el asistente de inicio lee
// `.git/pignolo/wizard-detect.json` (lo deja el hook de arranque del nucleo en un proyecto sin pignolo) y no escribe nada.
// Efectos permitidos: llenar o sugerir texto en el prompt (nunca lo envia), copiar al portapapeles (`ui.copy`), UNA consulta a
// haiku (`model.complete`, solo al abrir la pestaña UI, con un resumen sin contenido de archivos) y UN solo lugar que envia
// (`submitText`), al que llegan solo tres botones: la respuesta de una decision de "Te toca" (`submitAnswer`), el atajo de la
// pestaña UI (`submitUiRequest`) y las elecciones del asistente de inicio (`submitWizard`). No aprueba ni niega nada.
import {
  SYMBOL, COLOR, minutes, tokens, usd, plural,
  newRegistry, addAgent, addUsage, noteStep, finish, reopen, running, elapsed, sorted,
  agentView, demoView, layoutAgents, ago, minutesEs, kilo,
  parseJson,
} from './model.js'
import {
  readState, suggestionText, answerPrefix, answerText, answerInvalid, hasHiddenChars, oneLine, pickColor, progress, bar, stageLine, sparkText, MARK,
} from './state.js'
import { readUiInput, hashInput, knownScreen } from './ui-input.js'
import { createRecommender } from './ui-recs.js'
import { detectUi } from './ui-detect.js'
import { uiRequestText } from './ui-request.js'
import { tabModel, SHORTCUTS } from './ui-tab.js'
import { contextFor } from './ui-rules.js'
import { readWizardDetect, stepsFor, initialState, move, choicesOf, choicesMessage, DECLINE_MESSAGE } from './wizard-model.js'
import { WIDTH as WIZARD_WIDTH, stepView, wizardTree } from './wizard-view.js'

const PANE = 'pignolo-panel'
const TABS_BASE = [['now', '1', 'Live'], ['branches', '2', 'Ramas'], ['cost', '3', 'Costo']]
const UI_TAB = ['ui', '4', 'UI']
const SPARK_N = 24
const POLL_MS = 3000
// Ancho minimo del terminal para abrir el panel solo (D-P5): 144 la primera vez, 110 despues.
const OPEN_FIRST_COLS = 144
const OPEN_NEXT_COLS = 110
// Letras de las respuestas (una por opcion en todo el panel). Se saltan las de acciones: c copiar, h hash, p pros y contras, s resumen, z despues.
const LETTERS = 'abdefgijklmnoqrtuvwxy'.split('')
const SUMMARY_TEXT = 'Resumime en pocas líneas qué está haciendo cada agente ahora y si alguno necesita algo de mí.'

let reg = newRegistry()
let tab = 'now'
let timer = null
let cache = { at: 0, value: null }
let busyTurns = new Set()
let activity = []
let demoMode = null // null | 'idle' | 'busy'
let autoOpen = true
let lastSuggest = { text: null, shown: null }
let prevCards = new Map()
let lastCols = 0
let everOpened = false
let announced = null // null hasta la primera lectura; despues, el conjunto de decisiones ya anunciadas
let unfolded = false // `p`: pros y contras desplegados
let selected = null // fila elegida: { key, kind, copy, hash }
const postponedLocal = new Set() // `z`: ocultas solo en esta sesion del mod (close-session las persiste)
const answered = new Map() // id -> true: respondidas desde el panel (no se reenvian aunque el registro aun las traiga abiertas)
const sending = new Set() // ids con un envio en curso: `prompt.submit` espera a que la sesion quede libre y una segunda pulsacion no puede encolar otro (RP-01)
// pestaña UI
let uiDetect = { installed: false, via: 'none' } // ¿esta pignolo-ui? se evalua al cargar y al abrir el panel
let uiAsk = true // userConfig `uiRecommendations`: en false la pestaña usa solo reglas y nunca consulta al modelo
let uiResult = null // lo ultimo que devolvio el recomendador (vale solo para las mismas entradas)
let uiPending = false // hay una consulta en vuelo
let uiSending = false // hay un pedido en envio: un atajo se envia una sola vez
let uiCache = { at: 0, value: null } // lectura de los archivos de pignolo-ui (cache corta, como el registro)
const recommender = createRecommender({})
// asistente de inicio (etapa 3)
const wizard = { open: false, data: null, steps: [], state: null, uiInstalled: false, demo: false, sending: false, sent: false }
let wizardOpened = false // el asistente se abre solo una vez por sesion
let wizardTicks = 0 // el hook de arranque deja la deteccion unos segundos despues de empezar: se mira en los primeros ciclos del temporizador
const WIZARD_TICKS = 40

// ---- lectura (unico archivo: .pignolo/panel-state.json) ----

// Sube desde el cwd buscando `rel` (hasta 12 niveles); la ruta completa o null.
async function findUp($, rel) {
  let dir = String(await $.session.cwd()).replace(/\\/g, '/').replace(/\/+$/, '')
  for (let i = 0; i < 12 && dir; i += 1) {
    if (await $.fs.exists(dir + rel)) return dir + rel
    const up = dir.replace(/\/[^/]*$/, '')
    if (up === dir || up === '') break
    dir = up
  }
  return null
}

const findState = ($) => findUp($, '/.pignolo/panel-state.json')

// "Activo" lo dice project.md (lo mismo que usa el nucleo), no el registro: el registro puede tardar o faltar. 'pending' = activo sin datos.
async function idleKind($) {
  try {
    return (await findUp($, '/.pignolo/project.md')) ? 'pending' : 'none'
  } catch {
    return 'none'
  }
}

function emptySnap(kind) {
  return { kind, demo: false, plan: null, decisions: [], branches: [], cards: [], main: null, next: { none: 'nothing' }, agents: [], activity: [] }
}

async function realSnapshot($) {
  const file = await findState($)
  if (!file) return emptySnap(await idleKind($))
  const { kind, snap } = readState(parseJson(String(await $.fs.read(file))))
  if (kind === 'none' || kind === 'unknown') return emptySnap(await idleKind($)) // registro ilegible o de otra forma: no es "pignolo apagado"
  return { ...snap, kind, demo: false }
}

async function demoSnapshot($) {
  const { snap } = readState(parseJson(String(await $.fs.read($.plugin.root + '/sample/panel-state.json'))))
  return { ...snap, kind: 'ok', demo: true, agents: snap.agents.map((a) => ({ ...a, status: demoMode === 'busy' ? 'running' : 'done' })) }
}

// Estado completo, con cache corta. Avisa (toast) cuando una tarjeta pasa a hecha.
async function readSnapshot($, now) {
  if (cache.value && now - cache.at < 1500) return cache.value
  let value = emptySnap('none')
  try {
    value = demoMode ? await demoSnapshot($) : await realSnapshot($)
  } catch {
    value = emptySnap(await idleKind($))
  }
  for (const c of value.cards) {
    if (prevCards.size && c.status === 'done' && prevCards.get(c.id) && prevCards.get(c.id) !== 'done') $.ui.toast('✓ tarjeta ' + c.id + ' terminada')
  }
  prevCards = new Map(value.cards.map((c) => [c.id, c.status]))
  cache = { at: now, value }
  return value
}

// Decisiones del usuario que se muestran: abiertas, no respondidas desde el panel, no pospuestas en esta sesion.
function visibleDecisions(snap) {
  return snap.decisions.filter((d) => d.status === 'open' && !answered.has(d.id) && !postponedLocal.has(d.id))
}

// ---- siguiente paso (viene del registro; el mod no tiene reglas) ----------------------

function runningCount(snap) {
  return running(reg) + snap.agents.filter((a) => a.status === 'running').length
}

function isBusy(snap) {
  return runningCount(snap) > 0 || busyTurns.size > 0
}

// El paso del registro, salvo que algo corra en esta sesion o el usuario ya haya resuelto esa decision aqui.
function stepOf(snap) {
  if (snap.kind !== 'ok' || isBusy(snap) || snap.next.none) return null
  if (snap.next.rule === 'decision' && visibleDecisions(snap).length === 0) return null
  return snap.next
}

// Propone el siguiente paso como sugerencia tenue; solo si hay uno claro. Nunca lo envia.
async function syncSuggest($) {
  try {
    const step = stepOf(await readSnapshot($, await $.clock.now()))
    if (!step) {
      lastSuggest = { text: null, shown: null }
      return
    }
    const text = suggestionText(step)
    const res = await $.prompt.suggest({ text })
    lastSuggest = { text, shown: Boolean(res && res.isShown) }
  } catch {
    lastSuggest = { text: null, shown: null }
  }
}

// Llena el prompt (no lo envia). El panel queda abierto; Esc lo cierra y 0 lo vuelve a abrir.
async function fillPrompt($, text) {
  let ok = false
  try {
    const r = await $.prompt.fill({ text, mode: 'replace' })
    ok = Boolean(r && r.isFilled)
  } catch {
    ok = false
  }
  if (ok) $.ui.toast('Escrito en el prompt · Esc cierra el panel y vas al prompt; 0 lo vuelve a abrir')
  else $.ui.toast('No pude llenar el prompt ahora')
}

async function openPane($) {
  return $.ui.open({ id: PANE, title: 'pignolo', focus: true, closeOnEscape: true })
}

// Abre el panel solo, una vez por decision nueva (D-P5, R-P10). Al cargar, lo que ya existe se marca anunciado sin abrir.
async function checkNewDecisions($) {
  if (demoMode) return
  const snap = await readSnapshot($, await $.clock.now())
  const ids = snap.kind === 'ok' ? snap.decisions.filter((d) => d.status === 'open').map((d) => d.id) : []
  if (announced === null) {
    announced = new Set([...ids])
    return
  }
  const fresh = ids.filter((id) => !announced.has(id) && !answered.has(id))
  for (const d of snap.decisions) if (d.shown) announced.add(d.id)
  for (const id of ids) announced.add(id)
  if (fresh.length === 0 || !autoOpen) return
  const need = everOpened ? OPEN_NEXT_COLS : OPEN_FIRST_COLS
  if (lastCols < need) return
  everOpened = true
  await openPane($)
}

// ---- dibujo ----------------------------------------------------------------------

function cell(Box, Text, w, text, props) {
  return Box({ width: w, flexShrink: 0, children: [Text({ wrap: 'truncate-end', ...props, children: [String(text)] })] })
}

// Los agentes que corren ahora: los de la sesion (registro del mod) y, en el modo demo, los de muestra.
function runningViews(snap, now) {
  const mine = sorted(reg).filter((r) => r.status === 'running').map(agentView)
  const extra = snap.agents.map((a, i) => demoView(a, now, i)).filter((a) => a.status === 'running')
  return [...mine, ...extra]
}

function sep(Text) {
  return Text({ dimColor: true, children: [' · '] })
}

// Atajos al pie de cada bloque, siempre con la misma forma: "tecla  verbo", separados por tres espacios.
export function footer(items) {
  return items.map(([k, v]) => k + '  ' + v).join('   ')
}

// Un bloque: marco redondeado, relleno horizontal de 1, titulo (y progreso a la derecha) en la primera linea, atajos al pie.
function block($, e, { key, title, right, body, foot, width }) {
  const { Box, Text } = $.ui.resolve(e)
  const head = Box({
    key: key + '-head',
    flexDirection: 'row',
    children: [
      Box({ flexGrow: 1, children: [Text({ bold: true, dimColor: true, children: [title] })] }),
      right ? Text({ dimColor: true, children: [right] }) : '',
    ],
  })
  return Box({
    key,
    borderStyle: 'round',
    borderDimColor: true,
    paddingX: 1,
    flexDirection: 'column',
    width,
    children: [head, ...body, ...(foot ? [Text({ key: key + '-foot', dimColor: true, wrap: 'truncate-end', children: [foot] })] : [])],
  })
}

function notActive(kind) {
  if (kind === 'newer') return 'pignolo-panel: el registro es de una versión más nueva; actualizá el panel (/plugin update)'
  return kind === 'pending' ? 'pignolo está activo; el panel se completa en unos segundos' : 'pignolo no está activo en este proyecto'
}

async function bandTree($, e, next) {
  const now = await $.clock.now()
  if (e.viewport && e.viewport.columns) lastCols = e.viewport.columns
  const snap = await readSnapshot($, now)
  const n = runningCount(snap)
  const { Box, Text, Button } = $.ui.resolve(e)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const hasData = reg.byId.size > 0 || snap.agents.length > 0 || snap.kind === 'ok'
  if (!hasData) {
    const theirs0 = await next(e)
    const line = Text({ key: 'band-off', dimColor: true, wrap: 'truncate-end', children: ['◆ ' + notActive(snap.kind)] })
    return Box({ flexDirection: 'column', children: theirs0 ? [line, theirs0] : [line] })
  }
  const pending = visibleDecisions(snap)
  const u = await $.session.usage()
  const parts = [Text({ color: 'claude', children: ['◆'] }), ' ', snap.plan ? Text({ bold: true, children: [snap.plan.slug] }) : Text({ dimColor: true, children: ['sin plan'] })]
  if (snap.cards.length) {
    const p = progress(snap.cards)
    parts.push(' ', Text({ color: 'success', children: [bar(p.frac, 8)] }), ' ' + p.done + '/' + p.total)
  }
  if (n > 0) parts.push(sep(Text), Text({ color: warn, children: ['● '] }), plural(n, 'agente', 'agentes'))
  if (pending.length > 0) {
    parts.push(sep(Text), Text({ color: warn, bold: true, children: ['⚑ '] }), pending.length === 1 ? '1 decisión tuya' : pending.length + ' decisiones tuyas')
  }
  parts.push(sep(Text), Text({ dimColor: true, children: [usd(u.cost && u.cost.usd) + ' USD · ctx ' + (u.context && u.context.percent != null ? u.context.percent : '—') + ' %'] }))
  // Botón de la banda: con el prompt vacío, escribir 0 (y esperar) abre el panel.
  const open = Button({ key: 'band-open', hotkey: '0', plain: true, dimColor: true, label: 'panel', onPress: () => openPaneByUser($) })
  // una sola linea: el siguiente paso vive en el bloque SIGUIENTE del panel y como sugerencia tenue en el prompt
  const lines = [Box({ flexDirection: 'row', columnGap: 2, children: [Text({ wrap: 'truncate-end', children: parts }), open] })]
  const theirs = await next(e)
  return Box({ flexDirection: 'column', children: theirs ? [...lines, theirs] : lines })
}

function stepButtons(Box, Button, $, step) {
  const items = [
    Button({ key: 'next-main', label: step.text, variant: 'primary', onPress: () => fillPrompt($, suggestionText(step)) }),
    ...step.alternatives.map((a, i) => Button({ key: 'next-alt-' + i, label: a.text, variant: 'secondary', onPress: () => fillPrompt($, suggestionText(a)) })),
  ]
  return Box({ key: 'next-buttons', flexDirection: 'row', columnGap: 2, children: items })
}

// ---- "Te toca": respuestas -----------------------------------------------------------

// El UNICO lugar del paquete que envia un mensaje (`prompt.submit`). Lo llama solo el manejador de pulsacion del boton de
// una opcion (abajo, bloque `press-handler:answer`): ni un evento, ni un temporizador, ni el siguiente paso. El texto sale
// del registro: pregunta recortada y limpia, opcion tal cual (R-P9). No vive en otro archivo porque `$` no cruza imports.
// Devuelve true si el mensaje entro; false si no pudo enviarse (el llamador avisa y conserva la decision).
async function submitAnswer($, decision, option) {
  return submitText($, answerText(decision, option))
}

// El UNICO `prompt.submit` del paquete. Solo texto de una linea y sin caracteres invisibles (control, formato, uso privado, sin
// asignar): si no, no se envia nada. Lo llaman submitAnswer y submitUiRequest, y a esos dos solo un boton cada uno.
async function submitText($, text) {
  if (typeof text !== 'string' || text === '' || /[\r\n\p{Zl}\p{Zp}]/u.test(text) || hasHiddenChars(text)) return false
  try {
    const res = await $.prompt.submit({ text, asUser: true })
    return Boolean(res) && res.drop === undefined
  } catch {
    return false
  }
}

// El pedido de un atajo de la pestaña UI. El texto sale de una plantilla fija (ui-request.js): el porque del modelo no entra.
// Devuelve true si el mensaje entro; false si no era valido o no pudo enviarse.
async function submitUiRequest($, action, target, context) {
  const text = uiRequestText(action, target, context)
  if (text === null) return false
  return submitText($, text)
}

function sameOptions(a, b) {
  return a.options.length === b.options.length && a.options.every((x, i) => x.label === b.options[i].label)
}

// <press-handler:answer> el UNICO sitio desde el que se llama a submitAnswer: el boton de una opcion.
function optionButton($, Button, d, o, i, letter) {
  const rec = o.label === d.recommended
  return Button({
    key: 'ans-' + d.id + '-' + i,
    hotkey: letter || undefined,
    label: o.label + (rec ? '  · recomendada' : ''), // la letra la dibuja el motor ("a: ...")
    plain: true,
    dimColor: !rec,
    onPress: async () => {
      if (answered.has(d.id) || sending.has(d.id)) return // ya enviada o enviandose: una respuesta se envia una sola vez
      if (answerInvalid(d, o.label)) {
        $.ui.toast('Pregunta inválida: no se envía; respondela en el prompt')
        return
      }
      sending.add(d.id) // antes de cualquier await: lo de abajo espera a la sesion
      $.ui.invalidate('ui.render')
      try {
        // Relee el registro: si la decision ya no esta abierta o cambio su pregunta u opciones, no se envia lo que se dibujo.
        cache = { at: 0, value: null }
        const fresh = await readSnapshot($, await $.clock.now())
        const cur = fresh.kind === 'ok' ? fresh.decisions.find((x) => x.id === d.id) : null
        if (!cur || cur.status !== 'open' || cur.question !== d.question || !sameOptions(cur, d)) {
          $.ui.toast('La decisión cambió: mirá el panel y elegí de nuevo')
          return
        }
        const ok = await submitAnswer($, d, o.label)
        if (!ok) {
          $.ui.toast('No pude enviar la respuesta; escribila en el prompt')
          return
        }
        answered.set(d.id, true)
        cache = { at: 0, value: null }
        $.ui.toast('Enviado: ' + o.label)
      } finally {
        sending.delete(d.id)
        $.ui.invalidate('ui.render')
      }
    },
  })
}
// </press-handler:answer>

// La opcion libre "Otra": llena el prompt con el comienzo de la respuesta; el usuario escribe y envia. No envia nada.
function otherButton($, Button, d, i, letter) {
  return Button({
    key: 'ans-' + d.id + '-other',
    hotkey: letter || undefined,
    label: 'Otra…',
    plain: true,
    dimColor: true,
    onPress: () => fillPrompt($, answerPrefix(d)),
  })
}

function decisionsBlock($, e, snap, width) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const list = visibleDecisions(snap)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const body = []
  let li = 0
  const nextLetter = () => LETTERS[li++] || ''
  const letters = []
  list.forEach((d, qi) => {
    const opts = [...d.options].sort((x, y) => (y.label === d.recommended) - (x.label === d.recommended))
    body.push(Text({ key: 'q-' + d.id, wrap: 'wrap', children: [Text({ color: warn, bold: true, children: [(qi + 1) + '  '] }), Text({ bold: true, children: [d.question] })] }))
    if (d.context) body.push(Text({ key: 'qc-' + d.id, dimColor: true, wrap: 'wrap', children: ['   ' + d.context] }))
    const rows = []
    if (sending.has(d.id)) rows.push(Text({ key: 'ans-' + d.id + '-sending', dimColor: true, children: ['enviando…'] }))
    else opts.forEach((o, i) => {
      const k = nextLetter()
      letters.push(k)
      rows.push(optionButton($, Button, d, o, i, k))
      if (unfolded && o.pros) rows.push(Text({ key: 'pros-' + d.id + '-' + i, dimColor: true, wrap: 'wrap', children: ['     ↳ ' + o.pros] }))
    })
    if (!sending.has(d.id)) {
      const k = nextLetter()
      letters.push(k)
      rows.push(otherButton($, Button, d, opts.length, k))
    }
    body.push(Box({ key: 'qb-' + d.id, flexDirection: 'column', paddingLeft: 3, children: rows }))
    if (qi < list.length - 1) body.push(Text({ key: 'qs-' + d.id, children: [' '] }))
  })
  const range = letters.length > 1 ? letters[0] + '–' + letters[letters.length - 1] : letters[0] || 'a'
  const actions = [
    Button({ key: 'toggle-pros', hotkey: 'p', label: (unfolded ? 'ocultar' : 'ver') + ' pros y contras', plain: true, dimColor: true, onPress: () => { unfolded = !unfolded; $.ui.invalidate('ui.render') } }),
    Button({ key: 'postpone', hotkey: 'z', label: 'dejar la 1 para después', plain: true, dimColor: true, onPress: () => { postponeFirst($) } }),
  ]
  body.push(Text({ key: 'ta', children: [' '] }), Box({ key: 'te-actions', flexDirection: 'row', columnGap: 3, children: actions }))
  return block($, e, {
    key: 'blk-tetoca',
    title: 'TE TOCA',
    right: list.length === 1 ? '1 decisión' : list.length + ' decisiones',
    body,
    foot: footer([[range, 'responder'], ['p', 'pros y contras'], ['z', 'después']]),
    width,
  })
}

// `z`: oculta la primera decision solo en esta sesion. No envia nada y no la responde; `close-session` la persiste.
function postponeFirst($) {
  const snap = cache.value
  const first = snap ? visibleDecisions(snap)[0] : null
  if (!first) return
  postponedLocal.add(first.id)
  $.ui.toast('Pospuesta hasta el cierre de la sesión: ' + first.id)
  $.ui.invalidate('ui.render')
}

// ---- filas elegibles y copiar --------------------------------------------------------

function rowSelect($, target) {
  selected = target
  $.ui.invalidate('ui.render')
}

async function copySelected($, press, what) {
  const text = selected ? (what === 'hash' ? selected.hash : selected.copy) : ''
  if (!selected) {
    $.ui.toast('Elegí una fila (Tab y Enter) y apretá c para copiar')
    return
  }
  if (!text) {
    $.ui.toast(what === 'hash' ? 'Esa fila no tiene hash' : 'Esa fila no tiene qué copiar')
    return
  }
  let ok = false
  try {
    const r = await $.ui.copy({ text, surface: press && press.surface })
    ok = Boolean(r && r.isCopied)
  } catch {
    ok = false
  }
  $.ui.toast(ok ? 'Copiado: ' + text : 'No pude copiar')
}

function copyButtons($, e) {
  const { Box, Button } = $.ui.resolve(e)
  return Box({
    key: 'copy-actions',
    flexDirection: 'row',
    columnGap: 3,
    children: [
      Button({ key: 'copy', hotkey: 'c', label: 'copiar la fila elegida', plain: true, dimColor: true, onPress: (press) => copySelected($, press, 'main') }),
      Button({ key: 'copy-hash', hotkey: 'h', label: 'copiar su hash', plain: true, dimColor: true, onPress: (press) => copySelected($, press, 'hash') }),
    ],
  })
}

// ---- Live ---------------------------------------------------------------------------

function inProgressBlock($, e, snap, cols, width) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const cards = snap.cards
  const p = progress(cards)
  const STAGE_ES = { spec: 'especificando', claims: 'afirmaciones', 'spec-review': 'revisando la spec', 'scope-card': 'tarjeta de alcance', 'plan-written': 'plan escrito', audited: 'plan auditado', executing: 'ejecutando', validating: 'validando', 'final-review': 'revisión final', closed: 'cerrado' }
  const stageEs = STAGE_ES[snap.plan.stage] || snap.plan.stage
  const pct = cards.length ? Math.round(p.frac * 100) : 0
  const right = cards.length ? stageEs + ' · ' + p.done + ' de ' + p.total : stageEs
  const inner = width - 4
  const body = [Text({ key: 'plan-name', bold: true, wrap: 'truncate-end', children: [snap.plan.slug] })]
  if (cards.length) {
    // barra fina a todo el ancho del bloque, con el porcentaje al final
    const bw = Math.max(10, inner - 6)
    const fill = Math.round(p.frac * bw)
    body.push(
      Text({ key: 'plan-bar', children: [Text({ color: 'success', children: ['━'.repeat(fill)] }), Text({ dimColor: true, children: ['─'.repeat(bw - fill)] }), Text({ bold: true, children: [' ' + String(pct).padStart(3) + '%'] })] }),
      Text({ key: 'pb', children: [' '] }),
    )
    const idw = 6
    const evW = 21
    const titleW = Math.max(10, inner - idw - evW - 8)
    const glyph = { done: '✓', running: '◐', failed: '✗', todo: '○' }
    cards.forEach((c, i) => {
      const st = c.status
      const color = st === 'done' ? 'success' : st === 'running' ? warn : st === 'failed' ? 'error' : undefined
      const ev = []
      if (c.red) ev.push(Text({ key: 'r', color: 'error', children: ['● rojo'] }))
      if (c.red && c.green) ev.push(Text({ key: 'ar', dimColor: true, children: ['  ›  '] }))
      if (c.green) ev.push(Text({ key: 'v', color: 'success', children: ['● verde'] }))
      if (!c.red && !c.green) ev.push(Text({ key: 'n', dimColor: true, children: [st === 'running' ? 'trabajando…' : ' '] }))
      const sel = selected && selected.key === 'row-card-' + c.id
      body.push(
        Box({
          key: 'c-' + c.id,
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Text({ color, bold: st !== 'todo', dimColor: st === 'todo', children: [glyph[st]] }),
            Box({
              width: idw, flexShrink: 0,
              children: [Button({ key: 'row-card-' + c.id, label: (sel ? '▸' : '') + c.id, plain: true, dimColor: st === 'todo', onPress: () => rowSelect($, { key: 'row-card-' + c.id, kind: 'card', copy: c.evidence, hash: '' }) })],
            }),
            cell(Box, Text, titleW, c.title || c.evidence || ' ', { bold: st === 'running', dimColor: st === 'todo' }),
            Box({ width: evW, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: ev })] }),
          ],
        }),
      )
      // un hilo tenue entre tarjetas, verde mientras el camino ya está hecho
      if (i < cards.length - 1) body.push(Text({ key: 'cl-' + c.id, color: st === 'done' ? 'success' : undefined, dimColor: st !== 'done', children: [' ' + (st === 'done' ? '│' : '┊')] }))
    })
  } else body.push(Text({ dimColor: true, children: ['Todavía sin tarjetas de tarea.'] }))
  return block($, e, { key: 'blk-encurso', title: 'EN CURSO', right, body, foot: footer([['Tab', 'elegir fila'], ['Enter', 'marcarla'], ['c', 'copiar']]), width })
}

// Anchos de las columnas de cada agente (en celdas). El resto es de la tarea.
const W_GLYPH = 2
const W_NEST = 4
const W_MODEL = 9
const W_TIME = 9
const W_TOK = 8
const W_CTX = 8
const W_AGO = 16
const DIM = { dimColor: true }

// Lo que hace un agente ahora (linea 2): la ultima herramienta de su ultimo paso, o que escribe la respuesta, o que empieza.
function activityOf(a, now) {
  if (!a.last) return 'empezando…'
  if (a.last.kind === 'text') return 'escribiendo la respuesta'
  return a.last.name + (a.last.target ? '  ' + a.last.target : '')
}

// Una linea de agente: glifo, tarea en negrita (y su tipo tenue), modelo, tiempo, tokens y ctx segun las columnas que entran.
function agentLine($, e, en, cols, inner, now) {
  const { Box, Text } = $.ui.resolve(e)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const a = en.agent
  const pad = en.nested ? W_NEST : 0
  const taskW = Math.max(8, inner - pad - W_GLYPH - (cols.model ? W_MODEL : 0) - W_TIME - (cols.tokens ? W_TOK : 0) - W_CTX)
  const task = a.description || a.type
  const showType = a.description && a.type && a.type !== 'general-purpose'
  const children = []
  if (pad) children.push(cell(Box, Text, pad, '  └ ', { dimColor: true }))
  children.push(
    cell(Box, Text, W_GLYPH, en.flags.stalled ? '◌' : '●', en.flags.stalled ? { color: warn } : {}),
    Box({ width: taskW, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [Text({ bold: true, children: [task] }), showType ? Text({ dimColor: true, children: ['  ' + a.type] }) : ''] })] }),
  )
  if (cols.model) children.push(cell(Box, Text, W_MODEL, a.model || '—', { dimColor: true }))
  children.push(cell(Box, Text, W_TIME, minutesEs(now - a.startedAt).padStart(W_TIME - 1) + ' ', {}))
  if (cols.tokens) children.push(cell(Box, Text, W_TOK, kilo(a.tokens).padStart(W_TOK - 1) + ' ', { dimColor: true }))
  children.push(cell(Box, Text, W_CTX, kilo(a.ctx).padStart(W_CTX - 1) + ' ', en.flags.ctxHigh ? { color: warn, bold: true } : {}))
  return Box({ key: 'ag-' + a.id, flexDirection: 'row', children })
}

// La segunda linea (tenue, sangrada): que hace y hace cuanto termino ese paso; parado, en el color de aviso.
function agentDetail($, e, en, cols, inner, now) {
  const { Box, Text } = $.ui.resolve(e)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const a = en.agent
  const lead = (en.nested ? W_NEST : 0) + W_GLYPH
  const since = now - (a.lastAt ?? a.startedAt)
  const showAgo = cols.ago && !en.flags.stalled && a.last && a.lastAt != null
  const textW = Math.max(8, inner - lead - (showAgo ? W_AGO : 0))
  const stalled = en.flags.stalled
  const children = [
    Box({ width: lead, flexShrink: 0, children: [Text({ children: [' '] })] }),
    Box({ width: textW, flexShrink: 0, children: [Text({ wrap: 'truncate-end', dimColor: !stalled, color: stalled ? warn : undefined, children: [stalled ? 'sin actividad ' + ago(since) : activityOf(a, now)] })] }),
  ]
  if (showAgo) children.push(cell(Box, Text, W_AGO, ago(since).padStart(W_AGO), { dimColor: true }))
  return Box({ key: 'ag-' + a.id + '-2', flexDirection: 'row', children })
}

// Una linea sola (modo compacto, sin avisos): glifo, tarea, herramienta, tiempo y ctx.
function agentShort($, e, en, inner, now) {
  const { Box, Text } = $.ui.resolve(e)
  const a = en.agent
  const pad = en.nested ? W_NEST : 0
  const rest = Math.max(16, inner - pad - W_GLYPH - W_TIME - W_CTX)
  const taskW = Math.floor(rest * 0.4)
  const children = []
  if (pad) children.push(cell(Box, Text, pad, '  └ ', { dimColor: true }))
  children.push(
    cell(Box, Text, W_GLYPH, '●', {}),
    cell(Box, Text, taskW, a.description || a.type, { bold: true }),
    cell(Box, Text, rest - taskW, activityOf(a, now), { dimColor: true }),
    cell(Box, Text, W_TIME, minutesEs(now - a.startedAt).padStart(W_TIME - 1) + ' ', {}),
    cell(Box, Text, W_CTX, kilo(a.ctx).padStart(W_CTX - 1) + ' ', {}),
  )
  return Box({ key: 'ag-' + a.id, flexDirection: 'row', children })
}

// TRABAJANDO: un renglon por agente (tarea, modelo, tiempo, tokens, ctx y lo que hace ahora). `rows`: las filas que el bloque puede usar.
function workingBlock($, e, snap, now, width, rows) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const agents = runningViews(snap, now)
  if (agents.length === 0) return block($, e, { key: 'blk-trabajando', title: 'TRABAJANDO', right: '', body: [Text({ dimColor: true, children: ['○ nada corriendo'] })], width })
  const inner = width - 4
  const lay = layoutAgents(agents, { rows, cols: inner, now })
  const cols = lay.columns
  const gap = (k) => Text({ key: 'ag-gap-' + k, children: [' '] })
  const body = []
  if (lay.mode === 'roomy') {
    const samples = snap.demo ? snap.activity : activity
    body.push(samples.length ? Text({ key: 'activity', color: warn, children: [sparkText(samples, SPARK_N)] }) : gap('s'), gap('h1'))
    const taskW = Math.max(8, inner - W_GLYPH - (cols.model ? W_MODEL : 0) - W_TIME - (cols.tokens ? W_TOK : 0) - W_CTX)
    const head = [cell(Box, Text, W_GLYPH, ' ', {}), cell(Box, Text, taskW, 'tarea', DIM)]
    if (cols.model) head.push(cell(Box, Text, W_MODEL, 'modelo', DIM))
    head.push(cell(Box, Text, W_TIME, 'tiempo'.padStart(W_TIME - 1) + ' ', DIM))
    if (cols.tokens) head.push(cell(Box, Text, W_TOK, 'tokens'.padStart(W_TOK - 1) + ' ', DIM))
    head.push(cell(Box, Text, W_CTX, 'ctx'.padStart(W_CTX - 1) + ' ', DIM))
    body.push(Box({ key: 'ag-head', flexDirection: 'row', children: head }), gap('h2'))
  } else body.push(gap('h1'))
  lay.entries.forEach((en, i) => {
    const full = lay.mode === 'roomy' || en.lines === 2
    if (full) body.push(agentLine($, e, en, cols, inner, now), agentDetail($, e, en, cols, inner, now))
    else body.push(agentShort($, e, en, inner, now))
    if (en.gapAfter) body.push(gap(i))
  })
  if (lay.rest > 0) body.push(Text({ key: 'ag-rest', dimColor: true, wrap: 'truncate-end', children: ['+ ' + lay.rest + ' más, trabajando sin avisos'] }))
  if (lay.mode === 'compact') body.push(gap('c'))
  // llena el prompt con el pedido de resumen; nunca lo envia
  body.push(Button({ key: 'summary', hotkey: 's', label: 'resumen', plain: true, dimColor: true, onPress: () => fillPrompt($, SUMMARY_TEXT) }))
  const right = plural(lay.summary.count, 'agente', 'agentes') + ' · ' + kilo(lay.summary.tokens) + ' · ' + minutesEs(lay.summary.longest)
  return block($, e, { key: 'blk-trabajando', title: 'TRABAJANDO', right, body, width })
}

// Filas que puede usar TRABAJANDO: las que muestra el panel menos una estimacion simple de lo que ocupan los otros bloques de la
// pestaña (pestañas y huecos, SIGUIENTE, TE TOCA, EN CURSO y los botones de copiar). No es exacta; con piso de 8 filas.
function workingRows(e, snap) {
  const total = Number(e.props && e.props.scroll && e.props.scroll.bodyRows) || 30
  let other = 2 + (snap.demo ? 1 : 0)
  if (stepOf(snap)) other += 8
  const list = visibleDecisions(snap)
  if (list.length) other += 7 + list.reduce((n, d) => n + 2 + (d.context ? 1 : 0) + (d.options.length + 1) * (unfolded ? 2 : 1), 0)
  if (snap.plan) other += 6 + (snap.cards.length ? 2 + 2 * snap.cards.length - 1 : 1)
  if (snap.cards.length) other += 2
  return Math.max(8, total - other)
}

function nowBody($, e, snap, now, cols, width) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const gap = (k) => Text({ key: 'gap' + k, children: [' '] })
  const out = []
  if (snap.kind !== 'ok') {
    out.push(block($, e, { key: 'blk-off', title: 'PIGNOLO', body: [Text({ children: [notActive(snap.kind)] }), Text({ dimColor: true, children: ['Para ver el panel con datos de muestra: /pignolo-panel demo'] })], width }))
    return out
  }
  const step = stepOf(snap)
  if (step) {
    out.push(
      block($, e, {
        key: 'blk-siguiente',
        title: 'SIGUIENTE',
        body: [
          Text({ wrap: 'truncate-end', children: [Text({ color: 'claude', children: ['→ '] }), Text({ bold: true, children: [step.text] }), step.costNote ? Text({ dimColor: true, children: [' (' + step.costNote + ')'] }) : ''] }),
          Text({ dimColor: true, wrap: 'truncate-end', children: ['  ' + step.why] }),
          stepButtons(Box, Button, $, step),
        ],
        foot: footer([['Enter', 'llenar el prompt'], ['Tab', 'elegir otra']]),
        width,
      }),
      gap(1),
    )
  }
  if (visibleDecisions(snap).length) out.push(decisionsBlock($, e, snap, width), gap(2))
  if (snap.plan) out.push(inProgressBlock($, e, snap, cols, width), gap(3))
  out.push(workingBlock($, e, snap, now, width, workingRows(e, snap)))
  if (snap.cards.length) out.push(gap(4), copyButtons($, e))
  return out
}

// ---- Ramas ---------------------------------------------------------------------------

function branchesBody($, e, snap, cols, width) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const live = snap.branches.filter((b) => !b.merged)
  const warn = pickColor(e.theme, 'warning', 'claude')
  if (snap.kind !== 'ok') return [block($, e, { key: 'blk-ramas', title: 'RAMAS', body: [Text({ children: [notActive(snap.kind)] })], width })]
  if (live.length === 0) return [block($, e, { key: 'blk-ramas', title: 'RAMAS', body: [Text({ dimColor: true, children: ['Sin ramas sin unir.'] })], width })]
  const colorOf = { [MARK.done]: 'success', [MARK.current]: warn, [MARK.todo]: 'inactive', [MARK.waiting]: warn }
  const inner = width - 4
  // Tabla: titulos de etapa y, por rama, una pista ●────●────◐────○ alineada debajo. Un caracter por celda.
  const nameW = Math.min(24, Math.max(8, ...live.map((b) => b.name.length)))
  const n = 6
  const W = Math.max(3, Math.min(11, Math.floor((inner - nameW - 4) / n)))
  const pad = (s, w) => (s.length > w ? s.slice(0, w) : s + ' '.repeat(w - s.length))
  const head = ['plan', 'ejecución', 'revisión', 'arreglos', 'suite', 'unión'].map((l) => pad(W >= 6 ? l : l.slice(0, W - 1), W)).join('')
  const body = [Text({ key: 'hd', dimColor: true, wrap: 'truncate-end', children: [pad('', nameW + 4) + head] })]
  const trackMark = { [MARK.done]: '●', [MARK.current]: '◐', [MARK.todo]: '○', [MARK.waiting]: '◆' }
  for (const b of live) {
    const st = stageLine(b)
    const segs = []
    st.forEach((s, i) => {
      segs.push(Text({ key: 'm' + i, color: colorOf[s.mark], bold: s.mark !== MARK.todo, dimColor: s.mark === MARK.todo, children: [trackMark[s.mark]] }))
      if (i < n - 1) {
        const doneLink = s.mark === MARK.done
        segs.push(Text({ key: 'l' + i, color: doneLink ? 'success' : undefined, dimColor: !doneLink, children: [(doneLink ? '━' : '─').repeat(W - 1)] }))
      }
    })
    const rev = String(b.review).toUpperCase()
    const suite = String(b.suite).toLowerCase()
    const facts = [
      b.commits ? plural(b.commits, 'commit', 'commits') : null,
      rev === 'NONE' ? null : 'revisión ' + rev,
      suite === 'none' ? null : 'suite ' + (suite === 'green' ? 'verde' : suite === 'red' ? 'roja' : suite),
      b.waiting ? 'espera tu decisión' : null,
    ].filter(Boolean).join(' · ')
    const key = 'row-br-' + b.name
    const sel = selected && selected.key === key
    body.push(
      Box({
        key: 'br-' + b.name,
        flexDirection: 'row',
        children: [
          Box({ width: nameW + 4, flexShrink: 0, children: [Button({ key, label: (sel ? '▸ ' : '') + b.name, plain: true, onPress: () => rowSelect($, { key, kind: 'branch', copy: b.name, hash: b.sha }) })] }),
          Text({ wrap: 'truncate-end', children: segs }),
        ],
      }),
      Text({ key: 'fx-' + b.name, dimColor: !b.waiting, color: b.waiting ? warn : undefined, wrap: 'truncate-end', children: [pad('', nameW + 4) + (facts || ' ')] }),
    )
  }
  body.push(Text({ key: 'lg', dimColor: true, wrap: 'truncate-end', children: ['● hecho  ◐ en curso  ◆ espera tu decisión  ○ falta'] }))
  return [
    block($, e, { key: 'blk-ramas', title: 'RAMAS', right: plural(live.length, 'sin unir', 'sin unir'), body, foot: footer([['Tab', 'elegir fila'], ['Enter', 'marcarla'], ['c', 'copiar la rama'], ['h', 'copiar su hash']]), width }),
    Text({ key: 'gap-b', children: [' '] }),
    copyButtons($, e),
  ]
}

// ---- Costo ---------------------------------------------------------------------------

async function costBody($, e, snap, cols, width) {
  const { Box, Text } = $.ui.resolve(e)
  const u = await $.session.usage()
  const list = sorted(reg)
  const now = await $.clock.now()
  const ctx = u.context || {}
  const inner = width - 4
  const body = [
    Text({ wrap: 'truncate-end', children: ['Costo de la sesión  ', Text({ bold: true, children: [usd(u.cost && u.cost.usd) + ' USD'] })] }),
    Text({ wrap: 'truncate-end', children: ['Contexto  ', Text({ bold: true, children: [(ctx.percent != null ? ctx.percent : '—') + ' %'] }), Text({ dimColor: true, children: ['  ' + (ctx.tokens ?? '—') + ' / ' + (ctx.window ?? '—') + ' tokens'] })] }),
    ...(u.rateLimits && u.rateLimits.length
      ? u.rateLimits.map((l) => Text({ key: 'rl-' + l.kind, wrap: 'truncate-end', children: ['Límite ' + l.kind + '  ' + l.percentUsed + ' %', Text({ dimColor: true, children: [l.resetsAt ? '  reinicia ' + l.resetsAt : ' '] })] }))
      : [Text({ dimColor: true, children: ['Sin límites de uso informados.'] })]),
    Text({ key: 'gap-c', children: [' '] }),
    Text({ dimColor: true, wrap: 'truncate-end', children: ['Por agente: minutos y tokens (la API no informa el costo por agente)'] }),
    ...list.slice(0, 20).map((r) =>
      Box({
        key: 'u-' + r.id,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          cell(Box, Text, 1, SYMBOL[r.status], { color: COLOR[r.status] }),
          cell(Box, Text, 20, r.type, { bold: true }),
          cell(Box, Text, Math.max(6, inner - 46), r.description, { dimColor: true }),
          cell(Box, Text, 9, minutes(elapsed(r, now)), {}),
          cell(Box, Text, 8, tokens(r.usage), {}),
        ],
      }),
    ),
  ]
  return [block($, e, { key: 'blk-costo', title: 'COSTO', right: list.length ? plural(list.length, 'agente', 'agentes') : '', body, width })]
}

// ---- UI (solo con pignolo-ui) --------------------------------------------------------

function slashes(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '')
}

// Raiz del proyecto: donde esta .pignolo/panel-state.json si lo hay; si no, el cwd. En demo, el arbol de muestra del plugin.
async function uiRoot($) {
  if (demoMode) return slashes($.plugin.root) + '/sample/ui'
  const file = (await findState($)) || (await findUp($, '/.pignolo/project.md'))
  return file ? file.replace(/\/\.pignolo\/(panel-state\.json|project\.md)$/, '') : slashes(await $.session.cwd())
}

// Lector de archivos para ui-input.js: funciones que cierran sobre `$.fs` (el motor no deja pasar `$` a otro archivo).
function uiReader($) {
  return {
    exists: (p) => $.fs.exists(p),
    list: (p) => $.fs.list(p),
    read: async (p) => String(await $.fs.read(p)),
  }
}

// Lo que hay de pignolo-ui en el proyecto, con cache corta. Nunca tira.
async function readUiNow($, now) {
  if (uiCache.value && now - uiCache.at < 1500) return uiCache.value
  const root = await uiRoot($)
  const { input } = await readUiInput(uiReader($), root)
  uiCache = { at: now, value: { root, input } }
  return uiCache.value
}

// ¿Esta pignolo-ui? (D-U5). Cada lectura va en try/catch dentro de detectUi.
async function refreshUiDetect($) {
  if (demoMode) {
    uiDetect = { installed: true, via: 'folder' }
    return
  }
  try {
    uiDetect = await detectUi({
      readSettings: () => $.settings.read(),
      listCommands: () => $.command.list(),
      hasFolder: async () => {
        const root = await uiRoot($)
        for (const name of ['.pignolo-ui', 'PRODUCT.md', 'DESIGN.md', 'design.md']) if (await $.fs.exists(root + '/' + name)) return true
        return false
      },
    })
  } catch {
    uiDetect = { installed: false, via: 'none' }
  }
}

// El UNICO lugar que consulta al modelo (por el recomendador). Se llama solo al abrir la pestaña UI, al volver a ella y con la
// tecla `r`: nunca desde un temporizador, un turno, un agente ni el dibujo. Nunca tira; si falla, la vista usa las reglas.
async function enterUiTab($, { retry = false } = {}) {
  if (!uiDetect.installed) return
  uiCache = { at: 0, value: null }
  let data = null
  try {
    data = await readUiNow($, await $.clock.now())
  } catch {
    return
  }
  if (!uiAsk || demoMode) {
    uiResult = null
    $.ui.invalidate('ui.render')
    return
  }
  if (uiPending) return
  uiPending = true
  $.ui.invalidate('ui.render')
  try {
    const io = { complete: (o) => $.model.complete(o), usage: () => $.session.usage() }
    const res = await recommender.get(io, data.input, { retry })
    uiResult = res
    if (retry && res.reused) $.ui.toast('Ya está al día: las entradas no cambiaron')
    else if (retry && res.reason === 'cap') $.ui.toast('Tope de consultas de la sesión')
  } catch {
    uiResult = null
  } finally {
    uiPending = false
    $.ui.invalidate('ui.render')
  }
}

// Abre el panel por una accion del usuario (comando o tecla 0): vuelve a mirar si esta pignolo-ui y, si la pestaña UI es la
// que quedó abierta, la consulta. (El abrir solo por una decision nueva NO pasa por acá: no consulta al modelo.)
async function openPaneByUser($) {
  wizard.open = false // el panel de siempre, no el asistente (que se abre con `/pignolo-panel wizard`)
  await refreshUiDetect($)
  const res = await openPane($)
  if (tab === 'ui' && uiDetect.installed) await enterUiTab($)
  return res
}

// <press-handler:ui> el UNICO sitio desde el que se llama a submitUiRequest: el boton de una recomendacion o de un atajo.
function uiButton($, { Button }, { key, letter, label, action, target, rec, max }) {
  return Button({
    key,
    hotkey: letter,
    // sin la letra: el motor dibuja "a: <label>". La recomendacion va a todo color y el atajo fijo atenuado (el boton no tiene negrita).
    label: label.length > max ? label.slice(0, max - 1) + '…' : label,
    plain: true,
    dimColor: !rec,
    onPress: async () => {
      if (uiSending) return // un pedido se envia una sola vez: el envio espera a la sesion y otra pulsacion no encola otro
      if (uiRequestText(action, target, '') === null) {
        $.ui.toast('Pedido inválido: no se envía')
        return
      }
      uiSending = true // antes de cualquier await
      $.ui.invalidate('ui.render')
      try {
        // Relee los archivos: una pantalla que ya no existe no se envia, y el contexto sale de las reglas sobre lo recien leido.
        uiCache = { at: 0, value: null }
        const fresh = await readUiNow($, await $.clock.now())
        if ((action === 'improve' || action === 'audit') && target && !knownScreen(fresh.input, target)) {
          $.ui.toast('La pantalla cambió: mirá la pestaña y elegí de nuevo')
          return
        }
        const ok = await submitUiRequest($, action, target, contextFor(action, target, fresh.input))
        if (!ok) {
          $.ui.toast('No pude enviar el pedido; escribilo en el prompt')
          return
        }
        $.ui.toast('Enviado: ' + label)
      } finally {
        uiSending = false
        $.ui.invalidate('ui.render')
      }
    },
  })
}
// </press-handler:ui>

async function uiBody($, e, width) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const { root, input } = await readUiNow($, await $.clock.now())
  const key = await hashInput(input)
  const canAsk = uiAsk && !demoMode
  const project = oneLine(root.split('/').filter(Boolean).pop() || 'proyecto').slice(0, 30)
  const m = tabModel({ project, input, key, result: uiResult, pending: uiPending, canAsk })
  const inner = width - 4
  const gap = (k) => Text({ key: 'ui-gap-' + k, children: [' '] })
  const body = [Text({ key: 'ui-h', bold: true, dimColor: true, children: [uiSending ? 'RECOMENDADO · enviando…' : 'RECOMENDADO'] })]
  if (m.rows.length === 0) body.push(Text({ key: 'ui-none', dimColor: true, wrap: 'truncate-end', children: ['  Todavía no hay nada para recomendar: usá un atajo.'] }), gap('n'))
  // titulo en el boton ("a: Mejorar ...": 3 celdas de letra) y, debajo, el porque tenue y sangrado para alinearlo con el titulo; hueco entre recomendaciones
  m.rows.forEach((r) => {
    body.push(
      uiButton($, ui, { key: 'ui-rec-' + r.letter, letter: r.letter, label: r.label, action: r.action, target: r.target, rec: true, max: inner - 3 }),
      Box({ key: 'ui-why-box-' + r.letter, paddingLeft: 3, children: [Text({ key: 'ui-why-' + r.letter, dimColor: true, wrap: 'wrap', children: [r.why] })] }),
      gap(r.letter),
    )
  })
  // atajos en columnas alineadas: cuatro por fila desde 72 de ancho interior, dos por fila si no; `r` queda en la primera columna
  const items = SHORTCUTS.map((s) => ({ w: s.label.length + 3, node: uiButton($, ui, { key: 'ui-sc-' + s.key, letter: s.key, label: s.label, action: s.action, target: '', rec: false, max: inner - 3 }) }))
  if (canAsk && m.mode === 'normal') items.push({ w: 'reconsultar'.length + 3, node: Button({ key: 'ui-retry', hotkey: 'r', label: 'reconsultar', plain: true, dimColor: true, onPress: () => enterUiTab($, { retry: true }) }) })
  const perRow = inner >= 72 ? 4 : 2
  const colW = Array.from({ length: perRow }, (_, c) => Math.max(...items.filter((_it, i) => i % perRow === c).map((it) => it.w), 0) + 5)
  body.push(Text({ key: 'ui-sc-h', bold: true, dimColor: true, children: ['ATAJOS'] }))
  for (let r = 0; r * perRow < items.length; r += 1) {
    body.push(Box({ key: 'ui-sc-row-' + r, flexDirection: 'row', children: items.slice(r * perRow, (r + 1) * perRow).map((it, c) => Box({ key: 'ui-sc-cell-' + r + '-' + c, width: colW[c], flexShrink: 0, children: [it.node] })) }))
  }
  return [block($, e, { key: 'blk-ui', title: m.title, right: m.right, body, foot: footer([['a–c, n, m, u, d', 'envía el pedido a Claude']]), width })]
}

// ---- asistente de inicio (etapa 3) ---------------------------------------------------------------------------------------
// El panel no escribe nada: lee el resumen que deja pignolo en `.git/pignolo/wizard-detect.json` y, al aplicar, envia UN mensaje con
// las elecciones (por `submitText`, el mismo `prompt.submit` de siempre). Quien escribe es `/pignolo:init`, con sus controles.

const WIZARD_FILE = '/.git/pignolo/wizard-detect.json'

// Raiz del proyecto: el primer directorio (desde el cwd hacia arriba) que tiene el archivo de deteccion. Nunca tira.
async function findWizardRoot($) {
  let dir = String(await $.session.cwd()).replace(/\\/g, '/').replace(/\/+$/, '')
  for (let i = 0; i < 12 && dir; i += 1) {
    if (await $.fs.exists(dir + WIZARD_FILE)) return dir
    const up = dir.replace(/\/[^/]*$/, '')
    if (up === dir || up === '') break
    dir = up
  }
  return null
}

// { root, data } o null ante cualquier fallo (sin archivo, JSON roto, otra schema, sin id) o si el proyecto ya tiene pignolo: sin error a la vista.
async function readWizard($) {
  try {
    const root = await findWizardRoot($)
    if (!root) return null
    if (await $.fs.exists(root + '/.pignolo/project.md')) return null
    const r = readWizardDetect(String(await $.fs.read(root + WIZARD_FILE)))
    return r.ok ? { root, data: r.data } : null
  } catch {
    return null
  }
}

function startWizard(data, { uiInstalled, demo = false }) {
  const steps = stepsFor({ data, uiInstalled })
  Object.assign(wizard, { open: true, data, steps, state: initialState(steps, data), uiInstalled, demo, sending: false, sent: false })
}

// Abre solo, una vez por sesion y solo si el hook de arranque dijo `offer` (la primera vez en este proyecto). Cede ante una decision "Te toca"
// abierta, ante autoOpen apagado, el modo demo y una terminal angosta (el panel mismo se niega a abrirse solo en menos de 144 columnas).
async function checkWizard($) {
  if (demoMode || !autoOpen || wizardOpened || wizard.open || wizardTicks >= WIZARD_TICKS) return
  wizardTicks += 1
  if (lastCols < OPEN_FIRST_COLS) return
  const snap = await readSnapshot($, await $.clock.now())
  if (snap.kind === 'ok' && visibleDecisions(snap).length > 0) return
  const found = await readWizard($)
  if (!found || found.data.offer !== true) return
  startWizard(found.data, { uiInstalled: uiDetect.installed })
  const res = await openPane($)
  if (res && res.isPlaced === false) {
    wizard.open = false // el motor lo dejo esperando: se vuelve a intentar en el proximo ciclo
    return
  }
  wizardOpened = true
  $.ui.invalidate('ui.render')
}

// `/pignolo-panel wizard [demo]`: lo abre a mano, sin importar `offer`. Devuelve lo que se muestra en la transcripcion.
async function openWizardByUser($, demo) {
  let found = null
  if (demo) {
    const r = readWizardDetect(String(await $.fs.read($.plugin.root + '/sample/wizard-detect.json')).trim())
    found = r.ok ? { data: r.data } : null
    if (!found) return { text: 'pignolo-panel: no pude leer los datos de muestra del asistente.' }
  } else {
    found = await readWizard($)
    if (!found) return { text: 'pignolo-panel: no hay detección de este proyecto; corré /pignolo:init.' }
  }
  if (lastCols && lastCols < WIZARD_WIDTH + 2) return { text: 'pignolo-panel: el asistente necesita ' + (WIZARD_WIDTH + 2) + ' columnas y esta terminal tiene ' + lastCols + ' (faltan ' + (WIZARD_WIDTH + 2 - lastCols) + ').' }
  const same = wizard.data && wizard.data.id === found.data.id && !wizard.sent && !wizard.demo && !demo
  if (same) wizard.open = true
  else startWizard(found.data, { uiInstalled: demo ? true : uiDetect.installed, demo })
  await openPane($)
  wizardOpened = true
  $.ui.invalidate('ui.render')
  return {}
}

// Cierra el asistente: el panel vuelve a ser el de siempre (el mod no suma ninguna llamada para cerrar el panel; Esc lo cierra).
function closeWizard($, why) {
  wizard.open = false
  if (why === 'later') $.ui.toast('Cuando haya código, corré /pignolo:init · Esc cierra el panel')
  $.ui.invalidate('ui.render')
}

// Aplicar: UN solo mensaje con las elecciones. Una vez aunque se pulse dos veces (`sending` se marca antes de cualquier await), releyendo
// antes (si la deteccion cambio no se envia lo que se dibujo) y por `submitText` (una linea, sin invisibles). En el demo solo llena el prompt.
async function submitWizard($) {
  if (wizard.sending || wizard.sent) return
  wizard.sending = true
  $.ui.invalidate('ui.render')
  const retry = () => { wizard.state = { ...wizard.state, done: false } }
  try {
    const cur = wizard.demo ? { data: wizard.data } : await readWizard($)
    if (!cur || cur.data.id !== wizard.data.id) {
      $.ui.toast('La detección cambió: mirá el asistente de nuevo')
      if (cur) startWizard(cur.data, { uiInstalled: wizard.uiInstalled })
      else retry()
      return
    }
    const msg = choicesMessage(choicesOf(wizard.state, wizard.data, { uiInstalled: wizard.uiInstalled }))
    if (msg === null) {
      $.ui.toast('Elecciones inválidas: no se envía')
      retry()
      return
    }
    if (wizard.demo) {
      await fillPrompt($, msg)
      retry()
      return
    }
    const ok = await submitText($, msg)
    if (!ok) {
      $.ui.toast('No pude enviar; corré /pignolo:init')
      retry()
      return
    }
    wizard.sent = true
    closeWizard($)
    $.ui.toast('Enviado: init te muestra la vista previa y te pide el sí')
  } finally {
    wizard.sending = false
    $.ui.invalidate('ui.render')
  }
}

// "No usar pignolo aca" (RW-02): UN mensaje fijo por `submitText` (el mismo guardian de una sola vez que submitWizard). Lo unico que `init`
// escribe al recibirlo es la marca de rechazo bajo `.git/pignolo/`. En el demo solo llena el prompt.
async function declineWizard($) {
  if (wizard.sending || wizard.sent) return
  wizard.sending = true
  $.ui.invalidate('ui.render')
  const retry = () => { wizard.state = { ...wizard.state, closed: null } }
  try {
    if (wizard.demo) {
      await fillPrompt($, DECLINE_MESSAGE)
      retry()
      return
    }
    const ok = await submitText($, DECLINE_MESSAGE)
    if (!ok) {
      $.ui.toast('No pude enviar; corré /pignolo:init')
      retry()
      return
    }
    wizard.sent = true
    closeWizard($)
    $.ui.toast('Enviado: no te lo vuelvo a ofrecer acá · /pignolo:init sigue disponible')
  } finally {
    wizard.sending = false
    $.ui.invalidate('ui.render')
  }
}

// <press-handler:wizard> el UNICO sitio desde el que se llama a submitWizard: los botones del asistente (seguir en el ultimo paso, o crear en el
// de un repo en blanco). Ni un evento, ni un temporizador, ni el refresco.
async function wizardPress($, what, arg) {
  if (!wizard.open || wizard.sending || wizard.sent) return
  wizard.state = move(wizard.state, what, arg, wizard.data)
  if (wizard.state.closed === 'decline') {
    await declineWizard($)
    return
  }
  if (wizard.state.closed) {
    closeWizard($, wizard.state.closed)
    return
  }
  if (wizard.state.done) {
    await submitWizard($)
    return
  }
  $.ui.invalidate('ui.render')
}
// </press-handler:wizard>

function wizardBody($, e) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = (e.props && e.props.bodyColumns) || 80
  if (e.viewport && e.viewport.columns) lastCols = e.viewport.columns
  if (cols < WIZARD_WIDTH) {
    return Text({ key: 'wz-narrow', wrap: 'wrap', children: ['El asistente necesita ' + WIZARD_WIDTH + ' columnas y este panel tiene ' + cols + ' (faltan ' + (WIZARD_WIDTH - cols) + '): ensanchá la terminal o cerrá otros paneles.'] })
  }
  const step = wizard.state.steps[wizard.state.i]
  const view = stepView({ step, state: wizard.state, data: wizard.data, uiInstalled: wizard.uiInstalled, busy: wizard.sending })
  return wizardTree({ Box, Text, Button }, view, {
    color: 'claude',
    pick: (letter) => wizardPress($, 'pick', letter),
    next: () => wizardPress($, 'next'),
    back: () => wizardPress($, 'back'),
  })
}

async function paneTree($, e, next) {
  if (e.requestId !== PANE) return next(e)
  if (wizard.open) return wizardBody($, e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = (e.props && e.props.bodyColumns) || 80
  if (e.viewport && e.viewport.columns) lastCols = e.viewport.columns
  // mismo ancho para todos los bloques, sin pegarse al borde
  const width = Math.max(40, cols - 2)
  const now = await $.clock.now()
  const snap = await readSnapshot($, now)
  const redraw = () => $.ui.invalidate('ui.render')

  if (tab === 'ui' && !uiDetect.installed) tab = 'now'
  const TABS = uiDetect.installed ? [...TABS_BASE, UI_TAB] : TABS_BASE
  const tabs = Box({
    key: 'tabs',
    flexDirection: 'row',
    columnGap: 3,
    children: TABS.map(([id, key, label]) =>
      Button({ key: 'tab-' + id, label, hotkey: key, plain: true, dimColor: tab !== id, onPress: () => { tab = id; redraw(); if (id === 'ui') enterUiTab($) } }),
    ),
  })

  let body
  if (tab === 'now') body = nowBody($, e, snap, now, cols, width)
  else if (tab === 'branches') body = branchesBody($, e, snap, cols, width)
  else if (tab === 'ui') body = await uiBody($, e, width)
  else body = await costBody($, e, snap, cols, width)

  const demo = snap.demo ? [Text({ color: pickColor(e.theme, 'warning', 'claude'), children: ['MODO DEMO · datos de muestra (/pignolo-panel demo off para salir)'] })] : []
  return Box({
    flexDirection: 'column',
    children: [tabs, ...demo, Text({ key: 'g0', children: [' '] }), ...body],
  })
}

// ---- registro de hooks ---------------------------------------------------------

export function register(on, options) {
  if (options && options.demo === true) demoMode = 'idle'
  autoOpen = !(options && options.autoOpen === false)
  uiAsk = !(options && options.uiRecommendations === false)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pignolo-panel',
      description: 'Abre el panel: siguiente paso, decisiones tuyas, ramas y costo (demo: datos de muestra)',
      immediate: true,
    })
    const res = await next(e)
    await refreshUiDetect($)
    try {
      await checkNewDecisions($) // la primera lectura marca lo que ya existe como anunciado, sin abrir
    } catch {
      // sin registro: nada que anunciar
    }
    try {
      await checkWizard($) // el asistente de inicio: solo si el hook de arranque lo ofrecio (una vez por proyecto)
    } catch {
      // sin deteccion: nada que ofrecer
    }
    await syncSuggest($)
    if (!timer) {
      // refresco liviano: lee un solo archivo; detecta decisiones nuevas y abre el panel si corresponde
      timer = $.clock.every(POLL_MS, async () => {
        cache = { at: 0, value: null }
        try {
          await checkNewDecisions($)
        } catch {
          // sin registro
        }
        try {
          await checkWizard($)
        } catch {
          // sin deteccion
        }
        $.ui.invalidate('ui.render')
      })
    }
    return res
  })

  on('command.run', { command: 'pignolo-panel' }, async ($, e) => {
    const arg = String(e.args || '').trim().toLowerCase()
    if (arg === 'wizard' || arg.startsWith('wizard ')) return openWizardByUser($, arg.slice(6).trim() === 'demo')
    if (arg.startsWith('demo')) {
      const rest = arg.slice(4).trim()
      demoMode = rest === 'off' ? null : rest === 'busy' ? 'busy' : 'idle'
      cache = { at: 0, value: null }
      uiCache = { at: 0, value: null }
      uiResult = null
      prevCards = new Map()
      await refreshUiDetect($)
      $.ui.invalidate('ui.render')
      if (demoMode) await openPane($)
      await syncSuggest($)
      return { text: demoMode ? 'pignolo-panel: modo demo (' + demoMode + '). /pignolo-panel demo off para salir.' : 'pignolo-panel: modo demo apagado.' }
    }
    await openPaneByUser($)
    return {}
  })

  // Si el motor propone su propio texto y hay un siguiente paso claro, gana el del registro.
  on('prompt.suggest', async ($, e, next) => {
    if (e.origin && e.origin.kind === 'suggestion') {
      try {
        const step = stepOf(await readSnapshot($, await $.clock.now()))
        if (step) return next({ ...e, text: suggestionText(step) })
      } catch {
        // sin datos: deja pasar la del motor
      }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    busyTurns.add(e.turnId)
    return next(e)
  })

  // Un subagente arranca (en primer o segundo plano): lo anotamos y dejamos pasar.
  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    if (res && res.agentId) {
      addAgent(reg, {
        id: res.agentId,
        toolUseId: e.tool_use_id,
        type: e.subagentType,
        description: e.description,
        model: res.model || e.model,
        background: e.background,
        parentId: e.parentAgentId,
        startedAt: await $.clock.now(),
      })
      $.ui.invalidate('ui.render')
    }
    return res
  })

  // Tokens de cada pedido de un subagente (y la actividad del minigrafico)
  on('turn.step', async function* ($, e, next) {
    const rec = e.agentId ? reg.byId.get(e.agentId) : undefined
    if (rec) reopen(rec, await $.clock.now())
    const result = yield* next(e)
    if (rec && result && result.usage) {
      addUsage(rec, result.usage)
      activity = [...activity, Number(result.usage.output_tokens || 0) + Number(result.usage.input_tokens || 0)].slice(-SPARK_N)
    }
    if (rec && result) noteStep(rec, result, await $.clock.now()) // que hizo y cuando: solo se dibuja
    return result
  })

  // Fin del turno o del agente (sirve para primer y segundo plano)
  on('turn.complete', async ($, e, next) => {
    busyTurns.delete(e.turnId)
    const rec = e.agentId ? reg.byId.get(e.agentId) : undefined
    if (rec) {
      const failed = e.reason !== 'answer'
      finish(rec, await $.clock.now(), failed)
      $.ui.toast((failed ? '✗ ' : '✓ ') + rec.type + (failed ? ' terminó con error' : ' terminó') + (rec.description ? ': ' + rec.description : ''))
    }
    cache = { at: 0, value: cache.value }
    $.ui.invalidate('ui.render')
    const res = await next(e)
    if (!e.agentId) await syncSuggest($)
    return res
  })

  // Respaldo: el evento clasico de fin de subagente, si turn.complete no llego
  on('classic.SubagentStop', async ($, e, next) => {
    const rec = reg.byId.get(e.agent_id)
    if (rec && rec.status === 'running') {
      finish(rec, await $.clock.now(), false)
      $.ui.toast('✓ ' + rec.type + ' terminó')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Un panel que se cierra (Esc, la persona o la descarga del mod): si era el asistente, ya no esta abierto.
  on('ui.close', async ($, e, next) => {
    if (e && e.id === PANE) wizard.open = false
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, bandTree)
  on('ui.render', { component: 'Pane' }, paneTree)
}
