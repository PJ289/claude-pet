// The desktop pet: one SVG whose SMIL animations breathe, blink, type and
// jump it, so the surface animates it with no redraws. A new mood, or a
// change in what it shows, draws a new SVG.
//
// The pet has a place: a stage at one end of the strip, on a floor line,
// with a shadow under it, an in-tray pile of papers beside it and the
// context meter at the other end. Every mood plays on that same stage.

import type { ContextUsage, Mood } from '../types'
import {
  BACK,
  COLUMNS,
  CROUCH,
  PULL,
  ROWS,
  SCRATCH_A,
  SCRATCH_B,
  SET,
  SIDE_L,
  SIDE_R,
  STRETCH,
  TYPE_A,
  TYPE_B,
  capped,
  colorOf,
  front,
} from './frames'
import type { Grid } from './frames'

// What one drawing shows beside the mood.
export type View = {
  context: ContextUsage | null
  activity: string | null
  agents: number
  isNight: boolean
  // Whether the working routine opens with the laptop coming out; a redraw
  // mid-turn skips it, so a new activity label does not replay it.
  hasIntro: boolean
  scale: number
  side: 'left' | 'right'
  hasMeter: boolean
  hasPile: boolean
}

export const DEFAULT_VIEW: View = {
  context: null,
  activity: null,
  agents: 0,
  isNight: false,
  hasIntro: true,
  scale: 3,
  side: 'left',
  hasMeter: true,
  hasPile: true,
}

// The layout of one drawing: CSS pixels per art pixel and where things go.
// Set by `svg` before it draws, read by everything beneath.
let SCALE = 3
let FRAME_W = COLUMNS * SCALE
let FRAME_H = ROWS * SCALE
let STRIP_H = FRAME_H + 4
let TOP = STRIP_H - FRAME_H
let FLOOR_Y = STRIP_H - 1
let SHEET_W = 9 * SCALE
let WIDTH = 456
let IS_LEFT = true
let STAGE_X = 6
let PILE_X = 102

export function stripHeight(scale: number): number {
  return ROWS * scale + 4
}

function layout(view: View, width: number) {
  SCALE = view.scale
  FRAME_W = COLUMNS * SCALE
  FRAME_H = ROWS * SCALE
  STRIP_H = FRAME_H + 4
  TOP = STRIP_H - FRAME_H
  FLOOR_Y = STRIP_H - 1
  SHEET_W = 9 * SCALE
  WIDTH = width
  IS_LEFT = view.side === 'left'
  STAGE_X = IS_LEFT ? 6 : width - 6 - FRAME_W
  PILE_X = IS_LEFT ? STAGE_X + FRAME_W + 4 * SCALE : STAGE_X - 4 * SCALE - SHEET_W
}

// The strip's width for a band `columns` cells wide: the stage at one end,
// the context meter at the other, never wider than the band is likely to be.
export function widthFor(columns: number): number {
  return Math.max(320, Math.min(520, Math.round(columns * 6.5)))
}

const BODY = '#D06A4B'
const GREY = '#9A9A96'
const CONFETTI = ['#D06A4B', '#F2B49B', '#CFE8FF', '#B55C41', '#E8C547', '#D06A4B', '#F2B49B', '#CFE8FF']

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)
const px = (n: number) => n * SCALE

function rects(grid: Grid): string {
  let out = ''
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = colorOf(row[x])
      let end = x + 1
      while (end < row.length && colorOf(row[end]) === color) end += 1
      if (color !== null) {
        out += `<rect x="${px(x)}" y="${px(y)}" width="${px(end - x)}" height="${SCALE}" fill="${color}"/>`
      }
      x = end
    }
  })

  return out
}

// `begin` is seconds, or an event (`hit.click`); a finite `repeat` holds its
// last value afterwards unless `isHeld` says not to.
type Timing = { begin?: number | string; repeat?: number; isHeld?: boolean }

function discrete(values: number[], keyTimes: number[], dur: number, timing: Timing = {}): string {
  const repeat = timing.repeat === undefined ? 'indefinite' : String(timing.repeat)
  const freeze = timing.repeat !== undefined && timing.isHeld !== false ? ' fill="freeze"' : ''
  const begin = typeof timing.begin === 'string' ? timing.begin : `${fmt(timing.begin ?? 0)}s`

  return `<animate attributeName="opacity" values="${values.join(';')}" keyTimes="${keyTimes.map(fmt).join(';')}" dur="${fmt(dur)}s" begin="${begin}" calcMode="discrete" repeatCount="${repeat}"${freeze}/>`
}

type Step = { ms: number; grid: Grid }

// Shows the clip's steps one after another; looping unless `repeat` says.
function clip(steps: Step[], timing: Timing = {}): string {
  const total = steps.reduce((sum, step) => sum + step.ms, 0)
  const keyTimes = [0]
  steps.forEach(step => keyTimes.push((keyTimes[keyTimes.length - 1] ?? 0) + step.ms / total))
  keyTimes.pop()

  return steps
    .map((step, i) => {
      const values = steps.map((_, j) => (i === j ? 1 : 0))

      return `<g opacity="0">${rects(step.grid)}${discrete(values, keyTimes, total / 1000, timing)}</g>`
    })
    .join('')
}

const EASE = '0.4 0 0.6 1'

// A slow rise and fall of one pixel: the pet breathes.
function breathing(seconds: number): string {
  return `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" keyTimes="0;0.5;1" dur="${fmt(seconds)}s" calcMode="spline" keySplines="${EASE};${EASE}" repeatCount="indefinite"/>`
}

// The floor line, fading out past the stage so it has an end.
function floor(): string {
  const [a, b] = IS_LEFT ? [0.4, 0] : [0, 0.4]

  return (
    `<defs><linearGradient id="floor" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${GREY}" stop-opacity="${a}"/><stop offset="0.5" stop-color="${GREY}" stop-opacity="0.4"/><stop offset="1" stop-color="${GREY}" stop-opacity="${b}"/></linearGradient></defs>` +
    `<rect x="0" y="${FLOOR_Y}" width="${WIDTH}" height="1" fill="url(#floor)"/>`
  )
}

// Pixel glyphs that pop up over the pet: a heart, a "!", a "?".
const HEART = ['.OO.OO.', 'OOOOOOO', 'OOOOOOO', '.OOOOO.', '..OOO..', '...O...']
const BANG = ['O', 'O', 'O', 'O', '.', 'O']
const QUERY = ['.OOO.', 'O...O', '....O', '...O.', '..O..', '.....', '..O..']
function glyph(rows: string[], color: string): string {
  return rows
    .map((row, y) => {
      let out = ''
      let x = 0
      while (x < row.length) {
        let end = x
        while (end < row.length && row[end] === 'O') end += 1
        if (end > x) out += `<rect x="${px(x)}" y="${px(y)}" width="${px(end - x)}" height="${SCALE}" fill="${color}"/>`
        x = end > x ? end : x + 1
      }

      return out
    })
    .join('')
}

// Something rising over the pet's head when `on` fires: in for `seconds`.
function popup(body: string, on: string, seconds: number, x: number, y: number): string {
  return (
    `<g transform="translate(${px(x) + STAGE_X} ${TOP + px(y)})" opacity="0">` +
    `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.6;1" dur="${fmt(seconds)}s" begin="${on}"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -8" dur="${fmt(seconds)}s" begin="${on}" additive="sum"/>` +
    `${body}</g>`
  )
}

const HOP = (on: string) =>
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" keyTimes="0;0.45;1" dur="0.42s" begin="${on}" calcMode="spline" keySplines="0.2 0.8 0.4 1;0.6 0 0.8 0.2" additive="sum"/>`

// One click reaction: what the stage does, frames that take the scene's
// place for `hideSeconds`, and what pops up. `ON` in its markup stands
// for the click that starts it.
type Reaction = { id: string; stage: string; frames?: Step[]; hideSeconds?: number; popup?: string }

// A click on the pet, all inside the drawing, where SMIL hears it and
// nothing reaches the hooks. Which of the five reactions plays is luck:
// the hit area is a band of stripes, two per reaction, sliding across the
// stage a few times a second, so the click lands on whichever stripe is
// passing. A click on a stripe bubbles to its reaction's group, whose id
// the animations listen for.
function clickable(body: string): string {
  const reactions: Reaction[] = [
    {
      id: 'heart',
      stage: HOP('ON'),
      popup: popup(glyph(HEART, '#E8566E'), 'ON', 1.1, 8.5, 1),
    },
    {
      id: 'spin',
      stage: HOP('ON'),
      hideSeconds: 0.36,
      frames: [
        { grid: front(0), ms: 60 },
        { grid: SIDE_R, ms: 75 },
        { grid: BACK, ms: 90 },
        { grid: SIDE_L, ms: 75 },
        { grid: front(0), ms: 60 },
      ],
    },
    {
      id: 'startle',
      stage: `<animateTransform attributeName="transform" type="translate" values="0 0;4 0;3 0;0 0" keyTimes="0;0.3;0.7;1" dur="0.3s" begin="ON" additive="sum"/>`,
      hideSeconds: 0.45,
      frames: [
        { grid: CROUCH, ms: 300 },
        { grid: front('closed'), ms: 150 },
      ],
      popup: popup(glyph(BANG, BODY), 'ON', 0.8, 15, 0),
    },
    {
      id: 'dance',
      stage: `<animateTransform attributeName="transform" type="translate" values="0 0;-3 0;0 0;3 0;0 0;-3 0;0 0;3 0;0 0" dur="1.2s" begin="ON" additive="sum"/>`,
      hideSeconds: 1.2,
      frames: Array.from({ length: 8 }, (_, i) => ({ grid: front(i % 4 < 2 ? -1 : 1, i % 2 ? 'stepB' : 'stepA'), ms: 150 })),
      popup: popup(`<text x="0" y="${px(2)}" font-size="12" font-weight="bold" fill="${BODY}">♪</text>`, 'ON', 1.2, 17, 2),
    },
    {
      id: 'wave',
      stage: HOP('ON'),
      hideSeconds: 0.6,
      frames: [
        { grid: STRETCH, ms: 150 },
        { grid: front(0), ms: 150 },
        { grid: STRETCH, ms: 150 },
        { grid: front(0), ms: 150 },
      ],
    },
  ]
  const on = (r: Reaction, markup: string) => markup.split('begin="ON"').join(`begin="${r.id}.click"`)
  const hides = reactions
    .filter(r => r.hideSeconds !== undefined)
    .map(r => `<set attributeName="opacity" to="0" begin="${r.id}.click" dur="${fmt(r.hideSeconds ?? 0)}s"/>`)
    .join('')
  const frames = reactions
    .filter(r => r.frames !== undefined)
    .map(r => stage(clip(r.frames ?? [], { begin: `${r.id}.click`, repeat: 1, isHeld: false })))
    .join('')
  const stages = reactions.map(r => on(r, r.stage)).join('')
  const popups = reactions.map(r => on(r, r.popup ?? '')).join('')
  const hitW = FRAME_W + 12
  const stripeW = hitW / reactions.length
  const stripes = reactions
    .map(
      (r, i) =>
        `<g id="${r.id}" style="cursor:pointer">` +
        `<rect x="${fmt(i * stripeW)}" y="0" width="${fmt(stripeW)}" height="${STRIP_H}" fill="#fff" fill-opacity="0"/>` +
        `<rect x="${fmt(hitW + i * stripeW)}" y="0" width="${fmt(stripeW)}" height="${STRIP_H}" fill="#fff" fill-opacity="0"/>` +
        `</g>`,
    )
    .join('')
  const hits =
    `<g transform="translate(${STAGE_X - 6} 0)">` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${-hitW} 0" dur="0.5s" repeatCount="indefinite" additive="sum"/>` +
    `${stripes}</g>`

  return `<g>${stages}<g>${hides}${body}</g>${frames}</g>${popups}${hits}`
}

// The context window's fill, as a row of cells at the strip's far end:
// orange, amber past 70%, red past 90%. Before it, where the account has
// one, the five-hour window as a battery.
const CELLS = 20
const CELL_W = 5
const CELL_GAP = 2
// Three gauges share this width: 20 cells of 5 with gaps of 2.
export function meterColor(percent: number): string {
  return percent >= 90 ? '#E06C75' : percent >= 70 ? '#E8C547' : BODY
}
// How many of `count` cells a percent lights: at least one once above zero.
function litOf(percent: number, count: number): number {
  const p = Math.max(0, Math.min(100, percent))

  return p > 0 ? Math.max(1, Math.round((p / 100) * count)) : 0
}

function meter(context: ContextUsage | null): string {
  if (context === null) return ''
  // Three gauges of one width, one row each: the context window, the
  // five-hour window as a battery, the week as seven cells. Each row is a
  // label, the gauge, and the percent at the far end.
  const gaugeW = CELLS * (CELL_W + CELL_GAP) - CELL_GAP
  const rowH = 10
  const rows: { label: string; percent: number; gauge: (x: number, y: number, tint: string) => string }[] = [
    {
      label: 'ctx',
      percent: context.percent,
      gauge: (x, y, tint) => {
        const filled = litOf(context.percent, CELLS)
        let out = ''
        for (let i = 0; i < CELLS; i++) {
          out += `<rect x="${x + i * (CELL_W + CELL_GAP)}" y="${y}" width="${CELL_W}" height="${rowH}" fill="${i < filled ? tint : GREY}" opacity="${i < filled ? 1 : 0.22}"/>`
        }

        return out
      },
    },
  ]
  if (context.limitPercent !== undefined) {
    const used = Math.max(0, Math.min(100, context.limitPercent))
    rows.push({
      label: '5h',
      percent: used,
      gauge: (x, y, tint) => {
        // A battery: the case with its tip, ten segments inside.
        const segments = 10
        const segW = (gaugeW - 4 - (segments - 1) * 2 - 2) / segments
        const filled = litOf(used, segments)
        let out = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${gaugeW - 3}" height="${rowH - 1}" fill="none" stroke="${GREY}" stroke-opacity="0.7"/>`
        out += `<rect x="${x + gaugeW - 2}" y="${y + 3}" width="2" height="${rowH - 6}" fill="${GREY}" fill-opacity="0.7"/>`
        for (let i = 0; i < segments; i++) {
          out += `<rect x="${fmt(x + 2 + i * (segW + 2))}" y="${y + 2}" width="${fmt(segW)}" height="${rowH - 4}" fill="${i < filled ? tint : GREY}" opacity="${i < filled ? 1 : 0.18}"/>`
        }

        return out
      },
    })
  }
  if (context.weekPercent !== undefined) {
    const used = Math.max(0, Math.min(100, context.weekPercent))
    rows.push({
      label: '7d',
      percent: used,
      gauge: (x, y, tint) => {
        // Seven cells, one per day of the window.
        const dayW = (gaugeW - 6 * 2) / 7
        const days = litOf(used, 7)
        let out = ''
        for (let i = 0; i < 7; i++) {
          out += `<rect x="${fmt(x + i * (dayW + 2))}" y="${y}" width="${fmt(dayW)}" height="${rowH}" fill="${i < days ? tint : GREY}" opacity="${i < days ? 1 : 0.22}"/>`
        }

        return out
      },
    })
  }
  const gap = rows.length === 3 ? 4 : 8
  const top = Math.round((STRIP_H - (rows.length * rowH + (rows.length - 1) * gap)) / 2)
  const labelW = 24
  const percentW = 34
  const end = IS_LEFT ? WIDTH - 8 : 8
  const gaugeX = IS_LEFT ? end - percentW - gaugeW : end + percentW
  const labelX = IS_LEFT ? gaugeX - 6 : gaugeX + gaugeW + 6
  let out = ''
  rows.forEach((row, i) => {
    const y = top + i * (rowH + gap)
    const percent = Math.round(row.percent)
    const tint = meterColor(percent)
    out += `<text x="${labelX}" y="${y + rowH - 1}" font-size="10" fill="${GREY}" text-anchor="${IS_LEFT ? 'end' : 'start'}">${row.label}</text>`
    out += row.gauge(gaugeX, y, tint)
    out += `<text x="${end}" y="${y + rowH - 1}" font-size="10" font-weight="bold" fill="${percent >= 70 ? tint : '#B8B8B4'}" text-anchor="${IS_LEFT ? 'end' : 'start'}">${percent}%</text>`
  })
  void labelW

  return out
}

// The pet's in-tray: a pile of papers beside it that grows with the
// context window, under a dashed line where 100% is. The sheets near the
// top take the meter's amber and red; past 90% the pile sways.
const PILE_SHEETS = 13
function sheetsOf(context: ContextUsage | null): number {
  const percent = context === null ? 0 : Math.max(0, Math.min(100, context.percent))

  return Math.round((percent / 100) * PILE_SHEETS)
}

// The stomp's beat while compacting: the pet lands at STOMP_BEGIN_S and the
// pile collapses under it to what fits in the strip, then each cycle opens
// with the next impact.
const STOMP_S = 0.6
const STOMP_BEGIN_S = 1
const SHEETS_UNDER_PET = 6
function collapseOf(sheets: number): number {
  return sheets > SHEETS_UNDER_PET ? SHEETS_UNDER_PET / sheets : 1
}
function squash(sheets: number): string {
  const k = fmt(collapseOf(sheets))

  return (
    `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 ${k}" keyTimes="0;0.97;1" dur="${STOMP_BEGIN_S}s" fill="freeze"/>` +
    `<animateTransform attributeName="transform" type="scale" values="1 0.82;1 1;1 1" keyTimes="0;0.25;1" dur="${STOMP_S}s" begin="${STOMP_BEGIN_S}s" repeatCount="indefinite" additive="sum"/>`
  )
}

function pile(context: ContextUsage | null, isSquashed: boolean): string {
  const percent = context === null ? 0 : Math.max(0, Math.min(100, context.percent))
  const sheets = sheetsOf(context)
  const ceiling = FLOOR_Y - PILE_SHEETS * SCALE - 2
  const postX = IS_LEFT ? PILE_X - 6 : PILE_X + SHEET_W + 6
  // A dotted post from the floor to the line, so the room left is legible.
  let out = `<line x1="${postX}" x2="${postX}" y1="${ceiling}" y2="${FLOOR_Y}" stroke="${GREY}" stroke-opacity="0.35" stroke-dasharray="1 2"/>`
  out += `<line x1="${PILE_X - 6}" x2="${PILE_X + SHEET_W + 6}" y1="${ceiling}" y2="${ceiling}" stroke="${GREY}" stroke-opacity="0.55" stroke-dasharray="2 2"/>`
  out += IS_LEFT
    ? `<text x="${PILE_X + SHEET_W + 9}" y="${ceiling + 3}" font-size="8" fill="${GREY}">100%</text>`
    : `<text x="${PILE_X - 9}" y="${ceiling + 3}" font-size="8" fill="${GREY}" text-anchor="end">100%</text>`
  let sheetsOut = ''
  for (let i = 0; i < sheets; i++) {
    const share = ((i + 1) / PILE_SHEETS) * 100
    const tint = share > 90 ? '#E06C75' : share > 70 ? '#E8C547' : i % 2 ? '#D6D6D2' : '#EDEDEA'
    const jog = [0, 2, -1, 1, -2, 1, 0, 2, -1, 1, -2, 0, 1][i] ?? 0
    const y = FLOOR_Y - (i + 1) * SCALE
    sheetsOut += `<rect x="${PILE_X + jog}" y="${y}" width="${SHEET_W}" height="${SCALE - 1}" fill="${tint}"/>`
  }
  if (isSquashed) {
    return (
      out +
      `<g transform="translate(0 ${FLOOR_Y})"><g>${squash(sheets)}` +
      `<g transform="translate(0 ${-FLOOR_Y})">${sheetsOut}</g></g></g>`
    )
  }
  const cx = PILE_X + SHEET_W / 2
  const sway =
    percent >= 90
      ? `<animateTransform attributeName="transform" type="rotate" values="0 ${cx} ${FLOOR_Y};-2 ${cx} ${FLOOR_Y};0 ${cx} ${FLOOR_Y};2 ${cx} ${FLOOR_Y};0 ${cx} ${FLOOR_Y}" dur="1.6s" repeatCount="indefinite"/>`
      : ''

  return out + `<g>${sway}${sheetsOut}</g>`
}

// One mini pet per running subagent, typing away in a row past the pile
// (or past the stage, with no pile); more than three is a count.
const MINI = 2
function minis(count: number, hasPile: boolean): string {
  if (count <= 0) return ''
  const shown = Math.min(3, count)
  const gap = 15 * MINI + 4
  const edge = hasPile ? (IS_LEFT ? PILE_X + SHEET_W + 14 : PILE_X - 14) : IS_LEFT ? STAGE_X + FRAME_W + 8 : STAGE_X - 8
  let out = ''
  for (let i = 0; i < shown; i++) {
    const x = IS_LEFT ? edge + i * gap : edge - (i + 1) * gap + 4
    out +=
      `<g transform="translate(${x} ${FLOOR_Y + 1 - ROWS * MINI}) scale(${fmt(MINI / SCALE)})">` +
      clip(
        [
          { grid: TYPE_A, ms: 130 },
          { grid: TYPE_B, ms: 130 },
        ],
        { begin: i * 0.07 },
      ) +
      `</g>`
  }
  if (count > shown) {
    const x = IS_LEFT ? edge + shown * gap : edge - shown * gap
    out += `<text x="${x}" y="${FLOOR_Y - 4}" font-size="10" font-weight="bold" fill="${GREY}" text-anchor="${IS_LEFT ? 'start' : 'end'}">+${count - shown}</text>`
  }

  return out
}

// A dim over the strip and a crescent over the stage, between 22:00 and 06:00.
const MOON = ['..OO.', '.O...', 'O....', 'O....', '.O...', '..OO.']
function night(): string {
  const x = IS_LEFT ? STAGE_X + FRAME_W - px(7) : STAGE_X + px(2)

  return (
    `<rect x="0" y="0" width="${WIDTH}" height="${STRIP_H}" fill="#0B0B1A" opacity="0.22" style="pointer-events:none"/>` +
    `<g transform="translate(${x} ${TOP + 2})" opacity="0.8" style="pointer-events:none">${glyph(MOON, '#E8DFA0')}</g>`
  )
}

// The shadow under the pet, centred on art column `cx`.
function shadow(cx: number, rx: number, extra = ''): string {
  return `<ellipse cx="${px(cx) + STAGE_X}" cy="${FLOOR_Y - 1}" rx="${px(rx)}" ry="2" fill="#000" opacity="0.38">${extra}</ellipse>`
}

const STAND = front(0)

function stage(body: string): string {
  return `<g transform="translate(${STAGE_X} ${TOP})">${body}</g>`
}

// Standing, breathing, blinking now and then, and glancing at the prompt
// as if waiting for the next message.
function idle(): string {
  return (
    shadow(12, 5.5) +
    stage(
      `<g>${breathing(2.6)}` +
        clip([
          { grid: STAND, ms: 3100 },
          { grid: front('closed'), ms: 120 },
          { grid: STAND, ms: 2300 },
          { grid: front('closed'), ms: 120 },
          { grid: STAND, ms: 900 },
          { grid: front(1), ms: 1300 },
          { grid: STAND, ms: 2600 },
          { grid: front('closed'), ms: 110 },
          { grid: STAND, ms: 600 },
          { grid: front(-1), ms: 900 },
          { grid: STAND, ms: 1400 },
        ]) +
        `</g>`,
    )
  )
}

// A small terminal window above the laptop: a prompt line naming what the
// model is doing, then lines of output typed in and cleared, over and
// over. `period` is one fill-and-clear, in seconds.
function terminalBubble(period: number, activity: string | null): string {
  const lines: [number, string][][] = [
    [[5, 'c'], [3, 'L']],
    [[4, 'c'], [6, 'c']],
    [[6, 'L'], [2, 'c']],
  ]
  const total = period * lines.length
  let out = `<rect x="0" y="0" width="${px(10)}" height="${px(7)}" rx="3" fill="#161615" opacity="0.9"/>`
  out += `<text x="${px(1)}" y="${px(1) + 6}" font-size="7" fill="${colorOf('L')}">&gt; ${activity ?? 'think'}</text>`
  lines.forEach((set, k) => {
    set.forEach(([length, color], i) => {
      const on = (k * period + 0.25 + i * (period * 0.3)) / total
      const off = (k * period + period * 0.9) / total

      return (out +=
        `<rect x="${px(1)}" y="${px(3 + i * 2)}" width="${px(length)}" height="${SCALE}" fill="${colorOf(color)}" opacity="0">` +
        discrete([0, 1, 0], [0, on, off], total) +
        `</rect>`)
    })
  })
  // A cursor blinks in the corner, so an empty window still reads as live.
  out += `<rect x="${px(8)}" y="${px(5)}" width="${SCALE}" height="${SCALE}" fill="${colorOf('L')}">${discrete([1, 0], [0, 0.5], 1)}</rect>`

  return `<g>${out}</g>`
}

// The mascot's own routine: a blink, out comes the laptop, a hop, and then
// it types for as long as the turn runs. `isIntense` once it has gone on a
// while: faster keys, a sweat drop, the terminal racing.
function working(isIntense: boolean, view: View): string {
  const intro: Step[] = view.hasIntro
    ? [
        { grid: STAND, ms: 350 },
        { grid: front('closed'), ms: 120 },
        { grid: STAND, ms: 250 },
        { grid: PULL, ms: 420 },
        { grid: SET, ms: 420 },
        { grid: STRETCH, ms: 220 },
        { grid: CROUCH, ms: 90 },
      ]
    : []
  const introSeconds = intro.reduce((sum, step) => sum + step.ms, 0) / 1000
  const keyMs = isIntense ? 70 : 110
  const sweat = isIntense
    ? `<rect x="${px(15)}" y="${px(7)}" width="${SCALE}" height="${px(2)}" fill="${colorOf('B')}">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 8" dur="1.1s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.7;1" dur="1.1s" repeatCount="indefinite"/></rect>`
    : ''
  const jitter = isIntense
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="0.28s" repeatCount="indefinite"/>`
    : ''
  const typing =
    `<g>${jitter}` +
    clip([
      { grid: TYPE_A, ms: keyMs },
      { grid: TYPE_B, ms: keyMs },
    ]) +
    `</g>${sweat}`
  const bubble = terminalBubble(isIntense ? 1.3 : 2.6, view.activity)

  if (intro.length === 0) {
    return shadow(8, 7.5) + stage(typing + bubble)
  }

  return (
    shadow(
      12,
      5.5,
      `<animate attributeName="cx" values="${px(12) + STAGE_X};${px(8) + STAGE_X}" dur="0.01s" begin="${fmt(introSeconds)}s" fill="freeze"/>` +
        `<animate attributeName="rx" values="${px(5.5)};${px(7.5)}" dur="0.01s" begin="${fmt(introSeconds)}s" fill="freeze"/>`,
    ) +
    stage(
      `<g>${clip(intro, { repeat: 1 })}<set attributeName="opacity" to="0" begin="${fmt(introSeconds)}s"/></g>` +
        `<g opacity="0"><set attributeName="opacity" to="1" begin="${fmt(introSeconds)}s"/>${typing}` +
        `<g opacity="0"><set attributeName="opacity" to="1" begin="${fmt(introSeconds + 0.4)}s"/>${bubble}</g>` +
        `</g>`,
    )
  )
}

// Claude is waiting on you, for a permission or an answer: the pet faces
// the prompt and bounces, a "?" bobbing over it.
function attention(): string {
  const loop = 0.8

  return (
    shadow(12, 5.5, `<animate attributeName="rx" values="${px(5.5)};${px(4.5)};${px(5.5)}" keyTimes="0;0.4;1" dur="${loop}s" repeatCount="indefinite"/>`) +
    stage(
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0;0 0" keyTimes="0;0.4;0.7;1" dur="${loop}s" calcMode="spline" keySplines="0.2 0.8 0.4 1;0.6 0 0.8 0.2;0 0 1 1" repeatCount="indefinite"/>` +
        clip([
          { grid: STRETCH, ms: 320 },
          { grid: front(1), ms: 480 },
        ]) +
        `</g>` +
        `<g transform="translate(${px(15)} 0)"><animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0" dur="${loop}s" repeatCount="indefinite" additive="sum"/>${glyph(QUERY, BODY)}</g>`,
    )
  )
}

// A tool call failed: it scratches its head.
function puzzled(): string {
  return (
    shadow(12, 5.5) +
    stage(
      clip([
        { grid: SCRATCH_A, ms: 200 },
        { grid: SCRATCH_B, ms: 200 },
      ]) +
        `<g transform="translate(${px(14)} 0)" opacity="0.9"><animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="1.2s" repeatCount="indefinite" additive="sum"/>${glyph(QUERY, GREY)}</g>`,
    )
  )
}

// A short turn's answer: a nod, no more.
function nod(): string {
  return (
    shadow(12, 5.5) +
    stage(
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0;0 2;0 0;0 0" keyTimes="0;0.15;0.3;0.45;0.6;1" dur="1.5s" repeatCount="indefinite"/>` +
        clip([
          { grid: STAND, ms: 300 },
          { grid: front('closed'), ms: 120 },
          { grid: STAND, ms: 380 },
          { grid: front('closed'), ms: 120 },
          { grid: STAND, ms: 580 },
        ]) +
        `</g>`,
    )
  )
}

// The answer landed: a real jump, crouch, stretch, land, with confetti.
// Elated, after a long turn: higher, faster, twice the confetti.
function happy(isElated: boolean): string {
  const loop = isElated ? 1.1 : 1.4
  const height = isElated ? 20 : 14
  const keyTimes = '0;0.086;0.33;0.514;1'
  const jump = `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 ${-height};0 0;0 0" keyTimes="${keyTimes}" dur="${loop}s" calcMode="spline" keySplines="0 0 1 1;0.2 0.8 0.4 1;0.6 0 0.8 0.2;0 0 1 1" repeatCount="indefinite"/>`
  const pieces = isElated ? [...CONFETTI, ...CONFETTI] : CONFETTI
  const confetti = pieces
    .map((color, i) => {
      const n = pieces.length
      const dx = (i - (n - 1) / 2) * (isElated ? 5.5 : 9) + (i % 2 ? 3 : -3)
      const peak = -(10 + (i % 3) * 4 + (isElated ? 6 : 0))
      const fall = 26

      return (
        `<rect x="${px(12) - 2}" y="${px(6)}" width="4" height="4" fill="${color}" opacity="0">` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${fmt(dx * 0.55)} ${peak};${fmt(dx)} ${fall};${fmt(dx)} ${fall}" keyTimes="0;0.25;0.45;0.8;1" dur="${loop}s" calcMode="spline" keySplines="0 0 1 1;0.2 0.8 0.5 1;0.5 0 0.9 0.4;0 0 1 1" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.25;0.27;0.75;0.85;1" dur="${loop}s" repeatCount="indefinite"/></rect>`
      )
    })
    .join('')

  return (
    shadow(12, 5.5, `<animate attributeName="rx" values="${px(5.5)};${px(5.5)};${px(3.5)};${px(5.5)};${px(5.5)}" keyTimes="${keyTimes}" dur="${loop}s" repeatCount="indefinite"/>`) +
    stage(
      `<g>${jump}` +
        clip([
          { grid: CROUCH, ms: 120 },
          { grid: STRETCH, ms: 600 },
          { grid: CROUCH, ms: 100 },
          { grid: STAND, ms: 580 },
        ]) +
        `</g>${confetti}`,
    )
  )
}

// The turn was cut short: a shake of the head.
function dizzy(): string {
  return (
    shadow(12, 5.5) +
    stage(
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;-2 0;2 0;-2 0;2 0;0 0;0 0" keyTimes="0;0.1;0.2;0.3;0.4;0.5;1" dur="1.2s" repeatCount="indefinite"/>` +
        clip([
          { grid: front('closed'), ms: 600 },
          { grid: STAND, ms: 600 },
        ]) +
        `</g>`,
    )
  )
}

function sleeping(view: View): string {
  const pose = front('sleepy', 'sit')
  const snore = [0, 1]
    .map(
      i =>
        `<text x="${px(18 + i * 2)}" y="${px(8)}" font-size="${10 + i * 3}" font-weight="bold" fill="${BODY}" opacity="0">z` +
        `<animate attributeName="y" values="${px(8)};${px(1)}" dur="3.2s" begin="${i * 1.6}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0.9;0" dur="3.2s" begin="${i * 1.6}s" repeatCount="indefinite"/></text>`,
    )
    .join('')

  return shadow(12, 5.5) + stage(`<g>${breathing(3.6)}${rects(view.isNight ? capped(pose) : pose)}</g>${snore}`)
}

// Compacting: the pet walks over to the in-tray, hops on and stomps the
// pile down, dust flying, until the compaction is through.
function compacting(view: View): string {
  const sheets = view.hasPile ? sheetsOf(view.context) : 0
  const h = sheets * SCALE
  const hk = h * collapseOf(sheets)
  const dx = view.hasPile ? PILE_X + SHEET_W / 2 - (px(12) + STAGE_X) : 0
  const walk: Step[] = Array.from({ length: 7 }, (_, i) => ({ grid: front(IS_LEFT ? 1 : -1, i % 2 ? 'stepB' : 'stepA'), ms: 100 }))
  const intro = clip([...walk, { grid: STRETCH, ms: 300 }, { grid: [], ms: 10 }], { repeat: 1 })
  // Each cycle: the impact, up again, a crouch, and the leap.
  const stomp = clip(
    [
      { grid: CROUCH, ms: 150 },
      { grid: STAND, ms: 100 },
      { grid: CROUCH, ms: 100 },
      { grid: STRETCH, ms: 250 },
    ],
    { begin: STOMP_BEGIN_S + 0.01 },
  )
  const go = `<animateTransform attributeName="transform" type="translate" values="0 0;${fmt(dx)} 0;${fmt(dx)} ${fmt(-h)};${fmt(dx)} ${fmt(-hk)}" keyTimes="0;0.7;0.97;1" dur="${STOMP_BEGIN_S}s" calcMode="spline" keySplines="0 0 1 1;0.2 0.8 0.4 1;0 0 1 1" fill="freeze" additive="sum"/>`
  const bounce = `<animateTransform attributeName="transform" type="translate" values="0 ${fmt(0.18 * hk)};0 0;0 0;0 0;0 -10;0 0" keyTimes="0;0.25;0.42;0.58;0.78;1" dur="${STOMP_S}s" begin="${STOMP_BEGIN_S}s" calcMode="spline" keySplines="0 0 1 1;0 0 1 1;0 0 1 1;0.2 0.8 0.4 1;0.6 0 0.8 0.2" repeatCount="indefinite" additive="sum"/>`
  const cx = view.hasPile ? PILE_X + SHEET_W / 2 : px(12) + STAGE_X
  const dust = [-1, 1]
    .map(
      dir =>
        `<g transform="translate(${cx + dir * 14} ${FLOOR_Y - 3})" opacity="0">` +
        `<rect x="-1" y="-1" width="3" height="3" fill="${GREY}"/><rect x="${dir * 4}" y="-4" width="2" height="2" fill="${GREY}"/>` +
        `<animate attributeName="opacity" values="1;0;0" keyTimes="0;0.4;1" dur="${STOMP_S}s" begin="${STOMP_BEGIN_S}s" repeatCount="indefinite"/>` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${dir * 8} -3;${dir * 8} -3" keyTimes="0;0.4;1" dur="${STOMP_S}s" begin="${STOMP_BEGIN_S}s" repeatCount="indefinite" additive="sum"/></g>`,
    )
    .join('')

  return `<g transform="translate(${STAGE_X} ${TOP})">${go}${bounce}${intro}${stomp}</g>${dust}`
}

const SCENES: Record<Mood, (view: View) => string> = {
  idle,
  working: view => working(false, view),
  intense: view => working(true, view),
  attention,
  puzzled,
  nod,
  happy: () => happy(false),
  elated: () => happy(true),
  dizzy,
  sleeping,
  compacting,
}


// The strip as two drawings, so a change in one leaves the other's
// animation running: the stage (pet, pile, minis) and the meter.
const METER_W = 220

export function stageWidth(view: View): number {
  const s = view.scale
  const minis = view.agents > 0 ? Math.min(3, view.agents) * 34 + (view.agents > 3 ? 24 : 0) + 14 : 0

  return 6 + COLUMNS * s + (view.hasPile ? 4 * s + 9 * s + 40 : 8) + minis + 8
}

export function stageSvg(mood: Mood, view: View): string {
  const width = stageWidth(view)
  layout(view, width)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STRIP_H}" viewBox="0 0 ${width} ${STRIP_H}" shape-rendering="crispEdges" style="display:block">` +
    `<g font-family="ui-monospace, Menlo, Consolas, monospace">` +
    floor() +
    (view.hasPile ? pile(view.context, mood === 'compacting') : '') +
    minis(view.agents, view.hasPile) +
    clickable(SCENES[mood](view)) +
    (view.isNight ? night() : '') +
    `</g></svg>`
  )
}

export function meterSvg(view: View): string {
  layout(view, METER_W)
  const dim = view.isNight ? `<rect x="0" y="0" width="${METER_W}" height="${STRIP_H}" fill="#0B0B1A" opacity="0.22"/>` : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${METER_W}" height="${STRIP_H}" viewBox="0 0 ${METER_W} ${STRIP_H}" shape-rendering="crispEdges" style="display:block">` +
    `<g font-family="ui-monospace, Menlo, Consolas, monospace">${meter(view.context)}${dim}</g></svg>`
  )
}

// Everything in one drawing, for a preview page.
export function svg(mood: Mood, width: number, view: View = DEFAULT_VIEW): string {
  layout(view, width)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STRIP_H}" viewBox="0 0 ${width} ${STRIP_H}" shape-rendering="crispEdges" style="display:block">` +
    `<g font-family="ui-monospace, Menlo, Consolas, monospace">` +
    floor() +
    (view.hasPile ? pile(view.context, mood === 'compacting') : '') +
    (view.hasMeter ? meter(view.context) : '') +
    minis(view.agents, view.hasPile) +
    clickable(SCENES[mood](view)) +
    (view.isNight ? night() : '') +
    `</g></svg>`
  )
}
