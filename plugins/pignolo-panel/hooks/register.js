// pignolo-panel: solo lee y dibuja. Lee UN archivo (.pignolo/panel-state.json, que escribe pignolo) y lo muestra.
// Efectos permitidos: llenar o sugerir texto en el prompt (nunca lo envia), copiar al portapapeles (`ui.copy`) y UN solo
// envio: la respuesta de una decision de "Te toca", desde el boton de una opcion (`submitAnswer`). No aprueba ni niega nada.
import {
  SYMBOL, COLOR, shortModel, minutes, tokens, usd, plural,
  newRegistry, addAgent, addUsage, finish, reopen, running, elapsed, sorted,
  parseJson,
} from './model.js'
import {
  readState, suggestionText, answerPrefix, answerText, answerInvalid, pickColor, progress, bar, stageLine, sparkText, sparkCells, MARK,
} from './state.js'

const PANE = 'pignolo-panel'
const TABS = [['now', '1', 'Ahora'], ['branches', '2', 'Ramas'], ['cost', '3', 'Costo']]
const SPARK_N = 24
const POLL_MS = 3000
// Ancho minimo del terminal para abrir el panel solo (D-P5): 144 la primera vez, 110 despues.
const OPEN_FIRST_COLS = 144
const OPEN_NEXT_COLS = 110
// Letras de las respuestas (una por opcion en todo el panel). Se saltan las de acciones: c copiar, h hash, p pros y contras, z despues.
const LETTERS = 'abdefgijklmnoqrstuvwxy'.split('')

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

// ---- lectura (unico archivo: .pignolo/panel-state.json) ----

async function findState($) {
  let dir = String(await $.session.cwd()).replace(/\\/g, '/').replace(/\/+$/, '')
  for (let i = 0; i < 12 && dir; i += 1) {
    if (await $.fs.exists(dir + '/.pignolo/panel-state.json')) return dir + '/.pignolo/panel-state.json'
    const up = dir.replace(/\/[^/]*$/, '')
    if (up === dir || up === '') break
    dir = up
  }
  return null
}

function emptySnap(kind) {
  return { kind, demo: false, plan: null, decisions: [], branches: [], cards: [], main: null, next: { none: 'nothing' }, agents: [], activity: [] }
}

async function realSnapshot($) {
  const file = await findState($)
  if (!file) return emptySnap('none')
  const { kind, snap } = readState(parseJson(String(await $.fs.read(file))))
  return { ...snap, kind, demo: false }
}

async function demoSnapshot($) {
  const { snap } = readState(parseJson(String(await $.fs.read($.plugin.root + '/sample/panel-state.json'))))
  return { ...snap, kind: 'ok', demo: true, agents: snap.agents.map((a, i) => ({ ...a, status: demoMode === 'busy' && i === 0 ? 'running' : 'done' })) }
}

// Estado completo, con cache corta. Avisa (toast) cuando una tarjeta pasa a hecha.
async function readSnapshot($, now) {
  if (cache.value && now - cache.at < 1500) return cache.value
  let value = emptySnap('none')
  try {
    value = demoMode ? await demoSnapshot($) : await realSnapshot($)
  } catch {
    value = emptySnap('none')
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

function allAgents(snap, now) {
  const mine = sorted(reg).map((r) => ({ type: r.type, description: r.description, model: shortModel(r.model), min: minutes(elapsed(r, now)), tok: tokens(r.usage), status: r.status }))
  const extra = snap.agents.map((a) => ({ type: a.type, description: a.description, model: shortModel(a.model), min: a.minutes.toFixed(1) + ' min', tok: tokens({ input: a.tokens }), status: a.status }))
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
  return kind === 'newer' ? 'pignolo-panel: el registro es de una versión más nueva; actualizá el panel (/plugin update)' : 'pignolo no está activo en este proyecto'
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
  const steps = stepOf(snap)
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
  const open = Button({ key: 'band-open', hotkey: '0', plain: true, dimColor: true, label: 'panel', onPress: () => openPane($) })
  const lines = [Box({ flexDirection: 'row', columnGap: 2, children: [Text({ wrap: 'truncate-end', children: parts }), open] })]
  if (steps) {
    lines.push(
      Text({
        wrap: 'truncate-end',
        children: [Text({ color: 'claude', children: ['→ '] }), 'siguiente: ', Text({ bold: true, children: [steps.text] }), steps.costNote ? Text({ dimColor: true, children: [' (' + steps.costNote + ')'] }) : ''],
      }),
    )
  }
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
  const text = answerText(decision, option)
  try {
    const res = await $.prompt.submit({ text, asUser: true })
    return Boolean(res) && res.drop === undefined
  } catch {
    return false
  }
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
    label: letter + '  ' + o.label + (rec ? '  · recomendada' : ''),
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
    label: letter + '  Otra…',
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
    Button({ key: 'toggle-pros', hotkey: 'p', label: 'p  ' + (unfolded ? 'ocultar' : 'ver') + ' pros y contras', plain: true, dimColor: true, onPress: () => { unfolded = !unfolded; $.ui.invalidate('ui.render') } }),
    Button({ key: 'postpone', hotkey: 'z', label: 'z  dejar la 1 para después', plain: true, dimColor: true, onPress: () => { postponeFirst($) } }),
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
      Button({ key: 'copy', hotkey: 'c', label: 'c  copiar la fila elegida', plain: true, dimColor: true, onPress: (press) => copySelected($, press, 'main') }),
      Button({ key: 'copy-hash', hotkey: 'h', label: 'h  copiar su hash', plain: true, dimColor: true, onPress: (press) => copySelected($, press, 'hash') }),
    ],
  })
}

// ---- Ahora ---------------------------------------------------------------------------

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

function workingBlock($, e, snap, now, width) {
  const { Box, Text } = $.ui.resolve(e)
  const warn = pickColor(e.theme, 'warning', 'claude')
  const agents = allAgents(snap, now).filter((a) => a.status === 'running')
  const samples = snap.demo ? snap.activity : activity
  const body = []
  if (agents.length === 0) body.push(Text({ dimColor: true, children: ['○ nada corriendo'] }))
  else {
    body.push(Text({ wrap: 'truncate-end', children: [Text({ color: warn, children: ['● '] }), plural(agents.length, 'agente', 'agentes') + '  ', Text({ dimColor: true, children: [agents.map((a) => a.type).join(', ')] })] }))
    if (samples.length) {
      body.push(
        e.surface === 'terminal'
          ? Raster$(Box, $, e, samples)
          : Text({ color: warn, children: [sparkText(samples, SPARK_N)] }),
      )
    }
  }
  return block($, e, { key: 'blk-trabajando', title: 'TRABAJANDO', right: agents.length ? plural(agents.length, 'agente', 'agentes') : '', body, width })
}

function Raster$(Box, $, e, samples) {
  const { Raster } = $.ui.resolve(e)
  return Raster({ key: 'activity', columns: SPARK_N, rows: 2, cells: sparkCells(samples, SPARK_N, 0xe0a030) })
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
  out.push(workingBlock($, e, snap, now, width))
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

async function paneTree($, e, next) {
  if (e.requestId !== PANE) return next(e)
  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = (e.props && e.props.bodyColumns) || 80
  if (e.viewport && e.viewport.columns) lastCols = e.viewport.columns
  // mismo ancho para todos los bloques, sin pegarse al borde
  const width = Math.max(40, cols - 2)
  const now = await $.clock.now()
  const snap = await readSnapshot($, now)
  const redraw = () => $.ui.invalidate('ui.render')

  const tabs = Box({
    key: 'tabs',
    flexDirection: 'row',
    columnGap: 3,
    children: TABS.map(([id, key, label]) =>
      Button({ key: 'tab-' + id, label, hotkey: key, plain: true, dimColor: tab !== id, onPress: () => { tab = id; redraw() } }),
    ),
  })

  let body
  if (tab === 'now') body = nowBody($, e, snap, now, cols, width)
  else if (tab === 'branches') body = branchesBody($, e, snap, cols, width)
  else body = await costBody($, e, snap, cols, width)

  const demo = snap.demo ? [Text({ color: pickColor(e.theme, 'warning', 'claude'), children: ['MODO DEMO · datos de muestra (/pignolo-panel demo off para salir)'] })] : []
  return Box({
    flexDirection: 'column',
    children: [tabs, ...demo, Text({ key: 'g0', children: [' '] }), ...body, Text({ key: 'g9', children: [' '] }), Text({ dimColor: true, wrap: 'truncate-end', children: [footer([['Esc', 'cerrar'], ['1', 'ahora'], ['2', 'ramas'], ['3', 'costo']])] })],
  })
}

// ---- registro de hooks ---------------------------------------------------------

export function register(on, options) {
  if (options && options.demo === true) demoMode = 'idle'
  autoOpen = !(options && options.autoOpen === false)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pignolo-panel',
      description: 'Abre el panel: siguiente paso, decisiones tuyas, ramas y costo (demo: datos de muestra)',
      immediate: true,
    })
    const res = await next(e)
    try {
      await checkNewDecisions($) // la primera lectura marca lo que ya existe como anunciado, sin abrir
    } catch {
      // sin registro: nada que anunciar
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
        $.ui.invalidate('ui.render')
      })
    }
    return res
  })

  on('command.run', { command: 'pignolo-panel' }, async ($, e) => {
    const arg = String(e.args || '').trim().toLowerCase()
    if (arg.startsWith('demo')) {
      const rest = arg.slice(4).trim()
      demoMode = rest === 'off' ? null : rest === 'busy' ? 'busy' : 'idle'
      cache = { at: 0, value: null }
      prevCards = new Map()
      $.ui.invalidate('ui.render')
      if (demoMode) await openPane($)
      await syncSuggest($)
      return { text: demoMode ? 'pignolo-panel: modo demo (' + demoMode + '). /pignolo-panel demo off para salir.' : 'pignolo-panel: modo demo apagado.' }
    }
    await openPane($)
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
        startedAt: await $.clock.now(),
      })
      $.ui.invalidate('ui.render')
    }
    return res
  })

  // Tokens de cada pedido de un subagente (y la actividad del minigrafico)
  on('turn.step', async function* ($, e, next) {
    const rec = e.agentId ? reg.byId.get(e.agentId) : undefined
    if (rec) reopen(rec)
    const result = yield* next(e)
    if (rec && result && result.usage) {
      addUsage(rec, result.usage)
      activity = [...activity, Number(result.usage.output_tokens || 0) + Number(result.usage.input_tokens || 0)].slice(-SPARK_N)
    }
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

  on('ui.render', { component: 'AbovePrompt' }, bandTree)
  on('ui.render', { component: 'Pane' }, paneTree)
}
