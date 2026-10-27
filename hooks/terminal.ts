// The terminal pet: a Raster of half-block cells (two art pixels per cell,
// one above the other), repainted on a timer with $.ui.blit.

import type { ContextUsage, Mood } from '../types'
import { COLUMNS, CROUCH, PULL, ROWS as ART_ROWS, SCRATCH_A, SCRATCH_B, SET, STRETCH, TYPE_A, TYPE_B, colorOf, front } from './frames'
import type { Grid } from './frames'

// The canvas's top row is headroom; the terminal shows the rest.
const SKIP = 2
export const ROWS = (ART_ROWS - SKIP) / 2

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const FULL = 0x2588 // █
const SPACE = 0x20
const ACCENT = 0xd06a4b
const DIM = 0x4e4e4b
const TEXT = 0x9a9a96
const METER_CELLS = 20

const SNORE = ['z', 'z', 'Z', 'Z', ' ', ' ']

export type Walker = {
  tick: number
  // The tick the current mood began at, for the routines that run a sequence.
  since: number
  mood: Mood
}

export function newWalker(): Walker {
  return { tick: 0, since: 0, mood: 'idle' }
}

type Frame = { grid: Grid; glyph: string | null; dx: number }

const STAND = front(0)
// Ticks are 150ms: each entry a frame and how many ticks it holds.
const RESTING: [Grid, number][] = [
  [STAND, 20],
  [front('closed'), 1],
  [STAND, 15],
  [front('closed'), 1],
  [STAND, 6],
  [front(1), 9],
  [STAND, 17],
  [front('closed'), 1],
  [STAND, 4],
  [front(-1), 6],
  [STAND, 9],
]
const INTRO: [Grid, number][] = [
  [STAND, 2],
  [front('closed'), 1],
  [STAND, 2],
  [PULL, 3],
  [SET, 3],
  [STRETCH, 2],
  [CROUCH, 1],
]
const JUMP: [Grid, number][] = [
  [CROUCH, 1],
  [STRETCH, 4],
  [CROUCH, 1],
  [STAND, 4],
]

const STOMP: [Grid, number][] = [
  [CROUCH, 1],
  [STRETCH, 2],
  [CROUCH, 1],
]

function sequence(steps: [Grid, number][], at: number): Grid | undefined {
  let seen = 0
  for (const [grid, n] of steps) {
    if (at < seen + n) return grid
    seen += n
  }

  return undefined
}

function loop(steps: [Grid, number][], at: number): Grid {
  const total = steps.reduce((sum, [, n]) => sum + n, 0)

  return sequence(steps, at % total) ?? STAND
}

// Moves the pet one tick on and answers what to draw.
export function step(walker: Walker, mood: Mood): Frame {
  walker.tick += 1
  if (walker.mood !== mood) {
    walker.mood = mood
    walker.since = walker.tick
  }
  const elapsed = walker.tick - walker.since

  switch (mood) {
    case 'sleeping':
      return { grid: front('sleepy', 'sit'), glyph: SNORE[Math.floor(walker.tick / 4) % SNORE.length] ?? ' ', dx: 0 }
    case 'happy':
      return { grid: loop(JUMP, elapsed), glyph: elapsed % 10 < 5 ? '*' : null, dx: 0 }
    case 'dizzy':
      return { grid: elapsed % 8 < 4 ? front('closed') : STAND, glyph: null, dx: elapsed % 8 < 4 ? (elapsed % 2 ? -1 : 1) : 0 }
    case 'compacting':
      return { grid: loop(STOMP, elapsed), glyph: elapsed % 4 === 3 ? '*' : null, dx: 0 }
    case 'attention':
      return { grid: elapsed % 5 < 2 ? STRETCH : front(1), glyph: '?', dx: 0 }
    case 'puzzled':
      return { grid: elapsed % 2 ? SCRATCH_A : SCRATCH_B, glyph: '?', dx: 0 }
    case 'nod':
      return { grid: elapsed % 6 === 2 ? front('closed') : STAND, glyph: null, dx: 0 }
    case 'elated':
      return { grid: loop(JUMP, elapsed), glyph: '*', dx: 0 }
    case 'working':
    case 'intense': {
      const intro = sequence(INTRO, elapsed)
      if (intro !== undefined) return { grid: intro, glyph: null, dx: 0 }
      const beat = mood === 'intense' ? 1 : 2

      return { grid: Math.floor(elapsed / beat) % 2 === 0 ? TYPE_A : TYPE_B, glyph: null, dx: 0 }
    }
    case 'idle':
      return { grid: loop(RESTING, elapsed), glyph: null, dx: 0 }
  }
}

function rgb(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

function meterColor(percent: number): number {
  return percent >= 90 ? 0xe06c75 : percent >= 70 ? 0xe8c547 : ACCENT
}

// Writes `text` into row `row` from column `col`, in `color`.
function write(words: Uint32Array, columns: number, row: number, col: number, text: string, color: number) {
  for (let i = 0; i < text.length; i++) {
    const at = (row * columns + col + i) * 3
    if (col + i >= columns) return
    words[at] = text.charCodeAt(i)
    words[at + 1] = color
  }
}

// Packs the frame as RasterProps.cells: `columns * ROWS` little-endian u32
// triplets [codePoint, foreground, background], base64. The pet stands at
// the left end of the band, the context meter at the right.
export function cells(frame: Frame, columns: number, context: ContextUsage | null = null, side: 'left' | 'right' = 'left'): string {
  const words = new Uint32Array(columns * ROWS * 3)
  const isLeft = side === 'left'
  const petAt = isLeft ? 1 : Math.max(1, columns - COLUMNS - 1)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < columns; col++) {
      const at = (row * columns + col) * 3
      const local = col - petAt - frame.dx
      const top = colorOf(frame.grid[SKIP + row * 2]?.[local])
      const bottom = colorOf(frame.grid[SKIP + row * 2 + 1]?.[local])
      words[at + 1] = DEFAULT
      words[at + 2] = DEFAULT

      if (top !== null && bottom !== null) {
        words[at] = top === bottom ? FULL : UPPER
        words[at + 1] = rgb(top)
        if (top !== bottom) words[at + 2] = rgb(bottom)
      } else if (top !== null) {
        words[at] = UPPER
        words[at + 1] = rgb(top)
      } else if (bottom !== null) {
        words[at] = LOWER
        words[at + 1] = rgb(bottom)
      } else {
        words[at] = SPACE
      }
    }
  }

  if (frame.glyph !== null && columns > COLUMNS) {
    const at = (2 * columns + petAt + 19) * 3
    words[at] = frame.glyph.charCodeAt(0)
    words[at + 1] = ACCENT
  }

  // "ctx ████████░░░░ 37%" at the far end, when the band has room for it.
  const meterWidth = 4 + METER_CELLS + 5
  if (context !== null && columns >= COLUMNS + meterWidth + 4) {
    const percent = Math.max(0, Math.min(100, context.percent))
    const filled = Math.round((percent / 100) * METER_CELLS)
    const col = isLeft ? columns - meterWidth - 1 : 1
    write(words, columns, 2, col, 'ctx ', TEXT)
    write(words, columns, 2, col + 4, '\u2588'.repeat(filled), meterColor(percent))
    write(words, columns, 2, col + 4 + filled, '\u2591'.repeat(METER_CELLS - filled), DIM)
    write(words, columns, 2, col + 4 + METER_CELLS, ` ${String(percent).padStart(3)}%`, percent >= 70 ? meterColor(percent) : TEXT)
    // The rate-limit windows on the row beneath: "5h 41%  7d 43%".
    const windows = [
      ...(context.limitPercent === undefined ? [] : [`5h ${Math.round(context.limitPercent)}%`]),
      ...(context.weekPercent === undefined ? [] : [`7d ${Math.round(context.weekPercent)}%`]),
    ]
    if (windows.length > 0) write(words, columns, 3, col + 4, windows.join('  '), TEXT)
  }

  return base64(words)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(words: Uint32Array): string {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, true))

  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]
    out += ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }

  return out
}
