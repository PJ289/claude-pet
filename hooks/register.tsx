import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood } from '../types'
import { STRIP_H, svg } from './desktop'
import { ROWS, cells, newWalker, step } from './terminal'
import type { Walker } from './terminal'

const mood = atom({ plugin: 'pixel-pet', key: 'mood' } as const, 'idle')
const isHidden = atom({ plugin: 'pixel-pet', key: 'isHidden' } as const, false)

const TICK_MS = 150
const HAPPY_MS = 4000
const SLEEP_AFTER_MS = 5 * 60 * 1000

// What the module keeps between events; a reload starts it over.
const pet: {
  shown: Mood
  lastActivity: number
  calmDown: { cancel: () => void } | null
  // The terminal band's Raster, repainted on a timer while it is mounted.
  band: { requestId: string; columns: number } | null
  walker: Walker | null
} = { shown: 'idle', lastActivity: 0, calmDown: null, band: null, walker: null }

async function setMood($: EngineInterface, next: Mood) {
  pet.calmDown?.cancel()
  pet.calmDown = null
  pet.shown = next
  await update($, mood, () => next)
}

async function wake($: EngineInterface) {
  pet.lastActivity = await $.clock.now()
  if (pet.shown !== 'working') {
    await setMood($, 'working')
  }
}

async function cheer($: EngineInterface) {
  await setMood($, 'happy')
  pet.calmDown = $.clock.after(HAPPY_MS, () => {
    if (pet.shown === 'happy') {
      void setMood($, 'idle')
    }
  })
}

async function dozeOff($: EngineInterface) {
  const now = await $.clock.now()
  if (pet.shown === 'idle' && now - pet.lastActivity > SLEEP_AFTER_MS) {
    await setMood($, 'sleeping')
  }
}

async function paint($: EngineInterface) {
  const { band, walker } = pet
  if (band === null || walker === null) {
    return
  }
  const frame = step(walker, pet.shown, band.columns)
  const painted = await $.ui.blit({
    requestId: band.requestId,
    key: 'pet',
    cells: cells(walker, frame, band.columns),
  })
  if ('deny' in painted) {
    pet.band = null
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    pet.lastActivity = await $.clock.now()
    const stored = await $.store.get('isHidden')
    await update($, isHidden, () => stored === true)
    pet.shown = await read($, mood)

    await $.command.register({
      name: 'pet',
      description: 'Show or hide your pixel pet',
      argumentHint: '[show|hide]',
      immediate: true,
    })

    $.clock.every(30_000, () => void dozeOff($))
    if (e.surface === 'terminal') {
      $.clock.every(TICK_MS, () => void paint($))
    }

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const hide = arg === 'hide' ? true : arg === 'show' ? false : !(await read($, isHidden))
    await update($, isHidden, () => hide)
    await $.store.set('isHidden', hide)

    return { text: hide ? 'Your pet is napping out of sight.' : 'Your pet is back.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) {
      await wake($)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await wake($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      pet.lastActivity = await $.clock.now()
      if (e.reason === 'answer') {
        await cheer($)
      } else {
        await setMood($, 'idle')
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      pet.band = null

      return next(e)
    }

    const stored = await read($, mood)
    const current: Mood = e.props.isWorking && stored !== 'happy' ? 'working' : stored
    pet.shown = current

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const columns = Math.max(16, Math.min(512, e.props.bodyColumns))
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
      const width = Math.max(160, Math.min(720, e.props.bodyColumns * 8))

      return (
        <Box>
          <Svg
            source={svg(current, width)}
            alt={`Your pixel pet is ${current}`}
            height={STRIP_H}
            isInteractive
          />
        </Box>
      )
    }

    return next(e)
  })
}
