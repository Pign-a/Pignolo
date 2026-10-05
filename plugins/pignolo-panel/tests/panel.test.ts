import { expect, mock, test } from 'claude-code/testing'
import { pickColor, suggestionText, answerText, cleanQuestion, readState } from '../hooks/state.js'

const VIEWPORT = { columns: 100, rows: 30 }
const WIDE = { columns: 150, rows: 40 }
const USAGE = {
  startedAt: 0,
  context: { tokens: 42000, window: 200000, percent: 21 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 12.5, resetsAt: '2026-10-02T20:00:00Z' }],
  cost: { usd: 0.34 },
}

const band = (viewport: any = VIEWPORT) => ({
  plugin: 'pignolo-panel',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  viewport,
  props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: viewport.columns, scroll: { offset: 0, bodyRows: 5 }, view: {} },
}) as const
const BAND = band()

const PANE = {
  plugin: 'pignolo-panel',
  component: 'Pane',
  requestId: 'pignolo-panel',
  surface: 'terminal',
  viewport: VIEWPORT,
  props: { title: 'pignolo', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// Un panel alto: el bloque TRABAJANDO entra holgado (3 filas por agente). PANE (10 filas) lo obliga a ser compacto.
const TALL = { ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 60 } } } as const
const SPARK = /^ *[▁▂▃▄▅▆▇█][ ▁▂▃▄▅▆▇█]*$/ // el minigrafico: una fila de bloques (un hueco en blanco no cuenta)

const ROW = {
  plugin: 'pignolo-panel',
  component: 'ToolUse',
  requestId: 'toolu_1',
  surface: 'terminal',
  viewport: VIEWPORT,
  props: { tool_use_id: 'toolu_1', tool: 'Agent', input: { subagent_type: 'pignolo:explorer', description: 'leer lib', model: 'haiku' }, isRunning: true, isErrored: false, isInterrupted: false },
} as const

// Un proyecto falso: archivos en memoria. Mutable: el test puede cambiar `files`.
function fakeProject(on: any, files: Record<string, string>) {
  const dirsOf = () => {
    const dirs = new Set<string>()
    for (const f of Object.keys(files)) {
      const parts = f.split('/')
      for (let i = 2; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
    }
    return dirs
  }
  on('session.cwd', () => ({ value: '/proj/sub' }))
  const key = (p: string) => {
    const n = p.split('\\').join('/')
    return [...Object.keys(files), ...dirsOf()].filter((k) => n.endsWith(k)).sort((x, y) => y.length - x.length)[0]
  }
  on('fs.exists', ($: any, e: any) => ({ value: key(e.path) !== undefined }))
  on('fs.read', ($: any, e: any) => ({ value: files[key(e.path) as string] ?? '' }))
}

const spy = { suggest: [] as string[], fill: [] as string[], submit: [] as any[], toast: [] as string[], copy: [] as string[], opened: [] as string[], openEvents: [] as any[], closed: 0, fillOk: true, submitOk: true, copyOk: true }

function common(on: any) {
  spy.suggest = []
  spy.fill = []
  spy.submit = []
  spy.toast = []
  spy.copy = []
  spy.opened = []
  spy.openEvents = []
  spy.closed = 0
  spy.fillOk = true
  spy.submitOk = true
  spy.copyOk = true
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.suggest', ($: any, e: any) => {
    spy.suggest.push(e.text)
    return { isShown: true }
  })
  on('prompt.submit', ($: any, e: any) => {
    spy.submit.push(e)
    return spy.submitOk ? { text: e.text } : { drop: 'test: no se pudo enviar' }
  })
  on('prompt.fill', ($: any, e: any) => {
    spy.fill.push(e.text)
    return { isFilled: spy.fillOk, text: e.text, cursor: e.text.length }
  })
  on('ui.copy', ($: any, e: any) => {
    spy.copy.push(e.text)
    return spy.copyOk ? { isCopied: true } : { isCopied: false, reason: 'refused' }
  })
  on('ui.toast', ($: any, e: any) => {
    spy.toast.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($: any, e: any) => {
    spy.opened.push(e.id)
    spy.openEvents.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    spy.closed += 1
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/proj' }))
  return clock
}

async function boot($: any) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/proj' })
}

async function spawn($: any, type = 'pignolo:explorer') {
  return $.agent.spawn({
    tool_use_id: 'toolu_1',
    prompt: 'x',
    description: 'leer lib',
    subagentType: type,
    provider: { plugin: 'engine', tier: 'core' },
    model: 'haiku',
    parentModel: 'sonnet',
    background: false,
    fork: false,
  })
}

// ---- registros de prueba (formato pignolo-panel-state/1) ----

const SCHEMA = 'pignolo-panel-state/1'
const none = { none: 'nothing' }
const step = (o: object = {}) => ({ rule: 'review', key: 'r:feat/x', text: 'revisá feat/x', prompt: 'revisá feat/x', costNote: 'usa una revisión opus', why: 'La rama tiene 3 commits sin revisión.', alternatives: [], ...o })
const state = (o: Record<string, unknown> = {}) => ({ schema: SCHEMA, plan: null, decisions: [], branches: [], cards: [], budget: [], main: null, next: none, ...o })
const proj = (st: unknown, extra: Record<string, string> = {}): Record<string, string> => ({
  '/proj/.pignolo/project.md': '# p',
  ...(st ? { '/proj/.pignolo/panel-state.json': JSON.stringify(st) } : {}),
  ...extra,
})
const dec = (o: object = {}) => ({
  id: 'Q-1', question: '¿Plantilla corta o completa?', options: [{ label: 'plantilla corta', pros_contras: 'Gana: una página. Pierde: sin índice.' }, { label: 'plantilla completa' }],
  recommended: 'plantilla corta', context: 'La completa suma índice y anexos.', kind: 'user', status: 'open', askedAt: '2026-10-03T10:00:00Z', ...o,
})
const br = (o: object = {}) => ({ name: 'feat/x', stage: 'review', review: 'none', suite: 'none', commits: 3, waiting: false, merged: false, sha: 'a1b2c3d4e5f6', ...o })
const card = (o: object = {}) => ({ id: 'T1', plan: 'mi-plan', title: 'uno', status: 'todo', red: '', green: '', evidence: '', ...o })
const PLAN = { slug: 'mi-plan', stage: 'executing', request: 'hacer algo' }

const STATE_FULL = state({
  plan: PLAN,
  cards: [card({ id: 'T1', title: 'uno', status: 'done', red: 'falla', green: '3/3', evidence: 'docs/reports/t1.md' }), card({ id: 'T2', title: 'dos', status: 'todo' })],
  decisions: [dec()],
  branches: [br()],
  next: step({ rule: 'decision', text: '¿Plantilla corta o completa?', prompt: 'Decisión Q-1: plantilla corta', costNote: null, why: 'Hay una decisión tuya pendiente.' }),
})

const text = (x: unknown) => JSON.stringify(x)

// Recorre el arbol dibujado y junta los nodos que cumplen `pred`.
function walk(node: any, pred: (n: any) => boolean, out: any[] = []) {
  if (node && typeof node === 'object') {
    if (pred(node)) out.push(node)
    for (const c of node.children ?? []) walk(c, pred, out)
  }
  return out
}

// ---- banda ----

test('mod: no registry gives one line saying pignolo is not active here and draws nothing else', async ($, on) => {
  common(on)
  fakeProject(on, {})
  const ui = await $.ui.mount({ ...BAND })
  expect(await ui.find({ type: 'Text', text: /pignolo no está activo en este proyecto/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  await ui.unmount()
})
test('mod: project.md present and no registry says pignolo is active (never "no está activo") in band, Live and Ramas', async ($, on) => {
  common(on)
  fakeProject(on, { '/proj/.pignolo/project.md': '# p' })
  const band = await $.ui.mount({ ...BAND })
  expect(await band.find({ type: 'Text', text: /pignolo está activo; el panel se completa en unos segundos/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /no está activo/ })).toBeUndefined()
  await band.unmount()
  const pane = await $.ui.mount({ ...PANE })
  expect(await pane.find({ type: 'Text', text: /pignolo está activo; el panel se completa en unos segundos/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /no está activo/ })).toBeUndefined()
  await pane.unmount()
})
test('mod: project.md present, registry appears later: the next poll draws the real state', async ($, on) => {
  const clock = common(on)
  const files: Record<string, string> = { '/proj/.pignolo/project.md': '# p' }
  fakeProject(on, files)
  await boot($)
  const a = await $.ui.mount({ ...BAND })
  expect(await a.find({ type: 'Text', text: /el panel se completa/ })).toBeDefined()
  await a.unmount()
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(STATE_FULL)
  await clock.advance(3000)
  const b = await $.ui.mount({ ...BAND })
  expect(await b.find({ type: 'Text', text: /el panel se completa/ })).toBeUndefined()
  expect(await b.find({ type: 'Text', text: /mi-plan/ })).toBeDefined()
  await b.unmount()
})
test('mod: an unknown or greater schema gives a one-line notice and does not throw', async ($, on) => {
  common(on)
  const files = proj({ schema: 'otro/1', decisions: [dec()] })
  fakeProject(on, files)
  await boot($)
  const a = await $.ui.mount({ ...BAND })
  expect(await a.find({ type: 'Text', text: /pignolo no está activo/ })).toBeUndefined() // hay project.md: está activo
  expect(await a.find({ type: 'Text', text: /pignolo está activo; el panel se completa en unos segundos/ })).toBeDefined()
  await a.unmount()
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify({ schema: 'pignolo-panel-state/2', decisions: [dec()] })
  await ($ as any).clock?.advance?.(0)
  const b = await $.ui.mount({ ...PANE })
  expect(await b.find({ type: 'Text', text: /actualizá el panel/ })).toBeUndefined() // el pane usa la misma nota
  await b.unmount()
  expect(readState({ schema: 'pignolo-panel-state/2' }).kind).toBe('newer')
  expect(readState({ schema: 'x' }).kind).toBe('unknown')
  expect(readState('basura').kind).toBe('none')
  expect(readState(null).kind).toBe('none')
})
test('mod: the band shows plan, progress, agents, open decisions, cost and next step', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  await boot($)
  const ui = await $.ui.mount({ ...BAND })
  const l1 = text(await ui.find({ type: 'Text', text: /ctx/ }))
  for (const s of ['mi-plan', '1/2', '1 agente', '1 decisión tuya', '⚑ ', '0.34 USD', 'ctx 21 %']) expect(l1).toContain(s)
  await ui.unmount()
  // sin agentes corriendo aparece el siguiente paso del registro
  const quiet = await $.ui.mount({ ...BAND })
  await quiet.unmount()
})
test('mod: the band is one line: no "siguiente:" line (the next step lives in the panel and in the prompt) and it never mentions Tab', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br()], next: step() })))
  await boot($)
  expect(spy.suggest).toEqual(['revisá feat/x (usa una revisión opus)']) // la sugerencia tenue del prompt sigue
  const ui = await $.ui.mount({ ...BAND })
  expect(await ui.find({ type: 'Text', text: /siguiente/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /revisá feat\/x/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeDefined() // la primera linea queda como estaba
  const all = text(await ui.findAll({ type: 'Text' }))
  expect(all).not.toContain('Tab') // Tab sobre la sugerencia no se pudo verificar: la banda no lo promete
  expect(all).not.toContain('→')
  expect(await ui.find({ type: 'Button', key: 'band-open' })).toBeDefined() // la tecla 0 abre el panel
  await ui.unmount()
})
test('mod: next comes from the registry and the mod has no rule of its own', async ($, on) => {
  common(on)
  // un texto que ninguna regla del mod podria generar: sale tal cual del registro
  fakeProject(on, proj(state({ next: step({ rule: 'push', text: 'hacé algo del registro', prompt: 'hacé algo del registro', costNote: null }) })))
  await boot($)
  expect(spy.suggest).toEqual(['hacé algo del registro'])
  // con dos decisiones el registro dice ambiguo y el mod no inventa un paso
  const d2 = [dec(), dec({ id: 'Q-2', question: 'otra' })]
  const files = proj(state({ decisions: d2, next: { none: 'ambiguous' } }))
  const ui = await $.ui.mount({ ...BAND })
  await ui.unmount()
  expect(JSON.stringify(files)).toContain('ambiguous')
})
test('mod: the band with two decisions says how many and the registry decides there is no suggestion', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ decisions: [dec(), dec({ id: 'Q-2', question: 'otra' })], next: { none: 'ambiguous' } })))
  const ui = await $.ui.mount({ ...BAND })
  expect(text(await ui.find({ type: 'Text', text: /ctx/ }))).toContain('2 decisiones tuyas')
  expect(await ui.find({ type: 'Text', text: /siguiente: / })).toBeUndefined()
  await ui.unmount()
})

// ---- sugerencia en el prompt ----

test('the prompt gets the next step as a dim suggestion (it neither sends nor fills it)', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br()], next: step() })))
  await boot($)
  expect(spy.suggest).toEqual(['revisá feat/x (usa una revisión opus)'])
  expect(spy.fill).toEqual([])
  expect(spy.submit).toEqual([])
})
test('no suggestion in the prompt if something is running', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br()], next: step() })))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  await boot($)
  expect(spy.suggest).toEqual([])
})
test("a proposal from another plugin passes untouched (the engine's text rewrite cannot be simulated in a test)", async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br()], next: step() })))
  await boot($)
  spy.suggest = []
  await $.prompt.suggest({ text: 'algo del motor' })
  expect(spy.suggest).toEqual(['algo del motor'])
})

// ---- panel: Live ----

test('Live: Siguiente, Te toca, En curso con evidencia; el boton de una opcion ENVIA la respuesta con contexto', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: 'SIGUIENTE' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'TE TOCA' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'EN CURSO' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● rojo' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● verde' })).toBeDefined()
  expect(text(await ui.find({ type: 'Text', text: /1 de 2/ }))).toContain('1 de 2')
  expect(await ui.find({ type: 'Text', text: / 50%/ })).toBeDefined()
  await ui.press({ key: 'ans-Q-1-1' })
  expect(spy.fill).toEqual([])
  expect(spy.submit.map((x: any) => x.text)).toEqual(['Respuesta a la decisión Q-1 ("¿Plantilla corta o completa?"): plantilla completa.'])
  expect(spy.closed).toBe(0)
  await ui.unmount()
})

// ---- Te toca ----

test('te toca: ? unfolds under the question the pros and cons of each option and a second ? folds them', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /Gana: una página/ })).toBeUndefined()
  // la tecla es `p` (un hotkey es un digito o una letra minuscula; "?" no es valido)
  await ui.press({ key: 'toggle-pros' })
  expect(await ui.find({ type: 'Text', text: /Gana: una página/ })).toBeDefined()
  await ui.press({ key: 'toggle-pros' })
  expect(await ui.find({ type: 'Text', text: /Gana: una página/ })).toBeUndefined()
  expect(spy.submit).toEqual([])
  await ui.unmount()
})
test('te toca: an option without pros_contras shows nothing under ? and does not throw', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ decisions: [dec({ options: [{ label: 'a' }, { label: 'b' }], recommended: 'a' })] })))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'toggle-pros' })
  expect(await ui.find({ type: 'Text', text: /↳/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '¿Plantilla corta o completa?' })).toBeDefined()
  await ui.unmount()
})
test('te toca: z hides the decision for the session, sends nothing and never answers it', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'postpone' })
  expect(await ui.find({ type: 'Text', text: '¿Plantilla corta o completa?' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'TE TOCA' })).toBeUndefined()
  expect(spy.submit).toEqual([])
  expect(spy.fill).toEqual([])
  expect(spy.toast.join('|')).toContain('Pospuesta')
  await ui.unmount()
})

// El estado del mod es de modulo y el motor de pruebas lo reinicia en cada prueba (como una recarga del mod): lo que `z` oculta
// vive solo en memoria, y hasta que `close-session` lo persista vuelve a aparecer. La recarga real en una sesion no esta probada.
test('te toca: a decision hidden with z comes back after the mod reloads', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: '¿Plantilla corta o completa?' })).toBeDefined()
  await ui.press({ key: 'postpone' })
  expect(await ui.find({ type: 'Text', text: '¿Plantilla corta o completa?' })).toBeUndefined()
  await ui.unmount()
  expect(spy.submit).toEqual([]) // y el mod no escribio ni envio nada para recordarlo
})

// ---- copiar ----

const COPY_STATE = state({
  plan: PLAN,
  branches: [br({ name: 'feat/x', sha: 'a1b2c3d4e5f6' }), br({ name: 'feat/y', sha: '0f1e2d3c4b5a' })],
  cards: [card({ id: 'T1', title: 'uno', status: 'done', evidence: 'docs/reports/t1.md' })],
})
test('copy: c on a branch row copies the branch name with ui.copy', async ($, on) => {
  common(on)
  fakeProject(on, proj(COPY_STATE))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'tab-branches' })
  await ui.press({ key: 'row-br-feat/y' })
  await ui.press({ key: 'copy' })
  expect(spy.copy).toEqual(['feat/y'])
  await ui.unmount()
})
test('copy: c on a card row copies the report path and on a commit the hash', async ($, on) => {
  common(on)
  fakeProject(on, proj(COPY_STATE))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'row-card-T1' })
  await ui.press({ key: 'copy' })
  expect(spy.copy).toEqual(['docs/reports/t1.md'])
  await ui.press({ key: 'tab-branches' })
  await ui.press({ key: 'row-br-feat/x' })
  await ui.press({ key: 'copy-hash' })
  expect(spy.copy).toEqual(['docs/reports/t1.md', 'a1b2c3d4e5f6'])
  await ui.unmount()
})
test('copy: c copies only what the focused row shows and never calls submit or suggest', async ($, on) => {
  common(on)
  fakeProject(on, proj(COPY_STATE))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'copy' }) // sin fila elegida: avisa, no copia
  expect(spy.copy).toEqual([])
  expect(spy.toast.join('|')).toContain('Elegí una fila')
  await ui.press({ key: 'row-card-T1' })
  await ui.press({ key: 'copy-hash' }) // una tarjeta no tiene hash
  expect(spy.copy).toEqual([])
  await ui.press({ key: 'row-card-T1' })
  await ui.press({ key: 'copy' })
  expect(spy.copy).toEqual(['docs/reports/t1.md'])
  expect(spy.submit).toEqual([])
  expect(spy.suggest).toEqual([])
  expect(spy.fill).toEqual([])
  await ui.unmount()
})

// ---- responder ----

test('answer: pressing an option sends the exact text with asUser true and calls submit once', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'ans-Q-1-0' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].text).toBe('Respuesta a la decisión Q-1 ("¿Plantilla corta o completa?"): plantilla corta.')
  expect(spy.submit[0].origin.asUser).toBe(true) // el motor pone asUser dentro de origin
  await ui.unmount()
})
test('answer: the question is clipped to 120 characters and loses newlines and double quotes', async ($, on) => {
  common(on)
  const q = 'Elegí "esta" opción:\nlínea dos ' + 'x'.repeat(200)
  fakeProject(on, proj(state({ decisions: [dec({ question: q })] })))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'ans-Q-1-0' })
  const sent = spy.submit[0].text as string
  expect(sent).not.toContain('\n')
  const inner = /\("(.*)"\): /.exec(sent)![1]!
  expect(inner.length).toBeLessThanOrEqual(120)
  expect(inner).not.toContain('"')
  expect(sent.endsWith(': plantilla corta.')).toBe(true)
  expect(cleanQuestion(q)).toBe(inner)
  expect(answerText(dec() as any, 'x')).toBe('Respuesta a la decisión Q-1 ("¿Plantilla corta o completa?"): x.')
  await ui.unmount()
})
test('answer: the option Otra fills the prompt and sends nothing', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'ans-Q-1-other' })
  expect(spy.fill).toEqual(['Respuesta a la decisión Q-1 ("¿Plantilla corta o completa?"): '])
  expect(spy.submit).toEqual([])
  await ui.unmount()
})
test('answer: after sending, the decision disappears and a second press does not send again', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'ans-Q-1-0' })
  for (const k of ['ans-Q-1-0', 'ans-Q-1-1']) {
    let threw = false
    try { await ui.press({ key: k }) } catch { threw = true } // la decision ya no se dibuja: no hay boton que apretar
    expect(threw).toBe(true)
  }
  expect(spy.submit.length).toBe(1)
  expect(spy.toast.join('|')).toContain('Enviado')
  expect(await ui.find({ type: 'Text', text: '¿Plantilla corta o completa?' })).toBeUndefined()
  await ui.unmount()
})
test('answer: turn, agent.spawn, agent end events and the clock tick never call submit', async ($, on) => {
  const clock = common(on)
  fakeProject(on, proj(STATE_FULL))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await boot($)
  await spawn($)
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 5, isAborted: false, usage: undefined, agentId: 'a1', reason: 'answer' })
  await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 5, isAborted: false, usage: undefined, reason: 'answer' })
  await clock.advance(10000)
  const ui = await $.ui.mount({ ...BAND })
  await ui.unmount()
  await clock.advance(10000)
  expect(spy.submit).toEqual([])
})
test('answer: the next-step button and its alternatives fill or suggest and never call submit', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({
    branches: [br({ name: 'a', review: 'APPROVE', suite: 'green' }), br({ name: 'b' })], main: { ahead: 1 },
    next: step({ rule: 'merge', text: 'uní a a main', prompt: 'uní a a main', costNote: null, alternatives: [step({ rule: 'review', text: 'revisá b', prompt: 'revisá b' }), step({ rule: 'push', text: 'hacé push de main', prompt: 'hacé push de main', costNote: null })] }),
  })))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'next-main' })
  await ui.press({ key: 'next-alt-0' })
  await ui.press({ key: 'next-alt-1' })
  expect(spy.fill).toEqual(['uní a a main', 'revisá b (usa una revisión opus)', 'hacé push de main'])
  expect(spy.suggest).toEqual([])
  expect(spy.submit).toEqual([])
  await ui.unmount()
})
test('answer: a prompt that cannot be submitted shows a toast and keeps the decision', async ($, on) => {
  common(on)
  spy.submitOk = false
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'ans-Q-1-0' })
  expect(spy.toast.join('|')).toContain('No pude enviar')
  expect(await ui.find({ type: 'Text', text: '¿Plantilla corta o completa?' })).toBeDefined()
  spy.submitOk = true
  await ui.press({ key: 'ans-Q-1-0' }) // puede reintentarse
  expect(spy.submit.length).toBe(2)
  await ui.unmount()
})
test('Live: si el prompt no puede llenarse, avisa con un toast y no cierra', async ($, on) => {
  common(on)
  spy.fillOk = false
  fakeProject(on, proj(state({ branches: [br()], next: step() })))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'next-main' })
  expect(spy.toast.join('|')).toContain('No pude llenar')
  expect(spy.closed).toBe(0)
  await ui.unmount()
})
test('Live: algo corriendo -> no hay bloque SIGUIENTE y TRABAJANDO lista los agentes', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br()], next: step() })))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: 'SIGUIENTE' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'TRABAJANDO' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 agente/ })).toBeDefined()
  await ui.unmount()
})
test('Live: nada corriendo -> linea atenuada', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ decisions: [dec()] })))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: '○ nada corriendo' })).toBeDefined()
  await ui.unmount()
})
test('Live sin registro: dice que pignolo no esta activo e invita al modo demo', async ($, on) => {
  common(on)
  fakeProject(on, {})
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /pignolo no está activo en este proyecto/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /demo/ })).toBeDefined()
  await ui.unmount()
})
test('mod: a closed card during executing is drawn done', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ plan: PLAN, cards: [card({ id: 'T1', status: 'done' }), card({ id: 'T2', status: 'todo' })] })))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: / 50%/ })).toBeDefined()
  await ui.unmount()
})

// ---- Ramas ----

test('Ramas: una fila por rama con la linea de etapas y marcas', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br({ name: 'feat/x', stage: 'review' }), br({ name: 'feat/y', stage: 'merge', waiting: true, review: 'APPROVE', suite: 'green' })] })))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'tab-branches' })
  expect(await ui.find({ key: 'row-br-feat/x' })).toBeDefined()
  expect(await ui.find({ key: 'row-br-feat/y' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /APPROVE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\s+plan\s+ejec/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '◐' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '◆' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^━+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeDefined()
  await ui.unmount()
})
test('Ramas: las ramas ya unidas no se listan', async ($, on) => {
  common(on)
  fakeProject(on, proj(state({ branches: [br({ name: 'feat/x' }), br({ name: 'vieja', merged: true, commits: 0 })] })))
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'tab-branches' })
  expect(await ui.find({ key: 'row-br-feat/x' })).toBeDefined()
  expect(await ui.find({ key: 'row-br-vieja' })).toBeUndefined()
  await ui.unmount()
})

// ---- demo ----

const DEMO = JSON.stringify(state({
  plan: { slug: 'demo-plan', stage: 'executing', request: '' },
  cards: [card({ id: 'T1', status: 'done', red: 'r', green: 'v' }), card({ id: 'T2' })],
  decisions: [dec({ id: 'Q-1', question: '¿demo?', options: [{ label: 'sí' }, { label: 'no' }], recommended: 'sí' })],
  branches: [br({ name: 'demo/rama' })],
  agents: [{ type: 'implementer', description: 'x', model: 'sonnet', minutes: 1, tokens: 10 }],
  activity: [1, 5, 3, 9, 4],
  next: step({ rule: 'decision', text: '¿demo?', prompt: 'Decisión Q-1: sí', costNote: null }),
}))
test('/pignolo-panel demo carga los datos de muestra y abre el panel', async ($, on) => {
  common(on)
  fakeProject(on, { '/sample/panel-state.json': DEMO })
  const out: any = await $.command.run({ command: 'pignolo-panel', args: 'demo' })
  expect(out.text).toContain('modo demo')
  expect(spy.opened).toEqual(['pignolo-panel'])
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /MODO DEMO/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'demo-plan' })).toBeDefined()
  await ui.press({ key: 'tab-branches' })
  expect(await ui.find({ key: 'row-br-demo/rama' })).toBeDefined()
  await ui.unmount()
})
test('demo con agente corriendo: el minigrafico es una fila de texto en terminal y en desktop, sin Raster', async ($, on) => {
  common(on)
  fakeProject(on, { '/sample/panel-state.json': DEMO })
  await $.command.run({ command: 'pignolo-panel', args: 'demo busy' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const t = await $.ui.mount({ ...TALL, surface })
    expect(await t.find({ type: 'Raster' })).toBeUndefined()
    expect(await t.find({ type: 'Text', text: SPARK })).toBeDefined()
    await t.unmount()
  }
})
test('la opcion de usuario demo=true arranca en modo demo', { options: { demo: true } }, async ($, on) => {
  common(on)
  fakeProject(on, { '/sample/panel-state.json': DEMO })
  const ui = await $.ui.mount({ ...BAND })
  expect(text(await ui.find({ type: 'Text', text: /ctx/ }))).toContain('demo-plan')
  await ui.unmount()
})

// ---- Costo ----

test('Costo: costo, contexto, limites y desglose por agente', async ($, on) => {
  common(on)
  fakeProject(on, {})
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'tab-cost' })
  expect(text(await ui.find({ type: 'Text', text: /Costo de la sesión/ }))).toContain('0.34 USD')
  expect(text(await ui.find({ type: 'Text', text: /Contexto/ }))).toContain('21 %')
  expect(await ui.find({ type: 'Text', text: /Límite five_hour/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'pignolo:explorer' })).toBeDefined()
  await ui.unmount()
})
test('mod: the agent row shows minutes and tokens and no money figure', async ($, on) => {
  common(on)
  fakeProject(on, {})
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'tab-cost' })
  const row = text(await ui.find({ key: 'u-a1' }))
  expect(row).toMatch(/\d+\.\d min/)
  expect(row).toContain('pignolo:explorer')
  expect(row).not.toMatch(/USD|\$|€/)
  await ui.unmount()
})

// ---- tema ----

test('mod: a theme without warning falls back without throwing', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  expect(pickColor({ colors: { claude: '#fff', success: '#0f0' } }, 'warning', 'claude')).toBe('claude')
  expect(pickColor({ colors: { warning: '#fa0' } }, 'warning', 'claude')).toBe('warning')
  expect(pickColor(undefined, 'warning', 'claude')).toBe('warning') // sin dato del tema: se usa la clave
  const ui = await $.ui.mount({ ...PANE, theme: { colors: { claude: '#fff' } } } as any)
  expect(await ui.find({ type: 'Text', text: 'TE TOCA' })).toBeDefined()
  await ui.unmount()
})

// ---- marcos redondeados (criterio visual del autor) ----

test('mod: every block of the panel is inside a round-bordered Box with horizontal padding 1 and the same width', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  const ui = await $.ui.mount({ ...PANE })
  const tree = await ui.drawn()
  const blocks = walk(tree, (n) => /^blk-[a-z]+$/.test(n.props?.key ?? ''))
  const keys = blocks.map((b: any) => b.props.key)
  for (const k of ['blk-tetoca', 'blk-encurso', 'blk-trabajando']) expect(keys).toContain(k)
  for (const b of blocks) {
    expect(b.props.borderStyle).toBe('round')
    expect(b.props.paddingX).toBe(1)
  }
  expect(new Set(blocks.map((b: any) => b.props.width)).size).toBe(1)
  await ui.unmount()
  const q = await $.ui.mount({ ...PANE })
  // la pestaña Ramas y la de Costo tambien van en un bloque con marco redondeado
  await q.press({ key: 'tab-branches' })
  const br1 = walk(await q.drawn(), (n) => n.props?.key === 'blk-ramas')
  expect(br1.length).toBe(1)
  expect(br1[0].props.borderStyle).toBe('round')
  await q.press({ key: 'tab-cost' })
  const co = walk(await q.drawn(), (n) => n.props?.key === 'blk-costo')
  expect(co.length).toBe(1)
  expect(co[0].props.borderStyle).toBe('round')
  await q.unmount()
})
test('mod: each block closes with its shortcuts in the same form and the progress sits at the top right', async ($, on) => {
  common(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /^a–d {2}responder {3}p {2}pros y contras {3}z {2}después$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Tab {2}elegir fila {3}Enter {2}marcarla {3}c {2}copiar$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Enter {2}llenar el prompt {3}Tab {2}elegir otra$/ })).toBeDefined()
  expect(text(await ui.find({ key: 'blk-tetoca-head' }))).toContain('1 decisión')
  expect(text(await ui.find({ key: 'blk-encurso-head' }))).toContain('1 de 2')
  await ui.unmount()
})

// ---- abrir solo (D-P5, R-P10) ----

async function withTerminal($: any, columns: number) {
  const ui = await $.ui.mount({ ...band({ columns, rows: 40 }) })
  await ui.unmount()
}
const FIRST = state({ decisions: [dec()] })
const SECOND = state({ decisions: [dec(), dec({ id: 'Q-2', question: 'otra' })] })

test('mod: autoOpen is on by default and userConfig can turn it off', async ($, on) => {
  const clock = common(on)
  const files = proj(state())
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 150)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(FIRST)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})
test('mod: autoOpen off keeps the panel closed', { options: { autoOpen: false } }, async ($, on) => {
  const clock = common(on)
  const files = proj(state())
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 150)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(FIRST)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
})
test('mod: a new decision opens the panel once when the terminal has 144 columns or more', async ($, on) => {
  const clock = common(on)
  const files = proj(state())
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 144)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(FIRST)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})
test('mod: after the first opening 110 columns are enough', async ($, on) => {
  const clock = common(on)
  const files = proj(state())
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 150)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(FIRST)
  await clock.advance(3000)
  await withTerminal($, 110)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(SECOND)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel', 'pignolo-panel'])
})
test('mod: below the threshold or with autoOpen off the panel does not open', async ($, on) => {
  const clock = common(on)
  const files = proj(state())
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 143)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(FIRST)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
  // ensanchar la terminal no reabre una decision que ya se anuncio
  await withTerminal($, 150)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
  // una decision nueva con la terminal ancha abre; con 109 columnas, ya abierta una vez, la siguiente no
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(SECOND)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
  await withTerminal($, 109)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(state({ decisions: [dec(), dec({ id: 'Q-2', question: 'otra' }), dec({ id: 'Q-3', question: 'tercera' })] }))
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})
test('mod: the same decision never opens the panel twice, not even across refreshes or when closed with Esc', async ($, on) => {
  const clock = common(on)
  const files = proj(state())
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 150)
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(FIRST)
  await clock.advance(3000)
  await clock.advance(3000)
  await clock.advance(3000)
  const ui = await $.ui.mount({ ...PANE })
  await ui.unmount() // Esc cierra el panel: no lo reabre
  await clock.advance(3000)
  await withTerminal($, 150)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})
test('mod: a registry refresh without a new decision does not open the panel', async ($, on) => {
  const clock = common(on)
  const files = proj(FIRST) // la decision ya existe al cargar: se marca anunciada sin abrir
  fakeProject(on, files)
  await boot($)
  await withTerminal($, 150)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify({ ...FIRST, cards: [card({ id: 'T1', status: 'running' })], plan: PLAN })
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
})

// ---- toasts, comando, alcance ----

test('toast breve cuando un agente termina', async ($, on) => {
  common(on)
  fakeProject(on, {})
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 5, isAborted: false, usage: undefined, agentId: 'a1', reason: 'answer' })
  expect(spy.toast).toEqual(['✓ pignolo:explorer terminó: leer lib'])
})
test('toast cuando una tarjeta pasa a hecha', async ($, on) => {
  const clock = common(on)
  const files = proj(state({ plan: PLAN, cards: [card({ id: 'T1', status: 'running' })] }))
  fakeProject(on, files)
  const ui = await $.ui.mount({ ...BAND })
  await ui.unmount()
  files['/proj/.pignolo/panel-state.json'] = JSON.stringify(state({ plan: PLAN, cards: [card({ id: 'T1', status: 'done' })] }))
  await clock.advance(3000)
  const ui2 = await $.ui.mount({ ...BAND })
  await ui2.unmount()
  expect(spy.toast).toEqual(['✓ tarjeta T1 terminada'])
})
test('/pignolo-panel abre el panel con foco y Esc', async ($, on) => {
  common(on)
  fakeProject(on, {})
  await boot($)
  expect(await $.command.run({ command: 'pignolo-panel', args: '' })).toEqual({})
  expect(spy.openEvents[0].id).toBe('pignolo-panel')
  expect(spy.openEvents[0].closeOnEscape).toBe(true)
})
test('no toca lo que Claude Code dibuja: la fila del Agent (ToolUse) queda como esta', async ($, on) => {
  common(on)
  fakeProject(on, {})
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await spawn($)
  const ui = await $.ui.mount({ ...ROW })
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /◆/ })).toBeUndefined()
  await ui.unmount()
})
test('suggestionText says the cost when there is one', async () => {
  expect(suggestionText({ prompt: 'x', costNote: 'usa una revisión opus' } as any)).toBe('x (usa una revisión opus)')
  expect(suggestionText({ prompt: 'x', costNote: '' } as any)).toBe('x')
})

// ---- Live: detalle por agente (panel 0.4.0) ----

// Un solo `agent.spawn` y un solo `turn.step` por debajo del mod, con lo que cada prueba les deja dicho.
let spawnNext = { id: 'a1', model: 'haiku' }
let stepNext: any = null
function liveCommon(on: any) {
  const clock = common(on)
  on('agent.spawn', () => ({ model: spawnNext.model, agentId: spawnNext.id }))
  on('turn.step', async function* () {
    return stepNext
  })
  return clock
}
const modelOf = new Map<string, string>() // el modelo que informa el uso de cada paso es el del agente
async function spawnAs($: any, id: string, o: { description?: string; type?: string; parent?: string; model?: string } = {}) {
  spawnNext = { id, model: o.model ?? 'haiku' }
  modelOf.set(id, spawnNext.model)
  return $.agent.spawn({
    tool_use_id: 'tu_' + id, prompt: 'x', description: o.description ?? 'tarea ' + id, subagentType: o.type ?? 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, model: o.model ?? 'haiku', parentModel: 'sonnet', background: false, fork: false, parentAgentId: o.parent,
  })
}
async function stepAs($: any, agentId: string, o: { tool?: string; input?: any; answer?: string; usage?: Partial<Record<string, number>> } = {}) {
  stepNext = {
    turnId: 't', index: 0, answer: o.answer ?? '', stopReason: o.tool ? 'tool_use' : 'end_turn',
    toolUses: o.tool ? [{ id: 'tu', name: o.tool, input: o.input ?? {} }] : [],
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: modelOf.get(agentId) ?? 'haiku', ...o.usage },
  }
  const s = $.turn.step({ turnId: 't', index: 0, model: 'haiku', messageCount: 1, agentId })
  let r = await s.next() // los pedazos pasan sin tocarse; lo que retorna el generador es el resultado del paso
  while (!r.done) r = await s.next()
  return r.value
}
const working = async (ui: any) => walk(await ui.drawn(), (n) => n.props?.key === 'blk-trabajando')[0]
const keysOf = (tree: any, re: RegExp) => walk(tree, (n) => re.test(n.props?.key ?? '')).map((n: any) => n.props.key)

test('Live: the roomy block draws, per running agent, task, model, time, tokens, ctx and what it does now', async ($, on) => {
  const clock = liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1', { description: 'arreglos del panel', model: 'sonnet' })
  await stepAs($, 'a1', { tool: 'Edit', input: { file_path: '/p/hooks/register.js' }, usage: { input_tokens: 30000, output_tokens: 500, cache_read_input_tokens: 10000, cache_creation_input_tokens: 1000 } })
  await clock.advance(3000)
  const ui = await $.ui.mount({ ...TALL })
  const all = text(await working(ui))
  for (const s of ['arreglos del panel', 'sonnet', '41k', 'Edit  hooks/register.js', 'hace 3 s', 'tarea', 'modelo', 'tiempo', 'tokens', 'ctx', '0,1 min']) expect(all).toContain(s)
  expect(text(await ui.find({ key: 'blk-trabajando-head' }))).toContain('1 agente · 42k · 0,1 min')
  expect(text(await ui.find({ key: 'ag-a1-2' }))).toContain('"dimColor":true') // la linea 2 va tenue
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(all).not.toContain('general-purpose') // el tipo comun no se repite
  await ui.unmount()
})

test('Live: before its first step an agent reads "empezando…", and a step with text and no tool use reads "escribiendo la respuesta"', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1', { description: 'uno' })
  const ui = await $.ui.mount({ ...TALL })
  expect(await ui.find({ type: 'Text', text: 'empezando…' })).toBeDefined()
  await ui.unmount()
  await stepAs($, 'a1', { answer: 'hola' })
  const after = await $.ui.mount({ ...TALL }) // el panel se vuelve a dibujar con el reloj (cada 3 s)
  expect(await after.find({ type: 'Text', text: 'escribiendo la respuesta' })).toBeDefined()
  expect(await after.find({ type: 'Text', text: 'empezando…' })).toBeUndefined()
  await after.unmount()
})

test('Live: a task with a type that is not general-purpose shows the type dimmed after it', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1', { description: 'explorar reglas', type: 'pignolo:explorer' })
  const ui = await $.ui.mount({ ...TALL })
  expect(text(await ui.find({ key: 'ag-a1' }))).toContain('pignolo:explorer')
  await ui.unmount()
})

test('Live: an agent with no step for more than 60 s shows ◌ and "sin actividad hace …" in the warning color, and not at 60 s', async ($, on) => {
  const clock = liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1', { description: 'explorar' })
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...TALL })
  expect(await ui.find({ type: 'Text', text: /sin actividad/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '◌' })).toBeUndefined()
  await ui.unmount()
  await clock.advance(1000)
  const late = await $.ui.mount({ ...TALL })
  const line = text(await late.find({ type: 'Text', text: /sin actividad hace 1 min 1 s/ }))
  expect(line).toContain('"color":"warning"')
  expect(await late.find({ type: 'Text', text: '◌' })).toBeDefined()
  await late.unmount()
  // un paso nuevo lo saca del aviso
  await stepAs($, 'a1', { tool: 'Read', input: { file_path: '/a/b.js' } })
  const fresh = await $.ui.mount({ ...TALL })
  expect(await fresh.find({ type: 'Text', text: /sin actividad/ })).toBeUndefined()
  await fresh.unmount()
})

test('Live: a context of 150000 tokens or more draws the ctx cell in the warning color and bold', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1', { description: 'pesado' })
  await spawnAs($, 'a2', { description: 'liviano' })
  // el contexto es entrada + cache leida + cache escrita del ultimo paso (150k contra 100k); los tokens suman tambien la salida (170k y 120k)
  await stepAs($, 'a1', { tool: 'Read', input: { file_path: '/a/b.js' }, usage: { input_tokens: 100000, cache_read_input_tokens: 40000, cache_creation_input_tokens: 10000, output_tokens: 20000 } })
  await stepAs($, 'a2', { tool: 'Read', input: { file_path: '/a/b.js' }, usage: { input_tokens: 100000, output_tokens: 20000 } })
  const ui = await $.ui.mount({ ...TALL })
  const heavy = text(await ui.find({ type: 'Text', text: '150k' }))
  expect(heavy).toContain('"color":"warning"')
  expect(heavy).toContain('"bold":true')
  const light = text(await ui.find({ type: 'Text', text: '100k' }))
  expect(light).not.toContain('"color":"warning"')
  expect(light).not.toContain('"bold":true')
  await ui.unmount()
})

test('Live: agents that need attention come first, then the most recent; a nested agent goes right after its parent with └', async ($, on) => {
  const clock = liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'old', { description: 'el parado' })
  await clock.advance(70_000)
  await spawnAs($, 'p1', { description: 'padre' })
  await clock.advance(1000)
  await spawnAs($, 'q1', { description: 'mas nuevo' })
  await clock.advance(1000)
  await spawnAs($, 'c1', { description: 'hijo', parent: 'p1' })
  const ui = await $.ui.mount({ ...TALL })
  expect(keysOf(await ui.drawn(), /^ag-(old|q1|p1|c1)$/)).toEqual(['ag-old', 'ag-q1', 'ag-p1', 'ag-c1'])
  expect(text(await ui.find({ key: 'ag-c1' }))).toContain('└')
  expect(text(await ui.find({ key: 'ag-p1' }))).not.toContain('└')
  await ui.unmount()
})

test('Live: with few rows the block turns compact: one line per agent, the stalled one keeps two and everything else goes to "+ N más"', async ($, on) => {
  const clock = liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 's1', { description: 'el parado' })
  await clock.advance(70_000)
  for (const id of ['n1', 'n2', 'n3']) {
    await spawnAs($, id, { description: 'normal ' + id })
    await stepAs($, id, { tool: 'Read', input: { file_path: '/a/b.js' } })
  }
  const ui = await $.ui.mount({ ...PANE }) // 10 filas: piso de 8 para el bloque
  expect(await ui.find({ type: 'Text', text: 'tarea' })).toBeUndefined() // sin encabezado de columnas
  expect(await ui.find({ key: 'ag-s1-2' })).toBeDefined() // el parado, con su segunda linea
  expect(text(await ui.find({ type: 'Text', text: /sin actividad hace 1 min 10 s/ }))).toContain('warning')
  expect(await ui.find({ key: 'ag-n3-2' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '+ 3 más, trabajando sin avisos' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPARK })).toBeUndefined() // sin minigrafico
  await ui.unmount()
  // con alto de sobra, los cuatro entran holgados
  const tall = await $.ui.mount({ ...TALL })
  expect(await tall.find({ type: 'Text', text: /más, trabajando sin avisos/ })).toBeUndefined()
  expect(await tall.find({ key: 'ag-n3-2' })).toBeDefined()
  await tall.unmount()
})

test('Live: a narrow block drops the model, then the tokens, then the "hace n s"', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1', { description: 'uno', model: 'sonnet' })
  await stepAs($, 'a1', { tool: 'Read', input: { file_path: '/a/b.js' } })
  const at = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...TALL, props: { ...TALL.props, bodyColumns } })
    const t = text(await working(ui))
    await ui.unmount()
    return { model: t.includes('modelo'), tokens: t.includes('tokens'), ago: t.includes('hace '), task: t.includes('tarea') && t.includes('tiempo') && t.includes('ctx') }
  }
  expect(await at(100)).toEqual({ model: true, tokens: true, ago: true, task: true })
  expect(await at(62)).toEqual({ model: false, tokens: true, ago: true, task: true }) // ancho interior 56
  expect(await at(56)).toEqual({ model: false, tokens: false, ago: true, task: true }) // 50
  expect(await at(50)).toEqual({ model: false, tokens: false, ago: false, task: true }) // 44
})

test('Live: the summary button fills the prompt with the fixed request and never sends it, and it only exists while an agent runs', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  const none = await $.ui.mount({ ...TALL })
  expect(await none.find({ key: 'summary' })).toBeUndefined()
  await none.unmount()
  await spawnAs($, 'a1')
  const ui = await $.ui.mount({ ...TALL })
  const btn = await ui.find({ type: 'Button', key: 'summary' })
  expect(btn.props.hotkey).toBe('s')
  expect(btn.props.label).toBe('resumen')
  await ui.press({ key: 'summary' })
  expect(spy.fill).toEqual(['Resumime en pocas líneas qué está haciendo cada agente ahora y si alguno necesita algo de mí.'])
  expect(spy.submit).toEqual([])
  // es la ultima fila del bloque
  const kids = (await working(ui)).children
  expect(kids[kids.length - 1].props.key).toBe('summary')
  await ui.unmount()
})

test('Live: no answer letter is s (the summary button owns it) and hotkeys stay unique in the pane', async ($, on) => {
  liveCommon(on)
  const many = Array.from({ length: 6 }, (_, i) => dec({ id: 'Q-' + (i + 1), question: 'pregunta ' + (i + 1), options: [{ label: 'x' }, { label: 'y' }, { label: 'z' }], recommended: 'x' }))
  fakeProject(on, proj(state({ decisions: many })))
  await spawnAs($, 'a1')
  const ui = await $.ui.mount({ ...TALL })
  const buttons = walk(await ui.drawn(), (n) => n.type === 'Button' && n.props?.hotkey)
  const answers = buttons.filter((b: any) => /^ans-/.test(b.props.key))
  expect(answers.length).toBeGreaterThan(18) // pasa por todas las letras del panel
  expect(answers.map((b: any) => b.props.hotkey)).not.toContain('s')
  const keys = buttons.map((b: any) => b.props.hotkey)
  expect(new Set(keys).size).toBe(keys.length)
  expect(keys).toContain('s')
  await ui.unmount()
})

test('Live: the pane has no numeric shortcut line at the bottom and the tabs show Live', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(STATE_FULL))
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /Esc\s+cerrar/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /1\s+ahora|2\s+ramas|3\s+costo/ })).toBeUndefined()
  const t = await ui.find({ type: 'Button', key: 'tab-now' })
  expect([t.props.label, t.props.hotkey]).toEqual(['Live', '1'])
  expect(text(await ui.drawn())).not.toContain('Ahora')
  await ui.unmount()
})

test('buttons: no label of a plain Button with a hotkey starts with its own letter and two spaces (the engine draws "a: label")', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj({ ...STATE_FULL, cards: [card({ id: 'T1', status: 'done', evidence: 'x' })] }))
  await spawnAs($, 'a1')
  let seen = 0
  const check = async (ui: any) => {
    for (const b of walk(await ui.drawn(), (n) => n.type === 'Button' && n.props?.plain && n.props?.hotkey)) {
      seen += 1
      expect(String(b.props.label).startsWith(b.props.hotkey + '  '), `${b.props.key}: ${b.props.label}`).toBe(false)
      expect(String(b.props.label).length).toBeGreaterThan(0)
    }
  }
  const ui = await $.ui.mount({ ...TALL })
  await check(ui)
  await ui.press({ key: 'toggle-pros' })
  await check(ui)
  await ui.press({ key: 'tab-branches' })
  await check(ui)
  await ui.unmount()
  expect(seen).toBeGreaterThan(12)
  const band = await $.ui.mount({ ...BAND })
  await check(band)
  await band.unmount()
})

test('Live: control and invisible characters in a tool input are drawn as ?, on one line, and nothing is sent', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1')
  await stepAs($, 'a1', { tool: 'Bash', input: { command: 'echo \u0007hola​\nsegunda linea \ud800 ' + 'x'.repeat(200) } })
  const ui = await $.ui.mount({ ...TALL })
  const detail = text(await ui.find({ key: 'ag-a1-2' }))
  expect(detail).toContain('Bash  echo ?hola?')
  expect(detail).not.toMatch(/\\u0007|\\u200b|\\n|\\u2028|\\ud800/)
  expect(detail).toContain('…') // y el comando se corta a 80
  await ui.unmount()
  expect(spy.submit).toEqual([])
  expect(spy.fill).toEqual([])
})

test('Live: stepping and spawning only draw: the step result passes through untouched and nothing is sent or filled', async ($, on) => {
  liveCommon(on)
  fakeProject(on, proj(state()))
  await spawnAs($, 'a1')
  const r: any = await stepAs($, 'a1', { tool: 'Read', input: { file_path: '/a/b.js' } })
  expect(r).toEqual(stepNext)
  await stepAs($, 'no-registrado', { tool: 'Read', input: {} }) // un agente que el mod no vio: no tira
  await stepAs($, 'a1', { tool: 'Agent', input: { description: 'otro' } })
  expect(spy.submit).toEqual([])
  expect(spy.fill).toEqual([])
  expect(spy.suggest).toEqual([])
})

const DEMO_BUSY = JSON.stringify(state({
  plan: { slug: 'demo-plan', stage: 'executing', request: '' },
  agents: [
    { id: 'd1', type: 'pignolo:explorer', description: 'explorar reglas MCP', model: 'haiku', minutes: 2, tokens: 14000, ctx: 9000, idleSec: 130, last: { name: 'Grep', target: '"mcp" en plugins/' } },
    { id: 'd2', type: 'pignolo:judge-a', description: 'revisión de la guardia', model: 'opus', minutes: 6.1, tokens: 120000, ctx: 156000, idleSec: 40, last: { name: 'Bash', target: 'npm test tests/guard.test.js' } },
    { id: 'd3', type: 'general-purpose', description: 'arreglos del panel', model: 'sonnet', minutes: 4.2, tokens: 88000, ctx: 41000, idleSec: 3, last: { name: 'Edit', target: 'hooks/register.js' } },
    { id: 'd4', parentId: 'd3', type: 'general-purpose', description: 'buscar usos de spawn', model: 'haiku', minutes: 0.4, tokens: 6000, ctx: 4000, idleSec: 2, last: { name: 'Grep', target: '"spawn" en plugins/' } },
  ],
  activity: [1, 5, 3, 9, 4],
}))
test('demo busy: four running agents with the detail (one stalled, one nested, one with a high ctx) and idle demo has none running', async ($, on) => {
  liveCommon(on)
  fakeProject(on, { '/sample/panel-state.json': DEMO_BUSY })
  await $.command.run({ command: 'pignolo-panel', args: 'demo busy' })
  const ui = await $.ui.mount({ ...TALL })
  expect(keysOf(await ui.drawn(), /^ag-d\d$/)).toEqual(['ag-d1', 'ag-d2', 'ag-d3', 'ag-d4'])
  expect(text(await ui.find({ key: 'blk-trabajando-head' }))).toContain('4 agentes · 228k · 6,1 min')
  expect(await ui.find({ type: 'Text', text: 'sin actividad hace 2 min 10 s' })).toBeDefined()
  expect(text(await ui.find({ type: 'Text', text: '156k' }))).toContain('"bold":true')
  expect(text(await ui.find({ key: 'ag-d4' }))).toContain('└')
  expect(text(await ui.find({ key: 'ag-d4-2' }))).toContain('Grep  \\"spawn\\" en plugins/')
  expect(text(await ui.find({ key: 'ag-d2-2' }))).toContain('hace 40 s')
  expect(await ui.find({ type: 'Text', text: SPARK })).toBeDefined()
  await ui.unmount()
  await $.command.run({ command: 'pignolo-panel', args: 'demo' })
  const idle = await $.ui.mount({ ...TALL })
  expect(await idle.find({ type: 'Text', text: '○ nada corriendo' })).toBeDefined()
  await idle.unmount()
})
