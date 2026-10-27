// The terminal pet: a Raster of half-block cells (two art pixels per cell,
// one above the other), repainted on a timer with $.ui.blit.

import type { Mood } from '../types'
import { COLUMNS, CROUCH, PULL, ROWS as ART_ROWS, SET, STRETCH, TYPE_A, TYPE_B, colorOf, front } from './frames'
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

// Packs the frame as RasterProps.cells: `columns * ROWS` little-endian u32
// triplets [codePoint, foreground, background], base64. The pet stands at
// the left end of the band.
export function cells(frame: Frame, columns: number): string {
  const words = new Uint32Array(columns * ROWS * 3)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < columns; col++) {
      const at = (row * columns + col) * 3
      const local = col - 1 - frame.dx
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
    const at = (2 * columns + 20) * 3
    words[at] = frame.glyph.charCodeAt(0)
    words[at + 1] = ACCENT
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
