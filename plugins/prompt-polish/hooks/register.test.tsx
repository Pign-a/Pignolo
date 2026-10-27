import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'prompt-polish',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 5, columns: 80, scroll: { offset: 0, bodyRows: 5 } },
} as const

test('reescribe el cuadro con el prompt mejorado y no deja avisos', async ($, on) => {
  const fills: string[] = []
  on('prompt.read', () => ({ value: { text: 'eh bueno quiero X, X digo', cursor: 0 } }))
  on('model.complete', (_, e) => {
    expect(String(e.prompt)).toContain('quiero X')
    return { value: { isAnswered: true, text: '## Objetivo\nHacer X', usage: { input_tokens: 1, output_tokens: 1 } } }
  })
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'polish' })

  expect(fills).toEqual(['## Objetivo\nHacer X'])
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})

test('con el cuadro vacío avisa y no llama al modelo', async ($, on) => {
  let calls = 0
  on('prompt.read', () => ({ value: { text: '  ', cursor: 0 } }))
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: false, reason: 'empty-reply' } }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'polish' })

  expect(calls).toBe(0)
  expect((await ui.find({ type: 'Text', text: /Escribí o dictá/ }))?.text).toContain('Escribí o dictá')
  await ui.unmount()
})

test('Compactar manda las instrucciones con el borrador y muestra el resultado', async ($, on) => {
  const sent: string[] = []
  on('prompt.read', () => ({ value: { text: 'seguir con el login', cursor: 0 } }))
  on('session.compact', (_, e) => {
    sent.push(String(e.instructions))
    return { messages: [{ role: 'user', text: 'resumen', toolUses: [] }], tokensBefore: 84000, tokensAfter: 12000 }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: 'session', value: 'compact' })

  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain('exact paths')
  expect(sent[0]).toContain('seguir con el login')
  expect((await ui.find({ type: 'Text', text: /Compactado/ }))?.text).toContain('84k a 12k')
  await ui.unmount()
})

test('si la compactación se rechaza avisa en la banda', async ($, on) => {
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('session.compact', () => ({ skip: 'hay un turno en curso' }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.select({ key: 'session', value: 'compact' })

  expect((await ui.find({ type: 'Text', text: /No se compactó/ }))?.text).toContain('hay un turno en curso')
  await ui.unmount()
})

test('los estilos son un menú y cada uno manda su propia instrucción al modelo', async ($, on) => {
  const systems: string[] = []
  on('prompt.read', () => ({ value: { text: 'se rompe el login', cursor: 0 } }))
  on('model.complete', (_, e) => {
    systems.push(String(e.system))
    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 1, output_tokens: 1 } } }
  })
  on('prompt.fill', () => ({ isFilled: true }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'polish' })
  await ui.select({ key: 'style', value: 'plan' })
  await ui.select({ key: 'style', value: 'bug' })

  expect(systems).toHaveLength(3)
  expect(systems[0]).not.toContain('Style:')
  expect(systems[1]).toContain('Style: PLAN')
  expect(systems[2]).toContain('Style: BUG')
  await ui.unmount()
})
