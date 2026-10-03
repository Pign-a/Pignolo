import { expect, test } from 'claude-code/testing'
import { readWizardDetect, stepsFor, initialState, move } from '../hooks/wizard-model.js'
import { WIDTH, frame, progressBar, optionRows, stepView, topBorder, wizardTree, len, fit } from '../hooks/wizard-view.js'

// Criterio visual del autor como test: marco redondeado, todo del mismo ancho, columnas alineadas, la recomendada marcada, el pie con las teclas.
// El mockup aprobado (paso 2 de 5) esta guardado en tests/fixtures/mockup-paso-2.txt y lo compara tests/panel-wizard-mockup.test.js
// (un test del motor no puede leer archivos); si el autor cambia el mockup, cambia el fixture.

const SAMPLE = {
  schema: 'pignolo-wizard-detect/1',
  id: '5d3f0a91c2e7',
  blank: false,
  project: { type: 'code-tested', stacks: ['node'], tests: { cmd: 'npm run test', state: 'declared' }, main: 'main' },
  profiles: [
    { id: 'balanced', label: 'balanceado', line: 'sonnet para construir, opus revisa', recommended: true },
    { id: 'economy', label: 'económico', line: 'sonnet en lo seguro, el más barato', recommended: false },
    { id: 'max', label: 'máximo', line: 'opus casi en todo, el más caro', recommended: false },
  ],
  permissions: { groups: [{ id: 'blocks', line: 'los comandos de git que pierden trabajo (reset --hard, push -f…)' }, { id: 'asks', line: 'antes de borrar ramas y etiquetas' }, { id: 'free', line: 'push y merge normales' }] },
  places: { candidates: [
    { kind: 'spec', from: 'diseno/', to: 'docs/specs/', decision: 'adopt', options: ['adopt', 'move', 'leave'], moves: [{ from: 'diseno/', to: 'docs/specs/' }], note: null },
    { kind: 'plan', from: 'plans/', to: 'docs/plans/', decision: 'adopt', options: ['adopt', 'move', 'leave'], moves: [], note: null },
  ] },
  offer: true,
}
const read = (o: unknown) => {
  const r = readWizardDetect(JSON.stringify(o))
  if (!r.ok) throw new Error('no leyo: ' + r.reason)
  return r.data
}
const BLANK = { schema: 'pignolo-wizard-detect/1', id: '5d3f0a91c2e7', blank: true, project: null, profiles: [], permissions: { groups: [] }, places: { candidates: [] } }
const WEIRD = {
  ...SAMPLE,
  project: { type: 'code-tested', stacks: ['node', 'python'], tests: { cmd: 'npm run "tést" {a} ' + 'x'.repeat(100), state: 'declared' }, main: 'rama-ñandú' },
  profiles: [{ id: 'balanced', label: 'balanceado con un nombre larguísimo de verdad', line: 'una descripción tan larga que no entra en la columna tres de ninguna manera', recommended: true }, SAMPLE.profiles[1], SAMPLE.profiles[2]],
  places: { candidates: [{ kind: 'research', from: 'investigación-muy-larga/con/subcarpetas/profundas/', to: 'docs/research/', decision: 'adopt', options: ['adopt', 'leave'], moves: [], note: null }] },
}

// Todas las pantallas: cada dato, con y sin pignolo-ui, cada paso, y la de blanco.
function screens() {
  const out: { name: string; view: any; step: string; state: any; data: any }[] = []
  for (const [dn, raw] of [['sample', SAMPLE], ['weird', WEIRD], ['blank', BLANK], ['sin carpetas', { ...SAMPLE, places: { candidates: [] } }]] as const) {
    const data = read(raw)
    for (const uiInstalled of [false, true]) {
      const steps = stepsFor({ data, uiInstalled })
      let s: any = initialState(steps, data)
      for (let i = 0; i < steps.length; i++) {
        out.push({ name: `${dn} ui=${uiInstalled} ${steps[i]}`, step: steps[i], state: s, data, view: stepView({ step: steps[i], state: s, data, uiInstalled }) })
        s = move(s, 'next', undefined, data)
      }
    }
  }
  return out
}

test('wizard-view: the frame has rounded corners on all four corners and a straight line between them', async () => {
  const lines = frame({ title: 'Titulo', right: 'paso 1 de 3', body: ['uno', 'dos'], footerL: 'izq', footerR: 'der' })
  const first = [...lines[0]]
  const last = [...lines[lines.length - 1]]
  expect(first[0]).toBe('╭')
  expect(first[first.length - 1]).toBe('╮')
  expect(last[0]).toBe('╰')
  expect(last[last.length - 1]).toBe('╯')
  expect(last.slice(1, -1).every((c) => c === '─')).toBe(true)
  for (const l of lines.slice(1, -1)) {
    expect([...l][0]).toBe('│')
    expect([...l][len(l) - 1]).toBe('│')
  }
  expect(first.slice(1, 3).join('')).toBe('─ ')
  // y ninguna esquina cuadrada en ningun paso
  for (const s of screens()) {
    expect(/[┌┐└┘]/.test(s.view.lines.join('\n'))).toBe(false)
    expect(s.view.lines[0][0]).toBe('╭')
    expect(s.view.lines[s.view.lines.length - 1][0]).toBe('╰')
  }
})

test('wizard-view: every line of every step has exactly 70 characters', async () => {
  const all = screens()
  expect(all.length >= 30).toBe(true)
  expect(WIDTH).toBe(70)
  for (const s of all) for (const l of s.view.lines) expect([s.name, len(l)]).toEqual([s.name, 70])
})

test('wizard-view: the title is on the top border on the left and the step counter on the right and both fit', async () => {
  const t = topBorder('Empezar con pignolo', 'paso 2 de 5')
  expect(t.text.startsWith('╭─ Empezar con pignolo ─')).toBe(true)
  expect(t.text.endsWith(' paso 2 de 5 ─╮')).toBe(true)
  expect(len(t.text)).toBe(70)
  const long = topBorder('x'.repeat(100), 'paso 2 de 5')
  expect(len(long.text)).toBe(70)
  expect(long.text.includes('…')).toBe(true)
  expect(long.text.endsWith(' paso 2 de 5 ─╮')).toBe(true)
  expect(len(topBorder('Empezar con pignolo', '').text)).toBe(70)
  const absurd = topBorder('y'.repeat(100), 'z'.repeat(80))
  expect(len(absurd.text)).toBe(70)
  for (const s of screens()) {
    if (s.step === 'blank') continue
    expect(s.view.lines[0].includes(' paso ' + (s.state.i + 1) + ' de ' + s.state.steps.length + ' ─╮')).toBe(true)
  }
})

test('wizard-view: the progress bar has one glyph per step and as many filled as the current step', async () => {
  expect(progressBar(1, 5)).toBe('▰▰▱▱▱')
  expect(progressBar(0, 6)).toBe('▰▱▱▱▱▱')
  expect(progressBar(5, 6)).toBe('▰▰▰▰▰▰')
  for (const s of screens()) {
    if (s.step === 'blank') continue
    const bar = [...s.view.lines[1]].filter((c) => c === '▰' || c === '▱')
    expect(bar.length).toBe(s.state.steps.length)
    expect(bar.filter((c) => c === '▰').length).toBe(s.state.i + 1)
  }
})

// Las filas de opcion de una pantalla: borde, espacio, sangria, letra o numero, y dos espacios.
function optionLines(view: any) {
  return view.lines.filter((l: string) => /^│ {2}[a-c1-9] {2}\S/.test(l))
}

test('wizard-view: option columns are aligned: the letter, the second column and the third column start at the same position in every row', async () => {
  let rows = 0
  for (const s of screens()) {
    for (const l of optionLines(s.view)) {
      const c = [...l]
      expect([s.name, c[3] !== ' ']).toEqual([s.name, true]) // la letra, en la columna 3
      expect(c[4] + c[5]).toBe('  ')
      expect(c[6] !== ' ').toBe(true) // la columna 2 empieza en la 6
      expect(c[33]).toBe(' ') // siempre queda un espacio antes de la columna 3
      rows += 1
    }
  }
  expect(rows >= 20).toBe(true)
  // a mano: textos cortos, largos y con tildes
  const r = optionRows([{ letter: 'a', label: 'sí', text: 'ñandú', recommended: true }, { letter: 'b', label: 'x'.repeat(60), text: 'y'.repeat(80), recommended: false }, { letter: 'c', label: 'económico', text: 'tilde á é í', recommended: false }])
  for (const x of r) expect(len(x)).toBe(66)
  expect(r.map((x: string) => [...x][1])).toEqual(['a', 'b', 'c'])
  expect(r.map((x: string) => [...x][4] !== ' ')).toEqual([true, true, true]) // columna 2 (dentro del contenido: indice 4)
  expect(r.map((x: string) => [...x][31])).toEqual([' ', ' ', ' '])
})

test('wizard-view: a long option text is cut with an ellipsis and the line keeps its width', async () => {
  const r = optionRows([{ letter: 'a', label: 'x'.repeat(60), text: 'y'.repeat(80), recommended: true }])[0]
  expect(len(r)).toBe(66)
  expect(r.includes('…')).toBe(true)
  expect(fit('abcdef', 4)).toBe('abc…')
  expect(fit('abc', 4)).toBe('abc')
  expect(fit('abcdef', 1)).toBe('…')
  const weird = screens().filter((s) => s.name.startsWith('weird'))
  expect(weird.some((s) => s.view.lines.some((l: string) => l.includes('…')))).toBe(true)
  for (const s of weird) for (const l of s.view.lines) expect(len(l)).toBe(70)
})

test('wizard-view: marking the selected row does not change the position of any column', async () => {
  const data = read(SAMPLE)
  const steps = stepsFor({ data, uiInstalled: false })
  const base: any = { ...initialState(steps, data), i: 1 }
  const views = ['a', 'b', 'c'].map((l) => stepView({ step: 'profile', state: move(base, 'pick', l, data), data, uiInstalled: false }))
  // el texto es el mismo sea cual sea la fila elegida: la marca es de estilo, no de caracteres
  expect(views[1].lines).toEqual(views[0].lines)
  expect(views[2].lines).toEqual(views[0].lines)
  expect(views.map((v: any) => v.rows.filter((r: any) => r.type === 'option' && r.picked).map((r: any) => r.letter))).toEqual([['a'], ['b'], ['c']])
  // lo mismo en el paso de permisos
  const perms = ['a', 'b', 'c'].map((l) => stepView({ step: 'perms', state: move({ ...base, i: 2 }, 'pick', l, data), data, uiInstalled: false }).lines)
  expect(perms[1]).toEqual(perms[0])
})

test('wizard-view: the footer shows the shortcuts: back with p on the left and next with Enter on the right, Esc closes, and the first step has no back', async () => {
  const first = screens().find((s) => s.name === 'sample ui=false project')
  const second = screens().find((s) => s.name === 'sample ui=false profile')
  const footer = (v: any) => v.lines[v.lines.length - 2]
  expect(footer(first!.view)).toContain('Esc cierra')
  expect(footer(first!.view)).not.toContain('atrás')
  expect(footer(first!.view)).toContain('Enter siguiente →')
  expect(footer(second!.view)).toContain('← p atrás')
  expect(footer(second!.view)).toContain('Esc cierra')
  expect(footer(second!.view)).toContain('Enter siguiente →')
  expect(first!.view.back).toBe(false)
  expect(second!.view.back).toBe(true)
  // la tecla de seguir cae siempre en la misma columna
  const col = (v: any) => [...footer(v)].indexOf('E', 20)
  expect(col(first!.view)).toBe(col(second!.view))
})

test('wizard-view: the last step footer says Enter apply instead of next', async () => {
  const last = screens().filter((s) => s.view.last && s.step === 'summary')
  expect(last.length >= 6).toBe(true)
  for (const s of last) {
    const f = s.view.lines[s.view.lines.length - 2]
    expect(f.includes('Enter aplicar →')).toBe(true)
    expect(f.includes('siguiente')).toBe(false)
  }
})

test('wizard-view: the recommended option says recommended in its second column and no other option does', async () => {
  for (const s of screens()) {
    if (s.step === 'summary') continue
    const opts = optionLines(s.view)
    if (!opts.length) continue
    const rec = opts.filter((l: string) => l.includes('recomendado'))
    // en el paso de carpetas es recomendada la decision por defecto de cada fila; en los demas, una sola
    if (s.step !== 'places') expect([s.name, rec.length]).toEqual([s.name, 1])
    for (const l of rec) {
      const at = [...l].join('').indexOf('recomendado')
      expect(at > 6 && at < 34).toBe(true) // dentro de la columna 2
    }
  }
  // en el paso de perfil la recomendada es la que marca el resumen de la deteccion, no la primera por posicion
  const data = read({ ...SAMPLE, profiles: [{ ...SAMPLE.profiles[0], recommended: false }, { ...SAMPLE.profiles[1], recommended: true }, SAMPLE.profiles[2]] })
  const st: any = { ...initialState(stepsFor({ data, uiInstalled: false }), data), i: 1 }
  const v = stepView({ step: 'profile', state: st, data, uiInstalled: false })
  expect(optionLines(v).map((l: string) => l.includes('recomendado'))).toEqual([false, true, false])
})

// Un $ minimo: resolve devuelve constructores que arman objetos planos; anota que elementos se pidieron.
function fakeDollar() {
  const asked: string[] = []
  const make = (type: string) => (props: any = {}) => ({ type, props, children: props.children || [] })
  const $: any = { ui: { resolve: () => new Proxy({}, { get: (_t, name: string) => { asked.push(name); return make(name) } }) } }
  return { $, asked }
}
const walk = (n: any, f: (n: any) => void) => {
  if (n && typeof n === 'object') {
    f(n)
    for (const c of n.children || []) walk(c, f)
  }
}

test('wizard-view: the tree has no Raster element', async () => {
  for (const s of screens()) {
    const { $, asked } = fakeDollar()
    const calls: string[] = []
    const tree = wizardTree($, {}, s.view, { color: 'claude', pick: (l: string) => calls.push('pick' + l), next: () => calls.push('next'), back: () => calls.push('back') })
    const types: string[] = []
    walk(tree, (n) => types.push(n.type))
    expect([s.name, types.includes('Raster'), asked.includes('Raster')]).toEqual([s.name, false, false])
    expect(types.every((t) => ['Box', 'Text', 'Button'].includes(t))).toBe(true)
    // cada opcion del paso es un Button con su letra como hotkey, y el boton de seguir tiene el foco para que Enter lo presione
    const buttons: any[] = []
    walk(tree, (n) => { if (n.type === 'Button') buttons.push(n) })
    expect(buttons.filter((b) => b.props.key.startsWith('wz-opt-')).map((b) => b.props.hotkey)).toEqual(s.view.rows.filter((r: any) => r.type === 'option').map((r: any) => r.letter))
    const next = buttons.find((b) => b.props.key === 'wz-next')
    expect(next.props.autoFocus).toBe(true)
    expect(next.props.label).toBe(s.view.footerR)
    expect(buttons.some((b) => b.props.key === 'wz-back')).toBe(s.view.back)
    const back = buttons.find((b) => b.props.key === 'wz-back')
    if (back) expect(back.props.hotkey).toBe('p')
    // un Button de opcion, el de seguir y el de volver llaman a su manejador
    const opt = buttons.find((b) => b.props.key.startsWith('wz-opt-'))
    if (opt) opt.props.onPress()
    next.props.onPress()
    if (back) back.props.onPress()
    expect(calls.includes('next')).toBe(true)
    expect(calls.includes('back')).toBe(s.view.back)
    expect(calls.some((c) => c.startsWith('pick'))).toBe(Boolean(opt))
  }
})

test('wizard-view: the project step shows language, tests and main branch from the detection and says "sin declarar" when the tests are missing', async () => {
  const data = read(SAMPLE)
  const st: any = initialState(stepsFor({ data, uiInstalled: false }), data)
  const text = stepView({ step: 'project', state: st, data, uiInstalled: false }).lines.join('\n')
  expect(/Lenguaje\s+Node/.test(text)).toBe(true)
  expect(/Tests\s+npm run test/.test(text)).toBe(true)
  expect(/Rama principal\s+main/.test(text)).toBe(true)
  const none = read({ ...SAMPLE, project: { type: 'code-untested', stacks: ['python'], tests: { cmd: null, state: 'none' }, main: null } })
  const st2: any = initialState(stepsFor({ data: none, uiInstalled: false }), none)
  const v2 = stepView({ step: 'project', state: st2, data: none, uiInstalled: false }).lines.join('\n')
  expect(/Tests\s+sin declarar/.test(v2)).toBe(true)
  expect(/Lenguaje\s+Python/.test(v2)).toBe(true)
  expect(/Rama principal\s+sin detectar/.test(v2)).toBe(true)
})

test('wizard-view: the blank screen says the project is blank and offers the folder structure or later', async () => {
  const data = read(BLANK)
  const steps = stepsFor({ data, uiInstalled: true })
  const st: any = initialState(steps, data)
  const v = stepView({ step: 'blank', state: st, data, uiInstalled: true })
  const text = v.lines.join('\n')
  const flat = v.lines.map((l: string) => l.replace(/[│╭╮╰╯─]/g, ' ')).join(' ').replace(/\s+/g, ' ')
  expect(flat.includes('Este proyecto está en blanco')).toBe(true)
  expect(flat.includes('No hay código ni configuración todavía')).toBe(true)
  expect(flat.includes('Solo puedo crear la estructura de carpetas')).toBe(true)
  expect(optionLines(v).length).toBe(2)
  expect(/ a {2}estructura/.test(text)).toBe(true)
  expect(/ b {2}más tarde/.test(text)).toBe(true)
  expect(text.includes('paso')).toBe(false) // sin contador ni barra: es una sola pantalla
  expect(v.lines[v.lines.length - 2].includes('Enter crear →')).toBe(true)
})

test('wizard-view: no line has a hidden character or a line break', async () => {
  const hidden = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u
  const dirty = read({ ...SAMPLE, project: { type: 'x', stacks: ['no' + String.fromCharCode(0x200b) + 'de'], tests: { cmd: 'npm' + String.fromCharCode(7) + ' test\nrm -rf', state: 'declared' }, main: 'ma' + String.fromCharCode(0x202e) + 'in' } })
  const steps = stepsFor({ data: dirty, uiInstalled: true })
  const all = [...screens().map((s) => s.view)]
  let s: any = initialState(steps, dirty)
  for (const step of steps) {
    all.push(stepView({ step, state: s, data: dirty, uiInstalled: true }))
    s = move(s, 'next', undefined, dirty)
  }
  for (const v of all) for (const l of v.lines) {
    expect(hidden.test(l)).toBe(false)
    expect(len(l)).toBe(70)
  }
})
