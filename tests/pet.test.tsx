import type { On, SessionMessage, SessionUsage } from 'claude-code'
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

// The band is a Box of two Svg drawings, the stage and the meter; these
// read one's props off the drawn tree.
type Drawn = { children?: { props?: Record<string, unknown> }[] }
const first = (tree: unknown) => (tree as Drawn).children?.[0]?.props
const second = (tree: unknown) => (tree as Drawn).children?.[1]?.props

// What the session answers for its usage: 74k tokens of a 200k model
// window, measured against `compactionWindow` when the call asked for the
// breakdown and one is set.
function usageOf(compactionWindow: number | undefined): SessionUsage {
  return {
    startedAt: 0,
    context: {
      tokens: 74000,
      window: 200000,
      percent: 37,
      ...(compactionWindow === undefined
        ? {}
        : {
            breakdown: {
              categories: [],
              totalTokens: 74000,
              maxTokens: compactionWindow,
              rawMaxTokens: compactionWindow,
              autocompactSource: 'settings',
              percentage: Math.round((100 * 74000) / compactionWindow),
              gridRows: [],
              model: 'test',
              memoryFiles: [],
              mcpTools: [],
              agents: [],
              isAutoCompactEnabled: true,
              apiUsage: null,
            },
          }),
    },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 41 },
      { kind: 'seven_day', percentUsed: 43 },
    ],
  }
}

// `compactionWindow` is the smaller window the session measures its fill
// against when one is set; absent, the fill is over the model's window.
function engine(on: On, compactionWindow?: number) {
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
  on('session.usage', (_, e) => ({ value: usageOf(e.breakdown !== undefined ? compactionWindow : undefined) }))
  on('agent.list', () => ({ value: [] }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
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
  // The context meter is a drawing of its own, at the fill the session reports.
  const meter = second(await desktop.drawn())
  expect(String(meter?.source)).toContain('>37%<')
  await desktop.unmount()
})

test('the meter measures the fill against the compaction window', async ($, on) => {
  engine(on, 100000)
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  // 74k tokens over a 100k compaction window, not over the model's 200k.
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(String(second(await desktop.drawn())?.source)).toContain('>74%<')
  await desktop.unmount()

  const status = await $.command.run({ command: 'pet', args: 'status', ...TYPED })
  expect(String((status as { text?: string }).text)).toContain('74% of 100k (compaction window)')
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
    durationMs: 60000,
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

test('the options place and size the pet', { options: { size: '4', side: 'right', pile: false } }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const art = { props: second(await ui.drawn()) ?? {} }
  // Four pixels per art pixel: the strip is 14 rows of 4 plus 4.
  expect(art?.props.height).toBe(60)
  // No pile, so no 100% line; the battery and the week ride along with the meter.
  expect(String(art?.props.source)).not.toContain('>100%<')
  // On the right side the meter is the first drawing and the stage the second.
  const meter = first(await ui.drawn())
  expect(String(meter?.source)).toContain('>41%<')
  expect(String(meter?.source)).toContain('>43%<')
  await ui.unmount()
})

test('a failed tool call puzzles the pet, a question holds its attention', async ($, on) => {
  engine(on)
  on('tool.call', (_, e) => (e.tool === 'Bash' ? { result: {}, isError: true, text: 'boom' } : { result: {} }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  await $.tool.call({ tool: 'Bash', command: 'false' })
  const puzzled = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(String((await puzzled.find({ type: 'Svg' }))?.props.alt)).toContain('puzzled')
  await puzzled.unmount()
})

test('mail to or from another session shows the envelope', async ($, on) => {
  engine(on)
  const moods: unknown[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'mood') moods.push(e.value)

    return next(e)
  })
  on('session.send', () => ({ isDelivered: true }))
  on('session.receive', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  await $.session.send({ to: 'other', text: 'hello', origin: { kind: 'plugin', name: 'test' } })
  await $.session.receive({ origin: { kind: 'peer' }, text: 'hi back' })
  expect(moods).toEqual(['sending', 'receiving'])
})
