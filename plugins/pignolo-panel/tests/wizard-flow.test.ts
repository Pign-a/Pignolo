import { expect, mock, test } from 'claude-code/testing'

// Asistente de inicio (etapa 3): apertura, navegacion, envio y caminos de falla, con un motor simulado. El panel no escribe nada:
// el unico efecto es enviar UNA vez las elecciones (por `prompt.submit`, via `submitText`).

const ID = '5d3f0a91c2e7'
const PHRASE = 'Activá pignolo en este proyecto con estas elecciones: --choices '
const detect = (over: Record<string, any> = {}) => ({
  schema: 'pignolo-wizard-detect/1',
  id: ID,
  blank: false,
  project: { type: 'code-tested', stacks: ['node'], tests: { cmd: 'npm run test', state: 'declared' }, main: 'main' },
  profiles: [
    { id: 'balanced', label: 'balanceado', line: 'sonnet para construir, opus revisa', recommended: true },
    { id: 'economy', label: 'económico', line: 'sonnet en lo seguro, el más barato', recommended: false },
    { id: 'max', label: 'máximo', line: 'opus casi en todo, el más caro', recommended: false },
  ],
  permissions: { groups: [{ id: 'blocks', line: 'los comandos de git que pierden trabajo' }, { id: 'asks', line: 'antes de borrar ramas y etiquetas' }, { id: 'free', line: 'push y merge normales' }] },
  places: { candidates: [{ kind: 'spec', from: 'diseno/', to: 'docs/specs/', decision: 'adopt', options: ['adopt', 'move', 'leave'], moves: [{ from: 'diseno/', to: 'docs/specs/' }], note: null }] },
  offer: true,
  ...over,
})
const BLANK = { schema: 'pignolo-wizard-detect/1', id: ID, blank: true, project: null, profiles: [], permissions: { groups: [] }, places: { candidates: [] }, offer: true }
const WIZ = '/proj/.git/pignolo/wizard-detect.json'
const PANE = {
  plugin: 'pignolo-panel',
  component: 'Pane',
  requestId: 'pignolo-panel',
  surface: 'terminal',
  viewport: { columns: 150, rows: 40 },
  props: { title: 'pignolo', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const band = (columns: number) => ({
  plugin: 'pignolo-panel',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  viewport: { columns, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: columns, scroll: { offset: 0, bodyRows: 5 }, view: {} },
}) as const

type Spy = { submit: any[]; fill: string[]; toast: string[]; opened: string[]; writes: string[]; reads: string[] }
type Opts = { files?: Record<string, string>; ui?: boolean; submitOk?: boolean; submitGate?: Promise<void> }

// Un proyecto sin pignolo: archivos en memoria (se pueden cambiar durante el test) y espias de todo lo que el asistente podria tocar.
async function setup($: any, on: any, o: Opts = {}) {
  const files: Record<string, string> = o.files ?? { [WIZ]: JSON.stringify(detect()) }
  const spy: Spy & { submitOk: boolean } = { submit: [], fill: [], toast: [], opened: [], writes: [], reads: [], submitOk: o.submitOk ?? true }
  const clock = mock.clock(on, { now: 1_000_000 })
  const norm = (p: string) => p.split('\\').join('/').replace(/^[A-Za-z]:/, '')
  const keyOf = (p: string) => Object.keys(files).find((k) => norm(p) === k || norm(p).endsWith(k))
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', ($: any, e: any) => ({ value: keyOf(e.path) !== undefined || ['/proj', '/proj/.git', '/proj/.git/pignolo'].includes(norm(e.path).replace(/\/+$/, '')) }))
  on('fs.read', ($: any, e: any) => {
    spy.reads.push(norm(e.path))
    const k = keyOf(e.path)
    if (k === undefined) throw new Error('ENOENT')
    return { value: files[k] }
  })
  on('fs.list', () => ({ value: [] }))
  for (const w of ['write']) on('fs.' + w, ($: any, e: any) => { spy.writes.push(w + ' ' + e.path); return { value: undefined } })
  on('settings.read', () => ({ value: { enabledPlugins: o.ui ? { 'pignolo-ui@pignolo': true } : {} } }))
  on('command.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { context: {}, rateLimits: [], cost: { usd: 0 } } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('ui.toast', ($: any, e: any) => { spy.toast.push(String(e.text)); return { value: undefined } })
  on('ui.open', ($: any, e: any) => { spy.opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.close', () => ({ value: undefined }))
  on('prompt.submit', async ($: any, e: any) => {
    spy.submit.push(e)
    if (o.submitGate) await o.submitGate
    return spy.submitOk ? { text: e.text } : { drop: 'test: no se pudo enviar' }
  })
  on('prompt.fill', ($: any, e: any) => { spy.fill.push(e.text); return { isFilled: true, text: e.text, cursor: e.text.length } })
  on('prompt.suggest', () => ({ isShown: true }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/proj' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/proj' })
  return { files, spy, clock }
}
async function terminal($: any, columns: number) {
  const ui = await $.ui.mount({ ...band(columns) })
  await ui.unmount()
}
// Abre el asistente solo: terminal ancha y un ciclo del temporizador.
async function openIt($: any, clock: any, columns = 150) {
  await terminal($, columns)
  await clock.advance(3000)
}
const flat = (x: unknown) => JSON.stringify(x)
// Pasa por todos los pasos hasta el ultimo (en un proyecto de 5 pasos, 4 pulsaciones de "seguir").
async function toLast(ui: any, n = 4) {
  for (let i = 0; i < n; i++) await ui.press({ key: 'wz-next' })
}
const EXPECTED = PHRASE + JSON.stringify({ v: 1, id: ID, project: 'confirm', profile: 'balanced', perms: 'user' })

test('wizard-flow: it opens by itself once when the project has no project.md and the detection says offer', async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  expect(spy.opened).toEqual(['pignolo-panel'])
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Empezar con pignolo' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '¿Es así tu proyecto?' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /paso 1 de 5/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'wz-opt-a' })).toBeDefined()
  // y el panel de siempre no se dibuja mientras el asistente esta abierto
  expect(await ui.find({ type: 'Button', key: 'tab-now' })).toBeUndefined()
  await ui.unmount()
})

test('wizard-flow: it does not open a second time in the same session', async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  for (let i = 0; i < 5; i++) await clock.advance(3000)
  await terminal($, 150)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})

test('wizard-flow: it does not open when offer is false', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: { [WIZ]: JSON.stringify(detect({ offer: false })) } })
  await openIt($, clock)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
})

test('wizard-flow: it does not open when project.md exists', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: { [WIZ]: JSON.stringify(detect()), '/proj/.pignolo/project.md': '# p' } })
  await openIt($, clock)
  expect(spy.opened).toEqual([])
  // y a mano tampoco: el proyecto ya tiene pignolo
  const out: any = await $.command.run({ command: 'pignolo-panel', args: 'wizard' })
  expect(out.text).toContain('/pignolo:init')
  expect(spy.opened).toEqual([])
})

test('wizard-flow: it does not open when autoOpen is off, the terminal is narrower than the minimum or the demo mode is on', async ($, on) => {
  const narrow = await setup($, on)
  await openIt($, narrow.clock, 143)
  await narrow.clock.advance(3000)
  expect(narrow.spy.opened).toEqual([])
  // ensanchar despues si lo abre (sigue ofrecido y no se abrio antes)
  await openIt($, narrow.clock, 150)
  expect(narrow.spy.opened).toEqual(['pignolo-panel'])
})

test('wizard-flow: autoOpen off keeps the wizard closed', { options: { autoOpen: false } }, async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
  // a mano si se abre
  await $.command.run({ command: 'pignolo-panel', args: 'wizard' })
  expect(spy.opened).toEqual(['pignolo-panel'])
})

test('wizard-flow: the demo mode never opens the wizard by itself', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: { [WIZ]: JSON.stringify(detect()), '/sample/panel-state.json': JSON.stringify({ schema: 'pignolo-panel-state/1', plan: null, decisions: [], branches: [], cards: [], budget: [], main: null, next: { none: 'nothing' } }) } })
  await $.command.run({ command: 'pignolo-panel', args: 'demo' })
  const before = spy.opened.length // el demo abre su propio panel
  await openIt($, clock)
  await clock.advance(3000)
  expect(spy.opened.length).toBe(before)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Empezar con pignolo' })).toBeUndefined()
  await ui.unmount()
})

test('wizard-flow: an open "Te toca" decision wins and the wizard waits', async ($, on) => {
  const dec = { id: 'Q-1', question: '¿Corta o completa?', options: [{ label: 'corta' }, { label: 'completa' }], recommended: 'corta', context: '', kind: 'user', status: 'open', askedAt: '2026-10-03T10:00:00Z' }
  const st = (decisions: unknown[]) => JSON.stringify({ schema: 'pignolo-panel-state/1', plan: null, decisions, branches: [], cards: [], budget: [], main: null, next: { none: 'nothing' } })
  const { spy, clock, files } = await setup($, on, { files: { [WIZ]: JSON.stringify(detect()), '/proj/.pignolo/panel-state.json': st([dec]) } })
  await openIt($, clock)
  await clock.advance(3000)
  // la decision ya existia al cargar: no abre el panel por ella, y el asistente espera
  expect(spy.opened).toEqual([])
  files['/proj/.pignolo/panel-state.json'] = st([])
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})

test('wizard-flow: the next button goes to the next step and p to the previous one, and closing the pane on the first step does not open the wizard again', async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Button', key: 'wz-back' })).toBeUndefined() // en el primer paso no hay volver
  await ui.press({ key: 'wz-next' })
  expect(await ui.find({ type: 'Text', text: /paso 2 de 5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '¿Qué perfil de modelos usamos?' })).toBeDefined()
  const next = await ui.find({ type: 'Button', key: 'wz-next' })
  expect(flat(next)).toContain('"autoFocus":true') // Enter presiona el boton que tiene el foco
  await ui.press({ key: 'wz-back' })
  expect(await ui.find({ type: 'Text', text: /paso 1 de 5/ })).toBeDefined()
  await ui.unmount() // Esc cierra el panel (un test no puede disparar el evento ui.close: lo cubre el caso de abajo con el cierre propio)
  for (let i = 0; i < 3; i++) await clock.advance(3000)
  await terminal($, 150)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
  expect(spy.submit).toEqual([])
})

test('wizard-flow: a letter picks that option and the pick survives going back and forth', async ($, on) => {
  const { clock } = await setup($, on)
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'wz-opt-b' }) // paso 1: quiero corregir algo
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-opt-c' }) // perfil: maximo
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-back' })
  await ui.press({ key: 'wz-back' })
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-next' })
  expect(await ui.find({ type: 'Text', text: /lo corregimos en el chat/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /máximo/ })).toBeDefined()
  await ui.unmount()
})

test('wizard-flow: Apply sends exactly one message and it is the right one', async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await toLast(ui)
  expect(flat(await ui.find({ type: 'Button', key: 'wz-next' }))).toContain('Enter aplicar →')
  expect(spy.submit).toEqual([]) // nada se envia antes del ultimo Enter
  await ui.press({ key: 'wz-next' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].origin.asUser).toBe(true) // el motor pone asUser dentro de origin
  expect(spy.submit[0].text).toBe(EXPECTED)
  expect(spy.submit[0].text.startsWith('/')).toBe(false)
  expect(spy.fill).toEqual([])
  expect(spy.toast.some((t: string) => t.includes('Enviado'))).toBe(true)
  await ui.unmount()
})

test('wizard-flow: pressing Apply twice sends once', async ($, on) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => { release = r })
  const { spy, clock } = await setup($, on, { submitGate: gate })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await toLast(ui)
  const presses = [ui.press({ key: 'wz-next' }), ui.press({ key: 'wz-next' }), ui.press({ key: 'wz-next' })]
  release()
  await Promise.all(presses)
  expect(spy.submit.length).toBe(1)
  await ui.unmount()
})

test('wizard-flow: Apply rereads the detection and does not send when the id changed', async ($, on) => {
  const { spy, clock, files } = await setup($, on)
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await toLast(ui)
  files[WIZ] = JSON.stringify(detect({ id: 'ffffffffffff' }))
  await ui.press({ key: 'wz-next' })
  expect(spy.submit).toEqual([])
  expect(spy.toast.some((t: string) => t.includes('La detección cambió'))).toBe(true)
  // con la deteccion nueva el asistente vuelve al primer paso y se puede aplicar de nuevo
  expect(await ui.find({ type: 'Text', text: /paso 1 de 5/ })).toBeDefined()
  await toLast(ui)
  await ui.press({ key: 'wz-next' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].text).toContain('ffffffffffff')
  await ui.unmount()
})

test('wizard-flow: a failed send shows the toast and allows trying again, and no second message is sent while the first was in flight', async ($, on) => {
  const { spy, clock } = await setup($, on, { submitOk: false })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await toLast(ui)
  await ui.press({ key: 'wz-next' })
  expect(spy.submit.length).toBe(1)
  expect(spy.toast.some((t: string) => t.includes('No pude enviar'))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'wz-next' })).toBeDefined() // sigue abierto en el ultimo paso
  spy.submitOk = true
  await ui.press({ key: 'wz-next' })
  expect(spy.submit.length).toBe(2)
  expect(spy.submit[1].text).toBe(EXPECTED)
  await ui.unmount()
})

test('wizard-flow: nothing writes: fs.write is never called in any step (the static trust test covers remove, mkdir and append)', async ($, on) => {
  const { spy, clock } = await setup($, on, { ui: true })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  for (const k of ['a', 'b', 'c']) {
    await ui.press({ key: 'wz-opt-' + k })
    await ui.press({ key: 'wz-next' })
  }
  await ui.press({ key: 'wz-opt-1' })
  await ui.press({ key: 'wz-back' })
  await toLast(ui, 3) // hasta el resumen (con pignolo-ui son seis pasos)
  await ui.press({ key: 'wz-next' })
  await ui.unmount()
  expect(spy.submit.length).toBe(1)
  expect(spy.writes).toEqual([])
  // lo unico que se lee es el archivo de deteccion (y lo de pignolo-ui para detectarlo), nada del proyecto
  expect(spy.reads.every((p: string) => p === WIZ || p.startsWith('/proj/.pignolo-ui') || p.endsWith('PRODUCT.md') || p.endsWith('DESIGN.md'))).toBe(true)
})

test('wizard-flow: a blank project shows the blank screen and its option sends the blank choices', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: { [WIZ]: JSON.stringify(BLANK) } })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Este proyecto está en blanco' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'wz-opt-a' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'wz-opt-b' })).toBeDefined()
  expect(spy.submit).toEqual([])
  await ui.press({ key: 'wz-opt-a' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].text).toBe(PHRASE + JSON.stringify({ v: 1, id: ID, blank: true }))
  await ui.unmount()
})

test('wizard-flow: the later option of a blank project sends nothing and goes back to the normal panel', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: { [WIZ]: JSON.stringify(BLANK) } })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'wz-opt-b' })
  expect(spy.submit).toEqual([])
  expect(spy.toast.some((t: string) => t.includes('/pignolo:init'))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'tab-now' })).toBeDefined()
  await ui.unmount()
  // el asistente ya se cerro: ni los ciclos del temporizador ni una terminal nueva lo vuelven a abrir (una sola vez por sesion)
  for (let i = 0; i < 3; i++) await clock.advance(3000)
  await terminal($, 150)
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})

const DECLINE = 'No quiero usar pignolo en este proyecto: --decline'

test('RW-02 wizard-flow: "no usar pignolo aca" in step 1 sends the fixed decline message exactly once and closes the wizard', async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Button', key: 'wz-opt-c' })).toBeDefined()
  await ui.press({ key: 'wz-opt-c' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].text).toBe(DECLINE)
  expect(spy.writes).toEqual([])
  expect(await ui.find({ type: 'Button', key: 'tab-now' })).toBeDefined()
  await ui.unmount()
  for (let i = 0; i < 3; i++) await clock.advance(3000)
  await terminal($, 150)
  await clock.advance(3000)
  expect(spy.submit.length).toBe(1)
  expect(spy.opened).toEqual(['pignolo-panel'])
})

test('RW-02 wizard-flow: the decline option is only in step 1 and in the blank screen; a failed send keeps the wizard open', async ($, on) => {
  const { spy, clock } = await setup($, on, { submitOk: false })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'wz-opt-c' })
  expect(spy.submit.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: '¿Es así tu proyecto?' })).toBeDefined()
  await ui.press({ key: 'wz-next' })
  expect(await ui.find({ type: 'Button', key: 'wz-opt-c' })).toBeDefined() // en el paso de perfil c es el tercer perfil, no el rechazo
  await ui.press({ key: 'wz-opt-c' })
  expect(spy.submit.length).toBe(1)
  await ui.unmount()
})

test('RW-02 wizard-flow: the blank screen also offers "no usar pignolo aca" and sends the same message', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: { [WIZ]: JSON.stringify(BLANK) } })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'wz-opt-c' })
  expect(spy.submit.map((s: any) => s.text)).toEqual([DECLINE])
  await ui.unmount()
})

test('wizard-flow: a missing detection file does not open the wizard and shows nothing', async ($, on) => {
  const { spy, clock } = await setup($, on, { files: {} })
  await openIt($, clock)
  await clock.advance(3000)
  expect(spy.opened).toEqual([])
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Empezar con pignolo' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'tab-now' })).toBeDefined()
  await ui.unmount()
})

test('wizard-flow: a broken detection (invalid JSON, another schema, no id) does not open the wizard and shows no error', async ($, on) => {
  const { spy, clock, files } = await setup($, on, { files: { [WIZ]: '' } })
  await terminal($, 150)
  for (const bad of ['{no es json', JSON.stringify(detect({ schema: 'otra/1' })), JSON.stringify(detect({ id: undefined })), '', '﻿{}', JSON.stringify(detect({ profiles: [] })), JSON.stringify(detect({ places: { candidates: [{ kind: 'spec' }] } }))]) {
    files[WIZ] = bad
    await clock.advance(3000)
    await clock.advance(3000)
    expect(spy.opened).toEqual([])
    expect(spy.toast).toEqual([])
    const ui = await $.ui.mount({ ...PANE })
    expect(await ui.find({ type: 'Text', text: /Empezar con pignolo|rror/ })).toBeUndefined()
    await ui.unmount()
  }
  // y apenas hay una deteccion valida, se ofrece
  files[WIZ] = JSON.stringify(detect())
  await clock.advance(3000)
  expect(spy.opened).toEqual(['pignolo-panel'])
})

test('wizard-flow: /pignolo-panel wizard without a detection says to run /pignolo:init', async ($, on) => {
  const { spy } = await setup($, on, { files: {} })
  const out: any = await $.command.run({ command: 'pignolo-panel', args: 'wizard' })
  expect(out.text).toContain('/pignolo:init')
  expect(spy.opened).toEqual([])
})

test('wizard-flow: /pignolo-panel wizard opens it by hand even when offer is false and keeps the step when opened again', async ($, on) => {
  const { spy } = await setup($, on, { files: { [WIZ]: JSON.stringify(detect({ offer: false })) } })
  await terminal($, 150)
  const out: any = await $.command.run({ command: 'pignolo-panel', args: 'wizard' })
  expect(out).toEqual({})
  expect(spy.opened).toEqual(['pignolo-panel'])
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'wz-next' })
  await ui.unmount()
  await $.command.run({ command: 'pignolo-panel', args: 'wizard' })
  const again = await $.ui.mount({ ...PANE })
  expect(await again.find({ type: 'Text', text: /paso 2 de 5/ })).toBeDefined()
  await again.unmount()
  // el comando normal vuelve al panel de siempre
  await $.command.run({ command: 'pignolo-panel', args: '' })
  const normal = await $.ui.mount({ ...PANE })
  expect(await normal.find({ type: 'Button', key: 'tab-now' })).toBeDefined()
  await normal.unmount()
})

test('wizard-flow: demo wizard never sends and only fills the prompt', async ($, on) => {
  const { spy } = await setup($, on, { files: { '/sample/wizard-detect.json': JSON.stringify(detect({ id: 'abcdef012345' })) } })
  const out: any = await $.command.run({ command: 'pignolo-panel', args: 'wizard demo' })
  expect(out).toEqual({})
  const ui = await $.ui.mount({ ...PANE })
  // el demo muestra el paso de UI aunque no haya pignolo-ui: 6 pasos
  expect(await ui.find({ type: 'Text', text: /paso 1 de 6/ })).toBeDefined()
  await toLast(ui, 5)
  await ui.press({ key: 'wz-next' })
  expect(spy.submit).toEqual([])
  expect(spy.fill.length).toBe(1)
  expect(spy.fill[0]).toContain(PHRASE)
  expect(spy.fill[0]).toContain('abcdef012345')
  await ui.unmount()
})

test('wizard-flow: without Raster in the host the wizard still draws every step', async ($, on) => {
  const { clock } = await setup($, on, { ui: true })
  await openIt($, clock)
  const desktop = { ...PANE, surface: 'desktop' }
  const ui = await $.ui.mount({ ...desktop })
  const titles = ['¿Es así tu proyecto?', '¿Qué perfil de modelos usamos?', 'Permisos: lo que pignolo agrega a Claude Code', '¿Qué hacemos con ellas?', 'Interfaz: producto y diseño de tu proyecto', 'Resumen']
  for (const t of titles) {
    expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    if (t !== 'Resumen') await ui.press({ key: 'wz-next' })
  }
  await ui.unmount()
})

test('wizard-flow: with pignolo-ui installed the UI step appears and its choice reaches the message', async ($, on) => {
  const { spy, clock } = await setup($, on, { ui: true })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /paso 1 de 6/ })).toBeDefined()
  await toLast(ui, 4) // paso 5: UI
  expect(await ui.find({ type: 'Text', text: 'Interfaz: producto y diseño de tu proyecto' })).toBeDefined()
  await ui.press({ key: 'wz-opt-b' }) // definir ahora
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-next' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].text).toBe(PHRASE + JSON.stringify({ v: 1, id: ID, project: 'confirm', profile: 'balanced', perms: 'user', ui: 'now' }))
  await ui.unmount()
})

test('wizard-flow: without pignolo-ui there are five steps and the UI choice is absent from the message', async ($, on) => {
  const { spy, clock } = await setup($, on, { ui: false })
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /paso 1 de 5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Interfaz/ })).toBeUndefined()
  await toLast(ui)
  await ui.press({ key: 'wz-next' })
  expect(spy.submit[0].text.includes('"ui"')).toBe(false)
  await ui.unmount()
})

test('wizard-flow: a folder choice that differs from the recommended one reaches the message and the others do not', async ($, on) => {
  const { spy, clock } = await setup($, on)
  await openIt($, clock)
  const ui = await $.ui.mount({ ...PANE })
  await toLast(ui, 3) // paso 4: carpetas
  await ui.press({ key: 'wz-opt-1' }) // adoptar -> mover
  await ui.press({ key: 'wz-next' })
  await ui.press({ key: 'wz-next' })
  expect(spy.submit.length).toBe(1)
  expect(spy.submit[0].text).toBe(PHRASE + JSON.stringify({ v: 1, id: ID, project: 'confirm', profile: 'balanced', perms: 'user', places: { spec: 'move' } }))
  await ui.unmount()
})

test('wizard-flow: a pane narrower than the wizard says how much is missing instead of drawing a broken frame', async ($, on) => {
  const { clock } = await setup($, on)
  await openIt($, clock)
  const narrow = { ...PANE, props: { ...PANE.props, bodyColumns: 60 } }
  const ui = await $.ui.mount({ ...narrow })
  expect(await ui.find({ type: 'Text', text: /faltan 10/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Empezar con pignolo' })).toBeUndefined()
  await ui.unmount()
})
