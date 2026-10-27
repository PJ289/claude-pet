import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood } from '../types'
import { SCALE, STRIP_H, svg } from './desktop'
import { COLUMNS } from './frames'
import { ROWS, cells, newWalker, step } from './terminal'
import type { Walker } from './terminal'

const mood = atom({ plugin: 'pixel-pet', key: 'mood' } as const, 'idle')
const isHidden = atom({ plugin: 'pixel-pet', key: 'isHidden' } as const, false)

const MOODS: Mood[] = ['idle', 'working', 'engineer', 'rocket', 'happy', 'sleeping']
const EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const TICK_MS = 150
const HAPPY_MS = 4000
const HAMMER_MS = 3500
const ROCKET_AFTER_MS = 60 * 1000
const SLEEP_AFTER_MS = 5 * 60 * 1000
const DEMO_STEP_MS = 7000

type Timer = { cancel: () => void }

// What the module keeps between events; a reload starts it over.
const pet: {
  shown: Mood
  lastActivity: number
  workStart: number
  // `/pet mood` holds a mood against the automatic changes; `/pet demo` too.
  isPinned: boolean
  timers: { calm?: Timer; hammer?: Timer; rocket?: Timer; demo?: Timer }
  // The terminal band's Raster, repainted on a timer while it is mounted.
  band: { requestId: string; columns: number } | null
  walker: Walker | null
  // The last time the band was asked to draw, for `/pet status`.
  lastDraw: { surface: string; at: number } | null
} = {
  shown: 'idle',
  lastActivity: 0,
  workStart: 0,
  isPinned: false,
  timers: {},
  band: null,
  walker: null,
  lastDraw: null,
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

// Working: the mascot's typing routine, the rocket once it has gone on a while.
async function workingMood($: EngineInterface): Promise<Mood> {
  return (await $.clock.now()) - pet.workStart > ROCKET_AFTER_MS ? 'rocket' : 'working'
}

async function wake($: EngineInterface) {
  pet.lastActivity = await $.clock.now()
  if (pet.shown === 'working' || pet.shown === 'rocket' || pet.shown === 'engineer') return
  pet.workStart = pet.lastActivity
  cancel('calm', 'rocket')
  pet.timers.rocket = $.clock.after(ROCKET_AFTER_MS, () => {
    if (pet.shown === 'working') void settle($, 'rocket')
  })
  await settle($, 'working')
}

async function hammer($: EngineInterface) {
  cancel('hammer')
  pet.timers.hammer = $.clock.after(HAMMER_MS, async () => {
    if (pet.shown === 'engineer') await settle($, await workingMood($))
  })
  await settle($, 'engineer')
}

async function finish($: EngineInterface, isAnswered: boolean) {
  pet.lastActivity = await $.clock.now()
  cancel('calm', 'hammer', 'rocket')
  if (!isAnswered) {
    await settle($, 'idle')

    return
  }
  pet.timers.calm = $.clock.after(HAPPY_MS, () => {
    if (pet.shown === 'happy') void settle($, 'idle')
  })
  await settle($, 'happy')
}

async function dozeOff($: EngineInterface) {
  const now = await $.clock.now()
  if (pet.shown === 'idle' && now - pet.lastActivity > SLEEP_AFTER_MS) await settle($, 'sleeping')
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
  const frame = step(walker, pet.shown, band.columns)
  const painted = await $.ui.blit({
    requestId: band.requestId,
    key: 'pet',
    cells: cells(walker, frame, band.columns),
  })
  if ('deny' in painted) pet.band = null
}

function isMood(text: string): text is Mood {
  return (MOODS as string[]).includes(text)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    pet.lastActivity = await $.clock.now()
    const stored = await $.store.get('isHidden')
    await update($, isHidden, () => stored === true)
    pet.shown = await read($, mood)

    await $.command.register({
      name: 'pet',
      description: 'Your pixel pet: show, hide, demo, or pin a mood',
      argumentHint: '[show|hide|status|demo|mood <idle|working|engineer|rocket|happy|sleeping|auto>]',
      immediate: true,
    })

    $.clock.every(30_000, () => void dozeOff($))
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

      return {
        text: [
          `Surfaces: ${surfaces.length === 0 ? 'none' : surfaces.join(', ')}`,
          `Hidden: ${await read($, isHidden)}; mood: ${pet.shown}${pet.isPinned ? ' (pinned)' : ''}`,
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

  on('tool.call', async ($, e, next) => {
    await wake($)
    if (EDITING_TOOLS.has(String(e.tool))) await hammer($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await finish($, e.reason === 'answer')

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    pet.lastDraw = { surface: e.surface, at: await $.clock.now() }
    if (e.props.hasSurvey || (await read($, isHidden))) {
      pet.band = null

      return next(e)
    }

    const stored = await read($, mood)
    const isResting = stored === 'idle' || stored === 'sleeping'
    const current: Mood = e.props.isWorking && isResting && !pet.isPinned ? 'working' : stored
    pet.shown = current

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const columns = Math.max(COLUMNS, Math.min(512, e.props.bodyColumns))
      const walker = (pet.walker ??= newWalker(columns))
      pet.band = { requestId: e.requestId, columns }

      return (
        <Raster
          key="pet"
          columns={columns}
          rows={ROWS}
          cells={cells(walker, step(walker, current, columns), columns)}
        />
      )
    }

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      // Sized outright: left to itself the animated frame is 300px wide and
      // shrinks the art to fit.
      const width = Math.max(COLUMNS * SCALE * 2, Math.min(480, e.props.bodyColumns * 7))

      return (
        <Box alignItems="flex-end">
          <Svg
            source={svg(current, width)}
            alt={`Your pixel pet is ${current}`}
            width={width}
            height={STRIP_H}
            isInteractive
          />
        </Box>
      )
    }

    return next(e)
  })
}
