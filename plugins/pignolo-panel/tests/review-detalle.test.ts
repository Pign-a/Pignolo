import { expect, mock, test } from 'claude-code/testing'

// Revisión del panel 0.4.0 (detalle por agente). Cada test falla sobre f153447 y dice su causa en una línea.
const PANE = {
  plugin: 'pignolo-panel', component: 'Pane', requestId: 'pignolo-panel', surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: { title: 'pignolo', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const
const SHORT = { ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 10 } } } as const
const STATE = { schema: 'pignolo-panel-state/1', plan: null, decisions: [], branches: [], cards: [], budget: [], main: null, next: { none: 'nothing' } }

function base(on: any) {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', ($: any, e: any) => ({ value: /panel-state\.json$|project\.md$/.test(String(e.path)) }))
  on('fs.read', ($: any, e: any) => ({ value: String(e.path).endsWith('panel-state.json') ? JSON.stringify(STATE) : '# p' }))
  on('session.usage', () => ({ value: { context: {}, rateLimits: [], cost: { usd: 0 } } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn'] }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', ($: any, e: any) => ({ model: 'haiku', agentId: e.tool_use_id.replace('tu_', '') }))
  return clock
}
const spawn = ($: any, id: string, description: string, subagentType = 'general-purpose') =>
  $.agent.spawn({
    tool_use_id: 'tu_' + id, prompt: 'x', description, subagentType,
    provider: { plugin: 'engine', tier: 'core' }, model: 'haiku', parentModel: 'sonnet', background: false, fork: false,
  })
const walk = (tree: any, pred: (n: any) => boolean, out: any[] = []) => {
  if (tree && typeof tree === 'object') {
    if (pred(tree)) out.push(tree)
    for (const c of tree.children ?? []) walk(c, pred, out)
  }
  return out
}
// todo el texto que dibuja un subárbol
const drawnText = (tree: any): string => (typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? (tree.children ?? []).map(drawnText).join('') : '')
const BAD = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/

// RD-01. Causa: agentLine y agentShort dibujan `a.description` y `a.type` (texto que escribe el modelo al lanzar el agente) tal cual,
// sin pasar por oneLine/clean como sí pasan el nombre y el objetivo de la herramienta: ESC, saltos de línea e invisibles llegan a la terminal.
const HOSTILE = 'tarea\u001b[2J\u001b[31m roja\nsegunda linea\u202e\u200b\u0007'
test('RD-01 (holgado): la descripción y el tipo de un agente se dibujan en una línea, sin control, escapes ni invisibles', async ($, on) => {
  base(on)
  await spawn($, 'a1', HOSTILE, 'tipo\u001b]0;titulo\u0007\nraro')
  const ui = await $.ui.mount({ ...PANE })
  const row = walk(await ui.drawn(), (n) => n.props?.key === 'ag-a1')[0]
  expect(row).toBeDefined()
  expect(drawnText(row)).toContain('tarea')
  expect(drawnText(row)).not.toMatch(BAD)
  await ui.unmount()
})
test('RD-01 (compacto): la línea corta de un agente tampoco dibuja control, escapes ni invisibles de la descripción', async ($, on) => {
  base(on)
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) await spawn($, id, HOSTILE)
  const ui = await $.ui.mount({ ...SHORT })
  const rows = walk(await ui.drawn(), (n) => /^ag-a\d$/.test(n.props?.key ?? ''))
  expect(rows.length).toBeGreaterThan(0)
  for (const r of rows) expect(drawnText(r)).not.toMatch(BAD)
  await ui.unmount()
})
