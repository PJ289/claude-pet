import type { On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'pixel-pet',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 80 },
} as const

function engine(on: On) {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  mock.clock(on)
  mock.store(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('command.register', () => ({ value: { command: 'pet' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('command.run', () => ({}))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 74000, window: 200000, percent: 37 }, rateLimits: [] },
  }))
}

test('the pet draws on the terminal and on the desktop', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const raster = await terminal.find({ type: 'Raster', key: 'pet' })
  expect(raster?.props.columns).toBe(60)
  expect(raster?.props.rows).toBe(6)
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const art = await desktop.find({ type: 'Svg' })
  expect(String(art?.props.source)).toContain('<svg')
  expect(String(art?.props.alt)).toContain('idle')
  // The context meter rides along, at the fill the session reports.
  expect(String(art?.props.source)).toContain('>37%<')
  await desktop.unmount()
})

test('the pet works while a turn runs and cheers when it ends', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  const working = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, isWorking: true },
    surface: 'desktop',
  })
  expect(String((await working.find({ type: 'Svg' }))?.props.alt)).toContain('working')
  await working.unmount()

  await $.turn.complete({
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  const happy = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(String((await happy.find({ type: 'Svg' }))?.props.alt)).toContain('happy')
  await happy.unmount()
})

test('/pet hides and shows the pet', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  await $.command.run({ command: 'pet', args: 'hide', ...TYPED })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeUndefined()
    await ui.unmount()
  }

  await $.command.run({ command: 'pet', args: 'show', ...TYPED })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.unmount()
})

test('the pet stomps the pile while the conversation compacts', async ($, on) => {
  engine(on)
  const summary: SessionMessage = { role: 'user', text: 'The conversation so far, in short.', toolUses: [] }
  // Beneath the plugin, the engine's own compaction; every mood the pet
  // writes on its way is kept in order.
  const moods: unknown[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'mood') moods.push(e.value)

    return next(e)
  })
  on('session.compact', (_, e) => ({ messages: e.messages }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  await $.session.compact({ trigger: 'manual', messages: [summary] })
  expect(moods).toEqual(['compacting', 'idle'])
})
