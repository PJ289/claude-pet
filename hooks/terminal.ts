// The terminal pet: a Raster of half-block cells (two art pixels per cell,
// one above the other), repainted on a timer with $.ui.blit.

import type { Mood } from '../types'
import {
  COLUMNS,
  ENGINEER_DOWN,
  ENGINEER_UP,
  HOP,
  PULL,
  ROCKET_A,
  ROCKET_B,
  ROWS as ART_ROWS,
  SET,
  TYPE_A,
  TYPE_B,
  colorOf,
  front,
} from './frames'
import type { Grid } from './frames'

export const ROWS = ART_ROWS / 2

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const FULL = 0x2588 // █
const SPACE = 0x20
const ACCENT = 0xd06a4b

const SNORE = ['z', 'z', 'Z', 'Z', ' ', ' ']

export type Walker = {
  x: number
  dir: 1 | -1
  tick: number
  pause: number
  // The tick the current mood began at, for the routines that run a sequence.
  since: number
  mood: Mood
}

export function newWalker(columns: number): Walker {
  return {
    x: Math.floor(Math.random() * Math.max(1, columns - COLUMNS)),
    dir: Math.random() < 0.5 ? 1 : -1,
    tick: 0,
    pause: 0,
    since: 0,
    mood: 'idle',
  }
}

type Frame = { grid: Grid; glyph: string | null }

const STAND = front(0)
// Ticks are 150ms: the mascot's routine, each entry a frame and how many
// ticks it holds.
const ROUTINE: [Grid, number][] = [
  [STAND, 3],
  [front('closed'), 1],
  [STAND, 2],
  [PULL, 3],
  [SET, 3],
  [HOP, 2],
]
const ROUTINE_TICKS = ROUTINE.reduce((sum, [, n]) => sum + n, 0)
const TYPING_TICKS = 40

function routineFrame(elapsed: number): Grid {
  const at = elapsed % (ROUTINE_TICKS + TYPING_TICKS + 5) // then put away
  let seen = 0
  for (const [grid, n] of ROUTINE) {
    if (at < seen + n) return grid
    seen += n
  }
  if (at < seen + TYPING_TICKS) return at % 2 === 0 ? TYPE_A : TYPE_B

  return at - seen - TYPING_TICKS < 3 ? SET : PULL
}

// Moves the walker one tick on and answers what to draw.
export function step(walker: Walker, mood: Mood, columns: number): Frame {
  walker.tick += 1
  if (walker.mood !== mood) {
    walker.mood = mood
    walker.since = walker.tick
  }
  const elapsed = walker.tick - walker.since
  const room = Math.max(0, columns - COLUMNS)
  walker.x = Math.min(walker.x, room)

  switch (mood) {
    case 'sleeping':
      return { grid: front('sleepy', 'sit'), glyph: SNORE[Math.floor(walker.tick / 4) % SNORE.length] ?? ' ' }
    case 'happy':
      return { grid: elapsed % 2 === 0 ? HOP : STAND, glyph: '*' }
    case 'working':
      return { grid: routineFrame(elapsed), glyph: null }
    case 'engineer':
      return { grid: elapsed % 3 === 2 ? ENGINEER_DOWN : ENGINEER_UP, glyph: null }
    case 'rocket':
      walker.x = (walker.x + 2) % (room + 1)

      return { grid: walker.tick % 2 === 0 ? ROCKET_A : ROCKET_B, glyph: null }
    case 'idle':
      break
  }

  if (walker.pause > 0) {
    walker.pause -= 1
    const glance = Math.floor(walker.pause / 8) % 3

    return {
      grid: walker.pause % 23 === 0 ? front('closed') : front(glance === 1 ? -1 : glance === 2 ? 1 : 0),
      glyph: null,
    }
  }

  if (walker.tick % 2 === 0) {
    if (walker.x + walker.dir < 0 || walker.x + walker.dir > room) {
      walker.dir = walker.dir === 1 ? -1 : 1
    }
    walker.x += walker.dir
    if (Math.random() < 0.04) walker.pause = 16 + Math.floor(Math.random() * 30)
  }

  return { grid: front(0, Math.floor(walker.tick / 2) % 2 === 0 ? 'stepA' : 'stepB'), glyph: null }
}

function rgb(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

// Packs the frame as RasterProps.cells: `columns * ROWS` little-endian u32
// triplets [codePoint, foreground, background], base64.
export function cells(walker: Walker, frame: Frame, columns: number): string {
  const words = new Uint32Array(columns * ROWS * 3)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < columns; col++) {
      const at = (row * columns + col) * 3
      const local = col - walker.x
      const top = colorOf(frame.grid[row * 2]?.[local])
      const bottom = colorOf(frame.grid[row * 2 + 1]?.[local])
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

  if (frame.glyph !== null) {
    const side = walker.x + 19 < columns ? walker.x + 19 : walker.x + 4
    const at = (2 * columns + side) * 3
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
