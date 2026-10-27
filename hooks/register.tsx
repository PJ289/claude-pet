import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextUsage, Mood } from '../types'
import { DEFAULT_VIEW, stripHeight, svg, widthFor } from './desktop'
import type { View } from './desktop'
import { COLUMNS } from './frames'
import { ROWS, cells, newWalker, step } from './terminal'
import type { Walker } from './terminal'

const mood = atom({ plugin: 'pixel-pet', key: 'mood' } as const, 'idle')
const isHidden = atom({ plugin: 'pixel-pet', key: 'isHidden' } as const, false)
const context = atom({ plugin: 'pixel-pet', key: 'context' } as const, null)
const activity = atom({ plugin: 'pixel-pet', key: 'activity' } as const, null)
const agents = atom({ plugin: 'pixel-pet', key: 'agents' } as const, 0)
const isNight = atom({ plugin: 'pixel-pet', key: 'isNight' } as const, false)

const MOODS: Mood[] = ['idle', 'working', 'intense', 'attention', 'puzzled', 'nod', 'happy', 'elated', 'dizzy', 'sleeping', 'compacting']
const BUSY: Mood[] = ['working', 'intense', 'attention', 'puzzled']

const TICK_MS = 150
const NOD_MS = 1600
const HAPPY_MS = 4200
const ELATED_MS = 6000
const DIZZY_MS = 2400
const PUZZLED_MS = 2200
const SHORT_TURN_MS = 15 * 1000
const LONG_TURN_MS = 5 * 60 * 1000
const INTENSE_AFTER_MS = 60 * 1000
const SLEEP_AFTER_MS = 5 * 60 * 1000
const DEMO_STEP_MS = 8000
const INTRO_MS = 1900

type Timer = { cancel: () => void }

// What the module keeps between events; a reload starts it over.
const pet: {
  shown: Mood
  lastActivity: number
  workStart: number
  // `/pet mood` holds a mood against the automatic changes; `/pet demo` too.
  isPinned: boolean
  timers: { calm?: Timer; intense?: Timer; puzzled?: Timer; demo?: Timer }
  // The terminal band's Raster, repainted on a timer while it is mounted.
  band: { requestId: string; columns: number } | null
  walker: Walker | null
  // The last time the band was asked to draw, for `/pet status`.
  lastDraw: { surface: string; at: number } | null
  view: Pick<View, 'scale' | 'side' | 'hasMeter' | 'hasPile'>
} = {
  shown: 'idle',
  lastActivity: 0,
  workStart: 0,
  isPinned: false,
  timers: {},
  band: null,
  walker: null,
  lastDraw: null,
  view: { scale: 3, side: 'left', hasMeter: true, hasPile: true },
}

function cancel(...names: (keyof typeof pet.timers)[]) {
  for (const name of names) {
    pet.timers[name]?.cancel()
    delete pet.timers[name]
  }
}

async function setMood($: EngineInterface, next: Mood) {
  pet.shown = next
  await update($, mood, () => next)
}

// The mood an automatic change lands on: a hook's, never over a pinned one.
async function settle($: EngineInterface, next: Mood) {
  if (!pet.isPinned) await setMood($, next)
}

// Working: the typing routine, or the frantic one once the turn has gone
// on a while.
async function workingMood($: EngineInterface): Promise<Mood> {
  return (await $.clock.now()) - pet.workStart > INTENSE_AFTER_MS ? 'intense' : 'working'
}

// A turn is running: out comes the laptop, and after a minute of it the
// typing gets frantic.
async function wake($: EngineInterface) {
  pet.lastActivity = await $.clock.now()
  if (BUSY.includes(pet.shown)) return
  pet.workStart = pet.lastActivity
  cancel('calm', 'intense', 'puzzled')
  pet.timers.intense = $.clock.after(INTENSE_AFTER_MS, () => {
    if (pet.shown === 'working') void settle($, 'intense')
  })
  await settle($, 'working')
}

// Back from a wait or a scratch of the head, to the typing.
async function resume($: EngineInterface) {
  if (pet.shown === 'attention' || pet.shown === 'puzzled') await settle($, await workingMood($))
}

// The turn ended: a nod, a jump or a bigger one by how long it took, or a
// shake of the head for a cut.
async function finish($: EngineInterface, isAnswered: boolean, durationMs: number) {
  pet.lastActivity = await $.clock.now()
  cancel('calm', 'intense', 'puzzled')
  await update($, activity, () => null)
  const reaction: Mood = !isAnswered ? 'dizzy' : durationMs < SHORT_TURN_MS ? 'nod' : durationMs < LONG_TURN_MS ? 'happy' : 'elated'
  const held = { dizzy: DIZZY_MS, nod: NOD_MS, happy: HAPPY_MS, elated: ELATED_MS }[reaction] ?? HAPPY_MS
  pet.timers.calm = $.clock.after(held, () => {
    if (pet.shown === reaction) void settle($, 'idle')
  })
  await settle($, reaction)
}

async function dozeOff($: EngineInterface) {
  const now = await $.clock.now()
  if (pet.shown === 'idle' && now - pet.lastActivity > SLEEP_AFTER_MS) await settle($, 'sleeping')
}

// Reads the context window's fill, and the five-hour window's, off the
// session and keeps them for the meter; the sites drawing it redraw on
// their own.
async function refreshContext($: EngineInterface) {
  const usage = await $.session.usage()
  const limit = usage.rateLimits.find(window => window.kind === 'five_hour')
  const next: ContextUsage = {
    percent: usage.context.percent ?? 0,
    tokens: usage.context.tokens ?? 0,
    window: usage.context.window,
    ...(limit === undefined ? {} : { limitPercent: limit.percentUsed }),
  }
  await update($, context, () => next)
}

// How many subagents run right now, off the engine's list.
async function refreshAgents($: EngineInterface) {
  const running = (await $.agent.list()).filter(agent => ['pending', 'running', 'waiting'].includes(agent.status))
  await update($, agents, () => running.length)
}

// Between 22:00 and 06:00 on the host's clock.
async function refreshNight($: EngineInterface) {
  const hour = new Date(await $.clock.now()).getHours()
  await update($, isNight, () => hour >= 22 || hour < 6)
}

// What the laptop's terminal says the model is doing, from the tool.
function activityOf(tool: string): string {
  if (['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'].includes(tool)) return 'read'
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return 'edit'
  if (tool === 'Bash') return 'bash'
  if (['WebSearch', 'WebFetch'].includes(tool)) return 'web'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  if (tool === 'AskUserQuestion') return 'ask'
  if (['TodoWrite', 'TaskCreate', 'TaskUpdate'].includes(tool)) return 'plan'
  if (tool.startsWith('mcp__')) return 'mcp'

  return 'tool'
}

// `/pet demo`: every mood in turn, then back to following the session.
function demo($: EngineInterface, index: number) {
  const next = MOODS[index]
  if (next === undefined) {
    pet.isPinned = false
    void setMood($, 'idle')

    return
  }
  void setMood($, next)
  pet.timers.demo = $.clock.after(DEMO_STEP_MS, () => demo($, index + 1))
}

async function paint($: EngineInterface) {
  const { band, walker } = pet
  if (band === null || walker === null) return
  const painted = await $.ui.blit({
    requestId: band.requestId,
    key: 'pet',
    cells: cells(step(walker, pet.shown), band.columns, await read($, context), pet.view.side),
  })
  if ('deny' in painted) pet.band = null
}

function isMood(text: string): text is Mood {
  return (MOODS as string[]).includes(text)
}

export const register: Register = (on, options) => {
  pet.view = {
    scale: options.size === '4' ? 4 : 3,
    side: options.side === 'right' ? 'right' : 'left',
    hasMeter: options.meter !== false,
    hasPile: options.pile !== false,
  }

  on('session.start', async ($, e, next) => {
    pet.lastActivity = await $.clock.now()
    const stored = await $.store.get('isHidden')
    await update($, isHidden, () => stored === true)
    pet.shown = await read($, mood)

    await $.command.register({
      name: 'pet',
      description: 'Your pixel pet: show, hide, demo, or pin a mood',
      argumentHint: `[show|hide|status|demo|mood <${MOODS.join('|')}|auto>]`,
      immediate: true,
    })

    await refreshContext($)
    await refreshNight($)
    $.clock.every(30_000, () => void dozeOff($))
    $.clock.every(5 * 60_000, () => void refreshNight($))
    if (e.surface === 'terminal') {
      $.clock.every(TICK_MS, () => void paint($))
    }

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb = '', rest = ''] = e.args.trim().toLowerCase().split(/\s+/, 2)

    if (verb === 'status') {
      const surfaces = await $.session.surfaces()
      const drawn = pet.lastDraw
      const ago = drawn === null ? 0 : Math.round(((await $.clock.now()) - drawn.at) / 1000)
      const usage = await read($, context)

      return {
        text: [
          `Surfaces: ${surfaces.length === 0 ? 'none' : surfaces.join(', ')}`,
          `Hidden: ${await read($, isHidden)}; mood: ${pet.shown}${pet.isPinned ? ' (pinned)' : ''}; agents: ${await read($, agents)}`,
          `Context: ${usage?.percent ?? '?'}%${usage?.limitPercent === undefined ? '' : `; 5h window: ${usage.limitPercent}%`}`,
          drawn === null
            ? 'The band above the prompt has not been asked to draw yet.'
            : `Last drawn on ${drawn.surface}, ${ago}s ago.`,
        ].join('\n'),
      }
    }

    if (verb === 'demo') {
      cancel('demo')
      pet.isPinned = true
      demo($, 0)

      return { text: `Showing every mood, ${DEMO_STEP_MS / 1000}s each: ${MOODS.join(', ')}.` }
    }

    if (verb === 'mood') {
      cancel('demo')
      if (rest === 'auto' || rest === '') {
        pet.isPinned = false
        await setMood($, 'idle')

        return { text: 'Your pet follows the session again.' }
      }
      if (!isMood(rest)) {
        return { text: `Moods: ${MOODS.join(', ')}, or auto.` }
      }
      pet.isPinned = true
      await setMood($, rest)

      return { text: `Your pet is ${rest} until /pet mood auto.` }
    }

    const hide = verb === 'hide' ? true : verb === 'show' ? false : !(await read($, isHidden))
    await update($, isHidden, () => hide)
    await $.store.set('isHidden', hide)

    return { text: hide ? 'Your pet is napping out of sight.' : 'Your pet is back.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) await wake($)

    return next(e)
  })

  // A tool call: the terminal names it; a question to you is a wait; a
  // failure, a scratch of the head; a subagent's, a mini pet.
  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    const tool = String(e.tool)
    await wake($)
    if (isMain) {
      await update($, activity, () => activityOf(tool))
      if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') await settle($, 'attention')
    }
    const ran = await next(e)
    if (isMain) {
      await resume($)
      if (ran.isError === true && !('deny' in ran)) {
        cancel('puzzled')
        pet.timers.puzzled = $.clock.after(PUZZLED_MS, () => void resume($))
        await settle($, 'puzzled')
      }
      await refreshContext($)
    }
    await refreshAgents($)

    return ran
  })

  // The permission check: a verdict that asks you is a wait, until the
  // tool goes ahead (its progress shows) or the call comes back.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.agentId === undefined && verdict.decision === 'ask' && BUSY.includes(pet.shown)) await settle($, 'attention')

    return verdict
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (pet.shown === 'attention') await resume($)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    await refreshAgents($)

    return spawned
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await finish($, e.reason === 'answer', e.durationMs)
      await refreshContext($)
    }
    await refreshAgents($)

    return next(e)
  })

  // While the main conversation compacts, the pet stomps the pile down;
  // a precompute installs nothing and shows nothing.
  on('session.compact', async ($, e, next) => {
    const isShown = e.agentId === undefined && e.trigger !== 'precompute'
    const before = pet.shown
    if (isShown) await settle($, 'compacting')
    const done = await next(e)
    await refreshContext($)
    if (isShown && pet.shown === 'compacting') {
      await settle($, before === 'working' || before === 'intense' ? before : 'idle')
    }

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await $.clock.now()
    pet.lastDraw = { surface: e.surface, at: now }
    if (e.props.hasSurvey || (await read($, isHidden))) {
      pet.band = null

      return next(e)
    }

    const stored = await read($, mood)
    const isResting = stored === 'idle' || stored === 'sleeping'
    const current: Mood = e.props.isWorking && isResting && !pet.isPinned ? 'working' : stored
    pet.shown = current
    const usage = await read($, context)

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const columns = Math.max(COLUMNS, Math.min(512, e.props.bodyColumns))
      const walker = (pet.walker ??= newWalker())
      pet.band = { requestId: e.requestId, columns }

      return <Raster key="pet" columns={columns} rows={ROWS} cells={cells(step(walker, current), columns, usage, pet.view.side)} />
    }

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      // Sized outright: left to itself the animated frame is 300px wide and
      // shrinks the art to fit.
      const width = widthFor(e.props.bodyColumns)
      const view: View = {
        ...DEFAULT_VIEW,
        ...pet.view,
        context: usage,
        activity: await read($, activity),
        agents: await read($, agents),
        isNight: await read($, isNight),
        hasIntro: now - pet.workStart < INTRO_MS,
      }

      return (
        <Box alignItems="flex-end">
          <Svg
            source={svg(current, width, view)}
            alt={`Your pixel pet is ${current}`}
            width={width}
            height={stripHeight(view.scale)}
            isInteractive
          />
        </Box>
      )
    }

    return next(e)
  })
}
