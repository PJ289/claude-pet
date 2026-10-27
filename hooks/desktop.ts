// The desktop pet: one SVG whose SMIL animations breathe, blink, type and
// jump it, so the surface animates it with no redraws. A new mood draws a
// new SVG.
//
// The pet has a place: a stage at the left end of the strip, on a floor
// line, with a shadow under it. Every mood plays on that same stage.

import type { ContextUsage, Mood } from '../types'
import { BACK, COLUMNS, CROUCH, PULL, ROWS, SET, SIDE_L, SIDE_R, STRETCH, TYPE_A, TYPE_B, colorOf, front } from './frames'
import type { Grid } from './frames'

// CSS pixels per art pixel.
export const SCALE = 3
const FRAME_W = COLUMNS * SCALE
const FRAME_H = ROWS * SCALE
export const STRIP_H = FRAME_H + 4
const TOP = STRIP_H - FRAME_H
const STAGE_X = 6
// The strip's width for a band `columns` cells wide: the stage at the left,
// the context meter at the right, never wider than the band is likely to be.
export function widthFor(columns: number): number {
  return Math.max(320, Math.min(520, Math.round(columns * 6.5)))
}
const FLOOR_Y = STRIP_H - 1

const BODY = '#D06A4B'
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

// The floor line, fading out to the right so the stage has an end.
function floor(width: number): string {
  return (
    `<defs><linearGradient id="floor" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#9A9A96" stop-opacity="0.4"/><stop offset="0.55" stop-color="#9A9A96" stop-opacity="0.4"/><stop offset="1" stop-color="#9A9A96" stop-opacity="0"/></linearGradient></defs>` +
    `<rect x="0" y="${FLOOR_Y}" width="${width}" height="1" fill="url(#floor)"/>`
  )
}

// Pixel glyphs that pop up over the pet: a heart, a "!", a note.
const HEART = ['.OO.OO.', 'OOOOOOO', 'OOOOOOO', '.OOOOO.', '..OOO..', '...O...']
const BANG = ['O', 'O', 'O', 'O', '.', 'O']
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
// place for `hideSeconds`, and what pops up.
type Reaction = { id: string; stage: string; frames?: Step[]; hideSeconds?: number; popup?: string }

// A click on the pet, all inside the drawing, where SMIL hears it and
// nothing reaches the hooks. Which reaction plays is luck: the hit areas
// take turns being the visible one, a few times a second.
function clickable(body: string): string {
  const reactions: Reaction[] = [
    {
      id: 'heart',
      stage: HOP('heart.click'),
      popup: popup(glyph(HEART, '#E8566E'), 'heart.click', 1.1, 8.5, 1),
    },
    {
      id: 'spin',
      stage: HOP('spin.click'),
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
      stage: `<animateTransform attributeName="transform" type="translate" values="0 0;4 0;3 0;0 0" keyTimes="0;0.3;0.7;1" dur="0.3s" begin="startle.click" additive="sum"/>`,
      hideSeconds: 0.45,
      frames: [
        { grid: CROUCH, ms: 300 },
        { grid: front('closed'), ms: 150 },
      ],
      popup: popup(glyph(BANG, '#D06A4B'), 'startle.click', 0.8, 15, 0),
    },
    {
      id: 'dance',
      stage: `<animateTransform attributeName="transform" type="translate" values="0 0;-3 0;0 0;3 0;0 0;-3 0;0 0;3 0;0 0" dur="1.2s" begin="dance.click" additive="sum"/>`,
      hideSeconds: 1.2,
      frames: Array.from({ length: 8 }, (_, i) => ({ grid: front(i % 4 < 2 ? -1 : 1, i % 2 ? 'stepB' : 'stepA'), ms: 150 })),
      popup: popup(`<text x="0" y="${px(2)}" font-size="12" font-weight="bold" fill="#D06A4B">♪</text>`, 'dance.click', 1.2, 17, 2),
    },
    {
      id: 'wave',
      stage: '',
      hideSeconds: 0.6,
      frames: [
        { grid: STRETCH, ms: 150 },
        { grid: front(0), ms: 150 },
        { grid: STRETCH, ms: 150 },
        { grid: front(0), ms: 150 },
      ],
    },
  ]
  const hides = reactions
    .filter(r => r.hideSeconds !== undefined)
    .map(r => `<set attributeName="opacity" to="0" begin="${r.id}.click" dur="${fmt(r.hideSeconds ?? 0)}s"/>`)
    .join('')
  const frames = reactions
    .filter(r => r.frames !== undefined)
    .map(r => stage(clip(r.frames ?? [], { begin: `${r.id}.click`, repeat: 1, isHeld: false })))
    .join('')
  const period = 0.1 * reactions.length
  const hits = reactions
    .map((r, i) => {
      const values = reactions.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')
      const keyTimes = reactions.map((_, j) => fmt(j / reactions.length)).join(';')

      return (
        `<rect id="${r.id}" x="0" y="0" width="${FRAME_W + STAGE_X}" height="${STRIP_H}" fill="#fff" fill-opacity="0" style="cursor:pointer">` +
        `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${fmt(period)}s" calcMode="discrete" repeatCount="indefinite"/></rect>`
      )
    })
    .join('')

  return (
    `<g>${reactions.map(r => r.stage).join('')}` +
    `<g>${hides}${body}</g>${frames}</g>` +
    reactions.map(r => r.popup ?? '').join('') +
    hits
  )
}

// The pet's in-tray: a pile of papers beside it that grows with the
// context window, under a dashed line where 100% is. The sheets near the
// top take the meter's amber and red; past 90% the pile sways.
const PILE_X = 104
const PILE_SHEETS = 13
const SHEET_W = 27
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

function pile(context: ContextUsage | null, isSquashed = false): string {
  const percent = context === null ? 0 : Math.max(0, Math.min(100, context.percent))
  const sheets = sheetsOf(context)
  const ceiling = FLOOR_Y - PILE_SHEETS * SCALE - 2
  // A dotted post from the floor to the line, so the room left is legible.
  let out = `<line x1="${PILE_X - 6}" x2="${PILE_X - 6}" y1="${ceiling}" y2="${FLOOR_Y}" stroke="#9A9A96" stroke-opacity="0.35" stroke-dasharray="1 2"/>`
  out += `<line x1="${PILE_X - 6}" x2="${PILE_X + SHEET_W + 6}" y1="${ceiling}" y2="${ceiling}" stroke="#9A9A96" stroke-opacity="0.55" stroke-dasharray="2 2"/>`
  out += `<text x="${PILE_X + SHEET_W + 9}" y="${ceiling + 3}" font-size="8" fill="#9A9A96">100%</text>`
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
  const sway =
    percent >= 90
      ? `<animateTransform attributeName="transform" type="rotate" values="0 ${PILE_X + SHEET_W / 2} ${FLOOR_Y};-2 ${PILE_X + SHEET_W / 2} ${FLOOR_Y};0 ${PILE_X + SHEET_W / 2} ${FLOOR_Y};2 ${PILE_X + SHEET_W / 2} ${FLOOR_Y};0 ${PILE_X + SHEET_W / 2} ${FLOOR_Y}" dur="1.6s" repeatCount="indefinite"/>`
      : ''

  return out + `<g>${sway}${sheetsOut}</g>`
}

// The context window's fill, as a row of cells at the right end of the
// strip: orange, amber past 70%, red past 90%.
const CELLS = 20
const CELL_W = 5
const CELL_GAP = 2
export function meterColor(percent: number): string {
  return percent >= 90 ? '#E06C75' : percent >= 70 ? '#E8C547' : '#D06A4B'
}
function meter(width: number, context: ContextUsage | null): string {
  if (context === null) return ''
  const percent = Math.max(0, Math.min(100, context.percent))
  const filled = Math.round((percent / 100) * CELLS)
  const barW = CELLS * (CELL_W + CELL_GAP) - CELL_GAP
  const right = width - 8
  const y = Math.round(STRIP_H / 2) - 4
  const color = meterColor(percent)
  let cells = ''
  for (let i = 0; i < CELLS; i++) {
    cells += `<rect x="${right - barW - 30 + i * (CELL_W + CELL_GAP)}" y="${y}" width="${CELL_W}" height="8" fill="${i < filled ? color : '#9A9A96'}" opacity="${i < filled ? 1 : 0.22}"/>`
  }

  return (
    `<text x="${right - barW - 36}" y="${y + 8}" font-size="10" fill="#9A9A96" text-anchor="end">ctx</text>` +
    cells +
    `<text x="${right}" y="${y + 8}" font-size="10" font-weight="bold" fill="${percent >= 70 ? color : '#B8B8B4'}" text-anchor="end">${percent}%</text>`
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

// A small terminal window above the laptop, lines of output typed in and
// cleared, over and over. `period` is one fill-and-clear, in seconds.
function terminalBubble(period: number): string {
  const lines: [number, string][][] = [
    [[5, 'c'], [3, 'L'], [6, 'c']],
    [[4, 'c'], [6, 'c'], [2, 'L']],
    [[6, 'L'], [2, 'c'], [5, 'c']],
  ]
  const total = period * lines.length
  let out = `<rect x="0" y="0" width="${px(10)}" height="${px(7)}" rx="3" fill="#161615" opacity="0.9"/>`
  lines.forEach((set, k) => {
    set.forEach(([length, color], i) => {
      const on = (k * period + 0.25 + i * (period * 0.22)) / total
      const off = (k * period + period * 0.9) / total

      return (out +=
        `<rect x="${px(1)}" y="${px(1 + i * 2)}" width="${px(length)}" height="${SCALE}" fill="${colorOf(color)}" opacity="0">` +
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
function working(isIntense: boolean): string {
  const intro: Step[] = [
    { grid: STAND, ms: 350 },
    { grid: front('closed'), ms: 120 },
    { grid: STAND, ms: 250 },
    { grid: PULL, ms: 420 },
    { grid: SET, ms: 420 },
    { grid: STRETCH, ms: 220 },
    { grid: CROUCH, ms: 90 },
  ]
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

  return (
    shadow(
      12,
      5.5,
      `<animate attributeName="cx" values="${px(12) + STAGE_X};${px(8) + STAGE_X}" dur="0.01s" begin="${fmt(introSeconds)}s" fill="freeze"/>` +
        `<animate attributeName="rx" values="${px(5.5)};${px(7.5)}" dur="0.01s" begin="${fmt(introSeconds)}s" fill="freeze"/>`,
    ) +
    stage(
      `<g>${clip(intro, { repeat: 1 })}<set attributeName="opacity" to="0" begin="${fmt(introSeconds)}s"/></g>` +
        `<g opacity="0"><set attributeName="opacity" to="1" begin="${fmt(introSeconds)}s"/>` +
        `<g>${jitter}` +
        clip([
          { grid: TYPE_A, ms: keyMs },
          { grid: TYPE_B, ms: keyMs },
        ]) +
        `</g>${sweat}` +
        `<g opacity="0"><set attributeName="opacity" to="1" begin="${fmt(introSeconds + 0.4)}s"/>${terminalBubble(isIntense ? 1.3 : 2.6)}</g>` +
        `</g>`,
    )
  )
}

// The answer landed: a real jump, crouch, stretch, land, with confetti.
function happy(): string {
  const loop = 1.4
  const keyTimes = '0;0.086;0.33;0.514;1'
  const jump = `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -14;0 0;0 0" keyTimes="${keyTimes}" dur="${loop}s" calcMode="spline" keySplines="0 0 1 1;0.2 0.8 0.4 1;0.6 0 0.8 0.2;0 0 1 1" repeatCount="indefinite"/>`
  const confetti = CONFETTI.map((color, i) => {
    const dx = (i - 3.5) * 9 + (i % 2 ? 3 : -3)
    const peak = -(10 + (i % 3) * 4)
    const fall = 26

    return (
      `<rect x="${px(12) - 2}" y="${px(6)}" width="4" height="4" fill="${color}" opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${fmt(dx * 0.55)} ${peak};${fmt(dx)} ${fall};${fmt(dx)} ${fall}" keyTimes="0;0.25;0.45;0.8;1" dur="${loop}s" calcMode="spline" keySplines="0 0 1 1;0.2 0.8 0.5 1;0.5 0 0.9 0.4;0 0 1 1" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.25;0.27;0.75;0.85;1" dur="${loop}s" repeatCount="indefinite"/></rect>`
    )
  }).join('')

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

function sleeping(): string {
  const snore = [0, 1]
    .map(
      i =>
        `<text x="${px(18 + i * 2)}" y="${px(8)}" font-size="${10 + i * 3}" font-weight="bold" fill="${BODY}" opacity="0">z` +
        `<animate attributeName="y" values="${px(8)};${px(1)}" dur="3.2s" begin="${i * 1.6}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0.9;0" dur="3.2s" begin="${i * 1.6}s" repeatCount="indefinite"/></text>`,
    )
    .join('')

  return shadow(12, 5.5) + stage(`<g>${breathing(3.6)}${rects(front('sleepy', 'sit'))}</g>${snore}`)
}

// Compacting: the pet walks over to the in-tray, hops on and stomps the
// pile down, dust flying, until the compaction is through.
function compacting(context: ContextUsage | null): string {
  const sheets = sheetsOf(context)
  const h = sheets * SCALE
  const hk = h * collapseOf(sheets)
  const dx = PILE_X + SHEET_W / 2 - (px(12) + STAGE_X)
  const walk: Step[] = Array.from({ length: 7 }, (_, i) => ({ grid: front(1, i % 2 ? 'stepB' : 'stepA'), ms: 100 }))
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
  const dust = [-1, 1]
    .map(
      dir =>
        `<g transform="translate(${PILE_X + SHEET_W / 2 + dir * 14} ${FLOOR_Y - 3})" opacity="0">` +
        `<rect x="-1" y="-1" width="3" height="3" fill="#9A9A96"/><rect x="${dir * 4}" y="-4" width="2" height="2" fill="#9A9A96"/>` +
        `<animate attributeName="opacity" values="1;0;0" keyTimes="0;0.4;1" dur="${STOMP_S}s" begin="${STOMP_BEGIN_S}s" repeatCount="indefinite"/>` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${dir * 8} -3;${dir * 8} -3" keyTimes="0;0.4;1" dur="${STOMP_S}s" begin="${STOMP_BEGIN_S}s" repeatCount="indefinite" additive="sum"/></g>`,
    )
    .join('')

  return `<g transform="translate(${STAGE_X} ${TOP})">${go}${bounce}${intro}${stomp}</g>${dust}`
}

const SCENES: Record<Mood, (context: ContextUsage | null) => string> = {
  idle,
  working: () => working(false),
  intense: () => working(true),
  happy,
  dizzy,
  sleeping,
  compacting,
}

export function svg(mood: Mood, width: number, context: ContextUsage | null = null): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STRIP_H}" viewBox="0 0 ${width} ${STRIP_H}" shape-rendering="crispEdges" style="display:block">` +
    `<g font-family="ui-monospace, Menlo, Consolas, monospace">${floor(width)}${pile(context, mood === 'compacting')}${meter(width, context)}${clickable(SCENES[mood](context))}</g></svg>`
  )
}
